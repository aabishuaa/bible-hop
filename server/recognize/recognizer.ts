// Section 5 of the directive: recognizing the verse a player types.
//
// One search index is built per lexicon version (rule 19.4): BM25 over one document per verse
// per wording. Candidates are then scored with P, R, F and S (rule 5.4) and the rules of 5.5
// decide between them. Everything here is local and synchronous; the AI check lives in ai.ts.
import type { Bible, Wording } from '../bible/bible.ts';
import { WORDINGS, normalizeWord, wordsOf } from '../bible/bible.ts';
import type { ParsedRef, RefParser } from '../bible/refs.ts';
import type { Family, Lexicon } from '../lexicon/lexicon.ts';
import type { RuleSet } from '../../shared/rules.ts';

/**
 * Rule 5.3 — old and new words that count as the same word when matching. Each group is one stem.
 * (Pairs made only of crumbs, such as thee and you, need no entry: crumbs are dropped before matching.
 * Pairs that are already one word family, such as spake and spoke, need none either.)
 */
const SYNONYMS: string[][] = [
  ['everlasting', 'eternal'],
  ['charity', 'love'],
  ['ghost', 'spirit'],
  ['lord', 'yahweh', 'jehovah'],
  ['sepulchre', 'sepulcher', 'tomb'],
  ['verily', 'truly', 'assuredly', 'certainly'],
  ['messiah', 'messias', 'christ'],
  ['testament', 'covenant'],
  ['comforter', 'counselor', 'helper', 'advocate'],
  ['raiment', 'clothe'],
  ['devil', 'demon'],
  ['hell', 'sheol', 'hades'],
  ['ass', 'donkey'],
  ['morrow', 'tomorrow'],
  ['nigh', 'near'],
  ['smite', 'strike'],
  ['husbandman', 'farmer'],
  ['damsel', 'girl'],
  ['church', 'assembly'],
  ['gentile', 'nation'],
  ['esaias', 'isaiah'],
  ['elias', 'elijah'],
  ['noe', 'noah'],
];

/** British and American spellings of a word the text does not have (rule 5.3). */
function* spellingAlternates(w: string): Generator<string> {
  if (w.includes('our')) yield w.replace('our', 'or');
  if (/or(s|ed|ing|able)?$/.test(w)) yield w.replace(/or(s|ed|ing|able)?$/, 'our$1');
  if (w.endsWith('re')) yield w.slice(0, -2) + 'er';
  if (w.endsWith('er')) yield w.slice(0, -2) + 're';
  if (w.includes('is')) yield w.replace(/is(e|ed|es|ing|ation)$/, 'iz$1');
  if (w.includes('iz')) yield w.replace(/iz(e|ed|es|ing|ation)$/, 'is$1');
  if (w.includes('ll')) yield w.replace('ll', 'l');
  if (/[aeiou]l(ed|ing|er|ous)$/.test(w)) yield w.replace(/l(ed|ing|er|ous)$/, 'll$1');
  if (w.endsWith('ence')) yield w.slice(0, -4) + 'ense';
  if (w.endsWith('ense')) yield w.slice(0, -4) + 'ence';
  if (w.includes('ae')) yield w.replace('ae', 'e');
  if (w.includes('grey')) yield w.replace('grey', 'gray');
  if (w.includes('gray')) yield w.replace('gray', 'grey');
}

/** Edit distance where a swap of two neighbouring letters counts once; gives up beyond `max`. */
function editDistance(a: string, b: string, max: number): number {
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: lb + 1 }, (_, j) => j);
  for (let i = 1; i <= la; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[lb];
}

export interface Scores {
  P: number;
  R: number;
  F: number;
  S: number;
  /** How many of the player's distinct meaning words the verse holds. */
  shared: number;
}

interface Term {
  /** The stems this typed word may stand for: one for a known word, several for a typo. */
  alts: number[];
  /** The weight used when the word is not found in a verse. */
  w: number;
  raw: string;
}

export interface Analysis {
  /** Every word typed, normalized. */
  words: string[];
  /** Distinct meaning words (crumbs dropped). */
  terms: Term[];
  /** The meaning words in typed order, as indexes into `terms`. */
  seq: number[];
}

export interface Candidate {
  verse: number;
  wording: Wording;
  score: Scores;
  hasDoor: boolean;
}

