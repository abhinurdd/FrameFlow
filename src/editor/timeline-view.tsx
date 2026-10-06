import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';

import { audioDuration, segmentDuration, segmentStarts, totalDuration, transitionDuration, type Edit, type Segment, type TrackId } from '@/engine/timeline';
import { T } from '@/ui/primitives';
import { colors, fonts } from '@/ui/theme';

import { SegmentStrip } from './thumbs';
import type { Selection } from './types';

const MAIN_H = 50;
const LANE_H = 24;
const SELECT = '#FFD23F';
const RULER_STEPS = [0.5, 1, 2, 5, 10, 30, 60, 300];

const TRACKS: { id: TrackId; color: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'overlays', color: '#2D6BFF', icon: 'layers-outline' },
  { id: 'texts', color: '#B33DFF', icon: 'text-outline' },
  { id: 'captions', color: '#FF7A1A', icon: 'chatbox-ellipses-outline' },
  { id: 'effects', color: '#FF2E7E', icon: 'sparkles-outline' },
  { id: 'audio', color: '#3DDC84', icon: 'musical-notes-outline' },
];

export function clock(t: number) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

type Bar = { id: string; start: number; duration: number; label: string };

function bars(edit: Edit, track: TrackId): Bar[] {
  switch (track) {
    case 'overlays': return edit.overlays.map((o) => ({ id: o.id, start: o.start, duration: o.duration, label: o.kind === 'sticker' ? (o.emoji ?? 'Sticker') : (edit.assets[o.assetId ?? '']?.name ?? (o.kind === 'video' ? 'Video' : 'Photo')) }));
    case 'texts': return edit.texts.map((t) => ({ id: t.id, start: t.start, duration: t.duration, label: t.text }));
    case 'captions': return edit.captions.map((c) => ({ id: c.id, start: c.start, duration: c.duration, label: c.text }));
    case 'effects': return edit.effects.map((e) => ({ id: e.id, start: e.start, duration: e.duration, label: e.type }));
    case 'audio': return edit.audio.map((a) => ({ id: a.id, start: a.start, duration: audioDuration(a), label: edit.assets[a.assetId]?.name ?? a.kind }));
  }
}

/** Put overlapping items on separate rows. */
function lanes(items: Bar[]): Bar[][] {
  const out: Bar[][] = [];
  for (const item of [...items].sort((a, b) => a.start - b.start)) {
    const lane = out.find((l) => l[l.length - 1].start + l[l.length - 1].duration <= item.start + 0.001);
    if (lane) lane.push(item);
    else out.push([item]);
  }
  return out;
}

function Handle({ side, onDrag, scroller, height }: { side: 'start' | 'end'; onDrag: (dx: number) => void; scroller: RefObject<ScrollView | null>; height: number }) {
  const [dx, setDx] = useState(0);
  const pan = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-3, 3])
    // The timeline must not scroll while a handle is being dragged.
    .blocksExternalGesture(scroller)
    .onChange((e) => setDx(e.translationX))
    .onEnd((e) => onDrag(e.translationX))
    .onFinalize(() => setDx(0));
  return (
    <GestureDetector gesture={pan}>
      <View
        hitSlop={{ left: 10, right: 10, top: 6, bottom: 6 }}
        style={[
          { position: 'absolute', top: 0, height, width: 14, backgroundColor: SELECT, alignItems: 'center', justifyContent: 'center', transform: [{ translateX: dx }], zIndex: 3 },
          // Kept inside the item's bounds: iOS ignores touches outside a parent's frame.
          side === 'start' ? { left: 0, borderTopLeftRadius: 5, borderBottomLeftRadius: 5 } : { right: 0, borderTopRightRadius: 5, borderBottomRightRadius: 5 },
        ]}>
        <View style={{ width: 2.5, height: height * 0.4, borderRadius: 2, backgroundColor: '#111' }} />
      </View>
    </GestureDetector>
  );
}

