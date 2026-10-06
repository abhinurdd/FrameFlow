import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { ANIMATIONS, EFFECTS, IDENTITY, TRANSITIONS, type Animation, type EffectId, type Transform, type Transition } from '@/engine/animate';
import { ADJUST_SLIDERS, FILTERS, NO_ADJUST, type Look } from '@/engine/looks';
import { ASPECTS, BLEND_MODES, FONTS, SPEEDS, type Background, type BlendMode, type CaptionStyle, type EditAspect, type Fit, type Mask, type TextStyle } from '@/engine/timeline';
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
        <Pressable onPress={() => onPick(null)} style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: value === null ? colors.highlight : colors.lineStrong, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="ban-outline" size={14} color={colors.textMuted} />
        </Pressable>
      )}
      {SWATCHES.map((c) => (
        <Pressable key={c} onPress={() => onPick(c)} style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: c, borderWidth: 2, borderColor: value === c ? colors.highlight : colors.lineStrong }} />
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
    <ScrollView style={{ maxHeight: 150 }} showsVerticalScrollIndicator={false}>
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

export function SpeedPanel({ speed, onChange }: { speed: number; onChange: (s: number) => void }) {
  return (
    <Strip>
      {SPEEDS.map((s) => (
        <Chip key={s} label={`${s}x`} selected={speed === s} onPress={() => onChange(s)} />
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

type TextTab = 'edit' | 'font' | 'colour' | 'outline' | 'box';

export function TextPanel({ text, style, onText, onStyle }: { text: string; style: TextStyle; onText: Change<string>; onStyle: Change<TextStyle> }) {
  const [tab, setTab] = useState<TextTab>('edit');
  const set = (patch: Partial<TextStyle>, commit = true) => onStyle({ ...style, ...patch }, commit);
  return (
    <View style={{ gap: 8 }}>
      <View style={{ paddingHorizontal: 14 }}>
        <Segmented
          options={[
            { value: 'edit', label: 'Edit' },
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

export function CaptionStylePanel({ style, onChange }: { style: CaptionStyle; onChange: Change<CaptionStyle> }) {
  return (
    <View style={{ gap: 8 }}>
      <Strip>
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
        <Pressable key={a.label} onPress={a.onPress} disabled={a.busy} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 36, borderRadius: 99, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line, opacity: a.busy ? 0.5 : 1 }}>
          <Ionicons name={a.icon} size={15} color={colors.saffronText} />
          <T style={{ fontFamily: fonts.semibold, fontSize: 12.5 }}>{a.label}</T>
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
        <Chip label="Blur" selected={background.type === 'blur'} onPress={() => onBackground({ type: 'blur' })} />
        {BACKGROUNDS.map((c) => (
          <Pressable key={c} onPress={() => onBackground({ type: 'color', color: c })} style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: c, borderWidth: 2, borderColor: background.type === 'color' && background.color === c ? colors.highlight : colors.lineStrong }} />
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
        <Pressable key={e} onPress={() => onPick(e)} style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
          <T style={{ fontSize: 22 }}>{e}</T>
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

export function BlendPanel({ blend, mask, onBlend, onMask }: { blend: BlendMode; mask: Mask; onBlend: (b: BlendMode) => void; onMask: (m: Mask) => void }) {
  return (
    <View style={{ gap: 8 }}>
      <Strip>
        <T variant="muted">Blend</T>
        {BLEND_MODES.map((b) => (
          <Chip key={b} label={b[0].toUpperCase() + b.slice(1)} selected={blend === b} onPress={() => onBlend(b)} />
        ))}
      </Strip>
      <Strip>
        <T variant="muted">Mask</T>
        {(['none', 'circle', 'rounded'] as const).map((m) => (
          <Chip key={m} label={m[0].toUpperCase() + m.slice(1)} selected={mask === m} onPress={() => onMask(m)} />
        ))}
      </Strip>
    </View>
  );
}
