import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { ANIMATIONS, EFFECTS, IDENTITY, TRANSITIONS, type Animation, type EffectId, type Transform, type Transition } from '@/engine/animate';
import { ADJUST_SLIDERS, FILTERS, NO_ADJUST, type Look } from '@/engine/looks';
import { ASPECTS, BLEND_MODES, FONTS, SPEED_RAMPS, SPEEDS, type Caption, type Background, type BlendMode, type CaptionStyle, type EditAspect, type Fit, type Mask, type TextStyle } from '@/engine/timeline';
import { Chip, Row, Segmented, T } from '@/ui/primitives';
import { TEMPLATES } from '@/ui/templates';
import { colors, fonts } from '@/ui/theme';

import { Slider } from './slider';

/** `commit` is false while a slider is being dragged (live preview), true on release. */
type Change<T> = (value: T, commit: boolean) => void;

const SWATCHES = ['#FFFFFF', '#111111', '#FFD23F', '#FF7A1A', '#FF2E7E', '#B33DFF', '#2D6BFF', '#3DDC84', '#FF3B30'];
const seconds = (v: number) => `${v.toFixed(1)}s`;

function Strip({ children }: { children: ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 6, paddingHorizontal: 12, alignItems: 'center' }}>
      {children}
    </ScrollView>
  );
}

function Swatches({ value, onPick, allowNone }: { value: string | null; onPick: (c: string | null) => void; allowNone?: boolean }) {
  return (
    <Strip>
      {allowNone && (
        <Pressable accessibilityRole="button" accessibilityLabel="No colour" hitSlop={6} onPress={() => onPick(null)} style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: value === null ? colors.highlight : colors.lineStrong, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="ban-outline" size={14} color={colors.textMuted} />
        </Pressable>
      )}
      {SWATCHES.map((c) => (
        <Pressable key={c} accessibilityRole="button" accessibilityLabel={`Colour ${c}`} hitSlop={6} onPress={() => onPick(c)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c, borderWidth: 2, borderColor: value === c ? colors.highlight : colors.lineStrong }} />
      ))}
    </Strip>
  );
}

function Stack({ children }: { children: ReactNode }) {
  return <View style={{ paddingHorizontal: 14, gap: 2 }}>{children}</View>;
}

export function FiltersPanel({ look, onChange, onApplyAll }: { look: Look; onChange: Change<Look>; onApplyAll?: () => void }) {
  return (
    <View style={{ gap: 8 }}>
      <Strip>
        {FILTERS.map((f) => (
          <Chip key={f.id} label={f.name} selected={look.filter === f.id} onPress={() => onChange({ ...look, filter: f.id }, true)} />
        ))}
      </Strip>
      <Stack>
        {look.filter !== 'none' && <Slider label="Strength" value={look.strength} min={0} max={1} onChange={(v) => onChange({ ...look, strength: v }, false)} onCommit={(v) => onChange({ ...look, strength: v }, true)} />}
      </Stack>
      {onApplyAll && (
        <Pressable onPress={onApplyAll} style={{ alignSelf: 'center' }}>
          <T variant="muted">Apply to all clips</T>
        </Pressable>
      )}
    </View>
  );
}

export function AdjustPanel({ look, onChange }: { look: Look; onChange: Change<Look> }) {
  return (
    <ScrollView style={{ maxHeight: 190 }} showsVerticalScrollIndicator={false}>
      <Stack>
        {ADJUST_SLIDERS.map((s) => (
          <Slider
            key={s.key}
            label={s.label}
            value={look.adjust[s.key]}
            min={s.min}
            max={s.max}
            onChange={(v) => onChange({ ...look, adjust: { ...look.adjust, [s.key]: v } }, false)}
            onCommit={(v) => onChange({ ...look, adjust: { ...look.adjust, [s.key]: v } }, true)}
          />
        ))}
        <Pressable onPress={() => onChange({ ...look, adjust: NO_ADJUST }, true)} style={{ alignSelf: 'center', paddingVertical: 6 }}>
          <T variant="muted">Reset</T>
        </Pressable>
      </Stack>
    </ScrollView>
  );
}

