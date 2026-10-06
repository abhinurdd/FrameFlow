import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { authErrorMessage, OTP_LENGTH, useAuth } from '@/services/auth';
import { Button, T } from '@/ui/primitives';
import { colors, fonts } from '@/ui/theme';

const RESEND_SECONDS = 30;

export default function Verify() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const { verifyEmailOtp, sendEmailOtp } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);
  const input = useRef<TextInput>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function submit(value: string) {
    setBusy(true);
    setError(null);
    try {
      await verifyEmailOtp(email, value);
    } catch (e) {
      setError(authErrorMessage(e));
      input.current?.focus();
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, padding: 20 }}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" style={({ pressed }) => ({ width: 44, height: 44, marginLeft: -10, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <T variant="title" style={{ marginTop: 12 }}>Enter the code</T>
        <T variant="muted" style={{ marginTop: 6 }}>
          We sent a {OTP_LENGTH}-digit code to <T style={{ fontFamily: fonts.bold }}>{email}</T>
        </T>

        <Pressable onPress={() => input.current?.focus()} accessibilityLabel={`Code, ${code.length} of ${OTP_LENGTH} digits entered`} style={{ flexDirection: 'row', gap: 8, marginTop: 28 }}>
          {Array.from({ length: OTP_LENGTH }).map((_, i) => {
            const active = i === code.length && !busy;
            return (
              <View
                key={i}
                style={{
                  flex: 1,
                  height: 56,
                  borderRadius: 14,
                  borderWidth: 1.5,
                  borderColor: error ? colors.danger : active ? colors.saffron : colors.line,
                  backgroundColor: colors.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <T style={{ fontFamily: fonts.heavy, fontSize: 22 }}>{code[i] ?? ''}</T>
              </View>
            );
          })}
        </Pressable>
        <TextInput
          ref={input}
          value={code}
          autoFocus
          onChangeText={(v) => {
            const digits = v.replace(/\D/g, '').slice(0, OTP_LENGTH);
            setCode(digits);
            if (digits.length) setError(null);
            if (digits.length === OTP_LENGTH) submit(digits);
          }}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={OTP_LENGTH}
          style={{ position: 'absolute', opacity: 0, height: 1, width: 1 }}
          accessibilityLabel="One-time code"
        />

        {error && <T accessibilityLiveRegion="polite" style={{ color: colors.danger, marginTop: 12, fontSize: 13 }}>{error}</T>}

        <Button title="Verify" loading={busy} disabled={code.length !== OTP_LENGTH} style={{ marginTop: 24 }} onPress={() => submit(code)} />
        <Pressable
          disabled={cooldown > 0}
          onPress={async () => {
            setCooldown(RESEND_SECONDS);
            try {
              await sendEmailOtp(email);
            } catch (e) {
              setError(authErrorMessage(e));
            }
          }}
          accessibilityRole="button"
          hitSlop={12}
          style={{ alignSelf: 'center', marginTop: 18, paddingVertical: 6 }}>
          <T style={{ color: cooldown > 0 ? colors.textDim : colors.saffronText, fontFamily: fonts.semibold }}>
            {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
          </T>
        </Pressable>
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={12} style={{ alignSelf: 'center', marginTop: 8, paddingVertical: 6 }}>
          <T variant="muted">Wrong email? Change it</T>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
