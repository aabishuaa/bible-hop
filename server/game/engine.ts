// The rules of a journey: sections 3 and 6 to 11 of the directive.
//
// Every function here changes the journey it is given and reports what happened. Nothing is
// decided anywhere else: the server applies these and saves the result before answering (rule 19.5).
import { displayBook } from '../../shared/books.ts';
import { graceText, lossInfo, message } from '../../shared/messages.ts';
import type { RuleSet, Tier } from '../../shared/rules.ts';
import { roundHalfUp, tierValue } from '../../shared/rules.ts';
import type { GraceLoss, HopRecord, HowIdentified, LossReason, MessageView, OutcomeKind } from '../../shared/types.ts';
import type { ParsedRef } from '../bible/refs.ts';
import { scoreReference } from '../bible/refs.ts';
import type { Family } from '../lexicon/lexicon.ts';
import type { HopIntent, Journey, JourneyEvent, World } from './journey.ts';

export type AiVerdict =
  | { status: 'proposal'; ref: string; confidence: number }
  /** The AI answered that no verse matches. */
  | { status: 'none' }
  /** Switched off, down, too slow, or today's checks are used up. */
  | { status: 'unavailable' };

export type AiCheck = (q: { typed: string; reference: string; door: string }) => Promise<AiVerdict>;

export interface EngineResult {
  kind: OutcomeKind;
  message: MessageView | null;
  notes: MessageView[];
  hop?: HopRecord;
  undone?: HopRecord;
  /** Index of the event a player may report as a wrong call (rule 10.5). */
  reportable?: number;
}

const result = (kind: OutcomeKind, msg: MessageView | null, extra: Partial<EngineResult> = {}): EngineResult => ({ kind, message: msg, notes: [], ...extra });

/** The rule values this journey plays by. */
export function rulesOf(w: World, j: Journey): RuleSet {
  return j.overrides ? { ...w.rules, ...j.overrides } : w.rules;
}

// ---------------------------------------------------------------------------------------------
// reading the state

/** Rule 12.4 and 11.2: the deadline is checked before every action. Returns true when the door has shut. */
export function checkDeadline(j: Journey, at: number): boolean {
  if (j.status !== 'playing' || j.deadline === null || at < j.deadline) return false;
  j.status = 'lost';
  j.loss = 'door';
  j.finishedAt = j.deadline;
  j.pending = null;
  j.version++;
  return true;
}

export function isActive(j: Journey): boolean {
  return j.status === 'playing' && j.pending?.type !== 'grace';
}

/** Rule 8.2: different verses visited on the current path, not counting home. */
export function cordCount(j: Journey): number {
  let n = 0;
  for (const [v, c] of Object.entries(j.visits)) if (c > 0 && Number(v) !== j.home) n++;
  return n;
}

export function doorState(w: World, j: Journey, verse: number, fam: Family): 'open' | 'used' | 'wall' | 'spent' {
  const r = rulesOf(w, j);
  if (w.lexicon.tier(fam, r) === 'wall') return 'wall';
  if (j.doors[verse]?.includes(fam.key)) return 'used';
  if (j.mode === 'berean' && j.wordsUsed.includes(fam.key)) return 'spent';
  return 'open';
}

/** Rule 11.7: the doors a player could still leave a verse by. */
export function openDoors(w: World, j: Journey, verse: number): Family[] {
  return w.lexicon.verseFamilies(verse).filter((f) => doorState(w, j, verse, f) === 'open');
}

function label(w: World, verse: number): string {
  return w.bible.label(verse);
}

function log(j: Journey, e: Omit<JourneyEvent, 'at'>, at: number): number {
  j.events.push({ at, ...e });
  return j.events.length - 1;
}

function bump(j: Journey): void {
  j.version++;
}

// ---------------------------------------------------------------------------------------------
// losses and Grace (section 11)

function lose(j: Journey, reason: LossReason, at: number): void {
  j.status = 'lost';
  j.loss = reason;
  j.finishedAt = at;
  j.pending = null;
}

/** Rule 11.4: Grace is offered the moment a Grace-able loss happens; without one left, the loss ends the day. */
function graceOrLose(w: World, j: Journey, losses: GraceLoss[], at: number): EngineResult {
  const r = rulesOf(w, j);
  if (j.gracesLeft > 0) {
    j.pending = { type: 'grace', losses };
    return result('grace', null);
  }
  lose(j, losses[0], at);
  const info = lossInfo(losses[0], r['wilderness.hops'], r['strikes.max']);
  return result('lost', { code: `loss.${losses[0]}`, text: `${info.name}. ${info.line}`, tone: 'bad' });
}

