// The game as the server runs it: versions, the calendar, players and journeys.
// Every hop, look back and Grace choice is validated and applied here (rule 19.5),
// and saved before the answer goes back to the player (rule 12.11).
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { message } from '../../shared/messages.ts';
import type { RuleSet } from '../../shared/rules.ts';
import { defaultRules } from '../../shared/rules.ts';
import type {
  Achievement, ActionResult, ConcordanceView, DayResult, FinaleView, HistoryView, JourneyKind, JourneyMode, JourneyView,
  PlayerView, RevelationView, TodayView, Wording,
} from '../../shared/types.ts';
import type { Bible } from '../bible/bible.ts';
import { loadBible } from '../bible/bible.ts';
import { RefParser } from '../bible/refs.ts';
import type { Db } from '../db.ts';
import {
  addDays, dateClosesAt, dateOpensAt, dayDiff, deadlineFor, isDate, isValidTimeZone, localDate, now as clockNow, oldestOpenDate, tzLabel, weekday,
} from '../game/clock.ts';
import type { EngineResult } from '../game/engine.ts';
import { attemptHop, checkDeadline, confirmChoice, decideGrace, lookBack, rulesOf, setMode } from '../game/engine.ts';
import { ACHIEVEMENTS, buildFinale, buildShare, earned, verseText } from '../game/finale.ts';
import type { Journey, World } from '../game/journey.ts';
import { newJourney } from '../game/journey.ts';
import { bookSpans, journeyView, verseView } from '../game/view.ts';
import type { LexiconConfig } from '../lexicon/defaults.ts';
import { defaultLexiconConfig } from '../lexicon/defaults.ts';
import { Lexicon } from '../lexicon/lexicon.ts';
import { Recognizer } from '../recognize/recognizer.ts';
import type { AiBackend, AiSettings } from './ai.ts';
import { AiService, DEFAULT_AI } from './ai.ts';
import { FIRST_FOURTEEN, GUIDES, MORE_VERSES, shuffled } from './seed.ts';

export interface PlayerRow {
  id: string;
  created_at: number;
  name: string | null;
  pass_hash: string | null;
  scribe: number;
  rest_day: number;
  wording: Wording;
  treasure: number;
  streak: number;
  best_streak: number;
  last_win: string | null;
  guide_done: number;
}

interface JourneyRow {
  id: string;
  data: string;
}

export interface CalendarRow {
  date: string;
  verse: number;
  theme: string | null;
  note: string | null;
  source: string;
  rev: number;
  updated_at: number;
  updated_by: string | null;
}

