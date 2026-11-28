// Challenges: now and then a verse carries a small extra.
//
//  - A double door: one word of the verse you stand on glows. Hop through it and that hop's manna
//    is doubled.
//  - A tag-along: a word that is not in the verse you stand on (so you cannot hop through it from
//    here). If the verse you land on also holds it, that hop's manna is doubled.
//
// A challenge depends only on the date and the verse, so everyone who reaches the same verse on the
// same day meets the same challenge, and a look back brings the same one back.
import type { RuleSet, Tier } from '../../shared/rules.ts';
import type { ChallengeView } from '../../shared/types.ts';
import type { Family } from '../lexicon/lexicon.ts';
import type { Journey, World } from './journey.ts';

export interface Challenge extends ChallengeView {
  /** The family the challenge is about (the door, or the word that must tag along). */
  family: string;
}

/** Words that make good tag-alongs: concrete, common enough to find, never a crumb. */
export const TAG_ALONG_WORDS = [
  'book', 'water', 'light', 'bread', 'fire', 'king', 'heart', 'sea', 'mountain', 'lamb', 'sheep', 'gold', 'stone',
  'tree', 'star', 'wind', 'rain', 'wine', 'child', 'angel', 'temple', 'garden', 'river', 'eagle', 'lion', 'fish',
  'silver', 'crown', 'sword', 'door', 'rock', 'salt', 'seed', 'fruit', 'sun', 'moon', 'cloud', 'voice', 'night',
  'morning', 'city', 'field', 'bird', 'horse', 'ship', 'wilderness', 'prayer', 'song', 'joy', 'peace', 'faith',
  'truth', 'blood', 'mercy', 'glory', 'shepherd', 'vine', 'oil', 'gate', 'altar', 'cup', 'bed', 'tent', 'sabbath',
  'harvest', 'flock', 'dream', 'servant', 'mother', 'brother', 'friend', 'enemy', 'gift', 'treasure', 'wisdom',
];

const GOOD_TIERS: Tier[] = ['loaf', 'fish', 'pearl'];

const rulesFor = (w: World, j: Journey): RuleSet => (j.overrides ? { ...w.rules, ...j.overrides } : w.rules);

/** A small seeded random number generator (mulberry32), seeded from a string. */
function seeded(text: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** True when some verse other than `except` holds both families. Both verse lists are in canonical order. */
function meet(a: Int32Array, b: Int32Array, except: number): boolean {
  let i = 0, k = 0;
  while (i < a.length && k < b.length) {
    if (a[i] === b[k]) {
      if (a[i] !== except) return true;
      i++;
      k++;
    } else if (a[i] < b[k]) i++;
    else k++;
  }
  return false;
}

const cache = new Map<string, Challenge | null>();

/** The challenge a verse carries on a date, before the state of the journey is considered. */
function baseChallenge(w: World, r: RuleSet, date: string, verse: number, lexiconVersion: number): Challenge | null {
  const key = `${date}|${verse}|${lexiconVersion}|${r['challenge.chance']}|${r['challenge.multiplier']}`;
  if (cache.has(key)) return cache.get(key)!;
  const rnd = seeded(`${date}|${verse}`);
  let out: Challenge | null = null;
  if (rnd() < r['challenge.chance']) {
    const times = r['challenge.multiplier'];
    const families = w.lexicon.verseFamilies(verse);
    // a double door must be on the page whichever wording the player reads
    const both = (f: Family) => (w.bible.has(verse, 'kjv') ? w.lexicon.verseHas(verse, f, 'kjv') : true) && (w.bible.has(verse, 'web') ? w.lexicon.verseHas(verse, f, 'web') : true);
    const doors = families.filter((f) => GOOD_TIERS.includes(w.lexicon.tier(f, r)) && both(f));
    const tryDoor = (): Challenge | null => {
      if (!doors.length) return null;
      const fam = doors[Math.floor(rnd() * doors.length)];
      const forms = w.lexicon.formsIn(verse, fam);
      const word = (forms.find((f) => f.wordings.includes('kjv')) ?? forms[0])?.form ?? fam.key;
      return { kind: 'door', family: fam.key, word, times };
    };
    const tryTagAlong = (): Challenge | null => {
      const exits = families.filter((f) => w.lexicon.tier(f, r) !== 'wall');
      const start = Math.floor(rnd() * TAG_ALONG_WORDS.length);
      for (let n = 0; n < TAG_ALONG_WORDS.length; n++) {
        const fam: Family | undefined = w.lexicon.familyOfWord(TAG_ALONG_WORDS[(start + n) % TAG_ALONG_WORDS.length]);
        if (!fam) continue;
        const tier = w.lexicon.tier(fam, r);
        if (tier !== 'loaf' && tier !== 'fish') continue;
        if (w.lexicon.verseHas(verse, fam)) continue; // it must not be a door from here
        if (!exits.some((d) => meet(d.verses, fam.verses, verse))) continue; // and it must be reachable
        return { kind: 'tagalong', family: fam.key, word: fam.key, times };
      }
      return null;
    };
    out = rnd() < 0.5 ? (tryDoor() ?? tryTagAlong()) : (tryTagAlong() ?? tryDoor());
  }
  cache.set(key, out);
  if (cache.size > 5000) cache.delete(cache.keys().next().value!);
  return out;
}

/**
 * The challenge on offer where the player stands, if any. A double door counts only while that
 * door is still open; nothing is offered in the guided first journey or once the day is over.
 */
export function challengeFor(w: World, j: Journey, verse = j.current): Challenge | null {
  const r = rulesFor(w, j);
  if (!r['feature.challenges'] || j.kind === 'guide' || j.status !== 'playing') return null;
  const c = baseChallenge(w, r, j.date, verse, j.lexiconVersion);
  if (!c) return null;
  if (c.kind === 'door') {
    const fam = w.lexicon.family(c.family);
    if (!fam || j.doors[verse]?.includes(fam.key) || (j.mode === 'berean' && j.wordsUsed.includes(fam.key))) return null;
  }
  return c;
}

/** Whether a hop through `door` into `to` meets the challenge. */
export function meets(w: World, c: Challenge, door: Family, to: number): boolean {
  if (c.kind === 'door') return c.family === door.key;
  const fam = w.lexicon.family(c.family);
  return !!fam && w.lexicon.verseHas(to, fam);
}
