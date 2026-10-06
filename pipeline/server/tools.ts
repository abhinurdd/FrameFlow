/** Media tools: reverse, freeze frame, audio extraction, denoise, stabilise, voice effects, text to speech, silence, beats, waveform, transcription. */

import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { basename, delimiter, extname, join } from 'node:path';

import { FFMPEG, ffmpeg, run, sec } from './ff.ts';
import type { JobContext, JobOutput } from './jobs.ts';
import { addFile, HttpError, mediaPath, MODELS_DIR, publicInfo, type Media } from './media.ts';

/** Register a tool's output as media and make it the job's file. */
async function asMedia(file: string, name: string): Promise<JobOutput> {
  const media = await addFile(file, name);
  return { result: { media: publicInfo(media) }, file: mediaPath(media), filename: name };
}

const stem = (m: Media) => m.name.replace(/\.[^.]+$/, '') || m.id;

function needs(media: Media, what: 'video' | 'audio' | 'picture') {
  if (what === 'video' && media.kind !== 'video') throw new HttpError(400, 'this tool needs a video');
  if (what === 'picture' && media.kind === 'audio') throw new HttpError(400, 'this tool needs a video or an image');
  if (what === 'audio' && !media.hasAudio) throw new HttpError(400, 'this media has no audio');
}

// ---- Reverse ----

/**
 * Reversing needs every frame of a stretch in memory, so the video is reversed in
 * short chunks, last chunk first, and the chunks are joined without re-encoding.
 */
