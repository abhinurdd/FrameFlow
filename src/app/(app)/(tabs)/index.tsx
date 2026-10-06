import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/services/auth';
import { usePrefs } from '@/state/prefs';
import { useProjects } from '@/state/projects';
import { Logo } from '@/ui/brand';
import { Button, Panel, Row, T } from '@/ui/primitives';
import { ProjectRow } from '@/ui/project-row';
import { colors, fonts } from '@/ui/theme';

export default function Home() {
  const { user } = useAuth();
  const balance = usePrefs((s) => s.clipBalance);
  const projects = useProjects((s) => s.projects);
  const [url, setUrl] = useState('');

  const openNew = (link: string) => router.push({ pathname: '/new', params: link ? { url: link } : {} });

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <Row style={{ justifyContent: 'space-between' }}>
          <Row>
            <Logo size={28} />
            <T variant="h2" style={{ fontSize: 17 }}>FrameFlow</T>
          </Row>
          <Pressable onPress={() => router.push('/paywall')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 30, borderRadius: 99, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line }}>
              <Ionicons name="flash" size={13} color={colors.saffronText} />
              <T style={{ fontFamily: fonts.bold, fontSize: 12, color: colors.saffronText }}>{balance} clips left</T>
            </View>
          </Pressable>
        </Row>

        <T variant="title" style={{ marginTop: 22, fontSize: 24 }}>Namaste{user?.name ? `, ${user.name}` : ''} 👋</T>
        <T variant="muted" style={{ marginTop: 4 }}>Drop a long video. Get shorts in minutes.</T>

        <Panel style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderColor: colors.lineStrong }}>
          <Ionicons name="link" size={18} color={colors.textMuted} />
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder="Paste a YouTube link"
            placeholderTextColor={colors.textDim}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={() => url.trim() && openNew(url.trim())}
            style={{ flex: 1, height: 40, color: colors.text, fontFamily: fonts.medium, fontSize: 14 }}
          />
          <Pressable
            onPress={async () => {
              const text = url.trim() || (await Clipboard.getStringAsync()).trim();
              openNew(text);
            }}
            style={{ paddingHorizontal: 12, height: 32, borderRadius: 99, justifyContent: 'center', backgroundColor: colors.saffronSoft, borderWidth: 1, borderColor: colors.saffron }}>
            <T style={{ fontFamily: fonts.bold, fontSize: 12.5, color: colors.saffronText }}>{url.trim() ? 'Go' : 'Paste'}</T>
          </Pressable>
        </Panel>
        <Row style={{ marginTop: 10 }}>
          <Button title="Upload video" variant="secondary" icon={<Ionicons name="cloud-upload-outline" size={18} color={colors.text} />} style={{ flex: 1 }} onPress={() => openNew('')} />
        </Row>
        <T variant="tiny" style={{ marginTop: 8 }}>Tip: in the YouTube app, tap Share → FrameFlow</T>

        <Row style={{ justifyContent: 'space-between', marginTop: 26, marginBottom: 10 }}>
          <T variant="h2">Recent</T>
          {projects.length > 3 && (
            <Pressable onPress={() => router.push('/projects')}>
              <T variant="muted">See all</T>
            </Pressable>
          )}
        </Row>
        {projects.length === 0 ? (
          <Panel style={{ alignItems: 'center', paddingVertical: 28 }}>
            <Ionicons name="sparkles" size={26} color={colors.saffronText} />
            <T style={{ fontFamily: fonts.bold, marginTop: 10 }}>Your first project starts here</T>
            <T variant="muted" style={{ marginTop: 4, textAlign: 'center' }}>Paste a podcast link above. Your first clips arrive in minutes.</T>
          </Panel>
        ) : (
          <View style={{ gap: 8 }}>
            {projects.slice(0, 3).map((p) => (
              <ProjectRow key={p.id} project={p} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
