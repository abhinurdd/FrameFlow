/**
 * The manual editor's document: one JSON "Edit" per project, in the same spirit as
 * ClipSpec (docs/strategy.md §4). Every editing tool is a pure function from one Edit
 * to the next, which is what lets undo/redo, the on-device preview and the export
 * renderer share a single source of truth.
 *
 * Conventions
 * - Times are seconds. `in`/`out` are positions in the source asset; `start` and
 *   `duration` are on the edit's own timeline.
 * - Positions and sizes are fractions of the canvas, so an Edit is resolution free.
 *   A transform's x/y is the offset of the item's centre from the canvas centre.
 * - Layer order, bottom to top: background, main track, overlays (array order),
 *   texts, captions, effects.
 */

import { IDENTITY, NO_ANIMATION, transformAt, type Animation, type EffectId, type Keyframe, type Transform, type Transition } from './animate';
import type { Chroma } from './chroma';
import type { Mask } from './mask';
import { NO_LOOK, type Look } from './looks';
import { offsetAt, playDuration, sliceCurve, sourceAt } from './speed';
import type { TemplateId } from './types';

export type EditAspect = 'original' | '9:16' | '16:9' | '1:1' | '4:5' | '3:4' | '4:3' | '21:9';
export type AssetKind = 'video' | 'image' | 'audio';

export type Asset = {
  id: string;
  uri: string;
  kind: AssetKind;
  /** Images have no duration of their own; 0 for them. */
  duration: number;
  width: number;
  height: number;
  name?: string;
  /** Id of the uploaded copy on the media server, once it has been sent for export. */
  remoteId?: string;
  /** The file is not on this phone (a linked video that has not been downloaded). Shown as a stand-in frame. */
  placeholder?: boolean;
};

export type Fit = 'contain' | 'cover';

/** A piece of the main track. The main track is magnetic: segments play back to back. */
export type Segment = {
  id: string;
  assetId: string;
  in: number;
  out: number;
  speed: number;
  /** Speed curve on top of `speed`: multipliers at even points along the clip. See speed.ts. */
  curve?: number[] | null;
  volume: number;
  muted: boolean;
  /** Audio fades, in timeline seconds. */
  fadeIn: number;
  fadeOut: number;
  rotation: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
  /** How the frame fills the canvas before `transform` is applied. */
  fit: Fit;
  transform: Transform;
  keyframes: Keyframe[];
  /** Green screen: this colour is removed, showing the canvas background behind the clip. */
  chroma?: Chroma | null;
  look: Look;
  animation: Animation;
  /** Transition into the next segment. The two segments overlap for its duration. */
  transition: Transition | null;
};

export type BlendMode = 'normal' | 'screen' | 'multiply' | 'overlay' | 'soft-light' | 'lighten' | 'darken';
export const BLEND_MODES: BlendMode[] = ['normal', 'screen', 'multiply', 'overlay', 'soft-light', 'lighten', 'darken'];
export type { Mask } from './mask';
/** The modes a playing video can be given: the ones its live preview can show. */
export const VIDEO_BLEND_MODES: BlendMode[] = ['normal', 'screen', 'multiply'];

/** The blend mode an overlay is really drawn with. */
export function overlayBlend(o: { kind: Overlay['kind']; blend: BlendMode }): BlendMode {
  if (o.kind === 'sticker') return 'normal';
  return o.kind === 'image' || VIDEO_BLEND_MODES.includes(o.blend) ? o.blend : 'normal';
}

/** Picture-in-picture video or image, or an emoji sticker. Base width is half the canvas. */
export type Overlay = {
  id: string;
  kind: 'video' | 'image' | 'sticker';
  assetId?: string;
  emoji?: string;
  start: number;
  duration: number;
  /** Source offset for video overlays. */
  in: number;
  volume: number;
  muted: boolean;
  flipH: boolean;
  transform: Transform;
  keyframes: Keyframe[];
  look: Look;
  blend: BlendMode;
  mask: Mask;
  /** Green-screen removal, or none. */
  chroma?: Chroma | null;
  animation: Animation;
};

export type FontId = 'inter' | 'serif' | 'mono' | 'rounded';
export const FONTS: { id: FontId; name: string }[] = [
  { id: 'inter', name: 'Inter' },
  { id: 'serif', name: 'Serif' },
  { id: 'mono', name: 'Mono' },
  { id: 'rounded', name: 'Rounded' },
];

export type TextStyle = {
  font: FontId;
  /** Font size in points on a canvas 360 points wide. */
  size: number;
  color: string;
  weight: 'regular' | 'bold' | 'black';
  italic: boolean;
  uppercase: boolean;
  align: 'left' | 'center' | 'right';
  strokeColor: string | null;
  shadow: boolean;
  /** Box behind the text, or null. */
  background: string | null;
  letterSpacing: number;
};

