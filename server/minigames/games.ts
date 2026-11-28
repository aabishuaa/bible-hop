// The daily mini games on the server. Each round is drawn from the date alone, so every player
// gets the same puzzle; the server keeps the clock, so a timed answer cannot be sent after time.
import { BOOKS } from '../../shared/books.ts';
import type {
  ActionState, BabbleReveal, BabbleState, BookItState, GameId, GameResult, GameState, GamesHub, PlaySummary, VerseRefView, WhoState,
} from '../../shared/minigames.ts';
import { GAMES } from '../../shared/minigames.ts';
import type { Game, PlayerRow } from '../app/game.ts';
import { GameError } from '../app/errors.ts';
import { FIRST_FOURTEEN, MORE_VERSES } from '../app/seed.ts';
import { addDays, dayDiff, deadlineFor, isValidTimeZone, localDate } from '../game/clock.ts';
import { BABBLE, BIBLE_SAYINGS } from './babble.ts';
import { BIBLE_NAMES, CHARACTERS } from './characters.ts';

/** The grace allowed beyond a time limit, for the trip over the network. */
const GRACE_MS = 2500;
const BOOKIT_MS = 20_000;
const CLUE_MS = 20_000;
const BABBLE_COUNT = 5;
const ACTION_MS: Record<'fixyoureyes' | 'loaves', number> = { fixyoureyes: 45_000, loaves: 57_000 };

/** A small seeded random number generator (mulberry32) from a string. */
export function seeded(text: string): () => number {
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

function shuffle<T>(xs: T[], rnd: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const k = Math.floor(rnd() * (i + 1));
    [a[i], a[k]] = [a[k], a[i]];
  }
  return a;
}

const dayNumber = (date: string) => dayDiff('2026-01-01', date);
const norm = (s: string) => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** How long a Bible-or-Babble saying stays up: 15 seconds, more for longer ones, never over 30. */
export function babbleLimit(text: string): number {
  return Math.round(Math.min(30, Math.max(15, 15 + (text.length - 60) / 8))) * 1000;
}

// ------------------------------------------------------------------------------- the puzzles

interface StoredBookIt { verse: number; startedAt: number; guesses: number[]; done: boolean; won: boolean; endedAt?: number }
interface StoredWho { character: number; clue: number; clueShownAt: number; startedAt: number; guesses: { text: string; verdict: 'right' | 'wrong' | 'which' | 'timeout' }[]; done: boolean; won: boolean }
interface StoredBabbleItem { kind: 'babble' | 'bible' | 'proverb'; index: number }
interface StoredBabble { items: StoredBabbleItem[]; index: number; shownAt: number; startedAt: number; answers: { choice: 'bible' | 'babble' | null; right: boolean; ms: number }[]; done: boolean; revealing?: boolean }
interface StoredAction { seed: number; startedAt: number; done: boolean; result?: Record<string, number | boolean> }
type Stored = StoredBookIt | StoredWho | StoredBabble | StoredAction;

interface PlayRow { player_id: string; game: GameId; date: string; started_at: number; finished_at: number | null; state: string; score: number | null; won: number | null }

export class MiniGames {
  private readonly famous: number[];

  constructor(private readonly game: Game) {
    this.famous = [...FIRST_FOURTEEN, ...MORE_VERSES]
      .map((r) => game.refs.parse(r)?.id)
      .filter((v): v is number => v !== undefined);
  }

  private get db() {
    return this.game.db;
  }

  private get bible() {
    return this.game.bible;
  }

  private now(): number {
    return this.game.now();
  }

  // ----------------------------------------------------------------------------- drawing a round

