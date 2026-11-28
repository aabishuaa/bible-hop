// What the server and the client say to each other.
import type { Tier } from './rules.ts';

export type Wording = 'kjv' | 'web';
export type LossReason = 'lamp' | 'door' | 'wilderness' | 'fish' | 'famine' | 'rooster';
export type GraceLoss = 'lamp' | 'fish' | 'famine' | 'rooster';
export type JourneyKind = 'daily' | 'practice' | 'guide' | 'sandbox';
export type JourneyMode = 'standard' | 'berean';
export type JourneyStatus = 'playing' | 'won' | 'lost';
export type RefScore = 'exact' | 'chapter' | 'book' | 'none';
export type HowIdentified = 'reference' | 'match' | 'rival-reference' | 'confirmed' | 'chosen' | 'ai' | 'golden';

/** open: can be chosen. used: already used in this verse. wall: found in this verse only. spent: used today (Berean Mode). */
export type DoorState = 'open' | 'used' | 'wall' | 'spent';

export interface DoorView {
  /** The word family: "light" for light, lights, lighted, lit. */
  key: string;
  tier: Tier;
  value: number;
  /** How many verses contain it. */
  count: number;
  /** The forms that count, most common first (up to 6). */
  forms: string[];
  /** Whether the home verse contains it too. Never set for crumbs. */
  inHome: boolean;
  state: DoorState;
}

export interface TokenView {
  s: string;
  /** For a word: index into the verse's doors. */
  d?: number;
}

export interface VerseView {
  id: number;
  ref: string;
  book: number;
  bookName: string;
  chapter: number;
  verse: number;
  /** 0 at Genesis 1:1, 1 at Revelation 22:21. */
  position: number;
  wordings: Partial<Record<Wording, TokenView[]>>;
  doors: DoorView[];
}

export interface VerseText {
  id: number;
  ref: string;
  text: string;
  wording: Wording;
}

/** One hop, as recorded (rule 3.11). */
export interface HopRecord {
  n: number;
  from: number;
  to: number;
  fromRef: string;
  toRef: string;
  doorWord: string;
  family: string;
  forms: string[];
  tier: Tier;
  base: number;
  refText: string;
  refScore: RefScore;
  multiplier: number;
  manna: number;
  oil: number;
  revisit: boolean;
  widow: number;
  home: boolean;
  calf: number;
  how: HowIdentified;
  at: number;
  /** A challenge this hop met, which multiplied its manna. */
  challenge?: ChallengeView;
}

/** A challenge on offer: a word to hop through (door) or a word the next verse should share (tagalong). */
export interface ChallengeView {
  kind: 'door' | 'tagalong';
  word: string;
  times: number;
}

export interface MessageView {
  code: string;
  text: string;
  /** good: a hop. warn: refused or asked. bad: a strike or a loss. info: neutral. */
  tone: 'good' | 'warn' | 'bad' | 'info';
}

export type PendingView =
  | { type: 'confirm'; how: 'match' | 'ai'; verse: VerseText; message: MessageView }
  | { type: 'choose'; options: VerseText[]; message: MessageView }
  | { type: 'lamp'; verse: VerseText; burn: number; have: number; message: MessageView }
  | { type: 'grace'; losses: GraceLoss[]; loss: LossInfo; graceText: string };

export interface LossInfo {
  reason: LossReason;
  name: string;
  line: string;
  cite: string;
}

export interface ChainStep {
  verse: number;
  ref: string;
  position: number;
  /** Absent for the first step (home). */
  door?: string;
  tier?: Tier;
  manna?: number;
  revisit?: boolean;
  widow?: number;
  home?: boolean;
}

export interface LookBackInfo {
  available: boolean;
  toRef: string;
  earned: number;
  salt: number;
  cost: number;
  /** Looking back now would bring Famine (manna is already below zero). */
  famine: boolean;
}

