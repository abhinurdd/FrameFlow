import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Alert, FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { totalDuration } from '@/engine/timeline';
import { duration } from '@/engine/types';
import { useEdits } from '@/state/edits';
import { useProjects } from '@/state/projects';
import { Panel, T } from '@/ui/primitives';
import { ProjectRow } from '@/ui/project-row';
import { colors, fonts } from '@/ui/theme';

export default function Projects() {
  const projects = useProjects((s) => s.projects);
  const edits = useEdits((s) => s.edits);
  const deleteEdit = useEdits((s) => s.deleteEdit);
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <FlatList
        data={projects}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 18, gap: 8 }}
        ListHeaderComponent={
          <View style={{ gap: 8, marginBottom: 4 }}>
            <T variant="title" style={{ marginBottom: 4 }}>Projects</T>
            {edits.length > 0 && <T variant="label">Editor drafts</T>}
            {edits.map((e) => (
              <Pressable key={e.id} onPress={() => router.push({ pathname: '/editor/[id]', params: { id: e.id } })}>
                <Panel style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="film-outline" size={20} color={colors.saffronText} />
                  <View style={{ flex: 1 }}>
                    <T style={{ fontFamily: fonts.bold }}>{e.name}</T>
                    <T variant="tiny">
                      {e.main.length} {e.main.length === 1 ? 'clip' : 'clips'} · {duration(totalDuration(e))}
                    </T>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${e.name}`}
                    hitSlop={14}
                    onPress={() => Alert.alert(`Delete "${e.name}"?`, 'This draft will be removed from this phone. It cannot be undone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteEdit(e.id) }])}>
                    <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
                  </Pressable>
                </Panel>
              </Pressable>
            ))}
            {projects.length > 0 && <T variant="label" style={{ marginTop: 8 }}>AI clip projects</T>}
          </View>
        }
        ListEmptyComponent={
          edits.length ? null : (
            <Panel style={{ paddingVertical: 24, alignItems: 'center' }}>
              <T variant="muted">No projects yet. Tap + to start one.</T>
            </Panel>
          )
        }
        renderItem={({ item }) => <ProjectRow project={item} />}
      />
    </SafeAreaView>
  );
}
