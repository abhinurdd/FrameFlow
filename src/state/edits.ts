import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { appendAssets, type Asset, type Edit } from '@/engine/timeline';

type State = {
  edits: Edit[];
  createEdit: (assets: Asset[]) => string;
  setEdit: (edit: Edit) => void;
  deleteEdit: (id: string) => void;
};

let counter = 0;
export const uid = (p: string) => `${p}_${Date.now().toString(36)}${(counter++).toString(36)}`;

/** Manual-editor drafts. Local only for now; there is no cloud sync. */
export const useEdits = create<State>()(
  persist(
    (set, get) => ({
      edits: [],

      createEdit(assets) {
        const now = Date.now();
        const blank: Edit = { id: uid('edt'), name: `Edit ${get().edits.length + 1}`, aspect: 'original', assets: {}, main: [], texts: [], createdAt: now, updatedAt: now };
        const edit = appendAssets(blank, assets, assets.map(() => uid('seg')));
        set((s) => ({ edits: [edit, ...s.edits] }));
        return edit.id;
      },

      setEdit(edit) {
        set((s) => ({ edits: s.edits.map((e) => (e.id === edit.id ? { ...edit, updatedAt: Date.now() } : e)) }));
      },

      deleteEdit(id) {
        set((s) => ({ edits: s.edits.filter((e) => e.id !== id) }));
      },
    }),
    { name: 'ff.edits', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
