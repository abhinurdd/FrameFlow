import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { clipDuration, type Clip, type Project, type StageKey } from '@/engine/types';
import { useProject, useProjects } from '@/state/projects';
import { CaptionLine, captionLines, ClipFrame, DurationBadge, ScoreBadge } from '@/ui/clip-visual';
import { Button, Chip, Panel, Row, T } from '@/ui/primitives';
import { colors, fonts } from '@/ui/theme';

const STAGE_LABEL: Record<StageKey, string> = {
  fetch: 'Video fetched',
  speakers: 'Speakers found',
  transcribe: 'Transcribing',
  highlights: 'Picking highlights',
  reframe: 'Auto-reframe 9:16',
};

function Progress({ project, ready }: { project: Project; ready: number }) {
  const minutes = Math.max(1, Math.ceil((100 - project.progress) / 20));
  return (
    <Panel style={{ marginBottom: 14 }}>
      <Row gap={12}>
        <View style={{ width: 54, height: 54, borderRadius: 27, borderWidth: 5, borderColor: colors.saffron, alignItems: 'center', justifyContent: 'center' }}>
          <T style={{ fontFamily: fonts.black, fontSize: 13 }}>{project.progress}%</T>
        </View>
        <View style={{ flex: 1 }}>
          <T variant="h2">Finding your best moments</T>
          <T variant="tiny" style={{ marginTop: 2 }}>About {minutes} min left · you can close the app</T>
        </View>
      </Row>
      <View style={{ marginTop: 12, gap: 7 }}>
        {(Object.keys(STAGE_LABEL) as StageKey[]).map((k) => {
          const st = project.stages[k];
          const detail =
            k === 'transcribe' && st !== 'pending'
              ? `${project.transcribedMin} / ${Math.round(project.durationSec / 60)} min`
              : k === 'speakers' && st === 'done'
                ? `${project.speakers}`
                : st === 'running'
                  ? 'running'
                  : '';
          return (
            <Row key={k} style={{ justifyContent: 'space-between' }}>
              <Row gap={6}>
                <Ionicons
                  name={st === 'done' ? 'checkmark-circle' : st === 'running' ? 'sync-circle' : 'ellipse-outline'}
                  size={15}
                  color={st === 'done' ? colors.score : st === 'running' ? colors.saffronText : colors.textDim}
                />
                <T style={{ fontSize: 13, color: st === 'pending' ? colors.textDim : st === 'done' ? colors.score : colors.text }}>
                  {k === 'transcribe' ? `Transcribing ${project.settings.language === 'hindi' ? 'Hindi' : 'Hinglish'}` : STAGE_LABEL[k]}
                </T>
              </Row>
              <T variant="tiny">{detail}</T>
            </Row>
          );
        })}
      </View>
      {ready > 0 && (
        <T variant="tiny" style={{ marginTop: 10, color: colors.saffronText }}>
          {ready} clip{ready > 1 ? 's' : ''} ready. Start reviewing while the rest process.
        </T>
      )}
    </Panel>
  );
}

function ClipCard({ clip, width }: { clip: Clip; width: number }) {
  const line = captionLines(clip.spec).find((l) => l.some((w) => w.emphasis)) ?? captionLines(clip.spec)[0];
  return (
    <Pressable onPress={() => router.push(`/clip/${clip.id}`)} style={{ width }}>
      <ClipFrame tone={clip.tone} personSize={width * 0.8} style={{ height: width * 1.5, opacity: clip.status === 'discarded' ? 0.4 : 1 }}>
        <View style={{ position: 'absolute', left: 6, right: 6, top: width * 1.5 * 0.66 }}>
          <CaptionLine words={line} script={clip.spec.captions.script} template={clip.spec.captions.template} fontSize={15} autoEmphasis />
        </View>
        <ScoreBadge score={clip.score} />
        <DurationBadge seconds={clipDuration(clip.spec)} />
        {clip.status === 'kept' && (
          <View style={{ position: 'absolute', top: 6, left: 6, backgroundColor: colors.score, borderRadius: 10, padding: 2 }}>
            <Ionicons name="checkmark" size={12} color="#000" />
          </View>
        )}
      </ClipFrame>
      <T style={{ fontFamily: fonts.bold, fontSize: 13, marginTop: 6 }} numberOfLines={2}>{clip.title}</T>
      <T variant="tiny" numberOfLines={1}>{clip.reason.split('.')[0]}</T>
    </Pressable>
  );
}

type Sort = 'best' | 'timeline' | 'kept';

export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const project = useProject(id);
  const allClips = useProjects((s) => s.clips);
  const [sort, setSort] = useState<Sort>('best');
  const { width } = useWindowDimensions();
  const cardW = (width - 18 * 2 - 12) / 2;

  const clips = useMemo(() => {
    const mine = allClips.filter((c) => c.projectId === id);
    if (sort === 'timeline') return [...mine].sort((a, b) => a.spec.source.in - b.spec.source.in);
    if (sort === 'kept') return mine.filter((c) => c.status === 'kept' || c.status === 'exported');
    return [...mine].sort((a, b) => b.score - a.score);
  }, [allClips, id, sort]);
  const kept = allClips.filter((c) => c.projectId === id && c.status === 'kept').length;
  const unreviewed = allClips.filter((c) => c.projectId === id && c.status === 'new').length;

  if (!project) return null;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <Row style={{ justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 6 }}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <T variant="h2" numberOfLines={1} style={{ flex: 1, textAlign: 'center' }}>
          {project.status === 'ready' ? `${clips.length} clips` : project.title}
        </T>
        <View style={{ width: 26 }} />
      </Row>

      <FlatList
        data={clips}
        keyExtractor={(c) => c.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 12 }}
        contentContainerStyle={{ padding: 18, paddingTop: 6, gap: 16, paddingBottom: 110 }}
        ListHeaderComponent={
          <View>
            {project.status === 'processing' && <Progress project={project} ready={clips.length} />}
            <Row style={{ marginBottom: 2 }}>
              <Chip label="Best first" selected={sort === 'best'} onPress={() => setSort('best')} />
              <Chip label="Timeline" selected={sort === 'timeline'} onPress={() => setSort('timeline')} />
              <Chip label={`★ Kept ${kept}`} selected={sort === 'kept'} onPress={() => setSort('kept')} />
            </Row>
          </View>
        }
        ListEmptyComponent={
          project.status === 'processing' ? (
            <Row style={{ gap: 12 }}>
              {[0, 1].map((i) => (
                <View key={i} style={{ width: cardW, height: cardW * 1.5, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.lineStrong, backgroundColor: colors.surface }} />
              ))}
            </Row>
          ) : (
            <T variant="muted">No clips here yet.</T>
          )
        }
        renderItem={({ item }) => <ClipCard clip={item} width={cardW} />}
      />

      {clips.length > 0 && (
        <View style={{ position: 'absolute', left: 18, right: 18, bottom: 30, flexDirection: 'row', gap: 10 }}>
          <Button
            title={unreviewed ? `Review ${unreviewed} · swipe` : 'Review again'}
            icon={<Ionicons name="play" size={16} color="#fff" />}
            style={{ flex: 1 }}
            onPress={() => router.push(`/project/${id}/review`)}
          />
          {kept > 0 && (
            <Button title={`Export ${kept}`} variant="secondary" style={{ width: 120 }} onPress={() => router.push({ pathname: '/export', params: { projectId: id } })} />
          )}
        </View>
      )}
    </SafeAreaView>
  );
}
