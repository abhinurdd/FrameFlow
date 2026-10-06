import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';

import { audioDuration, segmentDuration, segmentStarts, totalDuration, transitionDuration, type Edit, type Segment, type TrackId } from '@/engine/timeline';
import { T } from '@/ui/primitives';
import { colors, fonts } from '@/ui/theme';

import { SegmentStrip } from './thumbs';
import type { Selection } from './types';

const RULER_H = 22;
const MAIN_H = 52;
const LANE_H = 28;
/** The timeline always takes this much room, so nothing above it moves as tracks are added. */
export const TIMELINE_H = RULER_H + MAIN_H + 6 + LANE_H * 4.4;
const RULER_STEPS = [0.5, 1, 2, 5, 10, 30, 60, 300];
const ZOOM_MIN = 4;
const ZOOM_MAX = 600;

const TRACKS: { id: TrackId; name: string; color: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'overlays', name: 'Overlay', color: colors.trackOverlay, icon: 'layers' },
  { id: 'texts', name: 'Text', color: colors.trackText, icon: 'text' },
  { id: 'captions', name: 'Caption', color: colors.trackCaption, icon: 'chatbox-ellipses' },
  { id: 'effects', name: 'Effect', color: colors.trackEffect, icon: 'sparkles' },
  { id: 'audio', name: 'Audio', color: colors.trackAudio, icon: 'musical-notes' },
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
    case 'effects': return edit.effects.map((e) => ({ id: e.id, start: e.start, duration: e.duration, label: e.type[0].toUpperCase() + e.type.slice(1) }));
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

function Handle({ side, label, onDrag, scroller, height }: { side: 'start' | 'end'; label: string; onDrag: (dx: number) => void; scroller: RefObject<ScrollView | null>; height: number }) {
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
        accessibilityLabel={label}
        hitSlop={{ left: 14, right: 14, top: 8, bottom: 8 }}
        style={[
          { position: 'absolute', top: 0, height, width: 16, backgroundColor: colors.select, alignItems: 'center', justifyContent: 'center', transform: [{ translateX: dx }], zIndex: 3 },
          // Kept inside the item's bounds: iOS ignores touches outside a parent's frame.
          side === 'start' ? { left: 0, borderTopLeftRadius: 6, borderBottomLeftRadius: 6 } : { right: 0, borderTopRightRadius: 6, borderBottomRightRadius: 6 },
        ]}>
        <View style={{ width: 3, height: height * 0.4, borderRadius: 2, backgroundColor: colors.ink }} />
      </View>
    </GestureDetector>
  );
}

