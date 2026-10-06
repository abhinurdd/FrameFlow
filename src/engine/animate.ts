/**
 * Everything that moves: keyframes, in/out animations, transitions, canvas effects
 * and audio fades. Pure functions of time, shared by the preview and by export, so a
 * frame looks the same in both.
 *
 * Positions are fractions of the canvas (x: 1 = one canvas width to the right).
 */

export type Ease = 'linear' | 'in' | 'out' | 'in-out';
export type Transform = { x: number; y: number; scale: number; rotation: number; opacity: number };
export type Keyframe = Transform & { t: number; ease: Ease };

export const IDENTITY: Transform = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };

export function ease(kind: Ease, p: number) {
  const x = Math.min(1, Math.max(0, p));
  if (kind === 'in') return x * x * x;
  if (kind === 'out') return 1 - (1 - x) ** 3;
  if (kind === 'in-out') return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
  return x;
}

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

/** The item's transform at `t` seconds into it. Keyframes, when present, replace the static transform. */
export function transformAt(item: { transform: Transform; keyframes: Keyframe[] }, t: number): Transform {
  const ks = item.keyframes;
  if (!ks.length) return item.transform;
  if (t <= ks[0].t) return ks[0];
  const last = ks[ks.length - 1];
  if (t >= last.t) return last;
  const i = ks.findIndex((k) => k.t > t) - 1;
  const a = ks[i];
  const b = ks[i + 1];
  const p = ease(a.ease, (t - a.t) / (b.t - a.t));
  return { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), scale: lerp(a.scale, b.scale, p), rotation: lerp(a.rotation, b.rotation, p), opacity: lerp(a.opacity, b.opacity, p) };
}

/** Insert or replace the keyframe at `t` (within a frame), keeping them sorted. */
export function setKeyframe(keyframes: Keyframe[], t: number, value: Transform, easing: Ease = 'in-out'): Keyframe[] {
  const rest = keyframes.filter((k) => Math.abs(k.t - t) > 0.04);
  return [...rest, { ...value, t, ease: easing }].sort((a, b) => a.t - b.t);
}

export function keyframeNear(keyframes: Keyframe[], t: number) {
  return keyframes.find((k) => Math.abs(k.t - t) <= 0.04);
}

// ---- In / out animations ----

export const ANIMATIONS = [
  { id: 'none', name: 'None' },
  { id: 'fade', name: 'Fade' },
  { id: 'slide-left', name: 'Slide left' },
  { id: 'slide-right', name: 'Slide right' },
  { id: 'slide-up', name: 'Slide up' },
  { id: 'slide-down', name: 'Slide down' },
  { id: 'zoom-in', name: 'Zoom in' },
  { id: 'zoom-out', name: 'Zoom out' },
  { id: 'spin', name: 'Spin' },
  { id: 'pop', name: 'Pop' },
] as const;
export type AnimationId = (typeof ANIMATIONS)[number]['id'];
export type Animation = { in: AnimationId; out: AnimationId; inDuration: number; outDuration: number };
export const NO_ANIMATION: Animation = { in: 'none', out: 'none', inDuration: 0.5, outDuration: 0.5 };

/** `p` runs 0 (fully hidden) to 1 (at rest). The same curve is used for in and, mirrored, for out. */
function animate(id: AnimationId, base: Transform, p: number): Transform {
  if (id === 'none' || p >= 1) return base;
  const e = ease('out', p);
  const fade = { ...base, opacity: base.opacity * Math.min(1, p * 2) };
  switch (id) {
    case 'fade': return { ...base, opacity: base.opacity * p };
    case 'slide-left': return { ...fade, x: base.x + (1 - e) * 0.6 };
    case 'slide-right': return { ...fade, x: base.x - (1 - e) * 0.6 };
    case 'slide-up': return { ...fade, y: base.y + (1 - e) * 0.6 };
    case 'slide-down': return { ...fade, y: base.y - (1 - e) * 0.6 };
    case 'zoom-in': return { ...base, scale: base.scale * (0.5 + 0.5 * e), opacity: base.opacity * p };
    case 'zoom-out': return { ...base, scale: base.scale * (1.5 - 0.5 * e), opacity: base.opacity * p };
    case 'spin': return { ...base, rotation: base.rotation - (1 - e) * 180, scale: base.scale * e, opacity: base.opacity * p };
    case 'pop': {
      // Overshoots to 110% at p = 0.7, then settles.
      const s = p < 0.7 ? (p / 0.7) * 1.1 : 1.1 - ((p - 0.7) / 0.3) * 0.1;
      return { ...base, scale: base.scale * s, opacity: base.opacity * Math.min(1, p * 3) };
    }
  }
}

/** Final transform for an item `t` seconds into a life of `duration` seconds. */
export function resolveTransform(item: { transform: Transform; keyframes: Keyframe[]; animation: Animation }, t: number, duration: number): Transform {
  const a = item.animation;
  let out = transformAt(item, t);
  if (a.in !== 'none' && t < a.inDuration) out = animate(a.in, out, t / a.inDuration);
  if (a.out !== 'none' && duration - t < a.outDuration) out = animate(a.out, out, (duration - t) / a.outDuration);
  return out;
}

// ---- Transitions between two clips on the main track ----

