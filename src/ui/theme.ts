export const colors = {
  bg: '#0A0A0E',
  surface: '#15151C',
  surface2: '#1F1F29',
  line: '#2A2A36',
  lineStrong: '#3A3A48',
  text: '#F3F3F7',
  textMuted: '#9A9AAB',
  textDim: '#6B6B7B',
  saffron: '#FF7A1A',
  magenta: '#FF2E7E',
  saffronSoft: 'rgba(255,122,26,0.14)',
  saffronText: '#FFB27A',
  score: '#3DDC84',
  scoreSoft: 'rgba(61,220,132,0.10)',
  amber: '#FFC547',
  amberSoft: 'rgba(245,158,11,0.10)',
  danger: '#FF6B6B',
  highlight: '#FFD23F',
  speakerA: '#2D6BFF',
  speakerB: '#B33DFF',
} as const;

export const gradient = [colors.saffron, colors.magenta] as const;

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  heavy: 'Inter_800ExtraBold',
  black: 'Inter_900Black',
  deva: 'NotoSansDevanagari_600SemiBold',
  devaBold: 'NotoSansDevanagari_800ExtraBold',
} as const;

export const radius = { sm: 8, md: 12, lg: 14, xl: 22, pill: 999 } as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Devanagari needs its own font family; pick one based on the text's script. */
export function hasDevanagari(text: string) {
  return /[ऀ-ॿ]/.test(text);
}
