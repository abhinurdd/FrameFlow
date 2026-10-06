/**
 * Draws one output frame with Skia (@napi-rs/canvas), in the app's layer order:
 * background, main track, overlays, canvas effects, texts, captions.
 *
 * Every time, animation and colour value comes from src/engine, so a frame is the
 * same picture the app previews. This file only turns those values into pixels.
 */

import { createCanvas, type Canvas, type SKRSContext2D } from '@napi-rs/canvas';

import { combineEffects, effectAt, resolveTransform, transformAt, transitionAt, type Layer } from '../../src/engine/animate.ts';
import { compileLook, isIdentity, NO_LOOK, saturationLayer, type BlendLayer, type CompiledLook, type Look } from '../../src/engine/looks.ts';
import {
  activeAt,
  segmentDuration,
  type BlendMode,
  type Caption,
  type Edit,
  type Location,
  type MainFrame,
  type Mask,
  type Overlay,
  type TextItem,
} from '../../src/engine/timeline.ts';
import type { TemplateId } from '../../src/engine/types.ts';

import { EMOJI_FAMILIES, fontFor, hasDevanagari } from './fonts.ts';

type Ctx = SKRSContext2D;
type Rect = { x: number; y: number; w: number; h: number };

/** A decoded picture. `width`/`height` are the source's own size; the image may be smaller. */
export type Picture = { image: Canvas; width: number; height: number; alpha?: boolean };

/** Everything decoded for one frame. */
export type FramePictures = { frame: MainFrame | null; a: Picture | null; b: Picture | null; overlays: Map<string, Picture> };

// Caption look, mirroring `CaptionLine` and the theme in src/ui.
const CAPTION_TEMPLATES: Record<TemplateId, { size: number; upper: boolean; box: boolean }> = {
  'desi-pop': { size: 1, upper: false, box: false },
  'box-bold': { size: 1, upper: true, box: true },
  karaoke: { size: 0.95, upper: false, box: false },
  clean: { size: 0.85, upper: false, box: false },
};
const HIGHLIGHT = '#FFD23F';
const SAFFRON = '#FF7A1A';

/** Text wraps at this fraction of the canvas width. */
const WRAP = 0.9;
const ITALIC_SHEAR = Math.tan((10 * Math.PI) / 180);
const RAD = Math.PI / 180;

function compositeOp(mode: BlendLayer['mode'] | BlendMode): GlobalCompositeOperation {
  return mode === 'normal' ? 'source-over' : mode;
}

function intersect(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return { x, y, w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x), h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y) };
}

function drawPicture(ctx: Ctx, pic: Picture, dest: Rect, flipH: boolean) {
  if (!flipH) {
    ctx.drawImage(pic.image, dest.x, dest.y, dest.w, dest.h);
    return;
  }
  ctx.save();
  ctx.translate(dest.x + dest.w, dest.y);
  ctx.scale(-1, 1);
  ctx.drawImage(pic.image, 0, 0, dest.w, dest.h);
  ctx.restore();
}

/** Greedy word wrap. `width` measures a string in the context's current font. */
function wrap<T>(words: T[], label: (w: T) => string, width: (s: string) => number, max: number): T[][] {
  const lines: T[][] = [];
  let line: T[] = [];
  for (const word of words) {
    const next = [...line, word];
    if (line.length && width(next.map(label).join(' ')) > max) {
      lines.push(line);
      line = [word];
    } else {
      line = next;
    }
  }
  if (line.length) lines.push(line);
  return lines;
}

type LayerOptions = {
  /** The item's box before its transform, and where the picture sits inside it. */
  box: { w: number; h: number };
  dest: Rect;
  /** Centre of the box on the canvas, in pixels. */
  cx: number;
  cy: number;
  scale: number;
  rotation: number;
  opacity: number;
  look: Look;
  blend: BlendMode;
  mask: Mask;
  flipH: boolean;
  /** Horizontal band of the canvas left visible by a wipe. */
  clip: { x: number; w: number } | null;
};