export async function reverse(media: Media, ctx: JobContext): Promise<JobOutput> {
  needs(media, 'video');
  const src = mediaPath(media);
  const fps = Math.min(60, Math.max(1, media.fps || 30));
  // About 100 frames per chunk, on a whole number of frames.
  const frames = Math.max(1, Math.round(Math.min(4, 100 / fps) * fps));
  const chunk = frames / fps;
  const total = Math.max(1, Math.ceil((media.duration - 1e-3) / chunk));
  const list: string[] = [];
  for (let i = total - 1; i >= 0; i--) {
    const file = join(ctx.tmp, `chunk-${i}.mp4`);
    await ffmpeg(['-v', 'error', '-ss', sec(i * chunk), '-t', sec(chunk), '-i', src, '-map', '0:v:0', '-an', '-vf', `fps=${fps}:start_time=0,reverse,setpts=N/${fps}/TB,format=yuv420p`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-video_track_timescale', '90000', file]);
    // A sliver past the last frame makes an empty file; leave it out.
    if ((await stat(file).catch(() => null))?.size) list.push(`file '${file.replace(/'/g, "'\\''")}'`);
    ctx.progress((0.85 * (total - i)) / total);
  }
  const listFile = join(ctx.tmp, 'chunks.txt');
  await writeFile(listFile, list.join('\n'));
  const out = join(ctx.tmp, 'reversed.mp4');
  const audio = media.hasAudio ? ['-i', src] : [];
  const audioMap = media.hasAudio ? ['-map', '1:a:0', '-af', 'areverse', '-c:a', 'aac', '-b:a', '192k'] : [];
  await ffmpeg(['-v', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, ...audio, '-map', '0:v:0', ...audioMap, '-c:v', 'copy', '-movflags', '+faststart', out]);
  return asMedia(out, `${stem(media)}-reversed.mp4`);
}

// ---- Freeze frame, extract audio, denoise ----

export async function frame(media: Media, time: number, ctx: JobContext): Promise<JobOutput> {
  needs(media, 'picture');
  const out = join(ctx.tmp, 'frame.png');
  // Stay a little inside the end, where there is no frame to grab.
  const at = media.kind === 'video' ? Math.min(Math.max(0, time), Math.max(0, media.duration - 0.05)) : 0;
  await ffmpeg(['-v', 'error', '-ss', sec(at), '-i', mediaPath(media), '-map', '0:v:0', '-frames:v', '1', '-update', '1', out]);
  if (!existsSync(out)) throw new Error(`no frame at ${time}s`);
  return asMedia(out, `${stem(media)}-frame.png`);
}

export async function extractAudio(media: Media, ctx: JobContext): Promise<JobOutput> {
  needs(media, 'audio');
  const out = join(ctx.tmp, 'audio.m4a');
  await ffmpeg(['-v', 'error', '-i', mediaPath(media), '-map', '0:a:0', '-vn', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out], { duration: media.duration, onProgress: ctx.progress });
  return asMedia(out, `${stem(media)}.m4a`);
}

export async function denoise(media: Media, ctx: JobContext): Promise<JobOutput> {
  needs(media, 'audio');
  const video = media.kind === 'video';
  // Keep containers that cannot be remuxed to MP4 in Matroska.
  const ext = !video ? '.m4a' : ['.webm', '.mkv', '.avi'].includes(extname(media.file)) ? '.mkv' : '.mp4';
  const out = join(ctx.tmp, `denoised${ext}`);
  const streams = video ? ['-map', '0:v:0', '-map', '0:a:0', '-c:v', 'copy'] : ['-map', '0:a:0', '-vn'];
  await ffmpeg(['-v', 'error', '-i', mediaPath(media), ...streams, '-af', 'afftdn=nr=12:nf=-40:tn=1', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out], { duration: media.duration, onProgress: ctx.progress });
  return asMedia(out, `${stem(media)}-denoised${ext}`);
}

// ---- Stabilise ----

let filterList: Promise<string> | null = null;
/** Whether this ffmpeg build has a filter. */
async function hasFilter(name: string) {
  filterList ??= run(FFMPEG, ['-hide_banner', '-filters']).then((r) => r.stdout, () => '');
  return new RegExp(`^\\s*\\S+\\s+${name}\\s`, 'm').test(await filterList);
}

/** Two-pass vid.stab when the build has it, else the simpler one-pass `deshake`. Audio is copied. */
export async function stabilize(media: Media, ctx: JobContext): Promise<JobOutput> {
  needs(media, 'video');
  const src = mediaPath(media);
  const out = join(ctx.tmp, 'stabilized.mp4');
  const audio = media.hasAudio ? ['-map', '0:a:0', '-c:a', 'aac', '-b:a', '192k'] : [];
  const encode = ['-map', '0:v:0', ...audio, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out];
  // The output keeps the source's size (made even for H.264).
  const size = `scale=${Math.ceil(media.width / 2) * 2}:${Math.ceil(media.height / 2) * 2}`;
  let method = 'deshake';
  if ((await hasFilter('vidstabdetect')) && (await hasFilter('vidstabtransform'))) {
    method = 'vidstab';
    // The filter option parser needs a path without quotes or colons, so run inside the scratch directory.
    const trf = 'motion.trf';
    await ffmpeg(['-v', 'error', '-i', src, '-map', '0:v:0', '-vf', `vidstabdetect=shakiness=6:accuracy=12:result=${trf}`, '-f', 'null', '-'], { duration: media.duration, onProgress: (p) => ctx.progress(p * 0.45), cwd: ctx.tmp });
    await ffmpeg(['-v', 'error', '-i', src, '-vf', `vidstabtransform=input=${trf}:smoothing=20:zoom=4,unsharp=5:5:0.6:3:3:0.3,${size}`, ...encode], { duration: media.duration, onProgress: (p) => ctx.progress(0.45 + p * 0.55), cwd: ctx.tmp });
  } else {
    // A wide search and a slight zoom to hide the moving edges.
    await ffmpeg(['-v', 'error', '-i', src, '-vf', `deshake=rx=32:ry=32:edge=mirror,crop=iw/1.04:ih/1.04,${size}`, ...encode], { duration: media.duration, onProgress: ctx.progress });
  }
  const done = await asMedia(out, `${stem(media)}-stabilized.mp4`);
  return { ...done, result: { ...done.result, method } };
}

// ---- Voice effects ----

/** Shift the pitch by `ratio` and keep the length: resample to change pitch and speed together, then undo the speed. */
const pitch = (ratio: number) => `aresample=48000,asetrate=${Math.round(48000 * ratio)},aresample=48000,atempo=${(1 / ratio).toFixed(6)}`;

export const VOICE_EFFECTS = {
  deep: pitch(0.75),
  chipmunk: pitch(1.5),
  // A fixed frequency shift makes the voice inharmonic; a fast tremolo and a short metallic echo do the rest.
  robot: 'aresample=48000,afreqshift=shift=-120,tremolo=f=70:d=0.8,aecho=0.8:0.85:9|17:0.5|0.35,volume=1.3',
  echo: 'aecho=0.8:0.9:260|520:0.45|0.25',
  telephone: 'highpass=f=400,highpass=f=400,lowpass=f=3000,lowpass=f=3000,acompressor=threshold=-22dB:ratio=6,volume=1.6',
} as const;
export type VoiceEffect = keyof typeof VOICE_EFFECTS;

export function isVoiceEffect(v: unknown): v is VoiceEffect {
  return typeof v === 'string' && Object.hasOwn(VOICE_EFFECTS, v);
}

export async function voice(media: Media, effect: VoiceEffect, ctx: JobContext): Promise<JobOutput> {
  needs(media, 'audio');
  const video = media.kind === 'video';
  const ext = !video ? '.m4a' : ['.webm', '.mkv', '.avi'].includes(extname(media.file)) ? '.mkv' : '.mp4';
  const out = join(ctx.tmp, `voice${ext}`);
  const streams = video ? ['-map', '0:v:0', '-map', '0:a:0', '-c:v', 'copy'] : ['-map', '0:a:0', '-vn'];
  // Effects with a tail (echo) are cut at the source length, so the result still fits its clip.
  await ffmpeg(['-v', 'error', '-i', mediaPath(media), ...streams, '-af', `${VOICE_EFFECTS[effect]},apad,atrim=0:${sec(media.duration)}`, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', out], { duration: media.duration, onProgress: ctx.progress });
  return asMedia(out, `${stem(media)}-${effect}${ext}`);
}

// ---- Text to speech ----

export const TTS_MAX_CHARS = 2000;

/** The speech program on this machine: `say` on macOS, `espeak-ng` elsewhere, or null. */
export function ttsSetup() {
  const say = process.platform === 'darwin' ? findOnPath('say') : null;
  const espeak = say ? null : findOnPath('espeak-ng');
  return { say, espeak, ready: !!(say || espeak) };
}

let sayVoices: Promise<Set<string>> | null = null;
function installedVoices(say: string) {
  sayVoices ??= run(say, ['-v', '?']).then(
    (r) => new Set(r.stdout.split('\n').map((l) => l.split(/\s{2,}/)[0].trim()).filter(Boolean)),
    () => new Set<string>(),
  );
  return sayVoices;
}

export async function tts(text: string, language: 'hi' | 'en' | undefined, ctx: JobContext): Promise<JobOutput> {
  const setup = ttsSetup();
  if (!setup.ready) throw new Error('text to speech is not set up: it needs `say` (macOS) or `espeak-ng` on PATH.');
  const hindi = language === 'hi' || /[\u0900-\u097F]/.test(text);
  const textFile = join(ctx.tmp, 'speech.txt');
  await writeFile(textFile, text);
  let raw: string;
  let voiceName = 'default';
  if (setup.say) {
    raw = join(ctx.tmp, 'speech.aiff');
    const voices = await installedVoices(setup.say);
    // Hindi: Lekha. Otherwise an Indian English voice. The system default when neither is installed.
    const pick = (hindi ? ['Lekha'] : ['Rishi', 'Aman', 'Tara', 'Veena']).find((v) => voices.has(v));
    if (pick) voiceName = pick;
    await run(setup.say, [...(pick ? ['-v', pick] : []), '-f', textFile, '-o', raw]);
  } else {
    raw = join(ctx.tmp, 'speech.wav');
    voiceName = hindi ? 'hi' : 'en-in';
    await run(setup.espeak!, ['-v', voiceName, '-f', textFile, '-w', raw]);
  }
  ctx.progress(0.8);
  const out = join(ctx.tmp, 'speech.m4a');
  await ffmpeg(['-v', 'error', '-i', raw, '-vn', '-ar', '48000', '-ac', '2', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out]);
  const done = await asMedia(out, 'voiceover.m4a');
  return { ...done, result: { ...done.result, voice: voiceName } };
}

// ---- Silence ----

export async function silence(media: Media, minSilence: number, thresholdDb: number, ctx: JobContext): Promise<JobOutput> {
  needs(media, 'audio');
  const { stderr } = await ffmpeg(['-i', mediaPath(media), '-map', '0:a:0', '-vn', '-af', `silencedetect=noise=${thresholdDb}dB:d=${minSilence}`, '-f', 'null', '-'], { duration: media.duration, onProgress: ctx.progress });
  const ranges: { start: number; end: number }[] = [];
  let open: number | null = null;
  for (const m of stderr.matchAll(/silence_(start|end): (-?[\d.]+)/g)) {
    const v = Math.max(0, Number(m[2]));
    if (m[1] === 'start') open = v;
    else if (open !== null) {
      ranges.push({ start: open, end: v });
      open = null;
    }
  }
  // Silence that runs to the end of the file has no closing line.
  if (open !== null && media.duration > open) ranges.push({ start: open, end: media.duration });
  return { result: { ranges } };
}

// ---- PCM helpers ----

/** Decode the first audio stream to mono float samples. */
async function pcm(media: Media, rate: number): Promise<Float32Array> {
  needs(media, 'audio');
  const { data } = await ffmpeg(['-v', 'error', '-i', mediaPath(media), '-map', '0:a:0', '-vn', '-ac', '1', '-ar', String(rate), '-f', 'f32le', 'pipe:1'], { binary: true });
  return new Float32Array(data.buffer, data.byteOffset, Math.floor(data.byteLength / 4));
}

export async function waveform(media: Media, samples: number, _ctx: JobContext): Promise<JobOutput> {
  const data = await pcm(media, 8000);
  const count = Math.max(1, Math.min(20000, Math.round(samples)));
  const peaks = new Array<number>(count).fill(0);
  for (let i = 0; i < data.length; i++) {
    const b = Math.min(count - 1, Math.floor((i * count) / data.length));
    const v = Math.abs(data[i]);
    if (v > peaks[b]) peaks[b] = v;
  }
  const max = Math.max(...peaks);
  return { result: { peaks: peaks.map((p) => (max > 0 ? Number((p / max).toFixed(4)) : 0)) } };
}

// ---- Beats ----

/**
 * Beat times from an energy onset envelope: find the tempo by autocorrelation
 * (60 to 180 BPM), the phase that collects the most onset energy, then walk the
 * grid snapping each beat to the nearest onset peak. Falls back to plain onset
 * peaks when no tempo stands out.
 */
export function detectBeats(data: Float32Array, rate: number): number[] {
  const hop = Math.round(rate / 100);
  const win = hop * 2;
  const n = Math.floor((data.length - win) / hop);
  if (n < 8) return [];
  const frameRate = rate / hop;
  const energy = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = i * hop; j < i * hop + win; j++) sum += data[j] * data[j];
    energy[i] = Math.log1p(1000 * Math.sqrt(sum / win));
  }
  // Onset strength: how much louder this frame is than the last, with the local average taken off.
  const onset = new Float32Array(n);
  for (let i = 1; i < n; i++) onset[i] = Math.max(0, energy[i] - energy[i - 1]);
  const around = Math.round(frameRate * 0.5);
  const flat = new Float32Array(n);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - around); j < Math.min(n, i + around); j++) { sum += onset[j]; count++; }
    flat[i] = Math.max(0, onset[i] - sum / count);
    peak = Math.max(peak, flat[i]);
  }
  if (peak <= 0) return [];
  const floor = peak * 0.12;
  const localMax = (from: number, to: number) => {
    let best = -1;
    for (let i = Math.max(1, from); i <= Math.min(n - 2, to); i++) {
      if (flat[i] >= floor && flat[i] >= flat[i - 1] && flat[i] >= flat[i + 1] && (best < 0 || flat[i] > flat[best])) best = i;
    }
    return best;
  };

  // Tempo.
  const minLag = Math.round((frameRate * 60) / 180);
  const maxLag = Math.min(Math.round(frameRate * 1), Math.floor(n / 2));
  let self = 0;
  for (let i = 0; i < n; i++) self += flat[i] * flat[i];
  let lag = 0;
  let best = 0;
  for (let l = minLag; l <= maxLag; l++) {
    let sum = 0;
    for (let i = 0; i + l < n; i++) sum += flat[i] * flat[i + l];
    // Mild preference for tempos near 120 BPM, to settle octave ties.
    const bpm = (60 * frameRate) / l;
    const score = (sum / self) * Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.9) ** 2);
    if (score > best) { best = score; lag = l; }
  }

  const times: number[] = [];
  if (lag && best > 0.08) {
    let phase = 0;
    let phaseScore = -1;
    for (let p = 0; p < lag; p++) {
      let sum = 0;
      for (let i = p; i < n; i += lag) sum += flat[i];
      if (sum > phaseScore) { phaseScore = sum; phase = p; }
    }
    const reach = Math.max(1, Math.round(lag * 0.15));
    for (let at = phase; at < n; at += lag) {
      const hit = localMax(at - reach, at + reach);
      // Follow the music when it drifts off the grid; skip beats that fall in silence.
      if (hit >= 0) { times.push(hit / frameRate); at = hit; }
    }
  } else {
    const gap = Math.round(frameRate * 0.25);
    for (let i = 0; i < n; ) {
      const hit = localMax(i, i + gap);
      if (hit < 0) { i += gap + 1; continue; }
      times.push(hit / frameRate);
      i = hit + gap;
    }
  }
  // The envelope is centred on its analysis window.
  return times.map((t) => Number((t + win / 2 / rate).toFixed(3)));
}

