# FrameFlow: Competitive UI/UX Teardown

**Research date:** 5 Oct 2026
**Apps covered:**
- Kalakar, VN Video Editor and OpusClip, each researched in depth.
- Captions (Mirage), CapCut, Instagram Edits, YouTube Create, Vizard, Submagic, Klap, InVideo, KineMaster, InShot and Indian caption startups, each scanned for patterns.

**Method:** public sources only. That means store listings and screenshots, help centers, official tutorials (titles, chapters and auto-captions), App Store review feeds, and third-party reviews. We did not sign in, create accounts or submit forms. Reddit was behind a bot wall, so there is no Reddit evidence. Store numbers are from the India storefront unless marked otherwise.

---

## 1. TL;DR

1. **Nobody owns "long video → Indic-captioned shorts, on a phone."**
   - **OpusClip** has no Hindi; its help center says so. Its iOS editor only edits captions, its Android app has no editor at all and is rated 2.8★, and clips take 20–40 minutes to process.
   - **Kalakar** does captioning only. Its videos max out at 2–5 minutes, and its Android app (about 5K installs) is a wrapper around the web app. It has no iOS app.
   - **VN** has no AI clipping and its captions are English-first. It is #2 in Photo & Video on India's App Store.
2. **The closest threat is Captions (Mirage).** It has Hindi, Hinglish and 10+ Indic languages, plus AI Shorts on mobile. But it is expensive in India (₹969–2,999/mo), slow (up to 1 hour per AI Shorts job), opaque about credits, and its Android "Lite" app is a 3.5★ app with a 5-minute cap. We beat it on speed, price and Android quality.
3. **Basic captions are now free from the platforms.** Instagram Edits has free bilingual captions; Meta offers free Hindi and Indic dubbing; YouTube Create is free. Captions alone won't sell. The value is in three things:
   - **Clip selection quality** for Indian content.
   - **Indic caption craft:** a script toggle, Hinglish support and Indic fonts.
   - **A fast, cheap, reliable workflow** on low-end Android over flaky networks.
4. **The biggest use case is podcast clips.** Hindi "podcast shorts kaise banaye" tutorials pull 4–5M views. Next come paid clippers (Whop clipping in India, with videos at 376K–676K views), motivational and spiritual content, comedy and news.
5. **The #1 complaint across the category is money and opacity.** Credits get burned with nothing to show, there are trial traps, and features are drip-gated. #2 is reliability: uploads failing, exports failing, audio lost. Make trust the pitch.

---

## 2. Competitor snapshots

### 2.1 Kalakar (kalakar.io), the Indic captioning specialist

**Positioning:** "Captioning software made by desi creators, for desi creators." The tone is anti-"gora" (anti-Western).
- It targets **editors first and creators second**: freelancers and agencies in India and Pakistan.
- Its logo wall: Raj Shamani, Varun Mayya, BeerBiceps, Tech Burner, ScoopWhoop, Pinkvilla.
- The user counts on its own pages conflict (100K vs 200K).

**Scale and company**
- Team of 2–10, founded 2025. Kalakar Labs LLC is based in New York; Indian sales go through Clanflare in Faridabad.
- Android app shipped 26 Jul 2026: about 5K installs, 4.0★, 9 ratings. No iOS app. YouTube channel has about 404 subscribers.
- Distribution appears to come through Editing Skool's audience (an editing-education company).

**Languages:** 21. Each has a **Native or Roman** script option. Hinglish requires choosing *English* as the language, which is confusing.

**Core flow (web and Android are identical)**
1. Upload (MP4/MOV; audio-only on paid plans).
2. A "Prepare Your Video" modal:
   - Spoken language.
   - Writing system: Native or Roman.
   - Toggle cards: Translate to English, Audio Enhancement, Emojis.
   - A green **Generate Transcription** button.
