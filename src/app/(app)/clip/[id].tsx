import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { clipDuration, type ClipSpec, type LayoutMode, type Script, type Word } from '@/engine/types';
import { useProjects } from '@/state/projects';
import { CaptionLine, captionLines, ClipFrame } from '@/ui/clip-visual';
import { Button, Chip, Label, Panel, Row, Segmented, T, Toggle } from '@/ui/primitives';
import { TEMPLATES } from '@/ui/templates';
import { colors, fonts } from '@/ui/theme';

type Tab = 'transcript' | 'style' | 'layout' | 'hook';
const TABS: { id: Tab; label: string }[] = [
  { id: 'transcript', label: 'Transcript' },
  { id: 'style', label: 'Style' },
  { id: 'layout', label: 'Layout' },
  { id: 'hook', label: 'Hook' },
];

function useHistory(clipId: string) {
  const update = useProjects((s) => s.updateSpec);
  const [history, setHistory] = useState<{ past: ClipSpec[]; future: ClipSpec[] }>({ past: [], future: [] });
  const get = () => useProjects.getState().clips.find((c) => c.id === clipId)?.spec;
  return {
    apply(fn: (s: ClipSpec) => ClipSpec) {
      const cur = get();
      if (!cur) return;
      setHistory((h) => ({ past: [...h.past, cur], future: [] }));
      update(clipId, fn);
    },
    undo() {
      const prev = history.past[history.past.length - 1];
      const cur = get();
      if (!prev || !cur) return;
      setHistory((h) => ({ past: h.past.slice(0, -1), future: [...h.future, cur] }));
      update(clipId, () => prev);
    },
    redo() {
      const next = history.future[history.future.length - 1];
      const cur = get();
      if (!next || !cur) return;
      setHistory((h) => ({ past: [...h.past, cur], future: h.future.slice(0, -1) }));
      update(clipId, () => next);
    },
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}

function Preview({ spec, tone, height }: { spec: ClipSpec; tone: number; height: number }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 400);
    return () => clearInterval(t);
  }, []);
  const lines = captionLines(spec);
  const total = lines.reduce((n, l) => n + l.length, 0) || 1;
  const pos = tick % total;
  const per = spec.captions.wordsPerLine;
  const line = lines[Math.floor(pos / per)] ?? [];
  const width = height * (9 / 16);
  return (
    <View style={{ alignItems: 'center' }}>
      <ClipFrame tone={tone} personSize={width * 0.95} style={{ width, height }} split={spec.layout.mode === 'split'}>
        {spec.hook.enabled && (
          <View style={{ position: 'absolute', top: 14, left: 10, right: 10, backgroundColor: '#fff', borderRadius: 8, paddingVertical: 5, paddingHorizontal: 8 }}>
            <Text style={{ fontFamily: fonts.heavy, fontSize: 11, color: '#111', textAlign: 'center' }} numberOfLines={2}>
              {spec.hook.text}
            </Text>
          </View>
        )}
        <View style={{ position: 'absolute', left: 8, right: 8, top: height * spec.captions.position.y }}>
          <CaptionLine words={line} script={spec.captions.script} template={spec.captions.template} fontSize={15} activeIndex={pos % per} autoEmphasis={spec.captions.autoEmphasis} />
        </View>
      </ClipFrame>
    </View>
  );
}

function Tool({ icon, label, onPress, on }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; on?: boolean }) {
  return (
    <Pressable onPress={onPress} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.saffronSoft : colors.surface2, borderWidth: on ? 1 : 0, borderColor: colors.saffron }}>
        <Ionicons name={icon} size={18} color={on ? colors.saffronText : '#fff'} />
      </View>
      <T style={{ fontSize: 10.5, color: '#C9C9D6', fontFamily: fonts.semibold }}>{label}</T>
    </Pressable>
  );
}

