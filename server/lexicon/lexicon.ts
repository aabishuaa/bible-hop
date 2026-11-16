// Section 4 of the directive: words, word families and tiers.
//
// A lexicon is built from the Bible text plus one LexiconConfig (the crumb list, the irregular
// table, the spelling variants, the never-stem list and any edits a Head Scribe has made).
// It is rebuilt for every lexicon version (rule 19.4), and a journey keeps the version it began with.
import type { Bible, Wording } from '../bible/bible.ts';
import { WORDINGS, normalizeWord, wordsOf } from '../bible/bible.ts';
import type { LexiconConfig } from './defaults.ts';
import { defaultLexiconConfig } from './defaults.ts';
import type { RuleSet, Tier } from '../../shared/rules.ts';

export interface Family {
  id: number;
  /** The plainest form of the word: "light" for light, lights, lighted, lit. */
  key: string;
  /** Vocabulary ids of every form, most common first. */
  members: number[];
  /** Every verse whose KJV or WEB wording contains any form (rule 4.6), in canonical order. */
  verses: Int32Array;
  crumb: boolean;
  pin?: Exclude<Tier, 'wall'>;
}

/** Regular endings (rule 4.3), most likely base first. Dropped e and doubled consonants are handled. */
export function* regularBases(s: string): Generator<string> {
  const n = s.length;
  const verbal = function* (stem: string, tail: 'ing' | 'other'): Generator<string> {
    if (tail === 'ing' && stem.length === 2 && stem.endsWith('y')) yield stem[0] + 'ie'; // lying -> lie, dying -> die
    yield stem + 'e'; // loved -> love, loving -> love, loveth -> love
    yield stem; // called -> call
    if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2] && !/[aeiou]/.test(stem[stem.length - 1])) {
      yield stem.slice(0, -1); // stopped -> stop
    }
    if (tail === 'other' && stem.endsWith('i')) yield stem.slice(0, -1) + 'y'; // cried -> cry
  };
  if (s.endsWith('edst') && n > 5) yield* verbal(s.slice(0, -4), 'other');
  if (s.endsWith('dst') && n > 4) yield s.slice(0, -2); // saidst -> said
  if (s.endsWith('ing') && n > 4) yield* verbal(s.slice(0, -3), 'ing');
  if (s.endsWith('eth') && n > 4) yield* verbal(s.slice(0, -3), 'other');
  if (s.endsWith('est') && n > 4) yield* verbal(s.slice(0, -3), 'other');
  if (s.endsWith('ed') && n > 3) yield* verbal(s.slice(0, -2), 'other');
  if (s.endsWith('ies') && n > 3) {
    yield s.slice(0, -1); // lies -> lie
    yield s.slice(0, -3) + 'y'; // cities -> city
  }
  if (s.endsWith('es') && n > 3) {
    yield s.slice(0, -1); // loves -> love
    yield s.slice(0, -2); // boxes -> box
  }
  if (s.endsWith('s') && !s.endsWith('ss') && n > 2) yield s.slice(0, -1);
}

const OUR_OR = /our(s|ed|ing|er|ers|able|ably|eth|est|ite|ites|less)?$/;

export class Lexicon {
  readonly families: Family[] = [];
  /** Vocabulary id -> family id. */
  readonly familyOfVocab: Int32Array;
  private readonly byKey = new Map<string, Family>();
  private readonly solid = new Map<string, number>();
  private readonly crumbSet: Set<string>;
  readonly oilFamily: Family | undefined;
  /** Joins the name guard refused, kept for the Desk's lexicon screen: [name, look-alike]. */
  readonly keptApart: [string, string][] = [];

  constructor(
    readonly bible: Bible,
    readonly config: LexiconConfig = defaultLexiconConfig(),
    readonly version = 1,
  ) {
    const { vocab } = bible;
    const n = vocab.length;
    this.crumbSet = new Set(config.crumbs.map(normalizeWord));
    const neverStem = new Set(config.neverStem.map(normalizeWord));
    const split = new Set(config.split.map(normalizeWord));
    const isCrumb = (i: number) => this.crumbSet.has(vocab[i]);

    // --- union-find over the vocabulary
    const parent = new Int32Array(n);
    for (let i = 0; i < n; i++) parent[i] = i;
    const find = (i: number): number => {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
      }
      return i;
    };
    const union = (a: number, b: number) => {
      const ra = find(a), rb = find(b);
      if (ra !== rb) parent[rb] = ra;
    };
    /** Rule 4.5: crumbs never join a family that isn't a crumb. A split form joins nothing. */
    const mayJoin = (a: number, b: number) => a !== b && isCrumb(a) === isCrumb(b) && !split.has(vocab[a]) && !split.has(vocab[b]);

    // Hyphenated words join the same word written solid (stiff-necked, stiffnecked).
    for (let i = 0; i < n; i++) {
      const s = vocab[i].replace(/-/g, '');
      const j = this.solid.get(s);
      if (j === undefined) this.solid.set(s, i);
      else if (mayJoin(i, j)) union(i, j);
    }
    const lookup = (s: string) => this.solid.get(s);

