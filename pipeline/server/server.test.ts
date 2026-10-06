/**
 * End-to-end tests for the media server: synthetic sources are made with ffmpeg,
 * uploaded over HTTP, rendered, and the output is probed and sampled.
 * Sample frames land in pipeline/work/samples/ for a visual check.
 */

import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createCanvas } from '@napi-rs/canvas';

import { IDENTITY, NO_ANIMATION, setKeyframe } from '../../src/engine/animate.ts';
import { DEFAULT_CHROMA } from '../../src/engine/chroma.ts';
import { offsetAt, playDuration } from '../../src/engine/speed.ts';
import { compileLook, FILTERS, gradePixel, NO_ADJUST, NO_LOOK, type Look } from '../../src/engine/looks.ts';
import {
  addAssets,
  addItem,
  appendAssets,
  aspectRatio,
  blankEdit,
  captionsFromWords,
  DEFAULT_TEXT_STYLE,
  mainFrameAt,
  newAudio,
  newOverlay,
  newSegment,
  newText,
  patchItem,
  patchSegment,
  setTransition,
  totalDuration,
  type Asset,
  type Edit,
} from '../../src/engine/timeline.ts';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const WORK = join(HERE, '..', 'work');
const SAMPLES = join(WORK, 'samples');
const FIXTURES = join(WORK, 'test', 'fixtures');
// Keep test uploads out of the real media store. Must be set before the server modules load.
process.env.FRAMEFLOW_WORK = join(WORK, 'test');

const { createApp } = await import('./index.ts');
const { ffmpeg, run, FFPROBE } = await import('./ff.ts');
const { Painter } = await import('./draw.ts');
const { gainExpression } = await import('./audio.ts');
const { detectBeats, fixWordTimings, wordsFromWhisper } = await import('./tools.ts');
// The test work dir has no models; use the real one when it is installed, so the whisper path is exercised.
if (!process.env.WHISPER_MODEL && existsSync(join(WORK, 'models'))) {
  const model = readdirSync(join(WORK, 'models')).filter((f) => f.endsWith('.bin')).sort()[0];
  if (model) process.env.WHISPER_MODEL = join(WORK, 'models', model);
}
const { canvasSize } = await import('./render.ts');

type Info = { id: string; kind: 'video' | 'image' | 'audio'; duration: number; width: number; height: number };

let base = '';
const app = createApp();
const assets: Record<string, Asset> = {};