export async function beats(media: Media, _ctx: JobContext): Promise<JobOutput> {
  const rate = 11025;
  return { result: { beats: detectBeats(await pcm(media, rate), rate) } };
}

// ---- Transcription (whisper.cpp) ----

function findOnPath(name: string) {
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    for (const ext of process.platform === 'win32' ? ['.exe', ''] : ['']) {
      const file = join(dir, name + ext);
      if (dir && existsSync(file)) return file;
    }
  }
  return null;
}

/** The whisper.cpp binary and model, or null for whichever is missing. */
export function whisperSetup() {
  const binary = findOnPath('whisper-cli');
  let model: string | null = null;
  if (process.env.WHISPER_MODEL) model = existsSync(process.env.WHISPER_MODEL) ? process.env.WHISPER_MODEL : null;
  else if (existsSync(MODELS_DIR)) {
    const first = readdirSync(MODELS_DIR).filter((f) => f.endsWith('.bin')).sort()[0];
    model = first ? join(MODELS_DIR, first) : null;
  }
  // The "turbo" Whisper models were not trained to translate: with `-tr` they still write the spoken language.
  const canTranslate = (file: string) => !/turbo/i.test(basename(file));
  let translateModel: string | null = null;
  const wanted = process.env.WHISPER_TRANSLATE_MODEL;
  if (wanted) translateModel = existsSync(wanted) ? wanted : null;
  else if (model && canTranslate(model)) translateModel = model;
  else if (existsSync(MODELS_DIR)) {
    const other = readdirSync(MODELS_DIR).filter((f) => f.endsWith('.bin') && canTranslate(f)).sort()[0];
    translateModel = other ? join(MODELS_DIR, other) : null;
  }
  return { binary, model, translateModel, ready: !!binary && !!model, translateReady: !!binary && !!translateModel };
}