function ItemBar({
  bar,
  track,
  color,
  pps,
  selected,
  scroller,
  onPress,
  onMove,
  onTrim,
}: {
  bar: Bar;
  track: string;
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
  const height = LANE_H - 4;
  return (
    <GestureDetector gesture={move}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${track}: ${bar.label}, ${bar.duration.toFixed(1)} seconds`}
        accessibilityState={{ selected }}
        accessibilityHint="Hold and drag to move"
        hitSlop={{ top: 4, bottom: 4 }}
        onPress={onPress}
        style={({ pressed }) => ({
          position: 'absolute',
          left: bar.start * pps,
          width: Math.max(bar.duration * pps, 10),
          height,
          borderRadius: 6,
          paddingHorizontal: selected ? 20 : 7,
          justifyContent: 'center',
          backgroundColor: `${color}${selected ? '66' : '40'}`,
          borderWidth: 1.5,
          borderColor: selected ? colors.select : color,
          transform: [{ translateX: dx }],
          opacity: dx ? 0.75 : pressed ? 0.8 : 1,
        })}>
        <T numberOfLines={1} style={{ fontSize: 11, fontFamily: fonts.semibold }}>{bar.label}</T>
        {selected && <Handle side="start" label="Trim start" height={height - 3} scroller={scroller} onDrag={(d) => onTrim('start', d / pps)} />}
        {selected && <Handle side="end" label="Trim end" height={height - 3} scroller={scroller} onDrag={(d) => onTrim('end', d / pps)} />}
      </Pressable>
    </GestureDetector>
  );
}

function ZoomButton({ icon, label, onPress }: { icon: 'add' | 'remove'; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={8} onPress={onPress} style={({ pressed }) => ({ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.lineStrong : colors.surface2 })}>
      <Ionicons name={icon} size={16} color={colors.textSecondary} />
    </Pressable>
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
  onAddClip,
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
  /** The button between two clips: opens transitions for the clip on the left. */
  onTransition: (segmentId: string) => void;
  onAddClip: () => void;
}) {
  const { width: screenW } = useWindowDimensions();
  const [pps, setPps] = useState(60);
  const [pinchBase, setPinchBase] = useState(60);
  const scroller = useRef<ScrollView>(null);
  const userScrolling = useRef(false);
  const zoom = (factor: number) => setPps((p) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, p * factor)));

  // Keep the timeline under the fixed playhead while playing or after an edit.
  useEffect(() => {
    if (!userScrolling.current) scroller.current?.scrollTo({ x: time * pps, animated: false });
  }, [time, pps]);

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onStart(() => setPinchBase(pps))
    .onUpdate((e) => setPps(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, pinchBase * e.scale))));

  const total = totalDuration(edit);
  const starts = segmentStarts(edit);
  const step = RULER_STEPS.find((s) => s * pps >= 56) ?? 600;
  const ticks = Array.from({ length: Math.min(400, Math.floor(total / step) + 1) }, (_, i) => i * step);
  const rows = TRACKS.flatMap((track) => lanes(bars(edit, track.id)).map((lane, n) => ({ track, lane, first: n === 0 })));

  return (
    <GestureDetector gesture={pinch}>
      <View style={{ height: TIMELINE_H }}>
        <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled contentContainerStyle={{ paddingBottom: 6 }}>
          <View>
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
              <View style={{ width: Math.max(total * pps, 1) }}>
                <View style={{ height: RULER_H }}>
                  {ticks.map((t) => (
                    <T key={t} style={{ position: 'absolute', left: t * pps, top: 4, fontSize: 10.5, color: colors.textMuted }}>
                      {step < 1 ? t.toFixed(1) : clock(t).replace(/\.\d$/, '')}
                    </T>
                  ))}
                  {edit.markers.map((m, i) => (
                    <View key={i} style={{ position: 'absolute', left: m * pps - 3, top: 15, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.amber }} />
                  ))}
                </View>

                <View style={{ height: MAIN_H }}>
                  {edit.main.map((seg, i) => {
                    const selected = selection?.track === 'main' && selection.id === seg.id;
                    const width = segmentDuration(seg) * pps;
                    const asset = edit.assets[seg.assetId];
                    return (
                      <Pressable
                        key={seg.id}
                        accessibilityRole="button"
                        accessibilityLabel={`Clip ${i + 1}, ${segmentDuration(seg).toFixed(1)} seconds`}
                        accessibilityState={{ selected }}
                        onPress={() => onSelect({ track: 'main', id: seg.id })}
                        style={{ position: 'absolute', left: starts[i] * pps, width, height: MAIN_H, zIndex: selected ? 2 : 0 }}>
                        <View style={{ flex: 1, marginHorizontal: 1, borderRadius: 7, overflow: 'hidden', borderWidth: 2, borderColor: selected ? colors.select : 'transparent' }}>
                          {asset && <SegmentStrip asset={asset} segment={seg} width={Math.max(width - 6, 1)} height={MAIN_H - 4} />}
                          {width > 48 && (seg.speed !== 1 || seg.muted || seg.look.filter !== 'none' || seg.keyframes.length > 0) && (
                            <View style={{ position: 'absolute', left: selected ? 20 : 4, top: 4, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 5, height: 16, borderRadius: 4, backgroundColor: colors.scrim }}>
                              {seg.speed !== 1 && <T style={{ fontSize: 10.5, fontFamily: fonts.bold }}>{seg.speed}x</T>}
                              {seg.muted && <Ionicons name="volume-mute" size={11} color={colors.white} />}
                              {seg.look.filter !== 'none' && <Ionicons name="color-filter" size={11} color={colors.white} />}
                              {seg.keyframes.length > 0 && <Ionicons name="diamond" size={9} color={colors.white} />}
                            </View>
                          )}
                        </View>
                        {selected && <Handle side="start" label="Trim clip start" height={MAIN_H} scroller={scroller} onDrag={(d) => onTrimSegment(seg, 'in', (d / pps) * seg.speed)} />}
                        {selected && <Handle side="end" label="Trim clip end" height={MAIN_H} scroller={scroller} onDrag={(d) => onTrimSegment(seg, 'out', (d / pps) * seg.speed)} />}
                      </Pressable>
                    );
                  })}
                  {edit.main.slice(0, -1).map((seg, i) => {
                    const overlap = transitionDuration(edit, i);
                    return (
                      <Pressable
                        key={`cut-${seg.id}`}
                        accessibilityRole="button"
                        accessibilityLabel={seg.transition ? `Transition after clip ${i + 1}` : `Add a transition after clip ${i + 1}`}
                        hitSlop={12}
                        onPress={() => onTransition(seg.id)}
                        style={({ pressed }) => ({ position: 'absolute', left: (starts[i + 1] + overlap / 2) * pps - 11, top: MAIN_H / 2 - 11, width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: seg.transition ? colors.saffron : colors.white, opacity: pressed ? 0.7 : 1, zIndex: 4 })}>
                        <Ionicons name={seg.transition ? 'swap-horizontal' : 'remove'} size={13} color={colors.ink} />
                      </Pressable>
                    );
                  })}
                </View>

                {rows.map(({ track, lane }, r) => (
                  <View key={r} style={{ height: LANE_H, marginTop: r === 0 ? 6 : 0 }}>
                    {lane.map((bar) => (
                      <ItemBar
                        key={bar.id}
                        bar={bar}
                        track={track.name}
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

            {/* Track icons, pinned to the left edge */}
            <View pointerEvents="none" style={{ position: 'absolute', left: 6, top: RULER_H + MAIN_H + 6 }}>
              {rows.map(({ track, first }, r) => (
                <View key={r} style={{ height: LANE_H, justifyContent: 'flex-start' }}>
                  {first && (
                    <View style={{ width: 22, height: 22, marginTop: 2, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, borderWidth: 1, borderColor: track.color }}>
                      <Ionicons name={track.icon} size={11} color={track.color} />
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>
        </ScrollView>

        <View pointerEvents="none" style={{ position: 'absolute', left: screenW / 2 - 1, top: 14, bottom: 2, width: 2, borderRadius: 1, backgroundColor: colors.white }} />

        {/* Add a clip, and zoom for anyone who would rather not pinch */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add a clip"
          hitSlop={6}
          onPress={onAddClip}
          style={({ pressed }) => ({ position: 'absolute', right: 10, top: RULER_H + (MAIN_H - 38) / 2, width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, opacity: pressed ? 0.75 : 1 })}>
          <Ionicons name="add" size={24} color={colors.ink} />
        </Pressable>
        <View style={{ position: 'absolute', right: 8, bottom: 6, flexDirection: 'row', gap: 8 }}>
          <ZoomButton icon="remove" label="Zoom timeline out" onPress={() => zoom(1 / 1.5)} />
          <ZoomButton icon="add" label="Zoom timeline in" onPress={() => zoom(1.5)} />
        </View>
      </View>
    </GestureDetector>
  );
}
