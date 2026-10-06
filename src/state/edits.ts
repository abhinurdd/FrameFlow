import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

import { appendAssets, blankEdit, type Asset, type Edit } from '@/engine/timeline';

type State = {
  edits: Edit[];
  createEdit: (assets: Asset[]) => string;
  addEdit: (edit: Edit) => void;
  setEdit: (edit: Edit) => void;
  deleteEdit: (id: string) => void;
};

/**
 * Sliders and typing change the draft many times a second. Writing every change to
 * disk would stall the editor, so writes wait for a short pause.
 */
const pending = new Map<string, ReturnType<typeof setTimeout>>();
const debounced: StateStorage = {
  getItem: (name) => AsyncStorage.getItem(name),
  removeItem: (name) => AsyncStorage.removeItem(name),
  setItem(name, value) {
    clearTimeout(pending.get(name));
    pending.set(name, setTimeout(() => AsyncStorage.setItem(name, value).catch(() => {}), 400));
  },
};

/** Imported media lives in Documents/media. iOS can move the app's folder between launches, so only the file name is trusted. */
function reroot(uri: string) {
  const name = uri.match(/\/Documents\/media\/([^/]+)$/)?.[1];
  return name ? new File(Paths.document, 'media', name).uri : uri;
}

function deleteFile(uri: string) {
  if (!/\/media\/[^/]+$/.test(uri)) return;
  try {
    new File(uri).delete();
  } catch {
    // Already gone.
  }
}

let counter = 0;
export const uid = (p: string) => `${p}_${Date.now().toString(36)}${(counter++).toString(36)}`;

/** Manual-editor drafts. Local only for now; there is no cloud sync. */
export const useEdits = create<State>()(
  persist(
    (set, get) => ({
      edits: [],

      createEdit(assets) {
        const edit = appendAssets(blankEdit(uid('edt'), `Edit ${get().edits.length + 1}`, Date.now()), assets, assets.map(() => uid('seg')));
        set((s) => ({ edits: [edit, ...s.edits] }));
        return edit.id;
      },

      addEdit(edit) {
        set((s) => (s.edits.some((e) => e.id === edit.id) ? s : { edits: [edit, ...s.edits] }));
      },

      setEdit(edit) {
        set((s) => ({ edits: s.edits.map((e) => (e.id === edit.id ? { ...edit, updatedAt: Date.now() } : e)) }));
      },

      deleteEdit(id) {
        const gone = get().edits.find((e) => e.id === id);
        set((s) => ({ edits: s.edits.filter((e) => e.id !== id) }));
        // Free the draft's media, unless another draft uses the same file.
        const inUse = new Set(get().edits.flatMap((e) => Object.values(e.assets).map((a) => a.uri)));
        for (const asset of Object.values(gone?.assets ?? {})) if (!inUse.has(asset.uri)) deleteFile(asset.uri);
      },
    }),
    // Bump the name when the Edit shape changes incompatibly; old drafts are dropped.
    {
      name: 'ff.edits.v2',
      storage: createJSONStorage(() => debounced),
      merge: (persisted, current) => {
        const saved = (persisted as Partial<State> | undefined)?.edits ?? [];
        const edits = saved.map((e) => ({ ...e, assets: Object.fromEntries(Object.entries(e.assets).map(([k, a]) => [k, { ...a, uri: reroot(a.uri) }])) }));
        return { ...current, edits };
      },
    },
  ),
);
