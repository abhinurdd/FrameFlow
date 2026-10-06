import { openAsBlob } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { chunkAudio } from '../ingest.ts';
import type { AsrProvider, AsrWord } from '../types.ts';

type SarvamResponse = {
  transcript: string;
  timestamps?: { words: string[]; start_time_seconds: number[]; end_time_seconds: number[] };
};

// The REST endpoint only takes ~30 s of audio and returns phrase-level timings with
// no diarization. Long-form, diarized transcription needs Sarvam's Batch API, which
// this adapter does not use yet.
const CHUNK_SEC = 25;
const CONCURRENCY = 4;

async function transcribeChunk(file: string, language?: string): Promise<SarvamResponse> {
  const form = new FormData();
  form.set('file', await openAsBlob(file, { type: 'audio/flac' }), 'audio.flac');
  form.set('model', 'saaras:v4');
  form.set('language_code', language ?? 'unknown');
  form.set('with_timestamps', 'true');
  const res = await fetch('https://api.sarvam.ai/speech-to-text', {
    method: 'POST',
    headers: { 'api-subscription-key': process.env.SARVAM_API_KEY! },
    body: form,
  });
  if (!res.ok) throw new Error(`sarvam ${res.status}: ${await res.text()}`);
  return (await res.json()) as SarvamResponse;
}

export const sarvam: AsrProvider = {
  name: 'sarvam',
  envKey: 'SARVAM_API_KEY',
  usdPerHour: null,
  async transcribe(audioPath, durationSec, opts) {
    const dir = await mkdtemp(path.join(tmpdir(), 'ff-sarvam-'));
    try {
      const chunks = await chunkAudio(audioPath, dir, CHUNK_SEC);
      const out: AsrWord[][] = new Array(chunks.length);
      const t = Date.now();
      let next = 0;
      await Promise.all(
        Array.from({ length: CONCURRENCY }, async () => {
          while (next < chunks.length) {
            const i = next++;
            const { path: file, offset } = chunks[i];
            const r = await transcribeChunk(file, opts.language);
            const ts = r.timestamps;
            out[i] = ts?.words.length
              ? ts.words.map((text, k) => ({ text, t0: offset + ts.start_time_seconds[k], t1: offset + ts.end_time_seconds[k] }))
              : r.transcript
                ? [{ text: r.transcript, t0: offset, t1: Math.min(offset + CHUNK_SEC, durationSec) }]
                : [];
          }
        }),
      );
      return { provider: 'sarvam', model: 'saaras:v4', durationSec, wordLevel: false, latencyMs: Date.now() - t, words: out.flat() };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
};
