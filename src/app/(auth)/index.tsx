import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { SpokenLanguage } from '@/engine/types';
import { usePrefs, type Persona } from '@/state/prefs';
import { Logo } from '@/ui/brand';
import { Button, Chip, Label, Row, T } from '@/ui/primitives';
import { colors, fonts } from '@/ui/theme';

const PERSONAS: { id: Persona; emoji: string; title: string; sub: string }[] = [
  { id: 'podcasts', emoji: '🎙️', title: 'Podcasts', sub: 'Interviews, talk shows' },
  { id: 'clipper', emoji: '✂️', title: 'I clip for others', sub: 'Fan pages, agencies' },
  { id: 'motivation', emoji: '🔥', title: 'Motivation', sub: 'Talks, speeches' },
  { id: 'spiritual', emoji: '🙏', title: 'Spiritual', sub: 'Katha, satsang' },
  { id: 'education', emoji: '📚', title: 'Education', sub: 'Classes, explainers' },
  { id: 'finance', emoji: '📈', title: 'Finance / News', sub: 'Markets, debates' },
];

const LANGUAGES: { id: SpokenLanguage; label: string }[] = [
  { id: 'hinglish', label: 'Hinglish' },
  { id: 'hindi', label: 'हिन्दी' },
  { id: 'english', label: 'English' },
];

export default function Onboarding() {
  const storedPersona = usePrefs((s) => s.persona);
  const storedLanguage = usePrefs((s) => s.language);
  const completeOnboarding = usePrefs((s) => s.completeOnboarding);
  const [persona, setPersona] = useState<Persona | null>(storedPersona);
  const [language, setLanguage] = useState<SpokenLanguage>(storedLanguage);

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Row>
          <Logo size={30} />
          <T variant="h2" style={{ fontSize: 17 }}>FrameFlow</T>
        </Row>
        <T variant="muted" style={{ marginTop: 28 }}>Step 1 of 2</T>
        <T variant="title" style={{ marginTop: 4 }}>Aap kya banate ho?</T>
        <T variant="muted" style={{ marginTop: 6 }}>We&apos;ll tune clip picks and caption styles for you.</T>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 20 }}>
          {PERSONAS.map((p) => {
            const on = persona === p.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => setPersona(p.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                style={{
                  width: '48%',
                  flexGrow: 1,
                  padding: 14,
                  borderRadius: 16,
                  borderWidth: 1.5,
                  borderColor: on ? colors.saffron : colors.line,
                  backgroundColor: on ? colors.saffronSoft : colors.surface,
                }}>
                <Text style={{ fontSize: 24 }}>{p.emoji}</Text>
                <T style={{ fontFamily: fonts.bold, marginTop: 6 }}>{p.title}</T>
                <T variant="tiny" style={{ marginTop: 2 }}>{p.sub}</T>
              </Pressable>
            );
          })}
        </View>

        <Label style={{ marginTop: 24 }}>Your videos are mostly in</Label>
        <Row style={{ flexWrap: 'wrap' }}>
          {LANGUAGES.map((l) => (
            <Chip key={l.id} label={(language === l.id ? '✓ ' : '') + l.label} selected={language === l.id} onPress={() => setLanguage(l.id)} />
          ))}
        </Row>
        <T variant="tiny" style={{ marginTop: 8 }}>Marathi, Bengali, Tamil and more are coming soon.</T>

        <Button
          title="Continue"
          disabled={!persona}
          style={{ marginTop: 28 }}
          onPress={() => {
            if (!persona) return;
            completeOnboarding(persona, language);
            router.push('/sign-in');
          }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