export type TextItem = {
  id: string;
  text: string;
  start: number;
  duration: number;
  transform: Transform;
  keyframes: Keyframe[];
  style: TextStyle;
  animation: Animation;
};

export type CaptionWord = {
  t0: number;
  t1: number;
  text: string;
  /** The same word in the other script (Roman for Devanagari and the reverse), when known. */
  alt?: string;
  /** A keyword the caption template should highlight. */
  emphasis?: boolean;
};
export type Caption = { id: string; start: number; duration: number; text: string; words?: CaptionWord[] };
export type CaptionStyle = { template: TemplateId; size: number; /** Vertical centre, 0 (top) to 1 (bottom). */ y: number };

export type AudioItem = {
  id: string;
  assetId: string;
  kind: 'music' | 'voiceover' | 'sfx' | 'extracted';
  start: number;
  in: number;
  out: number;
  volume: number;
  muted: boolean;
  fadeIn: number;
  fadeOut: number;
};

export type EffectItem = { id: string; type: EffectId; start: number; duration: number };

export type Background = { type: 'color'; color: string } | { type: 'blur' };

export type Edit = {
  id: string;
  name: string;
  version: 2;
  aspect: EditAspect;
  background: Background;
  assets: Record<string, Asset>;
  main: Segment[];
  overlays: Overlay[];
  texts: TextItem[];
  captions: Caption[];
  captionStyle: CaptionStyle;
  audio: AudioItem[];
  effects: EffectItem[];
  /** Beat or cue markers, in timeline seconds. */
  markers: number[];
  createdAt: number;
  updatedAt: number;
};

/** Tracks whose items sit freely on the timeline with a start and a duration. */
export type TrackId = 'overlays' | 'texts' | 'captions' | 'audio' | 'effects';
export type TrackItem = Overlay | TextItem | Caption | AudioItem | EffectItem;

/** Shortest segment a trim or split may leave behind. */
export const MIN_SEGMENT = 0.1;
export const SPEEDS = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 8] as const;
export const ASPECTS: EditAspect[] = ['original', '9:16', '16:9', '1:1', '4:5', '3:4', '4:3', '21:9'];
export const IMAGE_DURATION = 3;

export const DEFAULT_TEXT_STYLE: TextStyle = {
  font: 'inter',
  size: 28,
  color: '#FFFFFF',
  weight: 'black',
  italic: false,
  uppercase: false,
  align: 'center',
  strokeColor: null,
  shadow: true,
  background: null,
  letterSpacing: 0,
};

export function blankEdit(id: string, name: string, now: number): Edit {
  return {
    id,
    name,
    version: 2,
    aspect: 'original',
    background: { type: 'color', color: '#000000' },
    assets: {},
    main: [],
    overlays: [],
    texts: [],
    captions: [],
    captionStyle: { template: 'desi-pop', size: 20, y: 0.78 },
    audio: [],
    effects: [],
    markers: [],
    createdAt: now,
    updatedAt: now,
  };
}

// ---- Time ----

export function segmentDuration(s: Segment) {
  return playDuration(s);
}

/** Source seconds per playback second, averaged over the clip. */
export function averageSpeed(s: Segment) {
  return (s.out - s.in) / Math.max(playDuration(s), 1e-6);
}

/** Length of the transition out of segment `i`, capped so transitions never touch. */
export function transitionDuration(edit: Edit, i: number) {
  const s = edit.main[i];
  const next = edit.main[i + 1];
  if (!s?.transition || !next) return 0;
  return Math.max(0, Math.min(s.transition.duration, segmentDuration(s) / 2, segmentDuration(next) / 2));
}

/** Timeline start of each segment. A transition pulls the next segment earlier by its length. */
export function segmentStarts(edit: Edit) {
  let t = 0;
  return edit.main.map((s, i) => {
    const start = t;
    t += segmentDuration(s) - transitionDuration(edit, i);
    return start;
  });
}

export function itemEnd(item: { start: number; duration: number }) {
  return item.start + item.duration;
}

export function audioDuration(a: AudioItem) {
  return a.out - a.in;
}

export function mainDuration(edit: Edit) {
  const last = edit.main.length - 1;
  return last < 0 ? 0 : segmentStarts(edit)[last] + segmentDuration(edit.main[last]);
}

/** The edit is as long as its main track; with no main track, as long as its last item. */
export function totalDuration(edit: Edit) {
  if (edit.main.length) return mainDuration(edit);
  const ends = [...edit.overlays, ...edit.texts, ...edit.captions, ...edit.effects].map(itemEnd);
  return Math.max(0, ...ends, ...edit.audio.map((a) => a.start + audioDuration(a)));
}

