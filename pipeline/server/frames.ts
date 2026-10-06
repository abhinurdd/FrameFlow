/**
 * Decoded pictures for the compositor: a video source is an ffmpeg child that
 * writes raw RGBA frames at the output frame rate to a pipe; a still is decoded once.
 * Rotation metadata is applied by ffmpeg, so frames always arrive upright.
 */

import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';

import { createCanvas, ImageData, type Canvas } from '@napi-rs/canvas';

import { FFMPEG, ffmpeg, sec } from './ff.ts';

export type Orientation = { rotation: 0 | 90 | 180 | 270; flipH: boolean; flipV: boolean };
export const UPRIGHT: Orientation = { rotation: 0, flipH: false, flipV: false };

/** As in the app: the source is flipped first, then turned clockwise by quarter turns. */
function orientFilters(o: Orientation) {
  const out: string[] = [];
  if (o.flipH) out.push('hflip');
  if (o.flipV) out.push('vflip');
  if (o.rotation === 90) out.push('transpose=clock');
  if (o.rotation === 180) out.push('hflip', 'vflip');
  if (o.rotation === 270) out.push('transpose=cclock');
  return out;
}

export function orientedSize(width: number, height: number, rotation: number) {
  return rotation % 180 !== 0 ? { width: height, height: width } : { width, height };
}

function toCanvas(data: Buffer, width: number, height: number, into?: Canvas) {
  const canvas = into ?? createCanvas(width, height);
  const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  canvas.getContext('2d').putImageData(new ImageData(pixels, width, height), 0, 0);
  return canvas;
}

export type VideoSource = {
  file: string;
  /** Source time of the first frame wanted. */
  from: number;
  speed: number;
  fps: number;
  orientation: Orientation;
  /** Size of the frames to produce (after orientation). */
  width: number;
  height: number;
};

/** Sequential frames of one clip. Frame `n` is the picture `n / fps` output seconds after `from`. */
export class FrameReader {
  readonly canvas: Canvas;
  private child: ChildProcessByStdio<null, Readable, Readable>;
  private chunks: AsyncIterator<Buffer>;
  private rest: Buffer | null = null;
  private buffer: Buffer;
  private index = -1;
  private ended = false;
  private stderr = '';
  /** False until a first frame has arrived; a clip past the end of its source never has one. */
  hasFrame = false;

  constructor(private source: VideoSource) {
    const { file, from, speed, fps, orientation, width, height } = source;
    const filters = [
      `setpts=PTS/${speed}`,
      // Constant output rate; `start_time=0` holds the first picture from the seek point.
      `fps=fps=${fps}:start_time=0`,
      ...orientFilters(orientation),
      `scale=${width}:${height}:flags=bilinear`,
      'format=rgba',
    ];
    this.child = spawn(FFMPEG, ['-hide_banner', '-nostdin', '-v', 'error', '-ss', sec(from), '-i', file, '-map', '0:v:0', '-an', '-sn', '-vf', filters.join(','), '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'], { stdio: ['ignore', 'pipe', 'pipe'] });
    this.child.stderr.on('data', (c: Buffer) => { this.stderr = (this.stderr + c.toString()).slice(-2000); });
    this.child.on('error', () => { this.ended = true; });
    this.chunks = this.child.stdout[Symbol.asyncIterator]() as AsyncIterator<Buffer>;
    this.buffer = Buffer.allocUnsafe(width * height * 4);
    this.canvas = createCanvas(width, height);
  }

  /** Fill `this.buffer` with the next frame. False at the end of the stream. */
  private async next(): Promise<boolean> {
    if (this.ended) return false;
    const size = this.buffer.length;
    let got = 0;
    while (got < size) {
      let chunk = this.rest;
      this.rest = null;
      if (!chunk) {
        const step = await this.chunks.next().catch(() => ({ done: true, value: undefined }) as const);
        if (step.done || !step.value) {
          this.ended = true;
          return false;
        }
        chunk = step.value;
      }
      const take = Math.min(chunk.length, size - got);
      chunk.copy(this.buffer, got, 0, take);
      got += take;
      if (take < chunk.length) this.rest = chunk.subarray(take);
    }
    return true;
  }

  /** Advance to frame `n` (never backwards). When the source runs out, the last picture is held. */
  async seek(n: number): Promise<Canvas | null> {
    let fresh = false;
    while (this.index < n) {
      if (!(await this.next())) break;
      this.index++;
      fresh = true;
    }
    if (fresh) {
      toCanvas(this.buffer, this.source.width, this.source.height, this.canvas);
      this.hasFrame = true;
    }
    return this.hasFrame ? this.canvas : null;
  }

  get error() {
    return this.stderr.trim();
  }

  close() {
    this.ended = true;
    this.child.stdout.destroy();
    this.child.kill('SIGKILL');
  }
}

/** Decode one picture: an image file, or the frame at `time` of a video. */
export async function decodeStill(file: string, width: number, height: number, orientation: Orientation = UPRIGHT, time = 0): Promise<Canvas> {
  const filters = [...orientFilters(orientation), `scale=${width}:${height}:flags=bicubic`, 'format=rgba'];
  const seek = time > 0 ? ['-ss', sec(time)] : [];
  const { data } = await ffmpeg(['-v', 'error', ...seek, '-i', file, '-map', '0:v:0', '-frames:v', '1', '-vf', filters.join(','), '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'], { binary: true });
  if (data.length < width * height * 4) throw new Error(`could not decode a picture from ${file}`);
  return toCanvas(data.subarray(0, width * height * 4), width, height);
}
