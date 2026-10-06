# AI video editor benchmark and FrameFlow parity

**As of 2026-10-06.** This replaces the status column in [vn-feature-inventory.md](vn-feature-inventory.md); the VN facts there still stand.

## Who sets the bar

**CapCut** is the benchmark. It is the only phone app that pairs a full multi-track editor (keyframes, speed curves, chroma key, masks, 4K60 export) with a wide AI layer (auto captions, text to speech, background removal, generative video). App Store: 4.6★ on 1.1M ratings. Third-party figures put it at roughly 736M monthly users and about 81% of mobile video-editing users.

The others are narrower: **Captions** (talking-head AI, one-tap edit, dubbing), **OpusClip** and **Submagic** (clipping and styled captions), **Instagram Edits** (free, lighter on AI), **InShot** (classic editor with AI add-ons). **Descript** appears to have no native mobile app.

**Source limits.** capcut.com returned HTTP 451 and the Play listing 404'd, so CapCut's own help pages could not be read. Its exact toolbar order, slider names, animation and transition names come from third-party guides or memory and need an in-app screenshot pass before being treated as spec.

## Parity

✅ built and checked on the simulator · 🟡 built, not yet exercised by hand · ❌ not built.

"Export" means the media server in `pipeline/server`, which currently runs on the development Mac.

### Editing basics

| Feature | Benchmark | FrameFlow |
|---|---|---|
| Import video and photos | CapCut | ✅ photos are converted to upright JPEG on import |
| Multi-track timeline | CapCut | ✅ main track plus overlay, text, caption, effect and audio lanes |
| Trim, split, delete, duplicate | CapCut | ✅ |
| Reorder | hold and drag | ✅ free-track items hold-and-drag; 🟡 clips use move left / right buttons |
| Replace clip | CapCut | 🟡 |
| Reverse | CapCut, InShot | ✅ server tool |
| Freeze frame | CapCut | ✅ server tool |
| Undo / redo | all | ✅ |
| Pinch-zoom timeline, fixed playhead, time ruler | CapCut, VN | ✅ |
| Markers | VN, Edits | 🟡 manual, plus beat detection |
| Drafts | all | ✅ local, auto-saved, media copied into app storage |
| Crop tool | CapCut | ❌ (fill-frame, zoom and position cover most of it) |
| Adjustment layer, scene detection | Edits, CapCut | ❌ |

### Speed, keyframes, animation

| Feature | Benchmark | FrameFlow |
|---|---|---|
| Constant speed | 0.1x–100x | ✅ 0.1x–8x |
| Speed curves | CapCut presets and custom points | ✅ six presets (Montage, Hero, Bullet, Flash in/out, Jump cut) and a custom five-point curve; smooth in preview and export |
| Optical-flow slow motion | CapCut | ❌ |
| Keyframes | position, scale, rotation, opacity | 🟡 on clips, overlays and text, eased |
| In / Out animations | CapCut | ✅ 9 each for clips, overlays, text |
| Combo / loop animations | CapCut | ❌ |

### Picture

| Feature | Benchmark | FrameFlow |
|---|---|---|
| Filters with strength | CapCut | ✅ 14 filters |
| Adjust | brightness, contrast, saturation, exposure, sharpen, highlight, shadow, temp, tint, fade, vignette, grain, HSL, curves | ✅ brightness, contrast, saturation, temperature, tint, fade, vignette; ❌ sharpen, highlights/shadows, grain, HSL, curves |
| Transitions | CapCut library | ✅ 10 (dissolve, dips, pushes, wipes, zoom), duration, apply to all |
| Effects | CapCut library | 🟡 8 (shake, pulse, slow zoom, flash, strobe, blur, dim, letterbox) |
| Picture-in-picture overlays | CapCut | ✅ video and photo; 🟡 blend modes and circle / rounded masks |
| Blend modes | CapCut | 🟡 7 |
| Masks | linear, mirror, circle, rectangle, star… | 🟡 circle and rounded only |
| Canvas ratio and background | CapCut, InShot | ✅ 8 ratios, colour background; blur background shows in export only |
| Rotate, flip, fill / fit, zoom, opacity | all | ✅ |
| Chroma key | CapCut, InShot, Edits | ✅ on video and photo overlays: key colour, strength, soft edge, tint clean-up; ❌ not on main-track clips, no colour picker from the picture |
| Stabilise | CapCut, InShot | 🟡 server tool, light one-pass stabilisation |
| Background removal, object tracking | CapCut, Edits | ❌ |

