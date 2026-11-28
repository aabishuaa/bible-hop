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
    game.journal.writePage(acct.id, '2026-11-19', 'Written on the account.');
    const { player: guest } = game.createGuest();
    game.journal.save(guest.id, { verse: verseId('Psalm 23:1'), note: 'kept as a guest' });
    game.journal.writePage(guest.id, '2026-11-19', 'Written as a guest.');
    game.journal.writePage(guest.id, '2026-11-18', 'Only the guest wrote here.');
    game.login(game.playerById(guest.id), { name: 'journaler', password: 'a good long password' });
    const v = game.journal.view(acct.id, 'kjv');
    expect(v.bookmarks.map((b) => b.note)).toEqual(['kept as a guest']);
    // a page both wrote on keeps both, the account's first
    expect(v.pages.map((x) => [x.date, x.text])).toEqual([
      ['2026-11-19', 'Written on the account.\n\nWritten as a guest.'],
      ['2026-11-18', 'Only the guest wrote here.'],
    ]);
    expect(v.owner.name).toBe('journaler');
  });

  it('remembers each journey, where it set out and the words it went through', async () => {
    const { player: p } = game.createGuest();
    const start = game.startPractice(p, tz, { verse: 'Psalm 119:105' });
    await game.hop(p, { journeyId: start.id, version: start.version, door: 'light', typed: 'And God said, Let there be light: and there was light.', reference: 'Genesis 1:3' });
    game.journal.save(p.id, { verse: verseId('Genesis 1:3'), source: 'page' });
    const v = game.journalView(game.playerById(p.id)!);
    expect(v.trips).toHaveLength(1);
    expect(v.trips[0]).toMatchObject({ date: '2026-11-20', kind: 'practice', status: 'playing', homeRef: 'Psalm 119:105' });
    expect(v.trips[0].route).toEqual([{ door: 'light', ref: 'Genesis 1:3', tier: v.trips[0].route[0].tier, home: false }]);
    expect(v.bookmarks[0].source).toBe('page');
    expect(v.owner.name).toBeNull();
  });

  it('keeps a page of the player’s own writing for each day, and clears it when emptied', () => {
    const { player: p } = game.createGuest();
    expect(game.journal.writePage(p.id, '2026-11-20', 'The lamp went out, but the word did not.').text).toBe('The lamp went out, but the word did not.');
    game.journal.writePage(p.id, '2026-11-20', 'Changed my mind about what to write.');
    expect(game.journal.view(p.id, 'kjv').pages).toEqual([{ date: '2026-11-20', text: 'Changed my mind about what to write.', updatedAt: expect.any(Number) }]);
    game.journal.writePage(p.id, '2026-11-20', '   ');
    expect(game.journal.view(p.id, 'kjv').pages).toEqual([]);
    expect(() => game.journal.writePage(p.id, 'yesterday', 'x')).toThrow();
    expect(() => game.journal.writePage(p.id, '2026-12-25', 'not yet')).toThrow();
    expect(game.journal.writePage(p.id, '2026-11-21', 'already tomorrow somewhere').date).toBe('2026-11-21');
    expect(game.journal.writePage(p.id, '2026-11-19', 'x'.repeat(5000)).text).toHaveLength(4000);
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
