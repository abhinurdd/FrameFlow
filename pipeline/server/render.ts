/**
 * Export: Edit JSON in, MP4 out. Decoders feed raw frames to the painter, the painted
 * frames are piped to one H.264 encoder, and the mixed audio is muxed alongside.
 */

import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';

import { createCanvas, type Canvas } from '@napi-rs/canvas';

import { chromaPixel, type Chroma } from '../../src/engine/chroma.ts';
import { ptsExpression } from '../../src/engine/speed.ts';
import { activeAt, aspectRatio, mainFrameAt, totalDuration, type Edit, type Location, type Overlay, type Segment } from '../../src/engine/timeline.ts';

import { audioClips, mixAudio } from './audio.ts';
import { Painter, type FramePictures, type Picture } from './draw.ts';
import { FFMPEG } from './ff.ts';
import { decodeStill, FrameReader, orientedSize, UPRIGHT, type Orientation } from './frames.ts';
import { getMedia, HttpError, mediaPath, type Media } from './media.ts';

/** `height` is the output height in pixels. The app sends 720/1080/1440/2160 for landscape and the matching long side for portrait. */
export type RenderSettings = { height: number; fps: 24 | 30 | 60; bitrateMbps?: number };
export type RenderResult = { width: number; height: number; fps: number; duration: number; frames: number; bytes: number; renderSeconds: number };

const MIN_HEIGHT = 144;
const MAX_SIDE = 4320;
const RATES = [24, 30, 60];

export function checkSettings(input: unknown): RenderSettings {
  const s = (input ?? {}) as Partial<RenderSettings>;
  if (!(typeof s.height === 'number' && Number.isFinite(s.height) && s.height >= MIN_HEIGHT && s.height <= MAX_SIDE)) throw new HttpError(400, `settings.height must be a pixel height between ${MIN_HEIGHT} and ${MAX_SIDE}`);
  if (!RATES.includes(s.fps as number)) throw new HttpError(400, `settings.fps must be one of ${RATES.join(', ')}`);
  if (s.bitrateMbps !== undefined && !(typeof s.bitrateMbps === 'number' && s.bitrateMbps > 0 && s.bitrateMbps <= 200)) throw new HttpError(400, 'settings.bitrateMbps must be a number between 0 and 200');
  return { height: s.height, fps: s.fps!, bitrateMbps: s.bitrateMbps };
}

const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);

/** Output size: the requested pixel height, the width from the edit's aspect ratio, both even. */
export function canvasSize(edit: Edit, height: number) {
  const W = even(height * aspectRatio(edit));
  if (W > MAX_SIDE) throw new HttpError(400, `a height of ${height} makes the output ${W} pixels wide; the limit is ${MAX_SIDE}`);
  return { W, H: even(height) };
}

/** Find the uploaded media behind every asset the edit uses. Throws a 400 naming what is missing. */
export async function resolveAssets(edit: Edit): Promise<Map<string, Media>> {
  if (!edit || typeof edit !== 'object' || !Array.isArray(edit.main) || !edit.assets) throw new HttpError(400, 'edit is missing or malformed');
  const used = new Set<string>([...edit.main.map((s) => s.assetId), ...edit.overlays.flatMap((o) => (o.assetId ? [o.assetId] : [])), ...edit.audio.map((a) => a.assetId)]);
  const out = new Map<string, Media>();
  for (const id of used) {
    const asset = edit.assets[id];
    if (!asset) throw new HttpError(400, `edit uses asset "${id}", which is not in edit.assets`);
    if (!asset.remoteId) throw new HttpError(400, `asset "${id}" (${asset.name ?? asset.uri}) has no remoteId: upload it with POST /media first`);
    const media = await getMedia(asset.remoteId);
    if (!media) throw new HttpError(400, `asset "${id}" points at media "${asset.remoteId}", which is not on this server`);
    out.set(id, media);
  }
  return out;
}

/** Scale a source down to the largest size it is drawn at; never up. */
function decodeSize(width: number, height: number, drawnWidth: number) {
  const k = Math.min(1, drawnWidth / width);
  return { width: Math.max(2, Math.round(width * k)), height: Math.max(2, Math.round(height * k)) };
}

/** Largest scale an item reaches, for picking a decode size. Capped: beyond 2x it is upscaled. */
function peakScale(item: { transform: { scale: number }; keyframes: { scale: number }[] }) {
  const scales = item.keyframes.length ? item.keyframes.map((k) => k.scale) : [item.transform.scale];
  return Math.min(2, Math.max(1, ...scales));
}

