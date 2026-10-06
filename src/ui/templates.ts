import type { TemplateId } from '@/engine/types';

export const TEMPLATES: { id: TemplateId; name: string; note: string }[] = [
  { id: 'desi-pop', name: 'Desi Pop', note: 'Yellow keyword pop · default' },
  { id: 'box-bold', name: 'Box Bold', note: 'Saffron box on keywords' },
  { id: 'karaoke', name: 'Karaoke', note: 'Word-by-word highlight' },
  { id: 'clean', name: 'Clean', note: 'Calm, podcast-friendly' },
];
