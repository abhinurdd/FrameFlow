/** The media store: uploaded sources and tool outputs, each probed once with ffprobe. */

import { randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

import { FFPROBE, run } from './ff.ts';

const HERE = fileURLToPath(new URL('.', import.meta.url));

/** Everything the server writes lives under here (git-ignored). */
export const WORK = resolve(process.env.FRAMEFLOW_WORK ?? join(HERE, '..', 'work'));
export const MEDIA_DIR = join(WORK, 'media');
export const OUT_DIR = join(WORK, 'out');
export const TMP_DIR = join(WORK, 'tmp');
export const MODELS_DIR = join(WORK, 'models');

export type MediaKind = 'video' | 'image' | 'audio';

/** What the API returns for a piece of media. */
export type MediaInfo = { id: string; kind: MediaKind; duration: number; width: number; height: number };

/** The stored record: the public fields plus what the renderer needs. */
export type Media = MediaInfo & { file: string; name: string; hasAudio: boolean; fps: number };

export type Probe = Omit<Media, 'id' | 'file' | 'name'>;

const cache = new Map<string, Media>();

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function ratio(text: string | undefined) {
  if (!text) return 0;
  const [n, d] = text.split('/').map(Number);
  return d ? n / d : n || 0;
}

type ProbeStream = {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  duration?: string;
  nb_frames?: string;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  disposition?: { attached_pic?: number };
  tags?: { rotate?: string };
  side_data_list?: { rotation?: number }[];
};

const STILL_FORMATS = /image2|_pipe|^(png|jpeg|mjpeg|webp|bmp|tiff|heif|avif)$/;

/** Kind, duration and display size (rotation metadata applied) of a file. */
export async function probe(file: string): Promise<Probe> {
  const { stdout } = await run(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]);
  const info = JSON.parse(stdout) as { streams?: ProbeStream[]; format?: { duration?: string; format_name?: string } };
  const streams = info.streams ?? [];
  const video = streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic);
  const hasAudio = streams.some((s) => s.codec_type === 'audio');
  const duration = Number(info.format?.duration ?? video?.duration ?? 0) || 0;
  if (!video) {
    if (!hasAudio) throw new Error('no audio or video stream found');
    return { kind: 'audio', duration, width: 0, height: 0, hasAudio: true, fps: 0 };
  }
  const rotation = Number(video.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? video.tags?.rotate ?? 0);
  const turned = Math.abs(Math.round(rotation / 90)) % 2 === 1;
  const width = (turned ? video.height : video.width) ?? 0;
  const height = (turned ? video.width : video.height) ?? 0;
  const still = STILL_FORMATS.test(info.format?.format_name ?? '') && !hasAudio && Number(video.nb_frames ?? 1) <= 1;
  if (still) return { kind: 'image', duration: 0, width, height, hasAudio: false, fps: 0 };
  return { kind: 'video', duration, width, height, hasAudio, fps: ratio(video.avg_frame_rate) || ratio(video.r_frame_rate) || 30 };
}

const EXT_BY_TYPE: Record<string, string> = {
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
  'video/x-matroska': '.mkv',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/gif': '.gif',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/aac': '.aac',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/ogg': '.ogg',
};

function extensionFor(filename: string, contentType: string) {
  const ext = extname(filename).toLowerCase();
  if (/^\.[a-z0-9]{1,5}$/.test(ext)) return ext;
  return EXT_BY_TYPE[contentType.split(';')[0].trim().toLowerCase()] ?? '.bin';
}

export function publicInfo(m: Media): MediaInfo {
  return { id: m.id, kind: m.kind, duration: m.duration, width: m.width, height: m.height };
}

export function mediaPath(m: Media) {
  return join(MEDIA_DIR, m.file);
}

async function register(tempFile: string, id: string, ext: string, name: string): Promise<Media> {
  let info: Probe;
  try {
    info = await probe(tempFile);
  } catch (e) {
    await rm(tempFile, { force: true });
    throw new HttpError(400, `not a readable media file: ${(e as Error).message}`);
  }
  const media: Media = { id, file: `${id}${ext}`, name, ...info };
  await rename(tempFile, join(MEDIA_DIR, media.file));
  await writeFile(join(MEDIA_DIR, `${id}.json`), JSON.stringify(media));
  cache.set(id, media);
  return media;
}

/** Store an upload stream as new media. */
export async function saveUpload(body: Readable, filename: string, contentType: string): Promise<Media> {
  await mkdir(MEDIA_DIR, { recursive: true });
  const id = randomBytes(8).toString('hex');
  const ext = extensionFor(filename, contentType);
  const temp = join(MEDIA_DIR, `${id}.part${ext}`);
  try {
    await pipeline(body, createWriteStream(temp));
  } catch (e) {
    await rm(temp, { force: true });
    throw e;
  }
  return register(temp, id, ext, filename || `upload${ext}`);
}

/** Register a file made by a tool (or a test) as new media. The file is moved unless `copy` is set. */
export async function addFile(file: string, name: string, copy = false): Promise<Media> {
  await mkdir(MEDIA_DIR, { recursive: true });
  const id = randomBytes(8).toString('hex');
  const ext = extensionFor(file, '');
  const temp = join(MEDIA_DIR, `${id}.part${ext}`);
  if (copy) await copyFile(file, temp);
  else await rename(file, temp).catch(async () => { await copyFile(file, temp); await rm(file, { force: true }); });
  return register(temp, id, ext, name);
}

export async function getMedia(id: string): Promise<Media | null> {
  if (!/^[a-f0-9]{16}$/.test(id)) return null;
  const hit = cache.get(id);
  if (hit) return hit;
  try {
    const media = JSON.parse(await readFile(join(MEDIA_DIR, `${id}.json`), 'utf8')) as Media;
    cache.set(id, media);
    return media;
  } catch {
    return null;
  }
}

export async function requireMedia(id: unknown): Promise<Media> {
  const media = typeof id === 'string' ? await getMedia(id) : null;
  if (!media) throw new HttpError(404, `media ${JSON.stringify(id)} not found`);
  return media;
}
