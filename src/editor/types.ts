import type { TrackId } from '@/engine/timeline';

/** What is selected in the editor: a main-track segment or an item on a free track. */
export type Selection = { track: 'main' | TrackId; id: string } | null;

export type CanvasSize = { w: number; h: number };
