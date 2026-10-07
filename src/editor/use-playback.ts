import { useVideoPlayer, type VideoPlayer } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { fadeGain } from '@/engine/animate';
import { offsetAt, speedAt } from '@/engine/speed';
import { locate, mainFrameAt, segmentDuration, totalDuration, type Edit, type Location } from '@/engine/timeline';

/**
 * Preview clock for an Edit.
 *
 * A JavaScript clock is the master. Two video players are its slaves: one shows the
 * current main-track segment, the other is preloaded with the next one so that cuts
 * are gapless and both can run during a transition. Each tick the players are nudged
 * to where the clock says they should be. Overlay videos and audio clips slave to the
 * same clock in their own components.
 */

type Slot = { segId: string | null; assetId: string | null; ready: boolean; /** False until the loaded file has been moved to its frame once. */ placed: boolean; playing: boolean; rate: number; volume: number; muted: boolean };
const newSlot = (): Slot => ({ segId: null, assetId: null, ready: false, placed: false, playing: false, rate: 1, volume: 1, muted: false });

type Wanted = { loc: Location; gain: number; active: boolean };

function drive(player: VideoPlayer, slot: Slot, want: Wanted | null, edit: Edit, playing: boolean, onReady: () => void) {
  if (!want) {
    // The slot keeps its clip (and the canvas keeps its video view) until something else needs it.
    if (slot.playing) player.pause();
    slot.playing = false;
    return;
  }
  const seg = want.loc.segment;
  const asset = edit.assets[seg.assetId];
  slot.segId = seg.id;
  if (!asset || asset.kind !== 'video' || asset.placeholder) {
    if (slot.playing) player.pause();
    slot.playing = false;
    return;
  }
  if (slot.assetId !== asset.id) {
    slot.assetId = asset.id;
    slot.ready = false;
    slot.placed = false;
    slot.playing = false;
    player
      .replaceAsync(asset.uri)
      .then(() => {
        if (slot.assetId !== asset.id) return;
        slot.ready = true;
        // Nothing else moves a paused player to its frame once the file has loaded.
        onReady();
      })
      .catch(() => {
        // Forget the failed load so the next seek tries again.
        if (slot.assetId === asset.id) slot.assetId = null;
      });
    return;
  }
  if (!slot.ready) return;
  const shouldPlay = playing && want.active;
  const target = want.active ? want.loc.sourceTime : seg.in;
  // While playing, only correct real drift; while paused, follow the playhead exactly.
  // On a speed curve the rate follows the curve as the clip plays.
  const rate = Math.min(16, Math.max(0.1, speedAt(seg, target)));
  const tolerance = shouldPlay ? 0.3 * Math.max(1, rate) : 0.03;
  if (!slot.placed) {
    slot.placed = true;
    if (Platform.OS === 'android' && !shouldPlay) {
      // Android draws nothing for a paused player until a seek really moves it, so a freshly
      // loaded file is stepped just past its frame, then brought back by the next pass.
      player.currentTime = target + 0.08;
      setTimeout(onReady, 150);
      return;
    }
  }
  if (Math.abs(player.currentTime - target) > tolerance) player.currentTime = target;
  if (Math.abs(slot.rate - rate) > 0.02) {
    player.playbackRate = rate;
    slot.rate = rate;
  }
  const volume = seg.volume * want.gain * fadeGain(seg.fadeIn, seg.fadeOut, want.loc.offset, segmentDuration(seg));
  if (Math.abs(slot.volume - volume) > 0.01) {
    player.volume = volume;
    slot.volume = volume;
  }
  const muted = seg.muted || !want.active;
  if (slot.muted !== muted) {
    player.muted = muted;
    slot.muted = muted;
  }
  if (slot.playing !== shouldPlay) {
    if (shouldPlay) player.play();
    else player.pause();
    slot.playing = shouldPlay;
  }
}

/**
 * Point the two players at what the main track needs at `t`. Returns the segment each slot holds,
 * shown or preloaded: the canvas keeps a video view mounted for both, because Android draws
 * nothing in a view that is created at the moment of a cut.
 */
