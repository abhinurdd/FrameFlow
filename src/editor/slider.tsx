import { useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { Row, T } from '@/ui/primitives';
import { colors, fonts } from '@/ui/theme';

/** A labelled slider. `onChange` fires while dragging, `onCommit` once on release. */
export function Slider({
  label,
  value,
  min,
  max,
  format = (v) => String(Math.round(v * 100)),
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  format?: (v: number) => string;
  onChange?: (v: number) => void;
  onCommit: (v: number) => void;
}) {
  const [width, setWidth] = useState(1);
  const [live, setLive] = useState<number | null>(null);
  const shown = live ?? value;
  const at = (x: number) => {
    const v = min + Math.min(1, Math.max(0, x / width)) * (max - min);
    // Snap to the neutral point so "unchanged" is easy to hit.
    return min < 0 && Math.abs(v) < (max - min) * 0.03 ? 0 : v;
  };
  // Sideways drags only, so a slider inside a scrolling panel does not move when the panel is scrolled.
  const drag = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-6, 6])
    .failOffsetY([-12, 12])
    .onChange((e) => {
      const v = at(e.x);
      setLive(v);
      onChange?.(v);
    })
    .onEnd((e, success) => {
      if (success) onCommit(at(e.x));
    })
    .onFinalize(() => setLive(null));
  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((e, success) => {
      if (success) onCommit(at(e.x));
    });
  const pct = ((shown - min) / (max - min)) * 100;
  const zero = min < 0 ? (-min / (max - min)) * 100 : 0;
  return (
    <Row style={{ height: 40 }} gap={10}>
      <T style={{ width: 86, fontSize: 12, fontFamily: fonts.semibold, color: colors.textSecondary }}>{label}</T>
      <GestureDetector gesture={Gesture.Exclusive(drag, tap)}>
        <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ text: format(shown) }} style={{ flex: 1, height: 40, justifyContent: 'center' }}>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.lineStrong }} />
          <View style={{ position: 'absolute', height: 4, borderRadius: 2, backgroundColor: colors.saffron, left: `${Math.min(zero, pct)}%`, width: `${Math.abs(pct - zero)}%` }} />
          <View style={{ position: 'absolute', left: `${pct}%`, marginLeft: -11, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.white }} />
        </View>
      </GestureDetector>
      <T style={{ width: 36, textAlign: 'right', fontSize: 12, fontFamily: fonts.semibold, color: colors.textMuted }}>{format(shown)}</T>
    </Row>
  );
}