export function SpeedPanel({ speed, onChange, onRamp }: { speed: number; onChange: (s: number) => void; onRamp: (speeds: number[]) => void }) {
  return (
    <View style={{ gap: 8 }}>
      <Strip>
        {SPEEDS.map((s) => (
          <Chip key={s} label={`${s}x`} selected={speed === s} onPress={() => onChange(s)} />
        ))}
      </Strip>
      <Strip>
        <T variant="muted">Ramps</T>
        {SPEED_RAMPS.map((r) => (
          <Chip key={r.id} label={r.name} onPress={() => onRamp(r.speeds)} />
        ))}
      </Strip>
    </View>
  );
}

/** A text box with one action button: used for text to speech. */
export function PromptPanel({ placeholder, action, busy, initial = '', onSubmit }: { placeholder: string; action: string; busy?: boolean; initial?: string; onSubmit: (text: string) => void }) {
  const [text, setText] = useState(initial);
  return (
    <Row style={{ paddingHorizontal: 14 }} gap={8}>
      <TextInput
        value={text}
        onChangeText={setText}
        multiline
        placeholder={placeholder}
        placeholderTextColor={colors.textDim}
        style={{ flex: 1, minHeight: 40, maxHeight: 76, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: colors.surface2, color: colors.text, fontFamily: fonts.medium }}
      />
      <Chip label={action} selected onPress={() => !busy && text.trim() && onSubmit(text.trim())} />
    </Row>
  );
}

export function ChoicePanel<V extends string>({ label, options, onPick }: { label: string; options: readonly V[]; onPick: (v: V) => void }) {
  return (
    <Strip>
      <T variant="muted">{label}</T>
      {options.map((o) => (
        <Chip key={o} label={o[0].toUpperCase() + o.slice(1)} onPress={() => onPick(o)} />
      ))}
    </Strip>
  );
}

export type Sound = { volume: number; muted: boolean; fadeIn?: number; fadeOut?: number };

export function VolumePanel({ sound, onChange }: { sound: Sound; onChange: Change<Partial<Sound>> }) {
  return (
    <Stack>
      <Row gap={10}>
        <View style={{ flex: 1 }}>
          <Slider label="Volume" value={sound.muted ? 0 : sound.volume} min={0} max={1} onChange={(v) => onChange({ volume: v, muted: false }, false)} onCommit={(v) => onChange({ volume: v, muted: v === 0 }, true)} />
        </View>
        <Chip label="Mute" selected={sound.muted} onPress={() => onChange({ muted: !sound.muted }, true)} />
      </Row>
      {sound.fadeIn !== undefined && <Slider label="Fade in" value={sound.fadeIn} min={0} max={3} format={seconds} onCommit={(v) => onChange({ fadeIn: v }, true)} />}
      {sound.fadeOut !== undefined && <Slider label="Fade out" value={sound.fadeOut} min={0} max={3} format={seconds} onCommit={(v) => onChange({ fadeOut: v }, true)} />}
    </Stack>
  );
}

export function AnimationPanel({ animation, onChange }: { animation: Animation; onChange: (a: Animation) => void }) {
  const [side, setSide] = useState<'in' | 'out'>('in');
  const durationKey = side === 'in' ? 'inDuration' : 'outDuration';
  return (
    <View style={{ gap: 8 }}>
      <View style={{ paddingHorizontal: 14 }}>
        <Segmented options={[{ value: 'in', label: 'In' }, { value: 'out', label: 'Out' }]} value={side} onChange={setSide} />
      </View>
      <Strip>
        {ANIMATIONS.map((a) => (
          <Chip key={a.id} label={a.name} selected={animation[side] === a.id} onPress={() => onChange({ ...animation, [side]: a.id })} />
        ))}
      </Strip>
      <Stack>
        {animation[side] !== 'none' && <Slider label="Duration" value={animation[durationKey]} min={0.1} max={2} format={seconds} onCommit={(v) => onChange({ ...animation, [durationKey]: v })} />}
      </Stack>
    </View>
  );
}

