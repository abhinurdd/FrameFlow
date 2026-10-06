import { LinearGradient } from 'expo-linear-gradient';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import type { ClipSpec, Script, TemplateId, Word } from '@/engine/types';

import { colors, fonts } from './theme';

const TONES = [
  ['#3B2B63', '#1A1726', '#0E0E14'],
  ['#5A2A2A', '#24161A', '#0E0E14'],
  ['#1E4A52', '#141F24', '#0E0E14'],
  ['#5A4520', '#221C12', '#0E0E14'],
] as const;

/** Placeholder speaker illustration until real video frames are wired in. */
export function Person({ size, variant = 0 }: { size: number; variant?: 0 | 1 }) {
  const skin = variant ? '#E9C2A6' : '#C99376';
  const shirt = variant ? '#2F3A56' : '#6B2E3E';
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Circle cx="60" cy="42" r="20" fill={skin} />
      {variant ? (
        <Path d="M42 36c2-14 34-16 37 0 0 0-5-8-18-8s-19 8-19 8z" fill="#1b1410" />
      ) : (
        <Path d="M40 40c0-22 40-22 40 0 0 0-6-12-20-12s-20 12-20 12z" fill="#2a1a12" />
      )}
      <Path d="M20 120c2-30 18-44 40-44s38 14 40 44z" fill={shirt} />
      <Rect x="54" y="62" width="12" height="16" fill={skin} />
      <Rect x={variant ? 86 : 24} y="74" width="10" height="30" rx="5" fill="#111" />
      <Circle cx={variant ? 91 : 29} cy="70" r="8" fill="#222" />
    </Svg>
  );
}

export function wordText(w: Word, script: Script) {
  return script === 'devanagari' ? w.text.devanagari : w.text.roman;
}

/** Groups visible (non-deleted) words into caption lines. */
export function captionLines(spec: ClipSpec) {
  const visible = spec.words.filter((w) => !w.deleted);
  const lines: Word[][] = [];
  for (let i = 0; i < visible.length; i += spec.captions.wordsPerLine) {
    lines.push(visible.slice(i, i + spec.captions.wordsPerLine));
  }
  return lines;
}

const templateStyle: Record<TemplateId, { size: number; upper: boolean; box: boolean }> = {
  'desi-pop': { size: 1, upper: false, box: false },
  'box-bold': { size: 1, upper: true, box: true },
  karaoke: { size: 0.95, upper: false, box: false },
  clean: { size: 0.85, upper: false, box: false },
};

export function CaptionLine({
  words,
  script,
  template,
  fontSize,
  activeIndex,
  autoEmphasis = true,
  english,
}: {
  words: Word[];
  script: Script;
  template: TemplateId;
  fontSize: number;
  activeIndex?: number;
  autoEmphasis?: boolean;
  english?: string;
}) {
  const t = templateStyle[template];
  const deva = script !== 'roman';
  const size = fontSize * t.size;
  return (
    <View style={{ alignItems: 'center' }}>
      <Text
        style={{
          textAlign: 'center',
          fontFamily: deva ? fonts.devaBold : fonts.black,
          fontSize: size,
          lineHeight: size * (deva ? 1.45 : 1.15),
          color: '#fff',
          textShadowColor: 'rgba(0,0,0,0.9)',
          textShadowOffset: { width: 0, height: 2 },
          textShadowRadius: 4,
        }}>
        {words.map((w, i) => {
          const text = script === 'bilingual' || script === 'devanagari' ? w.text.devanagari : w.text.roman;
          const active = activeIndex === i;
          const emph = autoEmphasis && w.emphasis;
          const highlighted = template === 'karaoke' ? active : emph || active;
          const label = t.upper && !deva ? text.toUpperCase() : text;
          return (
            <Text
              key={`${w.t0}-${i}`}
              style={
                highlighted
                  ? t.box
                    ? { backgroundColor: colors.saffron, color: '#fff' }
                    : { color: colors.highlight }
                  : undefined
              }>
              {label}
              {i < words.length - 1 ? ' ' : ''}
            </Text>
          );
        })}
      </Text>
      {script === 'bilingual' && (
        <Text style={{ fontFamily: fonts.bold, fontSize: size * 0.55, color: '#E5E5EE', marginTop: 2, textAlign: 'center', textShadowColor: '#000', textShadowRadius: 4 }}>
          {english ?? words.map((w) => w.text.roman).join(' ')}
        </Text>
      )}
    </View>
  );
}

export function ClipFrame({
  tone = 0,
  style,
  personSize,
  children,
  split,
}: {
  tone?: number;
  style?: StyleProp<ViewStyle>;
  personSize: number;
  children?: React.ReactNode;
  split?: boolean;
}) {
  const g = TONES[tone % 4];
  if (split) {
    return (
      <View style={[{ overflow: 'hidden', borderRadius: 12 }, style]}>
        <LinearGradient colors={TONES[1]} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
          <Person size={personSize * 0.6} variant={1} />
        </LinearGradient>
        <View style={{ height: 2, backgroundColor: '#000' }} />
        <LinearGradient colors={TONES[0]} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
          <Person size={personSize * 0.6} />
        </LinearGradient>
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>{children}</View>
      </View>
    );
  }
  return (
    <LinearGradient colors={g} style={[{ overflow: 'hidden', borderRadius: 12, alignItems: 'center', justifyContent: 'flex-end' }, style]}>
      <Person size={personSize} variant={(tone % 2) as 0 | 1} />
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>{children}</View>
    </LinearGradient>
  );
}

export function ScoreBadge({ score, style }: { score: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }, style]}>
      <Text style={{ fontFamily: fonts.black, fontSize: 13, color: score >= 85 ? colors.score : colors.amber }}>{score}</Text>
    </View>
  );
}

export function DurationBadge({ seconds }: { seconds: number }) {
  const s = Math.round(seconds);
  return (
    <View style={{ position: 'absolute', bottom: 6, left: 6, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 }}>
      <Text style={{ fontFamily: fonts.bold, fontSize: 10, color: '#fff' }}>
        {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
      </Text>
    </View>
  );
}
