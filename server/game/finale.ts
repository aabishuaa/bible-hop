// Section 13 of the directive: after the journey. The share card, the Book of Numbers,
// the Emmaus Road and the achievements of rule 18.5.
import { BOOKS } from '../../shared/books.ts';
import { lossInfo } from '../../shared/messages.ts';
import type { Tier } from '../../shared/rules.ts';
import type { Achievement, FinaleView, HopRecord, NumbersView, RoadStop, VerseText, Wording } from '../../shared/types.ts';
import { rulesOf } from './engine.ts';
import type { Journey, World } from './journey.ts';

const EMOJI: Record<Tier, string> = { crumb: '▫️', loaf: '\u{1F35E}', fish: '\u{1F41F}', pearl: '\u{1F9AA}', nugget: '\u{1F7E1}', wall: '' };
const HOUSE = '\u{1F3E0}';
const NEW_MOON = '\u{1F311}';
const LAMP = '\u{1FA94}';
const SALT = '\u{1F9C2}';
const DOVE = '\u{1F54A}️';

/**
 * Rule 13.6, exactly. Plain text is the one place the game uses emoji: a share card is pasted into
 * other apps, where icons cannot travel. It never contains a word, a reference or any verse text.
 */
export function buildShare(w: World, j: Journey): string {
  const r = rulesOf(w, j);
  const hops = j.path.map((h) => EMOJI[h.tier]).join('');
  const line1 = `Bible Hopping #${j.puzzleNo}  ${HOUSE}${hops}${j.status === 'won' ? HOUSE : NEW_MOON}`;
  let line2 = `${j.path.length} ${j.path.length === 1 ? 'hop' : 'hops'} · ${j.manna} manna · ${LAMP} ${Math.max(0, j.oil)}/${r['oil.capacity']}`;
  if (j.looksBack > 0) line2 += ` · ${SALT.repeat(Math.min(5, j.looksBack))}`;
  if (j.gracesUsed > 0) line2 += ` · ${DOVE}`;
  if (j.mode === 'berean') line2 += ' · Berean';
  return `${line1}\n${line2}`;
}

export function verseText(w: World, verse: number, preferred: Wording): VerseText {
  const wording = w.bible.displayWording(verse, preferred);
  return { id: verse, ref: w.bible.label(verse), text: w.bible.text(verse, wording), wording };
}

/** Rule 13.5: the Book of Numbers. */
export function buildNumbers(w: World, j: Journey): NumbersView {
  const r = rulesOf(w, j);
  const books = new Set<number>([w.bible.ref(j.home).book]);
  for (const h of j.path) books.add(w.bible.ref(h.to).book);
  const testaments = new Set([...books].map((b) => BOOKS[b].testament));
  let rarest: NumbersView['rarest'] = null;
  for (const h of j.path) {
    const fam = w.lexicon.family(h.family);
    if (!fam) continue;
    const count = fam.verses.length;
    if (!rarest || count < rarest.count) rarest = { word: h.doorWord, count, tier: h.tier };
  }
  return {
    hops: j.path.length,
    manna: j.manna,
    oilLeft: Math.max(0, j.oil),
    oilCap: r['oil.capacity'],
    books: books.size,
    testaments: testaments.size,
    rarest,
    exactRefs: j.path.filter((h) => h.refScore === 'exact').length,
    revisits: j.path.filter((h) => h.revisit).length,
    looksBack: j.looksBack,
    strikes: j.totalStrikes,
    graceUsed: j.gracesUsed > 0,
  };
}

