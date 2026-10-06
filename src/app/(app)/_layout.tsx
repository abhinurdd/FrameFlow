import { Stack } from 'expo-router';

import { colors } from '@/ui/theme';

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="project/[id]/review" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
      <Stack.Screen name="export" options={{ presentation: 'modal' }} />
      <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
