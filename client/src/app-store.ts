// What the whole app shares: today's puzzle, and short messages that pop up and fade.
import { create } from 'zustand';
import type { TodayView } from '../../shared/types.ts';
import { ApiError, api } from './api.ts';

interface Toast {
  id: number;
  text: string;
}

interface AppStore {
  today: TodayView | null;
  error: string | null;
  loadToday: () => Promise<TodayView | null>;
  setToday: (t: TodayView) => void;
  toasts: Toast[];
  toast: (text: string) => void;
}

let nextId = 1;

export const useApp = create<AppStore>((set, get) => ({
  today: null,
  error: null,
  loadToday: async () => {
    try {
      const today = await api.today();
      set({ today, error: null });
      return today;
    } catch (e) {
      set({ error: e instanceof ApiError ? e.message : 'Something went wrong. Please try again.' });
      return null;
    }
  },
  setToday: (today) => set({ today }),
  toasts: [],
  toast: (text) => {
    const id = nextId++;
    set({ toasts: [...get().toasts, { id, text }] });
    window.setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 3600);
  },
}));
