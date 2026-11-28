// The mini games: their content is true to the text, the rounds are the same for everyone, and the
// server keeps the clock.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BOOKS } from '../shared/books.ts';
import type { BabbleState, BookItState, WhoState } from '../shared/minigames.ts';
import { Game } from '../server/app/game.ts';
import { Db } from '../server/db.ts';
import { setClock } from '../server/game/clock.ts';
import { BABBLE, BIBLE_SAYINGS } from '../server/minigames/babble.ts';
import { BIBLE_NAMES, CHARACTERS } from '../server/minigames/characters.ts';
import { MiniGames, babbleLimit } from '../server/minigames/games.ts';
import { bible, refs } from './helpers.ts';

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

describe('Bible or Babble content', () => {
  it('every Bible saying is word for word in the KJV verse it names', () => {
    for (const b of BIBLE_SAYINGS) {
      const id = refs.parse(b.ref)?.id;
      expect(id, b.ref).toBeDefined();
      expect(norm(bible.text(id!, 'kjv')), `${b.ref}: ${b.text}`).toContain(norm(b.text));
    }
  });

  it('no Babble saying is word for word anywhere in the KJV or the WEB', () => {
    const verses: string[] = [];
    for (let i = 0; i < bible.count; i++) {
      verses.push(norm(bible.text(i, 'kjv')));
      if (bible.has(i, 'web')) verses.push(norm(bible.text(i, 'web')));
    }
    for (const b of BABBLE) {
      const t = norm(b.text);
      if (b.ref) expect(refs.parse(b.ref)?.id, b.ref).toBeDefined();
      // a trimmed misquote is a real piece of its verse with the meaning-giving words cut away
      if (b.trimmed) expect(norm(bible.text(refs.parse(b.ref!)!.id!, 'kjv')), b.text).toContain(t);
      else expect(verses.some((v) => v.includes(t)), b.text).toBe(false);
    }
  });

  it('gives longer sayings more time, from 15 to 30 seconds', () => {
    expect(babbleLimit('Jesus wept.')).toBe(15000);
    expect(babbleLimit('x'.repeat(400))).toBe(30000);
    expect(babbleLimit('x'.repeat(140))).toBe(25000);
  });
});

describe('Who Art Thou? content', () => {
  it('every character has five clues with real references, and no clue names them', () => {
    expect(CHARACTERS.length).toBeGreaterThanOrEqual(50);
    for (const c of CHARACTERS) {
      expect(c.clues, c.name).toHaveLength(5);
      expect(refs.parse(c.cite)?.id, `${c.name} ${c.cite}`).toBeDefined();
      for (const [text, cite] of c.clues) {
        expect(refs.parse(cite)?.id, `${c.name}: ${cite}`).toBeDefined();
        for (const n of [c.name, ...c.aliases]) {
          expect(new RegExp(`\\b${n.replace(/ /g, '\\s+')}\\b`, 'i').test(text), `${c.name} is named in "${text}"`).toBe(false);
        }
      }
      expect(BIBLE_NAMES, c.name).toContain(c.name);
    }
  });
});

