// The Scribe's Desk (Part II): sign-in with a second factor, roles, the calendar's locks,
// the Verse check, versions that take effect from the next unopened date, and disputes.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Game, GameError } from '../server/app/game.ts';
import { Db } from '../server/db.ts';
import { Desk } from '../server/desk/desk.ts';
import type { Admin } from '../server/desk/desk.ts';
import { totpAt } from '../server/desk/totp.ts';
import { setClock } from '../server/game/clock.ts';
import { buildApp } from '../server/http.ts';
import type { ActionResult, JourneyView } from '../shared/types.ts';
import { bible, verseId } from './helpers.ts';

let app: FastifyInstance;
let game: Game;
let desk: Desk;
const at = (iso: string) => setClock(Date.parse(iso));
const NOW = '2026-11-16T18:00:00Z';
let head: Admin, scribe: Admin, observer: Admin;

beforeAll(async () => {
  at(NOW);
  game = new Game({ db: new Db(':memory:'), rateLimit: false, launchDate: '2026-11-16' });
  app = buildApp(game, { devTools: true });
  await app.ready();
  desk = new Desk(game);
  const mk = (u: string, role: 'head' | 'scribe' | 'observer') => {
    const row = desk.createAdmin(u, 'a long enough password', role);
    return { id: row.id, username: row.username, role: row.role };
  };
  head = mk('ezra', 'head');
  scribe = mk('baruch', 'scribe');
  observer = mk('watcher', 'observer');
});
afterAll(async () => app.close());
beforeEach(() => at(NOW));

