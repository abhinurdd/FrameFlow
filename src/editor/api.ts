import { fetch } from 'expo/fetch';
import { Directory, File, Paths } from 'expo-file-system';

import type { CaptionWord, Asset, Edit } from '@/engine/timeline';

import { localAsset } from './pick';

/**
 * Client for the FrameFlow media server (pipeline/server). The phone previews edits
 * itself; the server does the heavy work: final renders and tools that need ffmpeg
 * or a speech model.
 */
const BASE = process.env.EXPO_PUBLIC_MEDIA_SERVER ?? 'http://localhost:8787';

export type RemoteMedia = { id: string; kind: Asset['kind']; duration: number; width: number; height: number };
export type RenderSettings = { height: 720 | 1080 | 1440 | 2160; fps: 24 | 30 | 60; bitrateMbps?: number };
type Job = { status: 'queued' | 'running' | 'done' | 'error'; progress: number; error?: string; result?: Record<string, unknown> };

export class ServerError extends Error {}

export const VOICE_EFFECTS = ['deep', 'chipmunk', 'robot', 'echo', 'telephone'] as const;
export type VoiceEffect = (typeof VOICE_EFFECTS)[number];

const MIME: Record<string, string> = { mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/mp4', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', aac: 'audio/aac' };

async function call<T>(path: string, init?: Parameters<typeof fetch>[1]): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, init);
  } catch {
    throw new ServerError(__DEV__ ? `Can't reach the media server at ${BASE}. Start it with "npm run server" in pipeline/.` : "Can't reach FrameFlow right now. Check your connection and try again.");
  }
  if (!res.ok) throw new ServerError(__DEV__ ? `Media server error ${res.status}: ${(await res.text()).slice(0, 200)}` : 'Something went wrong on our side. Please try again.');
  return (await res.json()) as T;
}

const post = <T>(path: string, body: unknown) => call<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export async function health() {
  try {
    return await call<{ ok: boolean; whisper: boolean; translate?: boolean; tts?: boolean }>('/health');
  } catch {
    return null;
  }
}

/** Files already on the server this session, by local uri, so each is sent once however many tools use it. */
const uploaded = new Map<string, string>();

async function upload(asset: Asset): Promise<string> {
  const known = uploaded.get(asset.uri);
  if (known) return known;
  if (asset.placeholder) throw new ServerError('This video has not been downloaded to your phone yet, so it cannot be processed.');
  const ext = asset.uri.split('.').pop()?.toLowerCase() ?? '';
  const media = await call<RemoteMedia>('/media', {
    method: 'POST',
    headers: { 'Content-Type': MIME[ext] ?? 'application/octet-stream', 'X-Filename': `${asset.id}.${ext}` },
    body: new File(asset.uri),
  });
  uploaded.set(asset.uri, media.id);
  return media.id;
}

/** Upload any source files the server does not have yet. Returns the edit with their ids filled in. */
export async function withUploads(edit: Edit, onProgress?: (done: number, total: number) => void): Promise<Edit> {
  const used = new Set([...edit.main.map((s) => s.assetId), ...edit.overlays.map((o) => o.assetId), ...edit.audio.map((a) => a.assetId)]);
  const pending = Object.values(edit.assets).filter((a) => used.has(a.id) && !a.remoteId);
  const assets = { ...edit.assets };
  let done = 0;
  for (const asset of pending) {
    onProgress?.(done, pending.length);
    assets[asset.id] = { ...asset, remoteId: await upload(asset) };
    done++;
  }
  return pending.length ? { ...edit, assets } : edit;
}

/** Make sure one asset is on the server, and return its id there. */
export async function remoteId(asset: Asset) {
  return asset.remoteId ?? (await upload(asset));
}

/** Thrown when the person cancels a job. */
export class Cancelled extends Error {}
/** A handle for cancelling a running job. */
export class Stop {
  cancelled = false;
  cancel() {
    this.cancelled = true;
  }
}

