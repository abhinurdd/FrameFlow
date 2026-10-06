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
