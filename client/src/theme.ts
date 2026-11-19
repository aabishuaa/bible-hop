// The palette, taken from the sample decks: cream parchment, kraft paper, espresso ink,
// with one color for each kind of hop.
import type { Tier } from '../../shared/rules.ts';

export type FlipTier = Tier | 'home';

export const TIER_COLOR: Record<FlipTier, string> = {
  crumb: '#a48a5f',
  loaf: '#b5522a',
  fish: '#1c6e8c',
  pearl: '#7b4a9e',
  nugget: '#d49a12',
  home: '#c79226',
  wall: '#8a8179',
};

export const TIER_LABEL: Record<FlipTier, string> = { crumb: 'Crumb', loaf: 'Loaf', fish: 'Fish', pearl: 'Pearl', nugget: 'Golden Nugget', home: 'Home', wall: 'Wall' };

/** What each tier means, in a few plain words. */
export const TIER_HINT: Record<Tier, string> = {
  crumb: 'A tiny word. Easy to use, worth little, and it can’t take you home.',
  loaf: 'A common word, found in 300 verses or more.',
  fish: 'A less common word, found in 30 to 299 verses.',
  pearl: 'A rare word, found in fewer than 30 verses.',
  nugget: 'Found in just one other verse. Worth 50, and it opens the Golden Road home.',
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
  crumb: { duration: 520, stagger: 85, curl: 0.5, maxLeaves: 2 },
  loaf: { duration: 720, stagger: 120, curl: 0.65, maxLeaves: 4 },
  fish: { duration: 1050, stagger: 170, curl: 0.82, maxLeaves: 6 },
  pearl: { duration: 1600, stagger: 240, curl: 0.92, maxLeaves: 7 },
  nugget: { duration: 1900, stagger: 230, curl: 0.95, maxLeaves: 9 },
  home: { duration: 1350, stagger: 160, curl: 0.86, maxLeaves: 8 },
  wall: { duration: 600, stagger: 100, curl: 0.6, maxLeaves: 2 },
};
