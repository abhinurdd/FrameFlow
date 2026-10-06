import { resolveTransform, setKeyframe, transformAt, transitionAt, IDENTITY, NO_ANIMATION } from './animate';
import { compileLook, gradePixel, NO_ADJUST, NO_LOOK } from './looks';
import {
  appendAssets,
  blankEdit,
  captionsFromWords,
  cutCaptionWords,
  cutRanges,
  deleteSegment,
  duplicateItem,
  duplicateSegment,
  locate,
  mainFrameAt,
  moveSegment,
  newAudio,
  newText,
  addItem,
  parseSrt,
  rampSegment,
  rippleCut,
  relink,
  patchSegment,
  removeSegment,
  segmentStarts,
  setTransition,
  splitAt,
  splitItem,
  swapCaptionScript,
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
  // A pause breaks the line even when it is not full.
  const paused = captionsFromWords([{ t0: 0, t1: 0.5, text: 'a' }, { t0: 3, t1: 3.5, text: 'b' }], 4, () => 'p');
  expect(paused.map((c) => [c.start, c.duration, c.text])).toEqual([[0, 0.5, 'a'], [3, 0.5, 'b']]);
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

test('relink keeps items over the same moment of the same clip', () => {
  const caption = { id: 'c1', start: 4, duration: 2, text: 'hi there', words: [{ t0: 0, t1: 1, text: 'hi' }, { t0: 1, t1: 2, text: 'there' }] };
  const base = addItem(addItem(addItem(edit, 'texts', newText('t1', 11)), 'captions', caption), 'audio', newAudio('m1', 4, music, 'music'));
  // Speeding up the first clip pulls everything left and squeezes the caption.
  const fast = relink(base, patchSegment(base, 's1', { speed: 2 }));
  expect(fast.captions[0]).toMatchObject({ start: 2, duration: 1 });
  expect(fast.captions[0].words![1]).toMatchObject({ t0: 0.5, t1: 1 });
  expect(fast.texts[0].start).toBe(6);
  expect(fast.audio[0].start).toBe(4);
  // Reordering: the text follows the second clip to the front.
  const swapped = relink(base, moveSegment(base, 's1', 1));
  expect(swapped.texts[0].start).toBe(1);
  expect(swapped.captions[0].start).toBe(8);
  // Trimming the head off pins a caption that lost its moment to the clip edge.
  expect(relink(base, trimSegment(base, 's1', { in: 6 })).captions[0].start).toBe(0);
});

test('transcript editing cuts the word and the video together', () => {
  let n = 0;
  const caption = { id: 'c1', start: 2, duration: 3, text: 'toh paisa kamao', words: [{ t0: 0, t1: 1, text: 'toh', alt: 'तो' }, { t0: 1, t1: 2, text: 'paisa', alt: 'पैसा' }, { t0: 2, t1: 3, text: 'kamao' }] };
  const base = addItem(edit, 'captions', caption);
  const cut = cutCaptionWords(base, (w) => w.text === 'toh', () => `k${n++}`);
  expect(totalDuration(cut)).toBe(13);
  expect(cut.captions[0]).toMatchObject({ start: 2, text: 'paisa kamao' });
  expect(cut.main.map((s) => [s.in, s.out])).toEqual([[0, 2], [3, 10], [0, 4]]);
  expect(cutCaptionWords(base, () => false, () => 'x')).toBe(base);
  const swapped = swapCaptionScript(base);
  expect(swapped.captions[0].text).toBe('तो पैसा kamao');
  expect(swapCaptionScript(swapped).captions[0].text).toBe('toh paisa kamao');
});

test('cuts never shift items without removing video', () => {
  let n = 0;
  const id = () => `x${n++}`;
  const base = addItem(edit, 'texts', newText('t1', 12));
  // A cut 0.1 s short of the clip end is widened to the edge, and the shift matches what was removed.
  const tail = rippleCut(base, [{ start: 8.1, end: 9.95 }], id);
  expect(totalDuration(tail)).toBeCloseTo(12.1);
  expect(tail.texts[0].start).toBeCloseTo(10.1);
  // Overlapping ranges are counted once.
  const merged = rippleCut(base, [{ start: 0.5, end: 1.5 }, { start: 1, end: 2 }], id);
  expect(totalDuration(merged)).toBeCloseTo(12.5);
  expect(merged.texts[0].start).toBeCloseTo(10.5);
  // Across a transition the video still gets shorter by exactly what the items move.
  const faded = setTransition(base, 's1', { type: 'fade', duration: 1 });
  const across = rippleCut(faded, [{ start: 8.2, end: 9.6 }], id);
  expect(totalDuration(faded) - totalDuration(across)).toBeCloseTo(12 - across.texts[0].start);
});

test('cutting a word retimes the words after it', () => {
  const caption = { id: 'c1', start: 1, duration: 2, text: 'yeh matlab sahi hai', words: [{ t0: 0, t1: 0.5, text: 'yeh' }, { t0: 0.5, t1: 1, text: 'matlab' }, { t0: 1, t1: 1.5, text: 'sahi' }, { t0: 1.5, t1: 2, text: 'hai' }] };
  const cut = cutCaptionWords(addItem(edit, 'captions', caption), (w) => w.text === 'matlab', () => 'k');
  expect(cut.captions[0]).toMatchObject({ start: 1, duration: 1.5, text: 'yeh sahi hai' });
  expect(cut.captions[0].words!.map((w) => [w.t0, w.t1])).toEqual([[0, 0.5], [0.5, 1], [1, 1.5]]);
});

test('deleting a clip takes its items and shifts the rest by the real gap', () => {
  const faded = setTransition(appendAssets(edit, [{ ...a, id: 'c', duration: 5 }], ['s3']), 's2', { type: 'fade', duration: 1 });
  // s1 0-10, s2 10-14, s3 13-18. A text 2 s into s3, one over s2.
  const base = addItem(addItem(faded, 'texts', newText('late', 15)), 'texts', newText('gone', 11));
  const out = deleteSegment(base, 's2');
  expect(out.texts.map((t) => [t.id, t.start])).toEqual([['late', 12]]);
  expect(totalDuration(out)).toBe(15);
});

test('items on a duplicated clip stay on the duplicate', () => {
  const dup = addItem(duplicateSegment(edit, 's1', 'd'), 'texts', newText('t', 16));
  expect(relink(dup, trimSegment(dup, 'd', { in: 3 })).texts[0].start).toBe(13);
  let n = 0;
  expect(relink(dup, rampSegment(dup, 'd', [2, 0.5], () => `r${n++}`)).texts[0].start).toBe(12.5 + 2);
});

test('split carries keyframed motion across the cut; copies stay reachable', () => {
  const zoom = patchSegment(edit, 's1', { keyframes: setKeyframe(setKeyframe([], 0, IDENTITY, 'linear'), 10, { ...IDENTITY, scale: 2 }, 'linear'), animation: { ...NO_ANIMATION, in: 'fade', out: 'fade' } });
  const [left, right] = splitAt(zoom, 5, 'r').main;
  expect(transformAt(left, 5).scale).toBeCloseTo(1.5);
  expect(transformAt(right, 0).scale).toBeCloseTo(1.5);
  expect(transformAt(right, 5).scale).toBeCloseTo(2);
  expect([left.animation.out, right.animation.in]).toEqual(['none', 'none']);
  const late = addItem(edit, 'texts', { ...newText('t', 12), duration: 2 });
  expect(duplicateItem(late, 'texts', 't', 'u').texts[1].start).toBeLessThan(14);
});