function ItemBar({
  bar,
  color,
  pps,
  selected,
  scroller,
  onPress,
  onMove,
  onTrim,
}: {
  bar: Bar;
  color: string;
  pps: number;
  selected: boolean;
  scroller: RefObject<ScrollView | null>;
  onPress: () => void;
  onMove: (seconds: number) => void;
  onTrim: (side: 'start' | 'end', seconds: number) => void;
}) {
  const [dx, setDx] = useState(0);
  // Hold, then drag, to slide an item along the timeline.
  const move = Gesture.Pan()
    .runOnJS(true)
    .activateAfterLongPress(220)
    .blocksExternalGesture(scroller)
    .onChange((e) => setDx(e.translationX))
    .onEnd((e) => onMove(e.translationX / pps))
    .onFinalize(() => setDx(0));
  return (
    <GestureDetector gesture={move}>
      <Pressable
        onPress={onPress}
        style={{ position: 'absolute', left: bar.start * pps, width: Math.max(bar.duration * pps, 6), height: LANE_H - 3, borderRadius: 5, paddingHorizontal: selected ? 16 : 6, justifyContent: 'center', backgroundColor: `${color}55`, borderWidth: 1.5, borderColor: selected ? SELECT : color, transform: [{ translateX: dx }], opacity: dx ? 0.8 : 1 }}>
        <T numberOfLines={1} style={{ fontSize: 10, fontFamily: fonts.semibold }}>{bar.label}</T>
        {selected && <Handle side="start" height={LANE_H - 6} scroller={scroller} onDrag={(d) => onTrim('start', d / pps)} />}
        {selected && <Handle side="end" height={LANE_H - 6} scroller={scroller} onDrag={(d) => onTrim('end', d / pps)} />}
      </Pressable>
    </GestureDetector>
  );
}

/**
 * The multi-track timeline. It scrolls under a fixed centre playhead; scrolling scrubs,
 * pinching zooms. The main track is magnetic, every other track holds free items.
 */