function strike(w: World, j: Journey, code: 'strike.word' | 'strike.nomatch', params: Record<string, string | number>, intent: HopIntent, verse: number | undefined, at: number): EngineResult {
  const r = rulesOf(w, j);
  const before = j.strikes;
  j.strikes++;
  j.totalStrikes++;
  j.failsHere++;
  const rooster = j.strikes >= r['strikes.max'];
  const ev = log(j, { type: 'attempt', code, door: intent.doorWord, typed: intent.typed, reference: intent.refText, verse, strikesBefore: before, rooster }, at);
  const msg = message(code, { ...params, n: j.strikes, max: r['strikes.max'] });
  if (!rooster) return withStuckHint(w, j, result('strike', msg, { reportable: ev }));
  const out = graceOrLose(w, j, ['rooster'], at);
  return { ...out, message: out.kind === 'grace' ? msg : out.message, notes: out.kind === 'grace' ? [] : [msg], reportable: ev };
}

/** Rule 11.8: after 3 refused or failed attempts in a row in one verse, remind the player they can look back. */
function withStuckHint(w: World, j: Journey, res: EngineResult): EngineResult {
  const r = rulesOf(w, j);
  if (j.failsHere >= r['stuck.reminderAfter'] && j.path.length > 0 && j.failsHere % r['stuck.reminderAfter'] === 0) {
    res.notes.push(message('stuck.hint', { ref: label(w, j.path[j.path.length - 1].from), salt: r['lookBack.salt'] }));
  }
  return res;
}

function refuse(w: World, j: Journey, code: string, params: Record<string, string | number>, intent: Partial<HopIntent>, at: number, verse?: number): EngineResult {
  j.failsHere++;
  log(j, { type: 'attempt', code, door: intent.doorWord, typed: intent.typed, reference: intent.refText, verse }, at);
  return withStuckHint(w, j, result('refuse', message(code, params)));
}

// ---------------------------------------------------------------------------------------------
// the hop (section 3)

export interface HopInput {
  door: string;
  typed: string;
  reference: string;
}

/**
 * Rule 3.8: a hop attempt, checked in the fixed order. The first check that fails decides the outcome.
 * `at` is when the attempt reached the server (rule 12.7).
 */