export class Painter {
  readonly out: Canvas;
  private ctx: Ctx;
  /** Everything below the texts, when a canvas effect has to move or blur it as one. */
  private scene: Canvas;
  private sceneCtx: Ctx;
  /** Work surface for grading a picture and for fading a text block as a whole. */
  private scratch: Canvas;
  private scratchCtx: Ctx;
  private small: Canvas | null = null;
  private smallBlurred: Canvas | null = null;
  private stickers = new Map<string, Picture>();

  constructor(private edit: Edit, readonly W: number, readonly H: number) {
    this.out = createCanvas(W, H);
    this.scene = createCanvas(W, H);
    this.scratch = createCanvas(W, H);
    this.ctx = this.out.getContext('2d');
    this.sceneCtx = this.scene.getContext('2d');
    this.scratchCtx = this.scratch.getContext('2d');
    for (const c of [this.ctx, this.sceneCtx, this.scratchCtx]) {
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = 'medium';
    }
  }

  /** Draw the frame at timeline time `t`. Returns the canvas's RGBA pixels (valid until the next call). */
  draw(t: number, pics: FramePictures): Buffer {
    const { edit, W, H, ctx } = this;
    const fx = combineEffects(activeAt(edit.effects, t).map((e) => effectAt(e.type, t - e.start, e.duration)));
    const moved = fx.x !== 0 || fx.y !== 0 || fx.scale !== 1 || fx.blur > 0;
    const under = moved ? this.sceneCtx : ctx;

    this.background(under, pics);
    this.main(under, pics);
    for (const overlay of activeAt(edit.overlays, t)) this.overlay(under, overlay, t, pics);

    if (moved) {
      // What shows past the edge of a shrunk or shifted picture is the plain background.
      ctx.fillStyle = edit.background.type === 'color' ? edit.background.color : '#000000';
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.translate(W / 2 + fx.x * W, H / 2 + fx.y * H);
      ctx.scale(fx.scale, fx.scale);
      if (fx.blur > 0) ctx.filter = `blur(${fx.blur * 0.02 * W}px)`;
      ctx.drawImage(this.scene, -W / 2, -H / 2);
      ctx.restore();
    }
    if (fx.flash > 0) this.wash(ctx, '#FFFFFF', fx.flash);
    if (fx.dim > 0) this.wash(ctx, '#000000', fx.dim);
    if (fx.bars > 0) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, W, fx.bars * H);
      ctx.fillRect(0, H - fx.bars * H, W, fx.bars * H);
    }

    for (const text of activeAt(edit.texts, t)) this.text(text, t);
    for (const caption of activeAt(edit.captions, t)) this.caption(caption, t);
    return this.out.data();
  }

  private wash(ctx: Ctx, color: string, opacity: number) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, opacity);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.restore();
  }

  // ---- Background ----

  private background(ctx: Ctx, pics: FramePictures) {
    const { W, H } = this;
    const bg = this.edit.background;
    ctx.fillStyle = bg.type === 'color' ? bg.color : '#000000';
    ctx.fillRect(0, 0, W, H);
    if (bg.type !== 'blur') return;
    // The frame behind is the clip that currently dominates the main track.
    const frame = pics.frame;
    const pic = frame?.b && frame.progress >= 0.5 ? (pics.b ?? pics.a) : (pics.a ?? pics.b);
    if (!pic) return;

    // Blur a 1/8 size copy and scale it back up: the same picture for a fraction of the work.
    const f = 8;
    const sigma = (0.03 * W) / f;
    const pad = Math.ceil(sigma * 3);
    const sw = Math.ceil(W / f);
    const sh = Math.ceil(H / f);
    if (!this.small || !this.smallBlurred) {
      this.small = createCanvas(sw + pad * 2, sh + pad * 2);
      this.smallBlurred = createCanvas(sw + pad * 2, sh + pad * 2);
    }
    const s = this.small.getContext('2d');
    // Stretch the picture under the padding so the blur has something to pull in at the edges.
    s.drawImage(pic.image, 0, 0, this.small.width, this.small.height);
    const k = Math.max(sw / pic.width, sh / pic.height);
    s.drawImage(pic.image, pad + (sw - pic.width * k) / 2, pad + (sh - pic.height * k) / 2, pic.width * k, pic.height * k);
    const b = this.smallBlurred.getContext('2d');
    b.filter = `blur(${sigma}px)`;
    b.drawImage(this.small, 0, 0);
    b.filter = 'none';
    ctx.drawImage(this.smallBlurred, pad, pad, sw, sh, 0, 0, W, H);
    this.wash(ctx, '#000000', 0.2);
  }

  // ---- Main track ----

  private main(ctx: Ctx, pics: FramePictures) {
    const frame = pics.frame;
    if (!frame) return;
    if (!frame.b) {
      this.segment(ctx, frame.a, pics.a, null);
      return;
    }
    const mix = transitionAt(frame.transition.type, frame.progress);
    this.segment(ctx, frame.a, pics.a, mix.a);
    this.segment(ctx, frame.b, pics.b, mix.b);
    if (mix.wash && mix.wash.opacity > 0) this.wash(ctx, mix.wash.color, mix.wash.opacity);
  }

  private segment(ctx: Ctx, at: Location, pic: Picture | null, layer: Layer | null) {
    if (!pic) return;
    const { W, H } = this;
    const seg = at.segment;
    const tr = resolveTransform(seg, at.offset, segmentDuration(seg));
    const k = seg.fit === 'cover' ? Math.max(W / pic.width, H / pic.height) : Math.min(W / pic.width, H / pic.height);
    const w = pic.width * k;
    const h = pic.height * k;
    const clipped = layer && (layer.clipLeft > 0 || layer.clipRight > 0);
    // A transition moves and scales the whole canvas-sized layer, so its scale also
    // scales the clip's own offset from the centre.
    const zoom = layer?.scale ?? 1;
    this.layer(ctx, pic, {
      box: { w, h },
      dest: { x: 0, y: 0, w, h },
      cx: W / 2 + ((layer?.x ?? 0) + tr.x * zoom) * W,
      cy: H / 2 + ((layer?.y ?? 0) + tr.y * zoom) * H,
      scale: tr.scale * zoom,
      rotation: tr.rotation,
      opacity: tr.opacity * (layer?.opacity ?? 1),
      look: seg.look,
      blend: 'normal',
      mask: 'none',
      flipH: false,
      clip: clipped ? { x: layer.clipLeft * W, w: (1 - layer.clipLeft - layer.clipRight) * W } : null,
    });
  }

  // ---- Overlays ----

  private overlay(ctx: Ctx, o: Overlay, t: number, pics: FramePictures) {
    const pic = o.kind === 'sticker' ? this.sticker(o.emoji ?? '') : pics.overlays.get(o.id);
    if (!pic) return;
    const { W, H } = this;
    const tr = resolveTransform(o, t - o.start, o.duration);
    const w = 0.5 * W;
    const square = o.kind === 'sticker' || o.mask === 'circle';
    const box = { w, h: square ? w : (w * pic.height) / pic.width };
    // A circle shows a centred square crop of the source.
    const k = Math.max(box.w / pic.width, box.h / pic.height);
    const dest = { x: (box.w - pic.width * k) / 2, y: (box.h - pic.height * k) / 2, w: pic.width * k, h: pic.height * k };
    this.layer(ctx, pic, {
      box,
      dest,
      cx: W / 2 + tr.x * W,
      cy: H / 2 + tr.y * H,
      scale: tr.scale,
      rotation: tr.rotation,
      opacity: tr.opacity,
      // Stickers take no look in the app.
      look: o.kind === 'sticker' ? NO_LOOK : o.look,
      // Only photos blend: the app's preview cannot blend a playing video, so export must not either.
      blend: o.kind === 'image' ? o.blend : 'normal',
      mask: o.mask,
      flipH: o.flipH,
      clip: null,
    });
  }

  /** An emoji drawn once into a square, glyph size 80% of the box. */
  private sticker(emoji: string): Picture | null {
    if (!emoji) return null;
    const hit = this.stickers.get(emoji);
    if (hit) return hit;
    const size = Math.min(1024, Math.max(128, Math.ceil(this.W / 2)));
    const image = createCanvas(size, size);
    const c = image.getContext('2d');
    c.font = `${size * 0.8}px ${EMOJI_FAMILIES}`;
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    const m = c.measureText(emoji);
    // Centre the glyph's own bounding box, which is what a centred text view shows.
    c.fillText(emoji, size / 2, size / 2 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
    const pic = { image, width: size, height: size, alpha: true };
    this.stickers.set(emoji, pic);
    return pic;
  }

  // ---- One picture with its transform, look, mask and blend ----

  private layer(ctx: Ctx, pic: Picture, o: LayerOptions) {
    if (o.opacity <= 0 || o.scale <= 0) return;
    const look = compileLook(o.look);
    const { box, dest } = o;
    ctx.save();
    if (o.clip) {
      ctx.beginPath();
      ctx.rect(o.clip.x, 0, o.clip.w, this.H);
      ctx.clip();
    }
    ctx.translate(o.cx, o.cy);
    ctx.rotate(o.rotation * RAD);
    ctx.scale(o.scale, o.scale);
    ctx.translate(-box.w / 2, -box.h / 2);
    ctx.globalAlpha = Math.min(1, o.opacity);
    ctx.globalCompositeOperation = compositeOp(o.blend);

    const overflows = dest.x < -0.01 || dest.y < -0.01 || dest.x + dest.w > box.w + 0.01 || dest.y + dest.h > box.h + 0.01;
    if (o.mask !== 'none' || overflows) {
      ctx.beginPath();
      if (o.mask === 'circle') ctx.arc(box.w / 2, box.h / 2, Math.min(box.w, box.h) / 2, 0, Math.PI * 2);
      else if (o.mask === 'rounded') ctx.roundRect(0, 0, box.w, box.h, 0.12 * box.w);
      else ctx.rect(0, 0, box.w, box.h);
      ctx.clip();
    }

    if (isIdentity(look)) {
      drawPicture(ctx, pic, dest, o.flipH);
    } else {
      const graded = this.grade(pic, o, look);
      ctx.drawImage(this.scratch, 0, 0, graded.w, graded.h, 0, 0, box.w, box.h);
    }
    ctx.restore();
  }

  /**
   * Draw the picture into the scratch canvas with its look on top: the saturation
   * layer, the flat colour layers with their blend modes, then the vignette, all
   * limited to the part of the box the picture covers.
   */
  private grade(pic: Picture, o: LayerOptions, look: CompiledLook) {
    const { box, dest } = o;
    // Work at the size the box will be drawn, but never larger than the canvas.
    const k = Math.min(Math.max(o.scale, 0.1), this.W / box.w, this.H / box.h);
    const w = Math.ceil(box.w * k);
    const h = Math.ceil(box.h * k);
    const g = this.scratchCtx;
    g.save();
    g.beginPath();
    g.rect(0, 0, w, h);
    g.clip();
    g.clearRect(0, 0, w, h);
    const scaled = { x: dest.x * k, y: dest.y * k, w: dest.w * k, h: dest.h * k };
    drawPicture(g, pic, scaled, o.flipH);

    const area = intersect(scaled, { x: 0, y: 0, w, h });
    const sat = saturationLayer(look.saturation);
    for (const l of sat ? [sat, ...look.layers] : look.layers) {
      g.globalCompositeOperation = compositeOp(l.mode);
      g.globalAlpha = l.opacity;
      g.fillStyle = l.color;
      g.fillRect(area.x, area.y, area.w, area.h);
    }
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    if (look.vignette > 0) {
      const cx = area.x + area.w / 2;
      const cy = area.y + area.h / 2;
      const shade = g.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(area.w, area.h) / 2);
      shade.addColorStop(0, 'rgba(0,0,0,0)');
      shade.addColorStop(0.45, 'rgba(0,0,0,0)');
      shade.addColorStop(1, `rgba(0,0,0,${0.8 * look.vignette})`);
      g.fillStyle = shade;
      g.fillRect(area.x, area.y, area.w, area.h);
    }
    if (pic.alpha) {
      // The colour layers filled the picture's transparent parts; cut them back out.
      g.globalCompositeOperation = 'destination-in';
      drawPicture(g, pic, scaled, o.flipH);
    }
    g.restore();
    return { w, h };
  }

  // ---- Texts ----

  private text(item: TextItem, t: number) {
    const { W, H } = this;
    const local = t - item.start;
    const tr = resolveTransform(item, local, item.duration);
    if (tr.opacity <= 0) return;
    // The font is sized by the item's own scale; an in/out animation then scales
    // the laid-out block, so the line breaks do not jump while it animates.
    const own = transformAt(item, local).scale;
    const st = item.style;
    const unit = W / 360;
    const fs = st.size * unit * own;
    if (fs < 0.5 || tr.scale <= 0) return;
    const spacing = st.letterSpacing * unit;
    const content = st.uppercase ? item.text.toUpperCase() : item.text;

    // A translucent block is drawn opaque first, then faded as one piece.
    const whole = tr.opacity >= 1;
    const ctx = whole ? this.ctx : this.scratchCtx;
    ctx.save();
    if (!whole) ctx.clearRect(0, 0, W, H);
    // As in the app: text with any Devanagari is set in Noto Sans Devanagari throughout,
    // except Rounded (Baloo 2), which has the script itself.
    const deva = hasDevanagari(content);
    ctx.font = fontFor(st.font, st.weight, fs, deva && st.font !== 'rounded');
    ctx.letterSpacing = `${spacing}px`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const width = (s: string) => Math.max(0, ctx.measureText(s).width - (s ? spacing : 0));
    // The block is the text plus this padding; the background box, when there is one, fills it.
    const padX = 0.25 * fs;
    const padY = 0.12 * fs;

    const lines = content.split('\n').flatMap((p) => {
      const wrapped = wrap(p.split(' ').filter(Boolean), (w) => w, width, WRAP * W - 2 * padX).map((l) => l.join(' '));
      return wrapped.length ? wrapped : [''];
    });
    const widths = lines.map(width);
    const bw = Math.max(...widths);
    const lh = fs * (deva ? 1.5 : 1.2);
    const bh = lines.length * lh;
    const metrics = ctx.measureText('Hg');
    const ascent = metrics.fontBoundingBoxAscent;
    const descent = metrics.fontBoundingBoxDescent;
    const baseline = (i: number) => -bh / 2 + i * lh + (lh - ascent - descent) / 2 + ascent;
    // The block sits in a strip 90% of the canvas wide, centred on the transform position:
    // against its left or right edge when so aligned, else in the middle.
    const reach = (WRAP * W) / 2;
    const mid = st.align === 'left' ? -reach + padX + bw / 2 : st.align === 'right' ? reach - padX - bw / 2 : 0;
    const left = (i: number) => mid + (st.align === 'left' ? -bw / 2 : st.align === 'right' ? bw / 2 - widths[i] : -widths[i] / 2);

    ctx.translate(W / 2 + tr.x * W, H / 2 + tr.y * H);
    ctx.rotate(tr.rotation * RAD);
    ctx.scale(tr.scale / own, tr.scale / own);
    // "Italic" is the upright face leaning right, as CSS skewX(-10deg) about the block centre.
    if (st.italic) ctx.transform(1, 0, -ITALIC_SHEAR, 1, 0, 0);

    if (st.background) {
      ctx.fillStyle = st.background;
      ctx.beginPath();
      ctx.roundRect(mid - bw / 2 - padX, -bh / 2 - padY, bw + 2 * padX, bh + 2 * padY, 0.2 * fs);
      ctx.fill();
    }
    const shadowOn = () => {
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 0.15 * fs;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0.04 * fs;
    };
    if (st.strokeColor) {
      // The outline is 8% of the font size outside the glyph: a centred stroke twice that wide, under the fill.
      if (st.shadow) shadowOn();
      ctx.strokeStyle = st.strokeColor;
      ctx.lineWidth = 0.16 * fs;
      ctx.lineJoin = 'round';
      lines.forEach((line, i) => ctx.strokeText(line, left(i), baseline(i)));
      ctx.shadowColor = 'transparent';
    } else if (st.shadow) {
      shadowOn();
    }
    ctx.fillStyle = st.color;
    lines.forEach((line, i) => ctx.fillText(line, left(i), baseline(i)));
    ctx.restore();

    if (!whole) {
      this.ctx.save();
      this.ctx.globalAlpha = tr.opacity;
      this.ctx.drawImage(this.scratch, 0, 0);
      this.ctx.restore();
    }
  }

  // ---- Captions ----

  private caption(caption: Caption, t: number) {
    const { W, H, ctx } = this;
    const style = this.edit.captionStyle;
    const tpl = CAPTION_TEMPLATES[style.template] ?? CAPTION_TEMPLATES['desi-pop'];
    const local = t - caption.start;
    const timed = caption.words?.length ? caption.words : null;
    const source = timed ? timed.map((w) => w.text) : caption.text.split(/\s+/).filter(Boolean);
    if (!source.length) return;
    const deva = hasDevanagari(source.join(' '));
    const words = source.map((text, index) => ({ index, text: tpl.upper && !deva ? text.toUpperCase() : text }));
    const active = timed ? timed.findIndex((w) => local >= w.t0 && local < w.t1) : -1;
    // Keywords stay highlighted, except in karaoke where only the spoken word is lit.
    const lit = (index: number) => index === active || (style.template !== 'karaoke' && !!timed?.[index]?.emphasis);

    const unit = W / 360;
    const size = style.size * unit * tpl.size;
    const lh = size * (deva ? 1.45 : 1.15);
    ctx.save();
    // Inter Black, or Noto Sans Devanagari ExtraBold when the line is in Devanagari.
    ctx.font = fontFor('inter', 'black', size, deva);
    ctx.letterSpacing = '0px';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const width = (s: string) => ctx.measureText(s).width;
    const space = width('a a') - width('aa');
    const metrics = ctx.measureText('Hg');
    const ascent = metrics.fontBoundingBoxAscent;
    const descent = metrics.fontBoundingBoxDescent;

    const lines = wrap(words, (w) => w.text, width, WRAP * W);
    const top = style.y * H - (lines.length * lh) / 2;
    const placed = lines.flatMap((line, row) => {
      const widths = line.map((w) => width(w.text));
      let x = (W - widths.reduce((a, b) => a + b, 0) - space * (line.length - 1)) / 2;
      const y = top + row * lh + (lh - ascent - descent) / 2 + ascent;
      return line.map((w, i) => {
        const at = { ...w, x, y, w: widths[i] };
        x += widths[i] + space;
        return at;
      });
    });

    if (tpl.box) {
      for (const hit of placed.filter((w) => lit(w.index))) {
        ctx.fillStyle = SAFFRON;
        ctx.fillRect(hit.x - space / 2, hit.y - ascent, hit.w + space, ascent + descent);
      }
    }
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2 * unit;
    ctx.shadowBlur = 4 * unit;
    for (const w of placed) {
      ctx.fillStyle = lit(w.index) && !tpl.box ? HIGHLIGHT : '#FFFFFF';
      ctx.fillText(w.text, w.x, w.y);
    }
    ctx.restore();
  }
}
