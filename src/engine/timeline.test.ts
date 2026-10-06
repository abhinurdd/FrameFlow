import { resolveTransform, setKeyframe, transformAt, transitionAt, IDENTITY, NO_ANIMATION } from './animate';
import { compileLook, gradePixel, NO_ADJUST, NO_LOOK } from './looks';
import {
  appendAssets,
  blankEdit,
  captionsFromWords,
  cutRanges,
  duplicateSegment,
  locate,
  mainFrameAt,
  moveSegment,
  newAudio,
  newText,
  addItem,
  parseSrt,
  rampSegment,
  patchSegment,
  removeSegment,
  segmentStarts,
  setTransition,
  splitAt,
  splitItem,
  totalDuration,
  trimItem,
  trimSegment,
  type Asset,
} from './timeline';

const a: Asset = { id: 'a', uri: 'a.mp4', kind: 'video', duration: 10, width: 1920, height: 1080 };
const b: Asset = { id: 'b', uri: 'b.mp4', kind: 'video', duration: 4, width: 1080, height: 1920 };
const music: Asset = { id: 'm', uri: 'm.mp3', kind: 'audio', duration: 30, width: 0, height: 0 };
const empty = blankEdit('e', 'Test', 0);
const edit = appendAssets(empty, [a, b], ['s1', 's2']);

test('duration and locate across segments', () => {
  expect(totalDuration(edit)).toBe(14);
  expect(locate(edit, 3)).toMatchObject({ index: 0, sourceTime: 3 });
  expect(locate(edit, 11)).toMatchObject({ index: 1, start: 10, sourceTime: 1 });
  expect(locate(edit, 99)).toMatchObject({ index: 1, sourceTime: 4 });
  expect(locate(empty, 0)).toBeNull();
});

test('speed changes timeline length and source mapping', () => {
  const fast = patchSegment(edit, 's1', { speed: 2 });
  expect(totalDuration(fast)).toBe(9);
  expect(locate(fast, 2)).toMatchObject({ index: 0, sourceTime: 4 });
  expect(locate(fast, 6)).toMatchObject({ index: 1, sourceTime: 1 });
});

test('split keeps total duration and refuses slivers', () => {
  const cut = splitAt(edit, 3, 's3');
  expect(cut.main.map((s) => [s.id, s.in, s.out])).toEqual([['s1', 0, 3], ['s3', 3, 10], ['s2', 0, 4]]);
  expect(totalDuration(cut)).toBe(14);
  expect(splitAt(edit, 0.05, 'x')).toBe(edit);
});

test('trim clamps to the source and a minimum length', () => {
  expect(trimSegment(edit, 's1', { in: -5, out: 99 }).main[0]).toMatchObject({ in: 0, out: 10 });
  expect(trimSegment(edit, 's1', { in: 9.99 }).main[0].in).toBeCloseTo(9.9);
  expect(trimSegment(edit, 's1', { out: 0 }).main[0].out).toBeCloseTo(0.1);
});

test('remove, duplicate, move', () => {
  expect(removeSegment(edit, 's1').main.map((s) => s.id)).toEqual(['s2']);
  expect(duplicateSegment(edit, 's1', 's9').main.map((s) => s.id)).toEqual(['s1', 's9', 's2']);
  expect(moveSegment(edit, 's1', 1).main.map((s) => s.id)).toEqual(['s2', 's1']);
  expect(moveSegment(edit, 's1', -1)).toBe(edit);
});

test('a transition overlaps the two clips and shortens the edit', () => {
  const t = setTransition(edit, 's1', { type: 'fade', duration: 1 });
  expect(segmentStarts(t)).toEqual([0, 9]);
  expect(totalDuration(t)).toBe(13);
  expect(mainFrameAt(t, 5)).toMatchObject({ a: { index: 0 }, b: null });
  const mid = mainFrameAt(t, 9.5)!;
  expect(mid.a).toMatchObject({ index: 0, sourceTime: 9.5 });
  expect(mid.b).toMatchObject({ index: 1, sourceTime: 0.5 });
  expect(mid.progress).toBeCloseTo(0.5);
  expect(mainFrameAt(t, 10.5)).toMatchObject({ a: { index: 1 }, b: null });
  // Capped at half of the shorter neighbour.
  expect(segmentStarts(setTransition(edit, 's1', { type: 'fade', duration: 9 }))).toEqual([0, 8]);
});