export async function attemptHop(w: World, j: Journey, input: HopInput, at: number, ai?: AiCheck): Promise<EngineResult> {
  // 1. the journey is active
  if (checkDeadline(j, at)) return result('lost', message('time.over'));
  if (!isActive(j)) return result('nothing', null);
  const r = rulesOf(w, j);
  j.pending = null;
  j.modeFixed = true;
  bump(j);

  const doorWord = String(input.door ?? '').trim().slice(0, 60);
  const typedFull = String(input.typed ?? '');
  let typed = typedFull.slice(0, r['match.maxChars']);
  let refText = String(input.reference ?? '').trim().slice(0, 80);
  const intent: HopIntent = { doorWord, family: '', typed, refText };

  // 2. the door is open in the verse the player stands on
  const door = doorWord ? w.lexicon.familyOfWord(doorWord) : undefined;
  if (!door || !w.lexicon.verseHas(j.current, door)) return refuse(w, j, 'refuse.noDoor', {}, intent, at);
  intent.family = door.key;
  const state = doorState(w, j, j.current, door);
  if (state === 'wall') return refuse(w, j, 'refuse.wall', { word: doorWord }, intent, at);
  if (state === 'used') return refuse(w, j, 'refuse.exit', { word: doorWord }, intent, at);
  if (state === 'spent') return refuse(w, j, 'refuse.repeat', { word: doorWord }, intent, at);

  // the reference: its own box, or else one typed alongside the verse
  let ref: ParsedRef | null = refText ? w.refs.parse(refText) : null;
  if (!ref && !refText && !w.refs.isOnlyReference(typed)) {
    const split = w.refs.splitFromText(typed);
    if (split.ref) {
      ref = split.ref;
      refText = split.refText;
      typed = split.text;
      intent.refText = refText;
    }
  }
  // Berean Mode: every hop needs a reference with at least the book and chapter (rule 18.4)
  if (j.mode === 'berean' && !(ref && ref.chapter !== undefined)) return refuse(w, j, 'refuse.noRef', {}, intent, at);

  // 3. the destination is identified (section 5)
  const rec = w.recognizer.recognize(typed, ref, door, r);
  const notes: MessageView[] = rec.long || typedFull.length > r['match.maxChars'] ? [message('ask.long')] : [];
  const finish = (res: EngineResult): EngineResult => ({ ...res, notes: [...notes, ...res.notes] });

  if (rec.kind === 'identified') return finish(continueHop(w, j, intent, ref, rec.verse, rec.how, at, false));
  if (rec.kind === 'confirm') {
    j.pending = { type: 'confirm', how: 'match', verse: rec.verse, ...intent };
    log(j, { type: 'attempt', code: 'confirm.one', door: doorWord, typed, reference: refText, verse: rec.verse }, at);
    return finish(result('confirm', message('confirm.one')));
  }

  // The player named a real verse that the local words do not reach: let the AI check look at it too.
  const named = ref?.id !== undefined;
  const unresolved = rec.kind === 'nofit' || (named && (rec.kind === 'choose' ? !rec.verses.includes(ref!.id!) : rec.kind === 'ask' && rec.code !== 'ask.refOnly' && rec.code !== 'ask.short'));
  if (!unresolved) {
    if (rec.kind === 'choose') {
      j.pending = { type: 'choose', verses: rec.verses, ...intent };
      log(j, { type: 'attempt', code: 'confirm.choose', door: doorWord, typed, reference: refText }, at);
      return finish(result('choose', message('confirm.choose')));
    }
    if (rec.kind === 'ask') {
      j.failsHere++;
      log(j, { type: 'attempt', code: rec.code, door: doorWord, typed, reference: refText }, at);
      return finish(withStuckHint(w, j, result('ask', message(rec.code))));
    }
  }

  // 5.2 step 4: nothing fits, so the AI check is asked (rule 5.7)
  const fallback = (): EngineResult => {
    // what local matching alone would have said
    if (rec.kind === 'choose') {
      j.pending = { type: 'choose', verses: rec.verses, ...intent };
      log(j, { type: 'attempt', code: 'confirm.choose', door: doorWord, typed, reference: refText }, at);
      return result('choose', message('confirm.choose'));
    }
    const code = rec.kind === 'ask' ? rec.code : !r['feature.aiCheck'] || !ai ? 'ask.weak' : 'ask.aiDown';
    j.failsHere++;
    log(j, { type: 'attempt', code, door: doorWord, typed, reference: refText }, at);
    return withStuckHint(w, j, result('ask', message(code)));
  };
  if (!r['feature.aiCheck'] || !ai) return finish(fallback());
  let verdict: AiVerdict;
  try {
    verdict = await ai({ typed, reference: refText, door: doorWord });
  } catch {
    verdict = { status: 'unavailable' };
  }
  // The journey may have moved on while the check ran; the caller compares versions before saving.
  if (verdict.status === 'unavailable') return finish(fallback());
  if (verdict.status === 'none') {
    if (rec.kind !== 'nofit') return finish(fallback());
    return finish(strike(w, j, 'strike.nomatch', {}, intent, undefined, at));
  }
  // (b) a proposal counts only if it is confident, real, and shares meaning words with the verse
  const proposed = w.refs.parse(verdict.ref);
  const an = w.recognizer.analyze(typed);
  const counts =
    verdict.confidence >= r['ai.confidence'] && proposed?.id !== undefined && w.recognizer.sharedWords(an, proposed.id) >= r['ai.sharedWords'];
  if (!counts) {
    if (rec.kind !== 'nofit') return finish(fallback());
    j.failsHere++;
    log(j, { type: 'attempt', code: 'ask.weak', door: doorWord, typed, reference: refText }, at);
    return finish(withStuckHint(w, j, result('ask', message('ask.weak'))));
  }
  // (c) the player always confirms an AI proposal before the hop
  j.pending = { type: 'confirm', how: 'ai', verse: proposed!.id!, ...intent };
  log(j, { type: 'attempt', code: 'confirm.ai', door: doorWord, typed, reference: refText, verse: proposed!.id }, at);
  return finish(result('confirm', message('confirm.ai')));
}

