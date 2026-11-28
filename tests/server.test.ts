// The game as a player meets it, over HTTP: the daily clock, saving, stale devices and the finale.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Game } from '../server/app/game.ts';
import { Db } from '../server/db.ts';
import { setClock } from '../server/game/clock.ts';
import { buildApp } from '../server/http.ts';
import type { ActionResult, FinaleView, HistoryView, JourneyView, TodayView } from '../shared/types.ts';
import { bible, verseId } from './helpers.ts';

let app: FastifyInstance;
let game: Game;

/** A browser, more or less: keeps its cookie between requests. */
class Browser {
  cookie = '';
  async call<T>(method: 'GET' | 'POST', url: string, body?: unknown): Promise<T> {
    const res = await app.inject({ method, url, payload: body as object | undefined, headers: this.cookie ? { cookie: this.cookie } : {} });
    const set = res.headers['set-cookie'];
    if (set) this.cookie = (Array.isArray(set) ? set[0] : set).split(';')[0];
    const json = res.json();
    if (res.statusCode >= 400) throw Object.assign(new Error(json.message), { status: res.statusCode, code: json.error });
    return json as T;
  }
  get = <T>(url: string) => this.call<T>('GET', url);
  post = <T>(url: string, body: unknown = {}) => this.call<T>('POST', url, body);

  journey!: JourneyView;
  async start(tz = 'America/Chicago', mode?: string): Promise<JourneyView> {
    this.journey = (await this.post<{ journey: JourneyView }>('/api/journey/start', { tz, mode })).journey;
    return this.journey;
  }
  async act(path: string, extra: Record<string, unknown> = {}): Promise<ActionResult> {
    const r = await this.post<ActionResult>(`/api/journey/${path}`, { journeyId: this.journey.id, version: this.journey.version, ...extra });
    this.journey = r.journey;
    return r;
  }
  hop(door: string, reference: string, withRef = true): Promise<ActionResult> {
    return this.act('hop', { door, typed: bible.text(verseId(reference), 'kjv'), reference: withRef ? reference : '' });
  }
}

const at = (iso: string) => setClock(Date.parse(iso));

beforeAll(async () => {
  at('2026-11-16T18:00:00Z'); // noon in Chicago
  game = new Game({ db: new Db(':memory:'), rateLimit: false, launchDate: '2026-11-16' });
  app = buildApp(game, { devTools: true });
  await app.ready();
});
afterAll(async () => {
  await app.close();
});
beforeEach(() => at('2026-11-16T18:00:00Z'));

describe('today', () => {
  it('shows puzzle #1 with its home verse, the deadline and the player', async () => {
    const b = new Browser();
    const t = await b.get<TodayView>('/api/today?tz=America/Chicago');
    expect(t.puzzleNo).toBe(1);
    expect(t.date).toBe('2026-11-16');
    expect(t.home!.ref).toBe('Psalm 119:105');
    expect(new Date(t.deadline).toISOString()).toBe('2026-11-17T06:00:00.000Z'); // midnight, Chicago time
    expect(t.tzLabel).toBe('Chicago time');
    expect(t.player.guest).toBe(true);
    expect(t.player.firstTime).toBe(true);
    expect(t.journey).toBeNull();
    expect(t.books).toHaveLength(66);
    // the home verse carries both wordings, and every word is a door
    expect(Object.keys(t.home!.wordings)).toEqual(['kjv', 'web']);
    const light = t.home!.doors.find((d) => d.key === 'light')!;
    expect(light).toMatchObject({ tier: 'fish', value: 10, count: 270, state: 'open' });
  });

  it('gives the same home verse to everyone on a date, and a different date to players elsewhere', async () => {
    const a = await new Browser().get<TodayView>('/api/today?tz=America/Chicago');
    const b = await new Browser().get<TodayView>('/api/today?tz=Europe/London');
    expect(b.home!.ref).toBe(a.home!.ref);
    const c = await new Browser().get<TodayView>('/api/today?tz=Pacific/Auckland'); // already tomorrow there
    expect(c.date).toBe('2026-11-17');
    expect(c.puzzleNo).toBe(2);
    expect(c.home!.ref).toBe('John 1:5');
  });

  it('refuses a time zone it does not know', async () => {
    await expect(new Browser().get('/api/today?tz=Mars/Olympus')).rejects.toMatchObject({ status: 400 });
  });
});