describe('signing in (rule 15.2)', () => {
  it('needs a password and then a code from an authenticator app', async () => {
    let res = await app.inject({ method: 'POST', url: '/api/desk/login', payload: { username: 'ezra', password: 'wrong password' } });
    expect(res.statusCode).toBe(401);
    res = await app.inject({ method: 'POST', url: '/api/desk/login', payload: { username: 'ezra', password: 'a long enough password' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().stage).toBe('enroll'); // the first sign-in shows the QR code
    expect(res.json().qr).toMatch(/^data:image\/png/);
    const cookie = (res.headers['set-cookie'] as string).split(';')[0];
    // not signed in yet
    expect((await app.inject({ method: 'GET', url: '/api/desk/today', headers: { cookie } })).statusCode).toBe(401);
    res = await app.inject({ method: 'POST', url: '/api/desk/totp', payload: { code: '000000' }, headers: { cookie } });
    expect(res.statusCode).toBe(401);
    const secret = game.db.get<{ totp_secret: string }>('SELECT totp_secret FROM admins WHERE username = ?', 'ezra')!.totp_secret;
    res = await app.inject({ method: 'POST', url: '/api/desk/totp', payload: { code: totpAt(secret, game.now()) }, headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().admin).toMatchObject({ username: 'ezra', role: 'head' });
    expect((await app.inject({ method: 'GET', url: '/api/desk/today', headers: { cookie } })).statusCode).toBe(200);
    // the second sign-in asks for the code straight away
    res = await app.inject({ method: 'POST', url: '/api/desk/login', payload: { username: 'ezra', password: 'a long enough password' } });
    expect(res.json().stage).toBe('totp');
  });

  it('checks roles on the server for every action (rule 15.1)', () => {
    expect(() => desk.saveRules(observer, { 'oil.start': 10 }, '')).toThrow(/cannot/);
    expect(() => desk.saveRules(scribe, { 'oil.start': 10 }, '')).toThrow(/cannot/);
    expect(() => desk.schedule(observer, { date: '2026-12-25', ref: 'Luke 2:11' })).not.toThrow(); // schedule() itself is guarded by the route
  });
});

describe('the Verse check (rule 16.3)', () => {
  const check = (ref: string) => desk.verseCheck(ref, '2026-12-01') as { waysHome: number; rating: string; words: number; warnings: string[]; canSchedule: boolean };
  it('counts ways home as the directive does', () => {
    expect(check('John 11:35')).toMatchObject({ waysHome: 2, rating: 'Hard', canSchedule: true });
    expect(check('Psalm 119:105')).toMatchObject({ waysHome: 5, rating: 'Medium' });
    expect(check('Isaiah 40:31')).toMatchObject({ waysHome: 13, rating: 'Easy' });
  });
  it('warns about long verses and walls', () => {
    const esther = check('Esther 8:9');
    expect(esther.words).toBeGreaterThan(60);
    expect(esther.warnings.some((w) => w.includes('long'))).toBe(true);
    expect(() => check('Jhon 3:99')).toThrow(GameError);
  });
});

describe('the calendar (rules 16.2 and 17.x)', () => {
  it('schedules, refuses a stale save, moves, swaps and clears', () => {
    const row = desk.schedule(scribe, { date: '2026-12-10', ref: 'Micah 6:8', theme: 'Justice' }) as { rev: number; verse: number };
    expect(bible.label(row.verse)).toBe('Micah 6:8');
    expect(row.rev).toBe(1);
    // rule 17.8: the second save with the old revision is refused and names the first change
    desk.schedule(head, { date: '2026-12-10', ref: 'Joshua 1:9', rev: 1 });
    expect(() => desk.schedule(scribe, { date: '2026-12-10', ref: 'Psalm 46:10', rev: 1 })).toThrow(/Joshua 1:9/);
    desk.moveDate(scribe, '2026-12-10', '2026-12-11');
    expect(game.calendarRow('2026-12-10')).toBeUndefined();
    expect(bible.label(game.calendarRow('2026-12-11')!.verse)).toBe('Joshua 1:9');
    desk.schedule(scribe, { date: '2026-12-12', ref: 'Psalm 46:10' });
    desk.swapDates(scribe, '2026-12-11', '2026-12-12');
    expect(bible.label(game.calendarRow('2026-12-11')!.verse)).toBe('Psalm 46:10');
    desk.clearDate(scribe, '2026-12-11');
    desk.clearDate(scribe, '2026-12-12');
    expect(game.calendarRow('2026-12-11')).toBeUndefined();
  });

  it('locks a date once it has opened anywhere on Earth (rule 17.1)', () => {
    expect(() => desk.schedule(scribe, { date: '2026-11-16', ref: 'Micah 6:8' })).toThrow(/locked/);
    expect(() => desk.schedule(scribe, { date: '2026-11-17', ref: 'Micah 6:8' })).toThrow(/locked/); // already 17 November in Auckland
    expect(() => desk.schedule(scribe, { date: '2026-11-18', ref: 'Micah 6:8' })).not.toThrow();
    desk.clearDate(scribe, '2026-11-18');
  });

  it('refuses a verse that was home within 365 days unless the Head Scribe overrides with a reason (17.3)', () => {
    expect(() => desk.schedule(scribe, { date: '2026-12-20', ref: 'Psalm 119:105' })).toThrow(/home on 2026-11-16/);
    expect(() => desk.schedule(head, { date: '2026-12-20', ref: 'Psalm 119:105', override: true })).toThrow(/reason/);
    desk.schedule(head, { date: '2026-12-20', ref: 'Psalm 119:105', override: true, reason: 'Anniversary' });
    expect(bible.label(game.calendarRow('2026-12-20')!.verse)).toBe('Psalm 119:105');
    desk.clearDate(head, '2026-12-20');
  });

  it('refuses a verse with fewer than 2 ways home (17.4)', () => {
    const w = game.worldFor('2026-12-21');
    let poor = -1;
    for (let v = 0; v < bible.count && poor < 0; v++) if (w.lexicon.waysHome(v, w.rules).length < 2) poor = v;
    expect(poor).toBeGreaterThanOrEqual(0);
    expect(() => desk.schedule(scribe, { date: '2026-12-21', ref: bible.label(poor) })).toThrow(/ways home/);
    // "Pray without ceasing" has exactly 2 (pray, ceasing) and can be scheduled
    expect((desk.verseCheck('1 Thessalonians 5:17', '2026-12-21') as { waysHome: number }).waysHome).toBe(2);
  });

  it('imports a CSV row by row and skips failing rows only when asked', () => {
    const csv = 'date,reference,theme,note\n2027-01-05,Proverbs 3:5,Trust,\n2027-01-06,Jhon 3:99,,\n2026-11-16,Psalm 23:1,,'; // a bad verse, and a date already open
    let r = desk.importCsv(scribe, csv, false);
    expect(r.saved).toBe(0);
    expect(r.rows.map((x) => x.ok)).toEqual([true, false, false]);
    r = desk.importCsv(scribe, csv, true);
    expect(r.saved).toBe(1);
    expect(bible.label(game.calendarRow('2027-01-05')!.verse)).toBe('Proverbs 3:5');
    desk.clearDate(scribe, '2027-01-05');
  });

  it('fills empty dates from the Storehouse in one action, and the calendar never opens a date without a verse (17.2)', () => {
    const r = desk.fillFromStorehouse(scribe, 5);
    expect(r.filled.length).toBeGreaterThan(0);
    for (const f of r.filled) expect(game.calendarRow(f.date)).toBeDefined();
    const cal = desk.calendar('2026-11-16', '2026-11-20') as { status: string; verse: string | null }[];
    expect(cal.every((d) => d.verse)).toBe(true);
    expect(cal[0].status).toBe('live');
  });

  it('lets the Head Scribe replace a live verse; journeys already started keep theirs (17.5)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/journey/start', payload: { tz: 'America/Chicago' } });
    const j = res.json().journey as JourneyView;
    expect(j.home.ref).toBe('Psalm 119:105');
    expect(() => desk.replaceLive(scribe, '2026-11-16', 'John 1:5', 'x')).toThrow(/cannot/);
    desk.replaceLive(head, '2026-11-16', 'Matthew 5:14', 'A typo in the theme');
    expect(bible.label(game.calendarRow('2026-11-16')!.verse)).toBe('Matthew 5:14');
    const cookie = (res.headers['set-cookie'] as string).split(';')[0];
    const again = (await app.inject({ method: 'POST', url: '/api/journey/start', payload: { tz: 'America/Chicago' }, headers: { cookie } })).json().journey as JourneyView;
    expect(again.home.ref).toBe('Psalm 119:105');
    const fresh = (await app.inject({ method: 'POST', url: '/api/journey/start', payload: { tz: 'America/Chicago' } })).json().journey as JourneyView;
    expect(fresh.home.ref).toBe('Matthew 5:14');
    expect(game.db.get('SELECT 1 FROM announcements WHERE draft = 1')).toBeTruthy();
    desk.replaceLive(head, '2026-11-16', 'Psalm 119:105', 'Back again');
  });
});

