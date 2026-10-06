# FrameFlow Strategy

**Owner of tech:** Claude (end to end).
**Last updated:** 2026-10-06.
**Evidence base:** [research/competitive-teardown.md](research/competitive-teardown.md), [research/vn-feature-inventory.md](research/vn-feature-inventory.md), [research/ai-editor-benchmark.md](research/ai-editor-benchmark.md).

Living document. Update it when a decision is made or a phase finishes.

## North star

**Turn a Hindi/Hinglish podcast into 20 ready-to-post clips, from a phone, in minutes, for less than a chai a day.**

We are not "OpusClip for India." We win one job better than anyone, then expand to more genres and languages.

## 1. Where we start

**Hinglish podcasts and clippers, Android first, with iOS shipped at the same time.**

- **Clippers** (Whop and similar paid-clipping programs, fan-page operators, agencies) are the volume buyers.
  - They process many hours a week and care about speed and price.
  - They cluster on Discord, WhatsApp and Whop, so word of mouth spreads.
  - They generate the most keep/discard data.
- **Podcasters** (the Raj Shamani model: 30–50 clips a week) are the most visible use case and bring brand credibility.
- **Later**, on the same engine with different genre presets: motivational, spiritual/devotional, educators and exam coaching, finance, news, comedy, then regional languages.

## 2. How we beat each competitor

| Competitor | Their weakness | Our advantage |
|---|---|---|
| OpusClip | No Hindi/Indic (their help center says so); 20–40 min processing; iOS editor is captions-only; Android has no editor (2.8★) | Hinglish-native, first clip in under 5 min, a full editor on Android |
| Captions (Mirage) | Expensive in India (₹969–2,999/mo), AI Shorts can take up to an hour, opaque credits, Android Lite is 3.5★ with a 5-min cap | About 3x cheaper, cost shown up front, quality on Android |
| Kalakar | Captions only, 2–5 min videos, the mobile app is a web wrapper, timing drift, the Hinglish setting is confusing | Clipping, plus a caption editor as good as theirs that is built for phones |
| VN / Edits / YouTube Create | Manual editing, or no clipping of long videos | Fully automatic clipping and captions |

