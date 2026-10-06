import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { pickMedia } from '@/editor/pick';
import { duration, type Genre, type ProjectSettings, type Script, type SpokenLanguage } from '@/engine/types';
import { usePrefs } from '@/state/prefs';
import { useProjects } from '@/state/projects';
import { ClipFrame } from '@/ui/clip-visual';
import { Button, Chip, Label, Panel, Row, Segmented, T, Toggle } from '@/ui/primitives';
import { TEMPLATES } from '@/ui/templates';
import { colors, fonts } from '@/ui/theme';

const YT_RE = /(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/)|youtu\.be\/)([\w-]{6,})/i;

const LANGS: { id: SpokenLanguage; label: string }[] = [
  { id: 'hinglish', label: 'Hinglish' },
  { id: 'hindi', label: 'हिन्दी' },
  { id: 'english', label: 'English' },
  { id: 'auto', label: 'Auto' },
];
const GENRES: { id: Genre; label: string }[] = [
  { id: 'podcast', label: 'Podcast' },
  { id: 'motivation', label: 'Motivation' },
  { id: 'spiritual', label: 'Spiritual' },
  { id: 'education', label: 'Education' },
  { id: 'finance', label: 'Finance' },
  { id: 'comedy', label: 'Comedy' },
];

export default function NewProject() {
  const params = useLocalSearchParams<{ url?: string }>();
  const defaults = usePrefs((s) => s.defaults);
  const setDefaults = usePrefs((s) => s.setDefaults);
  const createProject = useProjects((s) => s.createProject);
  const projectCount = useProjects((s) => s.projects.length);
  const [url, setUrl] = useState(params.url ?? '');
  const [s, setS] = useState<ProjectSettings>(defaults);
  const [saveDefault, setSaveDefault] = useState(false);
  const [picked, setPicked] = useState<{ title: string; durationSec: number; uri: string } | null>(null);
  const [picking, setPicking] = useState(false);
  const [touched, setTouched] = useState(false);
  const set = <K extends keyof ProjectSettings>(k: K, v: ProjectSettings[K]) => setS((prev) => ({ ...prev, [k]: v }));

  const videoId = url.match(YT_RE)?.[1];
  // Until the backend resolves link metadata, use representative values.
  const linked = useMemo(
    () => (videoId ? { title: `Desi Hustle Podcast · Ep ${42 + projectCount}`, durationSec: 4360 } : null),
    [videoId, projectCount],
  );
  const source = picked ?? linked;

  async function chooseVideo() {
    setPicking(true);
    try {
      const [video] = await pickMedia(['videos'], false);
      if (video) setPicked({ title: video.name?.replace(/\.[^.]+$/, '') ?? 'My video', durationSec: Math.round(video.duration), uri: video.uri });
    } finally {
      setPicking(false);
    }
  }
  const expected = source ? Math.max(1, Math.round(source.durationSec / 60 / 2.9)) : 0;

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
      <Row style={{ justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 8 }}>
        <T variant="h1">Get clips</T>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Close">
          <Ionicons name="close" size={24} color={colors.textMuted} />
        </Pressable>
      </Row>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {source ? (
          <Row gap={12}>
            <ClipFrame tone={0} personSize={60} style={{ width: 100, height: 60 }} />
            <View style={{ flex: 1 }}>
              <T style={{ fontFamily: fonts.bold }} numberOfLines={2}>{source.title}</T>
              <T variant="tiny" style={{ marginTop: 2 }}>{picked ? 'From your gallery' : 'YouTube'} · {duration(source.durationSec)}</T>
            </View>
          </Row>
        ) : (
          <>
            <Panel style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
              <Ionicons name="link" size={18} color={colors.textMuted} />
              <TextInput
                value={url}
                onChangeText={(v) => {
                  setUrl(v);
                  setTouched(false);
                }}
                onBlur={() => setTouched(true)}
                autoFocus={!params.url}
                placeholder="Paste a YouTube link"
                placeholderTextColor={colors.textDim}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                style={{ flex: 1, height: 40, color: colors.text, fontFamily: fonts.medium, fontSize: 14 }}
              />
            </Panel>
            {/* Only complain once the field has been left, not while a link is being typed. */}
            {touched && url.trim().length > 0 && <T style={{ color: colors.danger, fontSize: 12.5, marginTop: 6 }}>That doesn&apos;t look like a YouTube link.</T>}
            <Row style={{ marginVertical: 12 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
              <T variant="tiny">or</T>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
            </Row>
            <Button title="Choose from gallery" variant="secondary" loading={picking} icon={<Ionicons name="images-outline" size={18} color={colors.text} />} onPress={chooseVideo} />
          </>
        )}

        <Label>Spoken language</Label>
        <Row style={{ flexWrap: 'wrap' }}>
          {LANGS.map((l) => (
            <Chip key={l.id} label={l.label} selected={s.language === l.id} onPress={() => set('language', l.id)} />
          ))}
        </Row>

        <Label>Caption script</Label>
        <Segmented<Script>
          value={s.script}
          onChange={(v) => set('script', v)}
          options={[
            { value: 'roman', label: 'Roman' },
            { value: 'devanagari', label: 'देवनागरी' },
            { value: 'bilingual', label: 'Both' },
          ]}
        />
        <T variant="tiny" style={{ marginTop: 6 }}>You can switch script later without re-processing.</T>

        <Label>Genre</Label>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {GENRES.map((g) => (
            <Chip key={g.id} label={g.label} selected={s.genre === g.id} onPress={() => set('genre', g.id)} />
          ))}
        </ScrollView>

        <Label>Clip length</Label>
        <Segmented
          value={s.clipLength}
          onChange={(v) => set('clipLength', v)}
          options={[
            { value: 'short', label: '< 30s' },
            { value: 'auto', label: 'Auto 30–90s' },
            { value: 'long', label: '90s–3m' },
          ]}
        />

        <Label>Focus (optional)</Label>
        <Panel style={{ paddingVertical: 4 }}>
          <TextInput
            value={s.focus}
            onChangeText={(v) => set('focus', v)}
            placeholder='e.g. "money, career, funny moments"'
            placeholderTextColor={colors.textDim}
            style={{ height: 40, color: colors.text, fontFamily: fonts.medium, fontSize: 14 }}
          />
        </Panel>

        <Label>Caption style</Label>
        <Row style={{ flexWrap: 'wrap' }}>
          {TEMPLATES.map((t) => (
            <Chip key={t.id} label={t.name} selected={s.template === t.id} onPress={() => set('template', t.id)} />
          ))}
        </Row>

        <Row style={{ justifyContent: 'space-between', marginTop: 18 }}>
          <T>Hook title on top clips</T>
          <Toggle value={s.hookTitle} onChange={(v) => set('hookTitle', v)} />
        </Row>
        <Row style={{ justifyContent: 'space-between', marginTop: 12 }}>
          <T>Save as my default</T>
          <Toggle value={saveDefault} onChange={setSaveDefault} />
        </Row>
      </ScrollView>

      <View style={{ paddingHorizontal: 18, paddingTop: 8 }}>
        {source && (
          <Panel style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, backgroundColor: colors.scoreSoft, borderColor: 'rgba(61,220,132,.4)' }}>
            <View style={{ flex: 1 }}>
              <T style={{ fontFamily: fonts.bold, color: colors.score }}>~{expected} clips expected</T>
              <T variant="tiny">Free to generate · you only pay for clips you export</T>
            </View>
            <Ionicons name="checkmark-circle" size={22} color={colors.score} />
          </Panel>
        )}
        <Button
          title="Get clips"
          icon={<Ionicons name="sparkles" size={18} color={colors.text} />}
          disabled={!source}
          onPress={() => {
            if (!source) return;
            if (saveDefault) setDefaults(s);
            const id = createProject({ url: picked?.uri ?? url, title: source.title, durationSec: source.durationSec }, s);
            router.dismiss();
            router.push(`/project/${id}`);
          }}
        />
        <T variant="tiny" style={{ textAlign: 'center', marginTop: 8 }}>By continuing you confirm you have the rights to use this video.</T>
      </View>
    </SafeAreaView>
  );
}
