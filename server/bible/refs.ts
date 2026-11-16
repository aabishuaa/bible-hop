// Appendix E — reading the reference a player types.
import { BOOKS, displayBook } from '../../shared/books.ts';
import type { Bible } from './bible.ts';

export interface ParsedRef {
  book: number;
  /** Undefined when no chapter was given, or the chapter does not exist. */
  chapter?: number;
  /** Undefined when no verse was given, or the verse does not exist (John 3:99 reads as John 3). */
  verse?: number;
  /** The verse id when the reference names a real verse. */
  id?: number;
}

const ORDINALS: Record<string, number> = {
  '1': 1, i: 1, '1st': 1, first: 1,
  '2': 2, ii: 2, '2nd': 2, second: 2,
  '3': 3, iii: 3, '3rd': 3, third: 3,
};

/** Leading words (Appendix E): "the Book of", "the Gospel according to", "the Letter to", "the Epistle to". */
const LEADING = /^(?:the\s+)?(?:(first|second|third|1st|2nd|3rd|i{1,3}|[123])\s+)?(?:general\s+)?(?:book|gospel|epistle|letter|prophecy)\s+(?:of|to|according\s+to)\s+(?:the\s+)?(?:prophet\s+|apostle\s+)?(?:st\.?\s+|saint\s+)?(.+)$/;

/** Full titles and common misspellings that the short-form table does not list. */
const EXTRA_NAMES: Record<string, string> = {
  'lamentations of jeremiah': 'Lamentations',
  'proverbs of solomon': 'Proverbs',
  'psalms of david': 'Psalms',
  'revelation to john': 'Revelation',
  'revelation of st john': 'Revelation',
  'revelation of saint john': 'Revelation',
  'revelation of jesus christ': 'Revelation',
  'acts of apostles': 'Acts',
  phillipians: 'Philippians',
  collosians: 'Colossians',
  habbakuk: 'Habakkuk',
};

const VERSION_TAG = /[\s,(\[]*\b(kjv|nkjv|niv|esv|nlt|nasb|csb|web|asv|amp|msg|rsv|nrsv|net|hcsb|ylt|kjv2000|akjv)\b[\s)\]]*$/i;

/** One wrong, missing, extra or swapped letter. */
function within1(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i++;
  if (la === lb) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true; // one wrong letter
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2); // swapped
  }
  const [shorter, longer] = la < lb ? [a, b] : [b, a];
  return shorter.slice(i) === longer.slice(i + 1); // one missing or extra
}

export class RefParser {
  private readonly exact = new Map<string, number>();
  private readonly fullKeys: { key: string; book: number }[] = [];
  private readonly singleChapter = new Set<number>();

  constructor(private readonly bible: Bible) {
    BOOKS.forEach((b, i) => {
      const full = this.key(b.name);
      this.fullKeys.push({ key: full, book: i });
      this.exact.set(full, i);
      for (const a of b.aliases) this.exact.set(this.key(a), i);
      if (bible.chaptersIn(i) === 1) this.singleChapter.add(i);
    });
    for (const [name, book] of Object.entries(EXTRA_NAMES)) this.exact.set(this.key(name), BOOKS.findIndex((b) => b.name === book));
  }