export function TransitionPanel({ transition, onChange, onApplyAll }: { transition: Transition | null; onChange: (t: Transition | null) => void; onApplyAll: () => void }) {
  return (
    <View style={{ gap: 8 }}>
      <Strip>
        <Chip label="None" selected={!transition} onPress={() => onChange(null)} />
        {TRANSITIONS.map((t) => (
          <Chip key={t.id} label={t.name} selected={transition?.type === t.id} onPress={() => onChange({ type: t.id, duration: transition?.duration ?? 0.5 })} />
        ))}
      </Strip>
      {transition && (
        <Stack>
          <Slider label="Duration" value={transition.duration} min={0.2} max={2} format={seconds} onCommit={(v) => onChange({ ...transition, duration: v })} />
          <Pressable onPress={onApplyAll} style={{ alignSelf: 'center', paddingVertical: 4 }}>
            <T variant="muted">Apply to all cuts</T>
          </Pressable>
        </Stack>
      )}
    </View>
  );
}

export function TransformPanel({
  transform,
  onChange,
  fit,
  onFit,
  actions,
}: {
  transform: Transform;
  onChange: Change<Transform>;
  fit?: Fit;
  onFit?: (f: Fit) => void;
  actions?: { label: string; onPress: () => void }[];
}) {
  return (
    <View style={{ gap: 6 }}>
      <Strip>
        {fit && onFit && <Chip label={fit === 'cover' ? 'Fill frame' : 'Fit in frame'} selected={fit === 'cover'} onPress={() => onFit(fit === 'cover' ? 'contain' : 'cover')} />}
        {actions?.map((a) => <Chip key={a.label} label={a.label} onPress={a.onPress} />)}
        <Chip label="Reset" onPress={() => onChange(IDENTITY, true)} />
      </Strip>
      <Stack>
        <Slider label="Size" value={transform.scale} min={0.1} max={4} onChange={(v) => onChange({ ...transform, scale: v }, false)} onCommit={(v) => onChange({ ...transform, scale: v }, true)} />
        <Slider label="Rotate" value={transform.rotation} min={-180} max={180} format={(v) => `${Math.round(v)}°`} onChange={(v) => onChange({ ...transform, rotation: v }, false)} onCommit={(v) => onChange({ ...transform, rotation: v }, true)} />
        <Slider label="Opacity" value={transform.opacity} min={0} max={1} onChange={(v) => onChange({ ...transform, opacity: v }, false)} onCommit={(v) => onChange({ ...transform, opacity: v }, true)} />
      </Stack>
    </View>
  );
}

type TextTab = 'edit' | 'styles' | 'font' | 'colour' | 'outline' | 'box';

/** One-tap looks for text. Each replaces the styling but keeps the size and alignment. */
const TEXT_PRESETS: { name: string; style: Partial<TextStyle> }[] = [
  { name: 'Clean', style: { font: 'inter', weight: 'black', color: '#FFFFFF', strokeColor: null, background: null, shadow: true, uppercase: false, italic: false } },
  { name: 'Outline', style: { font: 'inter', weight: 'black', color: '#FFFFFF', strokeColor: '#111111', background: null, shadow: false, uppercase: true, italic: false } },
  { name: 'Pop', style: { font: 'rounded', weight: 'black', color: '#FFD23F', strokeColor: '#111111', background: null, shadow: true, uppercase: false, italic: false } },
  { name: 'Label', style: { font: 'inter', weight: 'bold', color: '#111111', strokeColor: null, background: '#FFFFFF', shadow: false, uppercase: false, italic: false } },
  { name: 'Saffron', style: { font: 'inter', weight: 'black', color: '#FFFFFF', strokeColor: null, background: '#FF7A1A', shadow: false, uppercase: true, italic: false } },
  { name: 'Editorial', style: { font: 'serif', weight: 'bold', color: '#FFFFFF', strokeColor: null, background: null, shadow: true, uppercase: false, italic: true } },
  { name: 'Terminal', style: { font: 'mono', weight: 'bold', color: '#3DDC84', strokeColor: null, background: '#111111', shadow: false, uppercase: false, italic: false } },
  { name: 'Neon', style: { font: 'rounded', weight: 'black', color: '#FF2E7E', strokeColor: '#FFFFFF', background: null, shadow: true, uppercase: true, italic: false } },
];