  /** A verse worth guessing: half the days a well-loved one, half a fair one from anywhere. Never one that names its own book. */
  bookItVerse(date: string): number {
    const rnd = seeded(`bookit|${date}`);
    const b = this.bible;
    const ownName = (id: number) => {
      const name = BOOKS[b.ref(id).book].name.replace(/^\d\s/, '').split(' ').pop()!.toLowerCase().replace(/s$/, '');
      return new RegExp(`\\b${name}`, 'i').test(b.text(id, 'kjv'));
    };
    const fair = (id: number) => {
      const t = b.text(id, 'kjv');
      if (t.length < 60 || t.length > 230 || ownName(id)) return false;
      if (/^And the LORD spake unto Moses/.test(t)) return false;
      const names = (t.match(/(?<![.;:?!] |^)\b[A-Z][a-z]{2,}/g) ?? []).filter((w) => !['God', 'Lord', 'LORD', 'Jesus', 'Christ', 'Israel', 'Spirit', 'Holy', 'Father', 'Son'].includes(w));
      return names.length <= 2;
    };
    if (rnd() < 0.5) {
      const pool = this.famous.filter((id) => !ownName(id));
      return pool[Math.floor(rnd() * pool.length)];
    }
    for (let tries = 0; tries < 400; tries++) {
      const book = Math.floor(rnd() * 66);
      const id = b.bookStart[book] + Math.floor(rnd() * (b.bookStart[book + 1] - b.bookStart[book]));
      if (fair(id)) return id;
    }
    return this.famous[Math.floor(rnd() * this.famous.length)];
  }

  whoCharacter(date: string): number {
    const order = shuffle(CHARACTERS.map((_, i) => i), seeded('whoartthou-order'));
    return order[((dayNumber(date) % order.length) + order.length) % order.length];
  }

  babbleItems(date: string): StoredBabbleItem[] {
    const rnd = seeded(`babble|${date}`);
    const day = Math.max(0, dayNumber(date));
    const babbleOrder = shuffle(BABBLE.map((_, i) => i), seeded('babble-order'));
    const bibleOrder = shuffle(BIBLE_SAYINGS.map((_, i) => i), seeded('bible-order'));
    const nBabble = rnd() < 0.5 ? 2 : 3;
    const items: StoredBabbleItem[] = [];
    for (let k = 0; k < nBabble; k++) items.push({ kind: 'babble', index: babbleOrder[(day * 3 + k) % babbleOrder.length] });
    const nBible = BABBLE_COUNT - nBabble;
    for (let k = 0; k < nBible; k++) {
      if (k % 2 === 0) items.push({ kind: 'bible', index: bibleOrder[(day * 2 + k) % bibleOrder.length] });
      else {
        // a proverb from the long run of single sayings in Proverbs 10 to 29
        for (let tries = 0; tries < 50; tries++) {
          const ch = 10 + Math.floor(rnd() * 20);
          const id = this.bible.id(19, ch, 1 + Math.floor(rnd() * this.bible.versesIn(19, ch)));
          if (this.bible.text(id, 'kjv').length <= 150) {
            items.push({ kind: 'proverb', index: id });
            break;
          }
        }
      }
    }
    while (items.length < BABBLE_COUNT) items.push({ kind: 'bible', index: bibleOrder[(day + items.length) % bibleOrder.length] });
    return shuffle(items, rnd);
  }

  private babbleText(item: StoredBabbleItem): string {
    if (item.kind === 'babble') return BABBLE[item.index].text;
    if (item.kind === 'bible') return BIBLE_SAYINGS[item.index].text;
    return this.bible.text(item.index, 'kjv');
  }

  private babbleReveal(item: StoredBabbleItem): BabbleReveal {
    if (item.kind === 'babble') {
      const b = BABBLE[item.index];
      const id = b.ref ? this.game.refs.parse(b.ref)?.id : undefined;
      return { answer: 'babble', why: b.why, ref: b.ref, verse: id !== undefined ? this.bible.text(id, 'kjv') : undefined };
    }
    const ref = item.kind === 'bible' ? BIBLE_SAYINGS[item.index].ref : this.bible.label(item.index);
    const id = item.kind === 'bible' ? this.game.refs.parse(ref)?.id : item.index;
    return { answer: 'bible', ref, verse: id !== undefined ? this.bible.text(id, 'kjv') : undefined, why: `It is in the Bible: ${ref}.` };
  }

  // ----------------------------------------------------------------------------------- storage

