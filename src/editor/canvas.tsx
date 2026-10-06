import { Canvas as SkiaCanvas, RadialGradient, Rect, vec } from '@shopify/react-native-skia';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { useEffect, useState } from 'react';
import { Pressable, Text, View, type ImageStyle, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { combineEffects, effectAt, resolveTransform, transformAt, transitionAt, type Layer, type Transform } from '@/engine/animate';
import { compileLook, saturationLayer, type BlendLayer, type Look } from '@/engine/looks';
import { activeAt, mainFrameAt, segmentDuration, segmentStarts, type Asset, type Caption, type CaptionStyle, type Edit, type Overlay, type Segment, type TextItem } from '@/engine/timeline';
import type { Word } from '@/engine/types';
import { CaptionLine, ClipFrame } from '@/ui/clip-visual';
import { colors, hasDevanagari } from '@/ui/theme';

import { fontFamily } from './fonts';
import { KeyedImage, KeyedVideo } from './keyed';
import type { CanvasSize, Selection } from './types';

const SELECT = colors.select;
const SHOWN: Layer = { opacity: 1, x: 0, y: 0, scale: 1, clipLeft: 0, clipRight: 0 };

/** A drag, pinch or twist in progress on the selected item, not yet committed to the edit. */
export type Nudge = { dx: number; dy: number; scale: number; rotation: number };
const NO_NUDGE: Nudge = { dx: 0, dy: 0, scale: 1, rotation: 0 };

function nudged(t: Transform, n: Nudge | null, canvas: CanvasSize): Transform {
  if (!n) return t;
  return { ...t, x: t.x + n.dx / canvas.w, y: t.y + n.dy / canvas.h, scale: Math.max(0.05, t.scale * n.scale), rotation: t.rotation + n.rotation };
}

/** Tracks the gestures in flight on the canvas and the combined change they have made so far. */
class NudgeTracker {
  private active = 0;
  private nudge = NO_NUDGE;
  begin() {
    this.active++;
  }
  update(patch: Partial<Nudge>) {
    this.nudge = { ...this.nudge, ...patch };
    return this.nudge;
  }
  /** Returns the finished nudge when the last gesture ends, otherwise null. */
  end() {
    this.active = Math.max(0, this.active - 1);
    if (this.active > 0) return null;
    const done = this.nudge;
    this.nudge = NO_NUDGE;
    return done;
  }
}

const fill: ViewStyle = { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 };

/** Filter and adjust layers, drawn over a frame and blended into it. */
function LookLayers({ look, width, height }: { look: Look; width: number; height: number }) {
  const compiled = compileLook(look);
  const sat = saturationLayer(compiled.saturation);
  const layers: BlendLayer[] = sat ? [sat, ...compiled.layers] : compiled.layers;
  return (
    <>
      {layers.map((l, i) => (
        <View key={i} pointerEvents="none" style={[fill, { backgroundColor: l.color, opacity: l.opacity, mixBlendMode: l.mode }]} />
      ))}
      {compiled.vignette > 0 && (
        <SkiaCanvas pointerEvents="none" style={fill}>
          <Rect x={0} y={0} width={width} height={height}>
            <RadialGradient c={vec(width / 2, height / 2)} r={Math.hypot(width, height) / 2} colors={['#00000000', '#00000000', `rgba(0,0,0,${0.8 * compiled.vignette})`]} positions={[0, 0.45, 1]} />
          </Rect>
        </SkiaCanvas>
      )}
    </>
  );
}

function MainLayer({
  segment,
  asset,
  player,
  offset,
  layer,
  above,
  canvas,
  nudge,
  selected,
  onPress,
}: {
  segment: Segment;
  asset: Asset;
  player: VideoPlayer;
  offset: number;
  layer: Layer;
  above: boolean;
  canvas: CanvasSize;
  nudge: Nudge | null;
  selected: boolean;
  onPress: () => void;
}) {
  const turned = segment.rotation % 180 !== 0;
  const aw = (turned ? asset.height : asset.width) || canvas.w;
  const ah = (turned ? asset.width : asset.height) || canvas.h;
  const k = segment.fit === 'cover' ? Math.max(canvas.w / aw, canvas.h / ah) : Math.min(canvas.w / aw, canvas.h / ah);
  const fw = aw * k;
  const fh = ah * k;
  const t = nudged(resolveTransform(segment, offset, segmentDuration(segment)), nudge, canvas);
  const media: ViewStyle = {
    position: 'absolute',
    // A quarter-turned clip is laid out sideways, then rotated back into the frame.
    width: turned ? fh : fw,
    height: turned ? fw : fh,
    left: turned ? (fw - fh) / 2 : 0,
    top: turned ? (fh - fw) / 2 : 0,
    transform: [{ rotate: `${segment.rotation}deg` }, { scaleX: segment.flipH ? -1 : 1 }, { scaleY: segment.flipV ? -1 : 1 }],
  };
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: layer.clipLeft * canvas.w, width: (1 - layer.clipLeft - layer.clipRight) * canvas.w, height: canvas.h, overflow: 'hidden', zIndex: above ? 1 : 0 }}>
      <View pointerEvents="box-none" style={{ position: 'absolute', left: -layer.clipLeft * canvas.w, top: 0, width: canvas.w, height: canvas.h, opacity: layer.opacity, transform: [{ translateX: layer.x * canvas.w }, { translateY: layer.y * canvas.h }, { scale: layer.scale }] }}>
        <Pressable
          onPress={onPress}
          style={{ position: 'absolute', left: (canvas.w - fw) / 2 + t.x * canvas.w, top: (canvas.h - fh) / 2 + t.y * canvas.h, width: fw, height: fh, opacity: t.opacity, overflow: 'hidden', transform: [{ scale: t.scale }, { rotate: `${t.rotation}deg` }], borderWidth: selected ? 1.5 : 0, borderColor: SELECT }}>
          {asset.placeholder ? (
            // The video is not on this phone yet: show a stand-in so timing and captions can still be edited.
            <ClipFrame tone={0} personSize={fw * 0.9} style={[media, { borderRadius: 0 }]} />
          ) : asset.kind === 'image' ? (
            <Image source={{ uri: asset.uri }} style={media as ImageStyle} contentFit="fill" />
          ) : (
            <VideoView player={player} surfaceType="textureView" nativeControls={false} contentFit="fill" style={media} />
          )}
          <LookLayers look={segment.look} width={fw} height={fh} />
        </Pressable>
      </View>
    </View>
  );
}