export function TextPanel({ text, style, onText, onStyle }: { text: string; style: TextStyle; onText: Change<string>; onStyle: Change<TextStyle> }) {
  const [tab, setTab] = useState<TextTab>('edit');
  const set = (patch: Partial<TextStyle>, commit = true) => onStyle({ ...style, ...patch }, commit);
  return (
    <View style={{ gap: 8 }}>
      <View style={{ paddingHorizontal: 14 }}>
        <Segmented
          options={[
            { value: 'edit', label: 'Edit' },
            { value: 'styles', label: 'Styles' },
            { value: 'font', label: 'Font' },
            { value: 'colour', label: 'Colour' },
            { value: 'outline', label: 'Outline' },
            { value: 'box', label: 'Box' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      {tab === 'edit' && (
        <View style={{ paddingHorizontal: 14, gap: 6 }}>
          <TextInput
            value={text}
            onChangeText={(v) => onText(v, false)}
            onEndEditing={(e) => onText(e.nativeEvent.text, true)}
            multiline
            placeholder="Type your text"
            placeholderTextColor={colors.textDim}
            style={{ minHeight: 40, maxHeight: 76, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: colors.surface2, color: colors.text, fontFamily: fonts.medium }}
          />
          <Row gap={6}>
            {(['left', 'center', 'right'] as const).map((a) => (
              <Chip key={a} label={a[0].toUpperCase() + a.slice(1)} selected={style.align === a} onPress={() => set({ align: a })} />
            ))}
          </Row>
        </View>
      )}
      {tab === 'styles' && (
        <Strip>
          {TEXT_PRESETS.map((p) => (
            <Chip key={p.name} label={p.name} onPress={() => set(p.style)} />
          ))}
        </Strip>
      )}
      {tab === 'font' && (
        <>
          <Strip>
            {FONTS.map((f) => (
              <Chip key={f.id} label={f.name} selected={style.font === f.id} onPress={() => set({ font: f.id })} />
            ))}
            <View style={{ width: 1, height: 20, backgroundColor: colors.line }} />
            {(['regular', 'bold', 'black'] as const).map((w) => (
              <Chip key={w} label={w[0].toUpperCase() + w.slice(1)} selected={style.weight === w} onPress={() => set({ weight: w })} />
            ))}
            <Chip label="Italic" selected={style.italic} onPress={() => set({ italic: !style.italic })} />
            <Chip label="CAPS" selected={style.uppercase} onPress={() => set({ uppercase: !style.uppercase })} />
          </Strip>
          <Stack>
            <Slider label="Size" value={style.size} min={10} max={96} format={(v) => String(Math.round(v))} onChange={(v) => set({ size: v }, false)} onCommit={(v) => set({ size: v })} />
            <Slider label="Spacing" value={style.letterSpacing} min={-2} max={12} format={(v) => v.toFixed(1)} onChange={(v) => set({ letterSpacing: v }, false)} onCommit={(v) => set({ letterSpacing: v })} />
          </Stack>
        </>
      )}
      {tab === 'colour' && (
        <>
          <Swatches value={style.color} onPick={(c) => c && set({ color: c })} />
          <View style={{ paddingHorizontal: 14 }}>
            <Chip label="Shadow" selected={style.shadow} onPress={() => set({ shadow: !style.shadow })} style={{ alignSelf: 'flex-start' }} />
          </View>
        </>
      )}
      {tab === 'outline' && <Swatches allowNone value={style.strokeColor} onPick={(c) => set({ strokeColor: c })} />}
      {tab === 'box' && <Swatches allowNone value={style.background} onPick={(c) => set({ background: c })} />}
    </View>
  );
}

export function CaptionStylePanel({ style, onChange, onSwapScript }: { style: CaptionStyle; onChange: Change<CaptionStyle>; onSwapScript?: () => void }) {
  return (
    <View style={{ gap: 8 }}>
      <Strip>
        {onSwapScript && <Chip label="Roman ⇄ देवनागरी" onPress={onSwapScript} />}
        {TEMPLATES.map((t) => (
          <Chip key={t.id} label={t.name} selected={style.template === t.id} onPress={() => onChange({ ...style, template: t.id }, true)} />
        ))}
      </Strip>
      <Stack>
        <Slider label="Size" value={style.size} min={10} max={48} format={(v) => String(Math.round(v))} onChange={(v) => onChange({ ...style, size: v }, false)} onCommit={(v) => onChange({ ...style, size: v }, true)} />
        <Slider label="Position" value={style.y} min={0.08} max={0.92} onChange={(v) => onChange({ ...style, y: v }, false)} onCommit={(v) => onChange({ ...style, y: v }, true)} />
      </Stack>
    </View>
  );
}

export function ActionsPanel({ actions }: { actions: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void; busy?: boolean }[] }) {
  return (
    <Strip>
      {actions.map((a) => (
        <Pressable key={a.label} accessibilityRole="button" accessibilityState={{ disabled: !!a.busy }} hitSlop={{ top: 4, bottom: 4 }} onPress={a.onPress} disabled={a.busy} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, height: 40, borderRadius: 99, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line, opacity: a.busy ? 0.4 : pressed ? 0.7 : 1 })}>
          <Ionicons name={a.icon} size={15} color={colors.saffronText} />
          <T style={{ fontFamily: fonts.semibold, fontSize: 13 }}>{a.label}</T>
        </Pressable>
      ))}
    </Strip>
  );
}