function WordMenu({
  word,
  onClose,
  onToggleEmphasis,
  onDelete,
  onEdit,
}: {
  word: Word;
  onClose: () => void;
  onToggleEmphasis: () => void;
  onDelete: () => void;
  onEdit: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(word.text.roman);
  return (
    <Panel style={{ marginTop: 10, backgroundColor: '#22222C', borderColor: colors.lineStrong }}>
      <Row style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <T style={{ fontFamily: fonts.bold }}>“{word.text.roman}” · <T style={{ fontFamily: fonts.deva }}>{word.text.devanagari}</T></T>
        <Pressable onPress={onClose} hitSlop={10}>
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </Pressable>
      </Row>
      {editing ? (
        <Row>
          <TextInput
            value={text}
            onChangeText={setText}
            autoFocus
            style={{ flex: 1, height: 40, borderRadius: 10, paddingHorizontal: 10, backgroundColor: colors.surface2, color: colors.text, fontFamily: fonts.medium }}
          />
          <Button title="Save" style={{ width: 80 }} onPress={() => onEdit(text.trim() || word.text.roman)} />
        </Row>
      ) : (
        <Row gap={2}>
          <Tool icon="star" label="Emphasize" on={word.emphasis} onPress={onToggleEmphasis} />
          <Tool icon="create-outline" label="Edit" onPress={() => setEditing(true)} />
          <Tool icon="cut-outline" label="Delete" onPress={onDelete} />
        </Row>
      )}
      <T variant="tiny" style={{ marginTop: 10 }}>Fixes are remembered for future videos (coming with the backend).</T>
    </Panel>
  );
}

export default function Editor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const clip = useProjects((s) => s.clips.find((c) => c.id === id));
  const setClipStatus = useProjects((s) => s.setClipStatus);
  const history = useHistory(id);
  const [tab, setTab] = useState<Tab>('transcript');
  const [selected, setSelected] = useState<number | null>(null);

  if (!clip) return null;
  const spec = clip.spec;
  const fillers = spec.words.filter((w) => w.filler && !w.deleted).length;

  const patchWord = (i: number, fn: (w: Word) => Word) =>
    history.apply((s) => ({ ...s, words: s.words.map((w, j) => (j === i ? fn(w) : w)) }));
  const patchCaptions = (patch: Partial<ClipSpec['captions']>) => history.apply((s) => ({ ...s, captions: { ...s.captions, ...patch } }));
  const patchLayout = (patch: Partial<ClipSpec['layout']>) => history.apply((s) => ({ ...s, layout: { ...s.layout, ...patch } }));

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
      <Row style={{ justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 4 }}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Row gap={18}>
          <Pressable onPress={history.undo} disabled={!history.canUndo} accessibilityLabel="Undo">
            <Ionicons name="arrow-undo" size={20} color={history.canUndo ? colors.text : colors.textDim} />
          </Pressable>
          <Pressable onPress={history.redo} disabled={!history.canRedo} accessibilityLabel="Redo">
            <Ionicons name="arrow-redo" size={20} color={history.canRedo ? colors.text : colors.textDim} />
          </Pressable>
        </Row>
        <Pressable
          onPress={() => {
            if (clip.status !== 'exported') setClipStatus(clip.id, 'kept');
            router.push({ pathname: '/export', params: { clipId: clip.id } });
          }}
          style={{ paddingHorizontal: 14, height: 32, borderRadius: 99, justifyContent: 'center', backgroundColor: colors.saffronSoft, borderWidth: 1, borderColor: colors.saffron }}>
          <T style={{ fontFamily: fonts.bold, fontSize: 13, color: colors.saffronText }}>Export</T>
        </Pressable>
      </Row>

      <Preview spec={spec} tone={clip.tone} height={250} />
      <T variant="tiny" style={{ textAlign: 'center', marginTop: 6 }}>
        {Math.round(clipDuration(spec))}s · {clip.title}
      </T>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 14, paddingVertical: 10 }}>
        {TABS.map((t) => (
          <Chip key={t.id} label={t.label} selected={tab === t.id} onPress={() => setTab(t.id)} />
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {tab === 'transcript' && (
          <>
            {fillers > 0 && (
              <Panel style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.amberSoft, borderColor: 'rgba(245,158,11,.5)', paddingVertical: 8 }}>
                <T style={{ flex: 1, color: '#FFD08A', fontSize: 13 }}>{fillers} filler words found</T>
                <Pressable
                  onPress={() => history.apply((s) => ({ ...s, words: s.words.map((w) => (w.filler ? { ...w, deleted: true } : w)) }))}
                  style={{ paddingHorizontal: 10, height: 28, borderRadius: 99, justifyContent: 'center', backgroundColor: colors.surface2 }}>
                  <T style={{ fontSize: 12, fontFamily: fonts.semibold }}>Remove all</T>
                </Pressable>
              </Panel>
            )}
            <Text style={{ marginTop: 12, fontFamily: fonts.medium, fontSize: 15, lineHeight: 26, color: colors.text }}>
              {spec.words.map((w, i) => {
                const speakerChange = i === 0 || spec.words[i - 1].speaker !== w.speaker;
                return (
                  <Text key={`${w.t0}`}>
                    {speakerChange && (
                      <Text style={{ color: w.speaker === 'A' ? colors.speakerA : colors.speakerB, fontFamily: fonts.heavy }}>
                        {i ? '\n' : ''}
                        {w.speaker}{'  '}
                      </Text>
                    )}
                    <Text
                      onPress={() => setSelected(i)}
                      suppressHighlighting
                      style={[
                        w.emphasis && { color: colors.highlight, fontFamily: fonts.heavy },
                        w.filler && !w.deleted && { color: '#FFD08A', textDecorationLine: 'underline', textDecorationStyle: 'dashed' },
                        w.deleted && { color: colors.textDim, textDecorationLine: 'line-through' },
                        selected === i && { backgroundColor: colors.saffron, color: '#fff' },
                      ]}>
                      {spec.captions.script === 'devanagari' ? w.text.devanagari : w.text.roman}
                    </Text>
                    {' '}
                  </Text>
                );
              })}
            </Text>
            {selected !== null && spec.words[selected] && (
              <WordMenu
                key={selected}
                word={spec.words[selected]}
                onClose={() => setSelected(null)}
                onToggleEmphasis={() => patchWord(selected, (w) => ({ ...w, emphasis: !w.emphasis }))}
                onDelete={() => {
                  patchWord(selected, (w) => ({ ...w, deleted: !w.deleted }));
                  setSelected(null);
                }}
                onEdit={(text) => {
                  patchWord(selected, (w) => ({ ...w, text: { ...w.text, roman: text } }));
                  setSelected(null);
                }}
              />
            )}
            <T variant="tiny" style={{ marginTop: 14 }}>Tap a word to emphasize, fix or cut it. Struck-through words are cut from the video.</T>
          </>
        )}

        {tab === 'style' && (
          <>
            <Label style={{ marginTop: 4 }}>Script · switch anytime</Label>
            <Segmented<Script>
              value={spec.captions.script}
              onChange={(v) => patchCaptions({ script: v })}
              options={[
                { value: 'roman', label: 'Roman' },
                { value: 'devanagari', label: 'देवनागरी' },
                { value: 'bilingual', label: 'Both' },
              ]}
            />
            <Label>Template</Label>
            <Row style={{ flexWrap: 'wrap' }}>
              {TEMPLATES.map((t) => (
                <Chip key={t.id} label={t.name} selected={spec.captions.template === t.id} onPress={() => patchCaptions({ template: t.id })} />
              ))}
            </Row>
            <Label>Words per line</Label>
            <Row>
              {[1, 2, 3, 4].map((n) => (
                <Chip key={n} label={String(n)} selected={spec.captions.wordsPerLine === n} onPress={() => patchCaptions({ wordsPerLine: n })} />
              ))}
            </Row>
            <Label>Position</Label>
            <Segmented
              value={spec.captions.position.y < 0.5 ? 'top' : spec.captions.position.y < 0.7 ? 'middle' : 'bottom'}
              onChange={(v) => patchCaptions({ position: { y: v === 'top' ? 0.22 : v === 'middle' ? 0.55 : 0.72 } })}
              options={[
                { value: 'top', label: 'Top' },
                { value: 'middle', label: 'Middle' },
                { value: 'bottom', label: 'Bottom' },
              ]}
            />
            <Row style={{ justifyContent: 'space-between', marginTop: 16 }}>
              <T>Auto emphasis (AI keywords)</T>
              <Toggle value={spec.captions.autoEmphasis} onChange={(v) => patchCaptions({ autoEmphasis: v })} />
            </Row>
          </>
        )}

        {tab === 'layout' && (
          <>
            <Label style={{ marginTop: 4 }}>Layout</Label>
            <Row style={{ flexWrap: 'wrap' }}>
              {(['auto', 'fill', 'fit', 'split'] as LayoutMode[]).map((m) => (
                <Chip key={m} label={m[0].toUpperCase() + m.slice(1)} selected={spec.layout.mode === m} onPress={() => patchLayout({ mode: m })} />
              ))}
            </Row>
            <T variant="tiny" style={{ marginTop: 8 }}>Split shows both speakers stacked. Auto switches to solo when one person talks.</T>
            <Row style={{ justifyContent: 'space-between', marginTop: 16 }}>
              <T>Follow active speaker</T>
              <Toggle value={spec.layout.followSpeaker} onChange={(v) => patchLayout({ followSpeaker: v })} />
            </Row>
            <Row style={{ justifyContent: 'space-between', marginTop: 14 }}>
              <T>Keep original framing</T>
              <Toggle value={spec.layout.keepOriginal} onChange={(v) => patchLayout({ keepOriginal: v })} />
            </Row>
          </>
        )}

        {tab === 'hook' && (
          <>
            <Row style={{ justifyContent: 'space-between', marginTop: 4 }}>
              <T>Show hook title</T>
              <Toggle value={spec.hook.enabled} onChange={(v) => history.apply((s) => ({ ...s, hook: { ...s.hook, enabled: v } }))} />
            </Row>
            <Label>Hook text</Label>
            <Panel style={{ paddingVertical: 4 }}>
              <TextInput
                value={spec.hook.text}
                onChangeText={(v) => useProjects.getState().updateSpec(clip.id, (s) => ({ ...s, hook: { ...s.hook, text: v } }))}
                style={{ minHeight: 44, color: colors.text, fontFamily: fonts.semibold, fontSize: 15 }}
                multiline
              />
            </Panel>
            <Label>AI suggestions</Label>
            {[clip.title, `Ye galti 90% log karte hain`, `${clip.tags[0] === 'money' ? 'Paisa' : 'Career'} ka sach koi nahi batata`].map((h) => (
              <Pressable key={h} onPress={() => history.apply((s) => ({ ...s, hook: { text: h, enabled: true } }))}>
                <Panel style={{ marginBottom: 8, paddingVertical: 10 }}>
                  <T style={{ fontSize: 13.5 }}>{h}</T>
                </Panel>
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
