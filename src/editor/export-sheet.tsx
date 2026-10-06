import { Ionicons } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { aspectRatio, totalDuration, type Edit } from '@/engine/timeline';
import { Button, Chip, Row, T } from '@/ui/primitives';
import { colors, fonts } from '@/ui/theme';

import { render, type RenderSettings } from './api';

const HEIGHTS: { value: RenderSettings['height']; label: string }[] = [
  { value: 720, label: '720p' },
  { value: 1080, label: '1080p' },
  { value: 1440, label: '2K' },
  { value: 2160, label: '4K' },
];
const RATES: RenderSettings['fps'][] = [24, 30, 60];

type Stage = { kind: 'idle' } | { kind: 'working'; label: string; progress: number } | { kind: 'done'; uri: string; saved: boolean } | { kind: 'error'; message: string };

/** Export: choose quality, render on the media server, then save or share the file. */
export function ExportSheet({ edit, onClose, onUploaded }: { edit: Edit; onClose: () => void; onUploaded: (edit: Edit) => void }) {
  const [settings, setSettings] = useState<RenderSettings>({ height: 1080, fps: 30 });
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const ratio = aspectRatio(edit);
  // The short side carries the "p" number, as on every other editor.
  const short = settings.height;
  const size = ratio >= 1 ? `${Math.round((short * ratio) / 2) * 2}×${short}` : `${short}×${Math.round(short / ratio / 2) * 2}`;
  const mbps = settings.bitrateMbps ?? Math.round((short / 1080) ** 2 * 8 * (settings.fps / 30));
  const megabytes = ((mbps + 0.2) * totalDuration(edit)) / 8;

  async function start() {
    setStage({ kind: 'working', label: 'Preparing', progress: 0 });
    try {
      const pixelHeight = ratio >= 1 ? short : Math.round(short / ratio / 2) * 2;
      const out = await render(edit, { ...settings, height: pixelHeight as RenderSettings['height'], bitrateMbps: mbps }, (label, progress) => setStage({ kind: 'working', label, progress }));
      onUploaded(out.edit);
      setStage({ kind: 'done', uri: out.uri, saved: false });
    } catch (e) {
      setStage({ kind: 'error', message: e instanceof Error ? e.message : 'Export failed' });
    }
  }

  async function save(uri: string) {
    const permission = await MediaLibrary.requestPermissionsAsync(true);
    if (!permission.granted) {
      setStage({ kind: 'error', message: 'Allow photo library access to save the video.' });
      return;
    }
    await MediaLibrary.saveToLibraryAsync(uri);
    setStage({ kind: 'done', uri, saved: true });
  }

  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' }}>
      <Pressable style={{ flex: 1 }} onPress={stage.kind === 'working' ? undefined : onClose} />
      <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 34, gap: 14 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T variant="h1">Export</T>
          {stage.kind !== 'working' && (
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          )}
        </Row>

        {stage.kind === 'idle' && (
          <>
            <View style={{ gap: 8 }}>
              <T variant="label">Resolution</T>
              <Row gap={6}>
                {HEIGHTS.map((h) => (
                  <Chip key={h.value} label={h.label} selected={settings.height === h.value} onPress={() => setSettings({ ...settings, height: h.value })} />
                ))}
              </Row>
            </View>
            <View style={{ gap: 8 }}>
              <T variant="label">Frame rate</T>
              <Row gap={6}>
                {RATES.map((f) => (
                  <Chip key={f} label={`${f} fps`} selected={settings.fps === f} onPress={() => setSettings({ ...settings, fps: f })} />
                ))}
              </Row>
            </View>
            <T variant="muted">
              {size} · about {megabytes < 10 ? megabytes.toFixed(1) : Math.round(megabytes)} MB
            </T>
            <Button title="Export video" onPress={start} />
          </>
        )}

        {stage.kind === 'working' && (
          <View style={{ gap: 10, paddingVertical: 8 }}>
            <T style={{ fontFamily: fonts.bold }}>
              {stage.label} · {Math.round(stage.progress * 100)}%
            </T>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surface2, overflow: 'hidden' }}>
              <View style={{ width: `${Math.round(stage.progress * 100)}%`, height: 6, backgroundColor: colors.saffron }} />
            </View>
            <T variant="muted">You can keep this screen open; the render runs on the server.</T>
          </View>
        )}

        {stage.kind === 'done' && (
          <View style={{ gap: 10 }}>
            <Row>
              <Ionicons name="checkmark-circle" size={22} color={colors.score} />
              <T style={{ fontFamily: fonts.bold }}>{stage.saved ? 'Saved to your gallery' : 'Your video is ready'}</T>
            </Row>
            <Row gap={8}>
              <Button title={stage.saved ? 'Saved' : 'Save to gallery'} disabled={stage.saved} style={{ flex: 1 }} onPress={() => save(stage.uri)} />
              <Button title="Share" variant="secondary" style={{ flex: 1 }} onPress={() => Sharing.shareAsync(stage.uri, { mimeType: 'video/mp4' })} />
            </Row>
          </View>
        )}

        {stage.kind === 'error' && (
          <View style={{ gap: 10 }}>
            <T style={{ color: colors.danger, fontFamily: fonts.semibold }}>{stage.message}</T>
            <Button title="Try again" variant="secondary" onPress={() => setStage({ kind: 'idle' })} />
          </View>
        )}
      </View>
    </View>
  );
}