export type Recognition =
  | { kind: 'identified'; verse: number; how: 'reference' | 'match' | 'rival-reference'; score: Scores; long: boolean }
  | { kind: 'confirm'; verse: number; score: Scores; long: boolean }
  | { kind: 'choose'; verses: number[]; long: boolean }
  | { kind: 'ask'; code: 'ask.short' | 'ask.more' | 'ask.refrain' | 'ask.refOnly'; long: boolean }
  | { kind: 'nofit'; long: boolean; meaningWords: number };

export interface Alias {
  verse: number;
  text: string;
}

const K1 = 1.2;
const B = 0.75;
const MAX_WEIGHT = 7;
const MIN_WEIGHT = 0.4;
const UNKNOWN_WEIGHT = 4;
const TOP_K = 80;

export class Recognizer {
  /** Family id -> stem id (families joined by the synonyms of rule 5.3). */
  private readonly stemOfFamily: Int32Array;
  private readonly stemCount: number;
  /** How rare each stem is. */
  private readonly weight: Float32Array;
  private readonly idf: Float32Array;
  /** Meaning-word stems of each document, in order. docId = verse * 2 + wording index. */
  private readonly docs: Int32Array[] = [];
  private readonly postings: Int32Array[];
  private readonly postingTf: Uint8Array[];
  private readonly avgLen: number;
  private readonly scratch: Float32Array;
  private readonly byLength = new Map<number, number[]>();
  private aliases: { verse: number; stems: Int32Array }[] = [];

  constructor(
    readonly bible: Bible,
    readonly lexicon: Lexicon,
    readonly refs: RefParser,
  ) {
    const fams = lexicon.families;
    // --- stems: union families through the synonym groups
    const parent = Int32Array.from(fams, (_, i) => i);
    const find = (i: number): number => {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
      }
      return i;
    };
    for (const group of SYNONYMS) {
      const ids = group.map((w) => lexicon.familyOfWord(w)).filter((f): f is Family => !!f && !f.crumb).map((f) => f.id);
      for (let k = 1; k < ids.length; k++) parent[find(ids[k])] = find(ids[0]);
    }
    const stemIds = new Map<number, number>();
    this.stemOfFamily = new Int32Array(fams.length);
    for (let f = 0; f < fams.length; f++) {
      if (fams[f].crumb) {
        this.stemOfFamily[f] = -1;
        continue;
      }
      const r = find(f);
      let s = stemIds.get(r);
      if (s === undefined) {
        s = stemIds.size;
        stemIds.set(r, s);
      }
      this.stemOfFamily[f] = s;
    }
    this.stemCount = stemIds.size;

