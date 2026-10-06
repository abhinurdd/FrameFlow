import { Ionicons } from '@expo/vector-icons';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AudioTracks } from '@/editor/audio';
import { health, ServerError, tools, VOICE_EFFECTS, type VoiceEffect } from '@/editor/api';
import { EditCanvas } from '@/editor/canvas';
import { ExportSheet } from '@/editor/export-sheet';
import {
  ActionsPanel,
  AdjustPanel,
  AnimationPanel,
  BlendPanel,
  CanvasPanel,
  CaptionStylePanel,
  ChoicePanel,
  EffectsPanel,
  FiltersPanel,
  PromptPanel,
  SpeedPanel,
  StickerPanel,
  TextPanel,
  TransformPanel,
  TransitionPanel,
  VolumePanel,
} from '@/editor/panels';
import { localAsset, pickAudio, pickMedia, pickText, probeDuration } from '@/editor/pick';
import { clock, TimelineView } from '@/editor/timeline-view';
import { BusyPill, IconButton, Tool, ToolSheet, type ToolDef } from '@/editor/ui';
import type { CanvasSize, Selection } from '@/editor/types';
import { usePlayback } from '@/editor/use-playback';
import { keyframeNear, setKeyframe, transformAt, type Keyframe, type Transform } from '@/engine/animate';
import type { Look } from '@/engine/looks';
import {
  addAssets,
  addItem,
  appendAssets,
  aspectRatio,
  captionsFromWords,
  duplicateItem,
  duplicateSegment,
  locate,
  moveItem,
  moveSegment,
  newAudio,
  newOverlay,
  newSegment,
  newText,
  parseSrt,
  patchItem,
  patchSegment,
  rampSegment,
  relink,
  removeItem,
  removeSegment,
  replaceSegmentAsset,
  rippleCut,
  segmentDuration,
  segmentStarts,
  setTransition,
  splitAt,
  splitItem,
  totalDuration,
  trimItem,
  trimSegment,
  type Asset,
  type AudioItem,
  type CaptionWord,
  type Edit,
  type Segment,
} from '@/engine/timeline';
import { uid, useEdits } from '@/state/edits';
import { Button, Row, T } from '@/ui/primitives';
import { colors, fonts } from '@/ui/theme';

type PanelId = 'filters' | 'adjust' | 'speed' | 'volume' | 'animation' | 'transition' | 'transform' | 'text' | 'captions' | 'captionStyle' | 'canvas' | 'sticker' | 'effects' | 'blend' | 'audio' | 'ai' | 'tts' | 'voice' | 'rename' | null;

const PANEL_TITLES: Record<NonNullable<PanelId>, string> = {
  filters: 'Filters',
  adjust: 'Adjust',
  speed: 'Speed',
  volume: 'Volume',
  animation: 'Animation',
  transition: 'Transition',
  transform: 'Transform',
  text: 'Text',
  captions: 'Captions',
  captionStyle: 'Caption style',
  canvas: 'Canvas',
  sticker: 'Stickers',
  effects: 'Effects',
  blend: 'Blend and mask',
  audio: 'Audio',
  ai: 'AI tools',
  tts: 'Text to speech',
  voice: 'Voice effect',
  rename: 'Rename project',
};

const FILLERS = new Set(['um', 'uh', 'umm', 'uhh', 'hmm', 'er', 'matlab', 'basically', 'actually', 'yaar', 'like', 'मतलब', 'यार', 'अं', 'हम्म']);
const bare = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{M}]/gu, '');