export function TimelineView({
  edit,
  time,
  selection,
  onSelect,
  onScrub,
  onScrubStart,
  onTrimSegment,
  onMoveItem,
  onTrimItem,
  onTransition,
}: {
  edit: Edit;
  time: number;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onScrub: (t: number) => void;
  onScrubStart: () => void;
  onTrimSegment: (segment: Segment, side: 'in' | 'out', seconds: number) => void;
  onMoveItem: (track: TrackId, id: string, seconds: number) => void;
  onTrimItem: (track: TrackId, id: string, side: 'start' | 'end', seconds: number) => void;
  /** The "+" between two clips: opens transitions for the clip on the left. */
  onTransition: (segmentId: string) => void;
}) {
  const { width: screenW } = useWindowDimensions();
  const [pps, setPps] = useState(60);
  const [pinchBase, setPinchBase] = useState(60);
  const scroller = useRef<ScrollView>(null);
  const userScrolling = useRef(false);

  // Keep the timeline under the fixed playhead while playing or after an edit.
  useEffect(() => {
    if (!userScrolling.current) scroller.current?.scrollTo({ x: time * pps, animated: false });
  }, [time, pps]);

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onStart(() => setPinchBase(pps))
    .onUpdate((e) => setPps(Math.min(600, Math.max(4, pinchBase * e.scale))));

  const total = totalDuration(edit);
  const starts = segmentStarts(edit);
  const step = RULER_STEPS.find((s) => s * pps >= 56) ?? 600;
  const ticks = Array.from({ length: Math.min(400, Math.floor(total / step) + 1) }, (_, i) => i * step);
  const rows = TRACKS.flatMap((track) => lanes(bars(edit, track.id)).map((lane) => ({ track, lane })));

  return (
    <GestureDetector gesture={pinch}>
      <View>
        <ScrollView style={{ maxHeight: 22 + MAIN_H + 8 + LANE_H * 4 }} showsVerticalScrollIndicator={false} nestedScrollEnabled>
          <ScrollView
            ref={scroller}
            horizontal
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            contentContainerStyle={{ paddingHorizontal: screenW / 2 }}
            onScrollBeginDrag={() => {
              userScrolling.current = true;
              onScrubStart();
            }}
            onScroll={(e) => {
              if (userScrolling.current) onScrub(e.nativeEvent.contentOffset.x / pps);
            }}
            onScrollEndDrag={(e) => {
              if (Math.abs(e.nativeEvent.velocity?.x ?? 0) < 0.05) userScrolling.current = false;
            }}
            onMomentumScrollEnd={() => {
              userScrolling.current = false;
            }}>
            <View style={{ width: Math.max(total * pps, 1), paddingBottom: 6 }}>
              <View style={{ height: 22 }}>
                {ticks.map((t) => (
                  <T key={t} style={{ position: 'absolute', left: t * pps, top: 4, fontSize: 9.5, color: colors.textDim }}>
                    {step < 1 ? t.toFixed(1) : clock(t).replace(/\.\d$/, '')}
                  </T>
                ))}
                {edit.markers.map((m, i) => (
                  <View key={i} style={{ position: 'absolute', left: m * pps - 2, top: 16, width: 4, height: 4, borderRadius: 2, backgroundColor: colors.amber }} />
                ))}
              </View>

              <View style={{ height: MAIN_H }}>
                {edit.main.map((seg, i) => {
                  const selected = selection?.track === 'main' && selection.id === seg.id;
                  const width = segmentDuration(seg) * pps;
                  return (
                    <Pressable key={seg.id} onPress={() => onSelect({ track: 'main', id: seg.id })} style={{ position: 'absolute', left: starts[i] * pps, width, height: MAIN_H, zIndex: selected ? 2 : 0 }}>
                      <View style={{ flex: 1, marginHorizontal: 1, borderRadius: 6, overflow: 'hidden', borderWidth: 2, borderColor: selected ? SELECT : 'transparent' }}>
                        <SegmentStrip asset={edit.assets[seg.assetId]} segment={seg} width={Math.max(width - 6, 1)} height={MAIN_H - 4} />
                        {width > 44 && (seg.speed !== 1 || seg.muted || seg.look.filter !== 'none' || seg.keyframes.length > 0) && (
                          <View style={{ position: 'absolute', left: 4, top: 4, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 5, borderRadius: 4, backgroundColor: 'rgba(0,0,0,.65)' }}>
                            {seg.speed !== 1 && <T style={{ fontSize: 9.5, fontFamily: fonts.bold }}>{seg.speed}x</T>}
                            {seg.muted && <Ionicons name="volume-mute" size={11} color="#fff" />}
                            {seg.look.filter !== 'none' && <Ionicons name="color-filter" size={11} color="#fff" />}
                            {seg.keyframes.length > 0 && <Ionicons name="diamond" size={9} color="#fff" />}
                          </View>
                        )}
                      </View>
                      {selected && <Handle side="start" height={MAIN_H} scroller={scroller} onDrag={(d) => onTrimSegment(seg, 'in', (d / pps) * seg.speed)} />}
                      {selected && <Handle side="end" height={MAIN_H} scroller={scroller} onDrag={(d) => onTrimSegment(seg, 'out', (d / pps) * seg.speed)} />}
                    </Pressable>
                  );
                })}
                {edit.main.slice(0, -1).map((seg, i) => {
                  const overlap = transitionDuration(edit, i);
                  return (
                    <Pressable
                      key={`cut-${seg.id}`}
                      hitSlop={6}
                      onPress={() => onTransition(seg.id)}
                      style={{ position: 'absolute', left: (starts[i + 1] + overlap / 2) * pps - 10, top: MAIN_H / 2 - 10, width: 20, height: 20, borderRadius: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: seg.transition ? colors.saffron : '#fff', zIndex: 4 }}>
                      <Ionicons name={seg.transition ? 'swap-horizontal' : 'remove'} size={12} color="#111" />
                    </Pressable>
                  );
                })}
              </View>

              {rows.map(({ track, lane }, r) => (
                <View key={r} style={{ height: LANE_H, marginTop: r === 0 ? 5 : 0 }}>
                  {lane.map((bar) => (
                    <ItemBar
                      key={bar.id}
                      bar={bar}
                      color={track.color}
                      pps={pps}
                      scroller={scroller}
                      selected={selection?.track === track.id && selection.id === bar.id}
                      onPress={() => onSelect({ track: track.id, id: bar.id })}
                      onMove={(s) => onMoveItem(track.id, bar.id, s)}
                      onTrim={(side, s) => onTrimItem(track.id, bar.id, side, s)}
                    />
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        </ScrollView>
        <View pointerEvents="none" style={{ position: 'absolute', left: screenW / 2 - 1, top: 14, bottom: 2, width: 2, borderRadius: 1, backgroundColor: '#fff' }} />
      </View>
    </GestureDetector>
  );
}