/** Checks 4 to 8 of rule 3.8, once the destination is known. */
function continueHop(w: World, j: Journey, intent: HopIntent, ref: ParsedRef | null, verse: number, how: HowIdentified, at: number, lampConfirmed: boolean): EngineResult {
  const r = rulesOf(w, j);
  const door = w.lexicon.family(intent.family)!;
  const word = intent.doorWord;
  const isHome = verse === j.home;

  // 4. the destination is not the verse the player stands on
  if (verse === j.current) return refuse(w, j, 'refuse.same', {}, intent, at, verse);

  // 5. the destination contains the door word, in any form, in either wording
  if (!w.lexicon.verseHas(verse, door)) {
    if (w.lexicon.textHas(intent.typed, door)) {
      // a translation gap (rule 10.2): no hop, no strike
      j.failsHere++;
      log(j, { type: 'attempt', code: 'gap', door: word, typed: intent.typed, reference: intent.refText, verse }, at);
      return withStuckHint(w, j, result('gap', message('gap', { ref: label(w, verse), word })));
    }
    return strike(w, j, 'strike.word', { ref: label(w, verse), word }, intent, verse, at);
  }

  const tier = w.lexicon.tier(door, r);
  // 6. if the destination is home: the Threefold Cord, then no crumb, then the manna (rule 8.4)
  if (isHome) {
    const need = r['cord.verses'] - cordCount(j);
    if (need > 0) return refuse(w, j, 'refuse.cord', { n: need }, intent, at, verse);
    if (tier === 'crumb') return refuse(w, j, 'refuse.crumb', { word }, intent, at, verse);
    if (j.manna < r['gate.manna']) return refuse(w, j, 'refuse.manna', { need: r['gate.manna'], m: j.manna }, intent, at, verse);
  }
  // 7. the door is unused in the destination
  if (j.doors[verse]?.includes(door.key)) {
    return refuse(w, j, isHome ? 'refuse.entryHome' : 'refuse.entry', { word, ref: label(w, verse) }, intent, at, verse);
  }

  // Rule 7.7: a revisit that would empty the lamp asks first.
  const revisit = !isHome && (j.visits[verse] ?? 0) > 0;
  const burn = revisit ? r['oil.revisit'] : r['oil.hop'];
  const hasOil = !!w.lexicon.oilFamily && w.lexicon.verseHas(verse, w.lexicon.oilFamily);
  const widow = !isHome && hasOil && !j.widow.includes(verse) ? r['oil.widow'] : 0;
  if (revisit && !lampConfirmed && j.oil - burn + widow <= 0) {
    j.pending = { type: 'lamp', verse, how, ...intent };
    log(j, { type: 'attempt', code: 'confirm.lamp', door: word, typed: intent.typed, reference: intent.refText, verse }, at);
    return result('lamp', message('confirm.lamp', { burn, d: j.oil }));
  }

  // 8. every check passed: the hop happens (rule 3.9)
  const from = j.current;
  // 1) the door closes in both verses, for every form of the word
  (j.doors[from] ??= []).push(door.key);
  (j.doors[verse] ??= []).push(door.key);
  if (j.mode === 'berean') j.wordsUsed.push(door.key);
  // 2) oil burns
  j.oil -= burn;
  // 3) manna is added; a homecoming gets no reference bonus (rule 6.4)
  const base = tierValue(tier, r);
  const refScore = isHome ? 'none' : scoreReference(w.bible, ref, verse);
  const multiplier = refScore === 'exact' ? r['ref.exact'] : refScore === 'chapter' ? r['ref.chapter'] : refScore === 'book' ? r['ref.book'] : 1;
  const manna = roundHalfUp(base * multiplier);
  j.manna += manna;
  // 4) strikes reset, the hop count rises, the player stands on the destination
  j.strikes = 0;
  j.failsHere = 0;
  j.hopsTaken++;
  j.current = verse;
  if (!isHome) j.visits[verse] = (j.visits[verse] ?? 0) + 1;

  const hop: HopRecord = {
    n: j.hopsTaken,
    from,
    to: verse,
    fromRef: label(w, from),
    toRef: label(w, verse),
    doorWord: word,
    family: door.key,
    forms: w.lexicon.formsIn(verse, door).map((f) => f.form),
    tier,
    base,
    refText: intent.refText,
    refScore,
    multiplier,
    manna,
    oil: burn,
    revisit,
    widow: 0,
    home: isHome,
    calf: 0,
    how,
    at,
  };
  j.path.push(hop);
  // the Golden Road is open only from the verse a Golden Nugget brought you to
  j.goldenRoad = undefined;

  // 5) home: the Fatted Calf is added and the day is won. Nothing else is checked.
  if (isHome) {
    hop.calf = roundHalfUp(base * r['calf.multiplier']);
    j.fattedCalf = hop.calf;
    j.manna += hop.calf;
    j.status = 'won';
    j.finishedAt = at;
    j.pending = null;
    log(j, { type: 'attempt', code: 'hop.home', door: word, typed: intent.typed, reference: intent.refText, verse }, at);
    return result('home', message('hop.home', { word, n: hop.calf }), { hop });
  }

  // 6) Widow's Oil, once per verse per journey, before the lamp check (rules 7.3 and 7.4)
  if (widow > 0) {
    const before = j.oil;
    j.oil = Math.min(r['oil.capacity'], j.oil + widow);
    hop.widow = j.oil - before;
    j.widow.push(verse);
  }
  log(j, { type: 'attempt', code: 'hop.ok', door: word, typed: intent.typed, reference: intent.refText, verse }, at);
  if (tier === 'nugget') j.goldenRoad = verse;
  if (j.gateOpenedAt === undefined && cordCount(j) >= r['cord.verses'] && j.manna >= r['gate.manna']) j.gateOpenedAt = j.path.length;
  const shown = hop.forms.find((f) => f === word.toLowerCase()) ?? hop.forms[0] ?? word;
  const ok = message('hop.ok', { ref: hop.toRef, word, form: shown, n: manna, bonus: refScore, revisit: revisit ? 1 : 0, oil: burn, widow: hop.widow || undefined });

  // 7) the loss checks, in order (rule 11.3): Lost in the Wilderness, The Lamp Goes Out, Swallowed by the Fish
  if (j.hopsTaken >= r['wilderness.hops']) {
    lose(j, 'wilderness', at);
    return result('lost', ok, { hop });
  }
  const losses: GraceLoss[] = [];
  if (j.oil <= 0) losses.push('lamp');
  // with the Golden Road open there is always a way out, so the fish cannot swallow you
  if (openDoors(w, j, verse).length === 0 && j.goldenRoad !== verse) losses.push('fish');
  const golden = tier === 'nugget' ? [message('hop.nugget', { n: r['calf.multiplier'] * tierValue('nugget', r) })] : [];
  if (losses.length) {
    const out = graceOrLose(w, j, losses, at);
    return { ...out, message: ok, notes: [...golden, ...(out.message ? [out.message] : [])], hop };
  }
  return result('hop', ok, { hop, notes: golden });
}

