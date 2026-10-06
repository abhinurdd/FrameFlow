import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text as RNText,
  View,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { colors, fonts, gradient, hasDevanagari, radius } from './theme';

type Variant = 'title' | 'h1' | 'h2' | 'body' | 'label' | 'muted' | 'tiny';

const variantStyle: Record<Variant, TextStyle> = {
  title: { fontFamily: fonts.heavy, fontSize: 26, letterSpacing: -0.4, color: colors.text },
  h1: { fontFamily: fonts.heavy, fontSize: 20, letterSpacing: -0.2, color: colors.text },
  h2: { fontFamily: fonts.bold, fontSize: 15, color: colors.text },
  body: { fontFamily: fonts.medium, fontSize: 14, color: colors.text },
  label: {
    fontFamily: fonts.heavy,
    fontSize: 10.5,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  muted: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.textMuted },
  tiny: { fontFamily: fonts.medium, fontSize: 11, color: colors.textMuted },
};

export function T({
  variant = 'body',
  style,
  children,
  ...rest
}: TextProps & { variant?: Variant }) {
  const deva = typeof children === 'string' && hasDevanagari(children);
  return (
    <RNText
      {...rest}
      style={[variantStyle[variant], deva && { fontFamily: fonts.deva }, style]}>
      {children}
    </RNText>
  );
}

export function GradientFill({ style, children }: { style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  return (
    <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={style}>
      {children}
    </LinearGradient>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  icon,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const inner = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      {loading ? <ActivityIndicator color={colors.text} /> : icon}
      <T style={{ fontFamily: fonts.heavy, fontSize: 15, color: variant === 'ghost' ? colors.textMuted : colors.text }}>
        {title}
      </T>
    </View>
  );
  const base: ViewStyle = { height: 52, borderRadius: 16, justifyContent: 'center', overflow: 'hidden' };
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      style={({ pressed }) => [{ opacity: disabled ? 0.45 : pressed ? 0.85 : 1 }, style]}>
      {variant === 'primary' ? (
        <GradientFill style={base}>{inner}</GradientFill>
      ) : (
        <View
          style={[
            base,
            variant === 'secondary' && {
              backgroundColor: colors.surface2,
              borderWidth: 1,
              borderColor: colors.line,
            },
          ]}>
          {inner}
        </View>
      )}
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  disabled,
  style,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      disabled={disabled}
      hitSlop={{ top: 6, bottom: 6 }}
      onPress={() => {
        Haptics.selectionAsync();
        onPress?.();
      }}
      style={({ pressed }) => [
        {
          paddingHorizontal: 14,
          height: 36,
          borderRadius: radius.pill,
          justifyContent: 'center',
          backgroundColor: selected ? colors.saffronSoft : colors.surface2,
          borderWidth: 1,
          borderColor: selected ? colors.saffron : colors.line,
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        },
        style,
      ]}>
      <T style={{ fontFamily: hasDevanagari(label) ? fonts.deva : fonts.semibold, fontSize: 13, color: selected ? colors.saffronText : colors.textSecondary }}>
        {label}
      </T>
    </Pressable>
  );
}

export function Segmented<V extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: 12, padding: 3, gap: 3 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              Haptics.selectionAsync();
              onChange(o.value);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={({ pressed }) => ({ flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center', backgroundColor: on ? colors.text : 'transparent', opacity: pressed ? 0.7 : 1 })}>
            <T style={{ fontFamily: hasDevanagari(o.label) ? fonts.deva : fonts.bold, fontSize: 12.5, color: on ? '#111' : colors.textMuted }}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => {
        Haptics.selectionAsync();
        onChange(!value);
      }}
      style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: value ? colors.saffron : colors.lineStrong, padding: 3, alignItems: value ? 'flex-end' : 'flex-start' }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' }} />
    </Pressable>
  );
}

export function Panel({ style, children }: { style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  return (
    <View style={[{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 12 }, style]}>
      {children}
    </View>
  );
}

export function Row({ style, children, gap = 8 }: { style?: StyleProp<ViewStyle>; children?: ReactNode; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Label({ children, style }: { children: string; style?: StyleProp<TextStyle> }) {
  return (
    <T variant="label" style={[{ marginTop: 16, marginBottom: 8 }, style]}>
      {children}
    </T>
  );
}
