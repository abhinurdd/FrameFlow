import type { TextStyle } from '@/engine/timeline';
import { hasDevanagari } from '@/ui/theme';

const FAMILIES: Record<TextStyle['font'], Record<TextStyle['weight'], string>> = {
  inter: { regular: 'Inter_400Regular', bold: 'Inter_700Bold', black: 'Inter_900Black' },
  serif: { regular: 'PlayfairDisplay_400Regular', bold: 'PlayfairDisplay_700Bold', black: 'PlayfairDisplay_900Black' },
  mono: { regular: 'SpaceMono_400Regular', bold: 'SpaceMono_700Bold', black: 'SpaceMono_700Bold' },
  rounded: { regular: 'Baloo2_400Regular', bold: 'Baloo2_700Bold', black: 'Baloo2_800ExtraBold' },
};

/** Baloo 2 covers Devanagari itself; the other families fall back to Noto Sans Devanagari. */
export function fontFamily(style: Pick<TextStyle, 'font' | 'weight'>, text: string) {
  if (style.font !== 'rounded' && hasDevanagari(text)) return style.weight === 'black' ? 'NotoSansDevanagari_800ExtraBold' : 'NotoSansDevanagari_600SemiBold';
  return FAMILIES[style.font][style.weight];
}