    // --- documents and verse-level rarity
    const df = new Int32Array(this.stemCount);
    const stamp = new Int32Array(this.stemCount).fill(-1);
    const lists: number[][] = Array.from({ length: this.stemCount }, () => []);
    const tfs: number[][] = Array.from({ length: this.stemCount }, () => []);
    let totalLen = 0, docCount = 0;
    for (let v = 0; v < bible.count; v++) {
      for (let wi = 0; wi < WORDINGS.length; wi++) {
        const ws = bible.words[WORDINGS[wi]][v];
        const stems: number[] = [];
        for (const w of ws) {
          const s = this.stemOfFamily[lexicon.familyOfVocab[w]];
          if (s >= 0) stems.push(s);
        }
        const doc = Int32Array.from(stems);
        const docId = v * 2 + wi;
        this.docs.push(doc);
        if (doc.length) {
          totalLen += doc.length;
          docCount++;
        }
        const counts = new Map<number, number>();
        for (const s of doc) counts.set(s, (counts.get(s) ?? 0) + 1);
        for (const [s, c] of counts) {
          lists[s].push(docId);
          tfs[s].push(Math.min(255, c));
          if (stamp[s] !== v) {
            stamp[s] = v;
            df[s]++;
          }
        }
      }
    }
    this.avgLen = totalLen / Math.max(1, docCount);
    this.postings = lists.map((l) => Int32Array.from(l));
    this.postingTf = tfs.map((l) => Uint8Array.from(l));
    this.idf = new Float32Array(this.stemCount);
    this.weight = new Float32Array(this.stemCount);
    for (let s = 0; s < this.stemCount; s++) {
      const idf = Math.log(1 + (bible.count - df[s] + 0.5) / (df[s] + 0.5));
      this.idf[s] = idf;
      this.weight[s] = Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, idf));
    }
    this.scratch = new Float32Array(bible.count * 2);

    // --- vocabulary by length, for small typos
    bible.vocab.forEach((w, i) => {
      if (this.stemOfFamily[lexicon.familyOfVocab[i]] < 0) return;
      const plain = w.replace(/['-]/g, '');
      const list = this.byLength.get(plain.length) ?? [];
      list.push(i);
      this.byLength.set(plain.length, list);
    });
  }

  /** Wordings a Scribe has taught the game for a verse (rule 16.8). */
  setAliases(aliases: Alias[]): void {
    this.aliases = aliases.map((a) => {
      const an = this.analyze(a.text);
      return { verse: a.verse, stems: Int32Array.from(an.seq.map((i) => an.terms[i].alts[0]).filter((s) => s !== undefined && s >= 0)) };
    });
  }

  /** The stem of a word, -1 for a crumb, undefined for a word the text does not know. */
  private stemOfWord(word: string): number | undefined {
    if (this.lexicon.isCrumbWord(word)) return -1;
    let fam = this.lexicon.familyOfWord(word);
    if (!fam) {
      const plain = word.replace(/['-]/g, '');
      for (const alt of spellingAlternates(plain)) {
        fam = this.lexicon.familyOfWord(alt);
        if (fam) break;
      }
    }
    return fam ? this.stemOfFamily[fam.id] : undefined;
  }

  /** Rule 5.3: lowercase, drop crumbs, reduce to stems, allow small typos. */
  analyze(text: string): Analysis {
    const words = wordsOf(text);
    const terms: Term[] = [];
    const seq: number[] = [];
    const index = new Map<string, number>();
    for (const word of words) {
      const stem = this.stemOfWord(word);
      if (stem === -1) continue;
      const key = stem !== undefined ? `s${stem}` : `w${word}`;
      let ti = index.get(key);
      if (ti === undefined) {
        let term: Term;
        if (stem !== undefined) term = { alts: [stem], w: this.weight[stem], raw: word };
        else {
          const alts = this.typoStems(word);
          term = { alts, w: alts.length ? Math.max(...alts.map((s) => this.weight[s])) : UNKNOWN_WEIGHT, raw: word };
        }
        ti = terms.length;
        terms.push(term);
        index.set(key, ti);
      }
      seq.push(ti);
    }
    return { words, terms, seq };
  }

  /** One letter off in words of 6 to 8 letters, two in longer words. */
  private typoStems(word: string): number[] {
    const plain = word.replace(/['-]/g, '');
    const max = plain.length >= 9 ? 2 : plain.length >= 6 ? 1 : 0;
    if (!max) return [];
    let best = max + 1;
    let hits: number[] = [];
    for (let len = plain.length - max; len <= plain.length + max; len++) {
      for (const vi of this.byLength.get(len) ?? []) {
        const d = editDistance(plain, this.bible.vocab[vi].replace(/['-]/g, ''), Math.min(max, best));
        if (d > max || d > best) continue;
        if (d < best) {
          best = d;
          hits = [];
        }
        hits.push(this.stemOfFamily[this.lexicon.familyOfVocab[vi]]);
      }
    }
    return [...new Set(hits)].slice(0, 8);
  }

  meaningWordCount(an: Analysis): number {
    return an.terms.length;
  }

  /** Rule 5.4: P, R, F and S of typed text against one document. */
  private scoreDoc(an: Analysis, doc: Int32Array): Scores {
    if (!doc.length || !an.terms.length) return { P: 0, R: 0, F: 0, S: 0, shared: 0 };
    const first = new Map<number, number>();
    const last = new Map<number, number>();
    for (let i = 0; i < doc.length; i++) {
      if (!first.has(doc[i])) first.set(doc[i], i);
      last.set(doc[i], i);
    }
    // which stem each typed term matched, if any
    const matched: (number | undefined)[] = an.terms.map((t) => t.alts.find((s) => first.has(s)));
    let pFound = 0, pAll = 0, shared = 0;
    const covered = new Set<number>();
    an.terms.forEach((t, i) => {
      const m = matched[i];
      if (m !== undefined) {
        pFound += this.weight[m];
        pAll += this.weight[m];
        covered.add(m);
        shared++;
      } else pAll += t.w;
    });
    let rFound = 0, rAll = 0;
    for (const s of first.keys()) {
      rAll += this.weight[s];
      if (covered.has(s)) rFound += this.weight[s];
    }
    // Each share is taken two ways, weighted by rarity and by plain count, and the kinder one is kept:
    // a player reciting the common half of a long verse, or a modern wording that swaps a rare word,
    // should not be turned away by the weighting alone (rule 5.1).
    const P = Math.max(pAll ? pFound / pAll : 0, shared / an.terms.length);
    const R = Math.max(rAll ? rFound / rAll : 0, covered.size / first.size);
    // F blends P and R, leaning on P: reciting part of a verse is fine, adding words it lacks is not.
    const F = 0.7 * P + 0.3 * R;
    // the share of the player's word pairs that appear in the same order in the verse
    let pairs = 0, ordered = 0;
    for (let i = 1; i < an.seq.length; i++) {
      const a = an.seq[i - 1], b = an.seq[i];
      if (a === b) continue;
      pairs++;
      const ma = matched[a], mb = matched[b];
      if (ma !== undefined && mb !== undefined && first.get(ma)! < last.get(mb)!) ordered++;
    }
    const O = pairs ? ordered / pairs : P > 0 ? 1 : 0;
    return { P, R, F, S: 0.8 * F + 0.2 * O, shared };
  }

  /** The better of a verse's two wordings. */
  scoreVerse(an: Analysis, verse: number): { score: Scores; wording: Wording } {
    let best: { score: Scores; wording: Wording } = { score: { P: 0, R: 0, F: 0, S: 0, shared: 0 }, wording: 'kjv' };
    WORDINGS.forEach((wording, wi) => {
      const score = this.scoreDoc(an, this.docs[verse * 2 + wi]);
      if (score.S > best.score.S || (score.S === best.score.S && score.shared > best.score.shared)) best = { score, wording };
    });
    for (const a of this.aliases) {
      if (a.verse !== verse) continue;
      const score = this.scoreDoc(an, a.stems);
      if (score.S > best.score.S) best = { score, wording: best.wording };
    }
    return best;
  }

  /** How many of the player's meaning words a verse shares, in its better wording (rule 5.7b). */
  sharedWords(an: Analysis, verse: number): number {
    return this.scoreVerse(an, verse).score.shared;
  }

  /** BM25 over one document per verse per wording; returns the best verses. */
  private search(an: Analysis): number[] {
    const scores = this.scratch;
    const touched: number[] = [];
    const add = (stem: number, boost: number) => {
      const list = this.postings[stem], tf = this.postingTf[stem];
      const idf = this.idf[stem] * boost;
      for (let i = 0; i < list.length; i++) {
        const d = list[i];
        if (scores[d] === 0) touched.push(d);
        const f = tf[i];
        scores[d] += (idf * f * (K1 + 1)) / (f + K1 * (1 - B + (B * this.docs[d].length) / this.avgLen));
      }
    };
    for (const t of an.terms) {
      if (t.alts.length === 1) add(t.alts[0], 1);
      else for (const s of t.alts) add(s, 0.6);
    }
    touched.sort((a, b) => scores[b] - scores[a]);
    const verses: number[] = [];
    const seen = new Set<number>();
    for (const d of touched) {
      const v = d >> 1;
      if (!seen.has(v)) {
        seen.add(v);
        verses.push(v);
        if (verses.length >= TOP_K) break;
      }
    }
    for (const d of touched) scores[d] = 0;
    for (const a of this.aliases) if (!seen.has(a.verse)) verses.push(a.verse);
    return verses;
  }

  /** Every verse the typed words fit (rule 5.4), best first. */
  candidates(an: Analysis, rules: RuleSet, door?: Family): Candidate[] {
    const out: Candidate[] = [];
    for (const verse of this.search(an)) {
      const { score, wording } = this.scoreVerse(an, verse);
      if (score.P >= rules['match.P'] && score.R >= rules['match.R'] && score.S >= rules['match.S']) {
        out.push({ verse, wording, score, hasDoor: door ? this.lexicon.verseHas(verse, door) : false });
      }
    }
    return out.sort((a, b) => b.score.S - a.score.S || a.verse - b.verse);
  }

  /**
   * Rules 5.2 to 5.5: find the one verse the player means.
   * `reference` is the reference box, already parsed (null when empty or unreadable).
   */
  recognize(typedRaw: string, reference: ParsedRef | null, door: Family | undefined, rules: RuleSet): Recognition {
    const long = typedRaw.length > rules['match.maxChars'];
    let typed = typedRaw.slice(0, rules['match.maxChars']).trim();
    // (f) a reference in the verse box
    if (this.refs.isOnlyReference(typed)) return { kind: 'ask', code: 'ask.refOnly', long };
    const split = this.refs.splitFromText(typed);
    if (split.ref) {
      typed = split.text;
      if (!reference) reference = split.ref;
    }
    const an = this.analyze(typed);
    const meaningWords = an.terms.length;
    if (!meaningWords) return { kind: 'ask', code: 'ask.short', long };

    const fitsRef = (s: Scores) => s.P >= rules['match.refP'] && s.R >= rules['match.refR'] && s.S >= rules['match.refS'];
    const refScore = reference?.id !== undefined ? this.scoreVerse(an, reference.id).score : undefined;

    // (e) too short: fewer than 2 meaning words, unless those words make up the whole verse
    if (meaningWords < rules['match.minWords']) {
      if (refScore && refScore.P >= 0.999 && refScore.R >= 0.999) return { kind: 'identified', verse: reference!.id!, how: 'reference', score: refScore, long };
      const whole = this.candidates(an, rules, door).filter((c) => c.score.P >= 0.999 && c.score.R >= 0.999);
      if (!whole.length) return { kind: 'ask', code: 'ask.short', long };
    }

    // 5.2 step 1: the reference box names a real verse and the typed words fit it at least loosely
    if (refScore && fitsRef(refScore)) return { kind: 'identified', verse: reference!.id!, how: 'reference', score: refScore, long };

    // 5.2 step 2: match the typed words against every verse in both wordings
    const fits = this.candidates(an, rules, door);
    if (!fits.length) return { kind: 'nofit', long, meaningWords };

    // 5.5 (a) the door word wins near-ties
    let best = fits[0];
    let pool = fits;
    if (door && !best.hasDoor) {
      const withDoor = fits.find((c) => c.hasDoor && c.score.S >= best.score.S - rules['match.doorPreference']);
      if (withDoor) {
        best = withDoor;
        pool = fits.filter((c) => c.hasDoor);
      }
    }
    // 5.5 (b) rivals
    let rivals = pool.filter((c) => c.score.S >= best.score.S - rules['match.tie']);
    if (door && rivals.length > 1) {
      const withDoor = rivals.filter((c) => c.hasDoor);
      if (withDoor.length) rivals = withDoor;
    }
    if (rivals.length === 1) {
      const only = rivals[0];
      return only.score.S >= rules['match.auto']
        ? { kind: 'identified', verse: only.verse, how: 'match', score: only.score, long }
        : { kind: 'confirm', verse: only.verse, score: only.score, long };
    }
    if (reference) {
      const same = rivals.filter((c) => c.verse === reference!.id);
      const r = reference;
      const chapter = rivals.filter((c) => {
        const v = this.bible.ref(c.verse);
        return v.book === r.book && r.chapter !== undefined && v.chapter === r.chapter;
      });
      const pick = same.length === 1 ? same[0] : chapter.length === 1 ? chapter[0] : undefined;
      if (pick) return { kind: 'identified', verse: pick.verse, how: 'rival-reference', score: pick.score, long };
    }
    // 5.5 (d) refrains, (c) lists
    if (rivals.length > rules['match.listMax']) return { kind: 'ask', code: 'ask.refrain', long };
    if (meaningWords >= rules['match.listMinWords']) return { kind: 'choose', verses: rivals.slice(0, rules['match.listMax']).map((c) => c.verse), long };
    return { kind: 'ask', code: 'ask.more', long };
  }

  /** Up to `limit` verses that hold a family, for the Sunday School concordance (rule 18.3). */
  concordance(fam: Family, book: number | undefined, limit: number): number[] {
    const out: number[] = [];
    for (const v of fam.verses) {
      if (book !== undefined && this.bible.ref(v).book !== book) continue;
      out.push(v);
      if (out.length >= limit) break;
    }
    return out;
  }

  normalize(word: string): string {
    return normalizeWord(word);
  }
}
