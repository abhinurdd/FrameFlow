import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientFill, T } from '@/ui/primitives';
import { colors, fonts } from '@/ui/theme';

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'home',
  projects: 'albums',
  styles: 'color-palette',
  me: 'person-circle',
};
const LABELS: Record<string, string> = { index: 'Home', projects: 'Projects', styles: 'Styles', me: 'Me' };

function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const items = state.routes.map((route, index) => {
    const focused = state.index === index;
    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        onPress={() => !focused && navigation.navigate(route.name)}
        style={{ flex: 1, alignItems: 'center', gap: 3 }}>
        <Ionicons name={ICONS[route.name]} size={22} color={focused ? colors.text : colors.textDim} />
        <T style={{ fontFamily: fonts.semibold, fontSize: 10.5, color: focused ? colors.text : colors.textDim }}>{LABELS[route.name]}</T>
      </Pressable>
    );
  });
  // Centre "+" sits between the 2nd and 3rd tabs.
  items.splice(
    2,
    0,
    <Pressable key="new" accessibilityLabel="New project" onPress={() => router.push('/new')} style={{ flex: 1, alignItems: 'center' }}>
      <GradientFill style={{ width: 48, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="add" size={26} color="#fff" />
      </GradientFill>
    </Pressable>,
  );
  return (
    <View
      style={{
        flexDirection: 'row',
        paddingTop: 10,
        paddingBottom: Math.max(insets.bottom, 10),
        backgroundColor: 'rgba(14,14,19,0.98)',
        borderTopWidth: 1,
        borderTopColor: colors.line,
      }}>
      {items}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="projects" />
      <Tabs.Screen name="styles" />
      <Tabs.Screen name="me" />
    </Tabs>
  );
}
