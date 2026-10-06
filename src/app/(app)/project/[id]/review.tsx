import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { clipDuration, type Clip, type ClipStatus, type Script } from '@/engine/types';
import { useProjects } from '@/state/projects';
import { CaptionLine, captionLines, ClipFrame } from '@/ui/clip-visual';
import { GradientFill, Row, T } from '@/ui/primitives';
import { colors, fonts } from '@/ui/theme';

function useCaptionPlayback(clip: Clip | undefined) {
  const id = clip?.id;
  // Keyed by clip so playback restarts from the first word when the card changes.
  const [playback, setPlayback] = useState({ id, tick: 0 });
  useEffect(() => {
    const t = setInterval(() => setPlayback((p) => ({ id, tick: p.id === id ? p.tick + 1 : 1 })), 380);
    return () => clearInterval(t);
  }, [id]);
  const tick = playback.id === id ? playback.tick : 0;
  const lines = clip ? captionLines(clip.spec) : [];
  const per = clip?.spec.captions.wordsPerLine ?? 3;
  const total = lines.reduce((n, l) => n + l.length, 0) || 1;
  const pos = tick % total;
  return { line: lines[Math.floor(pos / per)] ?? [], active: pos % per };
}

function Grade({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: 'center', backgroundColor: 'rgba(0,0,0,.5)', borderRadius: 10, paddingVertical: 4, minWidth: 44 }}>
      <T style={{ fontSize: 9, color: '#BBB', fontFamily: fonts.bold }}>{label}</T>
      <T style={{ fontFamily: fonts.heavy, fontSize: 15 }}>{value}</T>
    </View>
  );
}