const BACKGROUNDS = ['#000000', '#FFFFFF', '#15151C', '#FF7A1A', '#FF2E7E', '#2D6BFF', '#3DDC84', '#FFD23F'];

export function CanvasPanel({ aspect, background, onAspect, onBackground }: { aspect: EditAspect; background: Background; onAspect: (a: EditAspect) => void; onBackground: (b: Background) => void }) {
  return (
    <View style={{ gap: 8 }}>
      <Strip>
        {ASPECTS.map((a) => (
          <Chip key={a} label={a === 'original' ? 'Original' : a} selected={aspect === a} onPress={() => onAspect(a)} />
        ))}
      </Strip>
      <Strip>
        <T variant="muted">Background</T>
        {BACKGROUNDS.map((c) => (
          <Pressable key={c} accessibilityRole="button" accessibilityLabel={`Background ${c}`} hitSlop={6} onPress={() => onBackground({ type: 'color', color: c })} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c, borderWidth: 2, borderColor: background.type === 'color' && background.color === c ? colors.highlight : colors.lineStrong }} />
        ))}
      </Strip>
    </View>
  );
}

const EMOJI = '🔥 😂 😍 🤯 👏 💯 ❤️ ✨ 🎉 👀 🙏 💪 😎 🤔 😭 🥳 👍 👇 👉 ⭐ 💰 📈 🚀 🎯 ⚡ 🎬 🎵 📌 ✅ ❌ ⚠️ 💡 🏆 🤝 🇮🇳 🪔 ☕ 📱 💬 ➡️'.split(' ');

export function StickerPanel({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <Strip>
      {EMOJI.map((e) => (
        <Pressable key={e} accessibilityRole="button" accessibilityLabel={`Sticker ${e}`} onPress={() => onPick(e)} style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
          <T style={{ fontSize: 26 }}>{e}</T>
        </Pressable>
      ))}
    </Strip>
  );
}

export function EffectsPanel({ current, onPick }: { current?: EffectId; onPick: (id: EffectId) => void }) {
  return (
    <Strip>
      {EFFECTS.map((e) => (
        <Chip key={e.id} label={e.name} selected={current === e.id} onPress={() => onPick(e.id)} />
      ))}
    </Strip>
  );
}

