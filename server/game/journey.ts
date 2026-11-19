// The journey record (rule 19.6) and the world a journey is played in.
import type { Bible } from '../bible/bible.ts';
import type { RefParser } from '../bible/refs.ts';
import type { Lexicon } from '../lexicon/lexicon.ts';
import type { Recognizer } from '../recognize/recognizer.ts';
import type { RuleSet } from '../../shared/rules.ts';
import type { GraceLoss, HopRecord, HowIdentified, JourneyKind, JourneyMode, JourneyStatus, LossReason } from '../../shared/types.ts';

/** Everything a journey is judged by. A journey keeps the versions it started with (rule 17.6). */
export interface World {
  bible: Bible;
  lexicon: Lexicon;
  recognizer: Recognizer;
  refs: RefParser;
  rules: RuleSet;
}

/** What a hop attempt carries while it waits for the player to confirm or choose. */
export interface HopIntent {
  doorWord: string;
  family: string;
  typed: string;
  refText: string;
}

export type Pending =
  | ({ type: 'confirm'; how: 'match' | 'ai'; verse: number } & HopIntent)
  | ({ type: 'choose'; verses: number[] } & HopIntent)
  | ({ type: 'lamp'; verse: number; how: HowIdentified } & HopIntent)
  | { type: 'grace'; losses: GraceLoss[] };

export interface JourneyEvent {
  at: number;
  /** attempt: a hop attempt. confirm: a confirmation or choice. lookback, grace: those actions. */
  type: 'attempt' | 'confirm' | 'lookback' | 'grace' | 'start' | 'mode' | 'dispute';
  code: string;
  door?: string;
  /** Deleted after 30 days (data.typedTextDays); the outcome code stays. */
  typed?: string;
  reference?: string;
  verse?: number;
  /** For a strike: the count before it, and whether it brought the rooster. */
  strikesBefore?: number;
  rooster?: boolean;
  overturned?: boolean;
}

export interface Journey {
  // identity
  id: string;
  playerId: string;
  date: string;
  puzzleNo: number;
  kind: JourneyKind;
  mode: JourneyMode;
  scribe: boolean;
  // versions
  home: number;
  rulesVersion: number;
  lexiconVersion: number;
  /** Rule values a guided or sandbox journey replaces. */
  overrides?: Partial<RuleSet>;
  // clock
  tz: string;
  deadline: number | null;
  createdAt: number;
  finishedAt?: number;
  // state
  status: JourneyStatus;
  loss?: LossReason;
  current: number;
  manna: number;
  oil: number;
  strikes: number;
  totalStrikes: number;
  hopsTaken: number;
  looksBack: number;
  fattedCalf: number;
  // grace
  gracesLeft: number;
  gracesUsed: number;
  pending: Pending | null;
  /** For each verse, the word families used as doors there. */
  doors: Record<number, string[]>;
  /** For each verse, its visits on the current path. */
  visits: Record<number, number>;
  /** The verses that have refilled the lamp. */
  widow: number[];
  /** Families used today, for Berean Mode. */
  wordsUsed: string[];
  path: HopRecord[];
  /** Hops taken back by looking back or by Grace, kept for the record. */
  undone: HopRecord[];
  events: JourneyEvent[];
  /** Rises with every change (rule 12.12). */
  version: number;
  /** Refused or failed attempts in a row in the current verse (rule 11.8). */
  failsHere: number;
  /** Whether Berean Mode is fixed for the day (it is, from the first hop attempt). */
  modeFixed: boolean;
  /** The verse a Golden Nugget brought the player to: from there one tap takes them home. */
  goldenRoad?: number;
  /** The path length at which coming home first became possible (for Prodigal's Return). */
  gateOpenedAt?: number;
}

export interface NewJourney {
  id: string;
  playerId: string;
  date: string;
  puzzleNo: number;
  kind: JourneyKind;
  mode: JourneyMode;
  scribe: boolean;
  home: number;
  rulesVersion: number;
  lexiconVersion: number;
  overrides?: Partial<RuleSet>;
  tz: string;
  deadline: number | null;
  createdAt: number;
}

/** Rule 2.2: a new journey stands on the home verse with 12 drops of oil, 0 manna, 0 strikes and one Grace. */
export function newJourney(p: NewJourney, rules: RuleSet): Journey {
  return {
    ...p,
    status: 'playing',
    current: p.home,
    manna: 0,
    oil: rules['oil.start'],
    strikes: 0,
    totalStrikes: 0,
    hopsTaken: 0,
    looksBack: 0,
    fattedCalf: 0,
    gracesLeft: rules['grace.perDay'],
    gracesUsed: 0,
    pending: null,
    doors: {},
    visits: {},
    widow: [],
    wordsUsed: [],
    path: [],
    undone: [],
    events: [{ at: p.createdAt, type: 'start', code: 'journey.started' }],
    version: 1,
    failsHere: 0,
    modeFixed: false,
  };
}