### Text, stickers, captions

| Feature | Benchmark | FrameFlow |
|---|---|---|
| Text: font, colour, outline, shadow, box, alignment, spacing | CapCut | ✅ 4 font families, Devanagari shaped correctly |
| Text style presets | CapCut templates | 🟡 8 |
| Custom fonts, brand kit | CapCut, Submagic | ❌ |
| Stickers | CapCut, InShot libraries | ✅ 40 emoji; no sticker library |
| Auto captions | CapCut, Captions (91 languages) | ✅ on-server whisper, Hindi verified, word timings |
| Caption templates with word highlight | Submagic | ✅ 4 templates, karaoke highlight in preview and export |
| Captions in English from Hindi speech | InShot, Edits | ❌ wired up, but the installed speech model cannot translate; needs a second model on the server |
| Bilingual (two lines) | InShot | ❌ |
| Import .srt | VN | 🟡 |
| Devanagari ↔ Roman (Hinglish) toggle | none | ❌ planned differentiator, needs the ASR bakeoff |

### Audio

| Feature | Benchmark | FrameFlow |
|---|---|---|
| Clip volume, mute, fade in/out | all | ✅ |
| Add music from files | all | 🟡 |
| Music and SFX library | CapCut, Edits | ❌ licensing |
| Voice-over recording | CapCut | 🟡 |
| Extract audio | CapCut | ✅ server tool |
| Beat detection | Edits, CapCut | 🟡 server tool, then "Cut on markers" |
| Noise reduction | Captions, Edits | 🟡 server tool |
| Voice effects | CapCut, Edits | 🟡 5 effects, server tool |
| Text to speech | CapCut, InShot | ✅ uses the Mac's system voices for now |
| Ducking, vocal isolation, waveforms | CapCut Pro | ❌ |

### AI

| Feature | Benchmark | FrameFlow |
|---|---|---|
| Silence removal | InShot AI Cut, Submagic | ✅ |
| Filler-word removal (um, matlab, yaar…) | InShot, Submagic | ✅ uses caption word timings |
| Transcript editing (cut a word, cut the video) | Descript, OpusClip | ✅ |
| Long video → ranked short clips | OpusClip | ❌ clips are still sample data (pipeline needs API keys), but they now open in the full editor |
| Auto reframe with speaker tracking | OpusClip, Captions | ❌ |
| One-tap AI edit, chat editing | Captions | ❌ |
| AI B-roll, auto zoom, hook titles | Submagic | ❌ |
| Dubbing, avatars, generative video | Captions, CapCut | ❌ out of scope |

### Export

| Feature | Benchmark | FrameFlow |
|---|---|---|
| 720p–4K, 24/30/60 fps | CapCut, VN | ✅ rendered by the media server, H.264 + AAC |
| File-size estimate | VN | ✅ |
| Save to gallery | all | ✅ |
| Share sheet | all | 🟡 |
| On-device export | all | ❌ export needs the server reachable |
| Bitrate control, HDR | VN | ❌ |
| Templates, cloud projects, scheduling | CapCut, OpusClip | ❌ |

## What matters most next

1. **Deploy the media server.** Until it runs somewhere reachable, export and every AI tool only work next to the development Mac.
2. **Real AI clipping**, wired into the editor. It is the differentiator VN and CapCut lack for Hindi, and it is still a mock.
3. **Hinglish caption quality.** Whisper produced Devanagari for English loan words ("स्टार्टार्ट" for "startup"). The ASR bakeoff decides the provider.
4. **More mask shapes, blending video overlays, background blur in preview.** These need more of the picture drawn through shaders.

## Sources

Read directly: App Store listings for CapCut, Captions, Edits and InShot; submagic.co/pricing. Search snippets only: opus.pro/mobile-app, veed.io. Third-party guides for CapCut specifics: videoproc.com, capcutguide.com, pexo.ai, riverside.com, fluxnote.io. Failed: capcut.com (451), CapCut on Google Play (404).