  private dateFor(tz: unknown): string {
    if (!isValidTimeZone(tz)) throw new GameError('bad_tz', 'That time zone is not one I know.');
    return localDate(this.now(), tz);
  }

  private row(p: PlayerRow, id: GameId, date: string): PlayRow | undefined {
    return this.db.get<PlayRow>('SELECT * FROM minigame_plays WHERE player_id = ? AND game = ? AND date = ?', p.id, id, date);
  }

  private save(p: PlayerRow, id: GameId, date: string, s: Stored, end?: { score: number; won: boolean }): void {
    this.db.run(
      `INSERT INTO minigame_plays (player_id, game, date, started_at, finished_at, state, score, won) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(player_id, game, date) DO UPDATE SET finished_at = excluded.finished_at, state = excluded.state, score = excluded.score, won = excluded.won`,
      p.id, id, date, s.startedAt, end ? this.now() : null, JSON.stringify(s), end ? end.score : null, end ? (end.won ? 1 : 0) : null,
    );
  }

  /** Days in a row the player has finished this game, up to the given date. */
  private streak(p: PlayerRow, id: GameId, date: string): number {
    const dates = new Set(this.db.all<{ date: string }>('SELECT date FROM minigame_plays WHERE player_id = ? AND game = ? AND finished_at IS NOT NULL ORDER BY date DESC LIMIT 400', p.id, id).map((r) => r.date));
    let d = dates.has(date) ? date : addDays(date, -1);
    let n = 0;
    while (dates.has(d)) {
      n++;
      d = addDays(d, -1);
    }
    return n;
  }

  private others(id: GameId, date: string): { players: number; wonPct: number } {
    const r = this.db.get<{ n: number; w: number }>('SELECT COUNT(*) AS n, COALESCE(SUM(won), 0) AS w FROM minigame_plays WHERE game = ? AND date = ? AND finished_at IS NOT NULL', id, date)!;
    return { players: r.n, wonPct: r.n ? Math.round((100 * r.w) / r.n) : 0 };
  }

  private allowed(p: PlayerRow, date: string): void {
    const r = this.game.worldFor(date).rules;
    if (!r['feature.minigames']) throw new GameError('off', 'The mini games are switched off.', 404);
    if (r['feature.minigamesPlusOnly'] && !p.plus) throw new GameError('plus_only', 'The mini games come with Bible Hopping Plus.', 403);
  }

  private verseRef(id: number): VerseRefView {
    return { id, ref: this.bible.label(id), text: this.bible.text(id, 'kjv') };
  }

  // ----------------------------------------------------------------------------------- the hub

  hub(p: PlayerRow, tz: unknown): GamesHub {
    const date = this.dateFor(tz);
    const r = this.game.worldFor(date).rules;
    const plays: PlaySummary[] = GAMES.map((g) => {
      const row = this.row(p, g.id, date);
      const done = !!row?.finished_at;
      return { game: g.id, played: !!row, done, won: !!row?.won, line: row && done ? this.summaryLine(g.id, JSON.parse(row.state) as Stored, !!row.won) : row ? 'Under way' : g.timing, streak: this.streak(p, g.id, date) };
    });
    return { date, puzzleNo: this.game.puzzleNo(date), plays, nextIn: Math.max(0, deadlineFor(date, tz as string) - this.now()), plusOnly: r['feature.minigamesPlusOnly'], plus: !!p.plus, enabled: r['feature.minigames'] };
  }

  private summaryLine(id: GameId, s: Stored, won: boolean): string {
    switch (id) {
      case 'bookit': {
        const b = s as StoredBookIt;
        return won ? `Got it in ${b.guesses.length} ${b.guesses.length === 1 ? 'guess' : 'guesses'}` : 'Time ran out';
      }
      case 'whoartthou': {
        const w = s as StoredWho;
        return won ? `Named on clue ${w.clue + 1} of 5` : 'The clues ran out';
      }
      case 'babble': {
        const b = s as StoredBabble;
        return `${b.answers.filter((a) => a.right).length} of ${b.items.length} right`;
      }
      case 'fixyoureyes': {
        const r = (s as StoredAction).result ?? {};
        return r.reached ? `Reached Jesus in ${((r.ms as number) / 1000).toFixed(1)}s` : `Sank ${Math.round((r.distance as number) * 100)}% of the way`;
      }
      case 'loaves': {
        const r = (s as StoredAction).result ?? {};
        return `${(r.fed as number).toLocaleString('en-US')} fed · ${r.baskets} baskets`;
      }
    }
  }