3. The editor opens on a **low-res proxy** built for slow networks. Full resolution is used at render.
4. Choose a template: MrBeast, Hormozi, Iman Gadzhi, Ali Abdaal, Raj Shamani, Varun Mayya, Editing School, Bubble, Mumbai, Underline, Flicker, Kalakar Glow and others.
5. Export: Video, Alpha Channel, SRT or VTT, at 720p/1080p/4K.

**Caption editor: the best in this set**
- **Tap a word** to get a menu: Emphasize · Spotlight · Edit · Search & Replace · Split · Previous Line / Next Line · Delete.
- **AI emphasis** marks one word per line automatically. **Spotlight** puts a word on its own line, bigger and brighter.
- **Caption Tools:** words per line, characters per line, number of lines, remove punctuation, remove gaps, remove emphasis, and a **caption-delay slider** (in ms).
- **Per-line style overrides** with a "magic wand" that drags a style onto other lines. The source line is the "mother" and the others are "children," which follow it when it changes.
- **Unlock mode** lets you freely move or resize any word, line or the whole caption stack. A ghost box shows the original position.
- A WORD/LINE timeline with drag-to-retime, plus brand presets carried across aspect ratios.
- **Replace video, keep captions** for client revisions, but only if the duration matches exactly.
- Since Aug 2026: basic editing (split, ripple delete, crop, media bins).

**Mobile UI**
- Dark theme with a green accent. Every tool is a **bottom sheet**: Captions / Text / Templates / AI Audio / Transitions / Export.
- The sheets cover 60–65% of the screen, leaving a dimmed sliver of preview, so you style captions you can barely see.
- Controls are desktop-style: px steppers, X/Y % fields, hex input. No gestures.
- No share to Reels or WhatsApp. Play data-safety says data is **not encrypted in transit**.

**Pricing (INR)**

| Plan | Monthly | Yearly (per month) | Includes |
|---|---|---|---|
| Free | ₹0 | | 2-min videos, 5 min of full templates, 3 audio credits |
| Editor | ₹670 | ₹559 | 2 hrs, 1080p |
| Creator | ₹950 | ₹792 | 5 hrs, 5-min videos, 4K, translation |
| Studio | ₹2,400 | ₹2,000 | 12 hrs, 30-min videos, alpha channel, team seats |

- Strict no-refund policy.

**Pain points**
- Caption timing: lines run past the speech, and gaps can't be removed.
- Paywall nickel-and-diming.
- The Hinglish = English confusion, and the script is locked after generation.
- Rigid revisions. Plugin install friction.

**Our angle:** they don't clip. Their mobile app is a port of the web app. Their timing quality is the most visible weakness. We can switch scripts instantly without regenerating.

### 2.2 VN Video Editor (Ubiquiti Labs), the mobile editing standard

**Scale**
- About 335M Play installs, 4.6★ from 5.5M ratings.
- **App Store India: 2.1M ratings and #2 in Photo & Video.** India is its biggest iOS market.
- Ships fast: 6 iOS releases from July to October 2026.

**Positioning:** "Edit like a pro, without limits." Free, **no watermark, free 4K HDR export**. 103 of 1,324 positive reviews mention moving from CapCut.

**Home**
- Tabs: Projects / Works / AI Assets / Templates / BeatsClips / Stories.
- Folders (Pro), date-grouped project rows, a QR "VN Code" scanner, and a blue **+** that opens a Create sheet.
- Create sheet tabs: Create / AI Kits / AI Models / Yours, with a Tools grid and a storage meter.

