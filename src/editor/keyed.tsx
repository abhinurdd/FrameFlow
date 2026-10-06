import { Canvas, Fill, ImageShader, Shader, Skia, useImage, useVideo } from '@shopify/react-native-skia';
import { useEffect } from 'react';
import { useSharedValue } from 'react-native-reanimated';

import { CHROMA_SHADER, chromaRange, hexToRgb, type Chroma } from '@/engine/chroma';

const effect = Skia.RuntimeEffect.Make(CHROMA_SHADER);

function uniforms(chroma: Chroma) {
  const { near, far } = chromaRange(chroma);
  return { keyColor: hexToRgb(chroma.color), keyRange: [near, far], keySpill: chroma.spill };
}

/**
 * A green-screen video, drawn frame by frame through the chroma shader. Unlike the
 * ordinary overlay it is decoded by Skia, which is what lets a shader see its pixels.
 */
export function KeyedVideo({ uri, chroma, width, height, target, playing, volume }: { uri: string; chroma: Chroma; width: number; height: number; /** Source time to show, in seconds. */ target: number; playing: boolean; volume: number }) {
  const paused = useSharedValue(true);
  const seek = useSharedValue<number | null>(null);
  const level = useSharedValue(volume);
  const { currentFrame, currentTime, duration } = useVideo(uri, { paused, seek, volume: level, looping: false });

  // Keep the video in step with the editor clock: only jump when it has really drifted.
  // `duration` is 0 until the file has loaded, so the first seek is repeated once it has.
  useEffect(() => {
    paused.value = !playing;
    level.value = volume;
    // Never exactly the start: a paused video only hands over a frame when a seek moves it.
    const want = Math.max(target, 0.1) * 1000;
    if (Math.abs(currentTime.value - want) > (playing ? 350 : 40)) seek.value = want;
  }, [paused, seek, level, currentTime, duration, target, playing, volume]);

  if (!effect) return null;
  return (
    <Canvas style={{ width, height }} pointerEvents="none">
      <Fill>
        <Shader source={effect} uniforms={uniforms(chroma)}>
          <ImageShader image={currentFrame} fit="cover" rect={{ x: 0, y: 0, width, height }} />
        </Shader>
      </Fill>
    </Canvas>
  );
}

export function KeyedImage({ uri, chroma, width, height }: { uri: string; chroma: Chroma; width: number; height: number }) {
  const image = useImage(uri);
  if (!effect || !image) return null;
  return (
    <Canvas style={{ width, height }} pointerEvents="none">
      <Fill>
        <Shader source={effect} uniforms={uniforms(chroma)}>
          <ImageShader image={image} fit="cover" rect={{ x: 0, y: 0, width, height }} />
        </Shader>
      </Fill>
    </Canvas>
  );
}