  // ------------------------------------------------------------------------------- start a round

  start(p: PlayerRow, idRaw: unknown, tz: unknown): GameState {
    const id = this.gameId(idRaw);
    const date = this.dateFor(tz);
    this.allowed(p, date);
    const row = this.row(p, id, date);
    if (row) return this.view(p, id, date, JSON.parse(row.state) as Stored, row);
    const at = this.now();
    let s: Stored;
    if (id === 'bookit') s = { verse: this.bookItVerse(date), startedAt: at, guesses: [], done: false, won: false };
    else if (id === 'whoartthou') s = { character: this.whoCharacter(date), clue: 0, clueShownAt: at, startedAt: at, guesses: [], done: false, won: false };
    else if (id === 'babble') s = { items: this.babbleItems(date), index: 0, shownAt: at, startedAt: at, answers: [], done: false };
    else s = { seed: Math.floor(seeded(`${id}|${date}`)() * 2 ** 31), startedAt: at, done: false };
    this.save(p, id, date, s);
    return this.view(p, id, date, s, this.row(p, id, date)!);
  }

  private gameId(raw: unknown): GameId {
    if (!GAMES.some((g) => g.id === raw)) throw new GameError('bad_game', 'There is no such game.', 404);
    return raw as GameId;
  }

  // ------------------------------------------------------------------------------- the answers

  answer(p: PlayerRow, idRaw: unknown, tz: unknown, body: Record<string, unknown>): GameState {
    const id = this.gameId(idRaw);
    const date = this.dateFor(tz);
    const row = this.row(p, id, date);
    if (!row) throw new GameError('not_started', 'Start the round first.');
    const s = JSON.parse(row.state) as Stored;
    if (row.finished_at) return this.view(p, id, date, s, row);
    const at = this.now();
    if (id === 'bookit') return this.answerBookIt(p, date, s as StoredBookIt, body, at);
    if (id === 'whoartthou') return this.answerWho(p, date, s as StoredWho, body, at);
    if (id === 'babble') return this.answerBabble(p, date, s as StoredBabble, body, at);
    throw new GameError('bad_action', 'This game ends with a finish, not an answer.');
  }

  private answerBookIt(p: PlayerRow, date: string, s: StoredBookIt, body: Record<string, unknown>, at: number): GameState {
    const late = at - s.startedAt > BOOKIT_MS + GRACE_MS;
    const book = Number(body.book);
    if (!late && Number.isInteger(book) && book >= 0 && book < 66 && !s.guesses.includes(book)) {
      s.guesses.push(book);
      if (book === this.bible.ref(s.verse).book) {
        s.done = true;
        s.won = true;
      }
    }
    if (late || body.timeout === true) s.done = true;
    if (s.done) s.endedAt = Math.min(at, s.startedAt + BOOKIT_MS);
    return this.finishQuiz(p, 'bookit', date, s, s.done ? { won: s.won, score: s.won ? Math.max(100, 1000 - Math.round((at - s.startedAt) / 25) - (s.guesses.length - 1) * 60) : 0 } : undefined);
  }

