import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Chip, GradientFill, Panel, Row, T } from '@/ui/primitives';
import { colors, fonts } from '@/ui/theme';

// Pricing hypotheses from the PRD (§3.6); final packaging after Phase 0.
const PLANS = [
  { id: 'week', name: 'Week Pass', price: '₹99', period: '', detail: '25 clips · 7 days · no watermark' },
  { id: 'creator', name: 'Creator', price: '₹299', period: '/mo', detail: '100 clips/mo · brand style · 1080p', popular: true },
  { id: 'pro', name: 'Pro', price: '₹699', period: '/mo', detail: '300 clips/mo · 4K · multi-account · batch links' },
] as const;

export default function Paywall() {
  const [plan, setPlan] = useState<(typeof PLANS)[number]['id']>('creator');
  const chosen = PLANS.find((p) => p.id === plan)!;
  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
      <Row style={{ justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 8 }}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Close">
          <Ionicons name="close" size={24} color={colors.textMuted} />
        </Pressable>
        <T variant="muted">Restore</T>
      </Row>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <T variant="title" style={{ fontSize: 30 }}>Pay for clips,{'\n'}not minutes.</T>
        <T variant="muted" style={{ marginTop: 8 }}>Generate and preview free. Pay only when you export.</T>
        <View style={{ gap: 10, marginTop: 20 }}>
          {PLANS.map((p) => {
            const on = p.id === plan;
            return (
              <Pressable key={p.id} onPress={() => setPlan(p.id)}>
                <Panel style={{ borderWidth: 1.5, borderColor: on ? colors.saffron : colors.line, backgroundColor: on ? colors.saffronSoft : colors.surface }}>
                  {'popular' in p && (
                    <GradientFill style={{ position: 'absolute', top: -9, right: 12, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <T style={{ fontFamily: fonts.heavy, fontSize: 10, color: '#fff' }}>MOST POPULAR</T>
                    </GradientFill>
                  )}
                  <Row style={{ justifyContent: 'space-between' }}>
                    <T style={{ fontFamily: fonts.bold, fontSize: 16 }}>{p.name}</T>
                    <T style={{ fontFamily: fonts.heavy, fontSize: 18 }}>
                      {p.price}
                      <T variant="muted">{p.period}</T>
                    </T>
                  </Row>
                  <T variant="muted" style={{ marginTop: 4 }}>{p.detail}</T>
                </Panel>
              </Pressable>
            );
          })}
          <Panel>
            <Row style={{ justifyContent: 'space-between' }}>
              <T style={{ fontFamily: fonts.bold, fontSize: 16 }}>Free</T>
              <T style={{ fontFamily: fonts.heavy, fontSize: 18 }}>₹0</T>
            </Row>
            <T variant="muted" style={{ marginTop: 4 }}>10 clips/mo · small watermark</T>
          </Panel>
        </View>
        <Row style={{ flexWrap: 'wrap', justifyContent: 'center', marginTop: 18 }}>
          <Chip label="UPI AutoPay" />
          <Chip label="Cancel in 1 tap" />
          <Chip label="7-day refund" />
        </Row>
      </ScrollView>
      <View style={{ paddingHorizontal: 20 }}>
        <Button title={`Start ${chosen.name} · ${chosen.price}${chosen.period}`} onPress={() => router.back()} />
        <T variant="tiny" style={{ textAlign: 'center', marginTop: 8 }}>
          Payments aren&apos;t live yet. Unused clips roll over 1 month · reminder 2 days before renewal
        </T>
      </View>
    </SafeAreaView>
  );
}