/**
 * The Golden Road: a player a Golden Nugget brought to a verse may walk straight home from it,
 * without a shared word, whatever the cord or the manna. It burns a hop's oil and counts as a hop,
 * and the Fatted Calf is that of the nugget.
 */
export function goldenRoadHome(w: World, j: Journey, at: number): EngineResult {
  if (checkDeadline(j, at)) return result('lost', message('time.over'));
  if (!isActive(j)) return result('nothing', null);
  if (j.goldenRoad === undefined || j.goldenRoad !== j.current) return result('refuse', message('golden.closed'));
  const r = rulesOf(w, j);
  bump(j);
  j.pending = null;
  j.modeFixed = true;
  const last = j.path[j.path.length - 1];
  const from = j.current;
  const burn = r['oil.hop'];
  j.oil -= burn;
  j.strikes = 0;
  j.failsHere = 0;
  j.hopsTaken++;
  j.current = j.home;
  j.goldenRoad = undefined;
  const calf = roundHalfUp(tierValue('nugget', r) * r['calf.multiplier']);
  const hop: HopRecord = {
    n: j.hopsTaken, from, to: j.home, fromRef: label(w, from), toRef: label(w, j.home), doorWord: 'the Golden Road', family: last?.family ?? '',
    forms: [], tier: 'nugget', base: 0, refText: '', refScore: 'none', multiplier: 1, manna: 0, oil: burn, revisit: false, widow: 0,
    home: true, calf, how: 'golden', at,
  };
  j.path.push(hop);
  j.fattedCalf = calf;
  j.manna += calf;
  j.status = 'won';
  j.finishedAt = at;
  log(j, { type: 'attempt', code: 'hop.golden', verse: j.home }, at);
  return result('home', message('hop.goldenHome', { n: calf }), { hop });
}