export type Location = { index: number; segment: Segment; start: number; /** Seconds into the segment, on the timeline. */ offset: number; sourceTime: number };

function locationOf(edit: Edit, starts: number[], index: number, t: number): Location {
  const segment = edit.main[index];
  const offset = Math.min(Math.max(t - starts[index], 0), segmentDuration(segment));
  return { index, segment, start: starts[index], offset, sourceTime: sourceAt(segment, offset) };
}

/** The segment under timeline time `t`: the latest one to have started. Clamps to the ends. */
export function locate(edit: Edit, t: number): Location | null {
  if (!edit.main.length) return null;
  const starts = segmentStarts(edit);
  let index = 0;
  for (let i = 0; i < starts.length; i++) if (t >= starts[i]) index = i;
  return locationOf(edit, starts, index, t);
}

export type MainFrame = { a: Location; b: null; progress: 0 } | { a: Location; b: Location; progress: number; transition: Transition };

/** What the main track shows at `t`: one segment, or two mid-transition (a going out, b coming in). */
export function mainFrameAt(edit: Edit, t: number): MainFrame | null {
  const here = locate(edit, t);
  if (!here) return null;
  const starts = segmentStarts(edit);
  const prev = here.index - 1;
  const d = prev >= 0 ? transitionDuration(edit, prev) : 0;
  if (d > 0 && t < here.start + d) {
    return { a: locationOf(edit, starts, prev, t), b: here, progress: (t - here.start) / d, transition: edit.main[prev].transition! };
  }
  return { a: here, b: null, progress: 0 };
}

export function activeAt<T extends { start: number; duration: number }>(items: T[], t: number) {
  return items.filter((i) => t >= i.start && t < i.start + i.duration);
}

export function aspectRatio(edit: Edit) {
  if (edit.aspect !== 'original') {
    const [w, h] = edit.aspect.split(':').map(Number);
    return w / h;
  }
  const first = edit.main[0];
  const asset = first && edit.assets[first.assetId];
  if (!asset || !asset.width || !asset.height) return 9 / 16;
  return first.rotation % 180 !== 0 ? asset.height / asset.width : asset.width / asset.height;
}

// ---- Main track ----

export function newSegment(id: string, asset: Asset): Segment {
  return {
    id,
    assetId: asset.id,
    in: 0,
    out: asset.kind === 'image' ? IMAGE_DURATION : asset.duration,
    speed: 1,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    rotation: 0,
    flipH: false,
    flipV: false,
    fit: 'contain',
    transform: IDENTITY,
    keyframes: [],
    look: NO_LOOK,
    animation: NO_ANIMATION,
    transition: null,
  };
}

export function addAssets(edit: Edit, assets: Asset[]): Edit {
  return { ...edit, assets: { ...edit.assets, ...Object.fromEntries(assets.map((a) => [a.id, a])) } };
}

export function appendAssets(edit: Edit, assets: Asset[], segmentIds: string[]): Edit {
  return { ...addAssets(edit, assets), main: [...edit.main, ...assets.map((a, i) => newSegment(segmentIds[i], a))] };
}

/** Keyframes for the two halves of an item cut `offset` seconds in, so motion carries across the cut. */
function splitKeyframes(item: { transform: Transform; keyframes: Keyframe[] }, offset: number): [Keyframe[], Keyframe[]] {
  if (!item.keyframes.length) return [[], []];
  const at = transformAt(item, offset);
  const ease = item.keyframes.filter((k) => k.t <= offset).pop()?.ease ?? 'in-out';
  return [
    [...item.keyframes.filter((k) => k.t < offset - 0.001), { ...at, t: offset, ease }],
    [{ ...at, t: 0, ease }, ...item.keyframes.filter((k) => k.t > offset + 0.001).map((k) => ({ ...k, t: k.t - offset }))],
  ];
}

/** Cut the segment under `t` in two. No-op when the cut would leave a sliver. */
export function splitAt(edit: Edit, t: number, newId: string): Edit {
  const loc = locate(edit, t);
  if (!loc) return edit;
  const { segment, index, sourceTime, offset } = loc;
  const min = MIN_SEGMENT * segment.speed;
  if (sourceTime - segment.in < min || segment.out - sourceTime < min) return edit;
  const [before, after] = splitKeyframes(segment, offset);
  // The in animation stays with the first half and the out animation with the second.
  const u = (sourceTime - segment.in) / (segment.out - segment.in);
  const left: Segment = { ...segment, out: sourceTime, curve: sliceCurve(segment.curve, 0, u), transition: null, fadeOut: 0, keyframes: before, animation: { ...segment.animation, out: 'none' } };
  const right: Segment = { ...segment, id: newId, in: sourceTime, curve: sliceCurve(segment.curve, u, 1), fadeIn: 0, keyframes: after, animation: { ...segment.animation, in: 'none' } };
  const main = [...edit.main];
  main.splice(index, 1, left, right);
  return { ...edit, main };
}

