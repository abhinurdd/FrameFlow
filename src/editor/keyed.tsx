import { AlphaType, Canvas, ColorType, Group, ImageShader, RadialGradient, Rect, Shader, Skia, useCanvasRef, useImage, useVideo, vec, type SkImage } from '@shopify/react-native-skia';
import { useEffect, useRef, useState } from 'react';
import { Platform, View, type GestureResponderEvent } from 'react-native';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

import { CHROMA_SHADER, chromaRange, hexToRgb, rgbToHex, type Chroma } from '@/engine/chroma';
import { saturationLayer, type CompiledLook, type LayerMode } from '@/engine/looks';
import { colors } from '@/ui/theme';

const effect = Skia.RuntimeEffect.Make(CHROMA_SHADER);

function uniforms(chroma: Chroma) {
  const { near, far } = chromaRange(chroma);
  return { keyColor: hexToRgb(chroma.color), keyRange: [near, far], keySpill: chroma.spill };
}

const SKIA_BLEND = { normal: 'srcOver', multiply: 'multiply', screen: 'screen', 'soft-light': 'softLight', 'color-dodge': 'colorDodge', 'color-burn': 'colorBurn', saturation: 'saturation' } as const satisfies Record<LayerMode, string>;

/** What a Skia-drawn picture can have done to it beyond being shown. */
export type Treatment = {
  /** Green screen. */
  chroma?: Chroma | null;
  /** Mask outline as an SVG path in the picture's own box. */
  clip?: string | null;
  /** Degrees the picture is stored turned by: a phone's portrait video is stored on its side. */
  turn?: number;
  /** Filter and adjust layers, drawn inside the mask. */
  look?: CompiledLook | null;
};

/**
 * Whether Skia can show video here. Not on Android yet: in Expo Go opening a video
 * aborts the whole app, and in a development build (which needs Android 8.0 as its
 * minimum for Skia's video code to be compiled in at all) the video opens but no frame
 * is ever drawn, at least on the emulator. So there a video is never handed to Skia:
 * the plain player shows the clip untreated and the treatment appears in the export.
 */
export const SKIA_VIDEO = Platform.OS !== 'android';

/** Called with the colour under the finger once it lifts. */
export type Pick = (color: string) => void;

const LOUPE = 56;

/** Any picture Skia can draw: a still, or a video's current frame. */
export type Frame = SkImage | null | SharedValue<SkImage | null>;

/**
 * One treated picture as Skia nodes, for use inside any canvas: keyed, cut to its
 * mask and graded. `raw` shows it untouched.
 */
export function Treated({ image, chroma, clip, turn = 0, look, width, height, raw }: Treatment & { image: Frame; width: number; height: number; raw?: boolean }) {
  // The stored picture is drawn in its own box, then turned upright into ours.
  const quarter = turn % 180 !== 0;
  const iw = quarter ? height : width;
  const ih = quarter ? width : height;
  const picture = <ImageShader image={image} fit="cover" rect={{ x: 0, y: 0, width: iw, height: ih }} />;
  const keyed = !raw && chroma && effect ? chroma : null;
  const outline = !raw && clip ? Skia.Path.MakeFromSVGString(clip) : null;
  const sat = look && !raw ? saturationLayer(look.saturation) : null;
  const layers = look && !raw ? (sat ? [sat, ...look.layers] : look.layers) : [];
  return (
    <Group clip={outline ?? undefined}>
      <Group transform={turn ? [{ translateX: width / 2 }, { translateY: height / 2 }, { rotate: (turn * Math.PI) / 180 }, { translateX: -iw / 2 }, { translateY: -ih / 2 }] : undefined}>
        <Rect x={0} y={0} width={iw} height={ih}>
          {keyed && effect ? <Shader source={effect} uniforms={uniforms(keyed)}>{picture}</Shader> : picture}
        </Rect>
      </Group>
      {layers.map((l, i) => (
        <Rect key={i} x={0} y={0} width={width} height={height} color={l.color} opacity={l.opacity} blendMode={SKIA_BLEND[l.mode]} />
      ))}
      {look && !raw && look.vignette > 0 && (
        <Rect x={0} y={0} width={width} height={height}>
          <RadialGradient c={vec(width / 2, height / 2)} r={Math.hypot(width, height) / 2} colors={['#00000000', '#00000000', `rgba(0,0,0,${0.8 * look.vignette})`]} positions={[0, 0.45, 1]} />
        </Rect>
      )}
    </Group>
  );
}

/**
 * A video decoded by Skia and kept in step with the editor clock. Unlike the ordinary
 * player this hands over each frame as an image, which is what lets shaders see it.
 */
