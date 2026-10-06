/**
 * Colour grading for the editor: filters and adjust sliders.
 *
 * A look compiles to a saturation factor, a stack of flat colour layers with CSS
 * blend modes, and a vignette amount. The preview draws those layers over the video
 * with `mixBlendMode`; export applies `gradePixel`, which is the same maths, as a
 * 3D LUT. Keep the two in step: anything added here must work in both.
 */

export type Adjust = {
  /** Each slider runs -1..1 with 0 as "unchanged", except fade and vignette (0..1). */
  brightness: number;
  contrast: number;
  saturation: number;
  temperature: number;
  tint: number;
  fade: number;
  vignette: number;
};

export const NO_ADJUST: Adjust = { brightness: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, fade: 0, vignette: 0 };

export const ADJUST_SLIDERS: { key: keyof Adjust; label: string; min: number; max: number }[] = [
  { key: 'brightness', label: 'Brightness', min: -1, max: 1 },
  { key: 'contrast', label: 'Contrast', min: -1, max: 1 },
  { key: 'saturation', label: 'Saturation', min: -1, max: 1 },
  { key: 'temperature', label: 'Temperature', min: -1, max: 1 },
  { key: 'tint', label: 'Tint', min: -1, max: 1 },
  { key: 'fade', label: 'Fade', min: 0, max: 1 },
  { key: 'vignette', label: 'Vignette', min: 0, max: 1 },
];

export type LayerMode = 'normal' | 'multiply' | 'screen' | 'soft-light' | 'color-dodge' | 'color-burn' | 'saturation';
export type BlendLayer = { color: string; mode: LayerMode; opacity: number };

type FilterDef = { id: string; name: string; adjust: Partial<Adjust>; layers?: BlendLayer[] };

export const FILTERS = [
  { id: 'none', name: 'None', adjust: {} },
  { id: 'vivid', name: 'Vivid', adjust: { saturation: 0.45, contrast: 0.3 } },
  { id: 'punch', name: 'Punch', adjust: { contrast: 0.55, saturation: 0.2, brightness: 0.05 } },
  { id: 'warm', name: 'Warm', adjust: { temperature: 0.55, saturation: 0.1 } },
  { id: 'cool', name: 'Cool', adjust: { temperature: -0.55 } },
  { id: 'golden', name: 'Golden', adjust: { temperature: 0.35, brightness: 0.1, fade: 0.15 }, layers: [{ color: '#FFC46B', mode: 'soft-light', opacity: 0.3 }] },
  { id: 'film', name: 'Film', adjust: { saturation: -0.1, contrast: 0.25, temperature: 0.2, fade: 0.35, vignette: 0.3 } },
  { id: 'fade', name: 'Fade', adjust: { fade: 0.8, saturation: -0.15 } },
  { id: 'dream', name: 'Dream', adjust: { fade: 0.3, brightness: 0.1 }, layers: [{ color: '#7A5CFF', mode: 'screen', opacity: 0.18 }] },
  { id: 'rose', name: 'Rose', adjust: { brightness: 0.05 }, layers: [{ color: '#FF5FA2', mode: 'soft-light', opacity: 0.35 }] },
  { id: 'forest', name: 'Forest', adjust: { saturation: 0.1, contrast: 0.1 }, layers: [{ color: '#2FBF71', mode: 'soft-light', opacity: 0.3 }] },
  { id: 'dusk', name: 'Dusk', adjust: { contrast: 0.2, brightness: -0.1 }, layers: [{ color: '#3B2A8C', mode: 'screen', opacity: 0.22 }, { color: '#FF8A4C', mode: 'soft-light', opacity: 0.25 }] },
  { id: 'sepia', name: 'Sepia', adjust: { saturation: -1, contrast: 0.1 }, layers: [{ color: '#F2D2A0', mode: 'multiply', opacity: 1 }, { color: '#2A1A0A', mode: 'screen', opacity: 0.5 }] },
  { id: 'mono', name: 'Mono', adjust: { saturation: -1, contrast: 0.2 } },
  { id: 'noir', name: 'Noir', adjust: { saturation: -1, contrast: 0.65, brightness: -0.1, vignette: 0.55 } },
] as const satisfies readonly FilterDef[];

export type FilterId = (typeof FILTERS)[number]['id'];
export type Look = { filter: FilterId; strength: number; adjust: Adjust };
export const NO_LOOK: Look = { filter: 'none', strength: 1, adjust: NO_ADJUST };

export type CompiledLook = { saturation: number; layers: BlendLayer[]; vignette: number };

const gray = (v: number) => {
  const h = Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0');
  return `#${h}${h}${h}`;
};