/**
 * Rule 14.3: the player answers a proposal. `choice` is the verse they picked, or null for
 * "That's not it" and "None of these". Confirming and choosing cost nothing (rule 5.6).
 */
export function confirmChoice(w: World, j: Journey, choice: number | null, at: number): EngineResult {
  if (checkDeadline(j, at)) return result('lost', message('time.over'));
  const p = j.pending;
  if (j.status !== 'playing' || !p || p.type === 'grace') return result('nothing', message('confirm.gone'));
  j.pending = null;
  bump(j);
  const allowed = p.type === 'choose' ? p.verses : [p.verse];
  if (choice === null || !allowed.includes(choice)) {
    log(j, { type: 'confirm', code: 'confirm.no', door: p.doorWord }, at);
    return result('declined', p.type === 'lamp' ? null : message('confirm.no'));
  }
  const intent: HopIntent = { doorWord: p.doorWord, family: p.family, typed: p.typed, refText: p.refText };
  const ref = p.refText ? w.refs.parse(p.refText) : null;
  const how: HowIdentified = p.type === 'lamp' ? p.how : p.type === 'choose' ? 'chosen' : p.how === 'ai' ? 'ai' : 'confirmed';
  // the door may have closed since the proposal was made
  const door = w.lexicon.family(p.family);
  if (!door || doorState(w, j, j.current, door) !== 'open') return refuse(w, j, 'refuse.exit', { word: p.doorWord }, intent, at);
  return continueHop(w, j, intent, ref, choice, how, at, p.type === 'lamp');
}

// ---------------------------------------------------------------------------------------------
// looking back (section 9)

function undoHop(j: Journey, hop: HopRecord): void {
  j.current = hop.from;
  for (const v of [hop.from, hop.to]) {
    const list = j.doors[v];
    if (!list) continue;
    const i = list.indexOf(hop.family);
    if (i >= 0) list.splice(i, 1);
    if (!list.length) delete j.doors[v];
  }
  if (j.visits[hop.to]) {
    j.visits[hop.to]--;
    if (!j.visits[hop.to]) delete j.visits[hop.to];
  }
  const wi = j.wordsUsed.lastIndexOf(hop.family);
  if (wi >= 0) j.wordsUsed.splice(wi, 1);
  j.manna -= hop.manna;
  j.undone.push(hop);
  j.failsHere = 0;
  if (j.goldenRoad === hop.to) j.goldenRoad = undefined;
  if (j.gateOpenedAt !== undefined && j.path.length < j.gateOpenedAt) j.gateOpenedAt = undefined;
}

export function lookBack(w: World, j: Journey, at: number): EngineResult {
  if (checkDeadline(j, at)) return result('lost', message('time.over'));
  if (!isActive(j)) return result('nothing', null);
  if (!j.path.length) return result('refuse', message('lookback.none'));
  const r = rulesOf(w, j);
  const inDebt = j.manna < 0;
  const hop = j.path.pop()!;
  j.pending = null;
  bump(j);
  // It undoes the position, the door, the visit, the hop's manna and, in Berean Mode, the word's use.
  // It does not undo the oil burned, any Widow's Oil, the hop count or strikes (rules 9.3 and 9.4).
  undoHop(j, hop);
  j.manna -= r['lookBack.salt'];
  j.looksBack++;
  const cost = hop.manna + r['lookBack.salt'];
  log(j, { type: 'lookback', code: 'lookback.done', verse: hop.from }, at);
  const done = message('lookback.done', { ref: hop.fromRef, n: cost });
  // Rule 9.5: looking back again while manna is below zero brings Famine.
  if (inDebt) {
    const out = graceOrLose(w, j, ['famine'], at);
    return { ...out, message: done, notes: out.message ? [out.message] : [], undone: hop };
  }
  return result('lookback', done, { undone: hop });
}

/** Rule 14.2: the cost shown before looking back. */
export function lookBackCost(w: World, j: Journey): { available: boolean; toRef: string; earned: number; salt: number; cost: number; famine: boolean } {
  const r = rulesOf(w, j);
  const hop = j.path[j.path.length - 1];
  const available = isActive(j) && !!hop;
  return {
    available,
    toRef: hop ? hop.fromRef : '',
    earned: hop ? hop.manna : 0,
    salt: r['lookBack.salt'],
    cost: hop ? hop.manna + r['lookBack.salt'] : 0,
    famine: available && j.manna < 0,
  };
}