describe('versions (rules 16.6, 16.7 and 17.6)', () => {
  it('a saved rule set takes effect from the next unopened date, and journeys keep their version', async () => {
    expect(() => desk.saveRules(head, { 'oil.start': 100 }, '')).toThrow(/between/);
    const r = desk.saveRules(head, { 'oil.start': 10, 'gate.manna': 40 }, 'Easier');
    expect(r).toEqual({ version: 2, effectiveFrom: '2026-11-18' });
    expect(game.rulesVersionFor('2026-11-17')).toBe(1);
    expect(game.rulesVersionFor('2026-11-18')).toBe(2);
    expect(game.worldFor('2026-11-18').rules['oil.start']).toBe(10);
    const j = (await app.inject({ method: 'POST', url: '/api/journey/start', payload: { tz: 'America/Chicago' } })).json().journey as JourneyView;
    expect(j.oil).toBe(12);
  });

  it('a lexicon change previews its effect and saves as a new version', () => {
    const p = desk.previewLexicon({ type: 'addCrumb', word: 'selah' }) as { before: { tier: string } | null; after: { tier: string } | null; versesGainDoors: number; versesLoseDoors: number; effectiveFrom: string };
    expect(p.before?.tier).toBe('fish');
    expect(p.after?.tier).toBe('crumb');
    expect(p.effectiveFrom).toBe('2026-11-18');
    const r = desk.saveLexicon(head, { type: 'addCrumb', word: 'selah' }, 'Selah is not a word to hop by');
    expect(r.version).toBe(2);
    const w = game.worldFor('2026-11-18');
    expect(w.lexicon.tier(w.lexicon.familyOfWord('selah')!, w.rules)).toBe('crumb');
    expect(game.worldFor('2026-11-17').lexicon.tier(game.worldFor('2026-11-17').lexicon.familyOfWord('selah')!, game.rules(1))).toBe('fish');
  });
});

