import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { getProvider } from './asr/index.ts';
import { selectHighlights } from './highlights.ts';
import { chunkAudio, normalizeAudio, probeDuration } from './ingest.ts';
import { dominantScript, score } from './score.ts';
import type { AsrProvider, Highlight, Transcript } from './types.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(root, '.env.local');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    provider: { type: 'string', default: 'elevenlabs' },
    providers: { type: 'string' },
    lang: { type: 'string' },
    ref: { type: 'string' },
    manifest: { type: 'string', default: path.join(root, 'testset/manifest.jsonl') },
    window: { type: 'string', default: '10' },
    genre: { type: 'string' },
  },
});
const [command, input] = positionals;

const workDir = (media: string) => path.join(root, 'work', path.basename(media, path.extname(media)));
const text = (t: Transcript) => t.words.map((w) => w.text).join(' ');
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const asrCost = (p: AsrProvider, sec: number) => (p.usdPerHour === null ? null : (p.usdPerHour * sec) / 3600);

async function transcribe(media: string, providerName: string): Promise<Transcript> {
  const provider = getProvider(providerName);
  const dir = workDir(media);
  const audio = await normalizeAudio(media, dir);
  const transcript = await provider.transcribe(audio, await probeDuration(audio), { language: values.lang });
  await writeFile(path.join(dir, `${providerName}.json`), JSON.stringify(transcript, null, 2));
  return transcript;
}

type ManifestRow = { id: string; audio: string; ref: { devanagari?: string; roman?: string } };

/** Score every provider against every reference in the test set. */
async function bench() {
  const dir = path.dirname(values.manifest);
  const rows = (await readFile(values.manifest, 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l) as ManifestRow);
  const names = (values.providers ?? values.provider).split(',');
  const report: Record<string, unknown>[] = [];
  for (const name of names) {
    let refWords = 0, werErrs = 0, cerSum = 0, audioSec = 0, latency = 0;
    for (const row of rows) {
      const t = await transcribe(path.resolve(dir, row.audio), name);
      const hyp = text(t);
      const refPath = row.ref[dominantScript(hyp)] ?? row.ref.devanagari ?? row.ref.roman;
      if (!refPath) throw new Error(`${row.id}: manifest row has no reference transcript`);
      const s = score(await readFile(path.resolve(dir, refPath), 'utf8'), hyp);
      refWords += s.refWords;
      werErrs += s.wer * s.refWords;
      cerSum += s.cer * s.refWords;
      audioSec += t.durationSec;
      latency += t.latencyMs;
      console.log(`${name} ${row.id}: WER ${pct(s.wer)} CER ${pct(s.cer)}`);
    }
    const cost = asrCost(getProvider(name), 3600);
    report.push({
      provider: name,
      WER: pct(werErrs / refWords),
      CER: pct(cerSum / refWords),
      'speed (x realtime)': (audioSec / (latency / 1000)).toFixed(1),
      '$/hour': cost === null ? 'unknown' : cost.toFixed(2),
    });
  }
  console.table(report);
}

/**
 * End-to-end spike of the streaming pipeline (docs/strategy.md §4): audio is cut into
 * windows, each window is transcribed and mined for clips as soon as it is ready.
 * Clips that straddle a window boundary are missed; the real pipeline needs overlap.
 */
async function spike(media: string) {
  const provider = getProvider(values.provider);
  const dir = workDir(media);
  const started = Date.now();
  const elapsed = () => ((Date.now() - started) / 1000).toFixed(1);
  const audio = await normalizeAudio(media, dir);
  const durationSec = await probeDuration(audio);
  const windows = await chunkAudio(audio, path.join(dir, 'windows'), Number(values.window) * 60);
  console.log(`[${elapsed()}s] audio ready: ${mmss(durationSec)}, ${windows.length} windows`);

  const clips: Highlight[] = [];
  let llmCost = 0, firstClipAt: string | null = null, next = 0;
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (next < windows.length) {
        const w = windows[next++];
        const t = await provider.transcribe(w.path, await probeDuration(w.path), { language: values.lang });
        const words = t.words.map((x) => ({ ...x, t0: x.t0 + w.offset, t1: x.t1 + w.offset }));
        console.log(`[${elapsed()}s] window @${mmss(w.offset)} transcribed (${words.length} words)`);
        const h = await selectHighlights(words, { genre: values.genre });
        llmCost += h.costUsd;
        if (h.clips.length) firstClipAt ??= elapsed();
        clips.push(...h.clips);
        console.log(`[${elapsed()}s] window @${mmss(w.offset)} → ${h.clips.length} clips`);
      }
    }),
  );
  clips.sort((a, b) => b.score - a.score);
  await writeFile(path.join(dir, 'clips.json'), JSON.stringify(clips, null, 2));
  console.table(clips.map((c) => ({ at: `${mmss(c.start)}-${mmss(c.end)}`, score: c.score, title: c.title })));
  const asr = asrCost(provider, durationSec);
  console.log(`first clip: ${firstClipAt ?? 'none'}s · total: ${elapsed()}s · clips: ${clips.length}`);
  console.log(`cost: LLM $${llmCost.toFixed(3)} + ASR ${asr === null ? 'unknown (set usdPerHour)' : `$${asr.toFixed(3)}`}`);
}

switch (command) {
  case 'transcribe': {
    const t = await transcribe(input, values.provider);
    console.log(`${t.words.length} words in ${(t.latencyMs / 1000).toFixed(1)}s → ${path.join(workDir(input), `${values.provider}.json`)}`);
    break;
  }
  case 'score': {
    if (!values.ref) throw new Error('--ref <reference.txt> is required');
    const t = JSON.parse(await readFile(input, 'utf8')) as Transcript;
    const s = score(await readFile(values.ref, 'utf8'), text(t));
    console.log(`WER ${pct(s.wer)} · CER ${pct(s.cer)} · ${s.refWords} ref words, ${s.hypWords} hyp words`);
    break;
  }
  case 'bench':
    await bench();
    break;
  case 'spike':
    await mkdir(workDir(input), { recursive: true });
    await spike(input);
    break;
  default:
    console.log(`Usage: npm run ff -- <command>
  transcribe <media> --provider <name> [--lang hi-IN]
  score <transcript.json> --ref <reference.txt>
  bench [--manifest testset/manifest.jsonl] --providers elevenlabs,deepgram,sarvam
  spike <media> --provider <name> [--window 10] [--genre podcast]`);
}
