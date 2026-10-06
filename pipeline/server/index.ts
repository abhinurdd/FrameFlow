/**
 * FrameFlow media server: upload sources, render an Edit to MP4, and a few media
 * tools. Plain node:http, JSON in and out, CORS open. See pipeline/README.md.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Edit } from '../../src/engine/timeline.ts';

import { missingFonts } from './fonts.ts';
import { clearStale, enqueue, getJob, type JobContext, type JobOutput } from './jobs.ts';
import { getMedia, HttpError, mediaPath, OUT_DIR, publicInfo, requireMedia, saveUpload, WORK, type Media } from './media.ts';
import { canvasSize, checkSettings, renderEdit, resolveAssets } from './render.ts';
import * as tools from './tools.ts';

const TYPES: Record<string, string> = {
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska',
  '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.aac': 'audio/aac', '.ogg': 'audio/ogg',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.heic': 'image/heic',
};

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, x-filename, range',
  'access-control-expose-headers': 'content-length, content-range, accept-ranges, content-disposition',
};

function json(res: ServerResponse, status: number, body: object) {
  res.writeHead(status, { ...CORS, 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 32 * 1024 * 1024) throw new HttpError(413, 'request body is too large');
    chunks.push(chunk as Buffer);
  }
  try {
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('not an object');
    return body as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'request body must be a JSON object');
  }
}

/** Send a file, honouring a single `Range: bytes=a-b` request. */
async function sendFile(req: IncomingMessage, res: ServerResponse, file: string, downloadName?: string) {
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) throw new HttpError(404, 'file not found');
  const headers: Record<string, string> = { ...CORS, 'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', 'accept-ranges': 'bytes' };
  if (downloadName) headers['content-disposition'] = `inline; filename="${encodeURIComponent(downloadName)}"`;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  let start = 0;
  let end = info.size - 1;
  if (range && (range[1] || range[2])) {
    if (range[1]) {
      start = Number(range[1]);
      if (range[2]) end = Math.min(end, Number(range[2]));
    } else {
      // "bytes=-n": the last n bytes.
      start = Math.max(0, info.size - Number(range[2]));
    }
    if (start > end || start >= info.size) {
      res.writeHead(416, { ...CORS, 'content-range': `bytes */${info.size}` });
      res.end();
      return;
    }
    res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${info.size}`, 'content-length': String(end - start + 1) });
  } else {
    res.writeHead(200, { ...headers, 'content-length': String(info.size) });
  }
  if (req.method === 'HEAD' || info.size === 0) {
    res.end();
    return;
  }
  const stream = createReadStream(file, { start, end });
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

const number = (v: unknown, fallback: number, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);

/** Each tool: check the request now (so mistakes are a 4xx), then do the work as a job. */
const TOOLS: Record<string, (media: Media, body: Record<string, unknown>) => (ctx: JobContext) => Promise<JobOutput>> = {
  reverse: (m) => (ctx) => tools.reverse(m, ctx),
  frame: (m, b) => {
    if (typeof b.time !== 'number' || !Number.isFinite(b.time)) throw new HttpError(400, '`time` (seconds) is required');
    const time = b.time;
    return (ctx) => tools.frame(m, time, ctx);
  },
  'extract-audio': (m) => (ctx) => tools.extractAudio(m, ctx),
  denoise: (m) => (ctx) => tools.denoise(m, ctx),
  silence: (m, b) => (ctx) => tools.silence(m, number(b.minSilence, 0.4, 0.05, 60), number(b.thresholdDb, -35, -90, 0), ctx),
  beats: (m) => (ctx) => tools.beats(m, ctx),
  waveform: (m, b) => (ctx) => tools.waveform(m, number(b.samples, 400, 1, 20000), ctx),
  transcribe: (m, b) => (ctx) => tools.transcribe(m, typeof b.language === 'string' ? b.language : undefined, b.translate === true, ctx),
  stabilize: (m) => (ctx) => tools.stabilize(m, ctx),
  voice: (m, b) => {
    const effect = b.effect;
    if (!tools.isVoiceEffect(effect)) throw new HttpError(400, `\`effect\` must be one of ${Object.keys(tools.VOICE_EFFECTS).join(', ')}`);
    return (ctx) => tools.voice(m, effect, ctx);
  },
};