export class GameError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export interface GameOptions {
  db: Db;
  bible?: Bible;
  aiBackend?: AiBackend | null;
  /** Rule 19.10. Off in tests that hop faster than a person can. */
  rateLimit?: boolean;
  /** The date of puzzle #1, for a first start. Fixed once the game has launched (rule 17.7). */
  launchDate?: string;
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${scryptSync(password, salt, 32).toString('hex')}`;
}

export function checkPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [, salt, hash] = stored.split('$');
  if (!salt || !hash) return false;
  const got = scryptSync(password, Buffer.from(salt, 'hex'), 32);
  const want = Buffer.from(hash, 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}

export class Game {
  readonly db: Db;
  readonly bible: Bible;
  readonly refs: RefParser;
  readonly ai: AiService;
  private readonly lexicons = new Map<string, { lexicon: Lexicon; recognizer: Recognizer }>();
  private readonly worlds = new Map<string, World>();
  private readonly locks = new Map<string, Promise<unknown>>();
  private readonly limiter = new Map<string, { last: number; day: string; count: number }>();
  private readonly rateLimit: boolean;

  constructor(opts: GameOptions) {
    this.db = opts.db;
    this.bible = opts.bible ?? loadBible();
    this.refs = new RefParser(this.bible);
    this.rateLimit = opts.rateLimit ?? true;
    this.ai = new AiService(this.db, opts.aiBackend ?? null, () => this.aiSettings);
    this.firstStart(opts.launchDate);
  }

  now(): number {
    return clockNow();
  }

  // -------------------------------------------------------------------------------------------
  // first start

  private firstStart(launchDate?: string): void {
    const at = this.now();
    if (!this.db.get('SELECT version FROM rule_sets LIMIT 1')) {
      this.db.run('INSERT INTO rule_sets (version, rules, effective_from, created_at, created_by, note) VALUES (1, ?, ?, ?, ?, ?)', JSON.stringify(defaultRules()), '0001-01-01', at, 'system', 'The defaults of Appendix A');
    }
    if (!this.db.get('SELECT version FROM lexicons LIMIT 1')) {
      this.db.run('INSERT INTO lexicons (version, config, effective_from, created_at, created_by, note) VALUES (1, ?, ?, ?, ?, ?)', JSON.stringify(defaultLexiconConfig()), '0001-01-01', at, 'system', 'Appendix B and Appendix C');
    }
    if (!this.db.meta('launchDate')) {
      // Puzzle #1 is today where the server runs, unless LAUNCH_DATE names another day.
      const serverTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      this.db.setMeta('launchDate', isDate(launchDate) ? launchDate : localDate(at, serverTz));
    }
    if (!this.db.meta('settings')) this.db.setMeta('settings', { defaultWording: 'kjv', display: ['kjv', 'web'] });
    if (!this.db.meta('ai')) this.db.setMeta('ai', DEFAULT_AI);
    if (!this.db.meta('storehouseSeeded')) {
      const w = this.worldFor(this.launchDate);
      let position = 1;
      for (const ref of [...FIRST_FOURTEEN, ...shuffled(MORE_VERSES)]) {
        const id = this.refs.parse(ref)?.id;
        if (id === undefined || w.lexicon.waysHome(id, w.rules).length < w.rules['scribe.waysHomeMin']) continue;
        this.db.run('INSERT OR IGNORE INTO storehouse (verse, position, added_at, added_by) VALUES (?, ?, ?, ?)', id, position++, at, 'system');
      }
      this.db.setMeta('storehouseSeeded', true);
    }
    this.ensureCalendar(at);
    this.refreshAliases();
  }

  // -------------------------------------------------------------------------------------------
  // settings and versions (rule 17.6: a journey keeps the versions it started with)

  get launchDate(): string {
    return this.db.meta<string>('launchDate')!;
  }

  get settings(): { defaultWording: Wording; display: Wording[] } {
    return this.db.meta('settings')!;
  }

  get aiSettings(): AiSettings {
    return { ...DEFAULT_AI, ...(this.db.meta<AiSettings>('ai') ?? {}) };
  }

  puzzleNo(date: string): number {
    return dayDiff(this.launchDate, date) + 1;
  }

  rulesVersionFor(date: string): number {
    return this.db.get<{ version: number }>('SELECT version FROM rule_sets WHERE effective_from <= ? ORDER BY version DESC LIMIT 1', date)!.version;
  }

  lexiconVersionFor(date: string): number {
    return this.db.get<{ version: number }>('SELECT version FROM lexicons WHERE effective_from <= ? ORDER BY version DESC LIMIT 1', date)!.version;
  }

  rules(version: number): RuleSet {
    const row = this.db.get<{ rules: string }>('SELECT rules FROM rule_sets WHERE version = ?', version);
    return { ...defaultRules(), ...(row ? JSON.parse(row.rules) : {}) };
  }

  lexiconConfig(version: number): LexiconConfig {
    const row = this.db.get<{ config: string }>('SELECT config FROM lexicons WHERE version = ?', version);
    return { ...defaultLexiconConfig(), ...(row ? JSON.parse(row.config) : {}) };
  }

  /** Builds (or reuses) the precomputed data of rule 19.4 for one lexicon version. */
  private lexiconFor(lexV: number, irregular: boolean): { lexicon: Lexicon; recognizer: Recognizer } {
    const key = `${lexV}|${irregular ? 1 : 0}`;
    let hit = this.lexicons.get(key);
    if (!hit) {
      const lexicon = new Lexicon(this.bible, { ...this.lexiconConfig(lexV), useIrregulars: irregular }, lexV);
      hit = { lexicon, recognizer: new Recognizer(this.bible, lexicon, this.refs) };
      hit.recognizer.setAliases(this.db.all<{ verse: number; text: string }>('SELECT verse, text FROM aliases'));
      this.lexicons.set(key, hit);
      // keep the newest few; an old version is rebuilt on demand if a journey still needs it
      while (this.lexicons.size > 3) this.lexicons.delete(this.lexicons.keys().next().value!);
    }
    return hit;
  }

  world(lexV: number, rulesV: number): World {
    const key = `${lexV}|${rulesV}`;
    let w = this.worlds.get(key);
    if (!w) {
      const rules = this.rules(rulesV);
      const { lexicon, recognizer } = this.lexiconFor(lexV, rules['feature.irregularForms']);
      w = { bible: this.bible, lexicon, recognizer, refs: this.refs, rules };
      this.worlds.set(key, w);
      while (this.worlds.size > 6) this.worlds.delete(this.worlds.keys().next().value!);
    }
    return w;
  }

  worldFor(date: string): World {
    return this.world(this.lexiconVersionFor(date), this.rulesVersionFor(date));
  }

  worldOf(j: Journey): World {
    return this.world(j.lexiconVersion, j.rulesVersion);
  }

  /** Forget cached worlds after a new version or alias is saved. */
  resetWorlds(): void {
    this.worlds.clear();
    this.lexicons.clear();
  }

  refreshAliases(): void {
    const aliases = this.db.all<{ verse: number; text: string }>('SELECT verse, text FROM aliases');
    for (const { recognizer } of this.lexicons.values()) recognizer.setAliases(aliases);
  }

  // -------------------------------------------------------------------------------------------
  // the calendar (rules 17.1 to 17.4)

  calendarRow(date: string): CalendarRow | undefined {
    return this.db.get<CalendarRow>('SELECT * FROM calendar WHERE date = ?', date);
  }

  /** Rule 17.3: home in the last 365 days, or already scheduled on another date. */
  repeatConflict(verse: number, date: string, w: World): string | undefined {
    const since = addDays(date, -w.rules['scribe.repeatDays']);
    return this.db.get<{ date: string }>('SELECT date FROM calendar WHERE verse = ? AND date != ? AND date >= ? ORDER BY date DESC LIMIT 1', verse, date, since)?.date;
  }

  chapterConflict(verse: number, date: string, w: World): string | undefined {
    const { book, chapter } = this.bible.ref(verse);
    const lo = this.bible.chapterStart[book][chapter - 1], hi = this.bible.chapterStart[book][chapter] - 1;
    const days = w.rules['scribe.chapterDays'];
    return this.db.get<{ date: string }>('SELECT date FROM calendar WHERE verse BETWEEN ? AND ? AND date != ? AND date >= ? AND date <= ? ORDER BY date DESC LIMIT 1', lo, hi, date, addDays(date, -days), addDays(date, days))?.date;
  }

  bookConflict(verse: number, date: string, w: World): string | undefined {
    const { book } = this.bible.ref(verse);
    const days = w.rules['scribe.bookDays'];
    return this.db.get<{ date: string }>('SELECT date FROM calendar WHERE verse BETWEEN ? AND ? AND date != ? AND date >= ? AND date <= ? ORDER BY date DESC LIMIT 1', this.bible.bookStart[book], this.bible.bookStart[book + 1] - 1, date, addDays(date, -days), addDays(date, days))?.date;
  }

  /** Rule 16.4: the first Storehouse verse that may be home on a date. */
  eligibleFromStorehouse(date: string, w: World, limit = 1): number[] {
    const out: number[] = [];
    for (const { verse } of this.db.all<{ verse: number }>('SELECT verse FROM storehouse ORDER BY position, verse')) {
      if (this.repeatConflict(verse, date, w) || this.chapterConflict(verse, date, w)) continue;
      if (w.lexicon.waysHome(verse, w.rules).length < w.rules['scribe.waysHomeMin']) continue;
      out.push(verse);
      if (out.length >= limit) break;
    }
    return out;
  }

  /** Rule 17.2: a date never opens without a verse. */
  private fillDate(date: string, at: number): void {
    const w = this.worldFor(date);
    let verse = this.eligibleFromStorehouse(date, w)[0];
    let source = 'storehouse';
    if (verse === undefined) {
      // the least recently used past verse with at least 4 ways home
      source = 'fallback';
      for (const row of this.db.all<{ verse: number }>('SELECT verse, MAX(date) AS last FROM calendar WHERE date < ? GROUP BY verse ORDER BY last ASC', date)) {
        if (w.lexicon.waysHome(row.verse, w.rules).length >= w.rules['scribe.fallbackWaysHome']) {
          verse = row.verse;
          break;
        }
      }
    }
    if (verse === undefined) {
      // nothing has ever been scheduled and the Storehouse is empty: start from the built-in stock
      const yesterday = this.calendarRow(addDays(date, -1))?.verse;
      verse = [...FIRST_FOURTEEN, ...MORE_VERSES].map((r) => this.refs.parse(r)!.id!).find((v) => v !== yesterday && !this.repeatConflict(v, date, w)) ?? this.refs.parse(FIRST_FOURTEEN[0])!.id!;
    }
    this.db.run('INSERT OR IGNORE INTO calendar (date, verse, source, rev, updated_at, updated_by) VALUES (?, ?, ?, 1, ?, ?)', date, verse, source, at, 'system');
    this.db.run(
      'INSERT OR IGNORE INTO alerts (at, kind, text, date) VALUES (?, ?, ?, ?)',
      at, 'autofill', `${date} had no verse ${w.rules['scribe.autofillHours']} hours before opening, so it was filled with ${this.bible.label(verse)} from ${source === 'storehouse' ? 'the Storehouse' : 'past verses'}.`, date,
    );
  }

  /** Fills every date that opens within the autofill window and still has no verse. */
  ensureCalendar(at: number): void {
    const first = oldestOpenDate(at) < this.launchDate ? this.launchDate : oldestOpenDate(at);
    const window = this.worldFor(first).rules['scribe.autofillHours'] * 3_600_000;
    for (let d = first; dateOpensAt(d) - window <= at; d = addDays(d, 1)) {
      if (!this.calendarRow(d)) this.fillDate(d, at);
    }
  }

  // -------------------------------------------------------------------------------------------
  // players

  playerById(id: string): PlayerRow | undefined {
    return this.db.get<PlayerRow>('SELECT * FROM players WHERE id = ?', id);
  }

  /** The player a session token belongs to. */
  playerByToken(token: string | undefined): PlayerRow | undefined {
    if (!token) return undefined;
    const row = this.db.get<{ player_id: string }>('SELECT player_id FROM sessions WHERE token_hash = ?', hashToken(token));
    if (!row) return undefined;
    return this.playerById(row.player_id);
  }

  /** Guests play without an account, with progress kept by a token on the device (rule 18.1). */
  createGuest(): { player: PlayerRow; token: string } {
    const at = this.now();
    const id = randomUUID();
    this.db.run('INSERT INTO players (id, created_at, wording) VALUES (?, ?, ?)', id, at, this.settings.defaultWording);
    return { player: this.playerById(id)!, token: this.newSession(id) };
  }

  newSession(playerId: string): string {
    const token = randomBytes(32).toString('base64url');
    const at = this.now();
    this.db.run('INSERT INTO sessions (token_hash, player_id, created_at, seen_at) VALUES (?, ?, ?, ?)', hashToken(token), playerId, at, at);
    return token;
  }

  endSession(token: string): void {
    this.db.run('DELETE FROM sessions WHERE token_hash = ?', hashToken(token));
  }

  /** Rule 13.7: the streak as it stands on a date. A missed rest day does not break it. */
  streakOn(p: PlayerRow, date: string): number {
    if (!p.last_win || !p.streak) return 0;
    const gap = dayDiff(p.last_win, date);
    if (gap <= 1) return p.streak;
    if (gap === 2 && p.rest_day >= 0 && weekday(addDays(date, -1)) === p.rest_day) return p.streak;
    return 0;
  }

  playerView(p: PlayerRow, date: string): PlayerView {
    const counts = this.db.get<{ played: number; wins: number }>("SELECT COUNT(*) AS played, COALESCE(SUM(status = 'won'), 0) AS wins FROM journeys WHERE player_id = ? AND kind = 'daily' AND status != 'playing'", p.id)!;
    const any = this.db.get('SELECT 1 FROM journeys WHERE player_id = ? LIMIT 1', p.id);
    return {
      id: p.id,
      guest: !p.name,
      name: p.name,
      treasure: p.treasure,
      streak: this.streakOn(p, date),
      bestStreak: p.best_streak,
      restDay: p.rest_day,
      wording: p.wording,
      scribe: !!p.scribe,
      firstTime: !p.guide_done && !any,
      wins: counts.wins,
      played: counts.played,
    };
  }

  updateSettings(p: PlayerRow, body: { restDay?: unknown; wording?: unknown }): void {
    if (body.restDay === 0 || body.restDay === 6 || body.restDay === -1) this.db.run('UPDATE players SET rest_day = ? WHERE id = ?', body.restDay, p.id);
    if ((body.wording === 'kjv' || body.wording === 'web') && this.settings.display.includes(body.wording)) this.db.run('UPDATE players SET wording = ? WHERE id = ?', body.wording, p.id);
  }

  track(type: string, playerId: string | null, date: string | null, data: Record<string, unknown> = {}): void {
    this.db.run('INSERT INTO events (at, player_id, date, type, data) VALUES (?, ?, ?, ?, ?)', this.now(), playerId, date, type, JSON.stringify(data));
  }

  // -------------------------------------------------------------------------------------------
  // journeys

  loadJourney(id: string): Journey | undefined {
    const row = this.db.get<JourneyRow>('SELECT id, data FROM journeys WHERE id = ?', id);
    return row ? (JSON.parse(row.data) as Journey) : undefined;
  }

  saveJourney(j: Journey): void {
    const first = j.path[0]?.family ?? null;
    const last = j.status === 'won' ? j.path[j.path.length - 1] : undefined;
    const homeCount = last ? (this.worldOf(j).lexicon.family(last.family)?.verses.length ?? null) : null;
    this.db.run(
      `INSERT INTO journeys (id, player_id, date, kind, status, loss, mode, scribe, home, manna, hops, strikes, first_door, home_door, home_door_count, version, created_at, finished_at, deadline, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET status = excluded.status, loss = excluded.loss, mode = excluded.mode, manna = excluded.manna, hops = excluded.hops, strikes = excluded.strikes,
         first_door = excluded.first_door, home_door = excluded.home_door, home_door_count = excluded.home_door_count, version = excluded.version, finished_at = excluded.finished_at, data = excluded.data`,
      j.id, j.playerId, j.date, j.kind, j.status, j.loss ?? null, j.mode, j.scribe ? 1 : 0, j.home, j.manna, j.path.length, j.totalStrikes, first, last?.family ?? null, homeCount,
      j.version, j.createdAt, j.finishedAt ?? null, j.deadline, JSON.stringify(j),
    );
  }

  dailyJourney(playerId: string, date: string): Journey | undefined {
    const row = this.db.get<JourneyRow>("SELECT id, data FROM journeys WHERE player_id = ? AND date = ? AND kind = 'daily'", playerId, date);
    return row ? (JSON.parse(row.data) as Journey) : undefined;
  }

  /** Rule 12.9: if midnight passed while the app was closed, the journey is shown as The Door Is Shut. */
  sweepPlayer(playerId: string, at: number): void {
    for (const row of this.db.all<JourneyRow>("SELECT id, data FROM journeys WHERE player_id = ? AND status = 'playing' AND deadline IS NOT NULL AND deadline <= ?", playerId, at)) {
      const j = JSON.parse(row.data) as Journey;
      if (checkDeadline(j, at)) this.finish(j, at);
      this.saveJourney(j);
    }
  }

  /** The same for every player, so the day's numbers are true even for players who never came back. */
  sweepAll(at: number): number {
    let n = 0;
    for (const row of this.db.all<JourneyRow>("SELECT id, data FROM journeys WHERE status = 'playing' AND deadline IS NOT NULL AND deadline <= ? LIMIT 500", at)) {
      const j = JSON.parse(row.data) as Journey;
      if (checkDeadline(j, at)) this.finish(j, at);
      this.saveJourney(j);
      n++;
    }
    return n;
  }

  /** Rule 19.6: typed text in the events is deleted after 30 days; outcome codes stay. */
  purgeTypedText(at: number): number {
    const days = this.worldFor(oldestOpenDate(at)).rules['data.typedTextDays'];
    const before = at - days * 86_400_000;
    let n = 0;
    for (const row of this.db.all<JourneyRow>("SELECT id, data FROM journeys WHERE typed_purged = 0 AND status != 'playing' AND created_at < ? LIMIT 200", before)) {
      const j = JSON.parse(row.data) as Journey;
      for (const e of j.events) delete e.typed;
      this.db.run('UPDATE journeys SET data = ?, typed_purged = 1 WHERE id = ?', JSON.stringify(j), row.id);
      n++;
    }
    this.db.run('UPDATE ai_calls SET typed = NULL WHERE at < ? AND typed IS NOT NULL', before);
    this.db.run("UPDATE disputes SET typed = NULL WHERE created_at < ? AND status != 'waiting' AND typed IS NOT NULL", before);
    return n;
  }

  /** What a finished day changes for the player (rules 13.7 and 13.8). Returns the achievements it earned. */
  private finish(j: Journey, at: number): Achievement[] {
    const w = this.worldOf(j);
    const p = this.playerById(j.playerId);
    if (!p) return [];
    if (j.kind === 'guide') {
      this.db.run('UPDATE players SET guide_done = 1 WHERE id = ?', p.id);
      return [];
    }
    if (j.kind !== 'daily') return [];
    let streak = this.streakOn(p, j.date);
    if (j.status === 'won') {
      streak = p.last_win === j.date ? p.streak : streak + 1;
      this.db.run('UPDATE players SET treasure = treasure + ?, streak = ?, best_streak = MAX(best_streak, ?), last_win = ? WHERE id = ?', Math.max(0, j.manna), streak, streak, j.date, p.id);
    }
    this.track(j.status === 'won' ? 'journey.won' : 'journey.lost', p.id, j.date, { reason: j.loss, hops: j.path.length, manna: j.manna, scribe: j.scribe });
    if (!rulesOf(w, j)['feature.achievements']) return [];
    const finishedBefore = this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM journeys WHERE player_id = ? AND kind = 'daily' AND status != 'playing' AND id != ?", p.id, j.id)!.n;
    const fresh: Achievement[] = [];
    for (const id of earned(w, j, streak, finishedBefore === 0)) {
      const r = this.db.run('INSERT OR IGNORE INTO achievements (player_id, id, earned_on) VALUES (?, ?, ?)', p.id, id, j.date);
      const a = ACHIEVEMENTS.find((x) => x.id === id);
      if (r.changes && a) fresh.push({ ...a, earnedOn: j.date });
    }
    void at;
    return fresh;
  }

  private requireTz(tz: unknown): string {
    if (!isValidTimeZone(tz)) throw new GameError('bad_tz', 'That time zone is not one I know.');
    return tz;
  }

  private ownJourney(p: PlayerRow, id: unknown): Journey {
    const j = typeof id === 'string' ? this.loadJourney(id) : undefined;
    if (!j || j.playerId !== p.id) throw new GameError('not_found', 'That journey was not found.', 404);
    return j;
  }

  view(j: Journey, p: PlayerRow, at = this.now()): JourneyView {
    return journeyView(this.worldOf(j), j, p.wording, at);
  }

  // -------------------------------------------------------------------------------------------
  // the daily loop (section 2)

  today(p: PlayerRow, tzRaw: unknown): TodayView {
    const tz = this.requireTz(tzRaw);
    const at = this.now();
    this.ensureCalendar(at);
    this.sweepPlayer(p.id, at);
    p = this.playerById(p.id)!;
    const date = localDate(at, tz);
    const puzzleNo = this.puzzleNo(date);
    const w = this.worldFor(date);
    const row = puzzleNo >= 1 ? this.calendarRow(date) : undefined;
    const j = this.dailyJourney(p.id, date);
    const deadline = j?.deadline ?? deadlineFor(date, tz);
    const minutes = Math.max(0, Math.ceil((deadline - at) / 60000));
    const active = this.db.all<{ id: number; title: string; body: string }>('SELECT id, title, body FROM announcements WHERE draft = 0 AND starts_at <= ? AND ends_at > ? ORDER BY starts_at DESC', at, at);
    const notes = this.db.all<{ id: number; text: string; at: number }>('SELECT id, text, at FROM notes WHERE player_id = ? AND read_at IS NULL ORDER BY at DESC LIMIT 5', p.id);
    const r = w.rules;
    return {
      date,
      puzzleNo,
      // a journey under way keeps its own home verse, whatever the calendar says now (rule 17.5)
      home: j ? verseView(this.worldOf(j), j.home) : row ? verseView(w, row.verse) : null,
      theme: row?.theme ?? null,
      deadline,
      tz: j?.tz ?? tz,
      tzLabel: tzLabel(j?.tz ?? tz),
      serverNow: at,
      lateMinutes: !j && minutes <= r['clock.lateWarningMinutes'] ? minutes : null,
      journey: j ? { status: j.status, hops: j.path.length, manna: j.manna, mode: j.mode } : null,
      yesterday: this.dayResult(p, addDays(date, -1)),
      player: this.playerView(p, date),
      announcements: active,
      notes,
      features: { berean: r['feature.berean'], sundaySchool: r['feature.sundaySchool'], revelation: r['feature.revelation'], achievements: r['feature.achievements'], wordingSwitch: r['feature.wordingSwitch'], aiCheck: r['feature.aiCheck'] && this.ai.ready },
      books: bookSpans(this.bible),
    };
  }

  /** One day in a player's history. */
  dayResult(p: PlayerRow, date: string): DayResult | null {
    const puzzleNo = this.puzzleNo(date);
    if (puzzleNo < 1) return null;
    const j = this.dailyJourney(p.id, date);
    if (j) {
      const w = this.worldOf(j);
      return { date, puzzleNo, status: j.status, loss: j.loss, manna: j.manna, hops: j.path.length, homeRef: this.bible.label(j.home), share: j.status === 'playing' ? undefined : buildShare(w, j), mode: j.mode };
    }
    if (date < localDate(p.created_at, 'UTC')) return null;
    return { date, puzzleNo, status: p.rest_day >= 0 && weekday(date) === p.rest_day ? 'rest' : 'missed', manna: 0, hops: 0 };
  }

  /** Create today's journey, or resume it. A new journey stands on the home verse (rule 2.2). */
  start(p: PlayerRow, tzRaw: unknown, modeRaw: unknown): JourneyView {
    const tz = this.requireTz(tzRaw);
    const at = this.now();
    this.ensureCalendar(at);
    this.sweepPlayer(p.id, at);
    // The server's clock decides which date is current where the player is (rule 12.5).
    const date = localDate(at, tz);
    const existing = this.dailyJourney(p.id, date);
    if (existing) return this.view(existing, p, at);
    const row = this.calendarRow(date);
    if (this.puzzleNo(date) < 1 || !row) throw new GameError('not_launched', 'The first verse has not arrived yet where you are.');
    const rulesVersion = this.rulesVersionFor(date), lexiconVersion = this.lexiconVersionFor(date);
    const w = this.world(lexiconVersion, rulesVersion);
    const mode: JourneyMode = modeRaw === 'berean' && w.rules['feature.berean'] ? 'berean' : 'standard';
    const j = newJourney(
      { id: randomUUID(), playerId: p.id, date, puzzleNo: this.puzzleNo(date), kind: 'daily', mode, scribe: !!p.scribe, home: row.verse, rulesVersion, lexiconVersion, tz, deadline: deadlineFor(date, tz), createdAt: at },
      w.rules,
    );
    this.saveJourney(j);
    this.track('journey.started', p.id, date, { mode, scribe: j.scribe });
    return this.view(j, p, at);
  }

  /** The journey a player is on: today's, or one named by id (practice, the guide, a sandbox). */
  current(p: PlayerRow, id: unknown): JourneyView {
    const at = this.now();
    this.sweepPlayer(p.id, at);
    const j = this.ownJourney(p, id);
    return this.view(j, p, at);
  }

  // -------------------------------------------------------------------------------------------
  // actions

  /** One action at a time per journey, in the order they arrived. */
  private async locked<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(id) ?? Promise.resolve();
    const run = prev.catch(() => undefined).then(fn);
    this.locks.set(id, run);
    try {
      return await run;
    } finally {
      if (this.locks.get(id) === run) this.locks.delete(id);
    }
  }

  private async act(p: PlayerRow, body: { journeyId?: unknown; version?: unknown }, run: (w: World, j: Journey, at: number) => EngineResult | Promise<EngineResult>, at = this.now()): Promise<ActionResult> {
    if (typeof body.journeyId !== 'string') throw new GameError('not_found', 'That journey was not found.', 404);
    return this.locked(body.journeyId, async () => {
      const j = this.ownJourney(p, body.journeyId);
      const w = this.worldOf(j);
      // Rule 12.12: an action from an out-of-date device is refused while that device refreshes.
      if (body.version !== j.version) {
        if (checkDeadline(j, at)) {
          this.finish(j, at);
          this.saveJourney(j);
        }
        return { kind: 'stale' as const, message: message('stale'), notes: [], journey: this.view(j, p, at) };
      }
      const wasPlaying = j.status === 'playing';
      const before = j.version;
      const res = await run(w, j, at);
      let fresh: Achievement[] = [];
      if (wasPlaying && j.status !== 'playing') fresh = this.finish(j, at);
      if (j.version !== before) this.saveJourney(j);
      const player = this.playerById(p.id)!;
      const out: ActionResult = { ...res, journey: this.view(j, player, at) };
      if (wasPlaying && j.status !== 'playing') out.finale = this.buildFinale(j, player, fresh);
      return out;
    });
  }

  hop(p: PlayerRow, body: { journeyId?: unknown; version?: unknown; door?: unknown; typed?: unknown; reference?: unknown }): Promise<ActionResult> {
    // Rule 12.7: an attempt that reaches the server before the deadline is completed, even if checking it finishes later.
    const at = this.now();
    return this.act(
      p,
      body,
      async (w, j) => {
        const r = rulesOf(w, j);
        if (this.rateLimit) {
          // Rule 19.10: one attempt a second and 300 a day, per player.
          const day = localDate(at, 'UTC');
          const lim = this.limiter.get(p.id) ?? { last: 0, day, count: 0 };
          if (lim.day !== day) Object.assign(lim, { day, count: 0 });
          if (at - lim.last < 1000 / r['limits.hopsPerSecond']) return { kind: 'refuse', message: message('rate.second'), notes: [] };
          if (lim.count >= r['limits.hopsPerDay']) return { kind: 'refuse', message: message('rate.day'), notes: [] };
          lim.last = at;
          lim.count++;
          this.limiter.set(p.id, lim);
        }
        const input = { door: String(body.door ?? ''), typed: String(body.typed ?? ''), reference: String(body.reference ?? '') };
        const ask = this.ai.ready ? (q: { typed: string; reference: string; door: string }) => this.ai.check(q, { playerId: p.id, journeyId: j.id, date: j.date, rules: r, at }) : undefined;
        const res = await attemptHop(w, j, input, at, ask);
        this.trackAttempt(j, res);
        return res;
      },
      at,
    );
  }

  private trackAttempt(j: Journey, res: EngineResult): void {
    if (j.kind !== 'daily') return;
    const code = res.message?.code ?? res.kind;
    this.track('hop.attempted', j.playerId, j.date, { code, kind: res.kind });
    if (res.hop) this.track('hop.made', j.playerId, j.date, { tier: res.hop.tier, ref: res.hop.refScore, revisit: res.hop.revisit, home: res.hop.home });
    if (res.kind === 'strike' || code.startsWith('strike.')) this.track('strike', j.playerId, j.date, { code });
    if (j.pending?.type === 'grace') this.track('grace.offered', j.playerId, j.date, { losses: j.pending.losses });
  }

  confirm(p: PlayerRow, body: { journeyId?: unknown; version?: unknown; choice?: unknown }): Promise<ActionResult> {
    const choice = typeof body.choice === 'number' && Number.isInteger(body.choice) ? body.choice : null;
    return this.act(p, body, (w, j, at) => {
      const res = confirmChoice(w, j, choice, at);
      this.trackAttempt(j, res);
      return res;
    });
  }

  lookBack(p: PlayerRow, body: { journeyId?: unknown; version?: unknown }): Promise<ActionResult> {
    return this.act(p, body, (w, j, at) => {
      const res = lookBack(w, j, at);
      if (j.kind === 'daily' && res.undone) this.track('look.back', p.id, j.date, {});
      if (j.kind === 'daily' && j.pending?.type === 'grace') this.track('grace.offered', p.id, j.date, { losses: j.pending.losses });
      return res;
    });
  }

  grace(p: PlayerRow, body: { journeyId?: unknown; version?: unknown; use?: unknown }): Promise<ActionResult> {
    return this.act(p, body, (w, j, at) => {
      const offered = j.pending?.type === 'grace';
      const res = decideGrace(w, j, body.use === true, at);
      if (j.kind === 'daily' && offered) this.track(body.use === true ? 'grace.used' : 'grace.declined', p.id, j.date, {});
      return res;
    });
  }

  mode(p: PlayerRow, body: { journeyId?: unknown; version?: unknown; mode?: unknown }): Promise<ActionResult> {
    return this.act(p, body, (w, j, at) => {
      const mode = body.mode === 'berean' && rulesOf(w, j)['feature.berean'] ? 'berean' : 'standard';
      const ok = setMode(j, mode, at);
      return { kind: ok ? 'nothing' : 'refuse', message: ok ? message(`mode.${mode}`) : null, notes: [] };
    });
  }

  // -------------------------------------------------------------------------------------------
  // after the journey (section 13)

  private buildFinale(j: Journey, p: PlayerRow, fresh: Achievement[] = []): FinaleView {
    return buildFinale(this.worldOf(j), j, p.wording, { treasure: p.treasure, streak: this.streakOn(p, j.date) }, fresh);
  }

  /** Rule 13.1: the finale stays available for that date. A finished journey can be viewed, never replayed (12.10). */
  finale(p: PlayerRow, q: { date?: unknown; journeyId?: unknown }): FinaleView {
    this.sweepPlayer(p.id, this.now());
    const j = typeof q.journeyId === 'string' ? this.ownJourney(p, q.journeyId) : isDate(q.date) ? this.dailyJourney(p.id, q.date) : undefined;
    if (!j || j.playerId !== p.id) throw new GameError('not_found', 'There is no journey for that day.', 404);
    if (j.status === 'playing') throw new GameError('not_finished', 'That journey is still under way.');
    const mine = this.db.all<{ id: string; earned_on: string }>('SELECT id, earned_on FROM achievements WHERE player_id = ? AND earned_on = ?', p.id, j.date);
    const fresh = j.kind === 'daily' ? mine.map((m) => ({ ...ACHIEVEMENTS.find((a) => a.id === m.id)!, earnedOn: m.earned_on })).filter((a) => a.id) : [];
    return this.buildFinale(j, this.playerById(p.id)!, fresh);
  }

  /** Rule 14.6: a calendar of past days with their results, Treasure and the streak. */
  history(p: PlayerRow, tzRaw: unknown): HistoryView {
    const tz = this.requireTz(tzRaw);
    const at = this.now();
    this.sweepPlayer(p.id, at);
    p = this.playerById(p.id)!;
    const today = localDate(at, tz);
    const firstPlayed = this.db.get<{ d: string | null }>("SELECT MIN(date) AS d FROM journeys WHERE player_id = ? AND kind = 'daily'", p.id)?.d;
    const from = [firstPlayed ?? today, this.launchDate].sort().pop()!;
    const days: DayResult[] = [];
    for (let d = today, n = 0; d >= from && n < 400; d = addDays(d, -1), n++) {
      const r = this.dayResult(p, d);
      if (r && !(d === today && r.status !== 'won' && r.status !== 'lost' && r.status !== 'playing')) days.push(r);
    }
    const mine = this.db.all<{ id: string; earned_on: string }>('SELECT id, earned_on FROM achievements WHERE player_id = ?', p.id);
    return {
      days,
      player: this.playerView(p, today),
      launchDate: this.launchDate,
      achievements: mine.map((m) => ({ ...ACHIEVEMENTS.find((a) => a.id === m.id)!, earnedOn: m.earned_on })).filter((a) => a.id),
      allAchievements: this.worldFor(today).rules['feature.achievements'] ? ACHIEVEMENTS : [],
    };
  }

  /** Rule 18.2: the day's shared results, once the date has ended everywhere. Scribes' journeys are left out. */
  revelation(p: PlayerRow, dateRaw: unknown): RevelationView {
    if (!isDate(dateRaw)) throw new GameError('bad_date', 'That is not a date.');
    const date = dateRaw;
    const at = this.now();
    if (!this.worldFor(date).rules['feature.revelation']) throw new GameError('off', 'Revelation is switched off.', 404);
    if (at < dateClosesAt(date)) throw new GameError('too_soon', 'Revelation opens when this date has ended everywhere, so it spoils nothing.', 403);
    this.sweepAll(at);
    const row = this.calendarRow(date);
    if (!row) throw new GameError('not_found', 'There was no puzzle that day.', 404);
    type R = { id: string; player_id: string; status: string; manna: number; first_door: string | null; home_door: string | null; home_door_count: number | null; data: string };
    const rows = this.db.all<R>("SELECT id, player_id, status, manna, first_door, home_door, home_door_count, data FROM journeys WHERE date = ? AND kind = 'daily' AND scribe = 0", date);
    const won = rows.filter((r) => r.status === 'won');
    const mostCommon = (xs: (string | null)[]) => {
      const counts = new Map<string, number>();
      for (const x of xs) if (x) counts.set(x, (counts.get(x) ?? 0) + 1);
      return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
    };
    const ranked = [...rows].sort((a, b) => Number(b.status === 'won') - Number(a.status === 'won') || b.manna - a.manna);
    const best = won.sort((a, b) => b.manna - a.manna)[0];
    const rarest = won.filter((r) => r.home_door && r.home_door_count).sort((a, b) => a.home_door_count! - b.home_door_count!)[0];
    const mineIndex = ranked.findIndex((r) => r.player_id === p.id);
    let bestView: RevelationView['best'] = null;
    if (best) {
      const j = JSON.parse(best.data) as Journey;
      const w = this.worldOf(j);
      bestView = { manna: best.manna, share: buildShare(w, j), route: journeyView(w, j, p.wording, at).chain };
    }
    return {
      date,
      puzzleNo: this.puzzleNo(date),
      homeRef: this.bible.label(row.verse),
      players: rows.length,
      winRate: rows.length ? won.length / rows.length : 0,
      best: bestView,
      firstDoor: mostCommon(rows.map((r) => r.first_door)),
      homeDoor: mostCommon(won.map((r) => r.home_door)),
      rarestHomeDoor: rarest ? { word: rarest.home_door!, count: rarest.home_door_count! } : null,
      place: mineIndex >= 0 ? { rank: mineIndex + 1, of: ranked.length } : null,
    };
  }

  /** Rule 10.5: after a strike or a no-match, the player can report a wrong call. Play carries on while it waits. */
  report(p: PlayerRow, body: { journeyId?: unknown; eventIndex?: unknown; comment?: unknown }): { ok: true } {
    const j = this.ownJourney(p, body.journeyId);
    const i = typeof body.eventIndex === 'number' ? body.eventIndex : -1;
    const ev = j.events[i];
    if (!ev || !ev.code.startsWith('strike.')) throw new GameError('not_reportable', 'Only a strike can be reported.');
    if (j.kind !== 'daily') throw new GameError('not_reportable', 'Practice journeys have nothing to report.');
    const state = { manna: j.manna, oil: j.oil, strikes: j.strikes, status: j.status, loss: j.loss ?? null, current: this.bible.label(j.current), home: this.bible.label(j.home), hops: j.hopsTaken };
    const r = this.db.run(
      'INSERT OR IGNORE INTO disputes (journey_id, player_id, date, event_index, typed, reference, door, call, call_verse, state, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      j.id, p.id, j.date, i, ev.typed ?? null, ev.reference ?? null, ev.door ?? null, ev.code, ev.verse ?? null, JSON.stringify(state), typeof body.comment === 'string' ? body.comment.slice(0, 500) : null, this.now(),
    );
    if (r.changes) this.track('dispute.filed', p.id, j.date, { code: ev.code });
    return { ok: true };
  }

  readNotes(p: PlayerRow): void {
    this.db.run('UPDATE notes SET read_at = ? WHERE player_id = ? AND read_at IS NULL', this.now(), p.id);
  }

  // -------------------------------------------------------------------------------------------
  // the guided first journey, Sunday School and sandboxes

  private startSide(p: PlayerRow, tz: string, kind: JourneyKind, home: number, overrides?: Partial<RuleSet>, mode: JourneyMode = 'standard'): Journey {
    const at = this.now();
    const date = localDate(at, tz);
    const rulesVersion = this.rulesVersionFor(date), lexiconVersion = this.lexiconVersionFor(date);
    const w = this.world(lexiconVersion, rulesVersion);
    // one practice journey at a time: an unfinished one is put away when a new one starts
    this.db.run("DELETE FROM journeys WHERE player_id = ? AND kind = ? AND status = 'playing'", p.id, kind);
    const j = newJourney(
      { id: randomUUID(), playerId: p.id, date, puzzleNo: 0, kind, mode, scribe: !!p.scribe, home, rulesVersion, lexiconVersion, overrides, tz, deadline: null, createdAt: at },
      { ...w.rules, ...overrides },
    );
    this.saveJourney(j);
    return j;
  }

  /** Rule 2.1: a short guided journey on a fixed practice verse, never the day's home verse. */
  startGuide(p: PlayerRow, tzRaw: unknown): { journey: JourneyView; script: { outDoor: string; outText: string; outRef: string; backDoor: string; homeText: string } } {
    const tz = this.requireTz(tzRaw);
    const at = this.now();
    const todayHome = this.calendarRow(localDate(at, tz))?.verse;
    const pick = GUIDES.map((g) => ({ g, home: this.refs.parse(g.home)!.id!, to: this.refs.parse(g.out.to)!.id! })).find((x) => x.home !== todayHome && x.to !== todayHome)!;
    const j = this.startSide(p, tz, 'guide', pick.home, { 'cord.verses': 1, 'gate.manna': 0 });
    const wording = this.bible.displayWording(pick.to, 'kjv');
    return {
      journey: this.view(j, p, at),
      script: { outDoor: pick.g.out.door, outText: this.bible.text(pick.to, wording), outRef: this.bible.label(pick.to), backDoor: pick.g.back.door, homeText: this.bible.text(pick.home, 'kjv') },
    };
  }

  skipGuide(p: PlayerRow): void {
    this.db.run('UPDATE players SET guide_done = 1 WHERE id = ?', p.id);
    this.db.run("DELETE FROM journeys WHERE player_id = ? AND kind = 'guide' AND status = 'playing'", p.id);
  }

  /** Rule 18.3: practice from a random approved verse or any verse the player picks, as often as they like. */
  startPractice(p: PlayerRow, tzRaw: unknown, body: { verse?: unknown; mode?: unknown }): JourneyView {
    const tz = this.requireTz(tzRaw);
    const at = this.now();
    const date = localDate(at, tz);
    const w = this.worldFor(date);
    if (!w.rules['feature.sundaySchool']) throw new GameError('off', 'Sunday School is switched off.', 404);
    let home: number | undefined;
    if (typeof body.verse === 'string' && body.verse.trim()) {
      home = this.refs.parse(body.verse)?.id;
      if (home === undefined) throw new GameError('bad_verse', 'I could not find that verse. Try a reference like John 3:16.');
      if (w.lexicon.waysHome(home, w.rules).length < 2) throw new GameError('bad_verse', 'That verse has too few words to come home through. Try another.');
    } else {
      const todayHome = this.calendarRow(date)?.verse;
      const pool = this.db.all<{ verse: number }>('SELECT verse FROM storehouse').map((r) => r.verse).filter((v) => v !== todayHome);
      home = pool[Math.floor(Math.random() * pool.length)] ?? this.refs.parse('John 3:16')!.id!;
    }
    const mode: JourneyMode = body.mode === 'berean' && w.rules['feature.berean'] ? 'berean' : 'standard';
    return this.view(this.startSide(p, tz, 'practice', home, undefined, mode), p, at);
  }

  /** The Concordance, the one extra help that exists only in Sunday School: up to 50 verses holding the chosen word. */
  concordance(p: PlayerRow, q: { journeyId?: unknown; door?: unknown; book?: unknown }): ConcordanceView {
    const j = this.ownJourney(p, q.journeyId);
    if (j.kind !== 'practice') throw new GameError('practice_only', 'The Concordance is open only in Sunday School.', 403);
    const w = this.worldOf(j);
    const fam = typeof q.door === 'string' ? w.lexicon.familyOfWord(q.door) : undefined;
    if (!fam) throw new GameError('bad_word', 'Tap a word first.');
    const book = typeof q.book === 'string' && q.book !== '' ? Number(q.book) : undefined;
    const verses = w.recognizer.concordance(fam, book !== undefined && book >= 0 && book < 66 ? book : undefined, 51).filter((v) => v !== j.current);
    return { word: fam.key, total: fam.verses.length, verses: verses.slice(0, 50).map((v) => verseText(w, v, p.wording)) };
  }

  // -------------------------------------------------------------------------------------------
  // accounts (rule 18.1)

  recount(playerId: string): void {
    const p = this.playerById(playerId)!;
    const wins = this.db.all<{ date: string; manna: number }>("SELECT date, manna FROM journeys WHERE player_id = ? AND kind = 'daily' AND status = 'won' ORDER BY date", playerId);
    let streak = 0, best = p.best_streak, last: string | null = null;
    for (const w of wins) {
      const gap: number = last ? dayDiff(last, w.date) : 99;
      streak = gap === 1 || (gap === 2 && p.rest_day >= 0 && weekday(addDays(w.date, -1)) === p.rest_day) ? streak + 1 : 1;
      best = Math.max(best, streak);
      last = w.date;
    }
    const treasure = wins.reduce((n, w) => n + Math.max(0, w.manna), 0);
    this.db.run('UPDATE players SET treasure = ?, streak = ?, best_streak = ?, last_win = ? WHERE id = ?', treasure, streak, best, last, playerId);
  }

  /** Signing in keeps Treasure, streaks and history across devices. The guest's play joins the account. */
  register(p: PlayerRow, body: { name?: unknown; password?: unknown }): PlayerRow {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (p.name) throw new GameError('already', 'You are already signed in.');
    if (!/^[A-Za-z0-9_.-]{3,24}$/.test(name)) throw new GameError('bad_name', 'Choose a name of 3 to 24 letters, numbers, dots, dashes or underscores.');
    if (password.length < 8) throw new GameError('bad_password', 'Choose a password of at least 8 characters.');
    if (this.db.get('SELECT 1 FROM players WHERE name = ? COLLATE NOCASE', name)) throw new GameError('taken', 'That name is taken.');
    this.db.run('UPDATE players SET name = ?, pass_hash = ? WHERE id = ?', name, hashPassword(password), p.id);
    return this.playerById(p.id)!;
  }

  login(guest: PlayerRow | undefined, body: { name?: unknown; password?: unknown }): { player: PlayerRow; token: string; notices: string[] } {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const account = this.db.get<PlayerRow>('SELECT * FROM players WHERE name = ? COLLATE NOCASE', name);
    if (!account || !checkPassword(typeof body.password === 'string' ? body.password : '', account.pass_hash)) throw new GameError('bad_login', 'That name and password do not match.', 401);
    const notices: string[] = [];
    if (guest && !guest.name && guest.id !== account.id) {
      this.db.tx(() => {
        for (const row of this.db.all<{ id: string; date: string; kind: string; data: string }>('SELECT id, date, kind, data FROM journeys WHERE player_id = ?', guest.id)) {
          const clash = row.kind === 'daily' && this.db.get("SELECT 1 FROM journeys WHERE player_id = ? AND date = ? AND kind = 'daily'", account.id, row.date);
          if (clash || row.kind !== 'daily') {
            // the account's journey is kept and the guest's is dropped, with a notice
            this.db.run('DELETE FROM journeys WHERE id = ?', row.id);
            if (clash) notices.push(`Your account already had a journey for ${row.date}, so that one was kept.`);
          } else {
            const j = JSON.parse(row.data) as Journey;
            j.playerId = account.id;
            this.db.run('UPDATE journeys SET player_id = ?, data = ? WHERE id = ?', account.id, JSON.stringify(j), row.id);
          }
        }
        this.db.run('UPDATE OR IGNORE achievements SET player_id = ? WHERE player_id = ?', account.id, guest.id);
        this.db.run('DELETE FROM achievements WHERE player_id = ?', guest.id);
        this.db.run('DELETE FROM sessions WHERE player_id = ?', guest.id);
        this.db.run('DELETE FROM players WHERE id = ?', guest.id);
      });
      this.recount(account.id);
    }
    for (const n of notices) this.db.run('INSERT INTO notes (player_id, at, text) VALUES (?, ?, ?)', account.id, this.now(), n);
    return { player: this.playerById(account.id)!, token: this.newSession(account.id), notices };
  }

  /** Rule 19.11: honor deletion requests. Removes the player and everything typed by them. */
  deletePlayer(playerId: string): void {
    this.db.tx(() => {
      for (const table of ['journeys', 'sessions', 'achievements', 'notes', 'disputes']) this.db.run(`DELETE FROM ${table} WHERE player_id = ?`, playerId);
      this.db.run('UPDATE ai_calls SET player_id = NULL, typed = NULL WHERE player_id = ?', playerId);
      this.db.run('UPDATE events SET player_id = NULL WHERE player_id = ?', playerId);
      this.db.run('DELETE FROM players WHERE id = ?', playerId);
    });
  }
}