/** Keep a video overlay's own player in step with the editor clock. */
function slave(player: VideoPlayer, target: number, playing: boolean, volume: number, muted: boolean) {
  if (Math.abs(player.currentTime - target) > (playing ? 0.3 : 0.03)) player.currentTime = target;
  if (player.volume !== volume) player.volume = volume;
  if (player.muted !== muted) player.muted = muted;
  if (playing !== player.playing) {
    if (playing) player.play();
    else player.pause();
  }
}

function OverlayVideo({ overlay, asset, time, playing, style }: { overlay: Overlay; asset: Asset; time: number; playing: boolean; style: ViewStyle }) {
  const player = useVideoPlayer(asset.uri);
  const local = time - overlay.start;
  const active = local >= 0 && local < overlay.duration;
  // Counts up when the file finishes loading, so a paused overlay is moved to its frame then too.
  const [loaded, setLoaded] = useState(0);
  useEffect(() => {
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') setLoaded((n) => n + 1);
    });
    return () => sub.remove();
  }, [player]);
  useEffect(() => {
    slave(player, overlay.in + Math.max(0, local), playing && active, overlay.volume, overlay.muted || !active);
  }, [player, overlay.in, overlay.volume, overlay.muted, local, playing, active, loaded]);
  return <VideoView player={player} surfaceType="textureView" nativeControls={false} contentFit="cover" style={style} />;
}