export function BlendPanel({ blend, mask, onBlend, onMask }: { blend: BlendMode; mask: Mask; onBlend?: (b: BlendMode) => void; onMask: (m: Mask) => void }) {
  return (
    <View style={{ gap: 8 }}>
      {onBlend && (
      <Strip>
        <T variant="muted">Blend</T>
        {BLEND_MODES.map((b) => (
          <Chip key={b} label={b[0].toUpperCase() + b.slice(1)} selected={blend === b} onPress={() => onBlend(b)} />
        ))}
      </Strip>
      )}
      <Strip>
        <T variant="muted">Mask</T>
        {(['none', 'circle', 'rounded'] as const).map((m) => (
          <Chip key={m} label={m[0].toUpperCase() + m.slice(1)} selected={mask === m} onPress={() => onMask(m)} />
        ))}
      </Strip>
    </View>
  );
}

/**
 * The transcript as an editing surface: tap a word to jump to it, then cut it (which
 * cuts the video) or mark it as a keyword. Filler words are underlined.
 */
export function TranscriptPanel({
  captions,
  time,
  isFiller,
  onSeek,
  onCut,
  onEmphasis,
  onRemoveFillers,
}: {
  captions: Caption[];
  time: number;
  isFiller: (text: string) => boolean;
  onSeek: (t: number) => void;
  onCut: (captionId: string, index: number) => void;
  onEmphasis: (captionId: string, index: number, on: boolean) => void;
  onRemoveFillers: () => void;
}) {
  const [picked, setPicked] = useState<{ id: string; index: number } | null>(null);
  const all = captions.filter((c) => c.words?.length).sort((a, b) => a.start - b.start);
  // A long video has thousands of words; show the lines around the playhead and follow it.
  const here = Math.max(0, all.findIndex((c) => c.start + c.duration > time));
  const timed = all.slice(Math.max(0, here - 4), here + 12);
  const fillers = all.reduce((n, c) => n + c.words!.filter((w) => isFiller(w.text)).length, 0);
  const pickedWord = picked ? timed.find((c) => c.id === picked.id)?.words?.[picked.index] : undefined;
  return (
    <View style={{ gap: 8 }}>
      <ScrollView style={{ maxHeight: 116 }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12 }} showsVerticalScrollIndicator={false}>
        {timed.map((c) =>
          c.words!.map((w, i) => {
            const selected = picked?.id === c.id && picked.index === i;
            const spoken = time >= c.start + w.t0 && time < c.start + w.t1;
            return (
              <Pressable
                key={`${c.id}-${i}`}
                accessibilityRole="button"
                accessibilityLabel={w.text}
                accessibilityState={{ selected }}
                onPress={() => {
                  setPicked(selected ? null : { id: c.id, index: i });
                  onSeek(c.start + w.t0 + 0.01);
                }}
                style={{ paddingHorizontal: 5, height: 36, justifyContent: 'center', borderRadius: 8, backgroundColor: selected ? colors.saffronSoft : spoken ? colors.surface2 : 'transparent', borderWidth: 1, borderColor: selected ? colors.saffron : 'transparent' }}>
                <T style={{ fontSize: 16, fontFamily: w.emphasis ? fonts.bold : fonts.medium, color: w.emphasis ? colors.highlight : colors.text, textDecorationLine: isFiller(w.text) ? 'underline' : 'none', textDecorationColor: colors.amber }}>{w.text}</T>
              </Pressable>
            );
          }),
        )}
      </ScrollView>
      <Strip>
        {picked && pickedWord ? (
          <>
            <Chip
              label="Cut word"
              onPress={() => {
                onCut(picked.id, picked.index);
                setPicked(null);
              }}
            />
            <Chip label={pickedWord.emphasis ? 'Remove highlight' : 'Highlight'} selected={!!pickedWord.emphasis} onPress={() => onEmphasis(picked.id, picked.index, !pickedWord.emphasis)} />
          </>
        ) : (
          <T variant="muted">Tap a word to cut it or highlight it.</T>
        )}
        {fillers > 0 && <Chip label={`Remove ${fillers} filler ${fillers === 1 ? 'word' : 'words'}`} onPress={onRemoveFillers} />}
      </Strip>
    </View>
  );
}