export function patchSegment(edit: Edit, id: string, patch: Partial<Omit<Segment, 'id' | 'assetId'>>): Edit {
  return { ...edit, main: edit.main.map((s) => (s.id === id ? { ...s, ...patch } : s)) };
}

/** Move a segment's in and/or out point, clamped to the source and to MIN_SEGMENT. */
export function trimSegment(edit: Edit, id: string, to: { in?: number; out?: number }): Edit {
  const s = edit.main.find((x) => x.id === id);
  const asset = s && edit.assets[s.assetId];
  if (!s || !asset) return edit;
  const min = MIN_SEGMENT * s.speed;
  // A still image can be stretched to any length.
  const sourceEnd = asset.kind === 'image' ? Math.max(s.out, to.out ?? 0, 600) : asset.duration;
  // When only the in point moves it stops short of the out point, rather than pushing it.
  const inMax = (to.out === undefined ? s.out : sourceEnd) - min;
  // A still has no in point: dragging its left edge just makes it shorter or longer.
  if (asset.kind === 'image' && to.in !== undefined) return patchSegment(edit, id, { in: 0, out: Math.max(min, s.out - (to.in - s.in)) });
  const nextIn = asset.kind === 'image' ? 0 : Math.min(Math.max(to.in ?? s.in, 0), inMax);
  const nextOut = Math.min(Math.max(to.out ?? s.out, nextIn + min), sourceEnd);
  return patchSegment(edit, id, { in: nextIn, out: nextOut });
}

export function removeSegment(edit: Edit, id: string): Edit {
  return { ...edit, main: edit.main.filter((s) => s.id !== id) };
}

export function duplicateSegment(edit: Edit, id: string, newId: string): Edit {
  const i = edit.main.findIndex((s) => s.id === id);
  if (i < 0) return edit;
  const main = [...edit.main];
  main.splice(i + 1, 0, { ...main[i], id: newId, transition: null });
  return { ...edit, main };
}

export function moveSegment(edit: Edit, id: string, by: -1 | 1): Edit {
  const i = edit.main.findIndex((s) => s.id === id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= edit.main.length) return edit;
  const main = [...edit.main];
  [main[i], main[j]] = [main[j], main[i]];
  return { ...edit, main };
}

/** Swap in a different source (replace, or a reversed copy), keeping the edit made to the clip. */
export function replaceSegmentAsset(edit: Edit, id: string, asset: Asset, range?: { in: number; out: number }): Edit {
  const s = edit.main.find((x) => x.id === id);
  if (!s) return edit;
  const length = s.out - s.in;
  const next = range ?? { in: 0, out: asset.kind === 'image' ? length : Math.min(asset.duration, length) };
  return { ...addAssets(edit, [asset]), main: edit.main.map((x) => (x.id === id ? { ...x, assetId: asset.id, ...next } : x)) };
}

export function setTransition(edit: Edit, id: string, transition: Transition | null, all = false): Edit {
  return { ...edit, main: edit.main.map((s, i) => (all ? i < edit.main.length - 1 : s.id === id) ? { ...s, transition } : s) };
}

// ---- Free tracks ----

export function newOverlay(id: string, at: number, source: { asset: Asset } | { emoji: string }): Overlay {
  const asset = 'asset' in source ? source.asset : undefined;
  return {
    id,
    kind: asset ? (asset.kind === 'video' ? 'video' : 'image') : 'sticker',
    assetId: asset?.id,
    emoji: 'emoji' in source ? source.emoji : undefined,
    start: at,
    duration: asset?.kind === 'video' ? asset.duration : IMAGE_DURATION,
    in: 0,
    volume: 1,
    muted: false,
    flipH: false,
    transform: asset ? IDENTITY : { ...IDENTITY, scale: 0.5 },
    keyframes: [],
    look: NO_LOOK,
    blend: 'normal',
    mask: 'none',
    animation: NO_ANIMATION,
  };
}

export function newText(id: string, at: number, text = 'Text'): TextItem {
  return { id, text, start: at, duration: 3, transform: IDENTITY, keyframes: [], style: DEFAULT_TEXT_STYLE, animation: NO_ANIMATION };
}

