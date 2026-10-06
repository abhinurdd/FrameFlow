# VN Video Editor: feature inventory and FrameFlow parity

**As of 2026-10-06.** VN facts come from the iOS App Store listing (v2.22.0) and vlognow.me help pages. The Google Play listing would not load, so Android parity is assumed. Items marked *(unverified)* come from third-party reviews only; a hands-on pass in the app is still needed to close those.

> The FrameFlow status column below is out of date. Current parity is tracked in [ai-editor-benchmark.md](ai-editor-benchmark.md).

**FrameFlow status (as of the first editor build):** ✅ built · 🔜 next (works in the current preview engine) · 🧱 needs the compositor (see [strategy §4](../strategy.md)) · ☁️ needs a backend or model · ⏸ not planned yet.

## 1. Project and import

| VN feature | How VN does it | FrameFlow |
|---|---|---|
| Aspect ratios | Switcher at the top of the editor | ✅ Original, 9:16, 16:9, 1:1, 4:5, 4:3, 21:9 |
| Canvas background | "BG" tool: blur / colour / image *(options unverified)* | 🧱 |
| Drafts | Auto-save; 100 free, folders are Pro | ✅ auto-saved local drafts; 🔜 rename, folders |
| Import | Gallery, Files, AirDrop, Wi-Fi, WhatsApp, Zip; music, fonts, stickers, SRT | ✅ videos from gallery; 🔜 photos, Files, audio, fonts, SRT |
| Project sharing | Project file (full or simple), cross-platform; protected projects are Pro | ⏸ |
| Templates | 150+ templates, custom templates, share by file or QR | ⏸ (after the core editor) |
| Quick-create | AutoCut, BeatsClips, Story, Teleprompter, Collage | ☁️ AI clipping is our equivalent of AutoCut; rest ⏸ |

## 2. Timeline

| VN feature | How VN does it | FrameFlow |
|---|---|---|
| Main track | Quick mode (magnetic) or Pro mode (free position, ripple toggle) | ✅ magnetic main track; 🔜 Pro mode |
| Other tracks | Overlay/PiP, text, sticker, audio | ✅ text track; 🧱 PiP, stickers; 🔜 audio track |
| Zoom and precision | Pinch up to 30x, 0.05 s, frame ticks | ✅ pinch zoom, time ruler; 🔜 frame ticks |
| Fixed centre playhead | Timeline scrolls under it | ✅ |
| Trim | Drag handles | ✅ |
| Split | At playhead | ✅ |
| Reorder | Long-press and drag | ✅ move left/right; 🔜 drag to reorder |
| Delete / duplicate | Mini-bar | ✅ |
| Replace | Swap the source, keep the edit | 🔜 |
| Undo / redo | Always visible | ✅ |
| Rotate / flip / mirror | Per clip | ✅ rotate 90°, flip |
| Crop | Crop tool | 🧱 |
| Freeze frame | Inserts a still at the playhead | 🧱 |
| Reverse | Generates a reversed clip | 🧱 |
| Beat markers | Manual or auto-detected | 🔜 manual; ☁️ auto |
| Snapping | To objects and frame edges | 🔜 |
| Track linkage, lock, hide | Editor preferences | 🔜 |
| Extract stills | Save a frame as an image | 🔜 |

## 3. Speed

| VN feature | How VN does it | FrameFlow |
|---|---|---|
| Constant speed | 0.1x to 100x | ✅ 0.25x to 4x presets; 🔜 slider, wider range |
| Curve speed | Presets plus custom curve with draggable nodes | 🧱 |
| Smooth slow-mo | Optical-flow frame interpolation | 🧱 (native) |

## 4. Keyframes

| VN feature | How VN does it | FrameFlow |
|---|---|---|
| Keyframed properties | Scale, position, rotation, opacity on text, stickers, PiP, mosaic; audio volume | 🧱 |
| Easing | 19 presets (Ease, Cubic, Quart, Circ, Back, Stutter, Damp) and custom curves | 🧱 |

## 5. Visual