export const TRANSITIONS = [
  { id: 'fade', name: 'Dissolve' },
  { id: 'fade-black', name: 'Dip to black' },
  { id: 'fade-white', name: 'Dip to white' },
  { id: 'slide-left', name: 'Push left' },
  { id: 'slide-right', name: 'Push right' },
  { id: 'slide-up', name: 'Push up' },
  { id: 'slide-down', name: 'Push down' },
  { id: 'wipe-left', name: 'Wipe left' },
  { id: 'wipe-right', name: 'Wipe right' },
  { id: 'zoom-in', name: 'Zoom' },
] as const;
export type TransitionId = (typeof TRANSITIONS)[number]['id'];
export type Transition = { type: TransitionId; duration: number };

/** How one clip is drawn mid-transition. `clip` hides that fraction of the frame from each side. */
export type Layer = { opacity: number; x: number; y: number; scale: number; clipLeft: number; clipRight: number };
export type TransitionFrame = { a: Layer; b: Layer; wash: { color: string; opacity: number } | null };

const SHOWN: Layer = { opacity: 1, x: 0, y: 0, scale: 1, clipLeft: 0, clipRight: 0 };

/** `p` runs 0 (only the outgoing clip A) to 1 (only the incoming clip B). B is drawn above A. */
export function transitionAt(type: TransitionId, p: number): TransitionFrame {
  const e = ease('in-out', p);
  switch (type) {
    case 'fade': return { a: SHOWN, b: { ...SHOWN, opacity: p }, wash: null };
    case 'fade-black':
    case 'fade-white':
      return {
        a: SHOWN,
        b: { ...SHOWN, opacity: p < 0.5 ? 0 : 1 },
        wash: { color: type === 'fade-black' ? '#000000' : '#FFFFFF', opacity: 1 - Math.abs(p - 0.5) * 2 },
      };
    case 'slide-left': return { a: { ...SHOWN, x: -e }, b: { ...SHOWN, x: 1 - e }, wash: null };
    case 'slide-right': return { a: { ...SHOWN, x: e }, b: { ...SHOWN, x: e - 1 }, wash: null };
    case 'slide-up': return { a: { ...SHOWN, y: -e }, b: { ...SHOWN, y: 1 - e }, wash: null };
    case 'slide-down': return { a: { ...SHOWN, y: e }, b: { ...SHOWN, y: e - 1 }, wash: null };
    case 'wipe-left': return { a: SHOWN, b: { ...SHOWN, clipLeft: 1 - p }, wash: null };
    case 'wipe-right': return { a: SHOWN, b: { ...SHOWN, clipRight: 1 - p }, wash: null };
    case 'zoom-in': return { a: { ...SHOWN, scale: 1 + e * 0.6 }, b: { ...SHOWN, opacity: p, scale: 0.7 + e * 0.3 }, wash: null };
  }
}

// ---- Canvas effects ----

export const EFFECTS = [
  { id: 'shake', name: 'Shake' },
  { id: 'pulse', name: 'Pulse' },
  { id: 'zoom', name: 'Slow zoom' },
  { id: 'flash', name: 'Flash' },
  { id: 'strobe', name: 'Strobe' },
  { id: 'blur', name: 'Blur' },
  { id: 'dim', name: 'Dim' },
  { id: 'letterbox', name: 'Letterbox' },
] as const;
export type EffectId = (typeof EFFECTS)[number]['id'];

/** What an effect does to the whole canvas at `t` seconds into its `duration`. */
export type EffectFrame = { x: number; y: number; scale: number; flash: number; dim: number; blur: number; bars: number };
export const NO_EFFECT: EffectFrame = { x: 0, y: 0, scale: 1, flash: 0, dim: 0, blur: 0, bars: 0 };

export function effectAt(id: EffectId, t: number, duration: number): EffectFrame {
  // Eases the effect in and out over its first and last 0.2 s.
  const edge = Math.min(1, t / 0.2, (duration - t) / 0.2);
  switch (id) {
    case 'shake': return { ...NO_EFFECT, x: Math.sin(t * 61) * 0.012 * edge, y: Math.cos(t * 47) * 0.012 * edge, scale: 1 + 0.03 * edge };
    case 'pulse': return { ...NO_EFFECT, scale: 1 + 0.06 * edge * (1 - ((t * 2) % 1)) ** 2 };
    case 'zoom': return { ...NO_EFFECT, scale: 1 + 0.2 * (t / Math.max(duration, 0.001)) };
    case 'flash': return { ...NO_EFFECT, flash: Math.max(0, 1 - t / 0.35) };
    case 'strobe': return { ...NO_EFFECT, flash: (t * 8) % 1 < 0.25 ? 0.7 * edge : 0 };
    case 'blur': return { ...NO_EFFECT, blur: edge };
    case 'dim': return { ...NO_EFFECT, dim: 0.5 * edge };
    case 'letterbox': return { ...NO_EFFECT, bars: 0.12 * edge };
  }
}

export function combineEffects(frames: EffectFrame[]): EffectFrame {
  return frames.reduce(
    (acc, f) => ({ x: acc.x + f.x, y: acc.y + f.y, scale: acc.scale * f.scale, flash: Math.max(acc.flash, f.flash), dim: Math.max(acc.dim, f.dim), blur: Math.max(acc.blur, f.blur), bars: Math.max(acc.bars, f.bars) }),
    NO_EFFECT,
  );
}

// ---- Audio ----

/** Volume multiplier from fades, `t` seconds into a clip lasting `duration`. */
export function fadeGain(fadeIn: number, fadeOut: number, t: number, duration: number) {
  let g = 1;
  if (fadeIn > 0 && t < fadeIn) g = Math.min(g, Math.max(0, t / fadeIn));
  if (fadeOut > 0 && duration - t < fadeOut) g = Math.min(g, Math.max(0, (duration - t) / fadeOut));
  return g;
}