export function newAudio(id: string, at: number, asset: Asset, kind: AudioItem['kind']): AudioItem {
  return { id, assetId: asset.id, kind, start: at, in: 0, out: asset.duration, volume: 1, muted: false, fadeIn: 0, fadeOut: 0 };
}

export function addItem<K extends TrackId>(edit: Edit, track: K, item: Edit[K][number]): Edit {
  return { ...edit, [track]: [...edit[track], item] };
}

export function patchItem<K extends TrackId>(edit: Edit, track: K, id: string, patch: Partial<Edit[K][number]>): Edit {
  return { ...edit, [track]: edit[track].map((i) => (i.id === id ? { ...i, ...patch } : i)) };
}

export function removeItem(edit: Edit, track: TrackId, id: string): Edit {
  return { ...edit, [track]: edit[track].filter((i) => i.id !== id) };
}

/** Latest start that keeps an item reachable: items past the end of the video never play. */
function clampStart(edit: Edit, start: number) {
  const end = mainDuration(edit);
  return Math.max(0, end > 0 ? Math.min(start, end - 2 * MIN_SEGMENT) : start);
}

export function duplicateItem(edit: Edit, track: TrackId, id: string, newId: string): Edit {
  const item = edit[track].find((i) => i.id === id);
  if (!item) return edit;
  const length = 'duration' in item ? item.duration : audioDuration(item);
  return { ...edit, [track]: [...edit[track], { ...item, id: newId, start: clampStart(edit, item.start + length) }] };
}

/** Slide an item along the timeline. */
export function moveItem(edit: Edit, track: TrackId, id: string, start: number): Edit {
  return patchItem(edit, track, id, { start: clampStart(edit, start) });
}

/** Drag an item's left or right edge by `delta` timeline seconds. */
export function trimItem(edit: Edit, track: TrackId, id: string, side: 'start' | 'end', delta: number): Edit {
  const item = edit[track].find((i) => i.id === id);
  if (!item) return edit;
  if (track === 'audio') {
    const a = item as AudioItem;
    const source = edit.assets[a.assetId]?.duration ?? a.out;
    if (side === 'start') {
      const d = Math.min(Math.max(delta, -a.in, -a.start), audioDuration(a) - MIN_SEGMENT);
      return patchItem(edit, 'audio', id, { start: a.start + d, in: a.in + d });
    }
    return patchItem(edit, 'audio', id, { out: Math.min(Math.max(a.out + delta, a.in + MIN_SEGMENT), source) });
  }
  const it = item as Overlay | TextItem | Caption | EffectItem;
  const isVideo = track === 'overlays' && (it as Overlay).kind === 'video';
  const o = it as Overlay;
  const source = isVideo ? (edit.assets[o.assetId ?? '']?.duration ?? Infinity) : Infinity;
  if (side === 'start') {
    const floor = Math.max(-it.start, isVideo ? -o.in : -Infinity);
    const d = Math.min(Math.max(delta, floor), it.duration - MIN_SEGMENT);
    const patch = { start: it.start + d, duration: it.duration - d, ...(isVideo ? { in: o.in + d } : {}) };
    return patchItem(edit, track, id, patch as Partial<Edit[typeof track][number]>);
  }
  const max = isVideo ? source - o.in : Infinity;
  return patchItem(edit, track, id, { duration: Math.min(Math.max(it.duration + delta, MIN_SEGMENT), max) } as Partial<Edit[typeof track][number]>);
}

/** Cut a free-track item in two at timeline time `t`. */
export function splitItem(edit: Edit, track: TrackId, id: string, t: number, newId: string): Edit {
  const item = edit[track].find((i) => i.id === id);
  if (!item) return edit;
  const length = 'duration' in item ? item.duration : audioDuration(item);
  const cut = t - item.start;
  if (cut < MIN_SEGMENT || length - cut < MIN_SEGMENT) return edit;
  let left: TrackItem;
  let right: TrackItem;
  if (track === 'audio') {
    const a = item as AudioItem;
    left = { ...a, out: a.in + cut, fadeOut: 0 };
    right = { ...a, id: newId, start: t, in: a.in + cut, fadeIn: 0 };
  } else {
    const it = item as Overlay | TextItem | Caption | EffectItem;
    left = { ...it, duration: cut };
    right = { ...it, id: newId, start: t, duration: it.duration - cut };
    if (track === 'overlays' && (it as Overlay).kind === 'video') (right as Overlay).in = (it as Overlay).in + cut;
    if ('keyframes' in it) {
      const [before, after] = splitKeyframes(it, cut);
      Object.assign(left, { keyframes: before, animation: { ...it.animation, out: 'none' } });
      Object.assign(right, { keyframes: after, animation: { ...it.animation, in: 'none' } });
    }
    if (track === 'captions') {
      const words = (it as Caption).words;
      if (words) {
        // Cutting before the first word or after the last would leave an empty caption.
        if (!words.some((w) => w.t0 < cut) || !words.some((w) => w.t0 >= cut)) return edit;
        (left as Caption).words = words.filter((w) => w.t0 < cut);
        (right as Caption).words = words.filter((w) => w.t0 >= cut).map((w) => ({ ...w, t0: w.t0 - cut, t1: w.t1 - cut }));
        (left as Caption).text = (left as Caption).words!.map((w) => w.text).join(' ');
        (right as Caption).text = (right as Caption).words!.map((w) => w.text).join(' ');
      }
    }
  }
  return { ...edit, [track]: edit[track].flatMap((i) => (i.id === id ? [left, right] : [i])) };
}