| VN feature | How VN does it | FrameFlow |
|---|---|---|
| Filters | Filter market, own filters, share by file or QR | 🧱 |
| LUT import | `.cube` *(format unverified)* | 🧱 |
| Adjust | Exposure, contrast, saturation, temperature, highlights, shadows, sharpen, vignette, HSL, curves *(list unverified)* | 🧱 |
| FX | 12 categories (Basic, Beats, Glitch, RGB, Blur, Rotation, Split, Nature, Light, Retro, Decor, Stylize) | 🧱 |
| Transitions | Basic, matte, custom; "apply to all" | 🧱 |
| Masks | 9 shapes plus custom | 🧱 |
| Chroma key | Colour picker, intensity, spill | 🧱 |
| Blend modes, opacity | Per layer | 🧱 |
| Mosaic / magnifier / blur region | Draggable region | 🧱 |
| Stabilization | 3 levels | 🧱 (native) |
| Cutout | One-tap background removal, on-device | ☁️ / native model |
| Body effects | Person detection with stroke/clone effects | ⏸ |
| HDR | Dolby Vision editing on iPhone 12+ | ⏸ |

## 6. Text and graphics

| VN feature | How VN does it | FrameFlow |
|---|---|---|
| Text | Font, colour, outline, shadow, background, alignment, spacing | ✅ add, edit, move, size, colour, timing; 🔜 fonts, outline, shadow, background |
| Custom fonts, brand kit | Import fonts; store brand fonts and colours | 🔜 |
| Text animation | In / Out / Loop | 🧱 |
| Auto captions | 43 languages on-device, or cloud; word-level timing | ☁️ our core: Hinglish ASR from the Phase 0 bakeoff |
| Bilingual captions | Cloud translation, 18 languages | ☁️ Devanagari / Roman / English toggle |
| SRT import | With retiming | 🔜 |
| Stickers | Library plus imported images | 🧱 |

## 7. Audio

| VN feature | How VN does it | FrameFlow |
|---|---|---|
| Clip volume, mute | Per clip | ✅ |
| Music and SFX library | 1000+ tracks | ⏸ (licensing) |
| Import audio, extract from video | Files, AirDrop | 🔜 (needs audio mixing: 🧱) |
| Voice-over | Record on the timeline | 🧱 |
| Fade in/out, volume keyframes | Per clip | 🧱 |
| Denoise | On-device | ☁️ / native |
| Voice effects | Presets (Robot, Child…) | ⏸ |

## 8. AI

| VN feature | How VN does it | FrameFlow |
|---|---|---|
| Filler-word and silence removal | Flags, you tick, it cuts | ☁️ planned with Hindi filler lists |
| Text-to-speech | Language, voice, speed | ⏸ |
| AI video / image generation, upscaling | Credits | ⏸ (explicitly out of scope) |
| **AI clipping of long videos** | **VN does not have this** | ☁️ our differentiator (Phase 0 in progress) |

## 9. Export

| VN feature | How VN does it | FrameFlow |
|---|---|---|
| Resolution / fps / bitrate | 480p–4K, 24–60 fps, 1–300 Mbps, Auto mode | 🧱 no export yet |
| HDR, audio-only | Toggles | ⏸ |
| No watermark on free | Yes | decision pending (pricing) |
| Share targets | YouTube, Instagram, TikTok, WhatsApp | 🧱 with export |

## 10. VN pricing (India)

Pro ₹399/month or ₹1,799/year. Credits ₹99 per 100 up to ₹999 per 1,000. Free keeps all core editing, 4K export and no watermark; Pro removes ads and adds folders, unlimited projects and premium assets.

## What VN users complain about

Ads in the editor, lag and crashes on heavy projects, lost drafts, exports that fail or lose audio, no background export, weak captions for Indian English and no Hinglish.

## Sources

App Store listing (`apps.apple.com/in/app/vn-video-editor/id1343581380`) and `vlognow.me/help/` pages: editing-101, export, transition-and-fx, audio, import-assets, project-sharing, keyframe, editor-preferences, filters, video-effects, video-quality, speedramp-freeze, chroma, pip-stickers-animations, caption-tts, vn-pro-benefits, credits, brand-kit.
