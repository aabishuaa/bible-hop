// What a player's screen needs to know about a journey (section 14). The client never gets the
// whole Bible: verses are sent as they are needed (rule 19.9).
import { BOOKS } from '../../shared/books.ts';
import { graceText, lossInfo, message } from '../../shared/messages.ts';
import { tierValue } from '../../shared/rules.ts';
import type { BookSpan, ChainStep, DoorView, JourneyView, PendingView, TokenView, VerseView, Wording } from '../../shared/types.ts';
import type { Bible } from '../bible/bible.ts';
import { WORDINGS } from '../bible/bible.ts';
import { tzLabel } from './clock.ts';
import { challengeFor } from './challenges.ts';
import { cordCount, doorState, lookBackCost, rulesOf } from './engine.ts';
import { verseText } from './finale.ts';
import type { Journey, World } from './journey.ts';

/** A verse with every word a player can tap, and the state of each door. `j` may be absent for a verse shown before a journey starts. */
export function verseView(w: World, verse: number, j?: Journey): VerseView {
  const r = j ? rulesOf(w, j) : w.rules;
  const ref = w.bible.ref(verse);
  const families = w.lexicon.verseFamilies(verse);
  const index = new Map<number, number>();
  const homeVerse = j?.home ?? verse;
  const doors: DoorView[] = families.map((fam, i) => {
    index.set(fam.id, i);
    const tier = w.lexicon.tier(fam, r);
    return {
      key: fam.key,
      tier,
      value: tierValue(tier, r),
      count: fam.verses.length,
      forms: w.lexicon.forms(fam, 6),
      // a door that is also in the home verse is never shown for crumbs (rule 14.2)
      inHome: tier !== 'crumb' && tier !== 'wall' && verse !== homeVerse && w.lexicon.verseHas(homeVerse, fam),
      state: j ? doorState(w, j, verse, fam) : tier === 'wall' ? 'wall' : 'open',
    };
  });
  const wordings: Partial<Record<Wording, TokenView[]>> = {};
  for (const wording of WORDINGS) {
    if (!w.bible.has(verse, wording)) continue;
    wordings[wording] = w.bible.tokens(verse, wording).map((t) => (t.w === undefined ? { s: t.s } : { s: t.s, d: index.get(w.lexicon.familyOfVocab[t.w]) }));
  }
  return {
    id: verse,
    ref: w.bible.label(verse),
    book: ref.book,
    bookName: BOOKS[ref.book].name,
    chapter: ref.chapter,
    verse: ref.verse,
    position: verse / (w.bible.count - 1),
    wordings,
    doors,
  };
}

function pendingView(w: World, j: Journey, wording: Wording): PendingView | null {
  const p = j.pending;
  if (!p) return null;
  const r = rulesOf(w, j);
  switch (p.type) {
    case 'confirm':
      return { type: 'confirm', how: p.how, verse: verseText(w, p.verse, wording), message: message(p.how === 'ai' ? 'confirm.ai' : 'confirm.one') };
    case 'choose':
      return { type: 'choose', options: p.verses.map((v) => verseText(w, v, wording)), message: message('confirm.choose') };
    case 'lamp':
      return { type: 'lamp', verse: verseText(w, p.verse, wording), burn: r['oil.revisit'], have: j.oil, message: message('confirm.lamp', { burn: r['oil.revisit'], d: j.oil }) };
    case 'grace':
      return { type: 'grace', losses: p.losses, loss: lossInfo(p.losses[0], r['wilderness.hops'], r['strikes.max']), graceText: graceText(p.losses, r['oil.graceRelight']) };
  }
}

export function journeyView(w: World, j: Journey, wording: Wording, at: number): JourneyView {
  const r = rulesOf(w, j);
  const chain: ChainStep[] = [{ verse: j.home, ref: w.bible.label(j.home), position: j.home / (w.bible.count - 1) }];
  for (const h of j.path) {
    chain.push({ verse: h.to, ref: h.toRef, position: h.to / (w.bible.count - 1), door: h.doorWord, tier: h.tier, manna: h.manna + h.calf, revisit: h.revisit, widow: h.widow, home: h.home });
  }
  const last = j.path[j.path.length - 1];
  const minutesLeft = j.deadline === null ? null : Math.max(0, Math.ceil((j.deadline - at) / 60000));
  return {
    id: j.id,
    kind: j.kind,
    mode: j.mode,
    date: j.date,
    puzzleNo: j.puzzleNo,
    status: j.status,
    loss: j.loss ? lossInfo(j.loss, r['wilderness.hops'], r['strikes.max']) : undefined,
    version: j.version,
    deadline: j.deadline,
    tz: j.tz,
    tzLabel: tzLabel(j.tz),
    manna: j.manna,
    oil: Math.max(0, j.oil),
    oilCap: r['oil.capacity'],
    strikes: j.strikes,
    strikesMax: r['strikes.max'],
    hops: j.hopsTaken,
    hopLimit: r['wilderness.hops'],
    graces: j.gracesLeft,
    cord: { have: Math.min(cordCount(j), r['cord.verses']), need: r['cord.verses'] },
    gate: r['gate.manna'],
    home: verseView(w, j.home, j),
    current: verseView(w, j.current, j),
    arrivedBy: j.current === j.home && j.status !== 'won' ? undefined : last?.tier,
    chain,
    pending: j.status === 'playing' ? pendingView(w, j, wording) : null,
    lookBack: lookBackCost(w, j),
    goldenRoad: j.status === 'playing' && j.goldenRoad !== undefined && j.goldenRoad === j.current && !j.pending,
    challenge: j.pending ? null : challengeFor(w, j),
    canChangeMode: j.status === 'playing' && !j.modeFixed && r['feature.berean'] && j.kind !== 'guide',
    lateMinutes: j.status === 'playing' && minutesLeft !== null && minutesLeft <= r['clock.lateWarningMinutes'] ? minutesLeft : undefined,
    features: { wordingSwitch: r['feature.wordingSwitch'], berean: r['feature.berean'], concordance: j.kind === 'practice' },
  };
}

/** Rule 13.3: all 66 books in canonical order, each as wide as its share of the Bible's verses. */
export function bookSpans(bible: Bible): BookSpan[] {
  return BOOKS.map((b, i) => ({
    name: b.name,
    short: b.short,
    division: b.division,
    testament: b.testament,
    start: bible.bookStart[i] / bible.count,
    end: bible.bookStart[i + 1] / bible.count,
  }));
}
