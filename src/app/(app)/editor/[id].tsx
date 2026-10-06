import { Ionicons } from '@expo/vector-icons';
import { VideoView } from 'expo-video';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Alert, Pressable, TextInput, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import { pickVideos } from '@/editor/pick';
import { SegmentStrip } from '@/editor/thumbs';
import { usePlayback } from '@/editor/use-playback';
import {
  addText,
  appendAssets,
  ASPECTS,
  aspectRatio,
  duplicateSegment,
  locate,
  moveSegment,
  patchSegment,
  patchText,
  removeSegment,
  removeText,
  segmentDuration,
  segmentStarts,
  SPEEDS,
  splitAt,
  totalDuration,
  trimSegment,
  type Edit,
  type Segment,
  type TextItem,
} from '@/engine/timeline';
import { uid, useEdits } from '@/state/edits';
import { Button, Chip, Row, T } from '@/ui/primitives';
import { colors, fonts } from '@/ui/theme';

const TRACK_H = 54;
const TEXT_H = 26;
const SELECT = '#FFD23F';
const TEXT_COLORS = ['#FFFFFF', '#FFD23F', '#FF7A1A', '#FF2E7E', '#3DDC84', '#2D6BFF', '#111111'];
const RULER_STEPS = [0.5, 1, 2, 5, 10, 30, 60, 300];

type Selection = { kind: 'segment' | 'text'; id: string } | null;
type PanelId = 'speed' | 'volume' | 'aspect' | null;

function clock(t: number) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

function useEditHistory(edit: Edit | undefined) {
  const setEdit = useEdits((s) => s.setEdit);
  const [history, setHistory] = useState<{ past: Edit[]; future: Edit[] }>({ past: [], future: [] });
  return {
    commit(next: Edit) {
      if (!edit || next === edit) return;
      setHistory((h) => ({ past: [...h.past, edit], future: [] }));
      setEdit(next);
    },
    undo() {
      const prev = history.past[history.past.length - 1];
      if (!prev || !edit) return undefined;
      setHistory((h) => ({ past: h.past.slice(0, -1), future: [...h.future, edit] }));
      setEdit(prev);
      return prev;
    },
    redo() {
      const next = history.future[history.future.length - 1];
      if (!next || !edit) return undefined;
      setHistory((h) => ({ past: [...h.past, edit], future: h.future.slice(0, -1) }));
      setEdit(next);
      return next;
    },
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}

function IconButton({ icon, onPress, disabled, size = 20 }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void; disabled?: boolean; size?: number }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={8} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.3 : 1 }}>
      <Ionicons name={icon} size={size} color={colors.text} />
    </Pressable>
  );
}

function Tool({ icon, label, onPress, disabled, on }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; disabled?: boolean; on?: boolean }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      style={{ width: 62, alignItems: 'center', gap: 4, opacity: disabled ? 0.3 : 1 }}>
      <Ionicons name={icon} size={20} color={on ? colors.saffronText : colors.text} />
      <T style={{ fontSize: 10.5, fontFamily: fonts.semibold, color: on ? colors.saffronText : '#C9C9D6' }}>{label}</T>
    </Pressable>
  );
}

/** A text overlay on the canvas. Drag to move it once it is selected. */
function TextLayer({ item, canvas, selected, onSelect, onMove }: { item: TextItem; canvas: { w: number; h: number }; selected: boolean; onSelect: () => void; onMove: (x: number, y: number) => void }) {
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const pan = Gesture.Pan()
    .runOnJS(true)
    .enabled(selected)
    .onChange((e) => setDrag({ x: e.translationX, y: e.translationY }))
    .onEnd((e) => {
      const clamp = (v: number) => Math.min(0.95, Math.max(0.05, v));
      onMove(clamp(item.x + e.translationX / canvas.w), clamp(item.y + e.translationY / canvas.h));
      setDrag({ x: 0, y: 0 });
    });
  return (
    <GestureDetector gesture={pan}>
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, top: item.y * canvas.h + drag.y - item.size, alignItems: 'center', transform: [{ translateX: (item.x - 0.5) * canvas.w + drag.x }] }}>
        <Pressable onPress={onSelect} style={{ paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderStyle: 'dashed', borderColor: selected ? SELECT : 'transparent' }}>
          <T style={{ fontFamily: fonts.heavy, fontSize: item.size, color: item.color, textAlign: 'center', textShadowColor: 'rgba(0,0,0,.7)', textShadowRadius: 4 }}>{item.text}</T>
        </Pressable>
      </View>
    </GestureDetector>
  );
}

