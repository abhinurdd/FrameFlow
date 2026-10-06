import { Ionicons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { SpokenLanguage } from '@/engine/types';
import { usePrefs, type Persona } from '@/state/prefs';
import { Logo } from '@/ui/brand';
import { Button, Chip, Label, Row, T } from '@/ui/primitives';
import { colors, fonts } from '@/ui/theme';

const PERSONAS: { id: Persona; icon: keyof typeof Ionicons.glyphMap; title: string; sub: string }[] = [
  { id: 'podcasts', icon: 'mic-outline', title: 'Podcasts', sub: 'Interviews, talk shows' },
  { id: 'clipper', icon: 'cut-outline', title: 'I clip for others', sub: 'Fan pages, agencies' },
  { id: 'motivation', icon: 'flame-outline', title: 'Motivation', sub: 'Talks, speeches' },
  { id: 'spiritual', icon: 'flower-outline', title: 'Spiritual', sub: 'Katha, satsang' },
  { id: 'education', icon: 'school-outline', title: 'Education', sub: 'Classes, explainers' },
  { id: 'finance', icon: 'trending-up-outline', title: 'Finance / News', sub: 'Markets, debates' },
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
  // Someone who has done this before (signed out, or reinstalled the session) goes straight to sign-in.
  const [returning] = useState(() => usePrefs.getState().onboarded);
  if (returning) return <Redirect href="/sign-in" />;

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Row>
          <Logo size={30} />
          <T variant="h2" style={{ fontSize: 17 }}>FrameFlow</T>
        </Row>
        <T variant="muted" style={{ marginTop: 28 }}>Step 1 of 2</T>
        <T variant="title" style={{ marginTop: 4 }}>Aap kya banate ho?</T>
        <T variant="muted" style={{ marginTop: 6 }}>We&apos;ll tune clip picks and caption styles for you. You can change this later.</T>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 20 }}>
          {PERSONAS.map((p) => {
            const on = persona === p.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => setPersona(p.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${p.title}. ${p.sub}`}
                style={({ pressed }) => ({
                  width: '48%',
                  flexGrow: 1,
                  padding: 14,
                  borderRadius: 16,
                  borderWidth: 1.5,
                  borderColor: on ? colors.saffron : colors.line,
                  backgroundColor: on ? colors.saffronSoft : colors.surface,
                  opacity: pressed ? 0.8 : 1,
                })}>
                <Ionicons name={p.icon} size={24} color={on ? colors.saffronText : colors.textSecondary} />
                <T style={{ fontFamily: fonts.bold, marginTop: 6 }}>{p.title}</T>
                <T variant="tiny" style={{ marginTop: 2 }}>{p.sub}</T>
              </Pressable>
            );
          })}
        </View>

        <Label style={{ marginTop: 24 }}>Your videos are mostly in</Label>
        <Row style={{ flexWrap: 'wrap' }}>
          {LANGUAGES.map((l) => (
            <Chip key={l.id} label={l.label} selected={language === l.id} onPress={() => setLanguage(l.id)} />
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
        {!persona && <T variant="tiny" style={{ textAlign: 'center', marginTop: 8 }}>Pick one to continue.</T>}
      </ScrollView>
    </SafeAreaView>
  );
}