**Editor layout: this is the gesture vocabulary to match**
- **Top bar:** Back · ? · **aspect-ratio dropdown** (with platform icons) · ⋯ · blue **Export**.
- **Fixed centre playhead**; the timeline scrolls underneath it. **Pinch to zoom up to 30x** (0.05 s precision), with frame ticks on the ruler.
- **Left track rail** with + buttons (music, text, overlay, main, audio). **Empty tracks show placeholders** such as "Tap to add subtitle."
- **"+" squares between clips** open transitions, with an "apply to all" option.
- The selected clip gets a **yellow border** with trim handles. Long-press a clip to reorder it.
- **Two toolbar levels:**
  - A **floating mini-bar** above the selected layer: Replace, Motion, Keyframe, Curve, Lock, Duplicate, Delete.
  - A **scrolling deep-tools bar** at the bottom: Filter, Trim, FX, Split, Delete | Speed, Volume, Crop, … Auto Captions, AI Edit, Keyframe.
- **Quick Mode** (magnetic main track) vs **Pro Mode** (absolute time, ripple toggle), plus Linkage between tracks.
- **Proxy compression on import** with a Cancel button.

**Captions**
- **Auto-caption sheet:** Conversion Mode (Tiny/Base on-device for free, or Cloud for credits) · spoken language · template chips · translate (18 languages, shown bilingual or translation-only) · filler words (Pro) · a **cost line ("0.05 Credits will cost · Balance")** · Convert.
- Captions are edited per segment as timeline text layers. Word-level karaoke styling is not verified.
- **No Indic language is officially listed.** The on-device model is English-only (base.en). Users ask for Bengali. There is no Hinglish or Roman-script mode.

**AI features**
- Every AI sheet shares one pattern: input, chips, preview carousel, then a **cost + balance** footer and a **Generate** button.
- Jobs run in the background with a **progress wheel in the top-right**.
- Filler and pause removal: VN lists what it detected, you tick what to remove, and the video is cut automatically.

**Export**
- Auto/Manual control. Manual offers 480p to 4K, 24–60 fps, 1–300 Mbps, and HDR, with a **live file-size estimate**.
- Exports **must stay in the foreground; there is no background export.**

**Pricing**
- VN Pro: ₹399 (likely monthly) / ₹1,799 (likely yearly).
- Credits: ₹99 for 100 credits up to ₹999 for 1,000.
- Pro includes 100 credits per month (they expire). Free tier shows ads and caps you at 100 projects.

**Pain points** (176 recent App Store reviews rated 1–3★)

| Complaint | Share |
|---|---|
| Audio lost or muted on export | ~22% |
| Export failures | ~21% |
| Crashes and lag | ~18% |
| Paywall | ~9% |
| Update regressions | ~8% |

No cloud sync is the most-cited missing feature.

**Our angle:** VN has no content-aware clipping, weak Indic captions, no transcript editing, no batch output and no background export.

### 2.3 OpusClip, the AI clipping leader on web, weak on mobile

**Scale and ratings**
- Claims 12M–20M users; its pages disagree.
- iOS: 4.85★ (US), 4.58★ (India).
- **Android: 2.8★ with 100K+ installs, launched Jun 2026.**

**Submit sheet (mobile)**
- Video thumbnail with duration and resolution, a copyright line, aspect-ratio chips (9:16/1:1/16:9/4:5).
- Clip length "Auto (0–3m)", a 2×3 grid of caption-preset tiles, and a **"Credit usage ⚡10"** line.
- A big **"Get clips in 1 click"** button.
- Web adds: spoken language, ClipAnything vs ClipBasic, 17 genres, a natural-language prompt, a timeframe slider, auto headline, and a brand template.

**Processing**
- 20–40 minutes; a third-party benchmark measured about 25 minutes to the first clip on a 90-minute podcast.
- iOS shows progress as a Live Activity on the lock screen and Dynamic Island, and supports background and resumable uploads.
- Credits are auto-refunded on failure or if processing takes more than 90 minutes.

**Results**
- A **two-column masonry grid**. Each card shows duration, an AI title and a **big virality score** (green for high, amber for lower).
- Tapping a card opens a full-screen player with Share · Download · Favorite · CC · Edit 👑 · Schedule 👑.
- **Score breakdown:** Hook A / Flow A- / Value B / Trend.
- The web adds sort, dislike-to-hide, and a **Reprompt box** where each new prompt opens as its own tab.