function useEditHistory(edit: Edit | undefined) {
  const setEdit = useEdits((s) => s.setEdit);
  const [history, setHistory] = useState<{ past: Edit[]; future: Edit[] }>({ past: [], future: [] });
  // The edit as it was before an uncommitted live preview (a slider being dragged).
  const [base, setBase] = useState<Edit | null>(null);
  return {
    preview(next: Edit) {
      if (!edit) return;
      if (!base) setBase(edit);
      setEdit(next);
    },
    commit(next: Edit) {
      if (!edit) return;
      const from = base ?? edit;
      setBase(null);
      if (next === from) return;
      setHistory((h) => ({ past: [...h.past, from].slice(-100), future: [] }));
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

export default function Editor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const edit = useEdits((s) => s.edits.find((e) => e.id === id));
  const history = useEditHistory(edit);
  const playback = usePlayback(() => useEdits.getState().edits.find((e) => e.id === id));
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [selection, setSelection] = useState<Selection>(null);
  const [panel, setPanel] = useState<PanelId>(null);
  const [area, setArea] = useState<CanvasSize>({ w: 0, h: 0 });
  const [busy, setBusy] = useState<string | null>(null);
  const [recordingFrom, setRecordingFrom] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  // Which server-side tools are available, so the editor only offers what will work.
  const [server, setServer] = useState<Awaited<ReturnType<typeof health>>>(null);
  useEffect(() => {
    health().then(setServer);
  }, []);
  const { time, playing, seek } = playback;

  // Load the first frame once the draft is available.
  const ready = !!edit;
  useEffect(() => {
    if (ready) seek(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

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
  const selSegment = selection?.track === 'main' ? edit.main.find((s) => s.id === selection.id) : undefined;
  const selOverlay = selection?.track === 'overlays' ? edit.overlays.find((o) => o.id === selection.id) : undefined;
  const selText = selection?.track === 'texts' ? edit.texts.find((t) => t.id === selection.id) : undefined;
  const selCaption = selection?.track === 'captions' ? edit.captions.find((c) => c.id === selection.id) : undefined;
  const selAudio = selection?.track === 'audio' ? edit.audio.find((a) => a.id === selection.id) : undefined;
  const selEffect = selection?.track === 'effects' ? edit.effects.find((e) => e.id === selection.id) : undefined;
  // Clip tools act on the tapped segment, or on whatever is under the playhead.
  const target: Segment | undefined = selSegment ?? here?.segment;
  const targetAsset = target && edit.assets[target.assetId];
  const targetStart = target ? starts[edit.main.indexOf(target)] : 0;
  // The thing canvas gestures, keyframes and transform sliders apply to.
  const visual = selSegment ?? selOverlay ?? selText;
  const visualStart = selSegment ? starts[edit.main.indexOf(selSegment)] : ((selOverlay ?? selText)?.start ?? 0);
  const visualDuration = selSegment ? segmentDuration(selSegment) : ((selOverlay ?? selText)?.duration ?? 0);
  const visualTime = Math.min(Math.max(time - visualStart, 0), visualDuration);

  const ratio = aspectRatio(edit);
  const canvasH = Math.max(0, Math.min(area.h - 8, (area.w - 24) / ratio));
  const canvas: CanvasSize = { w: canvasH * ratio, h: canvasH };

  /**
   * Apply an edit, record it for undo and re-sync the players. When the main track
   * changes shape, text, captions and overlays stay attached to their clip unless
   * the caller has already moved them (`link` false).
   */
  function apply(change: Edit, at = time, link = true) {
    if (change === edit || !edit) return;
    const next = link && change.main !== edit.main ? relink(edit, change) : change;
    history.commit(next);
    seek(Math.min(at, totalDuration(next)), next);
  }
  /** `commit` false = live preview while a slider moves; true = final value. */
  const change = (next: Edit, commit: boolean) => (commit ? apply(next) : history.preview(next));
  const togglePanel = (p: PanelId) => setPanel(panel === p ? null : p);
  const select = (s: Selection) => {
    setSelection(s);
    setPanel(null);
  };
  const current = () => useEdits.getState().edits.find((e) => e.id === id)!;

  function patchVisual(patch: { transform?: Transform; keyframes?: Keyframe[] }, commit = true) {
    if (selSegment) change(patchSegment(edit!, selSegment.id, patch), commit);
    else if (selOverlay) change(patchItem(edit!, 'overlays', selOverlay.id, patch), commit);
    else if (selText) change(patchItem(edit!, 'texts', selText.id, patch), commit);
  }

  /** Move, scale or fade the selected item. With keyframes on, this writes a keyframe at the playhead. */
  function changeTransform(next: (t: Transform) => Transform, commit = true) {
    if (!visual) return;
    const value = next(transformAt(visual, visualTime));
    patchVisual(visual.keyframes.length ? { keyframes: setKeyframe(visual.keyframes, visualTime, value) } : { transform: value }, commit);
  }

  function toggleKeyframe() {
    if (!visual) return;
    const existing = keyframeNear(visual.keyframes, visualTime);
    patchVisual({ keyframes: existing ? visual.keyframes.filter((k) => k !== existing) : setKeyframe(visual.keyframes, visualTime, transformAt(visual, visualTime)) });
  }

  /** Run something slow (a server tool), showing its progress and any failure. */
  async function run(label: string, job: (progress: (p: number) => void) => Promise<void>) {
    setBusy(label);
    try {
      await job((p) => setBusy(`${label} ${Math.round(p * 100)}%`));
    } catch (e) {
      Alert.alert(e instanceof ServerError ? 'Media server' : 'Something went wrong', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function addClips() {
    setBusy('Importing');
    try {
      const assets = await pickMedia();
      if (assets.length) apply(appendAssets(current(), assets, assets.map(() => uid('seg'))), totalDuration(current()));
    } finally {
      setBusy(null);
    }
  }

  async function addOverlay() {
    const [asset] = await pickMedia(['videos', 'images'], false);
    if (!asset) return;
    const item = newOverlay(uid('ovl'), time, { asset });
    apply(addItem(addAssets(current(), [asset]), 'overlays', item));
    setSelection({ track: 'overlays', id: item.id });
  }

  function addText() {
    const item = newText(uid('txt'), Math.min(time, Math.max(0, total - 0.5)));
    apply(addItem(edit!, 'texts', item));
    setSelection({ track: 'texts', id: item.id });
    setPanel('text');
  }

  async function addMusic() {
    const asset = await pickAudio();
    if (!asset) return;
    const item = newAudio(uid('aud'), time, asset, 'music');
    apply(addItem(addAssets(current(), [asset]), 'audio', item));
    setSelection({ track: 'audio', id: item.id });
  }

  async function toggleRecording() {
    if (recordingFrom === null) {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) return Alert.alert('Microphone', 'Allow microphone access to record a voice-over.');
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecordingFrom(time);
      if (!playing) playback.toggle();
      return;
    }
    await recorder.stop();
    playback.pause();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    const from = recordingFrom;
    setRecordingFrom(null);
    if (!recorder.uri) return;
    const duration = await probeDuration(recorder.uri);
    if (!duration) return;
    const asset = localAsset(recorder.uri, 'audio', { duration, name: 'Voice-over' });
    apply(addItem(addAssets(current(), [asset]), 'audio', newAudio(uid('aud'), from, asset, 'voiceover')), from);
  }

  function trimSeg(seg: Segment, side: 'in' | 'out', sourceSeconds: number) {
    const next = trimSegment(edit!, seg.id, side === 'in' ? { in: seg.in + sourceSeconds } : { out: seg.out + sourceSeconds });
    // Park the playhead on the edge that moved so the result is visible.
    const index = next.main.findIndex((s) => s.id === seg.id);
    const start = segmentStarts(next)[index];
    apply(next, side === 'in' ? start : start + segmentDuration(next.main[index]) - 0.05);
  }

  function splitHere() {
    if (selection && selection.track !== 'main') apply(splitItem(edit!, selection.track, selection.id, time, uid('itm')));
    else apply(splitAt(edit!, time, uid('seg')));
  }

  function deleteSelected() {
    if (selection && selection.track !== 'main') apply(removeItem(edit!, selection.track, selection.id));
    else if (target) {
      // Text, captions and audio after the clip slide left with the rest of the video.
      const from = starts[edit!.main.indexOf(target)];
      const removed = removeSegment(edit!, target.id);
      const shifted = rippleCut({ ...edit!, main: [] }, [{ start: from, end: from + segmentDuration(target) }], () => uid('seg'));
      apply({ ...shifted, main: removed.main }, time, false);
    }
    setSelection(null);
    setPanel(null);
  }

  function duplicateSelected() {
    if (selection && selection.track !== 'main') apply(duplicateItem(edit!, selection.track, selection.id, uid('itm')));
    else if (target) apply(duplicateSegment(edit!, target.id, uid('seg')));
  }

  // ---- Server tools ----

  const reverseClip = (seg: Segment, asset: Asset) =>
    run('Reversing', async (p) => {
      const reversed = await tools.reverse(asset, p);
      apply(replaceSegmentAsset(current(), seg.id, reversed, { in: asset.duration - seg.out, out: asset.duration - seg.in }), time, false);
    });

  const freezeFrame = (asset: Asset, sourceTime: number) =>
    run('Freezing frame', async () => {
      const still = await tools.frame(asset, sourceTime);
      const rightId = uid('seg');
      const cut = splitAt(current(), time, rightId);
      const at = cut.main.findIndex((s) => s.id === rightId);
      const index = at >= 0 ? at : (locate(cut, time)?.index ?? 0) + 1;
      const main = [...cut.main];
      main.splice(index, 0, newSegment(uid('seg'), still));
      apply({ ...addAssets(cut, [still]), main });
    });

  const extractAudio = (seg: Segment, asset: Asset, start: number) =>
    run('Extracting audio', async () => {
      const audio = await tools.extractAudio(asset);
      const item = { ...newAudio(uid('aud'), start, audio, 'extracted'), in: seg.in, out: Math.min(seg.out, audio.duration) };
      apply(addItem(addAssets(patchSegment(current(), seg.id, { muted: true }), [audio]), 'audio', item));
    });

  const cleanAudio = (seg: Segment, asset: Asset) =>
    run('Cleaning audio', async (p) => {
      const clean = await tools.denoise(asset, p);
      apply(replaceSegmentAsset(current(), seg.id, clean, { in: seg.in, out: seg.out }));
    });

  const stabilizeClip = (seg: Segment, asset: Asset) =>
    run('Stabilizing', async (p) => {
      const steady = await tools.stabilize(asset, p);
      apply(replaceSegmentAsset(current(), seg.id, steady, { in: seg.in, out: seg.out }));
    });

  const changeVoice = (seg: Segment, asset: Asset, effect: VoiceEffect) =>
    run('Changing voice', async (p) => {
      const voiced = await tools.voice(asset, effect, p);
      apply(replaceSegmentAsset(current(), seg.id, voiced, { in: seg.in, out: seg.out }));
    });

  const speak = (text: string) =>
    run('Generating speech', async () => {
      const speech = await tools.speak(text);
      const item = newAudio(uid('aud'), time, speech, 'voiceover');
      apply(addItem(addAssets(current(), [speech]), 'audio', item));
      setSelection({ track: 'audio', id: item.id });
      setPanel(null);
    });

  /** Map something timed against source files onto the timeline, clip by clip. */
  async function acrossClips<T>(fetchFor: (asset: Asset) => Promise<T[]>, place: (item: T, toTimeline: (sourceTime: number) => number, seg: Segment) => void) {
    const e = current();
    const cache = new Map<string, T[]>();
    const segStarts = segmentStarts(e);
    for (const [i, seg] of e.main.entries()) {
      const asset = e.assets[seg.assetId];
      if (!asset || asset.kind !== 'video') continue;
      if (!cache.has(asset.id)) cache.set(asset.id, await fetchFor(asset));
      for (const item of cache.get(asset.id)!) place(item, (t) => segStarts[i] + (t - seg.in) / seg.speed, seg);
    }
  }

  const autoCaptions = (translate = false) =>
    run(translate ? 'Translating' : 'Transcribing', async (p) => {
      const status = await health();
      if (!status) throw new ServerError('The media server is not running. Start it with "npm run server" in pipeline/.');
      if (!status.whisper) throw new ServerError('Speech recognition is not set up on the media server yet. See pipeline/README.md.');
      if (translate && !status.translate) throw new ServerError('English captions need a second speech model on the media server. See "Translation" in pipeline/README.md.');
      const words: CaptionWord[] = [];
      await acrossClips(
        async (asset) => (await tools.transcribe(asset, { translate }, p)).words,
        (w, at, seg) => {
          if (w.t0 >= seg.in && w.t0 < seg.out) words.push({ text: w.text, t0: at(w.t0), t1: at(Math.min(w.t1, seg.out)) });
        },
      );
      if (!words.length) throw new Error('No speech was found in this video.');
      apply({ ...current(), captions: captionsFromWords(words.sort((a, b) => a.t0 - b.t0), 4, () => uid('cap')) });
    });

  const removeSilences = () =>
    run('Finding silences', async () => {
      const ranges: { start: number; end: number }[] = [];
      await acrossClips(tools.silence, (r, at, seg) => {
        // Leave a short breath either side of each cut.
        const from = Math.max(r.start + 0.1, seg.in);
        const to = Math.min(r.end - 0.1, seg.out);
        if (to - from > 0.2) ranges.push({ start: at(from), end: at(to) });
      });
      if (!ranges.length) return Alert.alert('No silences found', 'There are no pauses longer than about half a second.');
      apply(rippleCut(current(), ranges, () => uid('seg')), time, false);
      Alert.alert('Silences removed', `${ranges.length} ${ranges.length === 1 ? 'pause' : 'pauses'} cut. Undo brings them back.`);
    });

  function removeFillers() {
    const ranges = edit!.captions.flatMap((c) => (c.words ?? []).filter((w) => FILLERS.has(bare(w.text))).map((w) => ({ start: c.start + w.t0, end: c.start + w.t1 })));
    if (!ranges.length) return Alert.alert('No filler words found', edit!.captions.some((c) => c.words) ? 'Nothing to remove.' : 'Generate auto captions first, so the words are known.');
    const cleaned = { ...edit!, captions: edit!.captions.map((c) => (c.words ? { ...c, text: c.words.filter((w) => !FILLERS.has(bare(w.text))).map((w) => w.text).join(' ') } : c)) };
    apply(rippleCut(cleaned, ranges, () => uid('seg')), time, false);
  }

  async function importSrt() {
    const text = await pickText('*/*');
    if (!text) return;
    const captions = parseSrt(text, () => uid('cap'));
    if (!captions.length) return Alert.alert('No captions found', 'That file does not look like an .srt subtitle file.');
    apply({ ...current(), captions });
  }

  const detectBeats = (item: AudioItem, asset: Asset) =>
    run('Finding beats', async () => {
      const beats = await tools.beats(asset);
      apply({ ...current(), markers: beats.filter((b) => b >= item.in && b <= item.out).map((b) => item.start + b - item.in) });
    });

  // ---- Toolbar for the current selection ----

  const keyframed = !!visual && !!keyframeNear(visual.keyframes, visualTime);
  const opens = (p: PanelId, icon: ToolDef['icon'], label: string): ToolDef => ({ icon, label, onPress: () => togglePanel(p), on: panel === p });
  const back: ToolDef = { icon: 'chevron-back', label: 'Back', onPress: () => select(null) };
  const split: ToolDef = { icon: 'cut-outline', label: 'Split', onPress: splitHere };
  const keyframeTool: ToolDef = { icon: keyframed ? 'diamond' : 'diamond-outline', label: 'Keyframe', onPress: toggleKeyframe, on: keyframed };
  const common: ToolDef[] = [
    { icon: 'copy-outline', label: 'Duplicate', onPress: duplicateSelected },
    { icon: 'trash-outline', label: 'Delete', onPress: deleteSelected, danger: true },
  ];

  let toolbar: ToolDef[];
  if (selText) {
    toolbar = [back, opens('text', 'create-outline', 'Edit'), opens('animation', 'color-wand-outline', 'Animation'), opens('transform', 'resize-outline', 'Transform'), keyframeTool, split, ...common];
  } else if (selOverlay) {
    toolbar = [
      back,
      split,
      ...(selOverlay.kind === 'video' ? [opens('volume', 'volume-high-outline', 'Volume')] : []),
      opens('animation', 'color-wand-outline', 'Animation'),
      ...(selOverlay.kind !== 'sticker' ? [opens('filters', 'color-filter-outline', 'Filters'), opens('adjust', 'options-outline', 'Adjust'), opens('blend', 'layers-outline', 'Blend')] : []),
      opens('transform', 'resize-outline', 'Transform'),
      keyframeTool,
      { icon: 'swap-horizontal-outline', label: 'Flip', onPress: () => apply(patchItem(edit, 'overlays', selOverlay.id, { flipH: !selOverlay.flipH })) },
      ...common,
    ];
  } else if (selCaption) {
    toolbar = [back, opens('text', 'create-outline', 'Edit'), opens('captionStyle', 'brush-outline', 'Style'), split, ...common];
  } else if (selAudio) {
    const asset = edit.assets[selAudio.assetId];
    toolbar = [back, split, opens('volume', 'volume-high-outline', 'Volume'), { icon: 'pulse-outline', label: 'Beats', onPress: () => asset && detectBeats(selAudio, asset) }, ...common];
  } else if (selEffect) {
    toolbar = [back, opens('effects', 'sparkles-outline', 'Effect'), ...common];
  } else if (selSegment) {
    const asset = edit.assets[selSegment.assetId];
    const isVideo = asset?.kind === 'video';
    const index = edit.main.indexOf(selSegment);
    toolbar = [
      back,
      split,
      ...(isVideo ? [opens('speed', 'speedometer-outline', 'Speed'), opens('volume', 'volume-high-outline', 'Volume')] : []),
      opens('animation', 'color-wand-outline', 'Animation'),
      opens('filters', 'color-filter-outline', 'Filters'),
      opens('adjust', 'options-outline', 'Adjust'),
      opens('transform', 'resize-outline', 'Transform'),
      keyframeTool,
      ...(isVideo
        ? ([
            { icon: 'play-back-outline', label: 'Reverse', onPress: () => reverseClip(selSegment, asset) },
            { icon: 'snow-outline', label: 'Freeze', onPress: () => here && freezeFrame(asset, here.sourceTime) },
            { icon: 'musical-note-outline', label: 'Extract', onPress: () => extractAudio(selSegment, asset, starts[index]) },
            { icon: 'mic-off-outline', label: 'Denoise', onPress: () => cleanAudio(selSegment, asset) },
            opens('voice', 'person-outline', 'Voice'),
            { icon: 'videocam-outline', label: 'Stabilize', onPress: () => stabilizeClip(selSegment, asset) },
          ] satisfies ToolDef[])
        : []),
      {
        icon: 'repeat-outline',
        label: 'Replace',
        onPress: async () => {
          const [next] = await pickMedia(['videos', 'images'], false);
          if (next) apply(replaceSegmentAsset(current(), selSegment.id, next), time, false);
        },
      },
      { icon: 'arrow-back-outline', label: 'Move left', disabled: index === 0, onPress: () => apply(moveSegment(edit, selSegment.id, -1), starts[Math.max(0, index - 1)]) },
      { icon: 'arrow-forward-outline', label: 'Move right', disabled: index === edit.main.length - 1, onPress: () => apply(moveSegment(edit, selSegment.id, 1)) },
      ...common,
    ];
  } else {
    const marked = edit.markers.some((m) => Math.abs(m - time) < 0.05);
    toolbar = [
      { ...split, disabled: !here },
      opens('audio', 'musical-notes-outline', 'Audio'),
      { icon: 'text-outline', label: 'Text', onPress: addText },
      { icon: 'layers-outline', label: 'Overlay', onPress: addOverlay },
      opens('sticker', 'happy-outline', 'Stickers'),
      opens('captions', 'chatbox-ellipses-outline', 'Captions'),
      opens('effects', 'sparkles-outline', 'Effects'),
      { ...opens('filters', 'color-filter-outline', 'Filters'), disabled: !target },
      { ...opens('adjust', 'options-outline', 'Adjust'), disabled: !target },
      opens('ai', 'flash-outline', 'AI tools'),
      opens('canvas', 'crop-outline', 'Canvas'),
      { icon: marked ? 'flag' : 'flag-outline', label: 'Marker', on: marked, onPress: () => apply({ ...edit, markers: marked ? edit.markers.filter((m) => Math.abs(m - time) >= 0.05) : [...edit.markers, time].sort((a, b) => a - b) }) },
    ];
  }

  // ---- Options for the open tool ----

  // Filters and Adjust act on the selected overlay, else the selected or current clip.
  const lookOwner = selOverlay ?? target;
  const setLook = (look: Look, commit: boolean) => {
    if (selOverlay) change(patchItem(edit, 'overlays', selOverlay.id, { look }), commit);
    else if (target) change(patchSegment(edit, target.id, { look }), commit);
  };
  const animated = selSegment ?? selOverlay ?? selText;
  const inputStyle = { minHeight: 40, maxHeight: 76, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: colors.surface2, color: colors.text, fontFamily: fonts.medium } as const;

  let body: React.ReactNode = null;
  if (panel === 'filters' && lookOwner) body = <FiltersPanel look={lookOwner.look} onChange={setLook} onApplyAll={selOverlay ? undefined : () => apply({ ...edit, main: edit.main.map((s) => ({ ...s, look: lookOwner.look })) })} />;
  else if (panel === 'adjust' && lookOwner) body = <AdjustPanel look={lookOwner.look} onChange={setLook} />;
  else if (panel === 'speed' && selSegment) body = <SpeedPanel speed={selSegment.speed} onChange={(speed) => apply(patchSegment(edit, selSegment.id, { speed }))} onRamp={(speeds) => apply(rampSegment(edit, selSegment.id, speeds, () => uid('seg')), visualStart)} />;
  else if (panel === 'voice' && selSegment && targetAsset) body = <ChoicePanel label="Voice" options={VOICE_EFFECTS} onPick={(effect) => changeVoice(selSegment, targetAsset, effect)} />;
  else if (panel === 'tts') body = <PromptPanel placeholder="Type what should be spoken" action="Speak" busy={!!busy} onSubmit={speak} />;
  else if (panel === 'volume' && selSegment) body = <VolumePanel sound={selSegment} onChange={(p, commit) => change(patchSegment(edit, selSegment.id, p), commit)} />;
  else if (panel === 'volume' && selOverlay) body = <VolumePanel sound={{ volume: selOverlay.volume, muted: selOverlay.muted }} onChange={(p, commit) => change(patchItem(edit, 'overlays', selOverlay.id, p), commit)} />;
  else if (panel === 'volume' && selAudio) body = <VolumePanel sound={selAudio} onChange={(p, commit) => change(patchItem(edit, 'audio', selAudio.id, p), commit)} />;
  else if (panel === 'animation' && animated)
    body = (
      <AnimationPanel
        animation={animated.animation}
        onChange={(animation) => {
          // Jump to the start of the item so pressing play shows the animation.
          if (selSegment) apply(patchSegment(edit, selSegment.id, { animation }), visualStart);
          else if (selOverlay) apply(patchItem(edit, 'overlays', selOverlay.id, { animation }), visualStart);
          else if (selText) apply(patchItem(edit, 'texts', selText.id, { animation }), visualStart);
        }}
      />
    );
  else if (panel === 'transition' && selSegment)
    body = (
      <TransitionPanel
        transition={selSegment.transition}
        onChange={(t) => {
          const next = setTransition(edit, selSegment.id, t);
          const i = next.main.findIndex((s) => s.id === selSegment.id);
          // Jump to just before the cut so pressing play shows the transition.
          apply(next, Math.max(0, (segmentStarts(next)[i + 1] ?? 0) - 0.6));
        }}
        onApplyAll={() => apply(setTransition(edit, selSegment.id, selSegment.transition, true))}
      />
    );
  else if (panel === 'transform' && visual)
    body = (
      <TransformPanel
        transform={transformAt(visual, visualTime)}
        onChange={(t, commit) => changeTransform(() => t, commit)}
        fit={selSegment?.fit}
        onFit={selSegment ? (fit) => apply(patchSegment(edit, selSegment.id, { fit })) : undefined}
        actions={
          selSegment
            ? [
                { label: 'Rotate 90°', onPress: () => apply(patchSegment(edit, selSegment.id, { rotation: ((selSegment.rotation + 90) % 360) as Segment['rotation'] })) },
                { label: 'Flip H', onPress: () => apply(patchSegment(edit, selSegment.id, { flipH: !selSegment.flipH })) },
                { label: 'Flip V', onPress: () => apply(patchSegment(edit, selSegment.id, { flipV: !selSegment.flipV })) },
              ]
            : undefined
        }
      />
    );
  else if (panel === 'text' && selText) body = <TextPanel text={selText.text} style={selText.style} onText={(text, commit) => change(patchItem(edit, 'texts', selText.id, { text }), commit)} onStyle={(style, commit) => change(patchItem(edit, 'texts', selText.id, { style }), commit)} />;
  else if (panel === 'text' && selCaption)
    body = (
      <View style={{ paddingHorizontal: 14 }}>
        <TextInput
          value={selCaption.text}
          // Retyping a caption drops its word timings, so word highlighting falls back to the whole line.
          onChangeText={(text) => history.preview(patchItem(edit, 'captions', selCaption.id, { text, words: undefined }))}
          onEndEditing={(e) => apply(patchItem(edit, 'captions', selCaption.id, { text: e.nativeEvent.text, words: undefined }))}
          multiline
          style={inputStyle}
        />
      </View>
    );
  else if (panel === 'captionStyle') body = <CaptionStylePanel style={edit.captionStyle} onChange={(captionStyle, commit) => change({ ...edit, captionStyle }, commit)} />;
  else if (panel === 'captions')
    body = (
      <ActionsPanel
        actions={[
          { label: 'Auto captions', icon: 'flash-outline', onPress: () => autoCaptions(), busy: !!busy },
          ...(server?.translate ? [{ label: 'Captions in English', icon: 'language-outline' as const, onPress: () => autoCaptions(true), busy: !!busy }] : []),
          {
            label: 'Add a line',
            icon: 'add-outline',
            onPress: () => {
              const caption = { id: uid('cap'), start: time, duration: 2, text: 'Caption' };
              apply(addItem(edit, 'captions', caption));
              setSelection({ track: 'captions', id: caption.id });
              setPanel('text');
            },
          },
          { label: 'Import .srt', icon: 'document-text-outline', onPress: importSrt },
          { label: 'Style', icon: 'brush-outline', onPress: () => setPanel('captionStyle') },
          ...(edit.captions.length ? [{ label: 'Clear all', icon: 'trash-outline' as const, onPress: () => apply({ ...edit, captions: [] }) }] : []),
        ]}
      />
    );
  else if (panel === 'ai')
    body = (
      <ActionsPanel
        actions={[
          { label: 'Auto captions', icon: 'chatbox-ellipses-outline', onPress: () => autoCaptions(), busy: !!busy },
          ...(server?.tts ? [{ label: 'Text to speech', icon: 'megaphone-outline' as const, onPress: () => setPanel('tts') }] : []),
          { label: 'Remove silences', icon: 'remove-circle-outline', onPress: removeSilences, busy: !!busy },
          { label: 'Remove filler words', icon: 'close-circle-outline', onPress: removeFillers },
          // Markers come from "Beats" on a music clip, or from the Marker tool.
          ...(edit.markers.length ? [{ label: 'Cut on markers', icon: 'pulse-outline' as const, onPress: () => apply(edit.markers.reduce((e, m) => splitAt(e, m, uid('seg')), edit)) }] : []),
          ...(target && targetAsset?.kind === 'video' ? [{ label: 'Clean up audio', icon: 'mic-outline' as const, onPress: () => cleanAudio(target, targetAsset), busy: !!busy }] : []),
        ]}
      />
    );
  else if (panel === 'audio')
    body = (
      <ActionsPanel
        actions={[
          { label: 'Add music', icon: 'musical-notes-outline', onPress: addMusic },
          { label: recordingFrom === null ? 'Record voice-over' : 'Stop recording', icon: recordingFrom === null ? 'mic-outline' : 'stop-circle-outline', onPress: toggleRecording },
          ...(target && targetAsset?.kind === 'video' ? [{ label: 'Extract from clip', icon: 'musical-note-outline' as const, onPress: () => extractAudio(target, targetAsset, targetStart), busy: !!busy }] : []),
        ]}
      />
    );
  else if (panel === 'sticker')
    body = (
      <StickerPanel
        onPick={(emoji) => {
          const item = newOverlay(uid('ovl'), time, { emoji });
          apply(addItem(edit, 'overlays', item));
          setSelection({ track: 'overlays', id: item.id });
        }}
      />
    );
  else if (panel === 'effects')
    body = (
      <EffectsPanel
        current={selEffect?.type}
        onPick={(type) => {
          if (selEffect) return apply(patchItem(edit, 'effects', selEffect.id, { type }), selEffect.start);
          const item = { id: uid('fx'), type, start: time, duration: Math.min(2, Math.max(0.5, total - time)) };
          apply(addItem(edit, 'effects', item));
          setSelection({ track: 'effects', id: item.id });
        }}
      />
    );
  else if (panel === 'blend' && selOverlay) body = <BlendPanel blend={selOverlay.blend} mask={selOverlay.mask} onBlend={(blend) => apply(patchItem(edit, 'overlays', selOverlay.id, { blend }))} onMask={(mask) => apply(patchItem(edit, 'overlays', selOverlay.id, { mask }))} />;
  else if (panel === 'rename') body = <PromptPanel key={edit.id} initial={edit.name} placeholder="Project name" action="Save" onSubmit={(name) => { useEdits.getState().setEdit({ ...edit, name }); setPanel(null); }} />;
  else if (panel === 'canvas') body = <CanvasPanel aspect={edit.aspect} background={edit.background} onAspect={(aspect) => apply({ ...edit, aspect })} onBackground={(background) => apply({ ...edit, background })} />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Top bar */}
        <Row style={{ paddingLeft: 4, paddingRight: 12, height: 52, justifyContent: 'space-between' }}>
          <Row gap={2} style={{ flex: 1 }}>
            <IconButton icon="chevron-back" label="Back to projects" onPress={() => router.back()} />
            <Pressable accessibilityRole="button" accessibilityLabel={`Rename ${edit.name}`} onPress={() => togglePanel('rename')} hitSlop={8} style={({ pressed }) => ({ flexShrink: 1, opacity: pressed ? 0.6 : 1 })}>
              <T numberOfLines={1} style={{ fontFamily: fonts.bold, fontSize: 15 }}>{edit.name}</T>
            </Pressable>
          </Row>
          <Row gap={10}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Aspect ratio ${edit.aspect}`}
              onPress={() => togglePanel('canvas')}
              hitSlop={{ top: 8, bottom: 8 }}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, height: 36, borderRadius: 18, backgroundColor: colors.surface2, opacity: pressed ? 0.7 : 1 })}>
              <T style={{ fontFamily: fonts.bold, fontSize: 13 }}>{edit.aspect === 'original' ? 'Original' : edit.aspect}</T>
              <Ionicons name="chevron-down" size={13} color={colors.textMuted} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Export video"
              accessibilityState={{ disabled: !total }}
              disabled={!total}
              hitSlop={{ top: 6, bottom: 6 }}
              onPress={() => {
                playback.pause();
                setPanel(null);
                setExporting(true);
              }}
              style={({ pressed }) => ({ paddingHorizontal: 18, height: 36, borderRadius: 18, justifyContent: 'center', backgroundColor: colors.saffron, opacity: !total ? 0.4 : pressed ? 0.8 : 1 })}>
              <T style={{ fontFamily: fonts.heavy, fontSize: 14 }}>Export</T>
            </Pressable>
          </Row>
        </Row>

        {/* Canvas */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} onLayout={(e) => setArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
          {!total ? (
            <View style={{ alignItems: 'center', gap: 12, paddingHorizontal: 32 }}>
              <Ionicons name="film-outline" size={40} color={colors.textMuted} />
              <T variant="h1" style={{ textAlign: 'center' }}>Start with a clip</T>
              <T variant="muted" style={{ textAlign: 'center' }}>Add videos or photos from your gallery. You can add more at any time.</T>
              <Button title="Add clips" style={{ alignSelf: 'stretch', marginTop: 4 }} loading={busy === 'Importing'} onPress={addClips} />
            </View>
          ) : (
            canvas.h > 0 && <EditCanvas edit={edit} time={time} playing={playing} players={playback.players} slotSegs={playback.slotSegs} canvas={canvas} selection={selection} onSelect={select} onTransform={(fn) => changeTransform(fn)} />
          )}
          {busy && total > 0 && <BusyPill label={busy} />}
          {recordingFrom !== null && (
            <Pressable accessibilityRole="button" accessibilityLabel="Stop recording" onPress={toggleRecording} style={{ position: 'absolute', top: 10, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, height: 40, borderRadius: 20, backgroundColor: colors.danger }}>
              <Ionicons name="stop-circle" size={18} color={colors.white} />
              <T style={{ fontFamily: fonts.bold, fontSize: 13 }}>Recording · tap to stop</T>
            </Pressable>
          )}
        </View>
        <AudioTracks edit={edit} time={time} playing={playing} />

        <View>
          {/* Transport */}
          <Row style={{ height: 48, paddingHorizontal: 8, justifyContent: 'space-between' }}>
            <T style={{ width: 104, paddingLeft: 8, fontFamily: fonts.semibold, fontSize: 12.5, color: colors.text, fontVariant: ['tabular-nums'] }}>
              {clock(time)} <T style={{ fontFamily: fonts.medium, fontSize: 12.5, color: colors.textMuted, fontVariant: ['tabular-nums'] }}>/ {clock(total)}</T>
            </T>
            <IconButton icon={playing ? 'pause' : 'play'} label={playing ? 'Pause' : 'Play'} size={26} disabled={!total} onPress={playback.toggle} />
            <Row gap={0} style={{ width: 104, justifyContent: 'flex-end' }}>
              <IconButton
                icon="arrow-undo"
                label="Undo"
                size={20}
                disabled={!history.canUndo}
                onPress={() => {
                  const e = history.undo();
                  if (e) seek(Math.min(time, totalDuration(e)), e);
                }}
              />
              <IconButton
                icon="arrow-redo"
                label="Redo"
                size={20}
                disabled={!history.canRedo}
                onPress={() => {
                  const e = history.redo();
                  if (e) seek(Math.min(time, totalDuration(e)), e);
                }}
              />
            </Row>
          </Row>

          <TimelineView
            edit={edit}
            time={time}
            selection={selection}
            onSelect={select}
            onScrub={seek}
            onScrubStart={playback.pause}
            onTrimSegment={trimSeg}
            onMoveItem={(track, itemId, s) => {
              const item = edit[track].find((i) => i.id === itemId);
              if (item) apply(moveItem(edit, track, itemId, item.start + s));
            }}
            onTrimItem={(track, itemId, side, s) => apply(trimItem(edit, track, itemId, side, s))}
            onTransition={(segmentId) => {
              setSelection({ track: 'main', id: segmentId });
              setPanel('transition');
            }}
            onAddClip={addClips}
          />

          {/* The open tool's options cover the timeline; the canvas above stays put. */}
          {body && panel && (
            <ToolSheet title={PANEL_TITLES[panel]} onClose={() => setPanel(null)}>
              {body}
            </ToolSheet>
          )}
        </View>

        {/* Tools */}
        <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 6, paddingBottom: 2 }}>
          {/* Keyed by context so each toolbar starts scrolled to its first tool. */}
          <ScrollView key={selection?.track ?? 'root'} horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 4 }}>
            {toolbar.map((t) => (
              <Tool key={t.label} {...t} />
            ))}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
      {exporting && <ExportSheet edit={edit} onClose={() => setExporting(false)} onUploaded={(uploaded) => useEdits.getState().setEdit({ ...current(), assets: uploaded.assets })} />}
    </SafeAreaView>
  );
}
