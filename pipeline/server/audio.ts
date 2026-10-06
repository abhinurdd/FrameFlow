/**
 * The edit's sound, mixed by one ffmpeg filtergraph: main segments (speed, volume,
 * fades, crossfades over transitions), video overlays and audio items.
 */

import { join } from 'node:path';

import { offsetAt } from '../../src/engine/speed.ts';
import { segmentDuration, segmentStarts, totalDuration, transitionDuration, type Edit } from '../../src/engine/timeline.ts';

import { ffmpeg, sec } from './ff.ts';
import { mediaPath, type Media } from './media.ts';

export const SAMPLE_RATE = 48000;
/** Clips mixed by one ffmpeg process; larger edits are mixed in groups first. */
const GROUP = 48;

export type AudioClip = {
  file: string;
  /** Range of the source, in source seconds. */
  in: number;
  length: number;
  speed: number;
  /** Where it starts on the timeline. */
  start: number;
  /** ffmpeg expression for the gain, in `t` = seconds into the clip on the timeline. */
  gain: string;
};

const num = (v: number) => Number(v.toFixed(6)).toString();

/**
 * The gain of a clip as an ffmpeg expression. The fade part is the engine's
 * `fadeGain` written out: min(clamp(t / fadeIn), clamp((duration - t) / fadeOut)).
 * `rampIn`/`rampOut` are the linear crossfades of a transition, and multiply it.
 */
export function gainExpression(volume: number, fadeIn: number, fadeOut: number, duration: number, rampIn = 0, rampOut = 0, t = 't') {
  const fades: string[] = [];
  if (fadeIn > 0) fades.push(`clip(${t}/${num(fadeIn)},0,1)`);
  if (fadeOut > 0) fades.push(`clip((${num(duration)}-${t})/${num(fadeOut)},0,1)`);
  const parts = [num(volume)];
  if (fades.length === 2) parts.push(`min(${fades[0]},${fades[1]})`);
  else if (fades.length) parts.push(fades[0]);
  if (rampIn > 0) parts.push(`clip(${t}/${num(rampIn)},0,1)`);
  if (rampOut > 0) parts.push(`clip((${num(duration)}-${t})/${num(rampOut)},0,1)`);
  return parts.join('*');
}

/** Every sounding clip of the edit. Sources with no audio stream are left out (silence). */
export function audioClips(edit: Edit, mediaOf: (assetId: string) => Media | undefined): AudioClip[] {
  const clips: AudioClip[] = [];
  const total = totalDuration(edit);
  const starts = segmentStarts(edit);
  const audible = (m: Media | undefined, volume: number, muted: boolean): m is Media => !!m && m.hasAudio && !muted && volume > 0;

  edit.main.forEach((s, i) => {
    const media = mediaOf(s.assetId);
    if (!audible(media, s.volume, s.muted)) return;
    const duration = segmentDuration(s);
    const rampIn = i > 0 ? transitionDuration(edit, i - 1) : 0;
    const rampOut = transitionDuration(edit, i);
    if (!s.curve) {
      clips.push({ file: mediaPath(media), in: s.in, length: s.out - s.in, speed: s.speed, start: starts[i], gain: gainExpression(s.volume, s.fadeIn, s.fadeOut, duration, rampIn, rampOut) });
      return;
    }
    // A speed curve: the sound is cut into short slices, each at the average speed of its stretch.
    const slices = Math.min(24, Math.max(4, Math.ceil(duration / 0.25)));
    for (let k = 0; k < slices; k++) {
      const from = s.in + ((s.out - s.in) * k) / slices;
      const to = s.in + ((s.out - s.in) * (k + 1)) / slices;
      const t0 = offsetAt(s, from);
      const t1 = offsetAt(s, to);
      const gain = gainExpression(s.volume, s.fadeIn, s.fadeOut, duration, rampIn, rampOut, `(t+${num(t0)})`);
      clips.push({ file: mediaPath(media), in: from, length: to - from, speed: (to - from) / (t1 - t0), start: starts[i] + t0, gain });
    }
  });
  for (const o of edit.overlays) {
    const media = o.assetId ? mediaOf(o.assetId) : undefined;
    if (o.kind !== 'video' || !audible(media, o.volume, o.muted)) continue;
    clips.push({ file: mediaPath(media), in: o.in, length: o.duration, speed: 1, start: o.start, gain: num(o.volume) });
  }
  for (const a of edit.audio) {
    const media = mediaOf(a.assetId);
    if (!audible(media, a.volume, a.muted)) continue;
    const length = a.out - a.in;
    clips.push({ file: mediaPath(media), in: a.in, length, speed: 1, start: a.start, gain: gainExpression(a.volume, a.fadeIn, a.fadeOut, length) });
  }
  return clips.filter((c) => c.length > 0 && c.start < total);
}

/** `atempo` keeps the pitch; one instance is kept within 0.5..2 for quality. */
function tempoFilters(speed: number) {
  const out: string[] = [];
  let s = speed;
  while (s < 0.5) { out.push('atempo=0.5'); s /= 0.5; }
  while (s > 2) { out.push('atempo=2'); s /= 2; }
  if (Math.abs(s - 1) > 1e-6) out.push(`atempo=${num(s)}`);
  return out;
}

async function mixGroup(clips: AudioClip[], total: number, outFile: string, codec: string[]) {
  const inputs: string[] = [];
  const graph: string[] = [`anullsrc=r=${SAMPLE_RATE}:cl=stereo,atrim=0:${sec(total)}[base]`];
  clips.forEach((c, i) => {
    inputs.push('-ss', sec(c.in), '-t', sec(c.length), '-i', c.file);
    const chain = [
      `aresample=${SAMPLE_RATE}`,
      'aformat=sample_fmts=fltp:channel_layouts=stereo',
      ...tempoFilters(c.speed),
      'asetpts=N/SR/TB',
      // Short frames, so a gain that changes over time moves in 10 ms steps.
      'asetnsamples=n=480',
      `volume=volume='${c.gain}':eval=frame`,
      `adelay=delays=${Math.round(c.start * SAMPLE_RATE)}S:all=1`,
    ];
    graph.push(`[${i}:a:0]${chain.join(',')}[c${i}]`);
  });
  const labels = ['[base]', ...clips.map((_, i) => `[c${i}]`)].join('');
  // `duration=first` ends the mix with the silent base, which is exactly `total` long.
  graph.push(`${labels}amix=inputs=${clips.length + 1}:normalize=0:duration=first:dropout_transition=0[out]`);
  await ffmpeg([...inputs, '-filter_complex', graph.join(';'), '-map', '[out]', '-ar', String(SAMPLE_RATE), '-ac', '2', ...codec, outFile]);
}

/** Mix `clips` into a stereo 48 kHz AAC file exactly `total` seconds long. */
export async function mixAudio(clips: AudioClip[], total: number, outFile: string, tmpDir: string) {
  let level = 0;
  // Many clips: mix them in groups to lossless files, then mix those.
  while (clips.length > GROUP) {
    const next: AudioClip[] = [];
    for (let i = 0; i < clips.length; i += GROUP) {
      const file = join(tmpDir, `mix-${level}-${i / GROUP}.wav`);
      await mixGroup(clips.slice(i, i + GROUP), total, file, ['-c:a', 'pcm_f32le', '-rf64', 'auto']);
      next.push({ file, in: 0, length: total, speed: 1, start: 0, gain: '1' });
    }
    clips = next;
    level++;
  }
  await mixGroup(clips, total, outFile, ['-c:a', 'aac', '-b:a', '192k']);
}