**How many clips**

| Source length | Clips |
|---|---|
| 30–60 min | 23–32 |
| Over 2 hrs | 42–55 |

- Third-party tests: about 62% of clips publishable as-is and about 13% unusable. The score correlates only weakly with real views.

**Web editor**
- **Transcript on the left**: delete words to cut, "apply to all" corrections, brand vocabulary, "Add a section."
- Speech cleanup (fillers, pauses, bad takes) that you review before it cuts.
- Seven layouts: Fill, Fit, Split, Three, Four, Screenshare, Gameplay. Plus speaker tracking, B-roll, lower thirds and auto SFX.

**Mobile editor:** captions only, edited one word at a time. iOS cannot trim, add text or add music. Android has no editor at all. Reviews: "website 10/10, app 2/10."

**Posting**
- A per-platform post sheet with AI title, description and hashtags, an AI rewrite button, character counters and a cover picker.
- Scheduling is web-only. Targets are TikTok-centric (TikTok is banned in India).

**Pricing and limits**
- Free: 60 credits, **watermark, projects expire after 3 days**.
- Starter $15. Pro $29, or $14.50/mo billed yearly.
- 1 credit = 1 minute of source video, charged whether you keep the clips or not. Credits expire after 60 days.
- India iOS prices: ₹789 Starter, ₹1,649 Pro.

**Languages**
- **The help center states Hindi is not supported.** No Indic language at all, no right-to-left (so no Urdu), and captions translate to English only.

**Pain points**
- Upload and processing reliability is the largest share of complaints: stuck at 45%, slow uploads.
- Billing and trial traps.
- Mobile feature gaps.
- Clip quality: jokes cut before the punchline, bad reframing on gaming footage.
- Support is bot-first.

### 2.4 The rest of the field

| App | Platforms | Scale (India unless noted) | Clipping | Indic captions | Price | Standout UX |
|---|---|---|---|---|---|---|
| **Captions (Mirage)** | iOS, Android Lite, web | iOS 4.58★ (3.2K ratings); Android 1M+, 3.5★ | ✅ AI Shorts (up to 1 hr), Clips Chat | ✅ Hindi, Hinglish + 10 | ₹599/wk, ₹969–2,999/mo | One-tap AI Edit styles, chat editor, eye contact, AI zoom |
| **CapCut** | All, **not in Indian stores** | 1B+ installs globally | ✅ Auto Cut; long-to-short on web | Hindi listed, unreliable | n/a in India | Templates, Auto Reframe. Still used in India via VPN/APK |
| **Instagram Edits** | iOS, Android | 100M+ installs, 4.4★ | ❌ | ✅ bilingual, 15 languages | Free, 4K, no watermark | Ideas / Inspiration / **Insights (retention graph)** |
| **YouTube Create** | iOS, Android | 10M+ installs, 4.6★ | ❌ (assembles short clips) | Hindi captions; Hindi/Bengali voiceover | Free | 3-step "Edit with AI" wizard; Gemini editor coming 2027 |
| **Vizard** | iOS, Android, web | 100K+ installs, 4.3★ | ✅ | Hindi on web | From ₹2,999/mo | **Clip card showing score + reason + transcript + title**; topic-guided clipping |
| **Submagic** | Web only | — | ✅ | Hindi | $19–69/mo | Magic zooms, auto B-roll, hook generator |
| **Klap / 2short** | Web only | — | ✅ (link in) | Klap: Hindi | $10–49/mo | Paste a link, get clips ranked by score |
| **InVideo** | iOS, Android, web | 10M+ installs, #49 iOS India | ❌ (generates video) | — | ₹999–11,900 | AI agent plus a multitrack timeline |
| **KineMaster** | iOS, Android | 500M+ installs | ❌ | Hindi and Urdu, on-device (packs of 400MB+) | ₹599/mo | Shared projects as templates |
| **InShot** | iOS, Android | 500M+ installs, #10 iOS India | ❌ ("AI Cut" removes silences) | Bilingual | ₹399/mo, **₹3,999 lifetime**, watch an ad to remove the watermark | Cheapest pricing ladder |
| **Indian caption startups** (Captik, AutoCap, Indi Cap, Pixster Captions AI) | Mostly Android/web | Pixster: 1M+ installs, 92K reviews; others tiny | ClipPods claims Hindi/Tamil (unverified) | ✅ core focus | **₹9 first export**, ₹59 week pass | **Devanagari / Roman / English toggle from one transcript**; Captik runs on Bhashini |

