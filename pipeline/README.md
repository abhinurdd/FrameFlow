# FrameFlow pipeline (Phase 0)

Harness for the Phase 0 exit criteria in [docs/strategy.md](../docs/strategy.md): the ASR bakeoff, and an end-to-end spike that measures time to first clip and cost per clip. Separate Node package, not part of the Expo app.

```bash
cd pipeline
npm install
cp .env.example .env.local   # add keys for the providers you want to run
npm test
```

Needs `ffmpeg` on the PATH and Node 22+.

| Command | What it does |
| --- | --- |
| `npm run ff -- transcribe <media> --provider elevenlabs` | Normalize audio, transcribe, write `work/<name>/<provider>.json` |
| `npm run ff -- score <transcript.json> --ref <ref.txt>` | WER and CER against a reference |
| `npm run ff -- bench --providers elevenlabs,deepgram,sarvam` | Score every provider on the test set |
| `npm run ff -- spike <media> --provider elevenlabs` | Streaming spike: windowed ASR, then highlight selection; prints time to first clip and cost |

## Providers

| Provider | Model | Word timestamps | Diarization | Notes |
| --- | --- | --- | --- | --- |
| `elevenlabs` | `scribe_v2` | yes | yes | |
| `deepgram` | `nova-3`, `language=multi` | yes | yes | |
| `sarvam` | `saaras:v4` | no (phrase level) | no | REST endpoint takes ~30 s per call, so audio is sent in 25 s chunks. Long-form diarized output needs their Batch API, not wired up yet. |

Not added yet: hosted Whisper large-v3 and Google Chirp. `usdPerHour` on each provider is `null` until it is checked against that provider's pricing page; the cost readout says "unknown" until then.

## Test set

`testset/manifest.jsonl`, one JSON object per line (see `manifest.example.jsonl`). Audio goes in `testset/audio/` (git-ignored). References are plain text, one file per script.

- **Target:** about 50 hours of real Hindi/Hinglish podcast audio, spread across genres, speaker counts and recording quality.
- **Gold subset:** about 5 hours with human-corrected references, in 2–5 minute excerpts. This is what WER and CER are measured on. Each excerpt needs a Devanagari and a Roman reference, because providers disagree on script and a hypothesis is only scored against a reference in its own script.
- **The rest:** used for speed, cost, diarization spot checks and the end-to-end spike, where no reference is needed.
- Record `source` and `license` for every row. Only use audio we have the right to use.

## Media server (`server/`)

Renders an editor `Edit` (see `../src/engine/timeline.ts`) to MP4 and runs the editor's media tools. The app previews on the phone; this does the final export. It imports `src/engine` directly, so every time, animation and colour value in an export comes from the same functions as the preview.

```bash
cd pipeline
npm install
npm run server            # http://localhost:8787, or PORT=9000 npm run server
npm run test:server       # end-to-end tests; sample frames land in work/samples/
```

Needs Node 22+ and `ffmpeg`/`ffprobe` on the PATH (libx264 and AAC; `drawtext` is not used). Fonts are read from the repo root's `node_modules/@expo-google-fonts` (run `npm install` there too), or from `FRAMEFLOW_FONTS`. Files are kept under `pipeline/work/` (`media/` uploads, `out/` renders, `tmp/` scratch), or under `FRAMEFLOW_WORK`. On Linux, install a colour emoji font (`fonts-noto-color-emoji`) for stickers.

How a render works: one ffmpeg process per on-screen source decodes raw RGBA frames at the output frame rate (`frames.ts`); each frame is drawn with Skia via `@napi-rs/canvas` (`draw.ts`); the frames are piped to one libx264 encoder and muxed with the audio, which a single ffmpeg filtergraph mixes first (`audio.ts`). Jobs run one at a time.

### API

JSON in and out, CORS open. Errors are `{ "error": "..." }` with a 4xx or 5xx status.

| Request | Response |
| --- | --- |
| `GET /health` | `{ ok: true, whisper: boolean, translate: boolean, tts: boolean }`: whether transcription, translation and text to speech are set up |
| `POST /media` (raw file body; headers `content-type`, `x-filename`) | `{ id, kind: 'video'\|'image'\|'audio', duration, width, height }`. Width and height have rotation metadata applied. |
| `GET /media/:id` | The file. `Range` is supported. |
| `POST /render` `{ edit, settings: { height, fps: 24\|30\|60, bitrateMbps? } }` | `{ jobId }`. `height` is the output height in pixels; the width follows from the edit's aspect ratio. Every asset the edit uses needs a `remoteId` from `POST /media`. Without `bitrateMbps` the encoder uses CRF 20. |
| `GET /jobs/:id` | `{ status: 'queued'\|'running'\|'done'\|'error', progress: 0..1, error?, result? }`. A render's result is `{ width, height, fps, duration, frames, bytes, renderSeconds }`. |
| `GET /jobs/:id/file` | The job's output file: the MP4, or the media a tool made. `Range` is supported. |