export interface JourneyView {
  id: string;
  kind: JourneyKind;
  mode: JourneyMode;
  date: string;
  puzzleNo: number;
  status: JourneyStatus;
  loss?: LossInfo;
  version: number;
  /** UTC milliseconds; null for practice. */
  deadline: number | null;
  tz: string;
  tzLabel: string;
  manna: number;
  oil: number;
  oilCap: number;
  strikes: number;
  strikesMax: number;
  hops: number;
  hopLimit: number;
  graces: number;
  cord: { have: number; need: number };
  gate: number;
  home: VerseView;
  current: VerseView;
  /** The tier of the door that brought the player to the current verse. */
  arrivedBy?: Tier;
  chain: ChainStep[];
  pending: PendingView | null;
  lookBack: LookBackInfo;
  /** A Golden Nugget brought the player here: one tap takes them home. */
  goldenRoad: boolean;
  /** A challenge on offer where the player stands; `family` is the door key it is about. */
  challenge: (ChallengeView & { family: string }) | null;
  /** Berean Mode can still be switched on or off (before the first hop). */
  canChangeMode: boolean;
  /** Minutes left, when under the late-start warning (rule 12.8). */
  lateMinutes?: number;
  features: { wordingSwitch: boolean; berean: boolean; concordance: boolean };
}

export type OutcomeKind =
  | 'hop' | 'home' | 'refuse' | 'strike' | 'gap' | 'ask' | 'confirm' | 'choose' | 'lamp'
  | 'grace' | 'lost' | 'lookback' | 'graceUsed' | 'declined' | 'nothing' | 'stale';

/** What an action did. `journey` is always the state after it. */
export interface ActionResult {
  kind: OutcomeKind;
  message: MessageView | null;
  /** Extra lines: the long-text reminder, the stuck hint, Widow's Oil. */
  notes: MessageView[];
  hop?: HopRecord;
  /** Hops undone by this action (looking back, or Grace for the fish). */
  undone?: HopRecord;
  journey: JourneyView;
  /** Set when the day has just ended. */
  finale?: FinaleView;
  /** Whether this attempt can be reported as a wrong call (rule 10.5). */
  reportable?: number;
}

export interface NumbersView {
  hops: number;
  manna: number;
  oilLeft: number;
  oilCap: number;
  books: number;
  testaments: number;
  rarest: { word: string; count: number; tier: Tier } | null;
  exactRefs: number;
  revisits: number;
  looksBack: number;
  strikes: number;
  graceUsed: boolean;
}

/** One stop on the replay of a finished trip (rule 13.4). */
export interface RoadStop {
  id: number;
  ref: string;
  wording: Wording;
  /** The verse as printed. m marks the word the player came in by, or left by. */
  tokens: { s: string; m?: 'in' | 'out' }[];
  position: number;
  /** The hop that led here. Absent at the first stop (home). */
  hop?: HopRecord;
  /** When the entry (or exit) word is not in the displayed wording: which wording has it. */
  cameByIn?: Wording;
  leftByIn?: Wording;
}

export interface Achievement {
  id: string;
  /** One of the badges shown on the home screen. */
  badge?: boolean;
  icon?: string;
  /** For a badge: how many times it has been earned, and the first and latest dates. */
  count?: number;
  firstOn?: string;
  name: string;
  how: string;
  cite?: string;
  earnedOn?: string;
}

export interface FinaleView {
  date: string;
  puzzleNo: number;
  kind: JourneyKind;
  mode: JourneyMode;
  won: boolean;
  loss?: LossInfo;
  home: VerseText;
  homeWord?: string;
  homeTier?: Tier;
  calf: number;
  manna: number;
  treasure: number;
  streak: number;
  path: HopRecord[];
  road: RoadStop[];
  numbers: NumbersView;
  /** The plain-text share card (rule 13.6). */
  share: string;
  shareTiers: Tier[];
  looksBack: number;
  achievements: Achievement[];
}

export interface BookSpan {
  name: string;
  short: string;
  division: string;
  testament: 'OT' | 'NT';
  /** Start and end as shares of the Bible's verses. */
  start: number;
  end: number;
}

export interface PlayerView {
  id: string;
  guest: boolean;
  name: string | null;
  treasure: number;
  streak: number;
  bestStreak: number;
  restDay: number; // 0 Sunday, 6 Saturday, -1 none
  wording: Wording;
  scribe: boolean;
  firstTime: boolean;
  wins: number;
  played: number;
  /** Bible Hopping Plus (Infinity mode and the like). */
  plus: boolean;
  /** The Sunday School allowance: journeys used, the free number, and how many are left (null with Plus). */
  practice: { used: number; free: number; left: number | null };
}

export interface DayResult {
  date: string;
  puzzleNo: number;
  status: JourneyStatus | 'missed' | 'rest';
  loss?: LossReason;
  manna: number;
  hops: number;
  homeRef?: string;
  share?: string;
  mode?: JourneyMode;
}

