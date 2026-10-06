import { FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useProjects } from '@/state/projects';
import { Panel, T } from '@/ui/primitives';
import { ProjectRow } from '@/ui/project-row';

export default function Projects() {
  const projects = useProjects((s) => s.projects);
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <FlatList
        data={projects}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 18, gap: 8 }}
        ListHeaderComponent={<T variant="title" style={{ marginBottom: 12 }}>Projects</T>}
        ListEmptyComponent={
          <Panel style={{ paddingVertical: 24, alignItems: 'center' }}>
            <T variant="muted">No projects yet. Tap + to start one.</T>
          </Panel>
        }
        renderItem={({ item }) => <ProjectRow project={item} />}
      />
    </SafeAreaView>
  );
}