function TrimHandle({ side, onTrim, scroller }: { side: 'in' | 'out'; onTrim: (dx: number) => void; scroller: RefObject<ScrollView | null> }) {
  const [dx, setDx] = useState(0);
  const pan = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-3, 3])
    // The timeline must not scroll while a handle is being dragged.
    .blocksExternalGesture(scroller)
    .onChange((e) => setDx(e.translationX))
    .onEnd((e) => onTrim(e.translationX))
    .onFinalize(() => setDx(0));
  return (
    <GestureDetector gesture={pan}>
      <View
        hitSlop={{ left: 12, right: 12, top: 6, bottom: 6 }}
        style={[
          { position: 'absolute', top: 0, bottom: 0, width: 16, backgroundColor: SELECT, alignItems: 'center', justifyContent: 'center', transform: [{ translateX: dx }] },
          // Kept inside the segment's bounds: iOS ignores touches outside a parent's frame.
          side === 'in' ? { left: 0, borderTopLeftRadius: 6, borderBottomLeftRadius: 6 } : { right: 0, borderTopRightRadius: 6, borderBottomRightRadius: 6 },
        ]}>
        <View style={{ width: 3, height: 18, borderRadius: 2, backgroundColor: '#111' }} />
      </View>
    </GestureDetector>
  );
}

