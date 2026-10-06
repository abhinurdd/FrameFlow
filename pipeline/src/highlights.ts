import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

import type { AsrWord, Highlight } from './types.ts';

const MODEL = 'claude-opus-5-5';
// USD per million tokens for MODEL. Used only for the unit-cost readout.
const PRICE = { input: 4, output: 20 };

const Clips = z.object({
  clips: z.array(
    z.object({
      start: z.number().describe('Start time in seconds, taken from a line timestamp'),
      end: z.number().describe('End time in seconds'),
      title: z.string().describe('Short title in the language of the clip, Roman script'),
      hook: z.string().describe('On-screen hook headline, at most 8 words'),
      reason: z.string().describe('One sentence on why this will hold attention'),
      grades: z.object({ hook: z.string(), flow: z.string(), value: z.string() }).describe('Letter grades A+ to C'),
      score: z.number().describe('0-100 overall'),
    }),
  ),
});

const SYSTEM = `You pick short-form clips from Indian podcast transcripts for Reels and Shorts.

The transcript is Hindi, English or code-mixed Hinglish, one line per utterance, formatted as "[seconds] speaker: text". Transcripts come from ASR, so expect spelling noise.

Pick the moments a viewer would stop scrolling for: a strong claim, a surprising number, a story with a payoff, a contrarian take, a clear how-to. Each clip must:
- stand alone without the rest of the episode, opening on a line that hooks within the first 3 seconds
- start and end on a complete thought, never mid-sentence
- run 20 to 75 seconds
- not overlap another clip

Use the line timestamps for start, and the timestamp of the line after the last one you include for end. Return clips best first. Return fewer clips rather than weak ones, and an empty list if nothing qualifies.`;

/** Collapse words into utterance lines the model can cite by timestamp. */
export function formatTranscript(words: AsrWord[]): string {
  const lines: string[] = [];
  let cur: AsrWord[] = [];
  const flush = () => {
    if (!cur.length) return;
    lines.push(`[${Math.floor(cur[0].t0)}] ${cur[0].speaker ?? 'S'}: ${cur.map((w) => w.text).join(' ')}`);
    cur = [];
  };
  for (const w of words) {
    const last = cur[cur.length - 1];
    if (last && (w.speaker !== last.speaker || w.t0 - last.t1 > 0.8 || cur.length >= 24)) flush();
    cur.push(w);
  }
  flush();
  return lines.join('\n');
}

export type HighlightResult = { clips: Highlight[]; costUsd: number; latencyMs: number };

export async function selectHighlights(words: AsrWord[], opts: { genre?: string; focus?: string } = {}): Promise<HighlightResult> {
  if (!words.length) return { clips: [], costUsd: 0, latencyMs: 0 };
  const client = new Anthropic();
  const t = Date.now();
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: `Genre: ${opts.genre ?? 'podcast'}\n${opts.focus ? `Creator asked for: ${opts.focus}\n` : ''}\nTranscript:\n${formatTranscript(words)}`,
      },
    ],
    output_config: { effort: 'medium', format: betaZodOutputFormat(Clips) },
  });
  if (response.stop_reason === 'refusal') throw new Error(`Highlight selection refused: ${response.stop_details?.explanation ?? 'no detail'}`);
  if (!response.parsed_output) throw new Error(`Highlight selection returned no parseable output (stop_reason ${response.stop_reason})`);
  const { input_tokens, output_tokens } = response.usage;
  return {
    clips: response.parsed_output.clips,
    costUsd: (input_tokens * PRICE.input + output_tokens * PRICE.output) / 1e6,
    latencyMs: Date.now() - t,
  };
}
