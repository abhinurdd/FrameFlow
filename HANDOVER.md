# FrameFlow handover

**Last updated:** 2026-10-08 (start of day; nothing built yet today).
**Updated by:** Claude, at the end of every working day. See the rule in [CLAUDE.md](CLAUDE.md).

This file is for whoever picks the work up next, human or a Claude session on another account. It says where things stand and how to carry on. Strategy, decisions and their reasons live in [docs/strategy.md](docs/strategy.md); this file does not repeat them.

## Read first

1. [CLAUDE.md](CLAUDE.md) and [AGENTS.md](AGENTS.md): project rules. Expo APIs change every release, so fetch the versioned docs before using one.
2. [docs/strategy.md](docs/strategy.md): the plan, the editor track (E1–E5) and the decision log.
3. [docs/research/ai-editor-benchmark.md](docs/research/ai-editor-benchmark.md): feature-by-feature status against CapCut. This is the list of what is left in the editor.

## Where things stand

- **Branch:** `app-shell`, last commit `da35995`. **It has never been pushed.** The code exists only on Mohit's Mac until it is. `main` on GitHub is far behind.
- **The editor** is feature-rich and runs in Expo Go on the iOS simulator: multi-track timeline, captions, filters, keyframes, speed curves, chroma key, seven mask shapes, blend modes, export.
- **Export and every AI tool** run on a local media server (`pipeline/server`, port 8787). Nothing is deployed.
- **AI clipping** (long video → ranked clips) is still sample data. The pipeline in `pipeline/src` has never run against a real provider.
- **Sign-in** runs in demo mode: the Supabase anon key is empty in `.env.local`.
- **Checks at last commit:** typecheck and lint clean, 23 engine tests, 26 export tests, all passing.

## Last session (2026-10-07)

- First Android pass on an emulator. Three Android-only preview bugs fixed (black clip at cuts, black first frame, empty thumbnails).
- Built the stage (`src/editor/stage.tsx`): one Skia canvas that draws the clip and overlays together, for true blend modes on video overlays and a blurred background in preview. iOS only.
- Found that Skia shows no video on Android, in Expo Go or in a development build. Android falls back to the plain clip with a "Shown in export" tag.

## Next up

1. **Android route for the stage.** Waiting on Mohit: test on a physical Android phone (cheap, do first), or commit to a native module on Media3 video effects.
2. Mask feather, invert and position on the iOS stage.
3. Hand-test the features marked 🟡 in the benchmark table.
4. The rest of the editor gaps in the benchmark table (colour tools, crop, drag-to-reorder).

## Waiting on Mohit

- Confirm the bundle ID `club.nurdd.frameflow`.
- Supabase anon key for project `mxckperbdkugmviqfnzl`, and Apple/Google sign-in provider setup.
- Cloud provider and budget (hosting the media server). Deferred by Mohit until the UI/UX is settled.
- API keys and test audio for the ASR bakeoff (Phase 0).
- A stance on YouTube link ingest (strategy §7).
- Whether to push `app-shell`.

## How to run it

```bash
npx expo start --port 8082
```

```bash
npm --prefix pipeline run server
```

Both are defined in `.claude/launch.json` as `metro` and `media-server`.

- **iOS:** simulator "FrameFlow iPhone 17 Pro", then open `exp://127.0.0.1:8082` in Expo Go.
- **Android:** virtual device `FrameFlow_Pixel_8`. Forward ports 8082 and 8787 with `adb reverse`, then open the same URL in Expo Go.
- **Checks before calling anything done:** `npx tsc --noEmit`, `npx expo lint`, `npx jest`, and `npm run test:server` inside `pipeline/`.

## Standing rules from Mohit

These were given in conversation and are not all in the repo elsewhere.

- Claude owns the tech end to end. Work in long autonomous runs and benchmark against the category leader (CapCut).
- Browser and dashboard tasks go to Mohit as paste-ready prompts for the Claude Chrome extension. Claude does code and command-line work.
- Secrets (service-role keys, client secrets, passwords) stay in the browser or on Mohit's machine. Never ask for them in chat.
- **Do not touch** the Metro server on port 8081 or the plain "iPhone 17" simulator. They belong to another project (NurddApp-staging).
- Commit on `app-shell`. Push only when asked.
- Keep `docs/strategy.md` current: every significant decision goes in its decision log.

## Traps worth knowing

- Editing code while a Skia video is on screen crashes Expo Go on hot reload. Relaunch the app instead.
- In the simulator, swiping across the caption or overlay rows of the timeline drags those items. Scrub on the main clip row.
- The Android emulator needs `-crash-report-mode never`, or a desktop dialog can block its boot.
- `expo run:android` rewrites the `android` and `ios` scripts in `package.json`. Restore them afterwards.