  /** Whether a guess names the character: their name or another name, allowing one slip in a long name. */
  judgeName(guess: string, c: (typeof CHARACTERS)[number]): 'right' | 'which' | 'wrong' {
    const g = norm(guess).replace(/^(the|saint|st) /, '');
    if (!g) return 'wrong';
    const names = [c.name, ...c.aliases].map(norm);
    const close = (a: string, b: string) => {
      if (a === b) return true;
      if (Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > 1) return false;
      // one letter added, dropped or changed
      let i = 0, k = 0, edits = 0;
      while (i < a.length && k < b.length) {
        if (a[i] === b[k]) { i++; k++; continue; }
        if (++edits > 1) return false;
        if (a.length > b.length) i++;
        else if (b.length > a.length) k++;
        else { i++; k++; }
      }
      return edits + (a.length - i) + (b.length - k) <= 1;
    };
    if (names.some((n) => close(g, n))) return 'right';
    // "Mary" for Mary Magdalene, "John" for John the Baptist: right name, but which one?
    if (names.some((n) => n.split(' ').length > 1 && n.split(' ')[0] === g)) return 'which';
    return 'wrong';
  }

  private answerWho(p: PlayerRow, date: string, s: StoredWho, body: Record<string, unknown>, at: number): GameState {
    const c = CHARACTERS[s.character];
    const last = c.clues.length - 1;
    const overdue = at - s.clueShownAt > CLUE_MS + GRACE_MS;
    const next = () => {
      if (s.clue >= last) {
        s.done = true;
        return;
      }
      s.clue++;
      s.clueShownAt = at;
    };
    if (body.timeout === true || overdue) {
      s.guesses.push({ text: '', verdict: 'timeout' });
      next();
    } else {
      const text = String(body.guess ?? '').slice(0, 60).trim();
      if (text) {
        const verdict = this.judgeName(text, c);
        s.guesses.push({ text, verdict });
        if (verdict === 'right') {
          s.done = true;
          s.won = true;
        } else if (verdict === 'wrong') next();
      }
    }
    return this.finishQuiz(p, 'whoartthou', date, s, s.done ? { won: s.won, score: s.won ? (c.clues.length - s.clue) * 200 : 0 } : undefined);
  }

  private answerBabble(p: PlayerRow, date: string, s: StoredBabble, body: Record<string, unknown>, at: number): GameState {
    // after a reveal, the next saying (and its clock) starts only when the player asks for it
    if (body.action === 'next') {
      if (s.revealing) {
        s.revealing = false;
        s.shownAt = at;
        this.save(p, 'babble', date, s);
      }
      return this.view(p, 'babble', date, s, this.row(p, 'babble', date)!);
    }
    const index = Number(body.index);
    if (index !== s.index || s.revealing) return this.view(p, 'babble', date, s, this.row(p, 'babble', date)!);
    const item = s.items[s.index];
    const limit = babbleLimit(this.babbleText(item));
    const ms = at - s.shownAt;
    const choice = ms > limit + GRACE_MS || body.choice === null || (body.choice !== 'bible' && body.choice !== 'babble') ? null : body.choice;
    const truth = item.kind === 'babble' ? 'babble' : 'bible';
    s.answers.push({ choice, right: choice === truth, ms: Math.min(ms, limit) });
    s.index++;
    s.shownAt = at;
    if (s.index >= s.items.length) s.done = true;
    else s.revealing = true;
    const right = s.answers.filter((a) => a.right).length;
    const speed = s.answers.filter((a) => a.right).reduce((n, a) => n + Math.max(0, 30 - Math.round(a.ms / 1000)), 0);
    return this.finishQuiz(p, 'babble', date, s, s.done ? { won: right >= 4, score: right * 100 + speed } : undefined);
  }