function OverlayLayer({ overlay, asset, time, playing, canvas, nudge, selected, onPress }: { overlay: Overlay; asset?: Asset; time: number; playing: boolean; canvas: CanvasSize; nudge: Nudge | null; selected: boolean; onPress: () => void }) {
  const local = time - overlay.start;
  const visible = local >= 0 && local < overlay.duration;
  const t = nudged(resolveTransform(overlay, Math.max(0, local), overlay.duration), nudge, canvas);
  const bw = canvas.w * 0.5;
  const square = overlay.kind === 'sticker' || overlay.mask === 'circle';
  const bh = square || !asset?.width ? bw : bw * (asset.height / asset.width);
  const radius = overlay.mask === 'circle' ? bw / 2 : overlay.mask === 'rounded' ? bw * 0.12 : 0;
  const media: ViewStyle = { width: bw, height: bh, transform: [{ scaleX: overlay.flipH ? -1 : 1 }] };
  return (
    <Pressable
      onPress={onPress}
      pointerEvents={visible ? 'auto' : 'none'}
      style={{
        position: 'absolute',
        left: (canvas.w - bw) / 2 + t.x * canvas.w,
        top: (canvas.h - bh) / 2 + t.y * canvas.h,
        width: bw,
        height: bh,
        // Mounted slightly early so video overlays are loaded by the time they appear.
        opacity: visible ? t.opacity : 0,
        borderRadius: radius,
        overflow: 'hidden',
        mixBlendMode: overlay.kind === 'image' ? overlay.blend : 'normal',
        transform: [{ scale: t.scale }, { rotate: `${t.rotation}deg` }],
        borderWidth: selected ? 1.5 : 0,
        borderColor: SELECT,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {overlay.kind === 'sticker' ? (
        <Text style={{ fontSize: bw * 0.8, lineHeight: bw, transform: [{ scaleX: overlay.flipH ? -1 : 1 }] }}>{overlay.emoji}</Text>
      ) : overlay.chroma && asset ? (
        <View style={{ transform: [{ scaleX: overlay.flipH ? -1 : 1 }] }}>
          {asset.kind === 'video' ? (
            <KeyedVideo uri={asset.uri} chroma={overlay.chroma} width={bw} height={bh} target={overlay.in + Math.max(0, local)} playing={playing && visible} volume={overlay.muted || !visible ? 0 : overlay.volume} />
          ) : (
            <KeyedImage uri={asset.uri} chroma={overlay.chroma} width={bw} height={bh} />
          )}
        </View>
      ) : asset?.kind === 'video' ? (
        <OverlayVideo overlay={overlay} asset={asset} time={time} playing={playing} style={media} />
      ) : (
        asset && <Image source={{ uri: asset.uri }} style={media as ImageStyle} contentFit="cover" />
      )}
      {overlay.kind !== 'sticker' && !overlay.chroma && <LookLayers look={overlay.look} width={bw} height={bh} />}
    </Pressable>
  );
}

const STROKE_DIRECTIONS = [0, 45, 90, 135, 180, 225, 270, 315].map((d) => [Math.cos((d * Math.PI) / 180), Math.sin((d * Math.PI) / 180)]);

function TextLayer({ item, time, canvas, nudge, selected, onPress }: { item: TextItem; time: number; canvas: CanvasSize; nudge: Nudge | null; selected: boolean; onPress: () => void }) {
  const t = nudged(resolveTransform(item, time - item.start, item.duration), nudge, canvas);
  // The text is laid out at its own size; an in/out animation then scales the whole block,
  // so lines do not re-wrap mid-animation. Export does the same.
  const own = nudged(transformAt(item, time - item.start), nudge, canvas).scale;
  const s = item.style;
  const size = (s.size * canvas.w) / 360 * own;
  const label = s.uppercase ? item.text.toUpperCase() : item.text;
  const base = {
    fontFamily: fontFamily(s, label),
    fontSize: size,
    lineHeight: size * (hasDevanagari(label) ? 1.5 : 1.2),
    letterSpacing: (s.letterSpacing * canvas.w) / 360,
    textAlign: s.align,
  } as const;
  const stroke = size * 0.08;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: canvas.w * 0.05 + t.x * canvas.w, width: canvas.w * 0.9, top: canvas.h / 2 + t.y * canvas.h, opacity: t.opacity, alignItems: s.align === 'left' ? 'flex-start' : s.align === 'right' ? 'flex-end' : 'center', transform: [{ translateY: '-50%' }, { scale: t.scale / own }, { rotate: `${t.rotation}deg` }, { skewX: s.italic ? '-10deg' : '0deg' }] }}>
      <Pressable onPress={onPress} style={{ backgroundColor: s.background ?? 'transparent', paddingHorizontal: size * 0.25, paddingVertical: size * 0.12, borderRadius: size * 0.2, borderWidth: 1, borderStyle: 'dashed', borderColor: selected ? SELECT : 'transparent' }}>
        {s.strokeColor &&
          STROKE_DIRECTIONS.map(([x, y], i) => (
            <Text key={i} style={[base, { position: 'absolute', left: size * 0.25 + x * stroke, right: size * 0.25 - x * stroke, top: size * 0.12 + y * stroke, color: s.strokeColor! }]}>
              {label}
            </Text>
          ))}
        <Text style={[base, { color: s.color }, s.shadow && { textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: size * 0.15, textShadowOffset: { width: 0, height: size * 0.04 } }]}>{label}</Text>
      </Pressable>
    </View>
  );
}