/** A WAV with a short click every `interval` seconds. */
function clickTrack(seconds: number, interval: number) {
  const rate = 22050;
  const n = Math.round(seconds * rate);
  const pcm = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const since = (i / rate) % interval;
    const v = since < 0.03 ? Math.sin(2 * Math.PI * 1000 * since) * Math.exp(-since * 150) : 0;
    pcm.writeInt16LE(Math.round(v * 30000), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function upload(file: string): Promise<Info> {
  const res = await fetch(`${base}/media`, { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-filename': file }, body: await readFile(join(FIXTURES, file)) });
  assert.equal(res.status, 200, await res.clone().text());
  return (await res.json()) as Info;
}

async function post(path: string, body: object) {
  const res = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

/** Run a job to the end and return its final state. */
async function job(path: string, body: object) {
  const started = await post(path, body);
  assert.equal(started.status, 200, JSON.stringify(started.body));
  const id = started.body.jobId as string;
  let last = 0;
  for (;;) {
    const state = (await (await fetch(`${base}/jobs/${id}`)).json()) as { status: string; progress: number; error?: string; result?: any };
    assert.ok(state.progress >= last, 'progress never goes backwards');
    last = state.progress;
    if (state.status === 'done' || state.status === 'error') return { id, ...state };
    await new Promise((r) => setTimeout(r, 50));
  }
}

type Rendered = { file: string; streams: any[]; duration: number; result: any };

async function render(name: string, edit: Edit, settings?: object): Promise<Rendered> {
  // As the app does: "720p" names the short side, and the pixel height is sent.
  const done = await job('/render', { edit, settings: settings ?? { height: aspectRatio(edit) >= 1 ? 720 : Math.round(720 / aspectRatio(edit) / 2) * 2, fps: 30 } });
  assert.equal(done.status, 'done', done.error ?? '');
  const res = await fetch(`${base}/jobs/${done.id}/file`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'video/mp4');
  const file = join(SAMPLES, `${name}.mp4`);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  const probe = JSON.parse((await run(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file])).stdout);
  return { file, streams: probe.streams, duration: Number(probe.format.duration), result: done.result };
}

function expectOutput(r: Rendered, width: number, height: number, duration: number) {
  const video = r.streams.find((s) => s.codec_type === 'video');
  const audio = r.streams.find((s) => s.codec_type === 'audio');
  assert.equal(video.codec_name, 'h264');
  assert.equal(video.pix_fmt, 'yuv420p');
  assert.deepEqual([video.width, video.height], [width, height]);
  assert.equal(video.avg_frame_rate, '30/1');
  assert.ok(audio, 'has an audio stream');
  assert.equal(audio.codec_name, 'aac');
  assert.equal(Number(audio.sample_rate), 48000);
  assert.equal(audio.channels, 2);
  assert.ok(Math.abs(r.duration - duration) < 0.08, `duration ${r.duration} should be about ${duration}`);
  assert.ok(Math.abs(Number(audio.duration) - duration) < 0.08, `audio duration ${audio.duration} should be about ${duration}`);
}

type Frame = { width: number; height: number; at: (x: number, y: number) => [number, number, number] };

/** Decode the frame at `t`, save it as a PNG sample, and return a pixel reader (x, y as fractions). */
async function frameAt(r: Rendered, t: number, label: string): Promise<Frame> {
  const video = r.streams.find((s) => s.codec_type === 'video');
  const { width, height } = video;
  await ffmpeg(['-v', 'error', '-ss', String(t), '-i', r.file, '-frames:v', '1', '-update', '1', join(SAMPLES, `${label}.png`)]);
  const { data } = await ffmpeg(['-v', 'error', '-ss', String(t), '-i', r.file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { binary: true });
  return {
    width,
    height,
    at: (x, y) => {
      const i = (Math.min(height - 1, Math.round(y * height)) * width + Math.min(width - 1, Math.round(x * width))) * 3;
      return [data[i], data[i + 1], data[i + 2]];
    },
  };
}

const saturation = ([r, g, b]: number[]) => Math.max(r, g, b) - Math.min(r, g, b);

/** RMS level of the output's audio between two times. */
async function loudness(file: string, from: number, to: number) {
  const { data } = await ffmpeg(['-v', 'error', '-ss', String(from), '-t', String(to - from), '-i', file, '-vn', '-ac', '1', '-ar', '8000', '-f', 'f32le', 'pipe:1'], { binary: true });
  const pcm = new Float32Array(data.buffer, data.byteOffset, Math.floor(data.byteLength / 4));
  let sum = 0;
  for (const v of pcm) sum += v * v;
  return Math.sqrt(sum / Math.max(1, pcm.length));
}

const make = (args: string[]) => ffmpeg(['-v', 'error', ...args]);

before(async () => {
  await rm(join(WORK, 'test'), { recursive: true, force: true });
  await mkdir(FIXTURES, { recursive: true });
  await mkdir(SAMPLES, { recursive: true });
  const x264 = ['-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac'];
  await Promise.all([
    make(['-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=30:d=6', '-f', 'lavfi', '-i', 'sine=f=440:d=6', ...x264, join(FIXTURES, 'land.mp4')]),
    make(['-f', 'lavfi', '-i', 'smptebars=s=720x1280:r=30:d=5', '-f', 'lavfi', '-i', 'sine=f=880:d=5', ...x264, join(FIXTURES, 'port.mp4')]),
    make(['-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=30:d=2', ...x264, '-an', join(FIXTURES, 'flat.mp4')]),
    make(['-f', 'lavfi', '-i', 'testsrc2=s=800x600:r=1:d=1', '-frames:v', '1', '-update', '1', join(FIXTURES, 'still.png')]),
    make(['-f', 'lavfi', '-i', 'sine=f=220:d=8', '-ac', '2', join(FIXTURES, 'music.wav')]),
    make(['-f', 'lavfi', '-i', 'sine=f=300:d=1', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono:d=1', '-f', 'lavfi', '-i', 'sine=f=300:d=1', '-filter_complex', '[0][1][2]concat=n=3:v=0:a=1', join(FIXTURES, 'gaps.wav')]),
    writeFile(join(FIXTURES, 'clicks.wav'), clickTrack(8, 0.5)),
    // A green screen: a red square in the middle of pure key green.
    make(['-f', 'lavfi', '-i', 'color=c=0x00D000:s=640x360:r=30:d=3', '-vf', 'drawbox=x=220:y=80:w=200:h=200:color=red:t=fill', ...x264, '-an', join(FIXTURES, 'green.mp4')]),
  ]);
  // The same landscape pixels, flagged as shot with the phone turned.
  await make(['-display_rotation', '90', '-i', join(FIXTURES, 'flat.mp4'), '-c', 'copy', join(FIXTURES, 'turned.mp4')]);

  await new Promise<void>((resolve) => app.listen(0, resolve));
  base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
  for (const file of ['land.mp4', 'port.mp4', 'turned.mp4', 'green.mp4', 'still.png', 'music.wav', 'gaps.wav', 'clicks.wav']) {
    const info = await upload(file);
    const id = file.split('.')[0];
    assets[id] = { id, uri: `file:///${file}`, kind: info.kind, duration: info.duration, width: info.width, height: info.height, name: file, remoteId: info.id };
  }
});

after(async () => {
  await new Promise((resolve) => app.close(resolve));
  // Fixtures and test uploads go; the samples stay for a look.
  await rm(join(WORK, 'test'), { recursive: true, force: true });
});

const fresh = (aspect: Edit['aspect'] = '9:16') => ({ ...blankEdit('e', 'Test', 0), aspect });

test('upload probes kind, duration and display size, and serves ranges', async () => {
  assert.deepEqual([assets.land.kind, assets.land.width, assets.land.height], ['video', 1280, 720]);
  assert.ok(Math.abs(assets.land.duration - 6) < 0.1);
  assert.deepEqual([assets.port.kind, assets.port.width, assets.port.height], ['video', 720, 1280]);
  // Rotation metadata swaps the stored 640x360.
  assert.deepEqual([assets.turned.width, assets.turned.height], [360, 640]);
  assert.deepEqual([assets.still.kind, assets.still.duration, assets.still.width, assets.still.height], ['image', 0, 800, 600]);
  assert.deepEqual([assets.music.kind, assets.music.width], ['audio', 0]);
  assert.ok(Math.abs(assets.music.duration - 8) < 0.05);

  const whole = await readFile(join(FIXTURES, 'still.png'));
  const part = await fetch(`${base}/media/${assets.still.remoteId}`, { headers: { range: 'bytes=10-19' } });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), `bytes 10-19/${whole.length}`);
  assert.deepEqual(Buffer.from(await part.arrayBuffer()), whole.subarray(10, 20));
  const full = await fetch(`${base}/media/${assets.still.remoteId}`);
  assert.equal(full.headers.get('content-type'), 'image/png');
  assert.equal((await full.arrayBuffer()).byteLength, whole.length);

  const bad = await fetch(`${base}/media`, { method: 'POST', headers: { 'x-filename': 'notes.txt' }, body: 'hello' });
  assert.equal(bad.status, 400);
  assert.equal((await fetch(`${base}/media/0123456789abcdef`)).status, 404);
  const health = (await (await fetch(`${base}/health`)).json()) as { ok: boolean; whisper: boolean };
  assert.equal(health.ok, true);
  assert.equal(typeof health.whisper, 'boolean');
});

test('render rejects bad requests up front', async () => {
  const edit = appendAssets(fresh(), [assets.land], ['s1']);
  assert.equal((await post('/render', { edit, settings: { height: 20, fps: 30 } })).status, 400);
  assert.equal((await post('/render', { edit, settings: { height: 720, fps: 25 } })).status, 400);
  assert.equal((await post('/render', { edit: { ...edit, aspect: '21:9' }, settings: { height: 2160, fps: 30 } })).status, 400);
  const missing = appendAssets(fresh(), [{ ...assets.land, remoteId: undefined }], ['s1']);
  const res = await post('/render', { edit: missing, settings: { height: 720, fps: 30 } });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /remoteId/);
  const empty = await job('/render', { edit: fresh(), settings: { height: 720, fps: 30 } });
  assert.equal(empty.status, 'error');
  assert.match(empty.error!, /empty/);
});

test('output size: the pixel height and the edit\'s aspect, both even', () => {
  assert.deepEqual(canvasSize(fresh('9:16'), 1280), { W: 720, H: 1280 });
  assert.deepEqual(canvasSize(fresh('16:9'), 1080), { W: 1920, H: 1080 });
  assert.deepEqual(canvasSize(fresh('1:1'), 720), { W: 720, H: 720 });
  assert.deepEqual(canvasSize(fresh('4:5'), 1350), { W: 1080, H: 1350 });
  assert.deepEqual(canvasSize(fresh('21:9'), 720), { W: 1680, H: 720 });
  assert.deepEqual(canvasSize(appendAssets(fresh('original'), [assets.turned], ['s']), 1280), { W: 720, H: 1280 });
});

test('two segments with a transition and a speed change', async () => {
  let edit = appendAssets(fresh(), [assets.land, assets.port], ['s1', 's2']);
  edit = patchSegment(edit, 's1', { in: 0, out: 3, speed: 2 });
  edit = patchSegment(edit, 's2', { in: 0, out: 2 });
  edit = setTransition(edit, 's1', { type: 'wipe-left', duration: 0.5 });
  assert.equal(totalDuration(edit), 3);
  const r = await render('transition', edit);
  expectOutput(r, 720, 1280, 3);

  // Mid-wipe (progress 0.5): B (colour bars, full frame) shows on the right half, A (letterboxed) on the left.
  assert.equal(mainFrameAt(edit, 1.25)!.progress, 0.5);
  const mid = await frameAt(r, 1.25, 'transition-wipe-mid');
  assert.ok(saturation(mid.at(0.25, 0.05)) < 30 && Math.max(...mid.at(0.25, 0.05)) < 30, 'left top is A\'s black letterbox');
  assert.ok(Math.max(...mid.at(0.75, 0.05)) > 100, 'right top is B, which fills the frame');
  const afterwards = await frameAt(r, 2.5, 'transition-after');
  assert.ok(Math.max(...afterwards.at(0.25, 0.05)) > 100, 'B fills the frame once the wipe is over');

  // Speed 2: the 440 Hz tone is still 440 Hz (pitch kept), and it is there at all.
  assert.ok((await loudness(r.file, 0.2, 0.8)) > 0.02);
});

test('speed maps frames to the right source time', async () => {
  // testsrc2 prints nothing we can read, but a fast clip must end on the same picture as a slow one.
  const slow = patchSegment(appendAssets(fresh('16:9'), [assets.land], ['s1']), 's1', { in: 2, out: 4, speed: 1 });
  const fast = patchSegment(appendAssets(fresh('16:9'), [assets.land], ['s1']), 's1', { in: 0, out: 4, speed: 4 });
  const a = await render('speed-1x', slow);
  const b = await render('speed-4x', fast);
  expectOutput(a, 1280, 720, 2);
  expectOutput(b, 1280, 720, 1);
  // Source time 3.0 is frame 30 of the slow render and frame 22.5 of the fast one; compare 3.2 s (t=1.2 and t=0.8).
  const fa = await frameAt(a, 1.2, 'speed-1x-src3.2');
  const fb = await frameAt(b, 0.8, 'speed-4x-src3.2');
  let diff = 0;
  let count = 0;
  for (let y = 0.05; y < 1; y += 0.1) for (let x = 0.05; x < 1; x += 0.1) { diff += Math.abs(fa.at(x, y)[0] - fb.at(x, y)[0]) + Math.abs(fa.at(x, y)[1] - fb.at(x, y)[1]); count += 2; }
  assert.ok(diff / count < 12, `frames at the same source time should match (mean difference ${diff / count})`);
});

test('rotation with cover fit, and a mono look', async () => {
  const plain = patchSegment(appendAssets(fresh(), [assets.land], ['s1']), 's1', { out: 1, rotation: 90, fit: 'cover' });
  const mono = patchSegment(plain, 's1', { look: { ...NO_LOOK, filter: 'mono' } });
  const a = await render('rotate-cover', plain);
  const b = await render('rotate-cover-mono', mono);
  expectOutput(a, 720, 1280, 1);
  const colour = await frameAt(a, 0.5, 'rotate-cover');
  const grey = await frameAt(b, 0.5, 'rotate-cover-mono');
  const points = [0.1, 0.3, 0.5, 0.7, 0.9].flatMap((y) => [0.1, 0.5, 0.9].map((x) => [x, y] as const));
  // A 1280x720 source turned 90 degrees is exactly 9:16: cover fills every corner.
  assert.ok(points.every(([x, y]) => Math.max(...colour.at(x, y)) > 20), 'the turned frame covers the canvas');
  const before = Math.max(...points.map(([x, y]) => saturation(colour.at(x, y))));
  const after = Math.max(...points.map(([x, y]) => saturation(grey.at(x, y))));
  assert.ok(before > 100, `the source is colourful (${before})`);
  assert.ok(after < 14, `mono leaves no colour (${after})`);
});

test('rotation metadata on the source is respected', async () => {
  const edit = patchSegment(appendAssets(fresh('original'), [assets.turned], ['s1']), 's1', { out: 1 });
  const r = await render('turned-source', edit);
  expectOutput(r, 720, 1280, 1);
  const f = await frameAt(r, 0.5, 'turned-source');
  assert.ok(Math.max(...f.at(0.05, 0.5)) > 20 && Math.max(...f.at(0.95, 0.5)) > 20, 'the picture fills the portrait canvas');
});

test('every look draws the same colour as the engine\'s gradePixel', () => {
  const colours: [number, number, number][] = [[0.8, 0.3, 0.1], [0.1, 0.5, 0.9], [0.5, 0.5, 0.5], [0.95, 0.9, 0.2], [0.05, 0.1, 0.05]];
  const looks: Look[] = [
    ...FILTERS.map((f) => ({ ...NO_LOOK, filter: f.id })),
    { filter: 'none', strength: 1, adjust: { ...NO_ADJUST, brightness: -0.4, contrast: -0.5, saturation: 0.6, tint: -0.5 } },
    { filter: 'film', strength: 0.5, adjust: { ...NO_ADJUST, temperature: -0.3, fade: 0.4 } },
  ];
  let worst = 0;
  for (const look of looks) {
    for (const rgb of colours) {
      const image = createCanvas(64, 64);
      const c = image.getContext('2d');
      c.fillStyle = `rgb(${rgb.map((v) => Math.round(v * 255)).join(',')})`;
      c.fillRect(0, 0, 64, 64);
      const asset: Asset = { id: 'a', uri: '', kind: 'video', duration: 1, width: 64, height: 64 };
      const edit = { ...addAssets(fresh('1:1'), [asset]), main: [{ ...newSegment('s', asset), look }] };
      const painter = new Painter(edit, 64, 64);
      const out = painter.draw(0, { frame: mainFrameAt(edit, 0), a: { image, width: 64, height: 64 }, b: null, overlays: new Map() });
      const i = (32 * 64 + 32) * 4;
      // Compare against 8-bit input, as the canvas sees it.
      const want = gradePixel(rgb.map((v) => Math.round(v * 255) / 255) as [number, number, number], compileLook(look));
      for (let ch = 0; ch < 3; ch++) worst = Math.max(worst, Math.abs(out[i + ch] - want[ch] * 255));
    }
  }
  assert.ok(worst <= 3, `canvas and gradePixel agree to within 3/255 (worst ${worst.toFixed(2)})`);
});

test('everything at once: image segment, overlays, sticker, text, captions, effects, keyframes', async () => {
  let edit = appendAssets(fresh(), [assets.still, assets.land], ['s1', 's2']);
  edit = { ...edit, background: { type: 'blur' } };
  edit = patchSegment(edit, 's1', { out: 2, transition: { type: 'fade', duration: 0.4 } });
  edit = patchSegment(edit, 's2', { in: 1, out: 3.4, look: { ...NO_LOOK, filter: 'film' }, animation: { ...NO_ANIMATION, out: 'fade', outDuration: 0.4 } });
  assert.equal(totalDuration(edit), 4);
  edit = addAssets(edit, [assets.port, assets.music]);

  // A round, screen-blended video overlay near the top, and a rounded image overlay.
  edit = addItem(edit, 'overlays', { ...newOverlay('o1', 0.5, { asset: assets.port }), duration: 3, mask: 'circle', blend: 'screen', transform: { ...IDENTITY, y: -0.3, scale: 0.8 }, volume: 0.5 });
  edit = addItem(edit, 'overlays', { ...newOverlay('o2', 0, { asset: assets.still }), duration: 4, mask: 'rounded', flipH: true, look: { ...NO_LOOK, filter: 'noir' }, transform: { ...IDENTITY, x: 0.28, y: 0.3, scale: 0.6, rotation: 12 } });
  // A sticker that slides from left to right.
  const slide = setKeyframe(setKeyframe([], 0, { ...IDENTITY, x: -0.3, y: 0.3, scale: 0.5 }, 'linear'), 4, { ...IDENTITY, x: -0.1, y: 0.3, scale: 0.7, rotation: 40 }, 'linear');
  edit = addItem(edit, 'overlays', { ...newOverlay('o3', 0, { emoji: '🔥' }), duration: 4, keyframes: slide });

  // Text: stroke + shadow, an orange boxed block that moves, and a rotated italic serif.
  edit = addItem(edit, 'texts', { ...newText('t1', 0, 'नमस्ते दोस्तों! Welcome to FrameFlow, क्या स्त्री शक्ति है'), duration: 4, transform: { ...IDENTITY, y: -0.05 }, style: { ...DEFAULT_TEXT_STYLE, strokeColor: '#000000', color: '#FFE14D', size: 26 } });
  const move = setKeyframe(setKeyframe([], 0, { ...IDENTITY, x: -0.25, y: 0.12 }, 'linear'), 4, { ...IDENTITY, x: 0.25, y: 0.12 }, 'linear');
  edit = addItem(edit, 'texts', { ...newText('t2', 0, 'BOX'), duration: 4, keyframes: move, style: { ...DEFAULT_TEXT_STYLE, background: '#FF8000', color: '#FF8000', shadow: false, size: 20 } });
  edit = addItem(edit, 'texts', { ...newText('t3', 0, 'Serif italic\nकहानी शुरू'), duration: 4, transform: { ...IDENTITY, y: -0.42, rotation: -6 }, style: { ...DEFAULT_TEXT_STYLE, font: 'serif', weight: 'bold', italic: true, background: '#1B1464', size: 20, letterSpacing: 1 }, animation: { ...NO_ANIMATION, in: 'pop', inDuration: 0.5 } });
  edit = addItem(edit, 'texts', { ...newText('t4', 0, 'mono left\naligned · रेखा'), duration: 4, transform: { ...IDENTITY, x: 0.05, y: 0.44 }, style: { ...DEFAULT_TEXT_STYLE, font: 'mono', weight: 'regular', align: 'left', uppercase: true, size: 14 } });
  edit = addItem(edit, 'texts', { ...newText('t5', 0, 'Rounded बलू'), duration: 4, transform: { ...IDENTITY, x: 0.22, y: 0.44 }, style: { ...DEFAULT_TEXT_STYLE, font: 'rounded', size: 18, color: '#7CFFCB' } });

  // Karaoke captions, two words a line.
  let n = 0;
  const words = ['yeh', 'ek', 'शानदार', 'कहानी', 'hai', 'dosto', 'bilkul', 'sahi'].map((text, i) => ({ t0: i * 0.5, t1: i * 0.5 + 0.45, text }));
  edit = { ...edit, captions: captionsFromWords(words, 2, () => `c${n++}`), captionStyle: { template: 'karaoke', size: 22, y: 0.7 } };

  edit = addItem(edit, 'audio', { ...newAudio('m1', 0, assets.music, 'music'), in: 1, out: 5, volume: 0.8, fadeIn: 1, fadeOut: 1 });
  edit = addItem(edit, 'effects', { id: 'fx1', type: 'letterbox', start: 2.5, duration: 1.5 });
  edit = addItem(edit, 'effects', { id: 'fx2', type: 'zoom', start: 0, duration: 2 });

  const r = await render('everything', edit);
  expectOutput(r, 720, 1280, 4);

  const early = await frameAt(r, 0.75, 'everything-0.75');
  const fade = await frameAt(r, 1.8, 'everything-1.80-transition');
  const late = await frameAt(r, 3.2, 'everything-3.20');
  await frameAt(r, 3.85, 'everything-3.85-fade-out');
  void fade;

  // The keyframed orange box moves from left of centre to right of centre.
  const boxX = (f: Frame) => {
    let sum = 0;
    let count = 0;
    for (let x = 0; x < 1; x += 0.005) {
      const [red, green, blue] = f.at(x, 0.62);
      if (red > 225 && green > 100 && green < 160 && blue < 50) { sum += x; count++; }
    }
    return count ? sum / count : NaN;
  };
  assert.ok(Math.abs(boxX(early) - (0.5 - 0.25 + 0.5 * (0.75 / 4))) < 0.02, `box at ${boxX(early)} early`);
  assert.ok(Math.abs(boxX(late) - (0.5 - 0.25 + 0.5 * (3.2 / 4))) < 0.02, `box at ${boxX(late)} late`);

  // Letterbox: bars of 12% top and bottom while the effect is on, none before.
  assert.ok(Math.max(...late.at(0.95, 0.03), ...late.at(0.02, 0.99), ...late.at(0.95, 0.11), ...late.at(0.02, 0.89)) < 12, 'bars are black');
  assert.ok(Math.max(...late.at(0.95, 0.14)) > 12, 'and end at 12% of the height');
  assert.ok(Math.max(...early.at(0.95, 0.03)) > 12, 'no bar before the effect');

  // Karaoke: the active word is yellow, the other white. At 0.75 s the line is "yeh ek" with "ek" active.
  const tones = (f: Frame) => {
    let yellow = 0;
    let white = 0;
    for (let y = 0.67; y < 0.73; y += 0.002) for (let x = 0.35; x < 0.65; x += 0.002) {
      const [red, green, blue] = f.at(x, y);
      if (red > 230 && green > 180 && blue < 120) yellow++;
      else if (red > 235 && green > 235 && blue > 235) white++;
    }
    return { yellow, white };
  };
  const t = tones(early);
  assert.ok(t.yellow > 50 && t.white > 50, `one highlighted and one plain word (${JSON.stringify(t)})`);

  // Music fades in over the first second (the main track is a silent image there, the overlay starts at 0.5).
  const quiet = await loudness(r.file, 0.05, 0.25);
  const loud = await loudness(r.file, 1.2, 1.8);
  assert.ok(loud > 0.05 && quiet < loud * 0.35, `fade in: ${quiet} then ${loud}`);
});

test('audio: fades follow fadeGain, mute silences, crossfade keeps level', async () => {
  // A silent picture with one tone on top: the output level is the item's gain.
  let edit = patchSegment(appendAssets(fresh('1:1'), [assets.still], ['s1']), 's1', { out: 4 });
  edit = addAssets(edit, [assets.music]);
  edit = addItem(edit, 'audio', { ...newAudio('m1', 0, assets.music, 'music'), in: 0, out: 4, fadeIn: 2, fadeOut: 1 });
  const r = await render('audio-fades', edit);
  expectOutput(r, 720, 720, 4);
  const full = await loudness(r.file, 2.4, 2.8);
  assert.ok(full > 0.05, 'tone is present at full level');
  // fadeGain at 0.5 s of a 2 s fade in is 0.25; at 3.5 s of a 1 s fade out it is 0.5.
  assert.ok(Math.abs((await loudness(r.file, 0.45, 0.55)) / full - 0.25) < 0.04);
  assert.ok(Math.abs((await loudness(r.file, 3.45, 3.55)) / full - 0.5) < 0.05);

  const muted = await render('audio-muted', patchItem(edit, 'audio', 'm1', { muted: true }));
  expectOutput(muted, 720, 720, 4);
  assert.ok((await loudness(muted.file, 0.5, 3.5)) < 0.001, 'muted item leaves silence, but still an audio track');

  // Two clips of the same tone crossfading: the level dips at most a little in the middle.
  let cross = appendAssets(fresh('16:9'), [assets.land, assets.land], ['a', 'b']);
  cross = patchSegment(patchSegment(cross, 'a', { out: 2, volume: 0.5 }), 'b', { in: 2, out: 4, volume: 0.5 });
  cross = setTransition(cross, 'a', { type: 'fade', duration: 1 });
  const c = await render('audio-crossfade', cross);
  expectOutput(c, 1280, 720, 3);
  const steady = await loudness(c.file, 0.3, 0.7);
  const middle = await loudness(c.file, 1.3, 1.7);
  assert.ok(steady > 0.02 && middle > steady * 0.5 && middle < steady * 1.3, `crossfade level ${middle} vs ${steady}`);
});

test('the gain expression is fadeGain written for ffmpeg', () => {
  assert.equal(gainExpression(1, 0, 0, 5), '1');
  assert.equal(gainExpression(0.5, 2, 1, 4), '0.5*min(clip(t/2,0,1),clip((4-t)/1,0,1))');
  assert.equal(gainExpression(1, 0, 0, 3, 0.5, 0.25), '1*clip(t/0.5,0,1)*clip((3-t)/0.25,0,1)');
});

test('1080p at 60 fps with a bitrate', async () => {
  const edit = patchSegment(appendAssets(fresh('16:9'), [assets.land], ['s1']), 's1', { out: 1 });
  const r = await render('hd60', edit, { height: 1080, fps: 60, bitrateMbps: 8 });
  const video = r.streams.find((s) => s.codec_type === 'video');
  assert.deepEqual([video.width, video.height, video.avg_frame_rate], [1920, 1080, '60/1']);
  assert.equal(r.result.frames, 60);
});

test('tools: reverse, frame, extract-audio, denoise', async () => {
  const reversed = await job('/tools/reverse', { mediaId: assets.land.remoteId });
  assert.equal(reversed.status, 'done', reversed.error ?? '');
  const media = reversed.result.media as Info;
  assert.deepEqual([media.kind, media.width, media.height], ['video', 1280, 720]);
  assert.ok(Math.abs(media.duration - 6) < 0.15, `reversed duration ${media.duration}`);
  // The reversed clip is new media: its first frame is the original's last.
  const still = async (id: string, time: number, label: string) => {
    const done = await job('/tools/frame', { mediaId: id, time });
    assert.equal(done.status, 'done', done.error ?? '');
    assert.deepEqual([done.result.media.kind, done.result.media.width, done.result.media.height], ['image', 1280, 720]);
    const png = Buffer.from(await (await fetch(`${base}/jobs/${done.id}/file`)).arrayBuffer());
    assert.deepEqual([...png.subarray(1, 4)], [0x50, 0x4e, 0x47]);
    await writeFile(join(SAMPLES, `${label}.png`), png);
    const { data } = await ffmpeg(['-v', 'error', '-i', join(SAMPLES, `${label}.png`), '-vf', 'scale=32:18', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { binary: true });
    return data;
  };
  const distance = (a: Buffer, b: Buffer) => a.reduce((sum, v, i) => sum + Math.abs(v - b[i]), 0) / a.length;
  const start = await still(assets.land.remoteId!, 0.5, 'tool-frame-original-0.5');
  const end = await still(assets.land.remoteId!, 5.5, 'tool-frame-original-5.5');
  const reversedStart = await still(media.id, 0.5, 'tool-frame-reversed-0.5');
  assert.ok(distance(reversedStart, end) < distance(reversedStart, start), 'reversed starts where the original ends');
  assert.ok(distance(reversedStart, end) < 6, `reversed 0.5 s matches original 5.5 s (${distance(reversedStart, end)})`);

  const extracted = await job('/tools/extract-audio', { mediaId: assets.land.remoteId });
  assert.equal(extracted.status, 'done', extracted.error ?? '');
  assert.equal(extracted.result.media.kind, 'audio');
  assert.ok(Math.abs(extracted.result.media.duration - 6) < 0.1);
  assert.equal((await fetch(`${base}/jobs/${extracted.id}/file`)).headers.get('content-type'), 'audio/mp4');

  const clean = await job('/tools/denoise', { mediaId: assets.land.remoteId });
  assert.equal(clean.status, 'done', clean.error ?? '');
  assert.deepEqual([clean.result.media.kind, clean.result.media.width], ['video', 1280]);
  assert.ok(Math.abs(clean.result.media.duration - 6) < 0.1);

  assert.equal((await post('/tools/frame', { mediaId: assets.land.remoteId })).status, 400);
  assert.equal((await post('/tools/reverse', { mediaId: 'nope' })).status, 404);
  assert.equal((await post('/tools/nothing', { mediaId: assets.land.remoteId })).status, 404);
});

test('tools: silence, beats, waveform', async () => {
  const quiet = await job('/tools/silence', { mediaId: assets.gaps.remoteId });
  assert.equal(quiet.status, 'done', quiet.error ?? '');
  const ranges = quiet.result.ranges as { start: number; end: number }[];
  assert.equal(ranges.length, 1);
  assert.ok(Math.abs(ranges[0].start - 1) < 0.05 && Math.abs(ranges[0].end - 2) < 0.05, JSON.stringify(ranges));

  const found = await job('/tools/beats', { mediaId: assets.clicks.remoteId });
  assert.equal(found.status, 'done', found.error ?? '');
  const beats = found.result.beats as number[];
  assert.ok(beats.length >= 14 && beats.length <= 17, `about 16 beats in 8 s at 120 BPM (${beats.length})`);
  for (let i = 1; i < beats.length; i++) assert.ok(Math.abs(beats[i] - beats[i - 1] - 0.5) < 0.03, `even spacing (${beats.join(', ')})`);
  assert.ok(beats.every((b) => Math.min(b % 0.5, 0.5 - (b % 0.5)) < 0.04), `on the clicks (${beats.join(', ')})`);

  const wave = await job('/tools/waveform', { mediaId: assets.gaps.remoteId, samples: 300 });
  assert.equal(wave.status, 'done', wave.error ?? '');
  const peaks = wave.result.peaks as number[];
  assert.equal(peaks.length, 300);
  assert.equal(Math.max(...peaks), 1);
  assert.ok(peaks[50] > 0.8 && peaks[150] < 0.05 && peaks[250] > 0.8, 'loud, silent, loud');
  assert.equal((await fetch(`${base}/jobs/${wave.id}/file`)).status, 404);
});

test('beat detection follows a tempo other than 120', () => {
  const rate = 11025;
  const data = new Float32Array(rate * 10);
  const interval = 60 / 96;
  for (let i = 0; i < data.length; i++) {
    const since = (i / rate) % interval;
    // A kick on every beat and a quieter off-beat hat.
    const hat = (i / rate + interval / 2) % interval;
    data[i] = (since < 0.05 ? Math.sin(2 * Math.PI * 80 * since) * Math.exp(-since * 60) : 0) + (hat < 0.01 ? 0.15 * Math.sin(2 * Math.PI * 3000 * hat) : 0);
  }
  const beats = detectBeats(data, rate);
  assert.ok(beats.length >= 14 && beats.length <= 17, `${beats.length} beats`);
  for (let i = 1; i < beats.length; i++) assert.ok(Math.abs(beats[i] - beats[i - 1] - interval) < 0.04, beats.join(', '));
});

test('transcribe reports when whisper is not set up, and parses whisper.cpp output', async () => {
  const health = (await (await fetch(`${base}/health`)).json()) as { whisper: boolean };
  if (!health.whisper) {
    const done = await job('/tools/transcribe', { mediaId: assets.land.remoteId, language: 'hi' });
    assert.equal(done.status, 'error');
    assert.match(done.error!, /transcription is not set up/);
  }
  const words = wordsFromWhisper({
    result: { language: 'hi' },
    transcription: [
      { offsets: { from: 0, to: 400 }, text: ' नमस्ते' },
      { offsets: { from: 400, to: 420 }, text: ',' },
      { offsets: { from: 500, to: 900 }, text: ' dosto' },
      { offsets: { from: 900, to: 1500 }, text: ' [BLANK_AUDIO]' },
    ],
  });
  assert.deepEqual(words, [{ t0: 0, t1: 0.42, text: 'नमस्ते,' }, { t0: 0.5, t1: 0.9, text: 'dosto' }]);
});

/** Download a job's file next to the samples and probe it. */
async function fetched(id: string, name: string) {
  const res = await fetch(`${base}/jobs/${id}/file`);
  assert.equal(res.status, 200);
  const file = join(SAMPLES, name);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  const probe = JSON.parse((await run(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file])).stdout);
  return { file, streams: probe.streams as any[], duration: Number(probe.format.duration) };
}

/** Dominant pitch of a steady tone, from its zero crossings. */
async function pitchOf(file: string, from: number, to: number) {
  const { data } = await ffmpeg(['-v', 'error', '-ss', String(from), '-t', String(to - from), '-i', file, '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', 'pipe:1'], { binary: true });
  const pcm = new Float32Array(data.buffer, data.byteOffset, Math.floor(data.byteLength / 4));
  let crossings = 0;
  for (let i = 1; i < pcm.length; i++) if (pcm[i - 1] < 0 !== pcm[i] < 0) crossings++;
  return crossings / 2 / (pcm.length / 16000);
}

test('tools: stabilize keeps size, length and audio', async () => {
  const done = await job('/tools/stabilize', { mediaId: assets.land.remoteId });
  assert.equal(done.status, 'done', done.error ?? '');
  assert.deepEqual([done.result.media.kind, done.result.media.width, done.result.media.height], ['video', 1280, 720]);
  assert.ok(Math.abs(done.result.media.duration - 6) < 0.1, `duration ${done.result.media.duration}`);
  assert.match(done.result.method, /^(vidstab|deshake)$/);
  const out = await fetched(done.id, 'tool-stabilized.mp4');
  assert.ok(out.streams.some((s) => s.codec_type === 'audio'), 'audio is kept');
  assert.ok((await loudness(out.file, 1, 2)) > 0.02);
  const audioOnly = await job('/tools/stabilize', { mediaId: assets.music.remoteId });
  assert.equal(audioOnly.status, 'error');
  assert.match(audioOnly.error!, /needs a video/);
});

test('tools: voice effects keep the length and change the sound', async () => {
  // music.wav is a steady 220 Hz tone, 8 s long.
  const original = join(FIXTURES, 'music.wav');
  assert.ok(Math.abs((await pitchOf(original, 2, 4)) - 220) < 3);
  const level = await loudness(original, 2, 4);
  for (const effect of ['deep', 'chipmunk', 'robot', 'echo', 'telephone']) {
    const done = await job('/tools/voice', { mediaId: assets.music.remoteId, effect });
    assert.equal(done.status, 'done', done.error ?? '');
    assert.equal(done.result.media.kind, 'audio');
    assert.ok(Math.abs(done.result.media.duration - 8) < 0.06, `${effect}: duration ${done.result.media.duration}`);
    const out = await fetched(done.id, `tool-voice-${effect}.m4a`);
    assert.equal(out.streams[0].codec_name, 'aac');
    assert.ok((await loudness(out.file, 2, 4)) > 0.004, `${effect} is not silent`);
    assert.ok((await loudness(out.file, 7, 7.9)) > 0.004, `${effect} lasts to the end`);
    const hz = await pitchOf(out.file, 2, 4);
    if (effect === 'deep') assert.ok(Math.abs(hz - 165) < 4, `deep is 220 x 0.75 (${hz})`);
    if (effect === 'chipmunk') assert.ok(Math.abs(hz - 330) < 6, `chipmunk is 220 x 1.5 (${hz})`);
    if (effect === 'robot') assert.ok(Math.abs(hz - 220) > 20, `robot shifts the tone (${hz})`);
    if (effect === 'echo') assert.ok(Math.abs(hz - 220) < 4, `echo keeps the pitch (${hz})`);
    // 220 Hz is below a telephone's band.
    if (effect === 'telephone') assert.ok((await loudness(out.file, 2, 4)) < level * 0.7, 'telephone cuts the low tone');
  }
  // Video in: the picture is copied, the sound replaced.
  const video = await job('/tools/voice', { mediaId: assets.land.remoteId, effect: 'chipmunk' });
  assert.equal(video.status, 'done', video.error ?? '');
  assert.deepEqual([video.result.media.kind, video.result.media.width, video.result.media.height], ['video', 1280, 720]);
  assert.ok(Math.abs(video.result.media.duration - 6) < 0.06);
  const out = await fetched(video.id, 'tool-voice-video.mp4');
  assert.ok(Math.abs((await pitchOf(out.file, 2, 4)) - 660) < 12, '440 Hz becomes 660 Hz');

  assert.equal((await post('/tools/voice', { mediaId: assets.music.remoteId, effect: 'alien' })).status, 400);
  assert.equal((await post('/tools/voice', { mediaId: assets.music.remoteId })).status, 400);
});

test('tools: text to speech', async () => {
  const health = (await (await fetch(`${base}/health`)).json()) as { tts: boolean };
  assert.equal(typeof health.tts, 'boolean');
  assert.equal((await post('/tools/tts', { text: 'x'.repeat(2001) })).status, 400);
  assert.equal((await post('/tools/tts', { text: '   ' })).status, 400);
  assert.equal((await post('/tools/tts', { text: 'hello', language: 'fr' })).status, 400);
  if (!health.tts) {
    const done = await job('/tools/tts', { text: 'hello' });
    assert.equal(done.status, 'error');
    assert.match(done.error!, /text to speech is not set up/);
    return;
  }
  const cases = [
    { name: 'hi', body: { text: 'नमस्ते दोस्तों, आज हम एक नई कहानी सुनेंगे।', language: 'hi' } },
    { name: 'hi-detected', body: { text: 'यह कहानी बहुत अच्छी है।' } },
    { name: 'en', body: { text: 'Hello friends, welcome back to the channel.', language: 'en' } },
  ];
  for (const c of cases) {
    const done = await job('/tools/tts', c.body);
    assert.equal(done.status, 'done', done.error ?? '');
    assert.equal(done.result.media.kind, 'audio');
    assert.ok(done.result.media.duration > 1 && done.result.media.duration < 15, `${c.name}: ${done.result.media.duration} s`);
    const out = await fetched(done.id, `tool-tts-${c.name}.m4a`);
    assert.deepEqual([out.streams[0].codec_name, Number(out.streams[0].sample_rate)], ['aac', 48000]);
    assert.ok((await loudness(out.file, 0.3, done.result.media.duration - 0.3)) > 0.01, `${c.name} is audible`);
    console.log(`  tts ${c.name}: voice ${done.result.voice}, ${done.result.media.duration.toFixed(2)} s`);
  }
});

test('word timings: zero-length runs are spread, and the list is monotonic', () => {
  const fixed = fixWordTimings([
    { t0: 7.0, t1: 7.4, text: 'a' },
    { t0: 7.8, t1: 7.8, text: 'b' },
    { t0: 7.8, t1: 7.8, text: 'c' },
    { t0: 7.8, t1: 7.8, text: 'd' },
    { t0: 8.4, t1: 8.9, text: 'e' },
    { t0: 8.9, t1: 8.9, text: 'f' },
    { t0: 12, t1: 12.5, text: 'g' },
    { t0: 11.9, t1: 12.6, text: 'h' },
    { t0: 13, t1: 13, text: 'i' },
    { t0: 13, t1: 13, text: 'j' },
  ], 13.5);
  assert.deepEqual(fixed.slice(0, 5).map((w) => [w.t0, w.t1]), [[7, 7.4], [7.8, 8], [8, 8.2], [8.2, 8.4], [8.4, 8.9]]);
  // A lone zero-length word before a long pause is capped at 0.6 s.
  assert.deepEqual([fixed[5].t0, fixed[5].t1], [8.9, 9.5]);
  assert.deepEqual(fixWordTimings([{ t0: 2, t1: 30, text: 'last' }], 3.1), [{ t0: 2, t1: 3.1, text: 'last' }]);
  // A run at the very end stays inside the audio.
  assert.deepEqual(fixed.slice(8).map((w) => [w.t0, w.t1]), [[13, 13.25], [13.25, 13.5]]);
  for (let i = 0; i < fixed.length; i++) {
    assert.ok(fixed[i].t1 > fixed[i].t0, `word ${i} has a length`);
    if (i) assert.ok(fixed[i].t0 >= fixed[i - 1].t1, `word ${i} starts after word ${i - 1} ends`);
  }
  assert.deepEqual(fixed.map((w) => w.text).join(''), 'abcdefghij');
});

test('transcribe with translate returns English words and the spoken language', async (t) => {
  const health = (await (await fetch(`${base}/health`)).json()) as { whisper: boolean; tts: boolean; translate: boolean };
  if (!health.whisper || !health.tts) return t.skip('needs whisper-cli with a model, and text to speech');
  const spoken = await job('/tools/tts', { text: 'नमस्ते दोस्तों। आज मौसम बहुत अच्छा है और मैं बाज़ार जा रहा हूँ।', language: 'hi' });
  assert.equal(spoken.status, 'done', spoken.error ?? '');
  const check = (words: { t0: number; t1: number; text: string }[]) => {
    assert.ok(words.length >= 4, `${words.length} words`);
    words.forEach((w, i) => {
      assert.ok(w.t1 > w.t0, `word ${i} has a length`);
      if (i) assert.ok(w.t0 >= words[i - 1].t1, `word ${i} is in order`);
      assert.ok(w.t1 <= spoken.result.media.duration + 0.05, `word ${i} ends inside the audio (${w.t1})`);
    });
  };
  const plain = await job('/tools/transcribe', { mediaId: spoken.result.media.id, language: 'hi' });
  assert.equal(plain.status, 'done', plain.error ?? '');
  check(plain.result.words);
  assert.equal(plain.result.language, 'hi');
  const english = await job('/tools/transcribe', { mediaId: spoken.result.media.id, translate: true });
  if (!health.translate) {
    // Only a turbo model is installed, and those cannot translate: say so rather than return Hindi.
    assert.equal(english.status, 'error');
    assert.match(english.error!, /translation is not set up/);
    return t.diagnostic('translation itself was not run: no non-turbo Whisper model is installed');
  }
  assert.equal(english.status, 'done', english.error ?? '');
  check(english.result.words);
  assert.equal(english.result.language, 'hi');
  const text = english.result.words.map((w: { text: string }) => w.text).join(' ');
  console.log(`  hindi:   ${plain.result.words.map((w: { text: string }) => w.text).join(' ')}`);
  console.log(`  english: ${text}`);
  assert.ok(!/[\u0900-\u097F]/.test(text), 'translated words are not in Devanagari');
  assert.match(text, /[A-Za-z]{3}/);
});

test('a speed curve changes the length and lands frames where the engine says', async () => {
  const curve = [1, 4, 1];
  const base = patchSegment(appendAssets(fresh('16:9'), [assets.land], ['s1']), 's1', { in: 0, out: 6 });
  const curved = patchSegment(base, 's1', { curve });
  const seg = curved.main[0];
  const r = await render('curve', curved);
  expectOutput(r, 1280, 720, playDuration(seg));
  // The picture at source time 3.0 (the fastest point) appears at the engine's offset for it.
  const plain = await render('curve-plain', base);
  const want = await frameAt(plain, 3.0, 'curve-src3-plain');
  const got = await frameAt(r, offsetAt(seg, 3.0), 'curve-src3');
  let diff = 0;
  let count = 0;
  for (let y = 0.05; y < 1; y += 0.1) for (let x = 0.05; x < 1; x += 0.1) { diff += Math.abs(want.at(x, y)[0] - got.at(x, y)[0]) + Math.abs(want.at(x, y)[1] - got.at(x, y)[1]); count += 2; }
  assert.ok(diff / count < 14, `frames at the same source time should match (mean difference ${diff / count})`);
  // Sound runs the whole length.
  assert.ok((await loudness(r.file, 0.1, 0.5)) > 0.05 && (await loudness(r.file, r.duration - 0.5, r.duration - 0.1)) > 0.05);
});

test('chroma key: the green goes, the subject stays', async () => {
  const main = appendAssets(fresh('16:9'), [assets.land], ['s1']);
  const overlay = { ...newOverlay('o1', 0, { asset: assets.green }), duration: 2, transform: { ...IDENTITY, scale: 2 } };
  const plain = await render('chroma-off', addItem(addAssets(main, [assets.green]), 'overlays', overlay));
  const keyed = await render('chroma-on', addItem(addAssets(main, [assets.green]), 'overlays', { ...overlay, chroma: DEFAULT_CHROMA }));
  const off = await frameAt(plain, 1, 'chroma-off');
  const on = await frameAt(keyed, 1, 'chroma-on');
  const under = await frameAt(await render('chroma-under', main), 1, 'chroma-under');
  // Top-left corner: green without the key, the video underneath with it.
  const [r0, g0, b0] = off.at(0.05, 0.08);
  assert.ok(g0 > 150 && r0 < 80 && b0 < 80, `expected green, got ${[r0, g0, b0]}`);
  const a = on.at(0.05, 0.08);
  const b = under.at(0.05, 0.08);
  assert.ok(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 40, `expected the video underneath ${b}, got ${a}`);
  // Centre: the red square survives.
  const [r1, g1] = on.at(0.5, 0.5);
  assert.ok(r1 > 180 && g1 < 80, `expected red, got ${[r1, g1]}`);
});

test('chroma key on a main clip shows the canvas background', async () => {
  const base = appendAssets(fresh('16:9'), [assets.green], ['s1']);
  const edit: Edit = { ...patchSegment(base, 's1', { chroma: DEFAULT_CHROMA, fit: 'cover' }), background: { type: 'color', color: '#0000FF' } };
  const on = await frameAt(await render('chroma-main', edit), 1, 'chroma-main');
  // Corner: the green is gone and the blue background shows.
  const [r0, g0, b0] = on.at(0.05, 0.08);
  assert.ok(b0 > 180 && g0 < 80 && r0 < 80, `expected blue, got ${[r0, g0, b0]}`);
  // Centre: the red square survives.
  const [r1, g1] = on.at(0.5, 0.5);
  assert.ok(r1 > 180 && g1 < 80, `expected red, got ${[r1, g1]}`);
});

test('a diamond mask cuts the corners off an overlay', async () => {
  const main = appendAssets(fresh('16:9'), [assets.land], ['s1']);
  const overlay = { ...newOverlay('o1', 0, { asset: assets.green }), duration: 2, transform: { ...IDENTITY, scale: 1.6 } };
  const edit = addItem(addAssets(main, [assets.green]), 'overlays', { ...overlay, mask: 'diamond' as const });
  const on = await frameAt(await render('mask-diamond', edit), 1, 'mask-diamond');
  const under = await frameAt(await render('mask-under', main), 1, 'mask-under');
  const whole = await frameAt(await render('mask-none', addItem(addAssets(main, [assets.green]), 'overlays', overlay)), 1, 'mask-none');
  // The overlay's box is a square 0.8 of the frame width, centred. Near its corner the diamond is cut away.
  const diff = (p: number[], q: number[]) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]);
  const a = on.at(0.15, 0.1);
  const b = under.at(0.15, 0.1);
  assert.ok(diff(a, b) < 25, `expected the video underneath ${b}, got ${a}`);
  assert.ok(diff(whole.at(0.15, 0.1), b) > 30, 'the unmasked overlay should cover that corner');
  // The middle still shows the overlay's red square.
  const [r1, g1] = on.at(0.5, 0.5);
  assert.ok(r1 > 180 && g1 < 80, `expected red, got ${[r1, g1]}`);
});

test('a video overlay blends with what is under it', async () => {
  const main = appendAssets(fresh('16:9'), [assets.land], ['s1']);
  const overlay = { ...newOverlay('o1', 0, { asset: assets.green }), duration: 2, transform: { ...IDENTITY, scale: 2 } };
  const edit = (blend: 'normal' | 'multiply') => addItem(addAssets(main, [assets.green]), 'overlays', { ...overlay, blend });
  const plain = await frameAt(await render('blend-normal', edit('normal')), 1, 'blend-normal');
  const mixed = await frameAt(await render('blend-multiply', edit('multiply')), 1, 'blend-multiply');
  const under = await frameAt(await render('blend-under', main), 1, 'blend-under');
  const p = plain.at(0.05, 0.08);
  const m = mixed.at(0.05, 0.08);
  const u = under.at(0.05, 0.08);
  // Multiplying by green keeps at most the green of what is underneath, and never brightens.
  assert.ok(Math.abs(m[1] - p[1]) > 15 || Math.abs(m[0] - p[0]) > 15 || u[1] > 200, `blend made no difference: ${m} vs ${p}`);
  assert.ok(m[0] <= u[0] + 8 && m[1] <= u[1] + 8 && m[2] <= u[2] + 8, `multiply brightened ${u} to ${m}`);
});