type Range = { start: number; end: number };

function mergeRanges(ranges: Range[], end: number): Range[] {
  const out: Range[] = [];
  for (const r of [...ranges].sort((a, b) => a.start - b.start)) {
    const range = { start: Math.max(0, r.start), end: Math.min(end, r.end) };
    if (range.end - range.start <= 1e-6) continue;
    const last = out[out.length - 1];
    if (last && range.start <= last.end + 1e-6) last.end = Math.max(last.end, range.end);
    else out.push(range);
  }
  return out;
}

/**
 * Remove ranges of the main track and close the gaps. Returns the ranges that were
 * really removed: a cut that would leave a sliver is widened to the clip's edge.
 *
 * Each segment "owns" the timeline from its start to the next segment's start, so
 * during a transition a cut lands on the incoming clip, as it does on screen.
 */
function cutMain(edit: Edit, ranges: Range[], makeId: () => string): { edit: Edit; removed: Range[] } {
  const removed: Range[] = [];
  let out = edit;
  // Work from the end so earlier cuts do not shift later ones.
  for (const r of mergeRanges(ranges, mainDuration(edit)).reverse()) {
    const starts = segmentStarts(out);
    const main = [...out.main];
    let from = Infinity;
    for (let i = main.length - 1; i >= 0; i--) {
      const s = main[i];
      const st = starts[i];
      const segEnd = st + segmentDuration(s);
      const ownEnd = i + 1 < starts.length ? starts[i + 1] : segEnd;
      const tail = segEnd - ownEnd > 1e-6;
      let a = Math.max(r.start, st);
      let b = Math.min(r.end, ownEnd);
      if (b - a <= 1e-6) continue;
      if (a - st < MIN_SEGMENT) a = st;
      if (!tail && segEnd - b < MIN_SEGMENT) b = segEnd;
      const source = (t: number) => sourceAt(s, t - st);
      const part = (from: number, to: number) => sliceCurve(s.curve, (from - s.in) / (s.out - s.in), (to - s.in) / (s.out - s.in));
      const later = (offset: number) => s.keyframes.filter((k) => k.t >= offset).map((k) => ({ ...k, t: k.t - offset }));
      if (a <= st && b >= ownEnd - 1e-6) {
        main.splice(i, 1);
        b = ownEnd;
      } else if (a <= st) {
        main[i] = { ...s, in: source(b), curve: part(source(b), s.out), fadeIn: 0, keyframes: later(b - st), animation: { ...s.animation, in: 'none' } };
      } else if (!tail && b >= segEnd - 1e-6) {
        main[i] = { ...s, out: source(a), curve: part(s.in, source(a)), fadeOut: 0, transition: null, keyframes: s.keyframes.filter((k) => k.t <= a - st), animation: { ...s.animation, out: 'none' } };
      } else {
        const left: Segment = { ...s, out: source(a), curve: part(s.in, source(a)), fadeOut: 0, transition: null, keyframes: s.keyframes.filter((k) => k.t <= a - st), animation: { ...s.animation, out: 'none' } };
        const right: Segment = { ...s, id: makeId(), in: source(b), curve: part(source(b), s.out), fadeIn: 0, keyframes: later(b - st), animation: { ...s.animation, in: 'none' } };
        main.splice(i, 1, left, right);
      }
      from = Math.min(from, a);
    }
    // Measured, not assumed: a cut next to a transition can change how long that transition runs.
    const shorter = mainDuration(out) - mainDuration({ ...out, main });
    if (shorter > 1e-6) removed.push({ start: from, end: from + shorter });
    out = { ...out, main };
  }
  return { edit: out, removed: mergeRanges(removed, Infinity) };
}

export function cutRanges(edit: Edit, ranges: Range[], makeId: () => string): Edit {
  return cutMain(edit, ranges, makeId).edit;
}