describe('a journey over the API', () => {
  it('plays the worked example and reaches the finale', async () => {
    const b = new Browser();
    const j = await b.start();
    expect(j).toMatchObject({ manna: 0, oil: 12, strikes: 0, graces: 1, status: 'playing', puzzleNo: 1 });
    expect(j.current.ref).toBe('Psalm 119:105');

    let r = await b.hop('light', 'Genesis 1:3');
    expect(r.kind).toBe('hop');
    expect(r.journey.current.ref).toBe('Genesis 1:3');
    expect(r.journey.arrivedBy).toBe('fish');
    expect(r.journey.chain.map((c) => c.ref)).toEqual(['Psalm 119:105', 'Genesis 1:3']);
    // the light door is now used in both verses
    expect(r.journey.home.doors.find((d) => d.key === 'light')!.state).toBe('used');
    expect(r.journey.current.doors.find((d) => d.key === 'light')!.state).toBe('used');
    expect(r.journey.lookBack).toMatchObject({ available: true, toRef: 'Psalm 119:105', earned: 20, salt: 10, cost: 30 });

    r = await b.act('hop', { door: 'God', typed: 'Jesus wept', reference: '' });
    expect(r.kind).toBe('strike');
    expect(typeof r.reportable).toBe('number');
    await b.post('/api/journey/report', { journeyId: b.journey.id, eventIndex: r.reportable, comment: 'test' });

    await b.hop('God', 'Genesis 1:1');
    r = await b.hop('beginning', 'John 1:1');
    expect(r.journey.cord).toEqual({ have: 3, need: 3 });
    await b.hop('God', 'Hebrews 4:12');
    expect(b.journey.manna).toBe(50);
    r = await b.act('hop', { door: 'word', typed: bible.text(b.journey.home.id, 'kjv'), reference: '' });
    expect(r.kind).toBe('home');
    expect(r.journey.status).toBe('won');
    expect(r.finale).toBeDefined();
    const f = r.finale!;
    expect(f).toMatchObject({ won: true, manna: 65, calf: 10, homeWord: 'word', treasure: 65, streak: 1, puzzleNo: 1 });
    expect(f.share).toContain('Bible Hopping #1');
    expect(f.numbers).toMatchObject({ hops: 5, manna: 65, oilLeft: 7, exactRefs: 4, strikes: 1, graceUsed: false, testaments: 2 });
    expect(f.road).toHaveLength(6);
    expect(f.road[1].tokens.some((t) => t.m === 'in')).toBe(true);
    expect(f.achievements.map((a) => a.id)).toContain('grasshopper');

    // the finale stays available, and a finished journey can be viewed but not replayed
    const again = await b.get<FinaleView>('/api/finale?date=2026-11-16');
    expect(again.manna).toBe(65);
    const resumed = await b.start();
    expect(resumed.id).toBe(b.journey.id);
    expect(resumed.status).toBe('won');
    r = await b.hop('lamp', 'Matthew 25:8');
    expect(r.kind).toBe('nothing');

    const t = await b.get<TodayView>('/api/today?tz=America/Chicago');
    expect(t.player).toMatchObject({ treasure: 65, streak: 1, wins: 1, played: 1 });
    expect(t.journey).toMatchObject({ status: 'won', manna: 65 });
  });

  it('refuses an action from an out-of-date device, and hands back the current state', async () => {
    const phone = new Browser();
    await phone.start();
    const laptop = new Browser();
    laptop.cookie = phone.cookie;
    await laptop.start();
    await phone.hop('light', 'Genesis 1:3');
    const r = await laptop.hop('lamp', 'Matthew 25:8'); // still on the old version
    expect(r.kind).toBe('stale');
    expect(r.journey.current.ref).toBe('Genesis 1:3');
    expect(r.journey.hops).toBe(1);
  });

  it('asks before a confirmation, and choosing costs nothing', async () => {
    const b = new Browser();
    await b.start();
    await b.hop('light', 'Genesis 1:3');
    let r = await b.act('hop', { door: 'God', typed: 'Ask, and it shall be given you; seek, and ye shall find; knock, and it shall be opened unto you', reference: '' });
    expect(r.kind).toBe('choose');
    expect(r.journey.pending).toMatchObject({ type: 'choose' });
    const options = (r.journey.pending as { options: { id: number; ref: string }[] }).options;
    expect(options.map((o) => o.ref).sort()).toEqual(['Luke 11:9', 'Matthew 7:7']);
    r = await b.act('confirm', { choice: null });
    expect(r.kind).toBe('declined');
    expect(r.journey.strikes).toBe(0);
    expect(r.journey.pending).toBeNull();
  });

  it('offers Grace, freezes play until the player chooses, and keeps the choice across a reload', async () => {
    const b = new Browser();
    await b.start();
    for (const typed of ['Jesus wept', 'In the beginning God created the heaven and the earth', 'Pray without ceasing']) {
      await b.act('hop', { door: 'lamp', typed, reference: '' });
    }
    expect(b.journey.pending).toMatchObject({ type: 'grace', losses: ['rooster'] });
    let r = await b.hop('light', 'Genesis 1:3');
    expect(r.kind).toBe('nothing'); // frozen
    const reloaded = await b.start();
    expect(reloaded.pending).toMatchObject({ type: 'grace' });
    r = await b.act('grace', { use: true });
    expect(r.kind).toBe('graceUsed');
    expect(r.journey).toMatchObject({ strikes: 0, graces: 0, status: 'playing' });
  });
});

