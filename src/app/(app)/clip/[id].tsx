import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { clipToEdit, editIdForClip } from '@/editor/from-clip';
import { useEdits } from '@/state/edits';
import { useProject, useProjects } from '@/state/projects';
import { Button, T } from '@/ui/primitives';

/**
 * Editing an AI clip happens in the full editor. This route makes the clip's editor
 * draft the first time it is opened, then hands over to it.
 */
export default function ClipRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const clip = useProjects((s) => s.clips.find((c) => c.id === id));
  const project = useProject(clip?.projectId);
  const editId = editIdForClip(id);
  const ready = useEdits((s) => s.edits.some((e) => e.id === editId));

  useEffect(() => {
    if (clip && project && !ready) useEdits.getState().addEdit(clipToEdit(clip, project));
  }, [clip, project, ready]);

  if (!clip || !project) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <T variant="muted">This clip no longer exists.</T>
        <Button title="Back" variant="secondary" style={{ width: 140 }} onPress={() => router.back()} />
      </SafeAreaView>
    );
  }
  if (!ready) return null;
  return <Redirect href={{ pathname: '/editor/[id]', params: { id: editId } }} />;
}
