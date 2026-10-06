/**
 * The manual editor's document: one JSON "Edit" per project, in the same spirit as
 * ClipSpec (docs/strategy.md §4). Every editing tool is a pure function from one Edit
 * to the next, which is what makes undo/redo, on-device preview and a later
 * render-on-export share a single source of truth.
 *
 * Times are seconds. `in`/`out` are positions in the source asset; everything else
 * is on the edit's own timeline.
 */

export type EditAspect = 'original' | '9:16' | '16:9' | '1:1' | '4:5' | '4:3' | '21:9';

export type Asset = {
  id: string;
  uri: string;
  duration: number;
  width: number;
  height: number;
};

/** A piece of the main track. The main track is magnetic: segments play back to back. */
export type Segment = {
  id: string;
  assetId: string;
  in: number;
  out: number;
  speed: number;
  volume: number;
  muted: boolean;
  rotation: 0 | 90 | 180 | 270;
  flipH: boolean;
};

export type TextItem = {
  id: string;
  text: string;
  start: number;
  duration: number;
  /** Centre of the text as a fraction of the canvas (0–1). */
  x: number;
  y: number;
  size: number;
  color: string;
};

export type Edit = {
  id: string;
  name: string;
  aspect: EditAspect;
  assets: Record<string, Asset>;
  main: Segment[];
  texts: TextItem[];
  createdAt: number;
  updatedAt: number;
};

/** Shortest segment a trim or split may leave behind. */
export const MIN_SEGMENT = 0.1;
export const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const;
export const ASPECTS: EditAspect[] = ['original', '9:16', '16:9', '1:1', '4:5', '4:3', '21:9'];

export function segmentDuration(s: Segment) {
  return (s.out - s.in) / s.speed;
}

export function totalDuration(edit: Edit) {
  return edit.main.reduce((sum, s) => sum + segmentDuration(s), 0);
}

/** Timeline start time of each segment. */
export function segmentStarts(edit: Edit) {
  let t = 0;
  return edit.main.map((s) => {
    const start = t;
    t += segmentDuration(s);
    return start;
  });
}

export type Location = { index: number; segment: Segment; start: number; sourceTime: number };

/** Which segment is under timeline time `t`, and where in its source. Clamps to the ends. */
export function locate(edit: Edit, t: number): Location | null {
  if (!edit.main.length) return null;
  const starts = segmentStarts(edit);
  let index = edit.main.length - 1;
  for (let i = 0; i < edit.main.length; i++) {
    if (t < starts[i] + segmentDuration(edit.main[i])) {
      index = i;
      break;
    }
  }
  const segment = edit.main[index];
  const offset = Math.min(Math.max(t - starts[index], 0), segmentDuration(segment));
  return { index, segment, start: starts[index], sourceTime: segment.in + offset * segment.speed };
}

export function aspectRatio(edit: Edit) {
  if (edit.aspect !== 'original') {
    const [w, h] = edit.aspect.split(':').map(Number);
    return w / h;
  }
  const first = edit.assets[edit.main[0]?.assetId];
  if (!first) return 9 / 16;
  const turned = edit.main[0].rotation % 180 !== 0;
  return turned ? first.height / first.width : first.width / first.height;
}

export function newSegment(id: string, asset: Asset): Segment {
  return { id, assetId: asset.id, in: 0, out: asset.duration, speed: 1, volume: 1, muted: false, rotation: 0, flipH: false };
}

export function appendAssets(edit: Edit, assets: Asset[], segmentIds: string[]): Edit {
  return {
    ...edit,
    assets: { ...edit.assets, ...Object.fromEntries(assets.map((a) => [a.id, a])) },
    main: [...edit.main, ...assets.map((a, i) => newSegment(segmentIds[i], a))],
  };
}

/** Cut the segment under `t` in two. No-op when the cut would leave a sliver. */
export function splitAt(edit: Edit, t: number, newId: string): Edit {
  const loc = locate(edit, t);
  if (!loc) return edit;
  const { segment, index, sourceTime } = loc;
  const min = MIN_SEGMENT * segment.speed;
  if (sourceTime - segment.in < min || segment.out - sourceTime < min) return edit;
  const main = [...edit.main];
  main.splice(index, 1, { ...segment, out: sourceTime }, { ...segment, id: newId, in: sourceTime });
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
  // When only the in point moves it stops short of the out point, rather than pushing it.
  const inMax = (to.out === undefined ? s.out : asset.duration) - min;
  const nextIn = Math.min(Math.max(to.in ?? s.in, 0), inMax);
  const nextOut = Math.min(Math.max(to.out ?? s.out, nextIn + min), asset.duration);
  return patchSegment(edit, id, { in: nextIn, out: nextOut });
}

export function removeSegment(edit: Edit, id: string): Edit {
  return { ...edit, main: edit.main.filter((s) => s.id !== id) };
}

export function duplicateSegment(edit: Edit, id: string, newId: string): Edit {
  const i = edit.main.findIndex((s) => s.id === id);
  if (i < 0) return edit;
  const main = [...edit.main];
  main.splice(i + 1, 0, { ...main[i], id: newId });
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

export function addText(edit: Edit, id: string, at: number): Edit {
  const text: TextItem = { id, text: 'Text', start: at, duration: 3, x: 0.5, y: 0.5, size: 28, color: '#FFFFFF' };
  return { ...edit, texts: [...edit.texts, text] };
}

export function patchText(edit: Edit, id: string, patch: Partial<Omit<TextItem, 'id'>>): Edit {
  return { ...edit, texts: edit.texts.map((t) => (t.id === id ? { ...t, ...patch } : t)) };
}

export function removeText(edit: Edit, id: string): Edit {
  return { ...edit, texts: edit.texts.filter((t) => t.id !== id) };
}
