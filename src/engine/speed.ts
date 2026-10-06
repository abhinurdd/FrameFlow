/**
 * Speed curves. A clip's speed can vary along its length: `curve` holds speed
 * multipliers at evenly spaced points across the clip's source, joined by straight
 * lines, on top of the clip's base `speed`. No curve means constant speed.
 *
 * The preview follows the curve by changing the player's rate as it goes; export
 * writes the same mapping as a timestamp expression. Both use these functions.
 */

export type Curved = { in: number; out: number; speed: number; curve?: number[] | null };

export const CURVE_MIN = 0.2;
export const CURVE_MAX = 5;
export const CURVE_POINTS = 5;

export const SPEED_CURVES: { id: string; name: string; curve: number[] }[] = [
  { id: 'montage', name: 'Montage', curve: [1, 3, 0.5, 3, 1] },
  { id: 'hero', name: 'Hero', curve: [2.5, 1, 0.4, 1, 2.5] },
  { id: 'bullet', name: 'Bullet', curve: [4, 1.5, 0.3, 1.5, 4] },
  { id: 'flash-in', name: 'Flash in', curve: [4, 2, 1, 1, 1] },
  { id: 'flash-out', name: 'Flash out', curve: [1, 1, 1, 2, 4] },
  { id: 'jump', name: 'Jump cut', curve: [1, 4, 1, 4, 1] },
];

const points = (s: Curved) => (s.curve && s.curve.length >= 2 ? s.curve : null);

/** Seconds of playback for one stretch where the multiplier runs straight from c0 to c1 over `w` source seconds at base speed 1. */
function stretch(w: number, c0: number, c1: number) {
  return Math.abs(c1 - c0) < 1e-9 ? w / c0 : (w * Math.log(c1 / c0)) / (c1 - c0);
}

/** Multiplier at fraction `u` (0..1) of the clip. */
export function curveAt(curve: number[], u: number) {
  const x = Math.min(1, Math.max(0, u)) * (curve.length - 1);
  const i = Math.min(curve.length - 2, Math.floor(x));
  return curve[i] + (curve[i + 1] - curve[i]) * (x - i);
}

/** Playback seconds from the clip's in point to `sourceTime`. */
export function offsetAt(s: Curved, sourceTime: number) {
  const length = s.out - s.in;
  const curve = points(s);
  const src = Math.min(Math.max(sourceTime, s.in), s.out);
  if (!curve || length <= 0) return (src - s.in) / s.speed;
  const w = length / (curve.length - 1);
  let t = 0;
  for (let i = 0; i < curve.length - 1; i++) {
    const from = s.in + i * w;
    if (src <= from) break;
    const part = Math.min(w, src - from);
    t += stretch(part, curve[i], curve[i] + ((curve[i + 1] - curve[i]) * part) / w);
  }
  return t / s.speed;
}

/** How long the clip plays for. */
export function playDuration(s: Curved) {
  return offsetAt(s, s.out);
}

/** The source time showing `offset` playback seconds into the clip. */
export function sourceAt(s: Curved, offset: number) {
  const length = s.out - s.in;
  const curve = points(s);
  if (!curve || length <= 0) return Math.min(s.out, s.in + Math.max(0, offset) * s.speed);
  const w = length / (curve.length - 1);
  let left = Math.max(0, offset) * s.speed;
  for (let i = 0; i < curve.length - 1; i++) {
    const c0 = curve[i];
    const c1 = curve[i + 1];
    const whole = stretch(w, c0, c1);
    if (left >= whole) {
      left -= whole;
      continue;
    }
    // Invert `stretch` for the distance covered in `left` seconds.
    const x = Math.abs(c1 - c0) < 1e-9 ? left * c0 : (c0 * (Math.exp((left * (c1 - c0)) / w) - 1) * w) / (c1 - c0);
    return s.in + i * w + x;
  }
  return s.out;
}

/** Speed (base times curve) while showing `sourceTime`. */
export function speedAt(s: Curved, sourceTime: number) {
  const curve = points(s);
  const length = s.out - s.in;
  return curve && length > 0 ? s.speed * curveAt(curve, (sourceTime - s.in) / length) : s.speed;
}

/** Points kept when a curve is cut: enough that a cut-out stretch keeps its shape. */
const SLICE_POINTS = 17;

/** The part of a curve between fractions `u0` and `u1`, as a curve of its own. */
export function sliceCurve(curve: number[] | null | undefined, u0: number, u1: number) {
  if (!curve || curve.length < 2) return curve ?? null;
  return Array.from({ length: SLICE_POINTS }, (_, i) => curveAt(curve, u0 + ((u1 - u0) * i) / (SLICE_POINTS - 1)));
}

/**
 * The curve as an ffmpeg expression for `setpts`: output seconds for an input time
 * `T` measured from `from` (where the decoder was started).
 */
export function ptsExpression(s: Curved, from: number) {
  const curve = points(s);
  const n = (v: number) => Number(v.toFixed(6)).toString();
  const base = offsetAt(s, from);
  if (!curve) return `T/${n(s.speed)}`;
  const w = (s.out - s.in) / (curve.length - 1);
  const src = `(T+${n(from)})`;
  let expr = n(playDuration(s) - base);
  for (let i = curve.length - 2; i >= 0; i--) {
    const a = s.in + i * w;
    const c0 = curve[i];
    const c1 = curve[i + 1];
    const before = offsetAt(s, a) - base;
    const piece =
      Math.abs(c1 - c0) < 1e-9
        ? `${n(before)}+(${src}-${n(a)})/${n(s.speed * c0)}`
        : `${n(before)}+${n(w / (s.speed * (c1 - c0)))}*log(1+${n((c1 - c0) / (c0 * w))}*max(0,${src}-${n(a)}))`;
    expr = `if(lt(${src},${n(a + w)}),${piece},${expr})`;
  }
  return expr;
}