describe('the daily clock (section 12)', () => {
  it('23: midnight passes while the app is closed', async () => {
    at('2026-11-17T05:59:00Z'); // 11:59 PM in Chicago
    const b = new Browser();
    const j = await b.start();
    expect(j.date).toBe('2026-11-16');
    expect(j.lateMinutes).toBe(1);
    at('2026-11-17T06:10:00Z'); // 12:10 AM
    const t = await b.get<TodayView>('/api/today?tz=America/Chicago');
    expect(t.date).toBe('2026-11-17');
    expect(t.puzzleNo).toBe(2);
    expect(t.yesterday).toMatchObject({ date: '2026-11-16', status: 'lost', loss: 'door' });
    expect(t.journey).toBeNull(); // today's verse is ready
    expect(t.home!.ref).toBe('John 1:5');
    const f = await b.get<FinaleView>('/api/finale?date=2026-11-16');
    expect(f.loss!.name).toBe('The Door Is Shut');
  });

  it('24: the deadline stays in the time zone the journey was created in', async () => {
    const b = new Browser();
    const j = await b.start('America/Chicago');
    const t = await b.get<TodayView>('/api/today?tz=America/Denver'); // the device moves
    expect(t.deadline).toBe(j.deadline);
    expect(new Date(t.deadline).toISOString()).toBe('2026-11-17T06:00:00.000Z'); // 11:00 PM in Denver
    expect(t.tzLabel).toBe('Chicago time');
  });

  it('a hop that arrives after the deadline finds the door shut', async () => {
    const b = new Browser();
    await b.start();
    await b.hop('light', 'Genesis 1:3');
    at('2026-11-17T06:00:01Z');
    const r = await b.hop('God', 'Genesis 1:1');
    expect(r.kind).toBe('lost');
    expect(r.journey.loss!.reason).toBe('door');
    expect(r.journey.current.ref).toBe('Genesis 1:3');
    expect(r.finale!.won).toBe(false);
  });

  it('warns a player who starts with less than 30 minutes left', async () => {
    at('2026-11-17T05:45:00Z');
    const t = await new Browser().get<TodayView>('/api/today?tz=America/Chicago');
    expect(t.lateMinutes).toBe(15);
  });

  it('a 23-hour day when the clocks change', async () => {
    // US clocks spring forward on 8 March 2026
    const { deadlineFor, startOfDate } = await import('../server/game/clock.ts');
    expect((deadlineFor('2026-03-08', 'America/Chicago') - startOfDate('2026-03-08', 'America/Chicago')) / 3_600_000).toBe(23);
    expect((deadlineFor('2026-11-01', 'America/Chicago') - startOfDate('2026-11-01', 'America/Chicago')) / 3_600_000).toBe(25);
  });
});