  /** The action games are played on the device; the server checks the result is possible and keeps it. */
  finish(p: PlayerRow, idRaw: unknown, tz: unknown, body: Record<string, unknown>): GameState {
    const id = this.gameId(idRaw);
    if (id !== 'fixyoureyes' && id !== 'loaves') throw new GameError('bad_action', 'This game is answered, not finished.');
    const date = this.dateFor(tz);
    const row = this.row(p, id, date);
    if (!row) throw new GameError('not_started', 'Start the round first.');
    const s = JSON.parse(row.state) as StoredAction;
    if (row.finished_at) return this.view(p, id, date, s, row);
    const took = this.now() - s.startedAt;
    const num = (v: unknown, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number.isFinite(Number(v)) ? Number(v) : lo));
    let score: number, won: boolean;
    if (id === 'fixyoureyes') {
      const ms = num(body.ms, 0, ACTION_MS.fixyoureyes);
      const reached = body.reached === true && ms >= 6000 && took >= ms - GRACE_MS;
      const steady = num(body.steady, 0, 100);
      const distance = reached ? 1 : num(body.distance, 0, 0.999);
      s.result = { reached, ms: Math.round(ms), steady: Math.round(steady), distance: Math.round(distance * 1000) / 1000 };
      won = reached;
      score = reached ? Math.round(1000 + (ACTION_MS.fixyoureyes - ms) / 50 + steady * 2) : Math.round(distance * 800 + steady);
    } else {
      // feeding takes taps: no one can feed faster than about eight groups a second
      const fed = Math.round(num(body.fed, 0, Math.min(9000, Math.max(0, took / 1000) * 8 * 150)));
      const baskets = Math.round(num(body.baskets, 0, 12));
      s.result = { fed, baskets, best: Math.round(num(body.best, 0, 99)) };
      won = fed >= 5000;
      score = fed + baskets * 100;
    }
    s.done = true;
    this.save(p, id, date, s, { score, won });
    return this.view(p, id, date, s, this.row(p, id, date)!);
  }

  private finishQuiz(p: PlayerRow, id: GameId, date: string, s: Stored, end?: { won: boolean; score: number }): GameState {
    this.save(p, id, date, s, end);
    return this.view(p, id, date, s, this.row(p, id, date)!);
  }

  // ------------------------------------------------------------------------------- what is shown

  private view(p: PlayerRow, id: GameId, date: string, s: Stored, row: PlayRow): GameState {
    const at = this.now();
    const done = !!row.finished_at;
    const result = done ? this.result(p, id, date, s, row) : undefined;
    if (id === 'bookit') {
      const b = s as StoredBookIt;
      const answer = this.bible.ref(b.verse).book;
      const division = (book: number) => BOOKS[book].division;
      const view: BookItState = {
        game: 'bookit',
        verseText: this.bible.text(b.verse, 'kjv'),
        limitMs: BOOKIT_MS,
        startedAt: b.startedAt,
        now: at,
        guesses: b.guesses.map((g) => ({ book: g, dir: g === answer ? 'right' : g < answer ? 'later' : 'earlier', sameDivision: division(g) === division(answer) })),
        done,
        result,
      };
      if (done) view.answer = { book: answer, verse: this.verseRef(b.verse) };
      return view;
    }
    if (id === 'whoartthou') {
      const w = s as StoredWho;
      const c = CHARACTERS[w.character];
      const shown = done ? c.clues.length : w.clue + 1;
      const view: WhoState = {
        game: 'whoartthou',
        clues: c.clues.slice(0, shown).map(([text, cite]) => ({ text, cite })),
        total: c.clues.length,
        clueMs: CLUE_MS,
        clueShownAt: w.clueShownAt,
        now: at,
        guesses: w.guesses,
        names: BIBLE_NAMES,
        done,
        result,
      };
      if (done) view.answer = { name: c.name, summary: c.summary, cite: c.cite };
      return view;
    }
    if (id === 'babble') {
      const b = s as StoredBabble;
      const item = b.items[b.index];
      return {
        game: 'babble',
        count: b.items.length,
        index: b.index,
        current: !done && !b.revealing && item ? { text: this.babbleText(item), limitMs: babbleLimit(this.babbleText(item)) } : undefined,
        revealing: !!b.revealing,
        shownAt: b.shownAt,
        now: at,
        answers: b.answers.map((a, i) => ({ choice: a.choice, right: a.right, text: this.babbleText(b.items[i]), reveal: this.babbleReveal(b.items[i]) })),
        done,
        result,
      } satisfies BabbleState;
    }
    const act = s as StoredAction;
    return { game: id as ActionState['game'], seed: act.seed, limitMs: ACTION_MS[id as 'fixyoureyes' | 'loaves'], startedAt: act.startedAt, now: at, done, result } satisfies ActionState;
  }

  private result(p: PlayerRow, id: GameId, date: string, s: Stored, row: PlayRow): GameResult {
    const no = this.game.puzzleNo(date);
    const won = !!row.won;
    const head = `Bible Hopping · ${GAMES.find((g) => g.id === id)!.name} #${no}`;
    const streak = this.streak(p, id, date);
    if (id === 'bookit') {
      const b = s as StoredBookIt;
      const answer = this.bible.ref(b.verse).book;
      const secs = ((b.endedAt ?? row.finished_at ?? b.startedAt) - b.startedAt) / 1000;
      const arrows = b.guesses.map((g) => (g === answer ? '✅' : g < answer ? '⬇️' : '⬆️')).join('');
      return {
        won, score: row.score ?? 0, streak,
        title: won ? 'Booked it!' : 'Time’s up',
        line: won ? `${BOOKS[answer].name}, in ${b.guesses.length} ${b.guesses.length === 1 ? 'guess' : 'guesses'} and ${Math.min(20, secs).toFixed(1)} seconds.` : `It was ${BOOKS[answer].name}.`,
        share: `${head}\n📖 ${won ? `${b.guesses.length} ${b.guesses.length === 1 ? 'guess' : 'guesses'} · ${Math.min(20, secs).toFixed(1)}s` : 'not this time'}\n${arrows}`,
        others: this.others(id, date),
        verse: this.verseRef(b.verse),
      };
    }
    if (id === 'whoartthou') {
      const w = s as StoredWho;
      const c = CHARACTERS[w.character];
      const squares = c.clues.map((_, i) => (i < w.clue ? '🟥' : i === w.clue ? (won ? '🟩' : '🟥') : '⬜')).join('');
      const citeId = this.game.refs.parse(c.cite)?.id;
      return {
        won, score: row.score ?? 0, streak,
        title: won ? `It was ${c.name}!` : `It was ${c.name}`,
        line: won ? `Named on clue ${w.clue + 1} of ${c.clues.length}. ${c.summary}` : c.summary,
        share: `${head}\n${squares}${won ? ` clue ${w.clue + 1}` : ''}`,
        others: this.others(id, date),
        verse: citeId !== undefined ? this.verseRef(citeId) : undefined,
      };
    }
    if (id === 'babble') {
      const b = s as StoredBabble;
      const right = b.answers.filter((a) => a.right).length;
      return {
        won, score: row.score ?? 0, streak,
        title: right === b.items.length ? 'A perfect round!' : right >= 4 ? 'Well discerned!' : right >= 2 ? 'Not bad' : 'Babbled!',
        line: `${right} of ${b.items.length} right.`,
        share: `${head}\n${b.answers.map((a) => (a.right ? '✅' : '❌')).join('')} ${right}/${b.items.length}`,
        others: this.others(id, date),
      };
    }
    const r = (s as StoredAction).result ?? {};
    if (id === 'fixyoureyes') {
      return {
        won, score: row.score ?? 0, streak,
        title: r.reached ? 'You reached Jesus' : 'Lord, save me!',
        line: r.reached ? `In ${((r.ms as number) / 1000).toFixed(1)} seconds, with your eyes fixed ${r.steady}% of the way.` : `You sank ${Math.round((r.distance as number) * 100)}% of the way across. Immediately Jesus stretched forth his hand, and caught you.`,
        share: `${head}\n🌊 ${r.reached ? `Reached Jesus in ${((r.ms as number) / 1000).toFixed(1)}s · eyes fixed ${r.steady}%` : `Sank ${Math.round((r.distance as number) * 100)}% of the way`}`,
      };
    }
    return {
      won, score: row.score ?? 0, streak,
      title: (r.fed as number) >= 5000 ? 'They did all eat, and were filled' : 'Many were fed',
      line: `${(r.fed as number).toLocaleString('en-US')} fed and ${r.baskets} of 12 baskets gathered.`,
      share: `${head}\n🍞🐟 ${(r.fed as number).toLocaleString('en-US')} fed · ${r.baskets} of 12 baskets`,
    };
  }
}