Tools take `{ mediaId, ... }` (`tts` takes text instead) and return `{ jobId }`. New media is registered like an upload and returned in the job result as `{ media: { id, kind, duration, width, height } }`.

| Tool | Result |
| --- | --- |
| `POST /tools/reverse` | `media`: the video and its audio, backwards |
| `POST /tools/frame` `{ time }` | `media`: a PNG still |
| `POST /tools/extract-audio` | `media`: an m4a |
| `POST /tools/denoise` | `media`: a copy with the audio denoised (`afftdn`); the video stream is copied |
| `POST /tools/stabilize` | `media`: the video steadied, same size and length, audio kept. Uses `vidstabdetect`/`vidstabtransform` when the ffmpeg build has them, else `deshake`; the result's `method` says which. |
| `POST /tools/voice` `{ effect: 'deep'\|'chipmunk'\|'robot'\|'echo'\|'telephone' }` | `media`: same length, voice changed. A video keeps its picture (stream copied); audio comes back as m4a. Any other effect is a 400. |
| `POST /tools/tts` `{ text, language?: 'hi'\|'en' }` | `media`: an m4a of the text spoken, plus `voice`. Text over 2,000 characters is a 400. |
| `POST /tools/silence` `{ minSilence?: 0.4, thresholdDb?: -35 }` | `{ ranges: [{ start, end }] }` in source seconds |
| `POST /tools/beats` | `{ beats: number[] }` in seconds |
| `POST /tools/waveform` `{ samples?: 400 }` | `{ peaks: number[] }`, 0..1 |
| `POST /tools/transcribe` `{ language?, translate? }` | `{ words: [{ t0, t1, text }], language }`. With `translate: true` the words are English and `language` is still the spoken one. Every word has `t1 > t0` and words are in order. |

```bash
ID=$(curl -s -X POST -H 'x-filename: clip.mp4' -H 'content-type: video/mp4' --data-binary @clip.mp4 localhost:8787/media | jq -r .id)
JOB=$(curl -s -X POST -H 'content-type: application/json' -d "{\"mediaId\":\"$ID\"}" localhost:8787/tools/waveform | jq -r .jobId)
curl -s localhost:8787/jobs/$JOB
```

### Transcription

`/tools/transcribe` uses whisper.cpp when a `whisper-cli` binary is on the PATH and a model exists at `$WHISPER_MODEL` or `pipeline/work/models/*.bin`. Otherwise the job fails with "transcription is not set up" and `/health` reports `whisper: false`. To set it up on macOS:

```bash
brew install whisper-cpp
mkdir -p pipeline/work/models
curl -L -o pipeline/work/models/ggml-large-v3-turbo.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin
```

Whisper sometimes gives several words in a row the same instant, or ends the last word at 30 s. The server spreads such runs evenly over the gap to the next word (at most 0.6 s a word) and keeps every word inside the audio.

**Translation** (`translate: true`) needs a model that can translate. The `turbo` models cannot: with `--translate` they still write the spoken language. The server uses `$WHISPER_TRANSLATE_MODEL`, else the main model if it is not a turbo one, else the first non-turbo `.bin` in `pipeline/work/models`. With none, the job fails with "translation is not set up" and `/health` reports `translate: false`. For example:

```bash
curl -L -o pipeline/work/models/ggml-medium.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin
```

### Text to speech

On macOS `/tools/tts` uses `say`: the voice Lekha for Hindi (when `language` is `hi` or the text has Devanagari), otherwise an Indian English voice (Rishi, Aman, Tara or Veena, whichever is installed), otherwise the system default. Voices are added in System Settings, Accessibility, Spoken Content. Elsewhere it uses `espeak-ng` when that is on the PATH (`apt install espeak-ng`). With neither, the job fails with "text to speech is not set up" and `/health` reports `tts: false`.

### Known gaps

- HDR sources (iPhone HLG, Dolby Vision) are not tone-mapped and will look washed out.
- Stills are decoded by ffmpeg; EXIF orientation on photos depends on the ffmpeg build.
- An edit that cuts one source into hundreds of segments starts one decoder per segment, which is correct but slow to start.