describe('disputes (rule 16.8)', () => {
  const hop = async (cookie: string, j: JourneyView, door: string, typed: string) => {
    const res = await app.inject({ method: 'POST', url: '/api/journey/hop', payload: { journeyId: j.id, version: j.version, door, typed, reference: '' }, headers: { cookie } });
    return res.json() as ActionResult;
  };

  it('overturning removes the strike while the date is open, and teaches the game the wording', async () => {
    const start = await app.inject({ method: 'POST', url: '/api/journey/start', payload: { tz: 'America/Chicago' } });
    const cookie = (start.headers['set-cookie'] as string).split(';')[0];
    let j = start.json().journey as JourneyView;
    // "light" is a door; "Jesus wept" has no light: a fair strike, but say the player disputes it
    const r = await hop(cookie, j, 'light', 'Jesus wept');
    expect(r.kind).toBe('strike');
    j = r.journey;
    expect(j.strikes).toBe(1);
    await app.inject({ method: 'POST', url: '/api/journey/report', payload: { journeyId: j.id, eventIndex: r.reportable, comment: 'I meant another verse' }, headers: { cookie } });
    const list = desk.disputes('waiting') as { id: number; typed: string; door: string }[];
    expect(list[0]).toMatchObject({ typed: 'Jesus wept', door: 'light' });
    const out = desk.resolveDispute(scribe, list[0].id, 'overturn', 'John 11:35', true, '') as { result: string };
    expect(out.result).toBe('removed');
    const after = game.loadJourney(j.id)!;
    expect(after.strikes).toBe(0);
    expect(after.totalStrikes).toBe(0);
    expect(game.db.get('SELECT 1 FROM aliases WHERE verse = ?', verseId('John 11:35'))).toBeTruthy();
    expect(game.db.get<{ text: string }>('SELECT text FROM notes WHERE player_id = ? ORDER BY id DESC', after.playerId)!.text).toMatch(/strike was removed/);
  });

  it('a Rooster loss caused by the overturned strike reopens the journey exactly as it was (edge case H7)', async () => {
    const start = await app.inject({ method: 'POST', url: '/api/journey/start', payload: { tz: 'America/Chicago' } });
    const cookie = (start.headers['set-cookie'] as string).split(';')[0];
    let j = start.json().journey as JourneyView;
    let r: ActionResult | undefined;
    for (const typed of ['Jesus wept', 'In the beginning God created the heaven and the earth', 'Pray without ceasing']) {
      r = await hop(cookie, j, 'lamp', typed);
      j = r.journey;
    }
    expect(j.pending).toMatchObject({ type: 'grace' });
    const declined = (await app.inject({ method: 'POST', url: '/api/journey/grace', payload: { journeyId: j.id, version: j.version, use: false }, headers: { cookie } })).json() as ActionResult;
    expect(declined.journey.status).toBe('lost');
    expect(declined.journey.loss?.reason).toBe('rooster');
    await app.inject({ method: 'POST', url: '/api/journey/report', payload: { journeyId: j.id, eventIndex: r!.reportable }, headers: { cookie } });
    const d = (desk.disputes('waiting') as { id: number; journey_id: string }[]).find((x) => x.journey_id === j.id)!;
    const out = desk.resolveDispute(head, d.id, 'overturn', '1 Thessalonians 5:17', false, '') as { result: string };
    expect(out.result).toBe('reopened');
    const after = game.loadJourney(j.id)!;
    expect(after.status).toBe('playing');
    expect(after.strikes).toBe(2);
    expect(after.gracesLeft).toBe(1);
  });

  it('upholding leaves the result and tells the player', async () => {
    const start = await app.inject({ method: 'POST', url: '/api/journey/start', payload: { tz: 'America/Chicago' } });
    const cookie = (start.headers['set-cookie'] as string).split(';')[0];
    const j = start.json().journey as JourneyView;
    const r = await hop(cookie, j, 'light', 'Jesus wept');
    await app.inject({ method: 'POST', url: '/api/journey/report', payload: { journeyId: j.id, eventIndex: r.reportable }, headers: { cookie } });
    const d = (desk.disputes('waiting') as { id: number; journey_id: string }[]).find((x) => x.journey_id === j.id)!;
    desk.resolveDispute(scribe, d.id, 'uphold', '', false, 'The verse has no light in it.');
    expect(game.loadJourney(j.id)!.strikes).toBe(1);
    expect(game.db.get<{ text: string }>('SELECT text FROM notes WHERE player_id = ? ORDER BY id DESC', j.id ? game.loadJourney(j.id)!.playerId : '')!.text).toMatch(/call stands/);
  });
});