type WhisperJson = { result?: { language?: string }; transcription?: { offsets?: { from: number; to: number }; text?: string }[] };

/** Turn whisper.cpp's one-word-per-segment output into words; stray punctuation joins the word before. */
export function wordsFromWhisper(json: WhisperJson) {
  const words: { t0: number; t1: number; text: string }[] = [];
  for (const seg of json.transcription ?? []) {
    const text = (seg.text ?? '').trim();
    if (!text || !seg.offsets || /^\[.*\]$/.test(text)) continue;
    const t0 = seg.offsets.from / 1000;
    const t1 = seg.offsets.to / 1000;
    const last = words[words.length - 1];
    const joins = /^[.,!?;:।'’)\]%]+$/.test(text);
    if (last && joins) {
      last.text += text;
      last.t1 = Math.max(last.t1, t1);
    } else {
      words.push({ t0, t1, text });
    }
  }
  return words;
}

/** Longest a word may be stretched to when its timing has to be made up. */
const MAX_GUESSED_WORD = 0.6;

/**
 * Whisper sometimes gives several words in a row the same instant (t0 == t1),
 * typically after a pause. Spread each such run evenly over the gap up to the next
 * word that starts later, then make the whole list monotonic with t1 > t0.
 */
export function fixWordTimings(input: { t0: number; t1: number; text: string }[], duration = Infinity) {
  const words = input.map((w) => ({ ...w }));
  // Whisper can end the last word at the end of its 30 s window, past the end of the audio.
  for (const w of words) {
    w.t0 = Math.min(w.t0, duration);
    w.t1 = Math.min(w.t1, duration);
  }
  for (let i = 1; i < words.length; i++) words[i].t0 = Math.max(words[i].t0, words[i - 1].t0);
  const empty = (w: { t0: number; t1: number }) => w.t1 - w.t0 < 0.01;
  for (let i = 0; i < words.length; i++) {
    if (!empty(words[i])) continue;
    let j = i;
    while (j + 1 < words.length && empty(words[j + 1])) j++;
    const count = j - i + 1;
    const start = words[i].t0;
    const next = words.slice(j + 1).find((w) => w.t0 > start + 0.01);
    const end = Math.max(start, Math.min(next ? next.t0 : Infinity, duration, start + count * MAX_GUESSED_WORD));
    const step = (end - start) / count;
    for (let k = 0; k < count; k++) {
      words[i + k].t0 = start + k * step;
      words[i + k].t1 = start + (k + 1) * step;
    }
    i = j;
  }
  // Whatever is left: no word starts before the one before it ends, and none is shorter than 20 ms.
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (i > 0) w.t0 = Math.max(w.t0, words[i - 1].t1);
    if (w.t1 < w.t0 + 0.02) w.t1 = w.t0 + 0.02;
    w.t0 = Number(w.t0.toFixed(3));
    w.t1 = Number(Math.max(w.t1, w.t0 + 0.02).toFixed(3));
  }
  return words;
}

