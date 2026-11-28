// Shared set-up for the tests: one Bible, one lexicon and one recognizer for the whole run.
import { loadBible } from '../server/bible/bible.ts';
import { RefParser } from '../server/bible/refs.ts';
import { Lexicon } from '../server/lexicon/lexicon.ts';
import { Recognizer } from '../server/recognize/recognizer.ts';
import { defaultRules } from '../shared/rules.ts';
import type { RuleSet } from '../shared/rules.ts';
import { attemptHop, confirmChoice, decideGrace, lookBack } from '../server/game/engine.ts';
import type { AiCheck, EngineResult } from '../server/game/engine.ts';
import { newJourney } from '../server/game/journey.ts';
import type { Journey, World } from '../server/game/journey.ts';

const bible = loadBible();
const lexicon = new Lexicon(bible);
const refs = new RefParser(bible);
const recognizer = new Recognizer(bible, lexicon, refs);

export function world(overrides: Partial<RuleSet> = {}): World {
  // challenges are an extra beyond the directive, so its numbers are checked with them off
  return { bible, lexicon, refs, recognizer, rules: { ...defaultRules(), 'feature.challenges': false, ...overrides } };
}

export const W = world();

export function verseId(reference: string): number {
  const r = refs.parse(reference);
  if (r?.id === undefined) throw new Error(`Not a verse: ${reference}`);
  return r.id;
}

export const text = (reference: string, wording: 'kjv' | 'web' = 'kjv') => bible.text(verseId(reference), wording);

let clock = Date.UTC(2026, 10, 16, 15, 0, 0);
export const tick = () => (clock += 2000);

export function fresh(home = 'Psalm 119:105', w: World = W, mode: 'standard' | 'berean' = 'standard'): Journey {
  return newJourney(
    {
      id: 'j' + Math.random().toString(36).slice(2),
      playerId: 'p1',
      date: '2026-11-16',
      puzzleNo: 1,
      kind: 'daily',
      mode,
      scribe: false,
      home: verseId(home),
      rulesVersion: 1,
      lexiconVersion: 1,
      tz: 'America/Chicago',
      deadline: Date.UTC(2026, 10, 17, 6, 0, 0),
      createdAt: clock,
    },
    w.rules,
  );
}

/** A player in a test: hops by typing the real text of a verse, as a player reciting it perfectly would. */
export class Player {
  last!: EngineResult;
  constructor(
    readonly j: Journey,
    readonly w: World = W,
    readonly ai?: AiCheck,
  ) {}

  async hop(door: string, typed: string, reference = ''): Promise<EngineResult> {
    this.last = await attemptHop(this.w, this.j, { door, typed, reference }, tick(), this.ai);
    return this.last;
  }

  /** Hop to a verse by typing its KJV text. `withRef` adds the exact reference. */
  async to(door: string, reference: string, withRef = false): Promise<EngineResult> {
    return this.hop(door, text(reference), withRef ? reference : '');
  }

  home(door: string): Promise<EngineResult> {
    return this.hop(door, bible.text(this.j.home, 'kjv'));
  }

  confirm(choice: number | null): EngineResult {
    return (this.last = confirmChoice(this.w, this.j, choice, tick()));
  }

  lookBack(): EngineResult {
    return (this.last = lookBack(this.w, this.j, tick()));
  }

  grace(use: boolean): EngineResult {
    return (this.last = decideGrace(this.w, this.j, use, tick()));
  }

  get at(): string {
    return bible.label(this.j.current);
  }
}

export { bible, lexicon, refs, recognizer };
