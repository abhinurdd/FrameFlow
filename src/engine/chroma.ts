/**
 * Chroma key (green screen). The same maths runs in the preview's shader and in
 * the export renderer, so keep `CHROMA_SHADER` and `chromaPixel` in step.
 *
 * A pixel is compared with the key colour by chroma only (its colour, not its
 * brightness), so shadows on the screen still key out.
 */

export type Chroma = {
  /** Key colour, #RRGGBB. */
  color: string;
  /** How far from the key colour still counts as background, 0..1. */
  similarity: number;
  /** Width of the soft edge, 0..1. */
  smoothness: number;
  /** How strongly the key colour's tint is removed from what remains, 0..1. */
  spill: number;
};

export const DEFAULT_CHROMA: Chroma = { color: '#00D000', similarity: 0.35, smoothness: 0.1, spill: 0.5 };
export const KEY_COLORS = ['#00D000', '#0047FF', '#FF2E7E', '#FFFFFF', '#000000'];

export function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
}

const cb = (r: number, g: number, b: number) => -0.169 * r - 0.331 * g + 0.5 * b;
const cr = (r: number, g: number, b: number) => 0.5 * r - 0.419 * g - 0.081 * b;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / Math.max(b - a, 1e-6)));
  return t * t * (3 - 2 * t);
};

/** Ranges used by both implementations, from the 0..1 settings. */
export function chromaRange(c: Chroma) {
  const near = c.similarity * 0.5;
  return { near, far: near + 0.01 + c.smoothness * 0.3 };
}

/** One pixel (channels 0..1) → keyed colour and alpha. */
export function chromaPixel(r: number, g: number, b: number, c: Chroma): [number, number, number, number] {
  const [kr, kg, kb] = hexToRgb(c.color);
  const d = Math.hypot(cb(r, g, b) - cb(kr, kg, kb), cr(r, g, b) - cr(kr, kg, kb));
  const { near, far } = chromaRange(c);
  const alpha = smooth(near, far, d);
  // Near the key colour, pull what is left towards grey so no coloured fringe remains.
  const tint = (1 - smooth(near, far + 0.15, d)) * c.spill;
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  return [r + (luma - r) * tint, g + (luma - g) * tint, b + (luma - b) * tint, alpha];
}

/** SkSL for the preview. Uniforms: keyColor (rgb), keyRange (near, far), keySpill. Output is premultiplied. */
export const CHROMA_SHADER = `
uniform shader image;
uniform vec3 keyColor;
uniform vec2 keyRange;
uniform float keySpill;

vec2 chromaOf(vec3 c) {
  return vec2(-0.169 * c.r - 0.331 * c.g + 0.5 * c.b, 0.5 * c.r - 0.419 * c.g - 0.081 * c.b);
}

// Shaders may be handed linear or encoded colour depending on the surface. Going through
// linear sRGB and encoding here gives the same numbers as the export renderer either way.
vec3 encoded(vec3 c) {
  vec3 lin = clamp(toLinearSrgb(c), 0.0, 1.0);
  return mix(lin * 12.92, 1.055 * pow(lin, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, lin));
}

half4 main(vec2 xy) {
  vec4 px = image.eval(xy);
  vec3 c = px.a > 0.0 ? px.rgb / px.a : px.rgb;
  float d = distance(chromaOf(encoded(c)), chromaOf(keyColor));
  float alpha = smoothstep(keyRange.x, keyRange.y, d);
  float tint = (1.0 - smoothstep(keyRange.x, keyRange.y + 0.15, d)) * keySpill;
  float luma = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(c, vec3(luma), tint);
  float a = alpha * px.a;
  return half4(c * a, a);
}`;
