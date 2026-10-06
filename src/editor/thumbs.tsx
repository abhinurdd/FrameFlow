import { Image } from 'expo-image';
import { createVideoPlayer, type VideoPlayer, type VideoThumbnail } from 'expo-video';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import type { Asset, Segment } from '@/engine/timeline';
import { colors } from '@/ui/theme';

const cache = new Map<string, Promise<VideoThumbnail[]>>();

/** Thumbnails can only be read once the player has loaded the file. */
function whenReady(player: VideoPlayer) {
  return new Promise<void>((resolve, reject) => {
    if (player.status === 'readyToPlay') return resolve();
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'loading' || status === 'idle') return;
      sub.remove();
      if (status === 'readyToPlay') resolve();
      else reject(new Error('Video failed to load'));
    });
  });
}

function loadThumbs(asset: Asset) {
  let job = cache.get(asset.uri);
  if (!job) {
    const count = Math.min(24, Math.max(4, Math.ceil(asset.duration / 2)));
    const times = Array.from({ length: count }, (_, i) => ((i + 0.5) * asset.duration) / count);
    const player = createVideoPlayer(asset.uri);
    job = whenReady(player)
      .then(() => player.generateThumbnailsAsync(times, { maxHeight: 96 }))
      .catch(() => [])
      .finally(() => player.release());
    cache.set(asset.uri, job);
  }
  return job;
}

/** Filmstrip for one segment: frames from its own part of the source, at the current zoom. */
export function SegmentStrip({ asset, segment, width, height }: { asset: Asset; segment: Segment; width: number; height: number }) {
  const [thumbs, setThumbs] = useState<VideoThumbnail[]>([]);
  useEffect(() => {
    let alive = true;
    if (asset.kind !== 'video') return;
    loadThumbs(asset).then((t) => alive && setThumbs(t));
    return () => {
      alive = false;
    };
  }, [asset]);

  const tile = Math.min(92, Math.max(40, height * ((asset.width || 16) / (asset.height || 9))));
  const count = Math.max(1, Math.ceil(width / tile));
  if (asset.kind === 'image') {
    return (
      <View style={{ width, height, flexDirection: 'row', overflow: 'hidden', backgroundColor: colors.surface2 }}>
        {Array.from({ length: count }, (_, k) => (
          <Image key={k} source={{ uri: asset.uri }} style={{ width: width / count, height }} contentFit="cover" />
        ))}
      </View>
    );
  }
  return (
    <View style={{ width, height, flexDirection: 'row', overflow: 'hidden', backgroundColor: colors.surface2 }}>
      {thumbs.length > 0 &&
        Array.from({ length: count }, (_, k) => {
          const sourceTime = segment.in + ((k + 0.5) / count) * (segment.out - segment.in);
          const index = Math.min(thumbs.length - 1, Math.floor((sourceTime / asset.duration) * thumbs.length));
          return <Image key={k} source={thumbs[index]} style={{ width: width / count, height }} contentFit="cover" />;
        })}
    </View>
  );
}