export default function Editor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const edit = useEdits((s) => s.edits.find((e) => e.id === id));
  const history = useEditHistory(edit);
  const playback = usePlayback(() => useEdits.getState().edits.find((e) => e.id === id));
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [pps, setPps] = useState(60);
  const [selection, setSelection] = useState<Selection>(null);
  const [panel, setPanel] = useState<PanelId>(null);
  const scroller = useRef<ScrollView>(null);
  const userScrolling = useRef(false);
  const [pinchBase, setPinchBase] = useState(60);
  const { time, playing, seek } = playback;

  // Load the first frame once the draft is available.
  const ready = !!edit;
  useEffect(() => {
    if (ready) seek(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Keep the timeline under the fixed playhead while playing or after an edit.
  useEffect(() => {
    if (!userScrolling.current) scroller.current?.scrollTo({ x: time * pps, animated: false });
  }, [time, pps]);

  if (!edit) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <T variant="muted">This draft no longer exists.</T>
        <Button title="Back" variant="secondary" style={{ width: 140 }} onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  const total = totalDuration(edit);
  const starts = segmentStarts(edit);
  const here = locate(edit, time);
  const selectedText = selection?.kind === 'text' ? edit.texts.find((t) => t.id === selection.id) : undefined;
  // Tools act on the tapped segment, or on whatever is under the playhead.
  const target: Segment | undefined = (selection?.kind === 'segment' ? edit.main.find((s) => s.id === selection.id) : undefined) ?? here?.segment;

  const ratio = aspectRatio(edit);
  const canvasH = Math.min(screenH * 0.42, (screenW - 32) / ratio);
  const canvas = { w: canvasH * ratio, h: canvasH };
  const turned = (here?.segment.rotation ?? 0) % 180 !== 0;

  /** Apply an edit, record it for undo and re-sync the player. */
  function apply(next: Edit, at = time) {
    if (next === edit) return;
    history.commit(next);
    seek(at, next);
  }

  async function addClips() {
    const assets = await pickVideos();
    if (assets.length) apply(appendAssets(edit!, assets, assets.map(() => uid('seg'))));
  }

  function trim(seg: Segment, side: 'in' | 'out', dx: number) {
    const delta = (dx / pps) * seg.speed;
    const next = trimSegment(edit!, seg.id, side === 'in' ? { in: seg.in + delta } : { out: seg.out + delta });
    // Park the playhead on the edge that moved so the result is visible.
    const index = next.main.findIndex((s) => s.id === seg.id);
    const start = segmentStarts(next)[index];
    apply(next, side === 'in' ? start : start + segmentDuration(next.main[index]) - 0.05);
  }

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onStart(() => setPinchBase(pps))
    .onUpdate((e) => setPps(Math.min(600, Math.max(6, pinchBase * e.scale))));

  const step = RULER_STEPS.find((s) => s * pps >= 56) ?? 600;
  const ticks = Array.from({ length: Math.min(400, Math.floor(total / step) + 1) }, (_, i) => i * step);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Top bar */}
      <Row style={{ paddingHorizontal: 8, height: 46, justifyContent: 'space-between' }}>
        <Row gap={0}>
          <IconButton icon="chevron-back" onPress={() => router.back()} />
          <Pressable onPress={() => setPanel(panel === 'aspect' ? null : 'aspect')} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 30, borderRadius: 99, backgroundColor: colors.surface2 }}>
            <T style={{ fontFamily: fonts.bold, fontSize: 12.5 }}>{edit.aspect === 'original' ? 'Original' : edit.aspect}</T>
            <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
          </Pressable>
        </Row>
        <Row gap={0}>
          <IconButton icon="arrow-undo" disabled={!history.canUndo} onPress={() => { const e = history.undo(); if (e) seek(time, e); }} />
          <IconButton icon="arrow-redo" disabled={!history.canRedo} onPress={() => { const e = history.redo(); if (e) seek(time, e); }} />
          <Pressable
            onPress={() => Alert.alert('Export is not built yet', 'This build previews your edit. Rendering a final video file comes with the export engine.')}
            style={{ marginLeft: 6, paddingHorizontal: 14, height: 32, borderRadius: 99, justifyContent: 'center', backgroundColor: colors.saffron }}>
            <T style={{ fontFamily: fonts.heavy, fontSize: 13 }}>Export</T>
          </Pressable>
        </Row>
      </Row>

      {/* Canvas */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Pressable onPress={() => setSelection(null)} style={{ width: canvas.w, height: canvas.h, backgroundColor: '#000', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
          {here && (
            <VideoView
              player={playback.player}
              nativeControls={false}
              contentFit="contain"
              // A quarter-turned clip is laid out sideways, then rotated back into the frame.
              style={{ width: turned ? canvas.h : canvas.w, height: turned ? canvas.w : canvas.h, transform: [{ rotate: `${here.segment.rotation}deg` }, { scaleX: here.segment.flipH ? -1 : 1 }] }}
            />
          )}
          {edit.texts
            .filter((t) => time >= t.start && time < t.start + t.duration)
            .map((t) => (
              <TextLayer
                key={t.id}
                item={t}
                canvas={canvas}
                selected={selectedText?.id === t.id}
                onSelect={() => setSelection({ kind: 'text', id: t.id })}
                onMove={(x, y) => apply(patchText(edit, t.id, { x, y }))}
              />
            ))}
        </Pressable>
      </View>

      {/* Transport */}
      <Row style={{ justifyContent: 'center', height: 40 }} gap={14}>
        <T style={{ fontFamily: fonts.semibold, fontSize: 12, color: colors.textMuted, width: 70, textAlign: 'right' }}>{clock(time)}</T>
        <IconButton icon={playing ? 'pause' : 'play'} size={24} disabled={!here} onPress={playback.toggle} />
        <T style={{ fontFamily: fonts.semibold, fontSize: 12, color: colors.textDim, width: 70 }}>{clock(total)}</T>
      </Row>

      {/* Timeline: scrolls under a fixed centre playhead; pinch to zoom */}
      <GestureDetector gesture={pinch}>
        <View style={{ height: 22 + TRACK_H + TEXT_H + 22 }}>
          <ScrollView
            ref={scroller}
            horizontal
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            contentContainerStyle={{ paddingHorizontal: screenW / 2 }}
            onScrollBeginDrag={() => {
              userScrolling.current = true;
            }}
            onScroll={(e) => {
              if (userScrolling.current) seek(e.nativeEvent.contentOffset.x / pps);
            }}
            onScrollEndDrag={(e) => {
              if (Math.abs(e.nativeEvent.velocity?.x ?? 0) < 0.05) userScrolling.current = false;
            }}
            onMomentumScrollEnd={() => {
              userScrolling.current = false;
            }}>
            <View style={{ width: Math.max(total * pps, 1) }}>
              <View style={{ height: 22 }}>
                {ticks.map((t) => (
                  <T key={t} style={{ position: 'absolute', left: t * pps, top: 4, fontSize: 9.5, color: colors.textDim }}>
                    {step < 1 ? t.toFixed(1) : clock(t).replace(/\.\d$/, '')}
                  </T>
                ))}
              </View>

              <View style={{ height: TRACK_H, flexDirection: 'row' }}>
                {edit.main.map((seg) => {
                  const selected = selection?.kind === 'segment' && selection.id === seg.id;
                  const width = segmentDuration(seg) * pps;
                  return (
                    <Pressable
                      key={seg.id}
                      onPress={() => setSelection({ kind: 'segment', id: seg.id })}
                      style={{ width, height: TRACK_H, zIndex: selected ? 2 : 0 }}>
                      <View style={{ flex: 1, marginHorizontal: 1, borderRadius: 6, overflow: 'hidden', borderWidth: 2, borderColor: selected ? SELECT : 'transparent' }}>
                        <SegmentStrip asset={edit.assets[seg.assetId]} segment={seg} width={Math.max(width - 6, 1)} height={TRACK_H - 4} />
                        {(seg.speed !== 1 || seg.muted) && width > 44 && (
                          <View style={{ position: 'absolute', left: 4, top: 4, flexDirection: 'row', gap: 4, paddingHorizontal: 5, borderRadius: 4, backgroundColor: 'rgba(0,0,0,.65)' }}>
                            {seg.speed !== 1 && <T style={{ fontSize: 9.5, fontFamily: fonts.bold }}>{seg.speed}x</T>}
                            {seg.muted && <Ionicons name="volume-mute" size={11} color="#fff" />}
                          </View>
                        )}
                      </View>
                      {selected && <TrimHandle side="in" scroller={scroller} onTrim={(dx) => trim(seg, 'in', dx)} />}
                      {selected && <TrimHandle side="out" scroller={scroller} onTrim={(dx) => trim(seg, 'out', dx)} />}
                    </Pressable>
                  );
                })}
              </View>

              <View style={{ height: TEXT_H, marginTop: 4 }}>
                {edit.texts.map((t) => {
                  const selected = selectedText?.id === t.id;
                  return (
                    <Pressable
                      key={t.id}
                      onPress={() => {
                        setSelection({ kind: 'text', id: t.id });
                        if (time < t.start || time >= t.start + t.duration) seek(t.start);
                      }}
                      style={{ position: 'absolute', left: t.start * pps, width: t.duration * pps, height: TEXT_H - 4, borderRadius: 5, paddingHorizontal: 6, justifyContent: 'center', backgroundColor: 'rgba(179,61,255,.35)', borderWidth: 1.5, borderColor: selected ? SELECT : colors.speakerB }}>
                      <T numberOfLines={1} style={{ fontSize: 10.5, fontFamily: fonts.semibold }}>{t.text}</T>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </ScrollView>
          <View pointerEvents="none" style={{ position: 'absolute', left: screenW / 2 - 1, top: 16, bottom: 6, width: 2, borderRadius: 1, backgroundColor: '#fff' }} />
        </View>
      </GestureDetector>

      {/* Option panels */}
      <View style={{ minHeight: 50, justifyContent: 'center' }}>
        {selectedText ? (
          <Row style={{ paddingHorizontal: 12 }}>
            <TextInput
              value={selectedText.text}
              onChangeText={(text) => useEdits.getState().setEdit(patchText(edit, selectedText.id, { text }))}
              placeholder="Type your text"
              placeholderTextColor={colors.textDim}
              style={{ flex: 1, height: 38, borderRadius: 10, paddingHorizontal: 10, backgroundColor: colors.surface2, color: colors.text, fontFamily: fonts.medium }}
            />
            {TEXT_COLORS.map((c) => (
              <Pressable key={c} onPress={() => apply(patchText(edit, selectedText.id, { color: c }))} style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: c, borderWidth: 2, borderColor: selectedText.color === c ? SELECT : colors.lineStrong }} />
            ))}
          </Row>
        ) : panel === 'aspect' ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 12 }}>
            {ASPECTS.map((a) => (
              <Chip key={a} label={a === 'original' ? 'Original' : a} selected={edit.aspect === a} onPress={() => apply({ ...edit, aspect: a })} />
            ))}
          </ScrollView>
        ) : panel === 'speed' && target ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 12 }}>
            {SPEEDS.map((s) => (
              <Chip key={s} label={`${s}x`} selected={target.speed === s} onPress={() => apply(patchSegment(edit, target.id, { speed: s }))} />
            ))}
          </ScrollView>
        ) : panel === 'volume' && target ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 12 }}>
            <Chip label="Mute" selected={target.muted} onPress={() => apply(patchSegment(edit, target.id, { muted: !target.muted }))} />
            {[0.25, 0.5, 0.75, 1].map((v) => (
              <Chip key={v} label={`${v * 100}%`} selected={!target.muted && target.volume === v} onPress={() => apply(patchSegment(edit, target.id, { volume: v, muted: false }))} />
            ))}
          </ScrollView>
        ) : !here ? (
          <T variant="muted" style={{ textAlign: 'center' }}>Add a clip to start editing.</T>
        ) : null}
      </View>

      {/* Tools */}
      <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: 10 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 6 }}>
          {selectedText ? (
            <>
              <Tool icon="chevron-down" label="Done" onPress={() => setSelection(null)} />
              <Tool icon="locate-outline" label="To playhead" onPress={() => apply(patchText(edit, selectedText.id, { start: time }))} />
              <Tool icon="remove" label="Shorter" disabled={selectedText.duration <= 0.5} onPress={() => apply(patchText(edit, selectedText.id, { duration: selectedText.duration - 0.5 }))} />
              <Tool icon="add" label="Longer" onPress={() => apply(patchText(edit, selectedText.id, { duration: selectedText.duration + 0.5 }))} />
              <Tool icon="text" label="Smaller" disabled={selectedText.size <= 12} onPress={() => apply(patchText(edit, selectedText.id, { size: selectedText.size - 4 }))} />
              <Tool icon="text" label="Bigger" disabled={selectedText.size >= 72} onPress={() => apply(patchText(edit, selectedText.id, { size: selectedText.size + 4 }))} />
              <Tool icon="trash-outline" label="Delete" onPress={() => { apply(removeText(edit, selectedText.id)); setSelection(null); }} />
            </>
          ) : (
            <>
              <Tool icon="add-circle-outline" label="Add clip" onPress={addClips} />
              <Tool icon="cut-outline" label="Split" disabled={!here} onPress={() => apply(splitAt(edit, time, uid('seg')))} />
              <Tool icon="speedometer-outline" label="Speed" disabled={!target} on={panel === 'speed'} onPress={() => setPanel(panel === 'speed' ? null : 'speed')} />
              <Tool icon="volume-high-outline" label="Volume" disabled={!target} on={panel === 'volume'} onPress={() => setPanel(panel === 'volume' ? null : 'volume')} />
              <Tool
                icon="text-outline"
                label="Text"
                disabled={!here}
                onPress={() => {
                  const textId = uid('txt');
                  apply(addText(edit, textId, time));
                  setSelection({ kind: 'text', id: textId });
                }}
              />
              <Tool icon="refresh-outline" label="Rotate" disabled={!target} onPress={() => target && apply(patchSegment(edit, target.id, { rotation: ((target.rotation + 90) % 360) as Segment['rotation'] }))} />
              <Tool icon="swap-horizontal-outline" label="Flip" disabled={!target} onPress={() => target && apply(patchSegment(edit, target.id, { flipH: !target.flipH }))} />
              <Tool icon="copy-outline" label="Duplicate" disabled={!target} onPress={() => target && apply(duplicateSegment(edit, target.id, uid('seg')))} />
              <Tool icon="arrow-back-outline" label="Move left" disabled={!target || edit.main[0]?.id === target.id} onPress={() => target && apply(moveSegment(edit, target.id, -1), starts[Math.max(0, edit.main.indexOf(target) - 1)])} />
              <Tool icon="arrow-forward-outline" label="Move right" disabled={!target || edit.main[edit.main.length - 1]?.id === target.id} onPress={() => target && apply(moveSegment(edit, target.id, 1))} />
              <Tool icon="trash-outline" label="Delete" disabled={!target} onPress={() => { if (target) { apply(removeSegment(edit, target.id)); setSelection(null); } }} />
            </>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
