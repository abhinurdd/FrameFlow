import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { createVideoPlayer } from 'expo-video';

import type { Asset, AssetKind } from '@/engine/timeline';
import { uid } from '@/state/edits';

/**
 * Pickers hand back files in a cache the system may clear, so every import is copied
 * into the app's documents folder. Drafts keep working after a restart.
 */
function keep(uri: string, id: string) {
  const dir = new Directory(Paths.document, 'media');
  if (!dir.exists) dir.create({ intermediates: true });
  const ext = uri.split('?')[0].match(/\.[A-Za-z0-9]+$/)?.[0] ?? '';
  const target = new File(dir, `${id}${ext}`);
  try {
    new File(uri).copy(target);
    return target.uri;
  } catch {
    return uri;
  }
}

/** Length of an audio or video file, read by loading it into a player. */
export function probeDuration(uri: string) {
  return new Promise<number>((resolve) => {
    const player = createVideoPlayer(uri);
    const done = (seconds: number) => {
      sub.remove();
      player.release();
      resolve(seconds);
    };
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') done(player.duration || 0);
      if (status === 'error') done(0);
    });
  });
}

/** Let the user choose videos and photos from their library, in the order they tap them. */
export async function pickMedia(kinds: ('videos' | 'images')[] = ['videos', 'images'], multiple = true): Promise<Asset[]> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: kinds, allowsMultipleSelection: multiple, orderedSelection: true, quality: 1 });
  if (result.canceled) return [];
  return result.assets
    .filter((a) => a.type === 'image' || a.duration)
    .map((a) => {
      const id = uid('ast');
      const kind: AssetKind = a.type === 'image' ? 'image' : 'video';
      return { id, uri: keep(a.uri, id), kind, duration: kind === 'image' ? 0 : a.duration! / 1000, width: a.width, height: a.height, name: a.fileName ?? undefined };
    });
}

export async function pickAudio(): Promise<Asset | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
  if (result.canceled) return null;
  const file = result.assets[0];
  const id = uid('ast');
  const uri = keep(file.uri, id);
  const duration = await probeDuration(uri);
  return duration ? { id, uri, kind: 'audio', duration, width: 0, height: 0, name: file.name } : null;
}

/** Register a file the app produced itself (a recording, or a download from the media server). */
export function localAsset(uri: string, kind: AssetKind, meta: { duration: number; width?: number; height?: number; name?: string; remoteId?: string }): Asset {
  const id = uid('ast');
  return { id, uri: keep(uri, id), kind, duration: meta.duration, width: meta.width ?? 0, height: meta.height ?? 0, name: meta.name, remoteId: meta.remoteId };
}

export async function pickText(type: string): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({ type, copyToCacheDirectory: true });
  if (result.canceled) return null;
  return new File(result.assets[0].uri).text();
}
