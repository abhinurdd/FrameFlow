export type AsrWord = {
  t0: number;
  t1: number;
  text: string;
  speaker?: string;
};

export type Transcript = {
  provider: string;
  model: string;
  durationSec: number;
  /** False when the provider only returns phrase-level timings (each "word" is a phrase). */
  wordLevel: boolean;
  words: AsrWord[];
  latencyMs: number;
};

export type AsrOptions = {
  /** BCP-47, e.g. "hi-IN". Omit to let the provider detect / code-switch. */
  language?: string;
  speakers?: number;
};

export type AsrProvider = {
  name: string;
  envKey: string;
  /** List price in USD per audio hour. Null until checked against the provider's pricing page. */
  usdPerHour: number | null;
  transcribe(audioPath: string, durationSec: number, opts: AsrOptions): Promise<Transcript>;
};

export type Highlight = {
  start: number;
  end: number;
  title: string;
  hook: string;
  reason: string;
  grades: { hook: string; flow: string; value: string };
  score: number;
};
