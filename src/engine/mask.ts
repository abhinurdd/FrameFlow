/**
 * Mask shapes for overlays. The outline is one SVG path, so the preview (Skia) and
 * the export renderer (canvas Path2D) cut exactly the same shape.
 */

export type Mask = 'none' | 'circle' | 'rounded' | 'diamond' | 'triangle' | 'hexagon' | 'star' | 'heart';

export const MASKS: { id: Mask; name: string }[] = [
  { id: 'none', name: 'None' },
  { id: 'circle', name: 'Circle' },
  { id: 'rounded', name: 'Rounded' },
  { id: 'diamond', name: 'Diamond' },
  { id: 'triangle', name: 'Triangle' },
  { id: 'hexagon', name: 'Hexagon' },
  { id: 'star', name: 'Star' },
  { id: 'heart', name: 'Heart' },
];

/** These shapes sit in a square box, showing a centred crop of the picture. */
export function squareMask(mask: Mask) {
  return mask !== 'none' && mask !== 'rounded';
}

/** Points on a circle of radius `r` around the middle of a unit box, starting at the top. */
function ring(count: number, r: (i: number) => number, cy = 0.5) {
  return Array.from({ length: count }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    return [0.5 + r(i) * Math.cos(a), cy + r(i) * Math.sin(a)];
  });
}

const POLYGONS: Partial<Record<Mask, number[][]>> = {
  diamond: [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]],
  triangle: [[0.5, 0.05], [1, 0.95], [0, 0.95]],
  hexagon: ring(6, () => 0.5),
  star: ring(10, (i) => (i % 2 ? 0.21 : 0.52), 0.53),
};

// Unit-box curve: start point, then cubic segments of (control, control, end).
const HEART = [0.5, 0.94, 0.5, 0.94, 0.02, 0.64, 0.02, 0.32, 0.02, 0.14, 0.16, 0.05, 0.29, 0.05, 0.39, 0.05, 0.47, 0.1, 0.5, 0.19, 0.53, 0.1, 0.61, 0.05, 0.71, 0.05, 0.84, 0.05, 0.98, 0.14, 0.98, 0.32, 0.98, 0.64, 0.5, 0.94, 0.5, 0.94];

const n = (v: number) => String(Math.round(v * 100) / 100);

/** The mask's outline in a box of `w` by `h`, as an SVG path. Null when nothing is cut. */
export function maskPath(mask: Mask, w: number, h: number): string | null {
  if (mask === 'none') return null;
  if (mask === 'circle') {
    const r = Math.min(w, h) / 2;
    const cx = w / 2;
    const cy = h / 2;
    return `M${n(cx - r)} ${n(cy)}A${n(r)} ${n(r)} 0 1 0 ${n(cx + r)} ${n(cy)}A${n(r)} ${n(r)} 0 1 0 ${n(cx - r)} ${n(cy)}Z`;
  }
  if (mask === 'rounded') {
    const r = 0.12 * w;
    return `M${n(r)} 0H${n(w - r)}A${n(r)} ${n(r)} 0 0 1 ${n(w)} ${n(r)}V${n(h - r)}A${n(r)} ${n(r)} 0 0 1 ${n(w - r)} ${n(h)}H${n(r)}A${n(r)} ${n(r)} 0 0 1 0 ${n(h - r)}V${n(r)}A${n(r)} ${n(r)} 0 0 1 ${n(r)} 0Z`;
  }
  if (mask === 'heart') {
    const p = HEART.map((v, i) => n(v * (i % 2 ? h : w)));
    let d = `M${p[0]} ${p[1]}`;
    for (let i = 2; i < p.length; i += 6) d += `C${p.slice(i, i + 6).join(' ')}`;
    return d + 'Z';
  }
  const points = POLYGONS[mask];
  if (!points) return null;
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${n(x * w)} ${n(y * h)}`).join('') + 'Z';
}