/** Rule 13.4: the Emmaus Road, every stop in order, starting at home. */
export function buildRoad(w: World, j: Journey, preferred: Wording): RoadStop[] {
  const stops: RoadStop[] = [];
  const stop = (verse: number, cameBy: HopRecord | undefined, leftBy: HopRecord | undefined): RoadStop => {
    const wording = w.bible.displayWording(verse, preferred);
    const inFam = cameBy ? w.lexicon.family(cameBy.family) : undefined;
    const outFam = leftBy ? w.lexicon.family(leftBy.family) : undefined;
    const tokens = w.bible.tokens(verse, wording).map((t) => {
      if (t.w === undefined) return { s: t.s };
      const f = w.lexicon.familyOfVocab[t.w];
      const m = inFam && f === inFam.id ? ('in' as const) : outFam && f === outFam.id ? ('out' as const) : undefined;
      return m ? { s: t.s, m } : { s: t.s };
    });
    const out: RoadStop = { id: verse, ref: w.bible.label(verse), wording, tokens, position: verse / (w.bible.count - 1) };
    if (cameBy) {
      out.hop = cameBy;
      // If the entry word isn't in the displayed wording, the stop says which wording has it.
      if (inFam && !w.lexicon.verseHas(verse, inFam, wording)) out.cameByIn = wording === 'kjv' ? 'web' : 'kjv';
    }
    if (leftBy && outFam && !w.lexicon.verseHas(verse, outFam, wording)) out.leftByIn = wording === 'kjv' ? 'web' : 'kjv';
    return out;
  };
  stops.push(stop(j.home, undefined, j.path[0]));
  j.path.forEach((h, i) => stops.push(stop(h.to, h, j.path[i + 1])));
  return stops;
}

// ---------------------------------------------------------------------------------------------
// achievements (rule 18.5)

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'grasshopper', name: 'Grasshopper', how: 'Finish your first journey.', cite: 'Numbers 13:33' },
  { id: 'enoch', name: 'Enoch’s Walk', how: 'Come home with no revisits and no looks back.', cite: 'Genesis 5:24' },
  { id: 'pearl', name: 'Pearl of Great Price', how: 'Come home through a Pearl.', cite: 'Matthew 13:46' },
  { id: 'loaves', name: 'Loaves and Fishes', how: 'Come home after exactly 5 Loaf hops and 2 Fish hops.', cite: 'Matthew 14:17' },
  { id: 'jehoshaphat', name: 'Jumping Jehoshaphat', how: 'Hop between Genesis and Revelation, in either direction.' },
  { id: 'alphaomega', name: 'Alpha and Omega', how: 'Visit Genesis and Revelation in one journey.', cite: 'Revelation 22:13' },
  { id: 'pentateuch', name: 'Pentateuch Pentathlon', how: 'Visit all five books of Moses in one journey.' },
  { id: 'wept', name: 'Jesus Wept', how: 'Enter and leave John 11:35 on a won journey.', cite: 'John 11:35' },
  { id: 'mites', name: 'Widow’s Mites', how: 'Come home with exactly 2 drops of oil.', cite: 'Mark 12:42' },
  { id: 'forty', name: 'Forty Years', how: 'Come home on your 40th hop.', cite: 'Numbers 14:33' },
  { id: 'salt', name: 'Pillar of Salt', how: 'Look back 5 times in one day.', cite: 'Genesis 19:26' },
  { id: 'seventy', name: 'Seventy Times Seven', how: 'Reach a 490-day streak.', cite: 'Matthew 18:22' },
  // the badges shown on the home screen
  { id: 'prodigal', badge: true, icon: 'home', name: 'Prodigal\u2019s Return', how: 'Come home the moment the way home opens.', cite: 'Luke 15:20' },
  { id: 'bread', badge: true, icon: 'loaf', name: 'Daily Bread', how: 'Come home using only Loaves.', cite: 'Matthew 6:11' },
  { id: 'fishers', badge: true, icon: 'fish', name: 'Fishers of Men', how: 'Come home using only Fish.', cite: 'Matthew 4:19' },
  { id: 'gold', badge: true, icon: 'nugget', name: 'Streets of Gold', how: 'Hop through a Golden Nugget.', cite: 'Revelation 21:21' },
  { id: 'law', badge: true, icon: 'scroll', name: 'The Law and the Prophets', how: 'Come home without leaving the Old Testament.', cite: 'Matthew 5:17' },
  { id: 'covenant', badge: true, icon: 'cross', name: 'New Covenant', how: 'Come home without leaving the New Testament.', cite: 'Luke 22:20' },
];

