// The Scribe's Desk (Part II of the directive): everything a Scribe can see and do.
// Roles are checked on the server for every action (rule 15.2), every action is written to the
// audit log (rule 15.3), and nothing a Scribe does can alter a date that has already begun (17.1).
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import QRCode from 'qrcode';
import { BOOKS } from '../../shared/books.ts';
import type { RuleSet, Tier } from '../../shared/rules.ts';
import { RULE_SPECS, validateRules } from '../../shared/rules.ts';
import type { Game, PlayerRow } from '../app/game.ts';
import { GameError, checkPassword, hashPassword } from '../app/game.ts';
import type { AiSettings } from '../app/ai.ts';
import { addDays, dateClosesAt, dateOpensAt, dateStatus, isDate, newestOpenDate, oldestOpenDate } from '../game/clock.ts';
import { overturnStrike } from '../game/engine.ts';
import type { Journey, World } from '../game/journey.ts';
import type { LexiconConfig } from '../lexicon/defaults.ts';
import { Lexicon } from '../lexicon/lexicon.ts';
import { newSecret, otpauthUrl, verifyTotp } from './totp.ts';

export type Role = 'head' | 'scribe' | 'observer';

export interface AdminRow {
  id: string;
  username: string;
  pass_hash: string;
  role: Role;
  totp_secret: string;
  totp_confirmed: number;
  disabled: number;
  player_id: string | null;
  created_at: number;
}

export interface Admin {
  id: string;
  username: string;
  role: Role;
}

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
const SESSION_MS = 12 * 3_600_000;
const PASSWORD_STAGE_MS = 10 * 60_000;

/** Rule 15.1: what each role may do. */
export const CAN: Record<string, Role[]> = {
  view: ['head', 'scribe', 'observer'],
  schedule: ['head', 'scribe'],
  check: ['head', 'scribe'],
  storehouse: ['head', 'scribe'],
  disputes: ['head', 'scribe'],
  announce: ['head', 'scribe'],
  support: ['head', 'scribe'],
  lexicon: ['head'],
  rules: ['head'],
  replace: ['head'],
  override: ['head'],
  manage: ['head'],
};

export function requireRole(admin: Admin, action: keyof typeof CAN): void {
  if (!CAN[action].includes(admin.role)) throw new GameError('forbidden', `A ${admin.role} cannot do that.`, 403);
}

export class Desk {
  constructor(readonly game: Game) {}

  private get db() {
    return this.game.db;
  }

  private now() {
    return this.game.now();
  }

  // -------------------------------------------------------------------------------------------
  // sign-in (rule 15.2): password, then a code from an authenticator app

  adminCount(): number {
    return this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM admins WHERE disabled = 0')!.n;
  }

  createAdmin(username: string, password: string, role: Role, by = 'cli'): AdminRow {
    if (!/^[A-Za-z0-9_.-]{3,32}$/.test(username)) throw new GameError('bad_name', 'A username is 3 to 32 letters, numbers, dots, dashes or underscores.');
    if (password.length < 10) throw new GameError('bad_password', 'A Desk password is at least 10 characters.');
    if (!['head', 'scribe', 'observer'].includes(role)) throw new GameError('bad_role', 'The role is head, scribe or observer.');
    if (this.db.get('SELECT 1 FROM admins WHERE username = ? COLLATE NOCASE', username)) throw new GameError('taken', 'That username is taken.');
    const id = randomUUID();
    this.db.run('INSERT INTO admins (id, username, pass_hash, role, totp_secret, totp_confirmed, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)', id, username, hashPassword(password), role, newSecret(), this.now());
    this.audit({ id: by, username: by, role: 'head' }, 'admin.create', username, null, { role });
    return this.db.get<AdminRow>('SELECT * FROM admins WHERE id = ?', id)!;
  }

  async login(username: string, password: string): Promise<{ token: string; stage: 'enroll' | 'totp'; qr?: string; otpauth?: string }> {
    const row = this.db.get<AdminRow>('SELECT * FROM admins WHERE username = ? COLLATE NOCASE AND disabled = 0', username);
    // the same work whether or not the name exists, so timing gives nothing away
    const ok = checkPassword(password, row?.pass_hash ?? hashPassword('x'));
    if (!row || !ok) throw new GameError('bad_login', 'That username and password do not match.', 401);
    const token = randomBytes(32).toString('base64url');
    this.db.run('INSERT INTO admin_sessions (token_hash, admin_id, stage, created_at, expires_at) VALUES (?, ?, ?, ?, ?)', hashToken(token), row.id, 'password', this.now(), this.now() + PASSWORD_STAGE_MS);
    if (!row.totp_confirmed) {
      const otpauth = otpauthUrl(row.username, row.totp_secret);
      return { token, stage: 'enroll', otpauth, qr: await QRCode.toDataURL(otpauth, { margin: 1, width: 220 }) };
    }
    return { token, stage: 'totp' };
  }

  verifyCode(token: string, code: string): Admin {
    const s = this.db.get<{ admin_id: string; stage: string; expires_at: number }>('SELECT admin_id, stage, expires_at FROM admin_sessions WHERE token_hash = ?', hashToken(token));
    if (!s || s.expires_at < this.now()) throw new GameError('expired', 'Sign in again.', 401);
    const row = this.db.get<AdminRow>('SELECT * FROM admins WHERE id = ? AND disabled = 0', s.admin_id);
    if (!row) throw new GameError('expired', 'Sign in again.', 401);
    if (!verifyTotp(row.totp_secret, code, this.now())) throw new GameError('bad_code', 'That code is not right. Codes change every 30 seconds.', 401);
    if (!row.totp_confirmed) this.db.run('UPDATE admins SET totp_confirmed = 1 WHERE id = ?', row.id);
    this.db.run('UPDATE admin_sessions SET stage = ?, expires_at = ? WHERE token_hash = ?', 'full', this.now() + SESSION_MS, hashToken(token));
    const admin = { id: row.id, username: row.username, role: row.role };
    this.audit(admin, 'admin.login', row.username, null, null);
    return admin;
  }

  adminByToken(token: string | undefined): Admin | undefined {
    if (!token) return undefined;
    const s = this.db.get<{ admin_id: string; stage: string; expires_at: number }>('SELECT admin_id, stage, expires_at FROM admin_sessions WHERE token_hash = ?', hashToken(token));
    if (!s || s.stage !== 'full' || s.expires_at < this.now()) return undefined;
    const row = this.db.get<AdminRow>('SELECT id, username, role FROM admins WHERE id = ? AND disabled = 0', s.admin_id);
    return row ? { id: row.id, username: row.username, role: row.role } : undefined;
  }

  logout(token: string): void {
    this.db.run('DELETE FROM admin_sessions WHERE token_hash = ?', hashToken(token));
  }

