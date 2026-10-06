import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { buildWords, SAMPLE_CLIPS } from '@/engine/sample-content';
import { usePrefs } from '@/state/prefs';
import { CaptionLine, ClipFrame } from '@/ui/clip-visual';
import { T } from '@/ui/primitives';
import { TEMPLATES } from '@/ui/templates';
import { colors, fonts } from '@/ui/theme';


const preview = buildWords(SAMPLE_CLIPS[0], 0).slice(22, 26);

export default function Styles() {
  const defaults = usePrefs((s) => s.defaults);
  const setDefaults = usePrefs((s) => s.setDefaults);
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 18 }}>
        <T variant="title">Caption styles</T>
        <T variant="muted" style={{ marginTop: 4 }}>Your default for new projects. Brand presets are coming soon.</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
          {TEMPLATES.map((t, i) => {
            const on = defaults.template === t.id;
            return (
              <Pressable key={t.id} onPress={() => setDefaults({ ...defaults, template: t.id })} style={{ width: '47%', flexGrow: 1 }}>
                <ClipFrame tone={i} personSize={150} style={{ height: 230, borderWidth: on ? 2 : 0, borderColor: colors.saffron }}>
                  <View style={{ position: 'absolute', left: 6, right: 6, top: 150 }}>
                    <CaptionLine words={preview} script={defaults.script} template={t.id} fontSize={17} activeIndex={1} />
                  </View>
                </ClipFrame>
                <T style={{ fontFamily: fonts.bold, marginTop: 8 }}>{t.name}{on ? '  ✓' : ''}</T>
                <T variant="tiny">{t.note}</T>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