/** Text to speech is the one tool that starts from text rather than from media. */
function ttsJob(body: Record<string, unknown>) {
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) throw new HttpError(400, '`text` is required');
  if (text.length > tools.TTS_MAX_CHARS) throw new HttpError(400, `\`text\` is ${text.length} characters; the limit is ${tools.TTS_MAX_CHARS}`);
  if (body.language !== undefined && body.language !== 'hi' && body.language !== 'en') throw new HttpError(400, "`language` must be 'hi' or 'en'");
  const language = body.language as 'hi' | 'en' | undefined;
  return (ctx: JobContext) => tools.tts(text, language, ctx);
}

async function route(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean);
  const method = req.method === 'HEAD' ? 'GET' : req.method;

  if (method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  if (method === 'GET' && url.pathname === '/health') {
    return json(res, 200, { ok: true, whisper: tools.whisperSetup().ready, tts: tools.ttsSetup().ready, ...(missingFonts.size ? { missingFonts: [...missingFonts] } : {}) });
  }

  if (parts[0] === 'media') {
    if (method === 'POST' && parts.length === 1) {
      const name = decodeURIComponent(String(req.headers['x-filename'] ?? ''));
      const media = await saveUpload(req, name, String(req.headers['content-type'] ?? ''));
      return json(res, 200, publicInfo(media));
    }
    if (method === 'GET' && parts.length === 2) {
      const media = await getMedia(parts[1]);
      if (!media) throw new HttpError(404, 'media not found');
      return sendFile(req, res, mediaPath(media));
    }
  }

  if (method === 'POST' && url.pathname === '/render') {
    const body = await readJson(req);
    const edit = body.edit as Edit;
    const settings = checkSettings(body.settings);
    // Fail now, with a 400, when a source is missing or the size is out of range, rather than later inside the job.
    await resolveAssets(edit);
    canvasSize(edit, settings.height);
    const job = enqueue('render', async (ctx) => {
      const file = join(OUT_DIR, `${ctx.id}.mp4`);
      const result = await renderEdit(edit, settings, file, ctx.tmp, ctx.progress);
      const name = `${(edit.name || 'frameflow').replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'frameflow'}.mp4`;
      return { result, file, filename: name, ownsFile: true };
    });
    return json(res, 200, { jobId: job.id });
  }

  if (method === 'POST' && parts[0] === 'tools' && parts.length === 2) {
    const tool = TOOLS[parts[1]];
    if (!tool && parts[1] !== 'tts') throw new HttpError(404, `unknown tool "${parts[1]}"`);
    const body = await readJson(req);
    const work = tool ? tool(await requireMedia(body.mediaId), body) : ttsJob(body);
    return json(res, 200, { jobId: enqueue(parts[1], work).id });
  }

  if (method === 'GET' && parts[0] === 'jobs' && (parts.length === 2 || (parts.length === 3 && parts[2] === 'file'))) {
    const job = getJob(parts[1]);
    if (!job) throw new HttpError(404, 'job not found');
    if (parts.length === 2) {
      return json(res, 200, { status: job.status, progress: job.progress, ...(job.error ? { error: job.error } : {}), ...(job.result ? { result: job.result } : {}) });
    }
    if (job.status !== 'done') throw new HttpError(409, `job is ${job.status}`);
    if (!job.file) throw new HttpError(404, 'this job has no file; its result is in GET /jobs/:id');
    return sendFile(req, res, job.file, job.filename);
  }

  throw new HttpError(404, 'not found');
}

export function createApp(): Server {
  return createServer((req, res) => {
    route(req, res).catch((e: unknown) => {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      if (res.headersSent) res.destroy();
      else json(res, status, { error: e instanceof Error ? e.message : String(e) });
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 8787);
  await clearStale();
  // Uploads of long videos take a while; do not cut them off.
  const app = createApp();
  app.requestTimeout = 0;
  app.listen(port, () => {
    const whisper = tools.whisperSetup();
    console.log(`FrameFlow media server on http://localhost:${port}`);
    console.log(`  work dir: ${WORK}`);
    console.log(`  transcription: ${whisper.ready ? `ready (${whisper.model})` : 'not set up (see pipeline/README.md)'}`);
  });
}