  /** Rule 17.9: a Scribe's own daily journeys are marked and left out of the public statistics. */
  linkPlayer(admin: Admin, player: PlayerRow | undefined): void {
    if (!player) throw new GameError('no_player', 'Open the game in this browser first, then link it.');
    this.db.run('UPDATE admins SET player_id = ? WHERE id = ?', player.id, admin.id);
    this.db.run('UPDATE players SET scribe = 1 WHERE id = ?', player.id);
    this.audit(admin, 'admin.linkPlayer', player.id, null, null);
  }

  audit(admin: Admin, action: string, target: string | null, before: unknown, after: unknown, reason?: string): void {
    this.db.run('INSERT INTO audit (at, admin, role, action, target, before, after, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', this.now(), admin.username, admin.role, action, target, before === null || before === undefined ? null : JSON.stringify(before), after === null || after === undefined ? null : JSON.stringify(after), reason ?? null);
  }

  // -------------------------------------------------------------------------------------------
  // Today (rule 16.1)

  today(): unknown {
    const at = this.now();
    this.game.ensureCalendar(at);
    const date = newestOpenDate(at);
    const dates = [addDays(date, -1), date].filter((d) => dateStatus(d, at) === 'live');
    const day = (d: string) => {
      const row = this.game.calendarRow(d);
      const js = this.db.all<{ status: string; loss: string | null; hops: number; manna: number; strikes: number }>("SELECT status, loss, hops, manna, strikes FROM journeys WHERE date = ? AND kind = 'daily' AND scribe = 0", d);
      const won = js.filter((j) => j.status === 'won');
      const lost = js.filter((j) => j.status === 'lost');
      const byReason: Record<string, number> = {};
      for (const j of lost) byReason[j.loss ?? '?'] = (byReason[j.loss ?? '?'] ?? 0) + 1;
      const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);
      const ai = this.db.get<{ used: number; failed: number }>("SELECT COUNT(*) AS used, COALESCE(SUM(outcome = 'error'), 0) AS failed FROM ai_calls WHERE date = ? AND cached = 0", d)!;
      return {
        date: d,
        puzzleNo: this.game.puzzleNo(d),
        verse: row ? this.game.bible.label(row.verse) : null,
        theme: row?.theme ?? null,
        opensAt: dateOpensAt(d),
        closesAt: dateClosesAt(d),
        started: js.length,
        won: won.length,
        lost: lost.length,
        playing: js.filter((j) => j.status === 'playing').length,
        lostBy: byReason,
        winRate: js.length ? won.length / js.length : null,
        medianHops: median(won.map((j) => j.hops)),
        medianManna: median(won.map((j) => j.manna)),
        strikesPerJourney: js.length ? js.reduce((n, j) => n + j.strikes, 0) / js.length : 0,
        ai,
      };
    };
    const disputesWaiting = this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM disputes WHERE status = 'waiting'")!.n;
    return { days: dates.map(day), disputesWaiting, alerts: this.alerts(at) };
  }

  private alerts(at: number): { level: 'urgent' | 'warn' | 'info'; text: string; date?: string }[] {
    const out: { level: 'urgent' | 'warn' | 'info'; text: string; date?: string }[] = [];
    const w = this.game.worldFor(newestOpenDate(at));
    const start = newestOpenDate(at);
    for (let i = 1; i <= 14; i++) {
      const d = addDays(start, i);
      if (!this.game.calendarRow(d)) {
        const hours = (dateOpensAt(d) - at) / 3_600_000;
        out.push({ level: hours <= 48 ? 'urgent' : 'warn', text: `${d} has no verse yet${hours <= 48 ? ' and opens within 48 hours' : ''}.`, date: d });
      } else {
        const row = this.game.calendarRow(d)!;
        const ways = w.lexicon.waysHome(row.verse, w.rules).length;
        if (ways < w.rules['scribe.waysHomeMin']) out.push({ level: 'urgent', text: `${d}: ${this.game.bible.label(row.verse)} has only ${ways} ways home.`, date: d });
        else if (this.game.bible.wordCount(row.verse, 'kjv') > w.rules['scribe.longVerseWords']) out.push({ level: 'info', text: `${d}: ${this.game.bible.label(row.verse)} is long to read on a phone.`, date: d });
      }
    }
    const eligible = this.game.eligibleFromStorehouse(addDays(start, 15), w, 1000).length;
    if (eligible < w.rules['scribe.storehouseLow']) out.push({ level: 'warn', text: `The Storehouse has only ${eligible} eligible verses.` });
    const errors = this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM ai_calls WHERE outcome = 'error' AND at > ?", at - 86_400_000)!.n;
    if (errors) out.push({ level: 'warn', text: `The AI check failed ${errors} times in the last 24 hours.` });
    for (const a of this.db.all<{ text: string; date: string | null }>('SELECT text, date FROM alerts WHERE at > ? ORDER BY at DESC LIMIT 10', at - 7 * 86_400_000)) out.push({ level: 'info', text: a.text, date: a.date ?? undefined });
    return out;
  }

  // -------------------------------------------------------------------------------------------
  // Calendar (rule 16.2)

  calendar(from: string, to: string): unknown[] {
    const at = this.now();
    const out: unknown[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const row = this.game.calendarRow(d);
      const status = dateStatus(d, at);
      const n = status !== 'future' ? this.db.get<{ n: number; won: number }>("SELECT COUNT(*) AS n, COALESCE(SUM(status = 'won'), 0) AS won FROM journeys WHERE date = ? AND kind = 'daily' AND scribe = 0", d) : undefined;
      out.push({
        date: d,
        puzzleNo: this.game.puzzleNo(d),
        status: !row ? 'empty' : status === 'future' ? 'scheduled' : status === 'live' ? 'live' : 'closed',
        verse: row ? this.game.bible.label(row.verse) : null,
        verseId: row?.verse ?? null,
        theme: row?.theme ?? null,
        note: row?.note ?? null,
        rev: row?.rev ?? 0,
        source: row?.source ?? null,
        players: n?.n ?? 0,
        winRate: n && n.n ? n.won / n.n : null,
      });
    }
    return out;
  }

  private locked(date: string): boolean {
    return dateStatus(date, this.now()) !== 'future';
  }

  private assertEditable(date: string): void {
    if (!isDate(date)) throw new GameError('bad_date', 'That is not a date.');
    if (this.locked(date)) throw new GameError('locked', `${date} has already opened somewhere on Earth, so it is locked.`);
  }

  /** Rule 16.3: everything the Verse check shows. */
  verseCheck(refText: string, forDate?: string): unknown {
    const ref = this.game.refs.parse(refText);
    if (ref?.id === undefined) throw new GameError('bad_verse', 'That is not a verse I can find.');
    const id = ref.id;
    const date = forDate && isDate(forDate) ? forDate : addDays(newestOpenDate(this.now()), 1);
    const w = this.game.worldFor(date);
    const r = w.rules;
    const bible = this.game.bible;
    const families = w.lexicon.verseFamilies(id).map((f) => ({
      key: f.key,
      forms: w.lexicon.formsIn(id, f).map((x) => x.form),
      allForms: w.lexicon.forms(f, 8),
      tier: w.lexicon.tier(f, r),
      count: f.verses.length,
      crumb: f.crumb,
    }));
    const ways = families.filter((f) => f.tier !== 'crumb' && f.tier !== 'wall');
    const rating = ways.length <= r['scribe.ratingHardMax'] ? 'Hard' : ways.length <= r['scribe.ratingMediumMax'] ? 'Medium' : 'Easy';
    const meaning = families.filter((f) => !f.crumb).length;
    const history = this.db.all<{ date: string }>('SELECT date FROM calendar WHERE verse = ? AND date != ? ORDER BY date DESC', id, date).map((x) => x.date);
    const words = Math.max(bible.wordCount(id, 'kjv'), bible.wordCount(id, 'web'));
    const warnings: string[] = [];
    if (ways.length < r['scribe.waysHomeMin']) warnings.push(`Only ${ways.length} ways home: a verse needs at least ${r['scribe.waysHomeMin']} to be scheduled.`);
    if (words > r['scribe.longVerseWords']) warnings.push(`${words} words: long to read on a phone.`);
    if (meaning < 4) warnings.push(`Only ${meaning} meaning words.`);
    const repeat = this.game.repeatConflict(id, date, w);
    if (repeat) warnings.push(`Home on ${repeat}: a verse cannot be home again within ${r['scribe.repeatDays']} days unless the Head Scribe overrides.`);
    const chapter = this.game.chapterConflict(id, date, w);
    if (chapter) warnings.push(`A verse from this chapter was home on ${chapter}, within ${r['scribe.chapterDays']} days.`);
    const book = this.game.bookConflict(id, date, w);
    if (book) warnings.push(`A verse from this book was home on ${book}, within ${r['scribe.bookDays']} days.`);
    if (!bible.has(id, 'web')) warnings.push('The WEB lacks this verse; it plays on the KJV wording.');
    if (!bible.has(id, 'kjv')) warnings.push('The KJV lacks this verse; it plays on the WEB wording.');
    const inStorehouse = !!this.db.get('SELECT 1 FROM storehouse WHERE verse = ?', id);
    return {
      id,
      ref: bible.label(id),
      book: ref.book,
      chapter: ref.chapter,
      kjv: bible.text(id, 'kjv'),
      web: bible.text(id, 'web'),
      families,
      waysHome: ways.length,
      rating,
      words,
      meaningWords: meaning,
      history,
      warnings,
      canSchedule: ways.length >= r['scribe.waysHomeMin'],
      repeatConflict: repeat ?? null,
      inStorehouse,
      forDate: date,
    };
  }

  chapter(book: number, chapter: number): unknown {
    const bible = this.game.bible;
    if (!(book >= 0 && book < 66) || chapter < 1 || chapter > bible.chaptersIn(book)) throw new GameError('bad_ref', 'No such chapter.');
    const n = bible.versesIn(book, chapter);
    return { ref: `${BOOKS[book].name} ${chapter}`, verses: Array.from({ length: n }, (_, i) => ({ v: i + 1, kjv: bible.text(bible.id(book, chapter, i + 1), 'kjv') })) };
  }

  schedule(admin: Admin, body: { date?: unknown; ref?: unknown; theme?: unknown; note?: unknown; rev?: unknown; override?: unknown; reason?: unknown }): unknown {
    const date = String(body.date ?? '');
    this.assertEditable(date);
    const check = this.verseCheck(String(body.ref ?? ''), date) as { id: number; ref: string; canSchedule: boolean; repeatConflict: string | null; waysHome: number };
    if (!check.canSchedule) throw new GameError('unplayable', `${check.ref} has only ${check.waysHome} ways home, so it cannot be scheduled.`);
    if (check.repeatConflict) {
      if (!body.override) throw new GameError('repeat', `${check.ref} was home on ${check.repeatConflict}. Only the Head Scribe can override this, with a reason.`);
      requireRole(admin, 'override');
      if (!String(body.reason ?? '').trim()) throw new GameError('reason', 'An override needs a reason.');
    }
    const existing = this.game.calendarRow(date);
    // Rule 17.8: if two Scribes edit the same date, the second save is refused and shows the first change.
    if (existing && body.rev !== undefined && Number(body.rev) !== existing.rev) {
      throw new GameError('conflict', `${existing.updated_by ?? 'Another Scribe'} changed ${date} to ${this.game.bible.label(existing.verse)} first. Reload and try again.`, 409);
    }
    const theme = typeof body.theme === 'string' ? body.theme.slice(0, 80) || null : (existing?.theme ?? null);
    const note = typeof body.note === 'string' ? body.note.slice(0, 500) || null : (existing?.note ?? null);
    this.db.run(
      'INSERT INTO calendar (date, verse, theme, note, source, rev, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, 1, ?, ?) ON CONFLICT(date) DO UPDATE SET verse = excluded.verse, theme = excluded.theme, note = excluded.note, source = excluded.source, rev = calendar.rev + 1, updated_at = excluded.updated_at, updated_by = excluded.updated_by',
      date, check.id, theme, note, 'scribe', this.now(), admin.username,
    );
    this.audit(admin, 'calendar.schedule', date, existing ? { verse: this.game.bible.label(existing.verse), theme: existing.theme, note: existing.note } : null, { verse: check.ref, theme, note }, body.override ? String(body.reason) : undefined);
    return this.game.calendarRow(date);
  }

  clearDate(admin: Admin, date: string): void {
    this.assertEditable(date);
    const existing = this.game.calendarRow(date);
    if (!existing) return;
    this.db.run('DELETE FROM calendar WHERE date = ?', date);
    this.audit(admin, 'calendar.clear', date, { verse: this.game.bible.label(existing.verse) }, null);
  }

  moveDate(admin: Admin, from: string, to: string): void {
    this.assertEditable(from);
    this.assertEditable(to);
    const a = this.game.calendarRow(from);
    if (!a) throw new GameError('empty', `${from} has no verse to move.`);
    if (this.game.calendarRow(to)) throw new GameError('occupied', `${to} already has a verse. Swap them instead.`);
    this.db.run('UPDATE calendar SET date = ?, rev = rev + 1, updated_at = ?, updated_by = ? WHERE date = ?', to, this.now(), admin.username, from);
    this.audit(admin, 'calendar.move', from, { verse: this.game.bible.label(a.verse) }, { date: to });
  }

  swapDates(admin: Admin, a: string, b: string): void {
    this.assertEditable(a);
    this.assertEditable(b);
    const ra = this.game.calendarRow(a), rb = this.game.calendarRow(b);
    if (!ra || !rb) throw new GameError('empty', 'Both dates need a verse to swap.');
    this.db.tx(() => {
      this.db.run('UPDATE calendar SET verse = ?, theme = ?, note = ?, rev = rev + 1, updated_at = ?, updated_by = ? WHERE date = ?', rb.verse, rb.theme, rb.note, this.now(), admin.username, a);
      this.db.run('UPDATE calendar SET verse = ?, theme = ?, note = ?, rev = rev + 1, updated_at = ?, updated_by = ? WHERE date = ?', ra.verse, ra.theme, ra.note, this.now(), admin.username, b);
    });
    this.audit(admin, 'calendar.swap', `${a} <-> ${b}`, { [a]: this.game.bible.label(ra.verse), [b]: this.game.bible.label(rb.verse) }, { [a]: this.game.bible.label(rb.verse), [b]: this.game.bible.label(ra.verse) });
  }

  /** Bulk import: a CSV of date, reference, theme and note, reported row by row. */
  importCsv(admin: Admin, csv: string, skipFailing: boolean): { rows: { line: number; date: string; ref: string; ok: boolean; message: string }[]; saved: number } {
    const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const rows: { line: number; date: string; ref: string; ok: boolean; message: string }[] = [];
    const parsed: { date: string; ref: string; theme: string; note: string; line: number }[] = [];
    lines.forEach((line, i) => {
      if (i === 0 && /^date\b/i.test(line)) return;
      const cells = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"').trim()) ?? [];
      const [date = '', ref = '', theme = '', note = ''] = cells;
      parsed.push({ date, ref, theme, note, line: i + 1 });
    });
    const seen = new Set<number>();
    for (const p of parsed) {
      try {
        if (!isDate(p.date)) throw new GameError('bad_date', 'Not a date (use YYYY-MM-DD).');
        if (this.locked(p.date)) throw new GameError('locked', 'That date has already opened.');
        const check = this.verseCheck(p.ref, p.date) as { id: number; ref: string; canSchedule: boolean; repeatConflict: string | null; waysHome: number };
        if (!check.canSchedule) throw new GameError('unplayable', `Only ${check.waysHome} ways home.`);
        if (check.repeatConflict) throw new GameError('repeat', `Home on ${check.repeatConflict}.`);
        if (seen.has(check.id)) throw new GameError('dup', 'Already in this import.');
        seen.add(check.id);
        rows.push({ line: p.line, date: p.date, ref: check.ref, ok: true, message: 'OK' });
      } catch (e) {
        rows.push({ line: p.line, date: p.date, ref: p.ref, ok: false, message: e instanceof Error ? e.message : String(e) });
      }
    }
    const failing = rows.filter((r) => !r.ok);
    if (failing.length && !skipFailing) return { rows, saved: 0 };
    let saved = 0;
    this.db.tx(() => {
      for (const p of parsed) {
        const row = rows.find((r) => r.line === p.line)!;
        if (!row.ok) continue;
        this.schedule(admin, { date: p.date, ref: p.ref, theme: p.theme, note: p.note });
        saved++;
      }
    });
    return { rows, saved };
  }

  /** Empty dates filled from the Storehouse in one action (rule 16.2). */
  fillFromStorehouse(admin: Admin, days: number): { filled: { date: string; ref: string }[] } {
    const at = this.now();
    const start = addDays(newestOpenDate(at), 1);
    const filled: { date: string; ref: string }[] = [];
    for (let i = 0; i < days; i++) {
      const d = addDays(start, i);
      if (this.game.calendarRow(d)) continue;
      const w = this.game.worldFor(d);
      const v = this.game.eligibleFromStorehouse(d, w)[0];
      if (v === undefined) break;
      this.db.run('INSERT INTO calendar (date, verse, source, rev, updated_at, updated_by) VALUES (?, ?, ?, 1, ?, ?)', d, v, 'storehouse', at, admin.username);
      filled.push({ date: d, ref: this.game.bible.label(v) });
    }
    this.audit(admin, 'calendar.fill', `${days} days`, null, filled);
    return { filled };
  }

  /** Rule 17.5: in an emergency the Head Scribe replaces a live date's verse, with a reason. */
  replaceLive(admin: Admin, date: string, refText: string, reason: string): unknown {
    requireRole(admin, 'replace');
    if (!isDate(date) || dateStatus(date, this.now()) !== 'live') throw new GameError('not_live', 'Only a live date can be replaced this way.');
    if (!reason.trim()) throw new GameError('reason', 'A replacement needs a reason.');
    const check = this.verseCheck(refText, date) as { id: number; ref: string; canSchedule: boolean };
    if (!check.canSchedule) throw new GameError('unplayable', `${check.ref} cannot be played.`);
    const existing = this.game.calendarRow(date);
    if (!existing) throw new GameError('empty', 'That date has no verse.');
    this.db.tx(() => {
      this.db.run('INSERT INTO calendar_replaced (date, verse, replaced_at, replaced_by, reason) VALUES (?, ?, ?, ?, ?)', date, existing.verse, this.now(), admin.username, reason);
      this.db.run('UPDATE calendar SET verse = ?, source = ?, rev = rev + 1, updated_at = ?, updated_by = ? WHERE date = ?', check.id, 'replaced', this.now(), admin.username, date);
      this.db.run('INSERT INTO announcements (title, body, starts_at, ends_at, draft, created_by, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)', `A change to today’s verse`, `Today’s home verse is now ${check.ref}. Journeys already under way keep the verse they started with.`, this.now(), dateClosesAt(date), admin.username, this.now());
    });
    this.audit(admin, 'calendar.replaceLive', date, { verse: this.game.bible.label(existing.verse) }, { verse: check.ref }, reason);
    return this.game.calendarRow(date);
  }

  // -------------------------------------------------------------------------------------------
  // Storehouse (rule 16.4)

  storehouse(): unknown[] {
    const at = this.now();
    const w = this.game.worldFor(addDays(newestOpenDate(at), 1));
    return this.db.all<{ verse: number; position: number; added_by: string | null; added_at: number }>('SELECT verse, position, added_by, added_at FROM storehouse ORDER BY position, verse').map((r) => {
      const ways = w.lexicon.waysHome(r.verse, w.rules).length;
      const last = this.db.get<{ date: string }>('SELECT MAX(date) AS date FROM calendar WHERE verse = ?', r.verse)?.date ?? null;
      return {
        verse: r.verse,
        ref: this.game.bible.label(r.verse),
        text: this.game.bible.text(r.verse, 'kjv').slice(0, 90),
        waysHome: ways,
        rating: ways <= w.rules['scribe.ratingHardMax'] ? 'Hard' : ways <= w.rules['scribe.ratingMediumMax'] ? 'Medium' : 'Easy',
        lastHome: last,
        addedBy: r.added_by,
      };
    });
  }

  storehouseAdd(admin: Admin, refText: string): void {
    const check = this.verseCheck(refText) as { id: number; ref: string; canSchedule: boolean; waysHome: number };
    if (!check.canSchedule) throw new GameError('unplayable', `${check.ref} has only ${check.waysHome} ways home.`);
    const max = this.db.get<{ m: number | null }>('SELECT MAX(position) AS m FROM storehouse')!.m ?? 0;
    const r = this.db.run('INSERT OR IGNORE INTO storehouse (verse, position, added_at, added_by) VALUES (?, ?, ?, ?)', check.id, max + 1, this.now(), admin.username);
    if (r.changes) this.audit(admin, 'storehouse.add', check.ref, null, null);
  }

  storehouseRemove(admin: Admin, verse: number): void {
    const r = this.db.run('DELETE FROM storehouse WHERE verse = ?', verse);
    if (r.changes) this.audit(admin, 'storehouse.remove', this.game.bible.label(verse), null, null);
  }

  storehouseOrder(admin: Admin, verses: number[], shuffle: boolean): void {
    const ids = shuffle ? this.db.all<{ verse: number }>('SELECT verse FROM storehouse').map((r) => r.verse).sort(() => Math.random() - 0.5) : verses;
    this.db.tx(() => ids.forEach((v, i) => this.db.run('UPDATE storehouse SET position = ? WHERE verse = ?', i + 1, v)));
    this.audit(admin, shuffle ? 'storehouse.shuffle' : 'storehouse.reorder', null, null, shuffle ? null : ids.slice(0, 50));
  }

  // -------------------------------------------------------------------------------------------
  // Book of Remembrance (rule 16.5)

  remembrance(q: string): unknown[] {
    const at = this.now();
    const rows = this.db.all<{ date: string; verse: number; note: string | null; theme: string | null }>('SELECT date, verse, note, theme FROM calendar WHERE date <= ? ORDER BY date DESC LIMIT 400', oldestOpenDate(at));
    const needle = q.trim().toLowerCase();
    return rows
      .map((r) => {
        const stats = this.db.get<{ n: number; won: number }>("SELECT COUNT(*) AS n, COALESCE(SUM(status = 'won'), 0) AS won FROM journeys WHERE date = ? AND kind = 'daily' AND scribe = 0", r.date)!;
        const manna = this.db.all<{ manna: number }>("SELECT manna FROM journeys WHERE date = ? AND kind = 'daily' AND scribe = 0 AND status = 'won' ORDER BY manna", r.date).map((x) => x.manna);
        const top = (col: string) => this.db.get<{ v: string | null }>(`SELECT ${col} AS v FROM journeys WHERE date = ? AND kind = 'daily' AND scribe = 0 AND ${col} IS NOT NULL GROUP BY ${col} ORDER BY COUNT(*) DESC LIMIT 1`, r.date)?.v ?? null;
        const rare = this.db.get<{ home_door: string | null }>("SELECT home_door FROM journeys WHERE date = ? AND kind = 'daily' AND scribe = 0 AND status = 'won' AND home_door_count IS NOT NULL ORDER BY home_door_count ASC LIMIT 1", r.date)?.home_door ?? null;
        const replaced = this.db.all<{ verse: number; reason: string | null }>('SELECT verse, reason FROM calendar_replaced WHERE date = ?', r.date).map((x) => ({ ref: this.game.bible.label(x.verse), reason: x.reason }));
        return {
          date: r.date,
          puzzleNo: this.game.puzzleNo(r.date),
          ref: this.game.bible.label(r.verse),
          book: BOOKS[this.game.bible.ref(r.verse).book].name,
          theme: r.theme,
          note: r.note,
          players: stats.n,
          winRate: stats.n ? stats.won / stats.n : null,
          medianManna: manna.length ? manna[Math.floor(manna.length / 2)] : null,
          firstDoor: top('first_door'),
          homeDoor: top('home_door'),
          rarestHomeDoor: rare,
          replaced,
          closed: dateStatus(r.date, at) === 'closed',
        };
      })
      .filter((r) => !needle || r.ref.toLowerCase().includes(needle) || r.book.toLowerCase().includes(needle) || (r.firstDoor ?? '').includes(needle) || (r.homeDoor ?? '').includes(needle) || r.date.includes(needle));
  }

  remembranceNote(admin: Admin, date: string, note: string): void {
    const row = this.game.calendarRow(date);
    if (!row) throw new GameError('empty', 'No such date.');
    this.db.run('UPDATE calendar SET note = ? WHERE date = ?', note.slice(0, 500) || null, date);
    this.audit(admin, 'remembrance.note', date, { note: row.note }, { note });
  }

  remembranceCsv(): string {
    const rows = this.remembrance('') as { date: string; puzzleNo: number; ref: string; players: number; winRate: number | null; medianManna: number | null; firstDoor: string | null; homeDoor: string | null; rarestHomeDoor: string | null; note: string | null }[];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    return ['date,puzzle,verse,players,win_rate,median_manna,first_door,home_door,rarest_home_door,note', ...rows.map((r) => [r.date, r.puzzleNo, r.ref, r.players, r.winRate === null ? '' : r.winRate.toFixed(3), r.medianManna ?? '', r.firstDoor, r.homeDoor, r.rarestHomeDoor, r.note].map(esc).join(','))].join('\n');
  }

  // -------------------------------------------------------------------------------------------
  // Lexicon (rule 16.6)

  private nextUnopened(): string {
    return addDays(newestOpenDate(this.now()), 1);
  }

  private latestLexicon(): { version: number; config: LexiconConfig } {
    const row = this.db.get<{ version: number; config: string }>('SELECT version, config FROM lexicons ORDER BY version DESC LIMIT 1')!;
    return { version: row.version, config: JSON.parse(row.config) };
  }

  lookupWord(word: string): unknown {
    const w = this.game.worldFor(this.nextUnopened());
    const fam = w.lexicon.familyOfWord(word);
    if (!fam) return { word, found: false };
    const { config } = this.latestLexicon();
    const crumbs = new Set(config.crumbs);
    return {
      word,
      found: true,
      key: fam.key,
      forms: w.lexicon.forms(fam),
      count: fam.verses.length,
      tier: w.lexicon.tier(fam, w.rules),
      crumb: fam.crumb,
      pinned: config.pins[fam.key] ?? null,
      isCrumbWord: crumbs.has(word.toLowerCase()),
      neverStem: config.neverStem.includes(word.toLowerCase()),
      sample: [...fam.verses.slice(0, 5)].map((v) => ({ ref: this.game.bible.label(v), text: this.game.bible.text(v, this.game.bible.displayWording(v, 'kjv')) })),
    };
  }

  /** Applies one change to a copy of the config. */
  private changed(config: LexiconConfig, op: { type: string; word?: string; other?: string; base?: string; form?: string; tier?: string; reason?: string }): LexiconConfig {
    const c: LexiconConfig = JSON.parse(JSON.stringify(config));
    const word = String(op.word ?? '').trim().toLowerCase();
    const other = String(op.other ?? '').trim().toLowerCase();
    if (!word && !['irregular'].includes(op.type)) throw new GameError('bad_word', 'A word is needed.');
    switch (op.type) {
      case 'addCrumb':
        if (!c.crumbs.includes(word)) c.crumbs.push(word);
        break;
      case 'removeCrumb':
        c.crumbs = c.crumbs.filter((x) => x !== word);
        break;
      case 'split':
        if (!c.split.includes(word)) c.split.push(word);
        break;
      case 'unsplit':
        c.split = c.split.filter((x) => x !== word);
        break;
      case 'join':
        if (!other) throw new GameError('bad_word', 'A second word is needed to join.');
        c.joins.push([word, other]);
        break;
      case 'irregular': {
        const base = String(op.base ?? '').trim().toLowerCase(), form = String(op.form ?? '').trim().toLowerCase();
        if (!base || !form) throw new GameError('bad_word', 'A base and a form are needed.');
        (c.irregulars[base] ??= []).push(form);
        break;
      }
      case 'variant':
        if (!other) throw new GameError('bad_word', 'A second spelling is needed.');
        c.variants.push([word, other]);
        break;
      case 'neverStem':
        if (!c.neverStem.includes(word)) c.neverStem.push(word);
        break;
      case 'allowStem':
        c.neverStem = c.neverStem.filter((x) => x !== word);
        break;
      case 'pin':
        if (!['crumb', 'loaf', 'fish', 'pearl'].includes(String(op.tier))) throw new GameError('bad_tier', 'Pin to crumb, loaf, fish or pearl.');
        if (!String(op.reason ?? '').trim()) throw new GameError('reason', 'A pin needs a reason.');
        c.pins[word] = { tier: op.tier as 'crumb' | 'loaf' | 'fish' | 'pearl', reason: String(op.reason) };
        break;
      case 'unpin':
        delete c.pins[word];
        break;
      default:
        throw new GameError('bad_op', 'Unknown change.');
    }
    return c;
  }

  /** Rule 16.6: before saving, every change shows its effect. */
  previewLexicon(op: Parameters<Desk['changed']>[1]): unknown {
    const { config } = this.latestLexicon();
    const next = this.changed(config, op);
    const date = this.nextUnopened();
    const rules = this.game.rules(this.game.rulesVersionFor(date));
    const cur = this.game.worldFor(date).lexicon;
    const lex = new Lexicon(this.game.bible, { ...next, useIrregulars: rules['feature.irregularForms'] }, 0);
    const bible = this.game.bible;
    // which families does a given word fall in, before and after
    const word = String(op.word ?? op.base ?? op.form ?? '').toLowerCase();
    const describe = (l: Lexicon, w: string) => {
      const f = l.familyOfWord(w);
      return f ? { key: f.key, forms: l.forms(f, 10), count: f.verses.length, tier: l.tier(f, rules) } : null;
    };
    let gain = 0, lose = 0;
    const tiers: Record<string, number> = {};
    for (let v = 0; v < bible.count; v++) {
      const a = cur.verseFamilies(v).length, b = lex.verseFamilies(v).length;
      if (b > a) gain++;
      else if (b < a) lose++;
    }
    // tier moves among the families the change touches
    const touched = new Set<string>([word, String(op.other ?? ''), String(op.base ?? ''), String(op.form ?? '')].filter(Boolean).map((x) => x.toLowerCase()));
    for (const t of touched) {
      const a = describe(cur, t), b = describe(lex, t);
      if (a && b && a.tier !== b.tier) tiers[t] = 1;
    }
    return { before: describe(cur, word), after: describe(lex, word), versesGainDoors: gain, versesLoseDoors: lose, tierMoves: Object.keys(tiers).map((t) => ({ word: t, from: describe(cur, t)?.tier, to: describe(lex, t)?.tier })), effectiveFrom: date };
  }

  saveLexicon(admin: Admin, op: Parameters<Desk['changed']>[1], note: string): { version: number; effectiveFrom: string } {
    requireRole(admin, 'lexicon');
    const { version, config } = this.latestLexicon();
    const next = this.changed(config, op);
    const date = this.nextUnopened();
    const v = version + 1;
    this.db.run('INSERT INTO lexicons (version, config, effective_from, created_at, created_by, note) VALUES (?, ?, ?, ?, ?, ?)', v, JSON.stringify(next), date, this.now(), admin.username, note || `${op.type} ${op.word ?? op.base ?? ''}`);
    this.game.resetWorlds();
    this.audit(admin, 'lexicon.save', `v${v}`, { version }, { version: v, op, effectiveFrom: date }, note);
    return { version: v, effectiveFrom: date };
  }

  lexiconVersions(): unknown[] {
    return this.db.all('SELECT version, effective_from, created_at, created_by, note FROM lexicons ORDER BY version DESC LIMIT 50');
  }

  // -------------------------------------------------------------------------------------------
  // The Law (rule 16.7)

  rules(): unknown {
    const row = this.db.get<{ version: number; rules: string; effective_from: string }>('SELECT version, rules, effective_from FROM rule_sets ORDER BY version DESC LIMIT 1')!;
    return { version: row.version, effectiveFrom: row.effective_from, rules: this.game.rules(row.version), specs: RULE_SPECS, history: this.db.all('SELECT version, effective_from, created_at, created_by, note FROM rule_sets ORDER BY version DESC LIMIT 50') };
  }

  saveRules(admin: Admin, rules: Record<string, unknown>, note: string): { version: number; effectiveFrom: string } {
    requireRole(admin, 'rules');
    const current = this.game.rules(this.db.get<{ version: number }>('SELECT MAX(version) AS version FROM rule_sets')!.version);
    const next = { ...current } as Record<string, unknown>;
    for (const s of RULE_SPECS) if (s.key in rules) next[s.key] = typeof s.default === 'boolean' ? !!rules[s.key] : Number(rules[s.key]);
    const problems = validateRules(next as unknown as RuleSet);
    if (problems.length) throw new GameError('invalid', problems.join(' '));
    const cur = current as unknown as Record<string, unknown>;
    const changed = Object.fromEntries(Object.entries(next).filter(([k, v]) => cur[k] !== v));
    if (!Object.keys(changed).length) throw new GameError('unchanged', 'Nothing changed.');
    const version = this.db.get<{ v: number }>('SELECT MAX(version) AS v FROM rule_sets')!.v + 1;
    const date = this.nextUnopened();
    this.db.run('INSERT INTO rule_sets (version, rules, effective_from, created_at, created_by, note) VALUES (?, ?, ?, ?, ?, ?)', version, JSON.stringify(next), date, this.now(), admin.username, note || null);
    this.game.resetWorlds();
    this.audit(admin, 'rules.save', `v${version}`, Object.fromEntries(Object.keys(changed).map((k) => [k, cur[k]])), changed, note);
    return { version, effectiveFrom: date };
  }

  // -------------------------------------------------------------------------------------------
  // Disputes (rule 16.8)

  disputes(status: string): unknown[] {
    return this.db.all<Record<string, unknown>>(`SELECT * FROM disputes ${status === 'all' ? '' : 'WHERE status = ?'} ORDER BY created_at DESC LIMIT 200`, ...(status === 'all' ? [] : [status])).map((d) => ({
      ...d,
      state: typeof d.state === 'string' ? JSON.parse(d.state) : d.state,
      callRef: typeof d.call_verse === 'number' ? this.game.bible.label(d.call_verse) : null,
      rightRef: typeof d.right_verse === 'number' ? this.game.bible.label(d.right_verse) : null,
      dateOpen: typeof d.date === 'string' ? dateStatus(d.date, this.now()) !== 'closed' : false,
    }));
  }

  resolveDispute(admin: Admin, id: number, outcome: 'uphold' | 'overturn', rightRef: string, addAlias: boolean, note: string): unknown {
    const d = this.db.get<{ id: number; journey_id: string; player_id: string; date: string; event_index: number; typed: string | null; status: string; door: string | null }>('SELECT * FROM disputes WHERE id = ?', id);
    if (!d) throw new GameError('not_found', 'No such dispute.', 404);
    if (d.status !== 'waiting') throw new GameError('done', 'That dispute was already decided.');
    const at = this.now();
    let result = 'stands';
    let right: number | null = null;
    let text: string;
    if (outcome === 'overturn') {
      const ref = this.game.refs.parse(rightRef);
      if (ref?.id === undefined) throw new GameError('bad_verse', 'Pick the right verse.');
      right = ref.id;
      const j = this.game.loadJourney(d.journey_id);
      if (j) {
        const open = dateStatus(d.date, at) !== 'closed' && (j.deadline === null || at < j.deadline);
        result = overturnStrike(j, d.event_index, open);
        this.game.saveJourney(j);
      }
      if (addAlias && d.typed) {
        this.db.run('INSERT INTO aliases (verse, text, added_by, at) VALUES (?, ?, ?, ?)', right, d.typed, admin.username, at);
        this.game.refreshAliases();
      }
      text =
        result === 'reopened'
          ? `A Scribe agreed with you: the call on “${d.door ?? ''}” was wrong. The strike is gone and your journey for ${d.date} is open again, exactly as it was.`
          : result === 'removed'
            ? `A Scribe agreed with you: the call on “${d.door ?? ''}” was wrong, and the strike was removed.`
            : `A Scribe agreed with you: the call on “${d.door ?? ''}” was wrong. That day has closed, so the result stands, but the game has learned from it.`;
    } else {
      text = `A Scribe reviewed your report from ${d.date} and the call stands.${note ? ' ' + note : ''}`;
    }
    this.db.run('UPDATE disputes SET status = ?, right_verse = ?, outcome = ?, resolved_by = ?, resolved_at = ?, note = ? WHERE id = ?', outcome, right, result, admin.username, at, note || null, id);
    this.db.run('INSERT INTO notes (player_id, at, text) VALUES (?, ?, ?)', d.player_id, at, text);
    this.game.track('dispute.resolved', d.player_id, d.date, { outcome, result });
    this.audit(admin, `dispute.${outcome}`, String(id), { status: 'waiting' }, { outcome, result, right: right === null ? null : this.game.bible.label(right), alias: addAlias }, note);
    return { outcome, result };
  }

  // -------------------------------------------------------------------------------------------
  // Players (rule 16.9)

  searchPlayers(q: string): unknown[] {
    const needle = `%${q.trim()}%`;
    return this.db.all<PlayerRow>('SELECT * FROM players WHERE name LIKE ? OR id LIKE ? ORDER BY created_at DESC LIMIT 50', needle, needle).map((p) => ({
      id: p.id,
      name: p.name,
      guest: !p.name,
      scribe: !!p.scribe,
      treasure: p.treasure,
      streak: p.streak,
      createdAt: p.created_at,
      journeys: this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM journeys WHERE player_id = ? AND kind = 'daily'", p.id)!.n,
    }));
  }

  player(id: string): unknown {
    const p = this.game.playerById(id);
    if (!p) throw new GameError('not_found', 'No such player.', 404);
    const journeys = this.db.all<{ id: string; date: string; kind: string; status: string; loss: string | null; manna: number; hops: number; strikes: number; data: string }>('SELECT id, date, kind, status, loss, manna, hops, strikes, data FROM journeys WHERE player_id = ? ORDER BY created_at DESC LIMIT 60', id).map((r) => {
      const j = JSON.parse(r.data) as Journey;
      return { id: r.id, date: r.date, kind: r.kind, status: r.status, loss: r.loss, manna: r.manna, hops: r.hops, strikes: r.strikes, home: this.game.bible.label(j.home), events: j.events.slice(-80), path: j.path.map((h) => `${h.fromRef} → ${h.toRef} via ${h.doorWord} (+${h.manna})`) };
    });
    return { player: { id: p.id, name: p.name, scribe: !!p.scribe, treasure: p.treasure, streak: p.streak, bestStreak: p.best_streak, lastWin: p.last_win, restDay: p.rest_day, createdAt: p.created_at }, journeys, notes: this.db.all('SELECT at, text, read_at FROM notes WHERE player_id = ? ORDER BY at DESC LIMIT 20', id) };
  }

  playerAction(admin: Admin, id: string, action: string, reason: string, extra: Record<string, unknown>): void {
    const p = this.game.playerById(id);
    if (!p) throw new GameError('not_found', 'No such player.', 404);
    if (!reason.trim()) throw new GameError('reason', 'This action needs a written reason.');
    switch (action) {
      case 'resetJourney': {
        const j = typeof extra.journeyId === 'string' ? this.game.loadJourney(extra.journeyId) : undefined;
        if (!j || j.playerId !== id) throw new GameError('not_found', 'No such journey.');
        this.db.run('DELETE FROM journeys WHERE id = ?', j.id);
        this.game.recount(id);
        this.audit(admin, 'player.resetJourney', id, { date: j.date, status: j.status }, null, reason);
        this.db.run('INSERT INTO notes (player_id, at, text) VALUES (?, ?, ?)', id, this.now(), `A Scribe reset your journey for ${j.date}${dateStatus(j.date, this.now()) !== 'closed' ? ', so you can start it again' : ''}. ${reason}`);
        return;
      }
      case 'restoreStreak': {
        const streak = Number(extra.streak);
        const lastWin = String(extra.lastWin ?? p.last_win ?? '');
        if (!Number.isInteger(streak) || streak < 0 || !isDate(lastWin)) throw new GameError('bad', 'Give a streak and the date it last counted.');
        this.db.run('UPDATE players SET streak = ?, best_streak = MAX(best_streak, ?), last_win = ? WHERE id = ?', streak, streak, lastWin, id);
        this.audit(admin, 'player.restoreStreak', id, { streak: p.streak, lastWin: p.last_win }, { streak, lastWin }, reason);
        this.db.run('INSERT INTO notes (player_id, at, text) VALUES (?, ?, ?)', id, this.now(), `A Scribe restored your streak to ${streak}. ${reason}`);
        return;
      }
      case 'removeName': {
        if (!p.name) throw new GameError('guest', 'That player has no name.');
        const fresh = `player-${randomBytes(3).toString('hex')}`;
        this.db.run('UPDATE players SET name = ? WHERE id = ?', fresh, id);
        this.audit(admin, 'player.removeName', id, { name: p.name }, { name: fresh }, reason);
        this.db.run('INSERT INTO notes (player_id, at, text) VALUES (?, ?, ?)', id, this.now(), `Your display name was changed by a Scribe to ${fresh}. ${reason}`);
        return;
      }
      case 'delete':
        requireRole(admin, 'manage');
        this.game.deletePlayer(id);
        this.audit(admin, 'player.delete', id, { name: p.name }, null, reason);
        return;
      default:
        throw new GameError('bad_action', 'Unknown action.');
    }
  }

  // -------------------------------------------------------------------------------------------
  // Announcements (rule 16.10), the audit log (16.11) and settings (16.12)

  announcements(): unknown[] {
    return this.db.all('SELECT * FROM announcements ORDER BY starts_at DESC LIMIT 100');
  }

  saveAnnouncement(admin: Admin, body: { id?: unknown; title?: unknown; body?: unknown; startsAt?: unknown; endsAt?: unknown; draft?: unknown }): void {
    const title = String(body.title ?? '').trim().slice(0, 120), text = String(body.body ?? '').trim().slice(0, 1000);
    const starts = Number(body.startsAt), ends = Number(body.endsAt);
    if (!title || !text) throw new GameError('bad', 'A title and a body are needed.');
    if (!(starts > 0 && ends > starts)) throw new GameError('bad', 'The end must come after the start.');
    const draft = body.draft ? 1 : 0;
    if (typeof body.id === 'number') {
      const before = this.db.get('SELECT * FROM announcements WHERE id = ?', body.id);
      this.db.run('UPDATE announcements SET title = ?, body = ?, starts_at = ?, ends_at = ?, draft = ? WHERE id = ?', title, text, starts, ends, draft, body.id);
      this.audit(admin, 'announcement.update', String(body.id), before, { title, text, starts, ends, draft });
    } else {
      const r = this.db.run('INSERT INTO announcements (title, body, starts_at, ends_at, draft, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', title, text, starts, ends, draft, admin.username, this.now());
      this.audit(admin, 'announcement.create', String(r.lastId), null, { title, text, starts, ends, draft });
    }
  }

  deleteAnnouncement(admin: Admin, id: number): void {
    const before = this.db.get('SELECT * FROM announcements WHERE id = ?', id);
    this.db.run('DELETE FROM announcements WHERE id = ?', id);
    this.audit(admin, 'announcement.delete', String(id), before, null);
  }

  auditLog(q: { admin?: string; action?: string; limit?: number }): unknown[] {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (q.admin) {
      where.push('admin = ?');
      params.push(q.admin);
    }
    if (q.action) {
      where.push('action LIKE ?');
      params.push(`${q.action}%`);
    }
    return this.db.all(`SELECT * FROM audit ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`, ...params, Math.min(1000, q.limit ?? 200));
  }

  auditCsv(): string {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    return ['at,admin,role,action,target,before,after,reason', ...this.auditLog({ limit: 1000 }).map((r) => {
      const x = r as Record<string, unknown>;
      return [new Date(Number(x.at)).toISOString(), x.admin, x.role, x.action, x.target, x.before, x.after, x.reason].map(esc).join(',');
    })].join('\n');
  }

  settings(): unknown {
    return {
      wordings: ['kjv', 'web'],
      display: this.game.settings.display,
      defaultWording: this.game.settings.defaultWording,
      ai: this.game.aiSettings,
      aiReady: this.game.ai.ready,
      launchDate: this.game.launchDate,
      launched: dateStatus(this.game.launchDate, this.now()) !== 'future',
      admins: this.db.all<{ id: string; username: string; role: string; disabled: number; totp_confirmed: number; player_id: string | null; created_at: number }>('SELECT id, username, role, disabled, totp_confirmed, player_id, created_at FROM admins ORDER BY created_at'),
    };
  }

  saveSettings(admin: Admin, body: { display?: unknown; defaultWording?: unknown; ai?: unknown; launchDate?: unknown }): void {
    requireRole(admin, 'manage');
    const before = { settings: this.game.settings, ai: this.game.aiSettings, launchDate: this.game.launchDate };
    if (Array.isArray(body.display)) {
      const display = body.display.filter((w): w is 'kjv' | 'web' => w === 'kjv' || w === 'web');
      if (!display.length) throw new GameError('bad', 'Players need at least one wording to display.');
      const def = body.defaultWording === 'web' || body.defaultWording === 'kjv' ? body.defaultWording : this.game.settings.defaultWording;
      this.db.setMeta('settings', { display, defaultWording: display.includes(def) ? def : display[0] });
    }
    if (body.ai && typeof body.ai === 'object') {
      const a = body.ai as Partial<AiSettings>;
      const next: AiSettings = { ...this.game.aiSettings };
      if (a.provider === 'anthropic' || a.provider === 'off') next.provider = a.provider;
      if (typeof a.model === 'string' && /^[a-z0-9.-]{3,60}$/.test(a.model)) next.model = a.model;
      if (typeof a.monthlyAlert === 'number' && a.monthlyAlert >= 0) next.monthlyAlert = Math.floor(a.monthlyAlert);
      this.db.setMeta('ai', next);
    }
    // Rule 17.7: the launch date can't change after launch, because puzzle numbers are permanent.
    if (isDate(body.launchDate) && body.launchDate !== this.game.launchDate) {
      if (dateStatus(this.game.launchDate, this.now()) !== 'future') throw new GameError('launched', 'The game has launched: the launch date is fixed.');
      this.db.setMeta('launchDate', body.launchDate);
      this.game.ensureCalendar(this.now());
    }
    this.audit(admin, 'settings.save', null, before, { settings: this.game.settings, ai: this.game.aiSettings, launchDate: this.game.launchDate });
  }

  addAdmin(admin: Admin, username: string, password: string, role: Role): void {
    requireRole(admin, 'manage');
    this.createAdmin(username, password, role, admin.username);
  }

  setAdmin(admin: Admin, id: string, patch: { role?: unknown; disabled?: unknown; resetTotp?: unknown }): void {
    requireRole(admin, 'manage');
    const before = this.db.get<AdminRow>('SELECT * FROM admins WHERE id = ?', id);
    if (!before) throw new GameError('not_found', 'No such Scribe.', 404);
    if (before.id === admin.id && (patch.disabled || (patch.role && patch.role !== 'head'))) throw new GameError('self', 'You cannot demote or disable yourself.');
    if (patch.role === 'head' || patch.role === 'scribe' || patch.role === 'observer') this.db.run('UPDATE admins SET role = ? WHERE id = ?', patch.role, id);
    if (typeof patch.disabled === 'boolean') {
      this.db.run('UPDATE admins SET disabled = ? WHERE id = ?', patch.disabled ? 1 : 0, id);
      if (patch.disabled) this.db.run('DELETE FROM admin_sessions WHERE admin_id = ?', id);
    }
    if (patch.resetTotp) this.db.run('UPDATE admins SET totp_secret = ?, totp_confirmed = 0 WHERE id = ?', newSecret(), id);
    this.audit(admin, 'admin.update', before.username, { role: before.role, disabled: before.disabled }, patch);
  }
}

export type { Tier, World };
