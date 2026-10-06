import { AlphaType, Canvas, ColorType, Group, ImageShader, Paint, RadialGradient, Rect, RuntimeShader, Shader, Skia, useCanvasRef, useImage, useVideo, vec, type SkImage } from '@shopify/react-native-skia';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View, type GestureResponderEvent } from 'react-native';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

import { CHROMA_SHADER, chromaRange, hexToRgb, rgbToHex, type Chroma } from '@/engine/chroma';
import { saturationLayer, type CompiledLook, type LayerMode } from '@/engine/looks';
import { colors } from '@/ui/theme';

const effect = Skia.RuntimeEffect.Make(CHROMA_SHADER);

function uniforms(chroma: Chroma) {
  const { near, far } = chromaRange(chroma);
  return { keyColor: hexToRgb(chroma.color), keyRange: [near, far], keySpill: chroma.spill };
}

/**
 * A Skia view cannot be blended with the video under it, only laid over it. So the
 * two blends that matter for video are turned into transparency instead: screen lets
 * the backdrop through where the picture is dark, multiply where it is light. Exact
 * for greys; export does the true blend.
 */
const mixer = Skia.RuntimeEffect.Make(`
uniform shader image;
uniform float multiply;

vec3 encoded(vec3 c) {
  vec3 lin = clamp(toLinearSrgb(c), 0.0, 1.0);
  return mix(lin * 12.92, 1.055 * pow(lin, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, lin));
}

half4 main(vec2 xy) {
  vec4 px = image.eval(xy);
  vec3 c = encoded(px.a > 0.0 ? px.rgb / px.a : px.rgb);
  float peak = max(c.r, max(c.g, c.b));
  if (multiply > 0.5) return half4(0.0, 0.0, 0.0, (1.0 - peak) * px.a);
  return half4(px.rgb, peak * px.a);
}`);

const SKIA_BLEND = { normal: 'srcOver', multiply: 'multiply', screen: 'screen', 'soft-light': 'softLight', 'color-dodge': 'colorDodge', 'color-burn': 'colorBurn', saturation: 'saturation' } as const satisfies Record<LayerMode, string>;

/** What a Skia-drawn picture can have done to it beyond being shown. */
export type Treatment = {
  /** Green screen. */
  chroma?: Chroma | null;
  /** Mask outline as an SVG path in the picture's own box. */
  clip?: string | null;
  /** Degrees the canvas itself is turned by, when the video is stored on its side. */
  turn?: number;
  /** How the picture mixes with what is under it. */
  blend?: 'normal' | 'screen' | 'multiply';
  /** Filter and adjust layers, drawn inside the mask. */
  look?: CompiledLook | null;
};

/** Called with the colour under the finger once it lifts. */
export type Pick = (color: string) => void;

const LOUPE = 56;

/**
 * Draws a picture with Skia: through the chroma shader, inside a mask, under its
 * look. While a colour is being picked the picture is shown untouched, so the
 * finger samples the original.
 */
function Keyed({ image, chroma, clip, turn = 0, blend, look, width, height, pick, children }: Treatment & { image: SkImage | null | SharedValue<SkImage | null>; width: number; height: number; pick?: Pick; children?: ReactNode }) {
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
  const keyed = !pick && chroma && effect ? chroma : null;
  const outline = !pick && clip ? Skia.Path.MakeFromSVGString(clip) : null;
  if (outline && turn) {
    // The mask is given upright; this canvas is turned, so turn the mask back to meet it.
    const quarter = turn % 180 !== 0;
    const m = Skia.Matrix();
    m.translate(width / 2, height / 2);
    m.rotate((-turn * Math.PI) / 180);
    m.translate(-(quarter ? height : width) / 2, -(quarter ? width : height) / 2);
    outline.transform(m);
  }
  const sat = look && !pick ? saturationLayer(look.saturation) : null;
  const layers = look && !pick ? (sat ? [sat, ...look.layers] : look.layers) : [];
  const mixed =
    !pick && mixer && blend && blend !== 'normal' ? (
      <Paint>
        <RuntimeShader source={mixer} uniforms={{ multiply: blend === 'multiply' ? 1 : 0 }} />
      </Paint>
    ) : undefined;
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
        <Group clip={outline ?? undefined} layer={mixed}>
          <Rect x={0} y={0} width={width} height={height}>
            {keyed && effect ? <Shader source={effect} uniforms={uniforms(keyed)}>{picture}</Shader> : picture}
          </Rect>
          {layers.map((l, i) => (
            <Rect key={i} x={0} y={0} width={width} height={height} color={l.color} opacity={l.opacity} blendMode={SKIA_BLEND[l.mode]} />
          ))}
          {look && !pick && look.vignette > 0 && (
            <Rect x={0} y={0} width={width} height={height}>
              <RadialGradient c={vec(width / 2, height / 2)} r={Math.hypot(width, height) / 2} colors={['#00000000', '#00000000', `rgba(0,0,0,${0.8 * look.vignette})`]} positions={[0, 0.45, 1]} />
            </Rect>
          )}
        </Group>
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
  clip,
  blend,
  look,
  width,
  height,
  target,
  playing,
  volume,
  rate = 1,
  pick,
}: Treatment & {
  uri: string;
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
  if (!turned && !rotation) return <Keyed image={currentFrame} chroma={chroma} clip={clip} blend={blend} look={look} width={width} height={height} pick={pick} />;
  const w = turned ? height : width;
  const h = turned ? width : height;
  return (
    <View style={{ width, height }}>
      <View style={{ position: 'absolute', left: (width - w) / 2, top: (height - h) / 2, width: w, height: h, transform: [{ rotate: `${rotation}deg` }] }}>
        <Keyed image={currentFrame} chroma={chroma} clip={clip} turn={rotation} blend={blend} look={look} width={w} height={h} pick={pick} />
      </View>
    </View>
  );
}

export function KeyedImage({ uri, chroma, clip, blend, look, width, height, pick }: Treatment & { uri: string; width: number; height: number; pick?: Pick }) {
  const image = useImage(uri);
  if (!image) return null;
  return <Keyed image={image} chroma={chroma} clip={clip} blend={blend} look={look} width={width} height={height} pick={pick} />;
}