// ---------------------------------------------------------------------------------------------
// Grace (rules 11.4 to 11.6)

export function decideGrace(w: World, j: Journey, use: boolean, at: number): EngineResult {
  // A Grace choice that arrives after the deadline is too late (rule 12.7).
  if (checkDeadline(j, at)) return result('lost', message('time.over'));
  const p = j.pending;
  if (j.status !== 'playing' || p?.type !== 'grace') return result('nothing', message('confirm.gone'));
  const r = rulesOf(w, j);
  bump(j);
  if (!use) {
    lose(j, p.losses[0], at);
    log(j, { type: 'grace', code: 'grace.declined' }, at);
    return result('lost', message('grace.declined'));
  }
  j.pending = null;
  j.gracesLeft--;
  j.gracesUsed++;
  let undone: HopRecord | undefined;
  // One move, one rescue (rule 11.5): a single Grace fixes everything that move caused.
  if (p.losses.includes('fish')) {
    // back to the previous verse; that hop's manna is removed, with no salt
    undone = j.path.pop();
    if (undone) undoHop(j, undone);
  }
  if (p.losses.includes('lamp')) j.oil = r['oil.graceRelight'];
  if (p.losses.includes('famine')) j.manna = 0;
  if (p.losses.includes('rooster')) {
    j.strikes = 0;
    j.failsHere = 0;
  }
  log(j, { type: 'grace', code: `grace.${p.losses.join('+')}` }, at);
  return result('graceUsed', message('grace.used', { text: graceText(p.losses, r['oil.graceRelight']) }), { undone });
}

// ---------------------------------------------------------------------------------------------
// Berean Mode (rule 18.4): chosen before the first hop of the day and fixed for that day

export function setMode(j: Journey, mode: 'standard' | 'berean', at: number): boolean {
  if (j.status !== 'playing' || j.modeFixed || j.path.length || j.hopsTaken) return false;
  if (j.mode !== mode) {
    j.mode = mode;
    bump(j);
    log(j, { type: 'mode', code: `mode.${mode}` }, at);
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
// disputes (rule 16.8): a Scribe overturns a strike

/**
 * Removes a strike that a Scribe has overturned. If that strike brought the rooster and ended the day,
 * the journey reopens exactly as it was before the strike. `dateOpen` says whether the player's date is still open.
 * Returns what was done, for the note the player gets.
 */
export function overturnStrike(j: Journey, eventIndex: number, dateOpen: boolean): 'removed' | 'reopened' | 'stands' {
  const ev = j.events[eventIndex];
  if (!ev || ev.overturned || ev.strikesBefore === undefined) return 'stands';
  ev.overturned = true;
  if (!dateOpen) return 'stands';
  // only a strike that is still the latest thing to have moved the count can be taken back
  const laterReset = j.events.slice(eventIndex + 1).some((e) => e.code === 'hop.ok' || e.code === 'hop.home');
  if (j.status === 'lost' && j.loss === 'rooster' && ev.rooster) {
    j.status = 'playing';
    delete j.loss;
    delete j.finishedAt;
    j.pending = null;
    j.strikes = ev.strikesBefore;
    j.totalStrikes = Math.max(0, j.totalStrikes - 1);
    bump(j);
    return 'reopened';
  }
  if (j.status !== 'playing') return 'stands';
  j.totalStrikes = Math.max(0, j.totalStrikes - 1);
  if (j.pending?.type === 'grace' && j.pending.losses.includes('rooster') && ev.rooster) {
    j.pending = null;
    j.strikes = ev.strikesBefore;
  } else if (ev.rooster && !laterReset) {
    // Grace was spent on a wrong call: it comes back, and the count returns to where it stood
    const graceAfter = j.events.slice(eventIndex + 1).find((e) => e.type === 'grace' && e.code.includes('rooster'));
    if (graceAfter) {
      j.gracesLeft++;
      j.gracesUsed = Math.max(0, j.gracesUsed - 1);
    }
    j.strikes = Math.max(0, j.strikes - 1);
  } else if (!laterReset) {
    j.strikes = Math.max(0, j.strikes - 1);
  }
  bump(j);
  return 'removed';
}

export function bookOf(w: World, verse: number): string {
  return displayBook(w.bible.ref(verse).book);
}

export type { Tier };
