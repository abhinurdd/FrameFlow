import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { isDemoMode, useAuth } from '@/services/auth';
import { usePrefs } from '@/state/prefs';
import { Panel, Row, T } from '@/ui/primitives';
import { colors, fonts } from '@/ui/theme';

function Item({ icon, label, detail, onPress, danger }: { icon: keyof typeof Ionicons.glyphMap; label: string; detail?: string; onPress?: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 }}>
      <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.textMuted} />
      <T style={{ flex: 1, color: danger ? colors.danger : colors.text }}>{label}</T>
      {detail && <T variant="muted">{detail}</T>}
      {!danger && <Ionicons name="chevron-forward" size={16} color={colors.textDim} />}
    </Pressable>
  );
}

export default function Me() {
  const { user, signOut } = useAuth();
  const balance = usePrefs((s) => s.clipBalance);
  const persona = usePrefs((s) => s.persona);
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 18 }}>
        <T variant="title">Me</T>
        <Panel style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.saffronSoft, alignItems: 'center', justifyContent: 'center' }}>
            <T style={{ fontFamily: fonts.heavy, fontSize: 18, color: colors.saffronText }}>{(user?.name ?? user?.email ?? '?')[0].toUpperCase()}</T>
          </View>
          <View style={{ flex: 1 }}>
            <T style={{ fontFamily: fonts.bold }}>{user?.name ?? 'Creator'}</T>
            <T variant="muted">{user?.email}</T>
          </View>
        </Panel>

        <Panel style={{ marginTop: 12 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View>
              <T variant="label">Free plan</T>
              <T style={{ fontFamily: fonts.heavy, fontSize: 22, marginTop: 4 }}>{balance} clips left</T>
            </View>
            <Pressable onPress={() => router.push('/paywall')} style={{ paddingHorizontal: 14, height: 36, borderRadius: 12, justifyContent: 'center', backgroundColor: colors.saffronSoft, borderWidth: 1, borderColor: colors.saffron }}>
              <T style={{ fontFamily: fonts.bold, color: colors.saffronText }}>Upgrade</T>
            </Pressable>
          </Row>
        </Panel>

        <Panel style={{ marginTop: 12, paddingVertical: 2 }}>
          <Item icon="sparkles-outline" label="Content type" detail={persona ?? '—'} onPress={() => usePrefs.setState({ onboarded: false })} />
          <Item icon="receipt-outline" label="Usage history" />
          <Item icon="logo-whatsapp" label="Help on WhatsApp" />
          <Item icon="shield-checkmark-outline" label="Privacy & data" />
        </Panel>

        <Panel style={{ marginTop: 12, paddingVertical: 2 }}>
          <Item icon="log-out-outline" label="Sign out" danger onPress={signOut} />
        </Panel>
        {isDemoMode && <T variant="tiny" style={{ marginTop: 14, textAlign: 'center' }}>Demo mode · backend not connected</T>}
      </ScrollView>
    </SafeAreaView>
  );
}