function CaptionLayer({ caption, style, time, canvas, selected, onPress }: { caption: Caption; style: CaptionStyle; time: number; canvas: CanvasSize; selected: boolean; onPress: () => void }) {
  const local = time - caption.start;
  const source = caption.words ?? [{ t0: 0, t1: caption.duration, text: caption.text }];
  const words: Word[] = source.map((w) => ({ t0: w.t0, t1: w.t1, speaker: 'A', text: { roman: w.text, devanagari: w.text }, emphasis: 'emphasis' in w ? w.emphasis : false }));
  const active = caption.words ? source.findIndex((w) => local >= w.t0 && local < w.t1) : -1;
  return (
    <Pressable onPress={onPress} style={{ position: 'absolute', left: canvas.w * 0.05, width: canvas.w * 0.9, top: style.y * canvas.h, transform: [{ translateY: '-50%' }], borderWidth: 1, borderStyle: 'dashed', borderColor: selected ? SELECT : 'transparent' }}>
      <CaptionLine words={words} script={hasDevanagari(caption.text) ? 'devanagari' : 'roman'} template={style.template} fontSize={(style.size * canvas.w) / 360} activeIndex={active >= 0 ? active : undefined} />
    </Pressable>
  );
}

/**
 * Draws one frame of an Edit: background, main track (two layers mid-transition),
 * overlays, canvas effects, then text and captions. Dragging, pinching or twisting
 * on the canvas moves whatever is selected.
 */
