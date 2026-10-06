import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Row, T } from '@/ui/primitives';
import { colors, fonts, TAP } from '@/ui/theme';

type IconName = keyof typeof Ionicons.glyphMap;

/** An icon-only control. `label` is what a screen reader announces. */
export function IconButton({ icon, label, onPress, disabled, size = 22, tint = colors.text }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean; size?: number; tint?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, opacity: disabled ? 0.3 : pressed ? 0.55 : 1 })}>
      <Ionicons name={icon} size={size} color={tint} />
    </Pressable>
  );
}

export type ToolDef = { icon: IconName; label: string; onPress: () => void; disabled?: boolean; on?: boolean; danger?: boolean };

/** One entry in the bottom toolbar. */
export function Tool({ icon, label, onPress, disabled, on, danger }: ToolDef) {
  const tint = on ? colors.saffronText : danger ? colors.danger : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected: !!on }}
      disabled={disabled}
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => ({ width: 68, height: TAP + 4, alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 12, backgroundColor: pressed ? colors.surface2 : 'transparent', opacity: disabled ? 0.3 : 1 })}>
      <Ionicons name={icon} size={22} color={tint} />
      <T numberOfLines={1} style={{ fontSize: 11, fontFamily: fonts.semibold, color: on ? colors.saffronText : danger ? colors.danger : colors.textSecondary }}>{label}</T>
    </Pressable>
  );
}

/**
 * The options sheet for the open tool. It sits over the timeline, never the canvas,
 * so the picture does not jump or get covered while a value is being changed.
 */
export function ToolSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderTopWidth: 1, borderColor: colors.line, paddingBottom: 12 }}>
      <Row style={{ height: 44, paddingLeft: 16, paddingRight: 4, justifyContent: 'space-between' }}>
        <T style={{ fontFamily: fonts.bold, fontSize: 14 }}>{title}</T>
        <IconButton icon="checkmark" label={`Close ${title}`} onPress={onClose} tint={colors.saffronText} />
      </Row>
      {children}
    </View>
  );
}

/** A floating status pill over the canvas for work in progress. */
export function BusyPill({ label }: { label: string }) {
  return (
    <View pointerEvents="none" accessibilityLiveRegion="polite" style={{ position: 'absolute', top: 10, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, height: 36, borderRadius: 18, backgroundColor: 'rgba(21,21,28,0.92)', borderWidth: 1, borderColor: colors.lineStrong }}>
      <ActivityIndicator size="small" color={colors.saffronText} />
      <T style={{ fontFamily: fonts.semibold, fontSize: 13 }}>{label}</T>
    </View>
  );
}
