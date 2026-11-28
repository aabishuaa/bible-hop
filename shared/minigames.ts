// The daily mini games: one round of each a day, timed, the same puzzle for everyone.

export type GameId = 'bookit' | 'whoartthou' | 'babble' | 'fixyoureyes' | 'loaves';

/** The games in the daily lineup, in order. */
export const lineup = (): GameInfo[] => GAMES.filter((g) => !g.retired);

export interface GameInfo {
  id: GameId;
  name: string;
  tagline: string;
  icon: string;
  /** How long a round lasts, in plain words. */
  timing: string;
  how: string[];
  cite?: string;
  /** Resting: still playable by its address, but left out of the daily lineup. */
  retired?: boolean;
}

export const GAMES: GameInfo[] = [
  {
    id: 'bookit',
    name: 'Book It',
    tagline: 'Which book is this verse from?',
    icon: 'book',
    timing: '20 seconds',
    how: [
      'A verse appears, just as it is written.',
      'Tap the book of the Bible it comes from. Guess as often as you like.',
      'A wrong guess tells you whether the book is earlier or later in the Bible.',
      'The clock gives you 20 seconds.',
    ],
  },
  {
    id: 'whoartthou',
    name: 'Who Art Thou?',
    tagline: 'Name the Bible character from the clues',
    icon: 'lens',
    timing: '20 seconds a clue',
    how: [
      'The first clue is something only a close reader would know.',
      'Guess the character. A wrong guess, or the clock running out, opens the next clue.',
      'Each clue is more general than the last, but never too easy.',
      'Five clues in all. The fewer you need, the better.',
    ],
    cite: 'Who art thou, Lord? — Acts 9:5',
  },
  {
    id: 'babble',
    name: 'Bible or Babble',
    tagline: 'Is it really in the Bible?',
    icon: 'scroll',
    timing: '15 to 30 seconds each',
    how: [
      'Five sayings that sound like scripture.',
      'Some are in the Bible, word for word. Some only sound like it.',
      'Choose Bible or Babble before the clock runs out. Longer sayings get more time.',
      'Each answer shows you the real verse, or where the saying really comes from.',
    ],
  },
  {
    id: 'fixyoureyes',
    retired: true,
    name: 'Fix Your Eyes',
    tagline: 'Walk on the water to Jesus',
    icon: 'dove',
    timing: '45 seconds',
    how: [
      'Press and hold, and keep your eyes on Jesus, the light across the water.',
      'While your eyes stay on him, Peter walks on the waves.',
      'The wind will push your eyes away. Look at the storm and Peter begins to sink.',
      'Reach Jesus before the clock runs out.',
    ],
    cite: 'Looking unto Jesus — Hebrews 12:2',
  },
  {
    id: 'loaves',
    retired: true,
    name: 'Loaves and Fishes',
    tagline: 'Feed the five thousand',
    icon: 'loaf',
    timing: '45 seconds, then 12',
    how: [
      'The crowd sits in groups, by hundreds and by fifties.',
      'When a group raises its hands, tap it to bless and break the bread for them.',
      'Feed quickly to keep a blessing going: each one in a row feeds more.',
      'Then gather up the fragments into twelve baskets, that nothing be lost.',
    ],
    cite: 'They did all eat, and were filled — Matthew 14:20',
  },
];

export interface PlaySummary {
  game: GameId;
  played: boolean;
  done: boolean;
  won: boolean;
  /** One line about how it went, for the hub. */
  line: string;
  /** Days in a row the player has finished this game. */
  streak: number;
}

export interface GamesHub {
  date: string;
  puzzleNo: number;
  plays: PlaySummary[];
  /** Milliseconds until the next round opens, in the player's time zone. */
  nextIn: number;
  plusOnly: boolean;
  plus: boolean;
  /** Off when the Desk has switched the games off. */
  enabled: boolean;
}

export interface VerseRefView {
  id: number;
  ref: string;
  text: string;
}

/** The end of a round, for every game. */
export interface GameResult {
  won: boolean;
  score: number;
  /** A headline and a line underneath. */
  title: string;
  line: string;
  share: string;
  /** Share of today's players who won this round (for the quiz games). */
  others?: { players: number; wonPct: number };
  /** A verse worth keeping in the Journal, when the round showed one. */
  verse?: VerseRefView;
  streak: number;
  /** The player's record in this game. */
  stats: { played: number; won: number; streak: number; best: number };
  /** How today's players did, bucket by bucket (guesses, clues or sayings right); `mine` is the player's. */
  distribution: { label: string; count: number; mine: boolean }[];
}

// --------------------------------------------------------------------------------------- Book It

export interface BookItState {
  game: 'bookit';
  verseText: string;
  limitMs: number;
  /** Server time the verse was shown, and now. */
  startedAt: number;
  now: number;
  guesses: { book: number; dir: 'earlier' | 'later' | 'right'; sameDivision: boolean }[];
  done: boolean;
  /** Once done: the verse and its book. */
  answer?: { book: number; verse: VerseRefView };
  result?: GameResult;
}

// --------------------------------------------------------------------------------- Who Art Thou?

export interface WhoState {
  game: 'whoartthou';
  clues: { text: string; cite: string }[];
  total: number;
  clueMs: number;
  /** When the newest clue was shown (server time), and now. */
  clueShownAt: number;
  now: number;
  guesses: { text: string; verdict: 'right' | 'wrong' | 'which' | 'timeout' }[];
  names: string[];
  done: boolean;
  answer?: { name: string; summary: string; cite: string };
  result?: GameResult;
}

// ------------------------------------------------------------------------------ Bible or Babble

export interface BabbleItemView {
  text: string;
  limitMs: number;
}

export interface BabbleReveal {
  answer: 'bible' | 'babble';
  /** Bible: the reference and verse. Babble: where it really comes from, or what the Bible says. */
  ref?: string;
  verse?: string;
  why: string;
}

export interface BabbleState {
  game: 'babble';
  count: number;
  index: number;
  current?: BabbleItemView;
  /** True between an answer and the next saying, while the answer is shown. */
  revealing: boolean;
  shownAt: number;
  now: number;
  answers: { choice: 'bible' | 'babble' | null; right: boolean; text: string; reveal: BabbleReveal }[];
  done: boolean;
  result?: GameResult;
}

// --------------------------------------------------------------------------- the action games

export interface ActionState {
  game: 'fixyoureyes' | 'loaves';
  seed: number;
  limitMs: number;
  startedAt: number;
  now: number;
  done: boolean;
  result?: GameResult;
}

export type GameState = BookItState | WhoState | BabbleState | ActionState;