async function runJob(path: string, body: unknown, onProgress?: (p: number) => void, stop?: Stop) {
  const { jobId } = await post<{ jobId: string }>(path, body);
  let last = -1;
  let stalled = 0;
  for (;;) {
    if (stop?.cancelled) throw new Cancelled();
    const job = await call<Job>(`/jobs/${jobId}`);
    onProgress?.(job.progress);
    if (job.status === 'done') return { jobId, result: job.result ?? {} };
    if (job.status === 'error') throw new ServerError(job.error ?? 'The job failed');
    // Five minutes with no movement means the job is stuck, not slow.
    stalled = job.progress === last ? stalled + 1 : 0;
    last = job.progress;
    if (stalled > 750) throw new ServerError('This is taking too long. Please try again.');
    await new Promise((r) => setTimeout(r, 400));
  }
}

async function download(path: string, name: string) {
  const dir = new Directory(Paths.cache, 'server');
  if (!dir.exists) dir.create({ intermediates: true });
  const target = new File(dir, name);
  if (target.exists) target.delete();
  const file = await File.downloadFileAsync(`${BASE}${path}`, target);
  return file.uri;
}

const EXT: Record<Asset['kind'], string> = { video: 'mp4', image: 'png', audio: 'm4a' };

/** Run a tool that produces new media, and bring the result back as a local asset. */
async function mediaTool(path: string, body: unknown, name: string, onProgress?: (p: number) => void): Promise<Asset> {
  const { result } = await runJob(path, body, onProgress);
  const media = result.media as RemoteMedia;
  const uri = await download(`/media/${media.id}`, `${media.id}.${EXT[media.kind]}`);
  return localAsset(uri, media.kind, { duration: media.duration, width: media.width, height: media.height, name, remoteId: media.id });
}

export async function render(edit: Edit, settings: RenderSettings, onProgress: (stage: string, p: number) => void, stop?: Stop) {
  const ready = await withUploads(edit, (done, total) => onProgress(`Uploading ${done + 1} of ${total}`, total ? done / total : 0));
  if (stop?.cancelled) throw new Cancelled();
  const { jobId } = await runJob('/render', { edit: ready, settings }, (p) => onProgress('Rendering', p), stop);
  onProgress('Downloading', 1);
  return { uri: await download(`/jobs/${jobId}/file`, `${edit.name.replace(/[^A-Za-z0-9]+/g, '-')}-${jobId}.mp4`), edit: ready };
}

export const tools = {
  reverse: async (asset: Asset, onProgress?: (p: number) => void) => mediaTool('/tools/reverse', { mediaId: await remoteId(asset) }, `${asset.name ?? 'Clip'} (reversed)`, onProgress),
  frame: async (asset: Asset, time: number) => mediaTool('/tools/frame', { mediaId: await remoteId(asset), time }, 'Freeze frame'),
  extractAudio: async (asset: Asset) => mediaTool('/tools/extract-audio', { mediaId: await remoteId(asset) }, `${asset.name ?? 'Clip'} audio`),
  denoise: async (asset: Asset, onProgress?: (p: number) => void) => mediaTool('/tools/denoise', { mediaId: await remoteId(asset) }, `${asset.name ?? 'Clip'} (clean audio)`, onProgress),
  silence: async (asset: Asset) => (await runJob('/tools/silence', { mediaId: await remoteId(asset) })).result.ranges as { start: number; end: number }[],
  beats: async (asset: Asset) => (await runJob('/tools/beats', { mediaId: await remoteId(asset) })).result.beats as number[],
  transcribe: async (asset: Asset, options: { language?: string; translate?: boolean } = {}, onProgress?: (p: number) => void) =>
    (await runJob('/tools/transcribe', { mediaId: await remoteId(asset), ...options }, onProgress)).result as { words: CaptionWord[]; language: string },
  stabilize: async (asset: Asset, onProgress?: (p: number) => void) => mediaTool('/tools/stabilize', { mediaId: await remoteId(asset) }, `${asset.name ?? 'Clip'} (stabilized)`, onProgress),
  voice: async (asset: Asset, effect: VoiceEffect, onProgress?: (p: number) => void) => mediaTool('/tools/voice', { mediaId: await remoteId(asset), effect }, `${asset.name ?? 'Clip'} (${effect} voice)`, onProgress),
  speak: (text: string) => mediaTool('/tools/tts', { text }, text.slice(0, 24)),
};