**Market shifts**
- Josh stopped accepting user uploads (May 2026).
- Moj pivoted to short dramas.
- **Destinations are now essentially Reels, Shorts and WhatsApp.**

---

## 3. Use cases and personas, ranked

| # | Persona | Evidence | What they need |
|---|---|---|---|
| 1 | **Hindi/Hinglish video podcasters** (2–3 people on mics) | 4–5M-view "podcast shorts" tutorials. Raj Shamani's model: 30–50 clips/week across fan pages. Hindi is ~38% of the Indian podcast market | Speaker-aware split layouts, Hinglish captions, good hooks, 20–50 clips per episode |
| 2 | **Clippers and clip agencies** (paid clipping via Whop, Reach.cat, Vyro) | "Whop clipping India" videos at 376K–676K views. OpusClip runs clipping contests | Paste a link, batch output, speed, no watermark, many accounts and brand presets, cheap per clip |
| 3 | **Freelance editors and agencies** | Kalakar's main audience; Pinkvilla, ScoopWhoop | Exact timing, brand presets, SRT/alpha export, replace video and keep captions |
| 4 | **Motivational and quote shorts** | 1.19M-view tutorials | Hook text, bold karaoke captions, music |
| 5 | **Spiritual and devotional** (katha, pravachan, satsang) | Premanand Maharaj editing tutorials; channels with 16–18M subscribers | Very long sources (1–3 hrs), Devanagari, verse/quote detection |
| 6 | **Educators and exam coaching** (UPSC/JEE/NEET), **finance**, **news debates**, **comedy** | Meta survey: 39% of users count comedy among their top Reels genres; news tutorials at ~240K views | Genre-aware clipping, keeping the punchline, multi-speaker handling |
| 7 | **Regional-language creators** (non-Hindi) | 58% of creators are non-Hindi; 66% are outside metros (ISB–Hashfame) | Tamil, Telugu, Bengali, Marathi etc. with proper fonts per script |

---

## 4. The top complaints, and our answers

| Pain (who has it) | FrameFlow answer |
|---|---|
| **Opaque credits, burned with nothing to show, trial traps, expiry** (Captions, InVideo, Vizard, OpusClip, Kalakar) | Show the **cost before** anything is processed. Charge per **kept/exported** clip, not per source minute. Clear trial-end reminders. UPI micro-packs and a week pass. One-tap cancel. A refund window |
| **Uploads and processing slow or failing** (OpusClip top theme; Captions up to 1 hr) | **Paste a link or share from the YouTube app (no upload).** Chunked, resumable background upload. Compress on the device first. Start transcribing while the upload streams. **First clip in under 5 minutes** |
| **Export failures, lost audio, foreground-only export** (VN) | Render on the server, or a background export queue. Verify the audio track after render. Resumable downloads |
| **Mobile is a cut-down companion** (OpusClip: captions-only on iOS, no editor on Android; Vizard; Kalakar) | **Full editor on Android first**: trim, captions, text, music, reframe, hook overlay |
| **Hinglish and script confusion** (Kalakar: Hinglish = English, script locked) | A labelled **Hinglish** option, plus **instant switching between Devanagari, Roman and English after generation**, with no regeneration |
| **Caption timing drift and gaps** (Kalakar, quso, Captions) | Word-level forced alignment, automatic gap filling, trim caption in/out points; batch edits, then re-align once |
| **Clip picks miss context** (punchline cut, multi-speaker) | Train selection on Indian Shorts and Reels. Speaker-aware boundaries. Show the **reason** for each pick, not just a score |
| **Reframe fights handheld or gaming footage** | Per-clip "keep original framing" and a manual tracker |
| **Bot-only support** | Human support over WhatsApp in Hindi and English |
| **Trust** (Kalakar: no encryption in transit, conflicting claims) | Encryption in transit, a clear retention policy, honest numbers |