/** Green-screen removal: the engine's `chromaPixel` on every pixel of a picture. */
function keyOut(image: Canvas, chroma: Chroma, into?: Canvas): Canvas {
  const { width, height } = image;
  const data = image.getContext('2d').getImageData(0, 0, width, height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const [r, g, b, a] = chromaPixel(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255, chroma);
    px[i] = r * 255;
    px[i + 1] = g * 255;
    px[i + 2] = b * 255;
    px[i + 3] = px[i + 3] * a;
  }
  const out = into ?? createCanvas(width, height);
  out.getContext('2d').putImageData(data, 0, 0);
  return out;
}

/** Opens and advances the decoders the edit needs, frame by frame. */
class Sources {
  private readers = new Map<string, { reader: FrameReader; first: number; picture: Picture }>();
  private stills = new Map<string, Promise<Picture>>();
  private keyed = new Map<string, Picture>();
  private keyCanvas = new Map<string, Canvas>();

  constructor(private edit: Edit, private media: Map<string, Media>, private W: number, private H: number, private fps: number) {}

  private still(media: Media, o: Orientation, drawnWidth: number): Promise<Picture> {
    const natural = orientedSize(media.width, media.height, o.rotation);
    const size = decodeSize(natural.width, natural.height, drawnWidth);
    const key = [media.id, o.rotation, o.flipH, o.flipV, size.width].join(':');
    let hit = this.stills.get(key);
    if (!hit) {
      hit = decodeStill(mediaPath(media), size.width, size.height, o).then((image) => ({ image, ...natural, alpha: true }));
      this.stills.set(key, hit);
    }
    return hit;
  }

  private async video(key: string, frame: number, media: Media, from: number, speed: number, o: Orientation, drawnWidth: number, pts?: string): Promise<Picture | null> {
    let entry = this.readers.get(key);
    if (!entry) {
      const natural = orientedSize(media.width, media.height, o.rotation);
      const size = decodeSize(natural.width, natural.height, drawnWidth);
      const reader = new FrameReader({ file: mediaPath(media), from, speed, pts, fps: this.fps, orientation: o, ...size });
      entry = { reader, first: frame, picture: { image: reader.canvas, ...natural } };
      this.readers.set(key, entry);
    }
    const image = await entry.reader.seek(frame - entry.first);
    return image ? entry.picture : null;
  }

  /** Width in pixels a main segment's picture is drawn at, at its largest. */
  private segmentWidth(s: Segment, media: Media) {
    const natural = orientedSize(media.width, media.height, s.rotation);
    const k = s.fit === 'cover' ? Math.max(this.W / natural.width, this.H / natural.height) : Math.min(this.W / natural.width, this.H / natural.height);
    return natural.width * k * peakScale(s);
  }

  private async segment(at: Location, frame: number): Promise<Picture | null> {
    const s = at.segment;
    const media = this.media.get(s.assetId);
    if (!media || media.kind === 'audio') return null;
    const o: Orientation = { rotation: s.rotation, flipH: s.flipH, flipV: s.flipV };
    const width = this.segmentWidth(s, media);
    if (media.kind === 'image') return this.still(media, o, width);
    // The engine says which source time this frame shows; the decoder runs on from there.
    return this.video(`main:${at.index}`, frame, media, at.sourceTime, s.speed, o, width, s.curve ? ptsExpression(s, at.sourceTime) : undefined);
  }

  private async overlay(o: Overlay, t: number, frame: number): Promise<Picture | null> {
    const media = o.assetId ? this.media.get(o.assetId) : undefined;
    if (!media || media.kind === 'audio') return null;
    // Base width is half the canvas; a circle mask covers a square, so size by the short side.
    const cover = o.mask === 'circle' ? Math.max(1, media.width / media.height) : 1;
    const width = 0.5 * this.W * peakScale(o) * cover;
    const moving = o.kind === 'video' && media.kind === 'video';
    const picture = moving ? await this.video(`overlay:${o.id}`, frame, media, o.in + (t - o.start), 1, UPRIGHT, width) : await this.still(media, UPRIGHT, width);
    if (!picture || !o.chroma) return picture;
    // A keyed still is the same every frame; a keyed video is redone for each.
    const cached = moving ? undefined : this.keyed.get(o.id);
    if (cached) return cached;
    const keyed = { ...picture, image: keyOut(picture.image, o.chroma, moving ? this.keyCanvas.get(o.id) : undefined), alpha: true };
    if (moving) this.keyCanvas.set(o.id, keyed.image);
    else this.keyed.set(o.id, keyed);
    return keyed;
  }

