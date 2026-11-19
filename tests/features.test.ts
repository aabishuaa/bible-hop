// Golden Nuggets, the Golden Road, the badges and the standings.
import { describe, expect, it } from 'vitest';
import { goldenRoadHome } from '../server/game/engine.ts';
import { earned } from '../server/game/finale.ts';
import { Player, W, fresh, lexicon, text, tick, verseId } from './helpers.ts';

describe('Golden Nuggets and the Golden Road', () => {
  it('a word found in exactly one other verse is a Golden Nugget worth 50', () => {
    const f = lexicon.familyOfWord('bdellium')!;
    expect(f.verses.length).toBe(2);
    expect(lexicon.tier(f, W.rules)).toBe('nugget');
    expect(lexicon.tier(lexicon.familyOfWord('Messiah')!, W.rules)).toBe('pearl'); // 4 verses: still a Pearl
  });

  it('hopping through one opens the Golden Road, which takes you straight home', async () => {
    const p = new Player(fresh());
    p.j.current = verseId('Genesis 2:12');
    const r = await p.to('bdellium', 'Numbers 11:7');
    expect(r.kind).toBe('hop');
    expect(r.hop!.tier).toBe('nugget');
    expect(r.hop!.manna).toBe(50);
    expect(r.notes.map((n) => n.code)).toContain('hop.nugget');
    expect(p.j.goldenRoad).toBe(verseId('Numbers 11:7'));
    const home = goldenRoadHome(W, p.j, tick());
    expect(home.kind).toBe('home');
    expect(p.j.status).toBe('won');
    expect(home.hop!.calf).toBe(100);
    expect(p.j.manna).toBe(150);
    const badges = earned(W, p.j, 1, false);
    expect(badges).toEqual(expect.arrayContaining(['gold', 'prodigal']));
  });

  it('the road closes when you hop on, and after looking back', async () => {
    const p = new Player(fresh());
    p.j.current = verseId('Genesis 2:12');
    await p.to('bdellium', 'Numbers 11:7');
    p.lookBack();
    expect(p.j.goldenRoad).toBeUndefined();
    expect(goldenRoadHome(W, p.j, tick()).kind).toBe('refuse');
  });
});

describe('badges', () => {
  const won = (refs: string[], tier: 'loaf' | 'fish', gateAt?: number) => {
    const j = fresh('Psalm 119:105');
    const verses = [j.home, ...refs.map(verseId), j.home];
    j.path = verses.slice(1).map((to, i) => ({ n: i + 1, from: verses[i], to, fromRef: '', toRef: '', doorWord: 'w', family: 'w', forms: [], tier, base: 5, refText: '', refScore: 'none', multiplier: 1, manna: 5, oil: 1, revisit: false, widow: 0, home: i === refs.length, calf: 0, how: 'match', at: 0 }));
    j.status = 'won';
    j.gateOpenedAt = gateAt;
    return j;
  };

  it('Daily Bread, Prodigal\u2019s Return and The Law and the Prophets', () => {
    const j = won(['Psalm 18:33', 'Genesis 1:7', 'Psalm 23:2'], 'loaf', 3);
    expect(earned(W, j, 1, false)).toEqual(expect.arrayContaining(['bread', 'law', 'prodigal']));
    expect(earned(W, j, 1, false)).not.toContain('covenant');
    // coming home a hop later than you could is not a Prodigal's Return
    expect(earned(W, won(['Psalm 18:33', 'Genesis 1:7', 'Psalm 23:2'], 'loaf', 2), 1, false)).not.toContain('prodigal');
  });

  it('Fishers of Men, and no testament badge for a trip across both', () => {
    const b = earned(W, won(['John 1:5', 'Genesis 1:3', 'Matthew 5:14'], 'fish'), 1, false);
    expect(b).toContain('fishers');
    expect(b).not.toContain('law');
    expect(b).not.toContain('covenant');
  });
});