describe('the rest of the Desk', () => {
  it('keeps an audit log of every action (rule 15.3)', () => {
    const log = desk.auditLog({ limit: 500 }) as { action: string; admin: string }[];
    for (const action of ['admin.create', 'calendar.schedule', 'calendar.replaceLive', 'rules.save', 'lexicon.save', 'dispute.overturn', 'dispute.uphold']) {
      expect(log.some((e) => e.action === action)).toBe(true);
    }
    expect(desk.auditCsv().split('\n')[0]).toBe('at,admin,role,action,target,before,after,reason');
  });

  it('announcements show to players between their start and end', async () => {
    desk.saveAnnouncement(scribe, { title: 'A note', body: 'The oil is sweeter today.', startsAt: game.now() - 1000, endsAt: game.now() + 3_600_000 });
    const t = (await app.inject({ method: 'GET', url: '/api/today?tz=America/Chicago' })).json();
    expect(t.announcements.map((a: { title: string }) => a.title)).toContain('A note');
  });

  it('supports players with a written reason', () => {
    const players = desk.searchPlayers('') as { id: string }[];
    expect(players.length).toBeGreaterThan(0);
    expect(() => desk.playerAction(scribe, players[0].id, 'restoreStreak', '', { streak: 3, lastWin: '2026-11-15' })).toThrow(/reason/);
    desk.playerAction(scribe, players[0].id, 'restoreStreak', 'Lost to a bug', { streak: 3, lastWin: '2026-11-15' });
    expect(game.playerById(players[0].id)!.streak).toBe(3);
    expect(() => desk.playerAction(scribe, players[0].id, 'delete', 'asked', {})).toThrow(/cannot/);
  });

  it('settings: the launch date is fixed once the game has launched (17.7), and roles are managed by the Head Scribe', () => {
    expect(() => desk.saveSettings(head, { launchDate: '2026-12-01' })).toThrow(/launched/);
    desk.saveSettings(head, { ai: { provider: 'off' } });
    expect(game.aiSettings.provider).toBe('off');
    expect(() => desk.saveSettings(scribe, { ai: { provider: 'anthropic' } })).toThrow(/cannot/);
    desk.setAdmin(head, observer.id, { role: 'scribe' });
    expect(game.db.get<{ role: string }>('SELECT role FROM admins WHERE id = ?', observer.id)!.role).toBe('scribe');
    expect(() => desk.setAdmin(head, head.id, { disabled: true })).toThrow(/yourself/);
  });

  it('the Book of Remembrance lists closed dates with their numbers', () => {
    at('2026-11-18T18:00:00Z');
    const rows = desk.remembrance('psalm') as { date: string; ref: string }[];
    expect(rows.some((r) => r.date === '2026-11-16')).toBe(true);
  });
});