function sync(players: VideoPlayer[], slots: Slot[], edit: Edit, t: number, playing: boolean, onReady: () => void): (string | null)[] {
  const frame = mainFrameAt(edit, t);
  const wanted: Wanted[] = [];
  if (frame?.b) {
    wanted.push({ loc: frame.a, gain: 1 - frame.progress, active: true }, { loc: frame.b, gain: frame.progress, active: true });
  } else if (frame) {
    wanted.push({ loc: frame.a, gain: 1, active: true });
    const next = edit.main[frame.a.index + 1];
    if (next) wanted.push({ loc: { index: frame.a.index + 1, segment: next, start: 0, offset: 0, sourceTime: next.in }, gain: 0, active: false });
  }
  const assign: (Wanted | null)[] = [null, null];
  const homeless: Wanted[] = [];
  for (const w of wanted) {
    const k = slots.findIndex((s, i) => s.segId === w.loc.segment.id && !assign[i]);
    if (k >= 0) assign[k] = w;
    else homeless.push(w);
  }
  for (const w of homeless) {
    const k = assign.findIndex((a) => !a);
    if (k >= 0) assign[k] = w;
  }
  assign.forEach((w, k) => drive(players[k], slots[k], w, edit, playing, onReady));
  return slots.map((s) => s.segId);
}

/** Where the clock should be according to the player showing the current segment, if it is running. */
function playerTime(player: VideoPlayer, slot: Slot, loc: Location) {
  if (!slot.ready || !slot.playing || !player.playing) return null;
  return loc.start + offsetAt(loc.segment, player.currentTime);
}

function setup(player: VideoPlayer) {
  player.timeUpdateEventInterval = 0;
}

export function usePlayback(getEdit: () => Edit | undefined) {
  const p0 = useVideoPlayer(null, setup);
  const p1 = useVideoPlayer(null, setup);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [slotSegs, setSlotSegs] = useState<(string | null)[]>([null, null]);
  const state = useRef({ time: 0, playing: false, raf: 0, last: 0, frame: 0, slots: [newSlot(), newSlot()], shown: [null, null] as (string | null)[] });

  function resync() {
    const edit = getEdit();
    if (edit) apply(edit, state.current.time, state.current.playing);
  }

  function apply(edit: Edit, t: number, play: boolean) {
    const st = state.current;
    st.time = t;
    st.playing = play;
    const shown = sync([p0, p1], st.slots, edit, t, play, resync);
    if (shown[0] !== st.shown[0] || shown[1] !== st.shown[1]) {
      st.shown = shown;
      setSlotSegs(shown);
    }
  }

  function tick(now: number) {
    const st = state.current;
    const edit = getEdit();
    if (!edit || !st.playing) return;
    const dt = Math.min(0.1, (now - st.last) / 1000);
    st.last = now;
    let t = st.time + dt;
    // Pull the clock gently towards the video so captions and text stay in step with the picture.
    const here = locate(edit, st.time);
    const k = here ? st.slots.findIndex((s) => s.segId === here.segment.id) : -1;
    const seen = here && k >= 0 ? playerTime(k === 0 ? p0 : p1, st.slots[k], here) : null;
    if (seen !== null && Math.abs(seen - t) < 0.5) t += Math.min(0.02, Math.max(-0.02, (seen - t) * 0.1));
    const total = totalDuration(edit);
    const ended = t >= total;
    apply(edit, ended ? total : t, !ended);
    // Rendering every other frame keeps the editor responsive on slower phones.
    if (ended || st.frame++ % 2 === 0) setTime(st.time);
    if (ended) setPlaying(false);
    else st.raf = requestAnimationFrame(tick);
  }

  useEffect(() => {
    const st = state.current;
    return () => cancelAnimationFrame(st.raf);
  }, []);

  function stop() {
    cancelAnimationFrame(state.current.raf);
    setPlaying(false);
  }

  return {
    players: [p0, p1],
    slotSegs,
    time,
    playing,
    /** The playhead right now, for code that runs long after a render. */
    getTime: () => state.current.time,
    /** Move the playhead and pause. Pass the edit explicitly right after changing it. */
    seek(t: number, edit = getEdit()) {
      if (!edit) return;
      stop();
      const clamped = Math.min(Math.max(t, 0), totalDuration(edit));
      apply(edit, clamped, false);
      setTime(clamped);
    },
    pause() {
      const edit = getEdit();
      stop();
      if (edit) apply(edit, state.current.time, false);
    },
    toggle() {
      const edit = getEdit();
      const st = state.current;
      if (!edit) return;
      if (st.playing) {
        stop();
        apply(edit, st.time, false);
        return;
      }
      const from = st.time >= totalDuration(edit) - 0.05 ? 0 : st.time;
      apply(edit, from, true);
      setTime(from);
      setPlaying(true);
      st.last = performance.now();
      st.raf = requestAnimationFrame(tick);
    },
  };
}

export type Playback = ReturnType<typeof usePlayback>;