**Biggest long-term threat:** YouTube and Meta building clipping in for free (YouTube's Gemini Shorts editor is due in 2027).

**Defense:** be the cross-platform workflow tool. Post to every platform, and add agency and multi-account features that first-party tools won't build.

## 3. What makes us hard to copy

Features get copied in a quarter, so the edge has to come from these:

1. **An India-tuned virality model trained on our own data.** Inputs are every keep/discard swipe and the performance of posted clips. OpusClip's score is built on Western content and only weakly predicts real views. Ours should improve with usage.
2. **Indic caption craft.**
   - Accurate Hinglish code-mixed ASR.
   - Instant Devanagari / Roman / English toggle without regenerating.
   - Correct text shaping for Indic scripts (conjuncts, matras).
   - Fonts designed for each script.
   - Hindi filler-word lists ("matlab", "toh", "na", "basically", "yaar").
3. **A structural cost advantage.** Render only on export, and preview on the device. That lets us charge ₹2–5 per clip while others charge per source minute.
4. **Shipping speed.** Match or beat VN's pace (6 releases in 3 months).

## 4. Architecture

### Principles
- **Preview never waits for a render.** Cuts, captions, layout and reframe are drawn live on the device over the source video. A server render happens only on export.
- **Clip Spec is the single source of truth.** Each clip is one JSON document (an edit decision list) holding cuts, a word-level caption track, styles, layout/reframe keyframes and overlays.
  - The same spec drives the on-device preview and the server render.
  - Undo/redo, reprompting, templates and brand presets are all just operations on the spec.
- **Stream everything.** Transcribe chunks as they arrive. Push clips to the app as they are found. The target is a first clip in under 5 minutes.
- **Cheap by design.** No GPU work unless it is needed. Cache transcripts. Re-prompting reuses the transcript and never re-runs ASR.

### Client (Expo / React Native, `src/`)
- Ingest:
  - Paste a link, or "Share → FrameFlow" from the YouTube app.
  - Chunked, resumable uploads (tus or similar) that run in the background.
  - Optional compression on the device before upload.
- Background progress: a Live Activity on iOS and an ongoing notification on Android. A push notification when clips are ready.
- Results feed: a ranked grid plus a full-screen vertical **swipe review** (keep/discard).
- Clip editor:
  - The transcript is the timeline: delete words to cut, "Add a section" to pull in more of the source.
  - Word tap menu: Emphasize, Spotlight, Edit, Search & Replace (with "remember spelling"), Split, move to previous/next line.
  - Gesture styling on the canvas, with a split preview so sheets never hide the video.
  - Layouts: Fill, Fit, Split, Screenshare.
  - A hook headline.
- Caption preview rendering: Skia (react-native-skia) or a similar engine, matching the server renderer.
- Export: Auto/Manual with a file-size estimate. Share to Reels, Shorts and WhatsApp Status, or save to the gallery.
- Needs a development build. Native modules mean Expo Go is not enough.

### Backend (streaming pipeline)
1. **Ingest:** a link fetch or chunked upload, then extract and normalize the audio.
2. **ASR:** word-level timestamps plus speaker detection, run per chunk. Store a canonical transcript plus transliterations (Devanagari ↔ Roman, and an English translation).
3. **Highlight selection:** an LLM reads the diarized transcript with genre-specific prompts and outputs segments, a reason, a hook title and a score (Hook/Flow/Value). Cheap visual signals (faces, scene changes) feed in. Later, a learned ranker trained on swipe and performance data.
4. **Reframe:** face and active-speaker detection, producing 9:16 crop keyframes or split layouts.
5. **Progressive delivery:** clips are pushed to the client as they are found.
6. **Render on export:** FFmpeg workers with an Indic-aware text renderer (libass + HarfBuzz, or a renderer that shares code with the client), then storage and a CDN.

### Decisions to make with data, not guesses
- **ASR provider.** First build a **Hinglish/Hindi/regional test set of about 50 hours** from real podcasts. Then benchmark Sarvam, ElevenLabs Scribe, Whisper large-v3 variants, Deepgram and Google Chirp on WER and CER, code-mix handling, timestamp accuracy, diarization, cost per hour and latency.
- **Highlight selection.** An LLM is enough for launch. Measure it against human-picked clips on the test set.
- **Cloud and infrastructure.** Pending: the user's budget and provider preference.
- **Caption renderer parity** between client and server. Prototype in Phase 0.

## 5. Pricing and go-to-market

- **Pricing:**
  - A free tier with real value: a few clips a month, watermarked.
  - A **₹99 week pass**, then ₹299 and ₹699 per month.
  - **UPI AutoPay.**
  - Charge per **exported** clip, not per source minute.
  - Show the cost **before** processing.
  - Clear reminders before a trial ends, one-tap cancel, a refund window.
  - Human support on WhatsApp in Hindi and English.
- **Distribution:**
  - Hindi YouTube tutorials (this market learns from 4–5M-view tutorials).
  - A clipper community on WhatsApp and Discord.
  - An affiliate program with editing-education channels.
  - Seeding with 3–5 Indian podcast networks.
- **Trust is the pitch.** Opaque credits and billing traps are the top complaint across the category.

## 6. Roadmap

| Phase | Time | Exit criteria |
|---|---|---|
| **0. Prove it** (in progress) | ~2 weeks | Hinglish test set built. ASR bakeoff done and a provider chosen. End-to-end pipeline spike with the first clip in under 5 min on a 60-min podcast. Unit cost per clip measured and compatible with ₹2–5 pricing. Caption render parity prototype. |
| **1. Core loop (MVP)** | ~6–8 weeks | Link/upload → clips → swipe review → light edit → export/share on Android and iOS. INR pricing with UPI. Closed beta with 30–50 clippers and podcasters. |
| **2. Retention** | After the MVP | Reprompt/chat ("3 more about money"), Hindi filler removal, brand presets, multi-account posting and scheduling, agency mode (batch links, many brands). |
| **3. Expand** | Later | Regional languages, an insights loop (what performed, what to clip next), a learned ranker trained on our own data. |

### Editor track (runs alongside the phases above)

The user decided on 2026-10-06 that FrameFlow is a full AI video editor with VN's feature set, not only a clipper. Parity is tracked feature by feature in [research/vn-feature-inventory.md](research/vn-feature-inventory.md).

| Step | Scope | Status |
|---|---|---|
| **E1. Cut editor** | Import, magnetic main track, split, trim, delete, duplicate, reorder, speed, volume, rotate/flip, aspect ratio, text, undo/redo, drafts, live preview | Done |
| **E2. Multi-track editor and export** | Overlays, stickers, styled text, captions, audio tracks, effects, transitions, keyframes, animations, filters and adjust. Export through the media server | Built; runs in Expo Go with the server on the development Mac |
| **E3. AI in the editor** | Auto captions, silence and filler removal, denoise, voice effects, text to speech, beat detection, stabilise, reverse, freeze | Built on the media server; captions and silence removal verified end to end |
| **E4. Production readiness** | Deploy the media server, on-device or queued background export, real AI clipping into the editor, Hinglish ASR choice | Not started |
| **E5. Shader compositor** | Chroma key, custom speed curves, more masks, blur backgrounds in preview, smoother playback. Needs a development build | Not started |

**Explicitly not doing:** generative video, AI avatars, dubbing (Meta and YouTube give it away).

## 7. Open risks and decisions (need the user)

1. **YouTube link ingest.** It is against YouTube's terms, downloads are often blocked from cloud servers, and clippers frequently clip other people's content.
   - Planned mitigation: rights confirmation at submit, an upload fallback.
   - **Needs the user's stance on how far we go to serve clippers.**
2. **Unit economics.** ASR, LLM and reframe cost per hour of source. Phase 0 must prove the margin before pricing is locked.
3. **Platform risk.** YouTube or Meta shipping free clipping. Defense: cross-platform posting plus agency workflows.
4. **Pending from the user:** cloud provider and budget (now also needed to host the media server), confirmation of the bundle ID `club.nurdd.frameflow`, and the Supabase anon key for project `mxckperbdkugmviqfnzl` (it is empty in `.env.local`, so the app runs in demo mode).

## Decision log

- 2026-10-05: Stack is Expo SDK 57 + React Native 0.86 + TypeScript + Expo Router (repo initialized, not yet committed).
- 2026-10-05: Strategy above adopted as the working plan.
- 2026-10-06: Phase 0 started. The harness lives in `pipeline/` (a separate Node/TypeScript package, so Clip Spec types can later be shared with the app). It has ASR adapters for ElevenLabs Scribe, Deepgram Nova-3 and Sarvam Saaras, WER/CER scoring that normalizes Hindi and Roman text, Claude highlight selection, and a streaming spike that reports time to first clip and cost. Nothing has been run against a real provider yet: no API keys or test audio.
- 2026-10-06: Test set shape: about 50 hours of audio, with a human-corrected gold subset of about 5 hours (both scripts) for WER/CER. The rest is for speed, cost and the end-to-end spike.
- 2026-10-06: Sarvam's REST endpoint has no word-level timestamps or diarization and takes about 30 s of audio per call. Long-form use needs their Batch API. Word timing is required for the caption track, so Sarvam would need forced alignment on top unless the Batch API returns it.
- 2026-10-06: Highlight selection uses `claude-opus-5-5` with structured output. Model choice gets revisited once unit cost is measured.
- 2026-10-06: **Direction change from the user:** FrameFlow is an advanced AI video editor with VN's full feature set. This reverses the earlier "match VN's gestures, not its depth" call. AI clipping stays as the differentiator VN lacks.
- 2026-10-06: The manual editor's document is an `Edit` (`src/engine/timeline.ts`): one JSON per project, and every tool is a pure function on it, the same principle as Clip Spec. Step E1 is built on it.
- 2026-10-06: E1 previews by hopping one `expo-video` player between segments. That cannot do overlays, transitions, filters or export, so E2 needs a real compositor and a development build. The choice of compositor (Skia on device plus native AVFoundation/Media3 export, versus server render) is still open and should be prototyped before E2 starts.
- 2026-10-06: Benchmark changed from VN to CapCut after the user asked for the best AI editor's feature set. Parity is tracked in `docs/research/ai-editor-benchmark.md`.
- 2026-10-06: **Preview architecture.** A JavaScript clock drives two `expo-video` players (current and next clip) for gapless cuts and transitions. Everything else is React Native layers over the video: overlays, text, captions, effects. Filters and adjust are flat colour layers with `mixBlendMode`, which blends correctly over video on iOS (Android not yet checked). This runs in Expo Go.
- 2026-10-06: **Export architecture.** `pipeline/server` renders an Edit frame by frame in Node (ffmpeg decode, Skia canvas via `@napi-rs/canvas`, libx264 encode) and imports `src/engine` directly, so timing, animation and colour maths are shared with the preview. Measured on the development Mac: 0.35 s of work per second of 1080×1920 output for video with captions, up to 1.3 s with a look, overlay and effect.
- 2026-10-06: **Auto captions** use whisper.cpp (`large-v3-turbo`, quantised) on the media server. It works for Hindi with word timings but writes English loan words in Devanagari, so it is a stopgap until the ASR bakeoff picks a provider.
- 2026-10-06: Speed ramps are stepped (a clip is cut into parts at different speeds) so preview and export stay identical. Smooth custom curves wait for E5.
- 2026-10-06: Sign in with Apple added in code (native, iOS only). It needs the bundle ID registered with Apple and enabled in Supabase before it works outside demo mode.
