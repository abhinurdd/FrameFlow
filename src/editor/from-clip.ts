import { IDENTITY } from '@/engine/animate';
import { blankEdit, captionsFromWords, cutCaptionWords, DEFAULT_TEXT_STYLE, newSegment, newText, type Asset, type CaptionWord, type Edit } from '@/engine/timeline';
import type { Clip, Project } from '@/engine/types';
import { uid } from '@/state/edits';

/** The editor draft that belongs to an AI clip. One per clip, so reopening resumes the same edit. */
export const editIdForClip = (clipId: string) => `clip_${clipId}`;

/**
 * Turn an AI-picked clip into a full editor project: the clip's stretch of the source
 * on the main track, its transcript as word-timed captions, its hook as a text layer.
 * Words the creator already cut in review are cut here too.
 */
export function clipToEdit(clip: Clip, project: Project): Edit {
  const { spec } = clip;
  const length = spec.source.out - spec.source.in;
  const local = project.media;
  const asset: Asset = local
    ? { id: uid('ast'), uri: local.uri, kind: 'video', duration: project.durationSec, width: local.width, height: local.height, name: project.title }
    : // A linked video is not on the phone yet: edit against a stand-in frame.
      { id: uid('ast'), uri: '', kind: 'video', duration: Math.max(project.durationSec, spec.source.out), width: 1080, height: 1920, name: project.title, placeholder: true };

  // Keep the clip's range when the source really is that long; otherwise start from the top.
  const fits = spec.source.out <= asset.duration;
  const range = fits ? { in: spec.source.in, out: spec.source.out } : { in: 0, out: Math.min(length, asset.duration) };
  const span = range.out - range.in;

  const roman = spec.captions.script === 'roman';
  const words: (CaptionWord & { deleted?: boolean })[] = spec.words
    .map((w) => ({
      t0: w.t0 - spec.source.in,
      t1: Math.min(w.t1 - spec.source.in, span),
      text: roman ? w.text.roman : w.text.devanagari,
      alt: roman ? w.text.devanagari : w.text.roman,
      emphasis: w.emphasis,
      deleted: w.deleted,
    }))
    .filter((w) => w.t0 < span - 0.05);

  const base = blankEdit(editIdForClip(clip.id), clip.title, Date.now());
  let edit: Edit = {
    ...base,
    aspect: spec.aspect,
    assets: { [asset.id]: asset },
    main: [{ ...newSegment(uid('seg'), asset), ...range, fit: spec.layout.mode === 'fit' ? 'contain' : 'cover' }],
    captions: captionsFromWords(words, spec.captions.wordsPerLine, () => uid('cap')),
    captionStyle: { template: spec.captions.template, size: 20, y: spec.captions.position.y },
  };
  if (spec.hook.enabled && spec.hook.text) {
    const hook = newText(uid('txt'), 0, spec.hook.text);
    edit = {
      ...edit,
      texts: [{ ...hook, duration: Math.min(span, 4), transform: { ...IDENTITY, y: -0.36 }, style: { ...DEFAULT_TEXT_STYLE, size: 17, color: '#111111', background: '#FFFFFF', shadow: false } }],
    };
  }
  return cutCaptionWords(edit, (w) => !!(w as { deleted?: boolean }).deleted, () => uid('seg'));
}
