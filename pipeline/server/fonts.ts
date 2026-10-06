/**
 * Fonts for export. The same TTFs the app bundles, loaded from the repo's root
 * node_modules. Every weight is registered under its own family name so the face
 * that gets used is exactly the one asked for, never a synthesised weight.
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GlobalFonts } from '@napi-rs/canvas';

import type { FontId, TextStyle } from '../../src/engine/timeline.ts';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(process.env.FRAMEFLOW_FONTS ?? join(HERE, '..', '..', 'node_modules', '@expo-google-fonts'));

type Weight = TextStyle['weight'];

/** [package, style folder, file stem] for each font and weight. Mono and Rounded have no 900. */
const FACES: Record<FontId | 'deva', Record<Weight, [string, string, string]>> = {
  inter: {
    regular: ['inter', '400Regular', 'Inter_400Regular'],
    bold: ['inter', '700Bold', 'Inter_700Bold'],
    black: ['inter', '900Black', 'Inter_900Black'],
  },
  serif: {
    regular: ['playfair-display', '400Regular', 'PlayfairDisplay_400Regular'],
    bold: ['playfair-display', '700Bold', 'PlayfairDisplay_700Bold'],
    black: ['playfair-display', '900Black', 'PlayfairDisplay_900Black'],
  },
  mono: {
    regular: ['space-mono', '400Regular', 'SpaceMono_400Regular'],
    bold: ['space-mono', '700Bold', 'SpaceMono_700Bold'],
    black: ['space-mono', '700Bold', 'SpaceMono_700Bold'],
  },
  rounded: {
    regular: ['baloo-2', '400Regular', 'Baloo2_400Regular'],
    bold: ['baloo-2', '700Bold', 'Baloo2_700Bold'],
    black: ['baloo-2', '800ExtraBold', 'Baloo2_800ExtraBold'],
  },
  deva: {
    regular: ['noto-sans-devanagari', '600SemiBold', 'NotoSansDevanagari_600SemiBold'],
    bold: ['noto-sans-devanagari', '600SemiBold', 'NotoSansDevanagari_600SemiBold'],
    black: ['noto-sans-devanagari', '800ExtraBold', 'NotoSansDevanagari_800ExtraBold'],
  },
};

const registered = new Map<string, boolean>();
/** Fonts that could not be loaded, for /health and the logs. */
export const missingFonts = new Set<string>();

function face(font: FontId | 'deva', weight: Weight): string | null {
  const [pkg, folder, stem] = FACES[font][weight];
  const family = `FF ${stem}`;
  if (!registered.has(family)) {
    const file = join(ROOT, pkg, folder, `${stem}.ttf`);
    const ok = existsSync(file) && GlobalFonts.registerFromPath(file, family) !== null;
    registered.set(family, ok);
    if (!ok) {
      missingFonts.add(stem);
      console.warn(`[fonts] ${file} is missing; falling back to Inter`);
    }
  }
  return registered.get(family) ? family : null;
}

/** Colour emoji: Apple's on macOS; on Linux install Noto Color Emoji (fonts-noto-color-emoji). */
export const EMOJI_FAMILIES = '"Apple Color Emoji", "Noto Color Emoji", "Segoe UI Emoji"';

const DEVANAGARI = /[ऀ-ॿ]/;
export function hasDevanagari(text: string) {
  return DEVANAGARI.test(text);
}

/**
 * Canvas `font` value. Devanagari falls back to Noto Sans Devanagari for every
 * font but Rounded (Baloo 2 has its own Devanagari), emoji to the system emoji font.
 */
export function fontFor(font: FontId, weight: Weight, px: number, devanagariFirst = false) {
  const primary = face(font, weight) ?? face('inter', weight);
  const deva = face('deva', weight);
  const families = [primary, deva].filter((f): f is string => !!f);
  if (devanagariFirst) families.reverse();
  return `${px}px ${families.map((f) => `"${f}"`).join(', ')}, ${EMOJI_FAMILIES}`;
}