export default function Review() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const all = useProjects((s) => s.clips);
  const setClipStatus = useProjects((s) => s.setClipStatus);
  const queue = useMemo(
    () => all.filter((c) => c.projectId === id).sort((a, b) => b.score - a.score),
    // Freeze order on open so cards don't jump while reviewing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id],
  );
  const [index, setIndex] = useState(() => Math.max(0, queue.findIndex((c) => c.status === 'new')));
  const [script, setScript] = useState<Script | null>(null);
  const clip = queue[index];
  const { width } = useWindowDimensions();
  // Read from the root provider: a SafeAreaView inside this full-screen modal reports no insets.
  const insets = useSafeAreaInsets();
  const x = useSharedValue(0);
  const { line, active } = useCaptionPlayback(clip);

  function decide(status: ClipStatus) {
    if (!clip) return;
    Haptics.notificationAsync(status === 'kept' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
    setClipStatus(clip.id, status);
    if (index + 1 >= queue.length) router.back();
    else setIndex(index + 1);
    x.value = 0;
  }

  const fling = (status: 'kept' | 'discarded') => {
    x.value = withTiming(status === 'kept' ? width * 1.3 : -width * 1.3, { duration: 180 }, () => scheduleOnRN(decide, status));
  };

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      x.value = e.translationX;
    })
    .onEnd((e) => {
      if (e.translationX > width * 0.28) {
        x.value = withTiming(width * 1.3, { duration: 160 }, () => scheduleOnRN(decide, 'kept'));
      } else if (e.translationX < -width * 0.28) {
        x.value = withTiming(-width * 1.3, { duration: 160 }, () => scheduleOnRN(decide, 'discarded'));
      } else {
        x.value = withSpring(0);
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { rotate: `${interpolate(x.value, [-width, width], [-12, 12])}deg` }],
  }));
  const keepStyle = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [0, width * 0.25], [0, 1], 'clamp') }));
  const dropStyle = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [-width * 0.25, 0], [1, 0], 'clamp') }));

  if (!clip) return null;
  const shownScript = script ?? clip.spec.captions.script;
  const words = clip.spec.words;
  const start = words[0]?.t0 ?? 0;
  const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <GestureDetector gesture={pan}>
        <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }, cardStyle]}>
          <ClipFrame tone={clip.tone} personSize={width * 0.95} style={{ flex: 1, borderRadius: 0, paddingBottom: 150 }} split={clip.spec.layout.mode === 'split'}>
            <View style={{ position: 'absolute', left: 16, right: 16, top: '52%' }}>
              <CaptionLine words={line} script={shownScript} template={clip.spec.captions.template} fontSize={30} activeIndex={active} />
            </View>
          </ClipFrame>
          <Animated.View style={[{ position: 'absolute', top: 120, left: 24, borderWidth: 3, borderColor: colors.score, borderRadius: 10, paddingHorizontal: 10, transform: [{ rotate: '-12deg' }] }, keepStyle]}>
            <T style={{ fontFamily: fonts.black, fontSize: 28, color: colors.score }}>KEEP</T>
          </Animated.View>
          <Animated.View style={[{ position: 'absolute', top: 120, right: 24, borderWidth: 3, borderColor: colors.danger, borderRadius: 10, paddingHorizontal: 10, transform: [{ rotate: '12deg' }] }, dropStyle]}>
            <T style={{ fontFamily: fonts.black, fontSize: 28, color: colors.danger }}>NOPE</T>
          </Animated.View>
        </Animated.View>
      </GestureDetector>

      <View style={{ flex: 1, paddingTop: insets.top + 6, paddingBottom: insets.bottom + 4 }} pointerEvents="box-none">
        <View pointerEvents="box-none" style={{ paddingHorizontal: 16 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close review" style={{ width: 44, height: 44, justifyContent: 'center' }}>
              <Ionicons name="close" size={26} color="#fff" />
            </Pressable>
            <T style={{ fontFamily: fonts.bold }}>
              {index + 1} / {queue.length}
            </T>
            <Pressable
              onPress={() => setScript(shownScript === 'roman' ? 'devanagari' : shownScript === 'devanagari' ? 'bilingual' : 'roman')}
              accessibilityRole="button"
              accessibilityLabel="Switch caption script"
              hitSlop={8}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 36, borderRadius: 99, backgroundColor: 'rgba(0,0,0,.5)' }}>
              <T style={{ fontSize: 13, fontFamily: fonts.semibold }}>{shownScript === 'roman' ? 'Roman' : shownScript === 'devanagari' ? 'देवनागरी' : 'Both'}</T>
              <Ionicons name="swap-horizontal" size={14} color="#fff" />
            </Pressable>
          </Row>
          <View style={{ height: 3, borderRadius: 3, backgroundColor: 'rgba(255,255,255,.2)', marginTop: 10 }}>
            <View style={{ width: `${((index + 1) / queue.length) * 100}%`, height: 3, borderRadius: 3, backgroundColor: '#fff' }} />
          </View>
          <View style={{ position: 'absolute', right: 16, top: 70, alignItems: 'center', gap: 6 }}>
            <T style={{ fontFamily: fonts.black, fontSize: 28, color: clip.score >= 85 ? colors.score : colors.amber }}>{clip.score}</T>
            <Grade label="Hook" value={clip.grades.hook} />
            <Grade label="Flow" value={clip.grades.flow} />
            <Grade label="Value" value={clip.grades.value} />
          </View>
        </View>

        <View style={{ flex: 1 }} pointerEvents="none" />

        <View style={{ marginHorizontal: 14, padding: 12, borderRadius: 16, backgroundColor: 'rgba(10,10,14,.82)', borderWidth: 1, borderColor: colors.lineStrong }}>
          <T style={{ fontFamily: fonts.bold, color: colors.saffronText }}>{clip.title}</T>
          <T style={{ fontSize: 13, color: '#DADAE4', marginTop: 4 }}>{clip.reason}</T>
          <T variant="tiny" style={{ marginTop: 6 }}>
            {Math.round(clipDuration(clip.spec))}s · {fmt(start)} → {fmt(clip.spec.source.out)} · Speaker {clip.speaker}
          </T>
        </View>

        <Row style={{ justifyContent: 'space-around', marginTop: 18, marginBottom: 6 }}>
          <Pressable onPress={() => fling('discarded')} accessibilityRole="button" accessibilityLabel="Discard clip" style={{ alignItems: 'center', gap: 4 }}>
            <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={28} color={colors.danger} />
            </View>
            <T variant="tiny">Discard</T>
          </Pressable>
          <Pressable onPress={() => router.push(`/clip/${clip.id}`)} accessibilityRole="button" accessibilityLabel="Edit clip" style={{ alignItems: 'center', gap: 4 }}>
            <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="create-outline" size={20} color="#fff" />
            </View>
            <T variant="tiny">Edit</T>
          </Pressable>
          <Pressable onPress={() => fling('kept')} accessibilityRole="button" accessibilityLabel="Keep clip" style={{ alignItems: 'center', gap: 4 }}>
            <GradientFill style={{ width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="checkmark" size={30} color="#fff" />
            </GradientFill>
            <T variant="tiny">Keep</T>
          </Pressable>
        </Row>
        <T variant="tiny" style={{ textAlign: 'center', marginBottom: 6 }}>Swipe left to discard, right to keep</T>
      </View>
    </View>
  );
}