/** Slide everything on the free tracks left to close the given gaps. Captions shrink with the words inside them. */
function closeGaps(edit: Edit, removed: Range[]): Edit {
  if (!removed.length) return edit;
  const shift = (t: number) => t - removed.reduce((sum, r) => sum + Math.max(0, Math.min(t, r.end) - r.start), 0);
  const move = <T extends { start: number }>(item: T): T => ({ ...item, start: shift(item.start) });
  const caption = (c: Caption): Caption => {
    const start = shift(c.start);
    const words = c.words?.map((w) => {
      const t0 = shift(c.start + w.t0) - start;
      return { ...w, t0, t1: Math.max(shift(c.start + w.t1) - start, t0 + 0.02) };
    });
    return { ...c, start, duration: Math.max(shift(c.start + c.duration) - start, MIN_SEGMENT), words };
  };
  return { ...edit, overlays: edit.overlays.map(move), texts: edit.texts.map(move), captions: edit.captions.map(caption), effects: edit.effects.map(move), audio: edit.audio.map(move), markers: edit.markers.map(shift) };
}

/** `cutRanges`, plus everything on the free tracks slides left to stay in step with the picture. */
export function rippleCut(edit: Edit, ranges: Range[], makeId: () => string): Edit {
  const cut = cutMain(edit, ranges, makeId);
  return closeGaps(cut.edit, cut.removed);
}

/**
 * Delete a clip. What was attached to it (text, captions, effects, overlays that start
 * over it) goes with it, and everything after slides left.
 */
export function deleteSegment(edit: Edit, id: string): Edit {
  const i = edit.main.findIndex((s) => s.id === id);
  if (i < 0) return edit;
  const starts = segmentStarts(edit);
  const from = starts[i];
  const to = i + 1 < starts.length ? starts[i + 1] : mainDuration(edit);
  const after = removeSegment(edit, id);
  // Measured, not assumed: transitions around the clip change how much shorter the video gets.
  const gap = mainDuration(edit) - mainDuration(after);
  const keep = <T extends { start: number }>(items: T[]) => items.filter((x) => x.start < from - 1e-6 || x.start >= to - 1e-6).map((x) => (x.start >= to - 1e-6 ? { ...x, start: Math.max(0, x.start - gap) } : x));
  return {
    ...after,
    overlays: keep(after.overlays),
    texts: keep(after.texts),
    captions: keep(after.captions),
    effects: keep(after.effects),
    audio: [...after.audio.filter((a) => a.kind === 'music'), ...keep(after.audio.filter((a) => a.kind !== 'music'))],
    markers: after.markers.filter((m) => m < from || m >= to).map((m) => (m >= to ? m - gap : m)),
  };
}

/**
 * Linkage: after the main track changes shape (speed, trim, reorder, a new transition),
 * move everything on the free tracks so it stays over the same moment of the same clip.
 * Captions also stretch with the clip's speed. Background music stays where it is.
 */
export function relink(before: Edit, after: Edit): Edit {
  if (!before.main.length || !after.main.length) return after;
  const starts = segmentStarts(after);
  const end = mainDuration(before);
  const existed = new Set(before.main.map((s) => s.id));
  const anchor = (t: number): { time: number; scale: number } | null => {
    const loc = locate(before, t);
    if (!loc || t >= end) return null;
    const src = loc.sourceTime;
    const old = loc.segment;
    const holds = (s: Segment) => s.assetId === old.assetId && src >= s.in - 1e-6 && src <= s.out + 1e-6;
    const same = after.main.findIndex((s) => s.id === old.id);
    // The same clip if it still shows this moment; else a piece newly cut from it (split, ramp).
    // An older clip that happens to share the source (a duplicate) is never a candidate.
    let i = same >= 0 && holds(after.main[same]) ? same : -1;
    if (i < 0) {
      const pieces = after.main.map((s, k) => k).filter((k) => holds(after.main[k]) && !existed.has(after.main[k].id));
      const near = same >= 0 ? same : loc.index;
      if (pieces.length) i = pieces.reduce((best, k) => (Math.abs(k - near) < Math.abs(best - near) ? k : best));
    }
    if (i >= 0) return { time: starts[i] + offsetAt(after.main[i], src), scale: averageSpeed(old) / averageSpeed(after.main[i]) };
    if (same < 0) return null;
    // The moment was trimmed away: pin to the nearer edge of the clip.
    const s = after.main[same];
    return { time: src < s.in ? starts[same] : starts[same] + segmentDuration(s), scale: averageSpeed(old) / averageSpeed(s) };
  };
  const move = <T extends { start: number }>(item: T): T => {
    const a = anchor(item.start);
    return a ? { ...item, start: a.time } : item;
  };
  const caption = (c: Caption): Caption => {
    const a = anchor(c.start);
    if (!a) return c;
    return { ...c, start: a.time, duration: c.duration * a.scale, words: c.words?.map((w) => ({ ...w, t0: w.t0 * a.scale, t1: w.t1 * a.scale })) };
  };
  return {
    ...after,
    overlays: after.overlays.map(move),
    texts: after.texts.map(move),
    captions: after.captions.map(caption),
    effects: after.effects.map(move),
    audio: after.audio.map((a) => (a.kind === 'music' ? a : move(a))),
    markers: after.markers.map((m) => anchor(m)?.time ?? m),
  };
}

