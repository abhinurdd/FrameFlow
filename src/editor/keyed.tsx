import { AlphaType, Canvas, ColorType, Fill, ImageShader, Shader, Skia, useCanvasRef, useImage, useVideo, type SkImage } from '@shopify/react-native-skia';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View, type GestureResponderEvent } from 'react-native';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

import { CHROMA_SHADER, chromaRange, hexToRgb, rgbToHex, type Chroma } from '@/engine/chroma';
import { colors } from '@/ui/theme';

const effect = Skia.RuntimeEffect.Make(CHROMA_SHADER);

function uniforms(chroma: Chroma) {
  const { near, far } = chromaRange(chroma);
  return { keyColor: hexToRgb(chroma.color), keyRange: [near, far], keySpill: chroma.spill };
}

/** Called with the colour under the finger once it lifts. */
export type Pick = (color: string) => void;

const LOUPE = 56;

/**
 * Draws a picture through the chroma shader. While a colour is being picked the
 * shader is bypassed, so the finger samples the untouched picture.
 */
function Keyed({ image, chroma, width, height, pick, children }: { image: SkImage | null | SharedValue<SkImage | null>; chroma: Chroma; width: number; height: number; pick?: Pick; children?: ReactNode }) {
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

  const picture = <ImageShader image={image} fit="cover" rect={{ x: 0, y: 0, width, height }} />;
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
        <Fill>{pick || !effect ? picture : <Shader source={effect} uniforms={uniforms(chroma)}>{picture}</Shader>}</Fill>
      </Canvas>
      {children}
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

/**
 * A green-screen video, drawn frame by frame through the chroma shader. Unlike the
 * ordinary player it is decoded by Skia, which is what lets a shader see its pixels.
 */
export function KeyedVideo({
  uri,
  chroma,
  width,
  height,
  target,
  playing,
  volume,
  rate = 1,
  pick,
}: {
  uri: string;
  chroma: Chroma;
  width: number;
  height: number;
  /** Source time to show, in seconds. */
  target: number;
  playing: boolean;
  volume: number;
  /** Playback speed. Skia plays at 1x only, so any other speed is shown by seeking. */
  rate?: number;
  pick?: Pick;
}) {
  const paused = useSharedValue(true);
  const seek = useSharedValue<number | null>(null);
  const level = useSharedValue(volume);
  const { currentFrame, currentTime, duration, rotation } = useVideo(uri, { paused, seek, volume: level, looping: false });
  const running = playing && Math.abs(rate - 1) < 0.01;

  // Keep the video in step with the editor clock: only jump when it has really drifted.
  // `duration` is 0 until the file has loaded, so the first seek is repeated once it has.
  useEffect(() => {
    paused.value = !running;
    level.value = volume;
    // Never exactly the start: a paused video only hands over a frame when a seek moves it.
    const want = Math.max(target, 0.1) * 1000;
    if (Math.abs(currentTime.value - want) > (running ? 350 : 40)) seek.value = want;
  }, [paused, seek, level, currentTime, duration, target, running, volume]);

  // Skia hands over frames as stored. A phone's portrait video is stored on its side.
  const turned = rotation === 90 || rotation === 270;
  if (!turned && !rotation) return <Keyed image={currentFrame} chroma={chroma} width={width} height={height} pick={pick} />;
  const w = turned ? height : width;
  const h = turned ? width : height;
  return (
    <View style={{ width, height }}>
      <View style={{ position: 'absolute', left: (width - w) / 2, top: (height - h) / 2, width: w, height: h, transform: [{ rotate: `${rotation}deg` }] }}>
        <Keyed image={currentFrame} chroma={chroma} width={w} height={h} pick={pick} />
      </View>
    </View>
  );
}

export function KeyedImage({ uri, chroma, width, height, pick }: { uri: string; chroma: Chroma; width: number; height: number; pick?: Pick }) {
  const image = useImage(uri);
  if (!image) return null;
  return <Keyed image={image} chroma={chroma} width={width} height={height} pick={pick} />;
}