    // A name is kept apart from a common word it only happens to look like (Jared is not jar + ed):
    // a word that is always capitalized, even in the middle of a sentence, never takes a regular
    // ending back to a word that is also written in lower case. (Rule 4.4: words that only look related stay apart.)
    const hasLower = new Uint8Array(n);
    const capMid = new Uint8Array(n);
    for (const wording of WORDINGS) {
      for (let v = 0; v < bible.count; v++) {
        if (!bible.has(v, wording)) continue;
        const toks = bible.tokens(v, wording);
        let sentenceStart = true;
        for (const t of toks) {
          if (t.w === undefined) {
            if (/[.?!:;]|["“‘(]/.test(t.s)) sentenceStart = true;
            else if (/,/.test(t.s) && wording === 'kjv') sentenceStart = true; // the KJV capitalizes speech after a comma
            continue;
          }
          const c = t.s.charCodeAt(0);
          if (c >= 97) hasLower[t.w] = 1;
          else if (!sentenceStart) capMid[t.w] = 1;
          sentenceStart = false;
        }
      }
    }
    const properOnly = (i: number) => capMid[i] === 1 && hasLower[i] === 0;

    // Regular endings and possessives.
    for (let i = 0; i < n; i++) {
      const word = vocab[i];
      if (split.has(word)) continue;
      const s = word.replace(/-/g, '');
      if (s.endsWith("'s")) {
        const j = lookup(s.slice(0, -2));
        if (j !== undefined && mayJoin(i, j)) union(i, j);
        continue;
      }
      if (s.includes("'") || neverStem.has(s)) continue;
      for (const base of regularBases(s)) {
        if (base.length < 2 || base === s) continue;
        const j = lookup(base);
        if (j === undefined || !mayJoin(i, j)) continue;
        if (properOnly(i) && hasLower[j] === 1 && capMid[j] === 0) {
          this.keptApart.push([word, vocab[j]]);
          continue;
        }
        union(i, j);
        break;
      }
    }

    // Irregular forms (Appendix C), unless the feature is switched off.
    const irregularBase = new Set<number>();
    if (config.useIrregulars) {
      for (const [base, forms] of Object.entries(config.irregulars)) {
        const ids = [base, ...forms].map((w) => lookup(normalizeWord(w))).filter((x): x is number => x !== undefined);
        const b = lookup(normalizeWord(base));
        if (b !== undefined) irregularBase.add(b);
        for (let k = 1; k < ids.length; k++) if (mayJoin(ids[0], ids[k])) union(ids[0], ids[k]);
      }
    }

    // Spelling variants (Appendix C), and the same -our/-or pairing on their longer forms (labourer, laborer).
    for (const [a, b] of config.variants) {
      const ia = lookup(normalizeWord(a)), ib = lookup(normalizeWord(b));
      if (ia !== undefined && ib !== undefined && mayJoin(ia, ib)) union(ia, ib);
    }
    for (let i = 0; i < n; i++) {
      const s = vocab[i];
      if (s.length < 6 || !OUR_OR.test(s)) continue;
      const j = lookup(s.replace(OUR_OR, (m) => 'or' + m.slice(3)));
      if (j !== undefined && mayJoin(i, j)) union(i, j);
    }

    // Joins made by a Scribe.
    for (const [a, b] of config.joins) {
      const ia = lookup(normalizeWord(a)), ib = lookup(normalizeWord(b));
      if (ia !== undefined && ib !== undefined && ia !== ib) union(ia, ib);
    }

    // --- families
    const rootToFamily = new Map<number, number>();
    const membersOf: number[][] = [];
    this.familyOfVocab = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const r = find(i);
      let f = rootToFamily.get(r);
      if (f === undefined) {
        f = membersOf.length;
        rootToFamily.set(r, f);
        membersOf.push([]);
      }
      membersOf[f].push(i);
      this.familyOfVocab[i] = f;
    }

    // verse lists: one pass over the corpus, each verse counted once per family
    const verseLists: number[][] = membersOf.map(() => []);
    for (let v = 0; v < bible.count; v++) {
      for (const wording of WORDINGS) {
        const ws = bible.words[wording][v];
        for (let k = 0; k < ws.length; k++) {
          const list = verseLists[this.familyOfVocab[ws[k]]];
          if (list[list.length - 1] !== v) list.push(v);
        }
      }
    }

    for (let f = 0; f < membersOf.length; f++) {
      const members = membersOf[f].sort((a, b) => bible.vocabFreq[b] - bible.vocabFreq[a] || vocab[a].localeCompare(vocab[b]));
      const plain = members.filter((m) => !vocab[m].includes("'") && !vocab[m].includes('-'));
      const pool = plain.length ? plain : members;
      const irregular = pool.find((m) => irregularBase.has(m));
      const keyId = irregular ?? [...pool].sort((a, b) => vocab[a].length - vocab[b].length || bible.vocabFreq[b] - bible.vocabFreq[a] || vocab[a].localeCompare(vocab[b]))[0];
      const family: Family = {
        id: f,
        key: vocab[keyId],
        members,
        verses: Int32Array.from(verseLists[f]),
        crumb: members.some((m) => isCrumb(m)),
      };
      this.families.push(family);
    }
    for (const fam of this.families) {
      // keys are unique because every word belongs to exactly one family
      this.byKey.set(fam.key, fam);
    }
    for (const [word, pin] of Object.entries(config.pins)) {
      const fam = this.familyOfWord(word);
      if (fam) fam.pin = pin.tier;
    }
    this.oilFamily = this.familyOfWord('oil');
  }

