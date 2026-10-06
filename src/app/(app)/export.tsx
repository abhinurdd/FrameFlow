import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { clipDuration } from '@/engine/types';
import { usePrefs } from '@/state/prefs';
import { useProjects } from '@/state/projects';
import { Button, Chip, Label, Panel, Row, T, Toggle } from '@/ui/primitives';
import { colors, fonts } from '@/ui/theme';

const TARGETS = [
  { id: 'reels', label: 'Instagram Reels', icon: 'logo-instagram', color: '#DD2A7B' },
  { id: 'shorts', label: 'YouTube Shorts', icon: 'logo-youtube', color: '#FF0000' },
  { id: 'whatsapp', label: 'WhatsApp Status', icon: 'logo-whatsapp', color: '#25D366' },
  { id: 'gallery', label: 'Save to gallery', icon: 'download-outline', color: '#3A3A48' },
] as const;

export default function Export() {
  const { projectId, clipId } = useLocalSearchParams<{ projectId?: string; clipId?: string }>();
  // Filter outside the selector: a selector that builds a new array re-renders forever.
  const clips = useProjects((s) => s.clips).filter((c) => (clipId ? c.id === clipId : c.projectId === projectId && c.status === 'kept'));
  const setClipStatus = useProjects((s) => s.setClipStatus);
  const balance = usePrefs((s) => s.clipBalance);
  const spendClips = usePrefs((s) => s.spendClips);
  const [quality, setQuality] = useState<'1080p' | '4k'>('1080p');
  const [targets, setTargets] = useState<Record<string, boolean>>({ reels: true, shorts: true, whatsapp: false, gallery: true });
  const [done, setDone] = useState(false);
  const [variant, setVariant] = useState(0);

  const count = clips.filter((c) => c.status !== 'exported').length;
  const seconds = clips.reduce((n, c) => n + clipDuration(c.spec), 0);
  const sizeMb = Math.round(seconds * (quality === '4k' ? 5.2 : 1.6));
  const short = count > balance;
  const first = clips[0];

  if (done) {
    return (
      <SafeAreaView style={{ flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.scoreSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="checkmark" size={40} color={colors.score} />
        </View>
        <T variant="title" style={{ marginTop: 18, textAlign: 'center' }}>Rendering {clips.length} clip{clips.length > 1 ? 's' : ''}</T>
        <T variant="muted" style={{ marginTop: 8, textAlign: 'center' }}>
          We&apos;ll notify you when they&apos;re ready to post. You can leave the app. (Cloud rendering arrives with the backend.)
        </T>
        <Button title="Done" style={{ marginTop: 28, alignSelf: 'stretch' }} onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
      <Row style={{ justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 8 }}>
        <T variant="h1">Export {clips.length} clip{clips.length === 1 ? '' : 's'}</T>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Close">
          <Ionicons name="close" size={24} color={colors.textMuted} />
        </Pressable>
      </Row>
      <ScrollView contentContainerStyle={{ padding: 18 }}>
        <Label style={{ marginTop: 4 }}>Quality</Label>
        <Row>
          <Chip label="Auto 1080p" selected={quality === '1080p'} onPress={() => setQuality('1080p')} />
          <Chip label="4K · Pro" selected={quality === '4k'} onPress={() => setQuality('4k')} />
        </Row>
        <T variant="tiny" style={{ marginTop: 6 }}>~{sizeMb} MB · rendered in the cloud, keeps going if you leave</T>

        <Label>Post to</Label>
        <Panel style={{ paddingVertical: 4 }}>
          {TARGETS.map((t) => (
            <Row key={t.id} style={{ justifyContent: 'space-between', paddingVertical: 9 }}>
              <Row gap={10}>
                <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: t.color, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={t.icon} size={18} color="#fff" />
                </View>
                <T style={{ fontFamily: fonts.semibold }}>{t.label}</T>
              </Row>
              <Toggle value={!!targets[t.id]} onChange={(v) => setTargets((p) => ({ ...p, [t.id]: v }))} />
            </Row>
          ))}
        </Panel>

        {first && (
          <>
            <Label>Caption for Reels (AI · Hinglish)</Label>
            <Panel>
              <T style={{ fontSize: 13.5, color: colors.textSecondary, lineHeight: 20 }}>
                {[`${first.title} 💸 Pura episode profile link mein.`, `Ye baat koi nahi batata: ${first.title}. Full episode link in bio.`, `${first.title}. Agree ya disagree? Comment karo 👇`][variant % 3]} #{first.tags[0]} #{first.tags[1] ?? 'india'} #hinglish #podcastclips
              </T>
              <Row style={{ justifyContent: 'space-between', marginTop: 10 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Rewrite caption"
                  hitSlop={6}
                  onPress={() => setVariant(variant + 1)}
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 36, borderRadius: 99, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line, opacity: pressed ? 0.7 : 1 })}>
                  <Ionicons name="sparkles" size={14} color={colors.saffronText} />
                  <T style={{ fontFamily: fonts.semibold, fontSize: 13 }}>Rewrite</T>
                </Pressable>
                <T variant="tiny">AI captions per platform</T>
              </Row>
            </Panel>
          </>
        )}
      </ScrollView>

      <View style={{ paddingHorizontal: 18, paddingTop: 6 }}>
        <Panel style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, backgroundColor: short ? colors.amberSoft : colors.scoreSoft, borderColor: short ? 'rgba(245,158,11,.5)' : 'rgba(61,220,132,.4)' }}>
          <T style={{ flex: 1, fontFamily: fonts.bold, color: short ? '#FFD08A' : colors.score }}>
            {count} clip{count === 1 ? '' : 's'} from your balance
          </T>
          <T variant="muted">
            {balance} → {Math.max(0, balance - count)} left
          </T>
        </Panel>
        {short ? (
          <Button title="Get more clips" onPress={() => router.push('/paywall')} />
        ) : (
          <Button
            title="Export & post"
            disabled={clips.length === 0}
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              spendClips(count);
              clips.forEach((c) => setClipStatus(c.id, 'exported'));
              setDone(true);
            }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