test('cutRanges removes time and closes the gap', () => {
  let n = 0;
  const cut = cutRanges(edit, [{ start: 2, end: 3 }, { start: 11, end: 12 }], () => `c${n++}`);
  expect(totalDuration(cut)).toBeCloseTo(12);
  expect(cut.main.map((s) => [s.in, s.out])).toEqual([[0, 2], [3, 10], [0, 1], [2, 4]]);
});

test('free tracks: split and trim', () => {
  const withText = addItem(edit, 'texts', newText('t1', 2));
  const cut = splitItem(withText, 'texts', 't1', 3, 't2');
  expect(cut.texts.map((t) => [t.start, t.duration])).toEqual([[2, 1], [3, 2]]);
  const withAudio = addItem(edit, 'audio', newAudio('m1', 1, music, 'music'));
  const trimmed = trimItem(withAudio, 'audio', 'm1', 'start', 2);
  expect(trimmed.audio[0]).toMatchObject({ start: 3, in: 2, out: 30 });
  expect(trimItem(withAudio, 'audio', 'm1', 'end', 99).audio[0].out).toBe(30);
});

test('captions from words and from SRT', () => {
  let n = 0;
  const words = [0, 1, 2, 3, 4].map((i) => ({ t0: i, t1: i + 0.8, text: `w${i}` }));
  const caps = captionsFromWords(words, 2, () => `c${n++}`);
  expect(caps.map((c) => [c.start, c.text])).toEqual([[0, 'w0 w1'], [2, 'w2 w3'], [4, 'w4']]);
  expect(caps[1].words![1]).toMatchObject({ t0: 1, text: 'w3' });
  const srt = parseSrt('1\n00:00:01,000 --> 00:00:02,500\nनमस्ते <b>dosto</b>\n\n2\n00:01:00,000 --> 00:01:01,000\nHello\nworld\n', () => 'x');
  expect(srt.map((c) => [c.start, c.duration, c.text])).toEqual([[1, 1.5, 'नमस्ते dosto'], [60, 1, 'Hello world']]);
});

test('keyframes interpolate and animations ease in', () => {
  const item = { transform: IDENTITY, keyframes: setKeyframe(setKeyframe([], 0, IDENTITY, 'linear'), 2, { ...IDENTITY, x: 1, scale: 3 }, 'linear'), animation: NO_ANIMATION };
  expect(transformAt(item, 1)).toMatchObject({ x: 0.5, scale: 2 });
  expect(transformAt(item, 5).x).toBe(1);
  const fading = { transform: IDENTITY, keyframes: [], animation: { ...NO_ANIMATION, in: 'fade' as const, out: 'fade' as const } };
  expect(resolveTransform(fading, 0.25, 4).opacity).toBeCloseTo(0.5);
  expect(resolveTransform(fading, 2, 4).opacity).toBe(1);
  expect(resolveTransform(fading, 3.9, 4).opacity).toBeCloseTo(0.2);
  expect(transitionAt('slide-left', 0).b.x).toBe(1);
  expect(transitionAt('slide-left', 1).a.x).toBe(-1);
});

test('looks grade pixels', () => {
  expect(gradePixel([0.2, 0.5, 0.8], compileLook(NO_LOOK))).toEqual([0.2, 0.5, 0.8]);
  const mono = gradePixel([1, 0, 0], compileLook({ filter: 'none', strength: 1, adjust: { ...NO_ADJUST, saturation: -1 } }));
  expect(mono[0]).toBeCloseTo(mono[1]);
  expect(mono[1]).toBeCloseTo(mono[2]);
  const bright = gradePixel([0.5, 0.5, 0.5], compileLook({ filter: 'none', strength: 1, adjust: { ...NO_ADJUST, brightness: 1 } }));
  expect(bright[0]).toBeGreaterThan(0.6);
  const contrast = compileLook({ filter: 'none', strength: 1, adjust: { ...NO_ADJUST, contrast: 1 } });
  expect(gradePixel([0.2, 0.2, 0.2], contrast)[0]).toBeLessThan(0.2);
  expect(gradePixel([0.8, 0.8, 0.8], contrast)[0]).toBeGreaterThan(0.8);
});

test('speed ramp splits the source evenly', () => {
  let n = 0;
  const ramped = rampSegment(edit, 's1', [2, 0.5], () => `r${n++}`);
  expect(ramped.main.map((s) => [s.id, s.in, s.out, s.speed])).toEqual([['s1', 0, 5, 2], ['r0', 5, 10, 0.5], ['s2', 0, 4, 1]]);
  expect(totalDuration(ramped)).toBe(2.5 + 10 + 4);
});