export function useSkiaVideo(uri: string, target: number, playing: boolean, volume: number, rate = 1) {
  const paused = useSharedValue(true);
  const seek = useSharedValue<number | null>(null);
  const level = useSharedValue(volume);
  const { currentFrame, currentTime, duration, rotation } = useVideo(uri, { paused, seek, volume: level, looping: false });
  // Skia plays at 1x only, so any other speed is shown by seeking.
  const running = playing && Math.abs(rate - 1) < 0.01;

  // Only jump when the video has really drifted. `duration` is 0 until the file has
  // loaded, so the first seek waits for that.
  useEffect(() => {
    paused.value = !running;
    level.value = volume;
    // Never exactly the start: a paused video only hands over a frame when a seek moves it.
    const want = Math.max(target, 0.1) * 1000;
    if (duration > 0 && Math.abs(currentTime.value - want) > (running ? 350 : 40)) seek.value = want;
  }, [paused, seek, level, currentTime, duration, target, running, volume]);

  return { frame: currentFrame, turn: rotation as number };
}

/** A treated picture in its own canvas, with the eyedropper. */
function Keyed({ image, width, height, pick, ...treatment }: Treatment & { image: Frame; width: number; height: number; pick?: Pick }) {
  const canvas = useCanvasRef();
  const shot = useRef<SkImage | null>(null);
  const [probe, setProbe] = useState<{ x: number; y: number; color: string } | null>(null);

  const sample = (e: GestureResponderEvent) => {
    const snap = shot.current;
    if (!snap) return null;
    const x = Math.min(width - 1, Math.max(0, e.nativeEvent.locationX));
    const y = Math.min(height - 1, Math.max(0, e.nativeEvent.locationY));
    const k = snap.width() / width;
    const px = snap.readPixels(Math.floor(x * k), Math.floor(y * k), { width: 1, height: 1, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul });
    if (!px) return null;
    const next = { x, y, color: rgbToHex(px[0], px[1], px[2]) };
    setProbe(next);
    return next;
  };
  const start = (e: GestureResponderEvent) => {
    // One snapshot per touch: the picture is paused while picking. It is copied off the
    // graphics card, where its pixels cannot be read.
    const at = { nativeEvent: { locationX: e.nativeEvent.locationX, locationY: e.nativeEvent.locationY } } as GestureResponderEvent;
    canvas.current
      ?.makeImageSnapshotAsync()
      .then((image) => {
        shot.current = image.makeNonTextureImage();
        sample(at);
      })
      .catch(() => {});
  };
  const finish = (e: GestureResponderEvent) => {
    const hit = sample(e) ?? probe;
    shot.current = null;
    setProbe(null);
    if (hit) pick?.(hit.color);
  };

  return (
    <View
      style={{ width, height }}
      pointerEvents={pick ? 'auto' : 'none'}
      onStartShouldSetResponder={() => !!pick}
      onResponderTerminationRequest={() => false}
      onResponderGrant={start}
      onResponderMove={sample}
      onResponderRelease={finish}
      onResponderTerminate={() => setProbe(null)}>
      <Canvas ref={canvas} style={{ width, height }} pointerEvents="none">
        <Treated image={image} width={width} height={height} raw={!!pick} {...treatment} />
      </Canvas>
      {probe && (
        // Sits above the finger so the colour under it stays visible.
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: probe.x - LOUPE / 2, top: Math.max(0, probe.y - LOUPE - 24), width: LOUPE, height: LOUPE, borderRadius: LOUPE / 2, backgroundColor: probe.color, borderWidth: 3, borderColor: colors.white }}
        />
      )}
    </View>
  );
}

export function KeyedVideo({
  uri,
  width,
  height,
  target,
  playing,
  volume,
  rate = 1,
  pick,
  ...treatment
}: Treatment & {
  uri: string;
  width: number;
  height: number;
  /** Source time to show, in seconds. */
  target: number;
  playing: boolean;
  volume: number;
  rate?: number;
  pick?: Pick;
}) {
  const { frame, turn } = useSkiaVideo(uri, target, playing, volume, rate);
  return <Keyed image={frame} width={width} height={height} pick={pick} {...treatment} turn={turn} />;
}

export function KeyedImage({ uri, width, height, pick, ...treatment }: Treatment & { uri: string; width: number; height: number; pick?: Pick }) {
  const image = useImage(uri);
  if (!image) return null;
  return <Keyed image={image} width={width} height={height} pick={pick} {...treatment} />;
}
