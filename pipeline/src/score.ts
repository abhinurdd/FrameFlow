/**
 * WER / CER for Hindi and Hinglish. Providers differ on script (Devanagari vs Roman)
 * and on punctuation, so text is normalized first and a hypothesis is only ever
 * scored against a reference in the same script.
 */

const DEVANAGARI = /[ऀ-ॿ]/g;
const LATIN = /[a-z]/gi;

export function dominantScript(text: string): 'devanagari' | 'roman' {
  const d = text.match(DEVANAGARI)?.length ?? 0;
  const l = text.match(LATIN)?.length ?? 0;
  return d >= l ? 'devanagari' : 'roman';
}

export function normalize(text: string): string[] {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[​-‍﻿]/g, '') // zero-width joiners
    .replace(/़/g, '') // nukta: क़ and क are the same word for scoring
    .replace(/ँ/g, 'ं') // chandrabindu → anusvara
    .replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966)) // Devanagari digits
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ') // punctuation, danda, symbols
    .split(/\s+/)
    .filter(Boolean);
}

/** Levenshtein distance over arbitrary tokens, two-row. */
export function editDistance<T>(a: T[], b: T[]): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export type Score = { wer: number; cer: number; refWords: number; hypWords: number };

export function score(reference: string, hypothesis: string): Score {
  const ref = normalize(reference);
  const hyp = normalize(hypothesis);
  const refChars = Array.from(ref.join(''));
  const hypChars = Array.from(hyp.join(''));
  return {
    wer: ref.length ? editDistance(ref, hyp) / ref.length : hyp.length ? 1 : 0,
    cer: refChars.length ? editDistance(refChars, hypChars) / refChars.length : hypChars.length ? 1 : 0,
    refWords: ref.length,
    hypWords: hyp.length,
  };
}