/**
 * Group words into caption lines of at most `maxWords`. A pause starts a new line, so a
 * caption never hangs on screen across a silence.
 */
export function captionsFromWords(words: CaptionWord[], maxWords: number, makeId: () => string, maxGap = 0.7): Caption[] {
  const groups: CaptionWord[][] = [];
  for (const w of words) {
    const group = groups[groups.length - 1];
    const last = group?.[group.length - 1];
    if (!group || group.length >= maxWords || w.t0 - last!.t1 > maxGap) groups.push([w]);
    else group.push(w);
  }
  return groups.map((group) => {
    const start = group[0].t0;
    const end = group[group.length - 1].t1;
    return { id: makeId(), start, duration: Math.max(end - start, MIN_SEGMENT), text: group.map((w) => w.text).join(' '), words: group.map((w) => ({ ...w, t0: w.t0 - start, t1: w.t1 - start })) };
  });
}

const captionText = (words: CaptionWord[]) => words.map((w) => w.text).join(' ');

/**
 * Transcript editing: remove the caption words that `match`, and cut the same moments
 * out of the video. Captions left with no words are dropped.
 */
export function cutCaptionWords(edit: Edit, match: (word: CaptionWord, caption: Caption, index: number) => boolean, makeId: () => string): Edit {
  const ranges: Range[] = [];
  const doomed = new Set<CaptionWord>();
  for (const c of edit.captions) {
    c.words?.forEach((w, i) => {
      if (!match(w, c, i)) return;
      doomed.add(w);
      ranges.push({ start: c.start + w.t0, end: c.start + w.t1 });
    });
  }
  if (!ranges.length) return edit;
  // Cut the video first, with the words still in place, so every caption is retimed against what was really removed.
  const cut = cutMain(edit, ranges, makeId);
  const closed = closeGaps({ ...cut.edit, captions: edit.captions }, cut.removed);
  const captions = closed.captions.flatMap((c, k) => {
    const before = edit.captions[k].words;
    if (!before || !c.words) return [c];
    const words = c.words.filter((_, i) => !doomed.has(before[i]));
    return words.length ? [{ ...c, words, text: captionText(words) }] : [];
  });
  return { ...closed, captions };
}

export function patchCaptionWord(edit: Edit, captionId: string, index: number, patch: Partial<CaptionWord>): Edit {
  return {
    ...edit,
    captions: edit.captions.map((c) => {
      if (c.id !== captionId || !c.words) return c;
      const words = c.words.map((w, i) => (i === index ? { ...w, ...patch } : w));
      return { ...c, words, text: captionText(words) };
    }),
  };
}

/** Switch every caption between its two scripts (Roman and Devanagari), where both are known. */
export function swapCaptionScript(edit: Edit): Edit {
  return {
    ...edit,
    captions: edit.captions.map((c) => {
      if (!c.words?.some((w) => w.alt)) return c;
      const words = c.words.map((w) => (w.alt ? { ...w, text: w.alt, alt: w.text } : w));
      return { ...c, words, text: captionText(words) };
    }),
  };
}

/** Parse SubRip (.srt) text into captions. */
export function parseSrt(srt: string, makeId: () => string): Caption[] {
  const time = (s: string) => {
    const m = s.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/);
    return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, '0').slice(0, 3)) / 1000 : NaN;
  };
  const out: Caption[] = [];
  for (const block of srt.replace(/\r/g, '').split(/\n\s*\n/)) {
    const lines = block.split('\n').filter((l) => l.trim());
    const at = lines.findIndex((l) => l.includes('-->'));
    if (at < 0) continue;
    const [from, to] = lines[at].split('-->').map(time);
    const text = lines.slice(at + 1).join(' ').replace(/<[^>]+>/g, '').trim();
    if (Number.isNaN(from) || Number.isNaN(to) || to <= from || !text) continue;
    out.push({ id: makeId(), start: from, duration: to - from, text });
  }
  return out;
}
