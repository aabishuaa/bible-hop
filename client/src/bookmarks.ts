// Which verses the player has kept in their Journal, shared by every ribbon on screen.
import { create } from 'zustand';
import { api } from './api.ts';

interface BookmarkStore {
  saved: Set<number>;
  loaded: boolean;
  load: () => Promise<void>;
  /** Keeps or lets go of a verse. Returns whether it is now kept. */
  toggle: (verse: number, source?: string) => Promise<boolean>;
  forget: (verse: number) => void;
}

export const useBookmarks = create<BookmarkStore>((set, get) => ({
  saved: new Set(),
  loaded: false,
  load: async () => {
    if (get().loaded) return;
    set({ loaded: true });
    try {
      const { verses } = await api.bookmarks();
      set({ saved: new Set(verses) });
    } catch {
      set({ loaded: false });
    }
  },
  toggle: async (verse, source) => {
    const was = get().saved.has(verse);
    const next = new Set(get().saved);
    if (was) next.delete(verse);
    else next.add(verse);
    set({ saved: next });
    try {
      if (was) await api.removeBookmark(verse);
      else await api.saveBookmark(verse, undefined, source);
      return !was;
    } catch (e) {
      const back = new Set(get().saved);
      if (was) back.add(verse);
      else back.delete(verse);
      set({ saved: back });
      throw e;
    }
  },
  forget: (verse) => {
    const next = new Set(get().saved);
    next.delete(verse);
    set({ saved: next });
  },
}));
