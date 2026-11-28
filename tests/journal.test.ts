// The Journal (kept verses, notes, go-to verses), the Desk's top ten, and the Sunday School allowance.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Game } from '../server/app/game.ts';
import { Db } from '../server/db.ts';
import { setClock } from '../server/game/clock.ts';
import { verseId } from './helpers.ts';

const tz = 'America/Chicago';
let game: Game;
beforeAll(() => {
  setClock(Date.parse('2026-11-20T15:00:00Z'));
  game = new Game({ db: new Db(':memory:'), rateLimit: false, launchDate: '2026-11-16', ruleOverrides: { 'feature.challenges': false } });
});
afterAll(() => setClock(Date.now()));

describe('the Journal', () => {
  it('keeps verses with notes, and lets them go', () => {
    const { player: p } = game.createGuest();
    const john = verseId('John 3:16');
    game.journal.save(p.id, { verse: john, source: 'page' });
    expect(game.journal.saved(p.id)).toEqual([john]);
    expect(game.journal.save(p.id, { verse: john, note: 'For God so loved' }).note).toBe('For God so loved');
    const v = game.journal.view(p.id, 'kjv');
    expect(v.bookmarks[0]).toMatchObject({ verse: john, ref: 'John 3:16', note: 'For God so loved' });
    expect(v.bookmarks[0].text).toContain('only begotten Son');
    game.journal.remove(p.id, john);
    expect(game.journal.saved(p.id)).toEqual([]);
    expect(() => game.journal.save(p.id, { verse: 999999 })).toThrow();
  });

  it('counts the verses a player hops to, and ranks them', async () => {
    const { player: p } = game.createGuest();
    const start = game.startPractice(p, tz, { verse: 'Psalm 119:105' });
    const r = await game.hop(p, { journeyId: start.id, version: start.version, door: 'light', typed: 'And God said, Let there be light: and there was light.', reference: 'Genesis 1:3' });
    expect(r.kind).toBe('hop');
    const v = game.journal.view(p.id, 'kjv');
    expect(v.totals).toMatchObject({ hops: 1, verses: 1 });
    expect(v.top[0]).toMatchObject({ verse: verseId('Genesis 1:3'), count: 1, rank: 1 });
    expect(v.top[0].everyoneRank).toBe(1);
    // and the Desk's top ten sees it too
    expect(game.journal.mostUsed('all', '2026-11-20', '2026-11-14')[0]).toMatchObject({ ref: 'Genesis 1:3', count: 1, players: 1 });
    // a look back takes the hop, and its count, away again
    await game.lookBack(p, { journeyId: start.id, version: r.journey.version });
    expect(game.journal.view(p.id, 'kjv').totals.hops).toBe(0);
  });

  it('comes along when a guest signs in to an account', () => {
    const { player: acct } = game.createGuest();
    game.register(acct, { name: 'journaler', password: 'a good long password' });
    const { player: guest } = game.createGuest();
    game.journal.save(guest.id, { verse: verseId('Psalm 23:1'), note: 'kept as a guest' });
    game.login(game.playerById(guest.id), { name: 'journaler', password: 'a good long password' });
    expect(game.journal.view(acct.id, 'kjv').bookmarks.map((b) => b.note)).toEqual(['kept as a guest']);
  });
});

describe('the Sunday School allowance', () => {
  it('gives ten journeys free, and none after that unless the player has Plus', () => {
    const { player: p } = game.createGuest();
    for (let i = 0; i < 10; i++) game.startPractice(game.playerById(p.id)!, tz, {});
    const after = game.playerById(p.id)!;
    expect(game.playerView(after, '2026-11-20').practice).toEqual({ used: 10, free: 10, left: 0 });
    expect(() => game.startPractice(after, tz, {})).toThrow(/free Sunday School journeys/);
    game.db.run('UPDATE players SET plus = 1 WHERE id = ?', p.id);
    const plus = game.playerById(p.id)!;
    expect(game.playerView(plus, '2026-11-20').practice.left).toBeNull();
    expect(game.startPractice(plus, tz, {}).kind).toBe('practice');
  });
});