describe('the rounds', () => {
  let game: Game;
  let mg: MiniGames;
  const tz = 'America/Chicago';
  const at = (iso: string) => setClock(Date.parse(iso));
  beforeAll(() => {
    at('2026-11-20T15:00:00Z');
    game = new Game({ db: new Db(':memory:'), rateLimit: false, launchDate: '2026-11-16', ruleOverrides: { 'feature.challenges': false } });
    mg = new MiniGames(game);
  });
  afterAll(() => setClock(Date.now()));

  it('are the same for everyone on a day, and never name their own book', () => {
    for (let d = 1; d <= 40; d++) {
      const date = `2026-12-${String(((d - 1) % 28) + 1).padStart(2, '0')}`;
      const v = mg.bookItVerse(date);
      expect(mg.bookItVerse(date)).toBe(v);
      const name = BOOKS[bible.ref(v).book].name.replace(/^\d\s/, '').split(' ').pop()!.replace(/s$/, '');
      expect(new RegExp(`\\b${name}`, 'i').test(bible.text(v, 'kjv'))).toBe(false);
      const items = mg.babbleItems(date);
      expect(items).toHaveLength(5);
      const babble = items.filter((i) => i.kind === 'babble').length;
      expect(babble === 2 || babble === 3).toBe(true);
    }
  });

  it('Book It: a wrong guess points the way, the right one wins, and the clock is the server’s', () => {
    const { player: p } = game.createGuest();
    at('2026-11-20T16:00:00Z');
    const s = mg.start(p, 'bookit', tz) as BookItState;
    expect(s.done).toBe(false);
    const answer = bible.ref(mg.bookItVerse('2026-11-20')).book;
    const wrong = answer === 0 ? 65 : 0;
    at('2026-11-20T16:00:05Z');
    const s2 = mg.answer(p, 'bookit', tz, { book: wrong }) as BookItState;
    expect(s2.guesses[0].dir).toBe(wrong < answer ? 'later' : 'earlier');
    expect(s2.done).toBe(false);
    at('2026-11-20T16:00:09Z');
    const s3 = mg.answer(p, 'bookit', tz, { book: answer }) as BookItState;
    expect(s3.done).toBe(true);
    expect(s3.result!.won).toBe(true);
    expect(s3.answer!.book).toBe(answer);
    // one round a day: starting again shows the same finished round
    expect((mg.start(p, 'bookit', tz) as BookItState).result!.won).toBe(true);

    const { player: late } = game.createGuest();
    at('2026-11-20T17:00:00Z');
    mg.start(late, 'bookit', tz);
    at('2026-11-20T17:00:25Z');
    const l = mg.answer(late, 'bookit', tz, { book: answer }) as BookItState;
    expect(l.done).toBe(true);
    expect(l.result!.won).toBe(false); // the right book, but after the 20 seconds
  });

  it('Who Art Thou?: wrong guesses open clues, "which one" costs nothing, and the name wins', () => {
    const { player: p } = game.createGuest();
    at('2026-11-20T18:00:00Z');
    const s = mg.start(p, 'whoartthou', tz) as WhoState;
    expect(s.clues).toHaveLength(1);
    const c = CHARACTERS[mg.whoCharacter('2026-11-20')];
    const s2 = mg.answer(p, 'whoartthou', tz, { guess: c.name === 'Goliath' ? 'Moses' : 'Goliath' }) as WhoState;
    expect(s2.clues).toHaveLength(2);
    expect(mg.judgeName('mary', CHARACTERS.find((x) => x.name === 'Mary Magdalene')!)).toBe('which');
    expect(mg.judgeName('Zaccheus', CHARACTERS.find((x) => x.name === 'Zacchaeus')!)).toBe('right');
    expect(mg.judgeName('Nicodemos', CHARACTERS.find((x) => x.name === 'Nicodemus')!)).toBe('right');
    at('2026-11-20T18:00:30Z'); // the second clue's 20 seconds are up
    const s3 = mg.answer(p, 'whoartthou', tz, { timeout: true }) as WhoState;
    expect(s3.clues).toHaveLength(3);
    const s4 = mg.answer(p, 'whoartthou', tz, { guess: c.name }) as WhoState;
    expect(s4.done).toBe(true);
    expect(s4.result!.won).toBe(true);
    expect(s4.answer!.name).toBe(c.name);
  });

  it('Bible or Babble: five sayings, each on its own clock, each one revealed', () => {
    const { player: p } = game.createGuest();
    at('2026-11-20T19:00:00Z');
    let s = mg.start(p, 'babble', tz) as BabbleState;
    const items = mg.babbleItems('2026-11-20');
    let t = Date.parse('2026-11-20T19:00:00Z');
    for (let i = 0; i < 5; i++) {
      const truth = items[i].kind === 'babble' ? 'babble' : 'bible';
      t += i === 2 ? 40_000 : 3000; // the third answer comes too late
      setClock(t);
      s = mg.answer(p, 'babble', tz, { index: i, choice: truth }) as BabbleState;
      expect(s.answers[i].reveal.answer).toBe(truth);
      if (i < 4) {
        expect(s.revealing).toBe(true);
        setClock((t += 60_000)); // reading the reveal for a minute costs nothing
        s = mg.answer(p, 'babble', tz, { action: 'next' }) as BabbleState;
        expect(s.current).toBeDefined();
      }
    }
    expect(s.done).toBe(true);
    expect(s.answers.map((a) => a.right)).toEqual([true, true, false, true, true]);
    expect(s.result!.line).toBe('4 of 5 right.');
  });

  it('the action games keep only results that could have happened', () => {
    const { player: p } = game.createGuest();
    at('2026-11-20T20:00:00Z');
    mg.start(p, 'loaves', tz);
    at('2026-11-20T20:00:03Z');
    const r = mg.finish(p, 'loaves', tz, { fed: 99999, baskets: 40 });
    expect(r.done).toBe(true);
    expect(r.result!.line).toContain('12 of 12 baskets');
    expect(r.result!.line).not.toContain('99,999');
  });
});