/** The achievements one finished journey earns. `streak` is the player's streak after this day. */
export function earned(w: World, j: Journey, streak: number, firstFinished: boolean): string[] {
  const out: string[] = [];
  const won = j.status === 'won';
  const book = (v: number) => w.bible.ref(v).book;
  const visited = new Set<number>([book(j.home), ...j.path.map((h) => book(h.to))]);
  if (firstFinished) out.push('grasshopper');
  if (won && j.looksBack === 0 && !j.path.some((h) => h.revisit)) out.push('enoch');
  if (won && (j.path[j.path.length - 1]?.tier === 'pearl' || j.path[j.path.length - 1]?.tier === 'nugget')) out.push('pearl');
  // "after exactly 5 Loaf hops and 2 Fish hops": the hops of the day, the homecoming included
  if (won && j.path.filter((h) => h.tier === 'loaf').length === 5 && j.path.filter((h) => h.tier === 'fish').length === 2 && j.path.length === 7) out.push('loaves');
  if (j.path.some((h) => (book(h.from) === 0 && book(h.to) === 65) || (book(h.from) === 65 && book(h.to) === 0))) out.push('jehoshaphat');
  if (visited.has(0) && visited.has(65)) out.push('alphaomega');
  if ([0, 1, 2, 3, 4].every((b) => visited.has(b))) out.push('pentateuch');
  if (won) {
    const wept = w.bible.id(42, 11, 35);
    const entered = j.path.some((h) => h.to === wept);
    const left = j.path.some((h) => h.from === wept);
    if ((entered || j.home === wept) && (left || j.home === wept) && (entered || left)) out.push('wept');
  }
  if (won && j.oil === 2) out.push('mites');
  if (won && j.hopsTaken === rulesOf(w, j)['wilderness.hops']) out.push('forty');
  if (j.looksBack >= 5) out.push('salt');
  if (streak >= 490) out.push('seventy');
  // the badges
  const last = j.path[j.path.length - 1];
  if (won && last && (last.how === 'golden' || (j.gateOpenedAt !== undefined && j.path.length - 1 === j.gateOpenedAt))) out.push('prodigal');
  if (won && j.path.length && j.path.every((h) => h.tier === 'loaf')) out.push('bread');
  if (won && j.path.length && j.path.every((h) => h.tier === 'fish')) out.push('fishers');
  if (j.path.some((h) => h.tier === 'nugget')) out.push('gold');
  const testaments = new Set([j.home, ...j.path.map((h) => h.to)].map((v) => BOOKS[book(v)].testament));
  if (won && testaments.size === 1 && testaments.has('OT')) out.push('law');
  if (won && testaments.size === 1 && testaments.has('NT')) out.push('covenant');
  return out;
}

export function buildFinale(
  w: World,
  j: Journey,
  preferred: Wording,
  player: { treasure: number; streak: number },
  achievements: Achievement[],
): FinaleView {
  const r = rulesOf(w, j);
  const last = j.path[j.path.length - 1];
  const won = j.status === 'won';
  return {
    date: j.date,
    puzzleNo: j.puzzleNo,
    kind: j.kind,
    mode: j.mode,
    won,
    loss: j.loss ? lossInfo(j.loss, r['wilderness.hops'], r['strikes.max']) : undefined,
    home: verseText(w, j.home, preferred),
    homeWord: won ? last?.doorWord : undefined,
    homeTier: won ? last?.tier : undefined,
    calf: j.fattedCalf,
    manna: j.manna,
    treasure: player.treasure,
    streak: player.streak,
    path: j.path,
    road: buildRoad(w, j, preferred),
    numbers: buildNumbers(w, j),
    share: buildShare(w, j),
    shareTiers: j.path.map((h) => h.tier),
    looksBack: j.looksBack,
    achievements,
  };
}
