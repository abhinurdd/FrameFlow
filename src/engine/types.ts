export type Script = 'roman' | 'devanagari' | 'bilingual';
export type SpokenLanguage = 'hinglish' | 'hindi' | 'english' | 'auto';
export type Genre = 'podcast' | 'motivation' | 'spiritual' | 'education' | 'finance' | 'comedy' | 'other';
export type Aspect = '9:16' | '1:1' | '16:9';
export type LayoutMode = 'auto' | 'fill' | 'fit' | 'split' | 'screen';
export type TemplateId = 'desi-pop' | 'box-bold' | 'karaoke' | 'clean';

export type Word = {
  t0: number;
  t1: number;
  speaker: 'A' | 'B';
  text: { roman: string; devanagari: string };
  /** AI-picked keyword or user emphasis. */
  emphasis?: boolean;
  /** Detected filler word ("matlab", "basically"...). */
  filler?: boolean;
  /** Deleted from the clip by the user (cuts the video). */
  deleted?: boolean;
};

export type Grades = { hook: string; flow: string; value: string };

/** The single source of truth for a clip (see docs/strategy.md §4). */
export type ClipSpec = {
  version: number;
  aspect: Aspect;
  source: { in: number; out: number };
  captions: {
    script: Script;
    template: TemplateId;
    wordsPerLine: number;
    autoEmphasis: boolean;
    position: { y: number };
  };
  words: Word[];
  layout: { mode: LayoutMode; followSpeaker: boolean; keepOriginal: boolean };
  hook: { text: string; enabled: boolean };
};

export type ClipStatus = 'new' | 'kept' | 'discarded' | 'exported';

export type Clip = {
  id: string;
  projectId: string;
  rank: number;
  score: number;
  grades: Grades;
  reason: string;
  title: string;
  tags: string[];
  speaker: 'A' | 'B';
  status: ClipStatus;
  spec: ClipSpec;
  /** Visual seed for the placeholder thumbnail until real frames exist. */
  tone: 0 | 1 | 2 | 3;
};

export type StageKey = 'fetch' | 'speakers' | 'transcribe' | 'highlights' | 'reframe';
export type StageState = 'pending' | 'running' | 'done';

export type ProjectSettings = {
  language: SpokenLanguage;
  script: Script;
  genre: Genre;
  clipLength: 'auto' | 'short' | 'long';
  aspect: Aspect;
  focus: string;
  template: TemplateId;
  hookTitle: boolean;
};

export type Project = {
  id: string;
  title: string;
  sourceUrl: string;
  /** The source file, when it came from this phone's gallery rather than a link. */
  media?: { uri: string; width: number; height: number };
  durationSec: number;
  speakers: number;
  createdAt: number;
  status: 'processing' | 'ready' | 'failed';
  progress: number;
  stages: Record<StageKey, StageState>;
  transcribedMin: number;
  settings: ProjectSettings;
  tone: 0 | 1 | 2 | 3;
};

export function duration(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

export function clipDuration(spec: ClipSpec) {
  const removed = spec.words.filter((w) => w.deleted).reduce((sum, w) => sum + (w.t1 - w.t0), 0);
  return spec.source.out - spec.source.in - removed;
}