export async function transcribe(media: Media, language: string | undefined, translate: boolean, ctx: JobContext): Promise<JobOutput> {
  const setup = whisperSetup();
  if (!setup.binary || !setup.model) {
    const missing = !setup.binary ? '`whisper-cli` is not on PATH' : 'no model file was found at $WHISPER_MODEL or pipeline/work/models/*.bin';
    throw new Error(`transcription is not set up: ${missing}. See "Transcription" in pipeline/README.md.`);
  }
  const model = translate ? setup.translateModel : setup.model;
  if (!model) {
    throw new Error('translation is not set up: the installed Whisper model is a "turbo" one, which cannot translate. Add a non-turbo model (for example ggml-medium.bin or ggml-large-v3.bin) to pipeline/work/models, or point $WHISPER_TRANSLATE_MODEL at one.');
  }
  needs(media, 'audio');
  const wav = join(ctx.tmp, 'speech.wav');
  await ffmpeg(['-v', 'error', '-i', mediaPath(media), '-map', '0:a:0', '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav]);
  ctx.progress(0.05);
  const prefix = join(ctx.tmp, 'speech');
  const lang = language && /^[a-z]{2,3}$/i.test(language) ? language.toLowerCase() : 'auto';
  // One word per segment (`-ml 1 -sow`), written as JSON next to the audio; progress is printed to stderr.
  // `-tr` has whisper write English whatever was spoken; the language it reports is still the spoken one.
  const args = ['-m', model, '-f', wav, '-l', lang, '-ml', '1', '-sow', '-oj', '-of', prefix, '-pp', ...(translate ? ['-tr'] : [])];
  await new Promise<void>((resolve, reject) => {
    const child = spawn(setup.binary!, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (c: Buffer) => {
      stderr = (stderr + c.toString()).slice(-4000);
      const m = [...c.toString().matchAll(/progress\s*=\s*(\d+)%/g)].pop();
      if (m) ctx.progress(0.05 + 0.95 * (Number(m[1]) / 100));
    });
    child.on('error', (e) => reject(new Error(`whisper-cli could not be started: ${e.message}`)));
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`whisper-cli exited with code ${code}: ${stderr.trim().split('\n').slice(-6).join('\n')}`))));
  });
  const json = JSON.parse(await readFile(`${prefix}.json`, 'utf8')) as WhisperJson;
  return { result: { words: fixWordTimings(wordsFromWhisper(json), media.duration || Infinity), language: json.result?.language ?? lang, ...(translate ? { translated: true } : {}) } };
}