  /** "1 Sam" -> "1sam", "First Samuel" -> "1samuel", "II Kings" -> "2kings". */
  private key(name: string): string {
    const parts = name.toLowerCase().replace(/[.']/g, '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '';
    let prefix = '';
    if (parts.length > 1 && ORDINALS[parts[0]] !== undefined) {
      prefix = String(ORDINALS[parts.shift()!]);
    } else {
      const m = /^([123])([a-z].*)$/.exec(parts[0]); // "1sam"
      if (m) {
        prefix = m[1];
        parts[0] = m[2];
      }
    }
    return prefix + parts.join('');
  }

  /** The book a name means, or -1. */
  book(nameRaw: string): number {
    let name = nameRaw.toLowerCase().replace(/\u2019/g, "'").replace(/\s+/g, ' ').trim();
    name = name.replace(/^(st\.?|saint)\s+/, '').replace(/^the\s+/, '');
    const key = this.key(name);
    if (!key) return -1;
    const exact = this.exact.get(key);
    if (exact !== undefined) return exact;
    const lead = LEADING.exec(name);
    if (lead) {
      const hit = this.book(lead[1] ? `${ORDINALS[lead[1]]} ${lead[2]}` : lead[2]);
      if (hit >= 0) return hit;
    }
    const numbered = /^\d/.test(key);
    const letters = numbered ? key.slice(1) : key;
    // any unambiguous beginning of 3 letters or more
    if (letters.length >= 3) {
      const hits = this.fullKeys.filter((f) => f.key.startsWith(key));
      if (hits.length === 1) return hits[0].book;
    }
    // one wrong, missing, extra or swapped letter in a book name of 4 letters or more
    if (letters.length >= 4) {
      const hits = new Set<number>();
      for (const [k, book] of this.exact) {
        if (/^\d/.test(k) !== numbered || (numbered && k[0] !== key[0])) continue;
        const kl = numbered ? k.slice(1) : k;
        if (kl.length >= 4 && within1(letters, kl)) hits.add(book);
      }
      if (hits.size === 1) return [...hits][0];
    }
    return -1;
  }

  /**
   * Reads a reference. Returns null when no book can be read, or when anything is left over
   * that is not part of a reference.
   */
  parse(input: string): ParsedRef | null {
    let s = input.normalize('NFKC').replace(/[‒-―]/g, '-').replace(/’/g, "'").trim();
    if (!s || s.length > 80) return null;
    s = s.replace(VERSION_TAG, '').replace(/[.,;:\s]+$/, '').trim();
    // the name: everything up to the first number that is not an ordinal at the start
    const m = /^((?:\d\s*|i{1,3}\s+|1st\s+|2nd\s+|3rd\s+)?[a-z][a-z.' ]*?)[\s.,:]*((?:\b(?:chapter|chap|ch)\b\.?\s*)?\d.*)?$/i.exec(s);
    if (!m) return null;
    const book = this.book(m[1]);
    if (book < 0) return null;
    const out: ParsedRef = { book };
    let rest = (m[2] ?? '').toLowerCase().trim();
    if (!rest) return out;
    rest = rest
      .replace(/(\d)\s*(?:verses|verse|vv|vs|v)\.?\s*(\d)/g, '$1:$2') // "3v16"
      .replace(/\b(chapter|chap|ch)\b\.?/g, ' ')
      .replace(/\b(verses|verse|vv|vs|v)\b\.?/g, ':')
      .replace(/[\s,.:]*:[\s,.:]*/g, ':')
      .trim();
    // "3:16", "3.16", "3,16", "3 16", "3:16-18", "3", "3-4", "3:16a", "3:16ff"
    const n = /^(\d{1,3})(?:\s*[:.,\s]\s*(\d{1,3})[a-c]?)?(?:\s*(?:-|to|and|&|,|ff?\b)\s*[\d:.,\s-]*[a-c]?)?$/.exec(rest);
    if (!n) return null;
    let chapter = Number(n[1]);
    let verse = n[2] !== undefined ? Number(n[2]) : undefined;
    if (this.singleChapter.has(book) && verse === undefined) {
      // one number after a single-chapter book is the verse (Jude 3 is Jude 1:3)
      verse = chapter;
      chapter = 1;
    }
    [chapter, verse] = this.remap(book, chapter, verse);
    if (chapter < 1 || chapter > this.bible.chaptersIn(book)) return out; // book only
    out.chapter = chapter;
    if (verse !== undefined) {
      const id = this.bible.id(book, chapter, verse);
      if (id >= 0) {
        out.verse = verse;
        out.id = id;
      }
    }
    return out;
  }

  /** Other numberings, where a mapping exists (rule 19.2). */
  private remap(book: number, chapter: number, verse: number | undefined): [number, number | undefined] {
    if (verse === undefined) return [chapter, verse];
    const name = BOOKS[book].name;
    if (name === '3 John' && chapter === 1 && verse === 15) return [1, 14];
    if (name === 'Romans' && chapter === 14 && verse >= 24 && verse <= 26) return [16, verse + 1];
    if (name === 'Revelation' && chapter === 12 && verse === 18) return [13, 1];
    return [chapter, verse];
  }

  /**
   * A reference typed in the verse box, before or after the words of the verse
   * ("For God so loved the world John 3:16"). Returns the words alone and the reference found.
   */
  splitFromText(text: string): { text: string; ref: ParsedRef | null; refText: string } {
    const t = text.trim();
    // trailing: "... (John 3:16)" or "... - John 3:16"
    const tail = /^(.*?)[\s\-—(\[,.;:"'”]*((?:\d\s*|i{1,3}\s+)?[A-Za-z][A-Za-z.]*(?:\s+of\s+[A-Za-z]+)?\s*\d{1,3}(?:\s*[:.]\s*\d{1,3})(?:\s*-\s*\d{1,3})?)[\s)\]."'”]*$/s.exec(t);
    if (tail && tail[1].trim()) {
      const ref = this.parse(tail[2]);
      if (ref && ref.chapter !== undefined) return { text: tail[1].trim(), ref, refText: tail[2].trim() };
    }
    const head = /^[\s(\[]*((?:\d\s*|i{1,3}\s+)?[A-Za-z][A-Za-z.]*(?:\s+of\s+[A-Za-z]+)?\s*\d{1,3}(?:\s*[:.]\s*\d{1,3})(?:\s*-\s*\d{1,3})?)[\s)\]\-—:,."'“]+(.*)$/s.exec(t);
    if (head && head[2].trim()) {
      const ref = this.parse(head[1]);
      if (ref && ref.chapter !== undefined) return { text: head[2].trim(), ref, refText: head[1].trim() };
    }
    return { text: t, ref: null, refText: '' };
  }

  /** Whether the text is nothing but a reference (rule 5.5f). */
  isOnlyReference(text: string): boolean {
    const ref = this.parse(text);
    return !!ref && (ref.chapter !== undefined || /\d/.test(text));
  }

  format(ref: ParsedRef): string {
    const b = displayBook(ref.book);
    if (ref.chapter === undefined) return b;
    return ref.verse === undefined ? `${b} ${ref.chapter}` : `${b} ${ref.chapter}:${ref.verse}`;
  }
}

export type RefScore = 'exact' | 'chapter' | 'book' | 'none';

/** Rule 6.2: how the reference box compares with the verse the game identified. */
export function scoreReference(bible: Bible, ref: ParsedRef | null, verseId: number): RefScore {
  if (!ref) return 'none';
  const v = bible.ref(verseId);
  if (ref.book !== v.book) return 'none';
  if (ref.chapter !== v.chapter) return 'book';
  return ref.verse === v.verse ? 'exact' : 'chapter';
}
