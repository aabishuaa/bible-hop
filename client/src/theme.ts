// The palette, taken from the sample decks: cream parchment, kraft paper, espresso ink,
// with one color for each kind of hop.
import type { Tier } from '../../shared/rules.ts';

export type FlipTier = Tier | 'home';

export const TIER_COLOR: Record<FlipTier, string> = {
  crumb: '#a48a5f',
  loaf: '#b5522a',
  fish: '#1c6e8c',
  pearl: '#7b4a9e',
  home: '#c79226',
  wall: '#8a8179',
};

export const TIER_LABEL: Record<FlipTier, string> = { crumb: 'Crumb', loaf: 'Loaf', fish: 'Fish', pearl: 'Pearl', home: 'Home', wall: 'Wall' };

/** What each tier means, in a few plain words. */
export const TIER_HINT: Record<Tier, string> = {
  crumb: 'A tiny word. Easy to use, worth little, and it can’t take you home.',
  loaf: 'A common word, found in 300 verses or more.',
  fish: 'A less common word, found in 30 to 299 verses.',
  pearl: 'A rare word, found in fewer than 30 verses.',
  wall: 'This word is found in this verse only, so it leads nowhere.',
};

export const INK = '#33211a';
export const CREAM = '#fbeed6';
export const KRAFT = '#ad8650';

export function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** How a hop of each tier moves: how long one page takes to turn, the pause between pages, and how much it curls. */
export const FLIP_FEEL: Record<FlipTier, { duration: number; stagger: number; curl: number; maxLeaves: number }> = {
  crumb: { duration: 380, stagger: 70, curl: 0.45, maxLeaves: 2 },
  loaf: { duration: 520, stagger: 95, curl: 0.6, maxLeaves: 4 },
  fish: { duration: 800, stagger: 140, curl: 0.8, maxLeaves: 6 },
  pearl: { duration: 1250, stagger: 210, curl: 0.92, maxLeaves: 7 },
  home: { duration: 1050, stagger: 130, curl: 0.85, maxLeaves: 8 },
  wall: { duration: 500, stagger: 90, curl: 0.6, maxLeaves: 2 },
};
