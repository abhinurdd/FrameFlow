import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Genre, ProjectSettings, SpokenLanguage } from '@/engine/types';

export type Persona = 'podcasts' | 'clipper' | 'motivation' | 'spiritual' | 'education' | 'finance';

type Prefs = {
  onboarded: boolean;
  persona: Persona | null;
  language: SpokenLanguage;
  clipBalance: number;
  defaults: ProjectSettings;
  completeOnboarding: (persona: Persona, language: SpokenLanguage) => void;
  setDefaults: (s: ProjectSettings) => void;
  spendClips: (n: number) => void;
  addClips: (n: number) => void;
  reset: () => void;
};

const personaGenre: Record<Persona, Genre> = {
  podcasts: 'podcast',
  clipper: 'podcast',
  motivation: 'motivation',
  spiritual: 'spiritual',
  education: 'education',
  finance: 'finance',
};

const baseDefaults: ProjectSettings = {
  language: 'hinglish',
  script: 'roman',
  genre: 'podcast',
  clipLength: 'auto',
  aspect: '9:16',
  focus: '',
  template: 'desi-pop',
  hookTitle: true,
};

export const usePrefs = create<Prefs>()(
  persist(
    (set) => ({
      onboarded: false,
      persona: null,
      language: 'hinglish',
      clipBalance: 10, // free tier
      defaults: baseDefaults,
      completeOnboarding: (persona, language) =>
        set({
          onboarded: true,
          persona,
          language,
          defaults: {
            ...baseDefaults,
            language,
            genre: personaGenre[persona],
            script: language === 'hindi' ? 'devanagari' : 'roman',
          },
        }),
      setDefaults: (defaults) => set({ defaults }),
      spendClips: (n) => set((s) => ({ clipBalance: Math.max(0, s.clipBalance - n) })),
      addClips: (n) => set((s) => ({ clipBalance: s.clipBalance + n })),
      reset: () => set({ onboarded: false, persona: null, clipBalance: 10, defaults: baseDefaults }),
    }),
    { name: 'ff.prefs', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
