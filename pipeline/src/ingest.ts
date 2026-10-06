import { execFile } from 'node:child_process';
import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export async function probeDuration(file: string): Promise<number> {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return Number(stdout.trim());
}

/** Extract 16 kHz mono FLAC, the common input every ASR provider accepts. */
export async function normalizeAudio(input: string, outDir: string): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const out = path.join(outDir, 'audio.flac');
  await run('ffmpeg', ['-y', '-v', 'error', '-i', input, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'flac', out]);
  return out;
}

/** Split into fixed-length chunks. Returns chunk paths with their offset in the source. */
export async function chunkAudio(audio: string, outDir: string, seconds: number): Promise<{ path: string; offset: number }[]> {
  await mkdir(outDir, { recursive: true });
  await run('ffmpeg', ['-y', '-v', 'error', '-i', audio, '-f', 'segment', '-segment_time', String(seconds), '-c:a', 'flac', path.join(outDir, '%05d.flac')]);
  const files = (await readdir(outDir)).filter((f) => f.endsWith('.flac')).sort();
  return files.map((f, i) => ({ path: path.join(outDir, f), offset: i * seconds }));
}
