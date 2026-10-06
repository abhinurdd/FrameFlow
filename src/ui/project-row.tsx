import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { duration, type Project } from '@/engine/types';
import { useProjects } from '@/state/projects';

import { ClipFrame } from './clip-visual';
import { GradientFill, Panel, T } from './primitives';
import { colors } from './theme';

const LANG_LABEL = { hinglish: 'Hinglish', hindi: 'हिन्दी', english: 'English', auto: 'Auto' } as const;

export function ProjectRow({ project }: { project: Project }) {
  // Select the stable array and filter here: a selector that builds a new array re-renders forever.
  const clips = useProjects((s) => s.clips).filter((c) => c.projectId === project.id);
  const kept = clips.filter((c) => c.status === 'kept' || c.status === 'exported').length;
  const processing = project.status === 'processing';
  return (
    <Pressable onPress={() => router.push(`/project/${project.id}`)}>
      <Panel style={{ flexDirection: 'row', gap: 12, padding: 10, alignItems: 'center' }}>
        <ClipFrame tone={project.tone} personSize={56} style={{ width: 60, height: 60 }} />
        <View style={{ flex: 1 }}>
          <T style={{ fontFamily: 'Inter_700Bold' }} numberOfLines={1}>{project.title}</T>
          <T variant="tiny" style={{ marginTop: 2 }}>
            {duration(project.durationSec)} · {LANG_LABEL[project.settings.language]}
          </T>
          {processing ? (
            <>
              <View style={{ height: 5, borderRadius: 9, backgroundColor: colors.line, marginTop: 7, overflow: 'hidden' }}>
                <GradientFill style={{ width: `${project.progress}%`, height: 5 }} />
              </View>
              <T variant="tiny" style={{ marginTop: 4, color: colors.saffronText }}>
                Finding clips · {clips.length} ready to review
              </T>
            </>
          ) : (
            <T variant="tiny" style={{ marginTop: 6, color: colors.score }}>
              {clips.length} clips · {kept} kept
            </T>
          )}
        </View>
      </Panel>
    </Pressable>
  );
}
