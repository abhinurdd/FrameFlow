import { Blur, Canvas, Fill, Group, Paint, rect, useImage, type SkImage } from '@shopify/react-native-skia';
import type { ReactNode } from 'react';

import { resolveTransform, transitionAt, type Layer, type Transform } from '@/engine/animate';
import { compileLook } from '@/engine/looks';
import { maskPath, squareMask } from '@/engine/mask';
import { speedAt } from '@/engine/speed';
import { mainFrameAt, overlayBlend, segmentDuration, type Asset, type BlendMode, type Edit, type Location, type Overlay } from '@/engine/timeline';

import { SKIA_VIDEO, Treated, useSkiaVideo, type Frame } from './keyed';
import type { CanvasSize } from './types';

/**
 * The stage: one Skia canvas that draws the main clip and its overlays together.
 *
 * Ordinary frames are layered from separate native views, which is fast but means no
 * layer can see the pixels under it. When a frame needs that (a video overlay blended
 * into the clip below, or a blurred copy of the clip as the background) those layers
 * are drawn here instead, in one pass, with the same maths as the export renderer.
 */

const SKIA_MODE = { normal: 'srcOver', screen: 'screen', multiply: 'multiply', overlay: 'overlay', 'soft-light': 'softLight', lighten: 'lighten', darken: 'darken' } as const satisfies Record<BlendMode, string>;

/** How early the stage starts loading its videos before it is needed. */
const LEAD = 1;

const mixes = (o: Overlay) => o.kind === 'video' && overlayBlend(o) !== 'normal';

/** What the stage has to do at `time`. */
export function stagePlan(edit: Edit, time: number) {
  if (!SKIA_VIDEO) return { backdrop: false, loaded: false, mixing: false };
  const near = edit.overlays.filter((o) => mixes(o) && time >= o.start - LEAD && time < o.start + o.duration);
  return {
    /** A blurred copy of the clip fills the canvas behind it. */
    backdrop: edit.background.type === 'blur',
    /** The clip and overlays are decoded here, ready to take over. */
    loaded: near.length > 0,
    /** The stage is drawing the clip and overlays; their native views are empty. */
    mixing: near.some((o) => time >= o.start),
  };
}

/** A video's current frame, handed to whatever draws it. */
function VideoFrame({ uri, target, playing, volume, rate, children }: { uri: string; target: number; playing: boolean; volume: number; rate?: number; children: (image: Frame, turn: number) => ReactNode }) {
  const { frame, turn } = useSkiaVideo(uri, target, playing, volume, rate);
  return children(frame, turn);
}

function StillFrame({ uri, children }: { uri: string; children: (image: SkImage, turn: number) => ReactNode }) {
  const image = useImage(uri);
  return image ? children(image, 0) : null;
}

function Picture({ asset, target, playing, volume, rate, children }: { asset: Asset; target: number; playing: boolean; volume: number; rate?: number; children: (image: Frame, turn: number) => ReactNode }) {
  if (asset.placeholder) return null;
  if (asset.kind === 'image') return <StillFrame uri={asset.uri}>{children}</StillFrame>;
  return (
    <VideoFrame uri={asset.uri} target={target} playing={playing} volume={volume} rate={rate}>
      {children}
    </VideoFrame>
  );
}

/** Opacity and blending need the whole item flattened first, or its parts would mix one by one. */
function flatten(opacity: number, mode: BlendMode = 'normal') {
  if (opacity >= 0.999 && mode === 'normal') return undefined;
  return <Paint opacity={Math.max(0, Math.min(1, opacity))} blendMode={SKIA_MODE[mode]} />;
}

function MainClip({ edit, at, layer, canvas, playing, nudge }: { edit: Edit; at: Location; layer: Layer | null; canvas: CanvasSize; playing: boolean; nudge: (t: Transform) => Transform }) {
  const segment = at.segment;
  const asset = edit.assets[segment.assetId];
  if (!asset) return null;
  const { w: W, h: H } = canvas;
  const turned = segment.rotation % 180 !== 0;
  const aw = (turned ? asset.height : asset.width) || W;
  const ah = (turned ? asset.width : asset.height) || H;
  const k = segment.fit === 'cover' ? Math.max(W / aw, H / ah) : Math.min(W / aw, H / ah);
  const fw = aw * k;
  const fh = ah * k;
  const mw = turned ? fh : fw;
  const mh = turned ? fw : fh;
  const t = nudge(resolveTransform(segment, at.offset, segmentDuration(segment)));
  const cx = W / 2 + t.x * W;
  const cy = H / 2 + t.y * H;
  const l = layer ?? { opacity: 1, x: 0, y: 0, scale: 1, clipLeft: 0, clipRight: 0 };
  const rad = Math.PI / 180;
  return (
    <Picture asset={asset} target={at.sourceTime} playing={playing} volume={0} rate={speedAt(segment, at.sourceTime)}>
      {(image, turn) => (
        <Group clip={rect(l.clipLeft * W, 0, (1 - l.clipLeft - l.clipRight) * W, H)} layer={flatten(l.opacity * t.opacity)}>
          <Group origin={{ x: W / 2, y: H / 2 }} transform={[{ translateX: l.x * W }, { translateY: l.y * H }, { scale: l.scale }]}>
            <Group origin={{ x: cx, y: cy }} transform={[{ scale: t.scale }, { rotate: t.rotation * rad }]}>
              <Group clip={rect(cx - fw / 2, cy - fh / 2, fw, fh)}>
                <Group origin={{ x: cx, y: cy }} transform={[{ rotate: segment.rotation * rad }, { scaleX: segment.flipH ? -1 : 1 }, { scaleY: segment.flipV ? -1 : 1 }]}>
                  <Group transform={[{ translateX: cx - mw / 2 }, { translateY: cy - mh / 2 }]}>
                    <Treated image={image} turn={turn} width={mw} height={mh} chroma={segment.chroma} look={segment.chroma ? null : compileLook(segment.look)} />
                  </Group>
                </Group>
              </Group>
            </Group>
          </Group>
        </Group>
      )}
    </Picture>
  );
}