export function EditCanvas({
  edit,
  time,
  playing,
  players,
  slotSegs,
  canvas,
  selection,
  onSelect,
  onTransform,
}: {
  edit: Edit;
  time: number;
  playing: boolean;
  players: VideoPlayer[];
  slotSegs: (string | null)[];
  canvas: CanvasSize;
  selection: Selection;
  onSelect: (s: Selection) => void;
  /** Commit a canvas gesture on the selected item. */
  onTransform: (change: (t: Transform) => Transform) => void;
}) {
  const [nudge, setNudge] = useState<Nudge>(NO_NUDGE);
  const movable = selection !== null && (selection.track === 'main' || selection.track === 'overlays' || selection.track === 'texts');
  // Pan, pinch and twist can run together. They share one nudge, committed once when the last finger lifts.
  const [tracker] = useState(() => new NudgeTracker());
  const begin = () => tracker.begin();
  const update = (patch: Partial<Nudge>) => setNudge(tracker.update(patch));
  const end = () => {
    const n = tracker.end();
    if (!n) return;
    setNudge(NO_NUDGE);
    if (n.dx || n.dy || n.scale !== 1 || n.rotation) onTransform((t) => nudged(t, n, canvas));
  };
  const pan = Gesture.Pan()
    .runOnJS(true)
    .enabled(movable)
    .minDistance(4)
    .maxPointers(1)
    .onStart(begin)
    .onChange((e) => update({ dx: e.translationX, dy: e.translationY }))
    .onEnd(end);
  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .enabled(movable)
    .onStart(begin)
    .onChange((e) => update({ scale: e.scale }))
    .onEnd(end);
  const twist = Gesture.Rotation()
    .runOnJS(true)
    .enabled(movable)
    .onStart(begin)
    .onChange((e) => update({ rotation: (e.rotation * 180) / Math.PI }))
    .onEnd(end);

  const frame = mainFrameAt(edit, time);
  const starts = segmentStarts(edit);
  const mix = frame?.b ? transitionAt(frame.transition.type, frame.progress) : null;
  const fx = combineEffects(activeAt(edit.effects, time).map((e) => effectAt(e.type, time - e.start, e.duration)));
  const liveFor = (track: 'main' | 'overlays' | 'texts', id: string) => (selection?.track === track && selection.id === id ? nudge : null);

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pan, pinch, twist)}>
      <View style={{ width: canvas.w, height: canvas.h, overflow: 'hidden', backgroundColor: edit.background.type === 'color' ? edit.background.color : '#101014' }}>
        <Pressable style={fill} onPress={() => onSelect(null)} />
        <View pointerEvents="box-none" style={[fill, { transform: [{ translateX: fx.x * canvas.w }, { translateY: fx.y * canvas.h }, { scale: fx.scale }] }]}>
          {slotSegs.map((segId, k) => {
            const index = segId ? edit.main.findIndex((s) => s.id === segId) : -1;
            const segment = edit.main[index];
            const asset = segment && edit.assets[segment.assetId];
            if (!segment || !asset) return null;
            const incoming = frame?.b?.segment.id === segId;
            const layer = mix ? (incoming ? mix.b : mix.a) : SHOWN;
            return (
              <MainLayer
                key={k}
                segment={segment}
                asset={asset}
                player={players[k]}
                offset={Math.min(Math.max(time - starts[index], 0), segmentDuration(segment))}
                layer={layer}
                above={incoming}
                canvas={canvas}
                nudge={liveFor('main', segment.id)}
                selected={selection?.track === 'main' && selection.id === segment.id}
                onPress={() => onSelect({ track: 'main', id: segment.id })}
              />
            );
          })}
          {mix?.wash && <View pointerEvents="none" style={[fill, { backgroundColor: mix.wash.color, opacity: mix.wash.opacity, zIndex: 2 }]} />}
          <View pointerEvents="box-none" style={[fill, { zIndex: 3 }]}>
            {edit.overlays
              .filter((o) => time >= o.start - 1 && time < o.start + o.duration)
              .map((o) => (
                <OverlayLayer
                  key={o.id}
                  overlay={o}
                  asset={o.assetId ? edit.assets[o.assetId] : undefined}
                  time={time}
                  playing={playing}
                  canvas={canvas}
                  nudge={liveFor('overlays', o.id)}
                  selected={selection?.track === 'overlays' && selection.id === o.id}
                  onPress={() => onSelect({ track: 'overlays', id: o.id })}
                />
              ))}
          </View>
        </View>
        {fx.blur > 0 && <BlurView pointerEvents="none" intensity={fx.blur * 45} style={fill} />}
        {fx.flash > 0 && <View pointerEvents="none" style={[fill, { backgroundColor: colors.white, opacity: fx.flash }]} />}
        {fx.dim > 0 && <View pointerEvents="none" style={[fill, { backgroundColor: colors.black, opacity: fx.dim }]} />}
        {fx.bars > 0 && (
          <>
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: fx.bars * canvas.h, backgroundColor: '#000' }} />
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: fx.bars * canvas.h, backgroundColor: '#000' }} />
          </>
        )}
        {activeAt(edit.texts, time).map((t) => (
          <TextLayer key={t.id} item={t} time={time} canvas={canvas} nudge={liveFor('texts', t.id)} selected={selection?.track === 'texts' && selection.id === t.id} onPress={() => onSelect({ track: 'texts', id: t.id })} />
        ))}
        {activeAt(edit.captions, time).map((c) => (
          <CaptionLayer key={c.id} caption={c} style={edit.captionStyle} time={time} canvas={canvas} selected={selection?.track === 'captions' && selection.id === c.id} onPress={() => onSelect({ track: 'captions', id: c.id })} />
        ))}
      </View>
    </GestureDetector>
  );
}
