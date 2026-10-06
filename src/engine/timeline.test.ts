import {
  appendAssets,
  duplicateSegment,
  locate,
  moveSegment,
  patchSegment,
  removeSegment,
  splitAt,
  totalDuration,
  trimSegment,
  type Asset,
  type Edit,
} from './timeline';

const a: Asset = { id: 'a', uri: 'a.mp4', duration: 10, width: 1920, height: 1080 };
const b: Asset = { id: 'b', uri: 'b.mp4', duration: 4, width: 1080, height: 1920 };
const empty: Edit = { id: 'e', name: 'Test', aspect: 'original', assets: {}, main: [], texts: [], createdAt: 0, updatedAt: 0 };
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
  expect(splitAt(edit, 10.02, 'x')).toBe(edit);
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