describe('streaks and the rest day (rule 13.7)', () => {
  const win = async (b: Browser) => {
    await b.start();
    const home = b.journey.home;
    // any three verses and 50 manna will do: find doors by brute force from the verse views
    const routes: Record<string, [string, string][]> = {
      'Psalm 119:105': [['light', 'Genesis 1:3'], ['God', 'Genesis 1:1'], ['beginning', 'John 1:1'], ['God', 'Hebrews 4:12']],
      'John 1:5': [['darkness', 'Genesis 1:2'], ['God', 'Genesis 1:1'], ['earth', 'Psalm 24:1'], ['world', 'Matthew 5:14']],
      'Isaiah 40:31': [['LORD', 'Psalm 23:1'], ['shepherd', 'John 10:11'], ['life', 'John 14:6'], ['Jesus', 'John 11:35']],
    };
    for (const [door, ref] of routes[home.ref] ?? []) await b.hop(door, ref);
    return b;
  };

  it('counts consecutive won days, and a missed Sunday does not break it', async () => {
    const b = new Browser();
    // Monday 16 November
    await win(b);
    let r = await b.act('hop', { door: 'word', typed: bible.text(b.journey.home.id, 'kjv'), reference: '' });
    expect(r.kind).toBe('home');
    expect(r.finale!.streak).toBe(1);
    // Tuesday
    at('2026-11-17T18:00:00Z');
    await win(b);
    r = await b.act('hop', { door: 'light', typed: bible.text(b.journey.home.id, 'kjv'), reference: '' });
    expect(r.kind).toBe('home');
    expect(r.finale!.streak).toBe(2);
    const h = await b.get<HistoryView>('/api/history?tz=America/Chicago');
    expect(h.days.map((d) => d.status)).toEqual(['won', 'won']);
    expect(h.player.streak).toBe(2);
    // Thursday: Wednesday was missed, and it was not the rest day
    at('2026-11-19T18:00:00Z');
    const t = await b.get<TodayView>('/api/today?tz=America/Chicago');
    expect(t.player.streak).toBe(0);
    expect(t.yesterday).toMatchObject({ status: 'missed' });
  });

  it('missing the rest day keeps the streak alive', () => {
    const p = { id: 'x', created_at: 0, name: null, pass_hash: null, scribe: 0, rest_day: 0, wording: 'kjv' as const, treasure: 0, streak: 5, best_streak: 5, last_win: '2026-11-21', guide_done: 0, plus: 0, practice_used: 0 };
    expect(game.streakOn(p, '2026-11-22')).toBe(5); // Sunday itself
    expect(game.streakOn(p, '2026-11-23')).toBe(5); // Monday: Sunday was the rest day
    expect(game.streakOn(p, '2026-11-24')).toBe(0);
    expect(game.streakOn({ ...p, rest_day: -1 }, '2026-11-23')).toBe(0); // no rest day chosen
    expect(game.streakOn({ ...p, rest_day: 6, last_win: '2026-11-20' }, '2026-11-22')).toBe(5); // Saturday rest
  });
});

describe('the guided first journey and Sunday School', () => {
  it('guides a first-time player home on a practice verse, and skipping works', async () => {
    const b = new Browser();
    const g = await b.post<{ journey: JourneyView; script: { outDoor: string; outText: string; backDoor: string; homeText: string } }>('/api/guide/start', { tz: 'America/Chicago' });
    b.journey = g.journey;
    expect(g.journey.kind).toBe('guide');
    expect(g.journey.home.ref).not.toBe('Psalm 119:105');
    expect(g.journey.cord.need).toBe(1);
    let r = await b.act('hop', { door: g.script.outDoor, typed: g.script.outText, reference: '' });
    expect(r.kind).toBe('hop');
    r = await b.act('hop', { door: g.script.backDoor, typed: g.script.homeText, reference: '' });
    expect(r.kind).toBe('home');
    const t = await b.get<TodayView>('/api/today?tz=America/Chicago');
    expect(t.player.firstTime).toBe(false);
    expect(t.player.treasure).toBe(0); // nothing counts
    const s = new Browser();
    await s.post('/api/guide/skip');
    expect((await s.get<TodayView>('/api/today?tz=America/Chicago')).player.firstTime).toBe(false);
  });

  it('practice counts for nothing and opens the Concordance', async () => {
    const b = new Browser();
    b.journey = (await b.post<{ journey: JourneyView }>('/api/practice/start', { tz: 'America/Chicago', verse: 'John 3:16' })).journey;
    expect(b.journey).toMatchObject({ kind: 'practice', deadline: null });
    expect(b.journey.home.ref).toBe('John 3:16');
    const c = await b.get<{ word: string; total: number; verses: { ref: string }[] }>(`/api/practice/concordance?journeyId=${b.journey.id}&door=begotten`);
    expect(c.word).toBe('beget');
    expect(c.verses.length).toBeGreaterThan(5);
    expect(c.verses.length).toBeLessThanOrEqual(50);
    // the daily journey has no Concordance
    const d = new Browser();
    await d.start();
    await expect(d.get(`/api/practice/concordance?journeyId=${d.journey.id}&door=light`)).rejects.toMatchObject({ status: 403 });
  });
});