  async at(t: number, frame: number): Promise<FramePictures> {
    const main = mainFrameAt(this.edit, t);
    const overlays = activeAt(this.edit.overlays, t).filter((o) => o.kind !== 'sticker');
    const [a, b, ...over] = await Promise.all([
      main ? this.segment(main.a, frame) : null,
      main?.b ? this.segment(main.b, frame) : null,
      ...overlays.map((o) => this.overlay(o, t, frame)),
    ]);
    // Decoders for clips that are over are no longer needed.
    const live = new Set<string>(overlays.map((o) => `overlay:${o.id}`));
    if (main) live.add(`main:${main.a.index}`);
    if (main?.b) live.add(`main:${main.b.index}`);
    for (const [key, entry] of this.readers) {
      if (!live.has(key)) {
        entry.reader.close();
        this.readers.delete(key);
      }
    }
    const pictures = new Map<string, Picture>();
    overlays.forEach((o, i) => { const p = over[i]; if (p) pictures.set(o.id, p); });
    return { frame: main, a, b, overlays: pictures };
  }

  close() {
    for (const { reader } of this.readers.values()) reader.close();
    this.readers.clear();
  }
}

/** The H.264 encoder: raw RGBA frames on stdin, muxed with the finished audio file. */
function startEncoder(W: number, H: number, settings: RenderSettings, audioFile: string, outFile: string) {
  const rate = settings.bitrateMbps
    ? ['-b:v', `${settings.bitrateMbps}M`, '-maxrate', `${settings.bitrateMbps * 1.5}M`, '-bufsize', `${settings.bitrateMbps * 2}M`]
    : ['-crf', '20'];
  const args = [
    '-hide_banner', '-nostdin', '-y', '-v', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(settings.fps), '-i', 'pipe:0',
    '-i', audioFile,
    '-map', '0:v:0', '-map', '1:a:0',
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'veryfast', ...rate,
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-c:a', 'copy', '-movflags', '+faststart', outFile,
  ];
  const child = spawn(FFMPEG, args, { stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '';
  let failure: Error | null = null;
  child.stderr.on('data', (c: Buffer) => { stderr = (stderr + c.toString()).slice(-4000); });
  const closed = new Promise<void>((resolve) => {
    child.on('error', (e) => { failure = new Error(`ffmpeg could not be started: ${e.message}`); resolve(); });
    child.on('close', (code) => {
      if (code !== 0) failure ??= new Error(`encoder exited with code ${code}: ${stderr.trim()}`);
      resolve();
    });
  });
  // A failed write is reported by `write`; without a handler it would crash the process.
  child.stdin.on('error', () => {});
  return {
    /** Resolves once the bytes have left this process, so the canvas can be reused. */
    write: (frame: Buffer) => new Promise<void>((resolve, reject) => child.stdin.write(frame, (err) => (err ? reject(err) : resolve()))),
    /** Close the input and wait for the file to be finished. */
    async finish() {
      child.stdin.end();
      await closed;
      if (failure) throw failure;
    },
    /** After an error: stop the encoder and return its own error, if it was the one that failed. */
    async abort(): Promise<Error | null> {
      await Promise.race([closed, new Promise((r) => setTimeout(r, 300))]);
      const own = failure;
      child.kill('SIGKILL');
      await closed;
      return own;
    },
  };
}

export async function renderEdit(edit: Edit, settings: RenderSettings, outFile: string, tmpDir: string, onProgress: (p: number) => void = () => {}): Promise<RenderResult> {
  const began = Date.now();
  const media = await resolveAssets(edit);
  const total = totalDuration(edit);
  if (!(total > 0)) throw new HttpError(400, 'the edit is empty');
  const { W, H } = canvasSize(edit, settings.height);
  const frames = Math.max(1, Math.round(total * settings.fps));

  const audioFile = join(tmpDir, 'audio.m4a');
  await mixAudio(audioClips(edit, (id) => media.get(id)), total, audioFile, tmpDir);
  onProgress(0.02);

  const painter = new Painter(edit, W, H);
  const sources = new Sources(edit, media, W, H, settings.fps);
  const encoder = startEncoder(W, H, settings, audioFile, outFile);
  try {
    for (let n = 0; n < frames; n++) {
      const t = n / settings.fps;
      const pictures = await sources.at(t, n);
      await encoder.write(painter.draw(t, pictures));
      if (n % 5 === 0) onProgress(0.02 + 0.97 * (n / frames));
    }
    await encoder.finish();
  } catch (e) {
    throw (await encoder.abort()) ?? e;
  } finally {
    sources.close();
  }
  const { size } = await stat(outFile);
  return { width: W, height: H, fps: settings.fps, duration: frames / settings.fps, frames, bytes: size, renderSeconds: (Date.now() - began) / 1000 };
}
