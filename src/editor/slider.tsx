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
  const drag = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onBegin((e) => setLive(at(e.x)))
    .onChange((e) => {
      const v = at(e.x);
      setLive(v);
      onChange?.(v);
    })
    .onEnd((e) => onCommit(at(e.x)))
    .onFinalize(() => setLive(null));
  const pct = ((shown - min) / (max - min)) * 100;
  const zero = min < 0 ? (-min / (max - min)) * 100 : 0;
  return (
    <Row style={{ height: 34 }} gap={10}>
      <T style={{ width: 86, fontSize: 12, fontFamily: fonts.semibold, color: '#C9C9D6' }}>{label}</T>
      <GestureDetector gesture={drag}>
        <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ flex: 1, height: 34, justifyContent: 'center' }}>
          <View style={{ height: 3, borderRadius: 2, backgroundColor: colors.lineStrong }} />
          <View style={{ position: 'absolute', height: 3, borderRadius: 2, backgroundColor: colors.saffron, left: `${Math.min(zero, pct)}%`, width: `${Math.abs(pct - zero)}%` }} />
          <View style={{ position: 'absolute', left: `${pct}%`, marginLeft: -9, width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff' }} />
        </View>
      </GestureDetector>
      <T style={{ width: 36, textAlign: 'right', fontSize: 12, fontFamily: fonts.semibold, color: colors.textMuted }}>{format(shown)}</T>
    </Row>
  );
}
