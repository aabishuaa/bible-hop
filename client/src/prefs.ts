// What a player has chosen on this device (rule 14.7): sound, haptics, motion, text size, word values.
import { create } from 'zustand';
import { haptics } from './fx/haptics.ts';
import { sound } from './fx/sound.ts';

export interface Prefs {
  sound: boolean;
  volume: number;
  haptics: boolean;
  /** auto follows the device's "reduce motion" setting. */
  motion: 'auto' | 'full' | 'reduced';
  /** 1 is the normal size. */
  textSize: number;
  /** Show each word's tier on the page at all times, or only when a word is tapped (rule 14.2). */
  showValues: boolean;
  /** On a wide screen: the current page alone, or the open book with the home verse and path on the left. */
  pages: 'one' | 'two';
}

const KEY = 'bible-hopping.prefs.v1';
const DEFAULTS: Prefs = { sound: true, volume: 0.8, haptics: true, motion: 'auto', textSize: 1, showValues: true, pages: 'one' };

function load(): Prefs {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULTS;
  }
}

function apply(p: Prefs): void {
  sound.enabled = p.sound;
  sound.setVolume(p.volume);
  haptics.enabled = p.haptics;
  document.documentElement.style.setProperty('--text-scale', String(p.textSize));
  document.documentElement.dataset.motion = reducedMotion(p) ? 'reduced' : 'full';
  document.documentElement.dataset.values = p.showValues ? 'on' : 'off';
}

export function reducedMotion(p: Prefs): boolean {
  if (p.motion === 'reduced') return true;
  if (p.motion === 'full') return false;
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface PrefsStore extends Prefs {
  set: (patch: Partial<Prefs>) => void;
}

export const usePrefs = create<PrefsStore>((set, get) => {
  const initial = load();
  apply(initial);
  return {
    ...initial,
    set: (patch) => {
      set(patch);
      const { set: _omit, ...rest } = get();
      apply(rest);
      try {
        localStorage.setItem(KEY, JSON.stringify(rest));
      } catch {
        /* private browsing: the choice lasts for this visit */
      }
    },
  };
});

export const isReducedMotion = () => reducedMotion(usePrefs.getState());

/** Typed text is kept on the device until its hop is made, so nothing is lost offline (rule 12.13). */
export const drafts = {
  key: (journeyId: string, verse: number) => `bible-hopping.draft.${journeyId}.${verse}`,
  load(journeyId: string, verse: number): { door: string; typed: string; reference: string } | null {
    try {
      return JSON.parse(sessionStorage.getItem(this.key(journeyId, verse)) ?? 'null');
    } catch {
      return null;
    }
  },
  save(journeyId: string, verse: number, d: { door: string; typed: string; reference: string }): void {
    try {
      sessionStorage.setItem(this.key(journeyId, verse), JSON.stringify(d));
    } catch {
      /* nothing to do */
    }
  },
  clear(journeyId: string, verse: number): void {
    try {
      sessionStorage.removeItem(this.key(journeyId, verse));
    } catch {
      /* nothing to do */
    }
  },
};
