import { openAsBlob } from 'node:fs';

import type { AsrProvider } from '../types.ts';

type ScribeWord = { text: string; start: number; end: number; type: 'word' | 'spacing' | 'audio_event'; speaker_id?: string };

export const elevenlabs: AsrProvider = {
  name: 'elevenlabs',
  envKey: 'ELEVENLABS_API_KEY',
  usdPerHour: null,
  async transcribe(audioPath, durationSec, opts) {
    const form = new FormData();
    form.set('model_id', 'scribe_v2');
    form.set('file', await openAsBlob(audioPath), 'audio.flac');
    form.set('diarize', 'true');
    form.set('timestamps_granularity', 'word');
    form.set('tag_audio_events', 'false');
    if (opts.language) form.set('language_code', opts.language.split('-')[0]);
    if (opts.speakers) form.set('num_speakers', String(opts.speakers));
    const t = Date.now();
    const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY! },
      body: form,
    });
    if (!res.ok) throw new Error(`elevenlabs ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { words: ScribeWord[] };
    return {
      provider: 'elevenlabs',
      model: 'scribe_v2',
      durationSec,
      wordLevel: true,
      latencyMs: Date.now() - t,
      words: json.words.filter((w) => w.type === 'word').map((w) => ({ t0: w.start, t1: w.end, text: w.text, speaker: w.speaker_id })),
    };
  },
};
