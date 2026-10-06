/** Thin wrappers around the `ffmpeg` and `ffprobe` binaries on PATH. */

import { spawn } from 'node:child_process';

export const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
export const FFPROBE = process.env.FFPROBE ?? 'ffprobe';

export type RunOptions = {
  /** Called with 0..1 as ffmpeg reports its output position; needs `duration`. */
  onProgress?: (p: number) => void;
  /** Expected output length in seconds, for progress. */
  duration?: number;
  /** Collect stdout as binary instead of text. */
  binary?: boolean;
};

export type RunResult = { stdout: string; stderr: string; data: Buffer };

/** Keep the end of stderr only: ffmpeg can be very chatty. */
function tail(text: string, lines = 12) {
  return text.trim().split('\n').slice(-lines).join('\n');
}

/** Run a command to completion. Rejects with the tail of stderr on a non-zero exit. */
export function run(cmd: string, args: string[], options: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => out.push(c));
    child.stderr.on('data', (c: Buffer) => {
      stderr += c.toString();
      // Bounded, but long enough to keep every silencedetect line of a long file.
      if (stderr.length > 8_000_000) stderr = stderr.slice(-4_000_000);
    });
    child.on('error', (e) => reject(new Error(`${cmd} could not be started: ${e.message}`)));
    child.on('close', (code) => {
      const data = Buffer.concat(out);
      if (code === 0) resolve({ stdout: options.binary ? '' : data.toString(), stderr, data });
      else reject(new Error(`${cmd} exited with code ${code}: ${tail(stderr)}`));
    });
  });
}

/** Run ffmpeg quietly, with optional progress from `-progress`. */
export function ffmpeg(args: string[], options: RunOptions = {}): Promise<RunResult> {
  if (!options.onProgress || !options.duration) return run(FFMPEG, ['-hide_banner', '-nostdin', '-y', ...args], options);
  const { onProgress, duration } = options;
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, ['-hide_banner', '-nostdin', '-y', '-nostats', '-progress', 'pipe:1', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => {
      const m = [...c.toString().matchAll(/out_time_us=(\d+)/g)].pop();
      if (m) onProgress(Math.min(1, Number(m[1]) / 1e6 / duration));
    });
    child.stderr.on('data', (c: Buffer) => {
      stderr += c.toString();
      if (stderr.length > 8_000_000) stderr = stderr.slice(-4_000_000);
    });
    child.on('error', (e) => reject(new Error(`ffmpeg could not be started: ${e.message}`)));
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout: '', stderr, data: Buffer.alloc(0) });
      else reject(new Error(`ffmpeg exited with code ${code}: ${tail(stderr)}`));
    });
  });
}

/** Seconds with enough digits for sample accuracy, without exponent notation. */
export function sec(t: number) {
  return Math.max(0, t).toFixed(6);
}
