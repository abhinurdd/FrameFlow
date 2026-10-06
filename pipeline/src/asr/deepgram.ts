import { readFile } from 'node:fs/promises';

import type { AsrProvider } from '../types.ts';

type DgWord = { word: string; punctuated_word?: string; start: number; end: number; speaker?: number };

export const deepgram: AsrProvider = {
  name: 'deepgram',
  envKey: 'DEEPGRAM_API_KEY',
  usdPerHour: null,
  async transcribe(audioPath, durationSec, opts) {
    const params = new URLSearchParams({
      model: 'nova-3',
      // "multi" is Deepgram's code-switching mode, which is what Hinglish needs.
      language: opts.language ? opts.language.split('-')[0] : 'multi',
      punctuate: 'true',
      diarize: 'true',
    });
    const t = Date.now();
    const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
      method: 'POST',
      headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`, 'Content-Type': 'audio/flac' },
      body: await readFile(audioPath),
    });
    if (!res.ok) throw new Error(`deepgram ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { results: { channels: { alternatives: { words: DgWord[] }[] }[] } };
    const words = json.results.channels[0]?.alternatives[0]?.words ?? [];
    return {
      provider: 'deepgram',
      model: 'nova-3',
      durationSec,
      wordLevel: true,
      latencyMs: Date.now() - t,
      words: words.map((w) => ({ t0: w.start, t1: w.end, text: w.punctuated_word ?? w.word, speaker: w.speaker === undefined ? undefined : String(w.speaker) })),
    };
  },
};