---

## 5. UX patterns to steal, mapped to FrameFlow screens

### Ingest
1. **Paste a link, or share to FrameFlow from the YouTube app.** *(Klap, 2short, OpusClip.)* No gigabyte uploads over mobile data.
2. **One submit sheet with smart defaults.** *(OpusClip, Kalakar.)* Thumbnail and duration · **spoken language with Hinglish listed explicitly** · script · aspect chips · clip length "Auto" · caption preset strip · genre · optional topic prompt *(Vizard)* · toggles for clean audio, emojis and hook headline · **cost line** · one big "Get clips" CTA · "save as default."
3. **Background processing.** *(OpusClip iOS, VN.)* Live Activity on iOS, an ongoing notification on Android, a push when clips are ready, resumable uploads, auto-refund on failure.

### Results
4. **A ranked clip feed.** *(OpusClip, Vizard.)* Cards with score, a plain-language **reason**, title and duration. Hook/Flow/Value grades. Sort by score or by time. Favorite, and dislike to hide. Multi-select for bulk export.
5. **Reprompt without reprocessing.** *(OpusClip Reprompt, Captions Clips Chat.)* For example, "3 more clips about money," each prompt as its own tab.
6. **Swipe review.** [Our idea] A full-screen vertical pager through the clips, with keep/discard, like Reels. This is native to how our users already consume video.

### Clip editor
7. **The transcript is the timeline.** *(OpusClip web, Submagic.)* Delete words to cut. "Add a section" pulls in context from the source. **Hindi filler removal** ("matlab", "toh", "na", "basically") that the user reviews before cutting.
8. **A word tap menu.** *(Kalakar.)* Emphasize · Spotlight · Edit · Search & Replace (apply to all, remember the spelling) · Split · move to previous/next line.
9. **Caption tools.** *(Kalakar.)* Words per line, number of lines, punctuation, gaps, a delay slider.
10. **One-tap style picker with live preview.** *(Captions, Kalakar templates.)* Indian creator styles in Indic fonts. Bilingual stacked captions *(Edits)*.
11. **Gesture styling on the canvas.** [Gap in Kalakar] Pinch and drag captions directly; a split preview so the bottom sheet never hides the video.
12. **VN's timeline vocabulary.** Fixed centre playhead, pinch zoom, a floating mini-bar plus a deep-tools bar, magnetic by default, tap-to-add placeholders, undo/redo always visible.
13. **Layouts.** *(OpusClip.)* Fill / Fit / Split / Screenshare / Gameplay, auto-switching by speaker, set per scene.
14. **Hook headline on top clips by default,** plus Hinglish hook suggestions *(OpusClip, Submagic)*. Auto zoom punch-ins *(Captions, Submagic)*.
15. **A cost and balance footer on every AI action.** *(VN.)*

### Export and publish
16. **A per-platform post sheet.** *(OpusClip.)* Reels, Shorts, **WhatsApp Status**. AI title, description and hashtags in Hinglish, character counters, a cover picker. Save to gallery with **no watermark**.
17. **Auto/Manual export with a live file-size estimate.** *(VN.)*
18. **Replace the source and keep the edits.** *(Kalakar.)* Brand presets that carry across aspect ratios.

