import { useEventListener } from 'expo';
import { useVideoPlayer, type VideoPlayer } from 'expo-video';
import { useRef, useState } from 'react';

import { locate, segmentDuration, segmentStarts, totalDuration, type Edit, type Segment } from '@/engine/timeline';

function cue(player: VideoPlayer, segment: Segment, sourceTime: number, play: boolean) {
  player.playbackRate = segment.speed;
  player.volume = segment.volume;
  player.muted = segment.muted;
  player.currentTime = sourceTime;
  if (play) player.play();
  else player.pause();
}

/**
 * Plays an Edit's main track through a single video player by hopping between
 * segments: seek to the segment's in point, apply its speed and volume, and jump to
 * the next segment when the out point is reached. Good enough to preview cuts; frame
 * accurate, gapless playback needs a native compositor.
 */
export function usePlayback(getEdit: () => Edit | undefined) {
  const player = useVideoPlayer(null, (p) => {
    p.timeUpdateEventInterval = 0.05;
  });
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const state = useRef({ index: -1, assetId: '', loading: Promise.resolve(), token: 0, busy: false, wantPlay: false });

  async function load(edit: Edit, at: number, play: boolean) {
    const st = state.current;
    const t = Math.min(Math.max(at, 0), totalDuration(edit));
    const loc = locate(edit, t);
    const token = ++st.token;
    st.wantPlay = play && !!loc;
    setTime(loc ? t : 0);
    setPlaying(st.wantPlay);
    if (!loc) {
      player.pause();
      return;
    }
    st.busy = true;
    st.index = loc.index;
    const asset = edit.assets[loc.segment.assetId];
    if (st.assetId !== asset.id) {
      st.assetId = asset.id;
      st.loading = player.replaceAsync(asset.uri).catch(() => {});
    }
    await st.loading;
    if (token !== st.token) return;
    cue(player, loc.segment, loc.sourceTime, play);
    st.busy = false;
  }

  function advance(edit: Edit) {
    const st = state.current;
    const seg = edit.main[st.index];
    if (!seg) return;
    const end = segmentStarts(edit)[st.index] + segmentDuration(seg);
    if (st.index + 1 < edit.main.length) {
      load(edit, end, true);
    } else {
      player.pause();
      st.wantPlay = false;
      setPlaying(false);
      setTime(end);
    }
  }

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    const st = state.current;
    const edit = getEdit();
    const seg = edit?.main[st.index];
    if (!edit || !seg || st.busy || !st.wantPlay) return;
    if (currentTime >= seg.out - 0.03) advance(edit);
    else setTime(segmentStarts(edit)[st.index] + Math.max(0, currentTime - seg.in) / seg.speed);
  });

  // The source file can end a few frames before its reported duration.
  useEventListener(player, 'playToEnd', () => {
    const edit = getEdit();
    if (edit && state.current.wantPlay && !state.current.busy) advance(edit);
  });

  return {
    player,
    time,
    playing,
    /** Move the playhead. Pass the edit explicitly right after changing it. */
    seek(t: number, edit = getEdit()) {
      if (edit) load(edit, t, false);
    },
    toggle() {
      const edit = getEdit();
      if (!edit) return;
      if (playing) load(edit, time, false);
      else load(edit, time >= totalDuration(edit) - 0.05 ? 0 : time, true);
    },
  };
}
