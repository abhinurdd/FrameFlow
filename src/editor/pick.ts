import * as ImagePicker from 'expo-image-picker';

import type { Asset } from '@/engine/timeline';
import { uid } from '@/state/edits';

/** Let the user choose videos from their library, in the order they tap them. */
export async function pickVideos(): Promise<Asset[]> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], allowsMultipleSelection: true, orderedSelection: true });
  if (result.canceled) return [];
  return result.assets
    .filter((a) => a.duration)
    .map((a) => ({ id: uid('ast'), uri: a.uri, duration: a.duration! / 1000, width: a.width, height: a.height }));
}
