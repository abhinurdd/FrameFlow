import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { isDemoMode, useAuth } from '@/services/auth';
import { Logo } from '@/ui/brand';
import { Button, Panel, Row, T } from '@/ui/primitives';
import { colors, fonts } from '@/ui/theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function GoogleG() {
  return (
    <Svg width={18} height={18} viewBox="0 0 48 48">
      <Path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <Path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <Path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <Path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </Svg>
  );
}

export default function SignIn() {
  const { sendEmailOtp, signInWithGoogle, signInWithApple } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<'google' | 'apple' | 'email' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const valid = EMAIL_RE.test(email.trim());

  async function run(kind: 'google' | 'apple' | 'email', fn: () => Promise<void>) {
    setError(null);
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, padding: 20 }}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <View style={{ marginTop: 24 }}>
          <Logo size={44} />
          <T variant="muted" style={{ marginTop: 20 }}>Step 2 of 2</T>
          <T variant="title" style={{ marginTop: 4 }}>Save your clips</T>
          <T variant="muted" style={{ marginTop: 6 }}>Sign in to process videos and keep your projects across devices.</T>
        </View>

        <Button
          title="Continue with Google"
          variant="secondary"
          icon={<GoogleG />}
          loading={busy === 'google'}
          disabled={busy !== null}
          style={{ marginTop: 28 }}
          onPress={() => run('google', signInWithGoogle)}
        />
        {Platform.OS === 'ios' && (
          <Button
            title="Continue with Apple"
            variant="secondary"
            icon={<Ionicons name="logo-apple" size={19} color={colors.text} />}
            loading={busy === 'apple'}
            disabled={busy !== null}
            style={{ marginTop: 10 }}
            onPress={() => run('apple', signInWithApple)}
          />
        )}

        <Row style={{ marginVertical: 20 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
          <T variant="tiny">or use email</T>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
        </Row>

        <Panel style={{ paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="mail-outline" size={18} color={colors.textMuted} />
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.textDim}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="send"
            style={{ flex: 1, height: 44, color: colors.text, fontFamily: fonts.medium, fontSize: 15 }}
          />
        </Panel>
        <Button
          title="Email me a code"
          disabled={!valid || busy !== null}
          loading={busy === 'email'}
          style={{ marginTop: 12 }}
          onPress={() =>
            run('email', async () => {
              const clean = email.trim().toLowerCase();
              await sendEmailOtp(clean);
              router.push({ pathname: '/verify', params: { email: clean } });
            })
          }
        />

        {error && <T style={{ color: colors.danger, marginTop: 12, fontSize: 13 }}>{error}</T>}

        <View style={{ flex: 1 }} />
        {isDemoMode && (
          <Panel style={{ marginBottom: 8, borderColor: 'rgba(245,158,11,.45)', backgroundColor: colors.amberSoft }}>
            <T style={{ color: '#FFD08A', fontSize: 12 }}>
              Demo mode: the backend isn&apos;t connected yet, so sign-in is simulated on this device. Any 6-digit code works.
            </T>
          </Panel>
        )}
        <T variant="tiny" style={{ textAlign: 'center' }}>By continuing you agree to our Terms and Privacy Policy.</T>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
