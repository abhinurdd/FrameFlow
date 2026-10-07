import { Image } from 'expo-image';
import { createVideoPlayer, type VideoPlayer, type VideoThumbnail } from 'expo-video';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';

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

/**
 * Android reads thumbnails from the path exactly as written, without undoing its
 * percent-escapes. Expo Go keeps files in a folder with a literal `%` in its name,
 * so there the first try fails; this one hands over the path already unescaped.
 */
async function escapedPathThumbs(uri: string, times: number[]) {
  if (Platform.OS !== 'android' || !uri.includes('%')) throw new Error('No thumbnails');
  const player = createVideoPlayer(decodeURIComponent(uri));
  try {
    return await player.generateThumbnailsAsync(times, { maxHeight: 96 });
  } finally {
    player.release();
  }
}

function loadThumbs(asset: Asset) {
  let job = cache.get(asset.uri);
  if (!job) {
    // Denser for long files, so a short clip cut from an hour of footage still shows its own frames.
    const count = Math.min(120, Math.max(4, Math.ceil(asset.duration / 2)));
    const times = Array.from({ length: count }, (_, i) => ((i + 0.5) * asset.duration) / count);
    const player = createVideoPlayer(asset.uri);
    job = whenReady(player)
      .then(() => player.generateThumbnailsAsync(times, { maxHeight: 96 }))
      .catch(() => escapedPathThumbs(asset.uri, times))
      .catch(() => [])
      .finally(() => player.release());
    cache.set(asset.uri, job);
  }
  return job;
}

/** Filmstrip for one segment: frames from its own part of the source, at the current zoom. */
export function SegmentStrip({ asset, segment, width, height, from = 0, to = width }: { asset: Asset; segment: Segment; width: number; height: number; /** Only tiles between these x positions are drawn, so an hour-long clip costs no more than a short one. */ from?: number; to?: number }) {
  const [thumbs, setThumbs] = useState<VideoThumbnail[]>([]);
  useEffect(() => {
    let alive = true;
    if (asset.kind !== 'video' || asset.placeholder) return;
    loadThumbs(asset).then((t) => alive && setThumbs(t));
    return () => {
      alive = false;
    };
  }, [asset]);

  const tile = Math.min(92, Math.max(40, height * ((asset.width || 16) / (asset.height || 9))));
  const count = Math.max(1, Math.ceil(width / tile));
  const each = width / count;
  const first = Math.max(0, Math.floor(from / each));
  const last = Math.min(count - 1, Math.floor(to / each));
  const tiles = Array.from({ length: Math.max(0, last - first + 1) }, (_, n) => first + n);
  const still = asset.kind === 'image';
  return (
    <View style={{ width, height, overflow: 'hidden', backgroundColor: colors.surface2 }}>
      {(still || thumbs.length > 0) &&
        tiles.map((k) => {
          const sourceTime = segment.in + ((k + 0.5) / count) * (segment.out - segment.in);
          const index = Math.min(thumbs.length - 1, Math.floor((sourceTime / asset.duration) * thumbs.length));
          return <Image key={k} source={still ? { uri: asset.uri } : thumbs[index]} style={{ position: 'absolute', left: k * each, width: each, height }} contentFit="cover" />;
        })}
    </View>
  );
}