### Growth loops
19. **QR / code sharing of caption styles and templates.** *(VN Codes culture in India.)*
20. **An insights loop.** *(Edits retention graph.)* Show which clips performed and suggest what to clip next.

---

## 6. Implications for v1 (proposal)

**Core loop:** link or upload → AI clips with Indic captions → swipe review → light edit → post. Android and iOS at the same time.

**Must-have for launch**
- Link ingest (YouTube) plus resumable upload. Background processing with a push when done.
- Indic speech-to-text with Hinglish code-mixing. **Script toggle** (Devanagari / Roman / English) without re-running.
- AI clip selection with reasons and scores. 9:16 auto-reframe with speaker tracking and a 2-speaker split layout.
- A results feed with swipe review and bulk export.
- A clip editor:
  - Transcript-based trimming.
  - The word tap menu.
  - 8–12 caption templates in Indic fonts.
  - Hook headline.
  - Position and size by gesture.
- Export to gallery (no watermark on paid plans). Share sheet to Reels, Shorts and WhatsApp.
- Pricing in INR: free trial clips, UPI, cost shown before processing, charged per exported clip.

**Next**
- Reprompt and chat.
- Hindi filler removal.
- Brand presets.
- Multi-account posting and scheduling.
- Clipper/agency mode (batch links, many brands).
- Insights.
- Regional-language expansion.

**Don't compete on:** generative AI video, avatars, dubbing (Meta and YouTube give it away), or deep multi-track editing (VN wins there; match its gestures, not its depth).

**Open technical questions (to decide next)**
- Speech-to-text provider for Hinglish and Indic. Candidates: Sarvam, AI4Bharat/Bhashini, Whisper large-v3 fine-tunes, ElevenLabs Scribe, Deepgram.
- Highlight-selection model. Choose LLM over transcript versus a multimodal model.
- Render pipeline: server-side FFmpeg versus on-device.
- Rendering Indic text in burned-in captions: conjuncts and matras.

---

## 7. Sources (key)

**Kalakar**
- kalakar.io (home, /captions/* language pages, /blogs/*, terms, privacy)
- app.kalakar.io/signup
- kalakar.clanflare.com
- Play listing io.kalakar.app and its data-safety page
- youtube.com/@kalakar_app (about 20 tutorials transcribed)
- editingskool.com/blogs/tool/kalakar.io
- videocaptions.ai/vs/kalakar

**VN**
- vlognow.me: site, /help (55 articles), /blog/features/*
- Play listing com.frontrow.vlog
- App Store id1343581380: US and India listings, plus review RSS feeds (1,500 reviews)
- Official YouTube channel
- capcutguide.com review
- appsupports.co negative-review summary

**OpusClip**
- opus.pro: pricing, mobile-app and product pages
- help.opus.pro: about 90 articles, including does-opusclip-support-hindi, ios-app-feature-limitations, android-app-supported-unsupported-features, virality-score, how-many-clips, and the OpenAPI spec
- opusclip.canny.io/changelog
- Play listing pro.opus.clip
- App Store id6743615403, plus review RSS feeds
- reap.video 2026 benchmark
- scalereach.ai review
- eesel.ai review

**Adjacent apps**
- captions.ai/help
- techcrunch.com Mirage funding article
- Play and App Store listings for the apps in §2.4
- submagic.co, klap.app, 2short.ai, quso.ai/faq, vizard.ai/pricing
- kinemaster.com auto-captions page
- captik.in, autocap.in
- support.google.com/youtube/answer/16631240
- indiantelevision.com on Edits bilingual captions
- medianama.com on Made on YouTube 2026
- isb.edu ISB–Hashfame creator report
- about.fb.com India Reels report
- opus.pro/blog/whop-content-rewards

**Caveats**
- Store review samples are limited to the latest roughly 50–500 per app.
- Some third-party benchmarks are published by competitors.
- Captions' and Vizard's mobile language lists were only partly verified.