  /** The family of any word, in any form. Words the Bible text lacks are reduced by the regular endings. */
  familyOfWord(raw: string): Family | undefined {
    const word = normalizeWord(raw);
    const direct = this.bible.vocabIndex.get(word) ?? this.solid.get(word.replace(/-/g, ''));
    if (direct !== undefined) return this.families[this.familyOfVocab[direct]];
    let s = word.replace(/-/g, '');
    if (s.endsWith("'s")) s = s.slice(0, -2);
    else if (s.endsWith("s'")) s = s.slice(0, -1);
    s = s.replace(/'/g, '');
    const hit = this.solid.get(s);
    if (hit !== undefined) return this.families[this.familyOfVocab[hit]];
    const crumb = this.crumbSet.has(word);
    for (const base of regularBases(s)) {
      if (base.length < 2) continue;
      const j = this.solid.get(base);
      if (j === undefined) continue;
      const fam = this.families[this.familyOfVocab[j]];
      if (fam.crumb !== crumb) continue;
      return fam;
    }
    return undefined;
  }

  family(key: string): Family | undefined {
    return this.byKey.get(key);
  }

  isCrumbWord(raw: string): boolean {
    return this.crumbSet.has(normalizeWord(raw));
  }

  /** Rule 4.7. A word found in this verse only is a Wall, whatever else it is. */
  tier(fam: Family, rules: RuleSet): Tier {
    const count = fam.verses.length;
    if (count <= 1) return 'wall';
    if (fam.pin) return fam.pin;
    if (fam.crumb) return 'crumb';
    if (count >= rules['tier.loafMin']) return 'loaf';
    if (count >= rules['tier.fishMin']) return 'fish';
    if (count >= rules['tier.pearlMin']) return 'pearl';
    return 'wall';
  }

  /** The forms of a family as players should see them, most common first. */
  forms(fam: Family, limit = Infinity): string[] {
    return fam.members.slice(0, limit).map((m) => this.bible.vocab[m]);
  }

  /** Every door of a verse: the families of its words in either wording (rules 3.4, 3.5), in reading order. */
  verseFamilies(verse: number, only?: Wording): Family[] {
    const seen = new Set<number>();
    const out: Family[] = [];
    for (const wording of only ? [only] : WORDINGS) {
      for (const w of this.bible.words[wording][verse]) {
        const f = this.familyOfVocab[w];
        if (!seen.has(f)) {
          seen.add(f);
          out.push(this.families[f]);
        }
      }
    }
    return out;
  }

  verseHas(verse: number, fam: Family, only?: Wording): boolean {
    if (!only) {
      const a = fam.verses;
      let lo = 0, hi = a.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (a[mid] === verse) return true;
        if (a[mid] < verse) lo = mid + 1;
        else hi = mid - 1;
      }
      return false;
    }
    for (const w of this.bible.words[only][verse]) if (this.familyOfVocab[w] === fam.id) return true;
    return false;
  }

  /** The forms of a family found in a verse, with the wordings that have them. */
  formsIn(verse: number, fam: Family): { form: string; wordings: Wording[] }[] {
    const found = new Map<string, Wording[]>();
    for (const wording of WORDINGS) {
      for (const w of this.bible.words[wording][verse]) {
        if (this.familyOfVocab[w] !== fam.id) continue;
        const form = this.bible.vocab[w];
        const list = found.get(form) ?? [];
        if (!list.includes(wording)) list.push(wording);
        found.set(form, list);
      }
    }
    return [...found].map(([form, wordings]) => ({ form, wordings }));
  }

  /** Whether typed text holds a family in any form (the translation gap, rule 10.2). */
  textHas(text: string, fam: Family): boolean {
    return wordsOf(text).some((w) => this.familyOfWord(w)?.id === fam.id);
  }

  /** "Ways home" (rule 16.3): the families of a verse that are neither crumbs nor Walls. */
  waysHome(verse: number, rules: RuleSet): Family[] {
    return this.verseFamilies(verse).filter((f) => {
      const t = this.tier(f, rules);
      return t !== 'crumb' && t !== 'wall';
    });
  }
}