function OverlayItem({ edit, overlay, time, canvas, playing, nudge }: { edit: Edit; overlay: Overlay; time: number; canvas: CanvasSize; playing: boolean; nudge: (t: Transform) => Transform }) {
  const asset = overlay.assetId ? edit.assets[overlay.assetId] : undefined;
  if (!asset || overlay.kind === 'sticker') return null;
  const local = time - overlay.start;
  const visible = local >= 0 && local < overlay.duration;
  const { w: W, h: H } = canvas;
  const bw = W * 0.5;
  const bh = squareMask(overlay.mask) || !asset.width ? bw : bw * (asset.height / asset.width);
  const t = nudge(resolveTransform(overlay, Math.max(0, local), overlay.duration));
  const cx = W / 2 + t.x * W;
  const cy = H / 2 + t.y * H;
  return (
    <Picture asset={asset} target={overlay.in + Math.max(0, local)} playing={playing && visible} volume={overlay.muted || !visible ? 0 : overlay.volume}>
      {(image, turn) => (
        <Group layer={flatten(visible ? t.opacity : 0, overlayBlend(overlay))}>
          <Group origin={{ x: cx, y: cy }} transform={[{ scale: t.scale }, { rotate: (t.rotation * Math.PI) / 180 }, { scaleX: overlay.flipH ? -1 : 1 }]}>
            <Group transform={[{ translateX: cx - bw / 2 }, { translateY: cy - bh / 2 }]} clip={rect(0, 0, bw, bh)}>
              <Treated image={image} turn={turn} width={bw} height={bh} chroma={overlay.chroma} clip={maskPath(overlay.mask, bw, bh)} look={overlay.chroma ? null : compileLook(overlay.look)} />
            </Group>
          </Group>
        </Group>
      )}
    </Picture>
  );
}

/** The clip, stretched over the whole canvas and blurred: the background when the clip does not fill it. */
function Backdrop({ edit, at, canvas, playing }: { edit: Edit; at: Location; canvas: CanvasSize; playing: boolean }) {
  const asset = edit.assets[at.segment.assetId];
  if (!asset) return null;
  const { w: W, h: H } = canvas;
  // Drawn past the edges, so the blur has picture to pull in there instead of fading out.
  const pad = 0.09 * W;
  return (
    <Picture asset={asset} target={at.sourceTime} playing={playing} volume={0} rate={speedAt(at.segment, at.sourceTime)}>
      {(image, turn) => (
        <Group
          layer={
            <Paint>
              <Blur blur={0.03 * W} mode="clamp" />
            </Paint>
          }>
          <Group transform={[{ translateX: -pad }, { translateY: -pad }]}>
            <Treated image={image} turn={turn} width={W + pad * 2} height={H + pad * 2} />
          </Group>
          <Fill color="rgba(0,0,0,0.2)" />
        </Group>
      )}
    </Picture>
  );
}

export function Stage({ edit, time, playing, canvas, plan, nudgeFor }: { edit: Edit; time: number; playing: boolean; canvas: CanvasSize; plan: ReturnType<typeof stagePlan>; /** The gesture in flight on an item, if it is the selected one. */ nudgeFor: (track: 'main' | 'overlays', id: string) => (t: Transform) => Transform }) {
  const frame = mainFrameAt(edit, time);
  if (!frame || (!plan.backdrop && !plan.loaded)) return null;
  const mix = frame.b ? transitionAt(frame.transition.type, frame.progress) : null;
  // Behind the clip is whichever side of a transition currently dominates, as in the export.
  const behind = frame.b && frame.progress >= 0.5 ? frame.b : frame.a;
  return (
    <Canvas pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: canvas.w, height: canvas.h }}>
      {plan.backdrop && <Backdrop key={`bg:${behind.segment.id}`} edit={edit} at={behind} canvas={canvas} playing={playing} />}
      {plan.loaded && (
        <Group layer={<Paint opacity={plan.mixing ? 1 : 0} />}>
          <MainClip key={frame.a.segment.id} edit={edit} at={frame.a} layer={mix?.a ?? null} canvas={canvas} playing={playing} nudge={nudgeFor('main', frame.a.segment.id)} />
          {frame.b && <MainClip key={frame.b.segment.id} edit={edit} at={frame.b} layer={mix?.b ?? null} canvas={canvas} playing={playing} nudge={nudgeFor('main', frame.b.segment.id)} />}
          {mix?.wash && <Fill color={mix.wash.color} opacity={mix.wash.opacity} />}
          {edit.overlays
            .filter((o) => time >= o.start - LEAD && time < o.start + o.duration)
            .map((o) => (
              <OverlayItem key={o.id} edit={edit} overlay={o} time={time} canvas={canvas} playing={playing} nudge={nudgeFor('overlays', o.id)} />
            ))}
        </Group>
      )}
    </Canvas>
  );
}
