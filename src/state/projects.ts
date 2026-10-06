import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { buildSpec, SAMPLE_CLIPS } from '@/engine/sample-content';
import type { Clip, ClipSpec, ClipStatus, Project, ProjectSettings, StageKey } from '@/engine/types';

/**
 * Local stand-in for the backend pipeline (docs/strategy.md §4). It mimics the
 * streaming behaviour of the real system: stages advance and clips arrive one
 * by one, so every screen can be built against realistic state transitions.
 * Swap `startPipeline` for the API + realtime subscription once the backend exists.
 */

type State = {
  projects: Project[];
  clips: Clip[];
  createProject: (input: { url: string; title: string; durationSec: number; media?: Project['media'] }, settings: ProjectSettings) => string;
  setClipStatus: (id: string, status: ClipStatus) => void;
  updateSpec: (id: string, fn: (spec: ClipSpec) => ClipSpec) => void;
  deleteProject: (id: string) => void;
};

const STAGES: StageKey[] = ['fetch', 'speakers', 'transcribe', 'highlights', 'reframe'];
const timers = new Map<string, ReturnType<typeof setInterval>>();
let counter = 0;
const uid = (p: string) => `${p}_${Date.now().toString(36)}${(counter++).toString(36)}`;

export const useProjects = create<State>()(
  persist(
    (set, get) => ({
      projects: [],
      clips: [],

      createProject(input, settings) {
        const id = uid('prj');
        const project: Project = {
          id,
          title: input.title,
          sourceUrl: input.url,
          media: input.media,
          durationSec: input.durationSec,
          speakers: 2,
          createdAt: Date.now(),
          status: 'processing',
          progress: 0,
          stages: { fetch: 'running', speakers: 'pending', transcribe: 'pending', highlights: 'pending', reframe: 'pending' },
          transcribedMin: 0,
          settings,
          tone: (get().projects.length % 4) as Project['tone'],
        };
        set((s) => ({ projects: [project, ...s.projects] }));
        startPipeline(id);
        return id;
      },

      setClipStatus(id, status) {
        set((s) => ({ clips: s.clips.map((c) => (c.id === id ? { ...c, status } : c)) }));
      },

      updateSpec(id, fn) {
        set((s) => ({
          clips: s.clips.map((c) => (c.id === id ? { ...c, spec: { ...fn(c.spec), version: c.spec.version + 1 } } : c)),
        }));
      },

      deleteProject(id) {
        clearInterval(timers.get(id));
        set((s) => ({ projects: s.projects.filter((p) => p.id !== id), clips: s.clips.filter((c) => c.projectId !== id) }));
      },
    }),
    {
      name: 'ff.projects',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        // Resume any demo pipelines interrupted by an app restart.
        state?.projects.filter((p) => p.status === 'processing').forEach((p) => startPipeline(p.id));
      },
    },
  ),
);

function patchProject(id: string, patch: Partial<Project>) {
  useProjects.setState((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
}

function startPipeline(id: string) {
  if (timers.has(id)) return;
  const TICK_MS = 700;
  const timer = setInterval(() => {
    const { projects, clips } = useProjects.getState();
    const project = projects.find((p) => p.id === id);
    if (!project) {
      clearInterval(timer);
      timers.delete(id);
      return;
    }
    const progress = Math.min(100, project.progress + 3);
    const stageIndex = Math.min(STAGES.length - 1, Math.floor(progress / 20));
    const stages = Object.fromEntries(
      STAGES.map((k, i) => [k, i < stageIndex || progress >= 100 ? 'done' : i === stageIndex ? 'running' : 'pending']),
    ) as Project['stages'];
    const totalMin = Math.round(project.durationSec / 60);

    // Clips start streaming once highlight finding is underway (~35%).
    const projectClips = clips.filter((c) => c.projectId === id);
    const due = progress < 35 ? 0 : Math.min(SAMPLE_CLIPS.length, 1 + Math.floor((progress - 35) / 12));
    const fresh: Clip[] = [];
    for (let i = projectClips.length; i < due; i++) {
      const sample = SAMPLE_CLIPS[i];
      fresh.push({
        id: uid('clp'),
        projectId: id,
        rank: i + 1,
        score: sample.score,
        grades: sample.grades,
        reason: sample.reason,
        title: sample.title,
        tags: sample.tags,
        speaker: sample.lines[sample.lines.length - 1][0],
        status: 'new',
        spec: buildSpec(sample, 300 + i * 410, project.settings),
        tone: (i % 4) as Clip['tone'],
      });
    }
    if (fresh.length) useProjects.setState((s) => ({ clips: [...s.clips, ...fresh] }));

    patchProject(id, {
      progress,
      stages,
      transcribedMin: Math.min(totalMin, Math.round((progress / 70) * totalMin)),
      status: progress >= 100 ? 'ready' : 'processing',
    });
    if (progress >= 100) {
      clearInterval(timer);
      timers.delete(id);
    }
  }, TICK_MS);
  timers.set(id, timer);
}

export function useProject(id: string | undefined) {
  return useProjects((s) => s.projects.find((p) => p.id === id));
}