/** Layers for one set of slider values, in a fixed order. */
function adjustLayers(a: Adjust): BlendLayer[] {
  const out: BlendLayer[] = [];
  if (a.brightness > 0) out.push({ color: gray(a.brightness * 0.4), mode: 'screen', opacity: 1 });
  if (a.brightness < 0) out.push({ color: gray(1 + a.brightness * 0.5), mode: 'multiply', opacity: 1 });
  if (a.contrast > 0) {
    // Dodge then burn steepens the tone curve around mid-grey.
    out.push({ color: gray(a.contrast * 0.15), mode: 'color-dodge', opacity: 1 });
    out.push({ color: gray(1 - a.contrast * 0.15), mode: 'color-burn', opacity: 1 });
  }
  if (a.contrast < 0) out.push({ color: '#808080', mode: 'normal', opacity: -a.contrast * 0.5 });
  if (a.temperature !== 0) out.push({ color: a.temperature > 0 ? '#FF8A00' : '#0080FF', mode: 'soft-light', opacity: Math.abs(a.temperature) * 0.35 });
  if (a.tint !== 0) out.push({ color: a.tint > 0 ? '#FF00C8' : '#00D05A', mode: 'soft-light', opacity: Math.abs(a.tint) * 0.3 });
  if (a.fade > 0) {
    out.push({ color: gray(a.fade * 0.25), mode: 'screen', opacity: 1 });
    out.push({ color: '#808080', mode: 'normal', opacity: a.fade * 0.15 });
  }
  return out;
}

export function compileLook(look: Look): CompiledLook {
  const def: FilterDef = FILTERS.find((f) => f.id === look.filter) ?? FILTERS[0];
  const k = look.strength;
  const f: Adjust = { ...NO_ADJUST };
  for (const key of Object.keys(def.adjust) as (keyof Adjust)[]) f[key] = (def.adjust[key] ?? 0) * k;
  const a = look.adjust;
  return {
    // Filter and slider saturation multiply, so "Mono" stays mono whatever the slider says.
    saturation: (1 + f.saturation) * (1 + a.saturation),
    layers: [...adjustLayers(f), ...(def.layers ?? []).map((l) => ({ ...l, opacity: l.opacity * k })), ...adjustLayers(a)],
    vignette: Math.min(1, f.vignette + a.vignette),
  };
}

/** The saturation factor as a preview layer: grey pulls saturation down, pure red pushes it up. */
export function saturationLayer(saturation: number): BlendLayer | null {
  if (Math.abs(saturation - 1) < 0.01) return null;
  return saturation < 1
    ? { color: '#808080', mode: 'saturation', opacity: 1 - saturation }
    : { color: '#FF0000', mode: 'saturation', opacity: Math.min(1, (saturation - 1) * 0.6) };
}

export function isIdentity(c: CompiledLook) {
  return Math.abs(c.saturation - 1) < 0.01 && c.layers.length === 0 && c.vignette === 0;
}

// ---- Pixel maths, mirroring the CSS compositing spec. Used to bake export LUTs. ----

type RGB = [number, number, number];
const hex = (c: string): RGB => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255) as RGB;
const lum = ([r, g, b]: RGB) => 0.3 * r + 0.59 * g + 0.11 * b;

function clipColor(c: RGB): RGB {
  const l = lum(c);
  const n = Math.min(...c);
  const x = Math.max(...c);
  let out = c;
  if (n < 0) out = out.map((v) => l + ((v - l) * l) / (l - n)) as RGB;
  if (x > 1) out = out.map((v) => l + ((v - l) * (1 - l)) / (x - l)) as RGB;
  return out;
}

function setLum(c: RGB, l: number): RGB {
  const d = l - lum(c);
  return clipColor(c.map((v) => v + d) as RGB);
}

function setSat(c: RGB, s: number): RGB {
  const max = Math.max(...c);
  const min = Math.min(...c);
  if (max === min) return [0, 0, 0];
  return c.map((v) => ((v - min) * s) / (max - min)) as RGB;
}

function softLight(s: number, l: number) {
  if (l <= 0.5) return s - (1 - 2 * l) * s * (1 - s);
  const d = s <= 0.25 ? ((16 * s - 12) * s + 4) * s : Math.sqrt(s);
  return s + (2 * l - 1) * (d - s);
}

function blendChannel(mode: LayerMode, s: number, l: number) {
  switch (mode) {
    case 'multiply': return s * l;
    case 'screen': return s + l - s * l;
    case 'soft-light': return softLight(s, l);
    case 'color-dodge': return s === 0 ? 0 : l >= 1 ? 1 : Math.min(1, s / (1 - l));
    case 'color-burn': return s >= 1 ? 1 : l <= 0 ? 0 : 1 - Math.min(1, (1 - s) / l);
    default: return l;
  }
}

function applyLayer(src: RGB, layer: BlendLayer): RGB {
  const top = hex(layer.color);
  const blended: RGB =
    layer.mode === 'saturation'
      ? setLum(setSat(src, Math.max(...top) - Math.min(...top)), lum(src))
      : (src.map((s, i) => blendChannel(layer.mode, s, top[i])) as RGB);
  return src.map((s, i) => s + (blended[i] - s) * layer.opacity) as RGB;
}

/** Grade one pixel (channels 0..1). Vignette is positional, so it is not included. */
export function gradePixel(rgb: RGB, look: CompiledLook): RGB {
  const sat = saturationLayer(look.saturation);
  let out = sat ? applyLayer(rgb, sat) : rgb;
  for (const layer of look.layers) out = applyLayer(out, layer);
  return out.map((v) => Math.min(1, Math.max(0, v))) as RGB;
}
