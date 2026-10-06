import { setAudioModeAsync, useAudioPlayer, type AudioPlayer } from 'expo-audio';
import { useEffect } from 'react';

import { fadeGain } from '@/engine/animate';
import { audioDuration, type AudioItem, type Edit } from '@/engine/timeline';

function slave(player: AudioPlayer, target: number, playing: boolean, volume: number) {
  if (!player.isLoaded) return;
  if (Math.abs(player.currentTime - target) > (playing ? 0.3 : 0.05)) player.seekTo(target);
  if (Math.abs(player.volume - volume) > 0.01) player.volume = volume;
  if (playing !== player.playing) {
    if (playing) player.play();
    else player.pause();
  }
}

function AudioClip({ item, uri, time, playing }: { item: AudioItem; uri: string; time: number; playing: boolean }) {
  const player = useAudioPlayer(uri);
  const local = time - item.start;
  const length = audioDuration(item);
  const active = local >= 0 && local < length;
  const volume = item.muted || !active ? 0 : item.volume * fadeGain(item.fadeIn, item.fadeOut, local, length);
  useEffect(() => {
    slave(player, item.in + Math.max(0, local), playing && active, volume);
  }, [player, item.in, local, playing, active, volume]);
  return null;
}

/** Plays the edit's audio tracks in step with the editor clock. Renders nothing. */
export function AudioTracks({ edit, time, playing }: { edit: Edit; time: number; playing: boolean }) {
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);
  return (
    <>
      {edit.audio
        // Loaded a little ahead of time so playback starts on cue.
        .filter((a) => time >= a.start - 2 && time < a.start + audioDuration(a))
        .map((a) => {
          const asset = edit.assets[a.assetId];
          return asset ? <AudioClip key={a.id} item={a} uri={asset.uri} time={time} playing={playing} /> : null;
        })}
    </>
  );
}