export interface TodayView {
  date: string;
  puzzleNo: number;
  /** null when the game has not launched yet in the player's time zone. */
  home: VerseView | null;
  theme: string | null;
  deadline: number;
  tz: string;
  tzLabel: string;
  serverNow: number;
  lateMinutes: number | null;
  journey: { status: JourneyStatus; hops: number; manna: number; mode: JourneyMode } | null;
  yesterday: DayResult | null;
  player: PlayerView;
  announcements: { id: number; title: string; body: string }[];
  notes: { id: number; text: string; at: number }[];
  features: { berean: boolean; sundaySchool: boolean; revelation: boolean; achievements: boolean; wordingSwitch: boolean; aiCheck: boolean };
  books: BookSpan[];
}

export interface HistoryView {
  days: DayResult[];
  player: PlayerView;
  launchDate: string;
  achievements: Achievement[];
  allAchievements: Achievement[];
  /** Every badge, with how many times it has been earned. */
  badges: Achievement[];
}

export interface RevelationView {
  date: string;
  puzzleNo: number;
  homeRef: string;
  players: number;
  winRate: number;
  best: { manna: number; share: string; route: ChainStep[] } | null;
  firstDoor: string | null;
  homeDoor: string | null;
  rarestHomeDoor: { word: string; count: number } | null;
  place: { rank: number; of: number } | null;
}

export interface ConcordanceView {
  word: string;
  total: number;
  verses: VerseText[];
}

export interface ApiError {
  error: string;
  message: string;
}

export interface StandingRow {
  rank: number;
  name: string;
  /** Playing without an account. Guests show on the board like everyone else. */
  guest: boolean;
  manna: number;
  hops: number;
  oil: number;
  won: boolean;
  tiers: import('./rules.ts').Tier[];
  you: boolean;
}

/**
 * The day's standings. Finished journeys rank by making it home, then manna, then oil left, then
 * fewer hops. The score on the curve is the manna brought home: a journey that did not make it home
 * scores 0, because its manna spoiled.
 */
export interface StandingsView {
  date: string;
  puzzleNo: number;
  /** Finished journeys, and journeys still under way. */
  players: number;
  playing: number;
  won: number;
  lost: number;
  /** The normal curve fitted to the scores. */
  mean: number;
  sd: number;
  /** Every score (or an even sample of them, when there are very many), lowest first. */
  scores: number[];
  you: { rank: number; of: number; better: number; score: number; won: boolean } | null;
  top: StandingRow[];
  /** When this was worked out (server time), for the live board. */
  at: number;
}

/** A verse the player kept in their Journal, with their own note. */
export interface Bookmark {
  verse: number;
  ref: string;
  text: string;
  wording: Wording;
  note: string;
  savedAt: number;
  /** How many times the player has hopped to it. */
  uses: number;
  /** Where it was kept: page (while hopping), road (the Emmaus Road), game, journal. */
  source: string | null;
}

/** One of the player's go-to verses: the ones they hop to most. */
export interface TopVerse {
  verse: number;
  ref: string;
  text: string;
  wording: Wording;
  count: number;
  /** Its place among the player's own verses (ties share a place). */
  rank: number;
  /** Its place among every player's most-used verses. */
  everyoneRank: number | null;
  lastUsed: number;
  saved: boolean;
}

/** A journey as the Journal remembers it: where it set out, the words it went through, how it ended. */
export interface JournalTrip {
  date: string;
  puzzleNo: number;
  kind: 'daily' | 'practice';
  status: JourneyStatus;
  loss?: LossReason;
  homeRef: string;
  /** Each hop: the word it went through and the verse it landed on. */
  route: { door: string; ref: string; tier: Tier; home: boolean }[];
  manna: number;
  startedAt: number;
}

/** What the player wrote on a day's page. */
export interface JournalPage {
  date: string;
  text: string;
  updatedAt: number;
}

export interface JournalView {
  bookmarks: Bookmark[];
  top: TopVerse[];
  totals: { hops: number; verses: number; saved: number };
  /** The player's journeys, newest first: a page of the Journal for each day they played. */
  trips: JournalTrip[];
  pages: JournalPage[];
  owner: { name: string | null; since: number };
}

/** For the Desk: the verses players hop to most. */
export interface MostUsedVerse {
  verse: number;
  ref: string;
  text: string;
  count: number;
  players: number;
}
