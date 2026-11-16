// The Bible text in both wordings, in the KJV's numbering (rule 19.2):
// 31,102 verses, indexed 0 to 31,101 in canonical order.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOOKS, displayBook } from '../../shared/books.ts';

export type Wording = 'kjv' | 'web';
export const WORDINGS: Wording[] = ['kjv', 'web'];
export const WORDING_NAMES: Record<Wording, string> = { kjv: 'King James Version', web: 'World English Bible' };

export interface VerseRef {
  book: number; // 0-65
  chapter: number; // 1-based
  verse: number; // 1-based
}

export interface Token {
  /** The text exactly as printed: a word, or the spacing and punctuation between two words. */
  s: string;
  /** For a word: its index in the corpus vocabulary. */
  w?: number;
}

const WORD_RE = /[A-Za-z]+(?:['’-][A-Za-z]+)*/g;

/** Rule 4.1: lower case, and curly apostrophes count as straight ones. */
export function normalizeWord(raw: string): string {
  return raw.toLowerCase().replace(/’/g, "'");
}

/** Splits any text into words by rule 4.1. Used for typed text as well as verses. */
export function wordsOf(text: string): string[] {
  const plain = text.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  return (plain.match(WORD_RE) ?? []).map(normalizeWord);
}

export class Bible {
  readonly count: number;
  /** First verse id of each book, plus the total at the end. */
  readonly bookStart: number[] = [];
  /** For each book, the first verse id of each chapter, plus the book's end. */
  readonly chapterStart: number[][] = [];
  private readonly refs: VerseRef[] = [];
  private readonly texts: Record<Wording, string[]> = { kjv: [], web: [] };

  /** Every distinct word (normalized) in either wording. */
  readonly vocab: string[] = [];
  readonly vocabIndex = new Map<string, number>();
  /** How many verses-and-wordings contain each word. */
  readonly vocabFreq: number[] = [];
  /** Word ids of every verse in each wording, in order, repeats included. */
  readonly words: Record<Wording, Int32Array[]> = { kjv: [], web: [] };

  constructor(dataDir: string) {
    const load = (name: string) => JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8')).books as string[][][];
    const kjv = load('kjv.json');
    const web = load('web.json');
    let id = 0;
    for (let b = 0; b < kjv.length; b++) {
      this.bookStart.push(id);
      const starts: number[] = [];
      for (let c = 0; c < kjv[b].length; c++) {
        starts.push(id);
        for (let v = 0; v < kjv[b][c].length; v++) {
          this.refs.push({ book: b, chapter: c + 1, verse: v + 1 });
          this.texts.kjv.push(kjv[b][c][v]);
          this.texts.web.push(web[b]?.[c]?.[v] ?? '');
          id++;
        }
      }
      starts.push(id);
      this.chapterStart.push(starts);
    }
    this.bookStart.push(id);
    this.count = id;
    for (const wording of WORDINGS) {
      for (let i = 0; i < this.count; i++) {
        const ids = wordsOf(this.texts[wording][i]).map((w) => this.intern(w));
        this.words[wording].push(Int32Array.from(ids));
        for (const w of new Set(ids)) this.vocabFreq[w]++;
      }
    }
  }

  private intern(word: string): number {
    let i = this.vocabIndex.get(word);
    if (i === undefined) {
      i = this.vocab.length;
      this.vocab.push(word);
      this.vocabFreq.push(0);
      this.vocabIndex.set(word, i);
    }
    return i;
  }

  ref(id: number): VerseRef {
    return this.refs[id];
  }

  /** "Psalm 119:105" */
  label(id: number): string {
    const r = this.refs[id];
    return `${displayBook(r.book)} ${r.chapter}:${r.verse}`;
  }

  /** The verse id, or -1 when the book, chapter or verse does not exist. */
  id(book: number, chapter: number, verse: number): number {
    const starts = this.chapterStart[book];
    if (!starts || chapter < 1 || chapter >= starts.length) return -1;
    const id = starts[chapter - 1] + verse - 1;
    return verse >= 1 && id < starts[chapter] ? id : -1;
  }

  chaptersIn(book: number): number {
    return this.chapterStart[book].length - 1;
  }

  versesIn(book: number, chapter: number): number {
    const s = this.chapterStart[book];
    return s[chapter] - s[chapter - 1];
  }

  text(id: number, wording: Wording): string {
    return this.texts[wording][id];
  }

  has(id: number, wording: Wording): boolean {
    return this.texts[wording][id] !== '';
  }

  /** A wording to show when the preferred one lacks the verse (rule 19.2: it then plays on the other). */
  displayWording(id: number, preferred: Wording): Wording {
    return this.has(id, preferred) ? preferred : preferred === 'kjv' ? 'web' : 'kjv';
  }

  /** The verse as printed, cut into words and the text between them. */
  tokens(id: number, wording: Wording): Token[] {
    const text = this.texts[wording][id];
    const out: Token[] = [];
    let last = 0;
    for (const m of text.matchAll(WORD_RE)) {
      if (m.index > last) out.push({ s: text.slice(last, m.index) });
      out.push({ s: m[0], w: this.vocabIndex.get(normalizeWord(m[0])) });
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ s: text.slice(last) });
    return out;
  }

  /** How many words a verse has in a wording. */
  wordCount(id: number, wording: Wording): number {
    return this.words[wording][id].length;
  }
}

let shared: Bible | undefined;
export function loadBible(): Bible {
  if (!shared) {
    const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');
    shared = new Bible(dataDir);
  }
  return shared;
}

export function bookName(book: number): string {
  return BOOKS[book].name;
}