describe('accounts (rule 18.1)', () => {
  it('a guest journey joins the account, and the account journey wins a clash', async () => {
    const first = new Browser();
    await first.start();
    await first.hop('light', 'Genesis 1:3');
    await first.post('/api/account/register', { name: 'abishua', password: 'correct horse' });
    // a second device, playing as a guest on another day
    at('2026-11-17T18:00:00Z');
    const second = new Browser();
    await second.start();
    const r = await second.post<{ player: { name: string }; notices: string[] }>('/api/account/login', { name: 'Abishua', password: 'correct horse' });
    expect(r.player.name).toBe('abishua');
    expect(r.notices).toEqual([]);
    const h = await second.get<HistoryView>('/api/history?tz=America/Chicago');
    expect(h.days.map((d) => d.date)).toEqual(['2026-11-17', '2026-11-16']);
    // a third guest with a journey for the same date: the account's is kept
    const third = new Browser();
    await third.start();
    const clash = await third.post<{ notices: string[] }>('/api/account/login', { name: 'abishua', password: 'correct horse' });
    expect(clash.notices).toHaveLength(1);
    await expect(new Browser().post('/api/account/login', { name: 'abishua', password: 'wrong' })).rejects.toMatchObject({ status: 401 });
  });
});

describe('standings', () => {
  it('ranks finished journeys: home first, then manna, and shows where you landed', async () => {
    at('2026-11-21T18:00:00Z');
    const day = '2026-11-21';
    const loser = new Browser();
    await loser.start();
    for (const typed of ['Jesus wept', 'Pray without ceasing', 'In the beginning God created the heaven and the earth']) await loser.act('hop', { door: 'light', typed, reference: '' });
    await loser.act('grace', { use: false });
    const s = await loser.get<import('../shared/types.ts').StandingsView>(`/api/standings?date=${day}`);
    expect(s.players).toBeGreaterThanOrEqual(1);
    expect(s.you).toMatchObject({ won: false, score: 0 });
    expect(s.lost).toBeGreaterThanOrEqual(1);
    const mine = s.top.find((r) => r.you)!;
    expect(mine.won).toBe(false);
    expect(mine.guest).toBe(true);
    expect(mine.name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z ]+ \d\d$/);
    // another guest finishes and wins: the board shows them, by their guest name, to everyone
    const winner = new Browser();
    await winner.start();
    const wj = game.loadJourney(winner.journey.id)!;
    Object.assign(wj, { status: 'won', manna: 80, finishedAt: game.now() });
    game.saveJourney(wj);
    at('2026-11-21T18:00:10Z'); // past the few seconds the board is cached for
    const after = await loser.get<import('../shared/types.ts').StandingsView>(`/api/standings?date=${day}`);
    expect(after.players).toBe(s.players + 1);
    expect(after.top[0].won).toBe(true);
    expect(after.top[0].guest).toBe(true);
    expect(after.you!.rank).toBeGreaterThan(1);
    expect(after.mean).toBeGreaterThan(0);
    expect(after.scores.length).toBe(after.players);
  });
});

describe('badges are earned again on later days', () => {
  it('Streets of Gold counts twice after two days with a Golden Nugget, once per journey', async () => {
    const b = new Browser();
    for (const day of ['2026-11-23T18:00:00Z', '2026-11-24T18:00:00Z']) {
      at(day);
      await b.start();
      const j = game.loadJourney(b.journey.id)!;
      j.current = verseId('Genesis 2:12'); // stand where a nugget is
      game.saveJourney(j);
      b.journey = (await b.get<{ journey: JourneyView }>(`/api/journey/${j.id}`)).journey;
      const r = await b.hop('bdellium', 'Numbers 11:7', false);
      expect(r.hop!.tier).toBe('nugget');
      const home = await b.act('golden');
      expect(home.kind).toBe('home');
      expect(home.finale!.achievements.find((a) => a.id === 'gold')).toBeDefined();
    }
    const h = await b.get<HistoryView>('/api/history?tz=America/Chicago');
    const gold = h.badges.find((x) => x.id === 'gold')!;
    expect(gold.count).toBe(2);
    expect(gold.firstOn).toBe('2026-11-23');
    expect(gold.earnedOn).toBe('2026-11-24');
    // the finale of an earlier day still lists the badge it earned
    const f = await b.get<FinaleView>('/api/finale?date=2026-11-23');
    expect(f.achievements.some((a) => a.id === 'gold')).toBe(true);
  });
});
