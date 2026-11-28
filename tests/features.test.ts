// Golden Nuggets, the Golden Road, the badges, the standings and the challenges.
import { describe, expect, it } from 'vitest';
import { challengeFor } from '../server/game/challenges.ts';
import { goldenRoadHome } from '../server/game/engine.ts';
import { earned } from '../server/game/finale.ts';
import { Player, W, fresh, lexicon, text, tick, verseId, world } from './helpers.ts';

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

describe('challenges', () => {
  const CW = world({ 'feature.challenges': true });
  const home = verseId('Psalm 119:105');
  /** A journey on the first date (from a run of dates) whose home verse carries a challenge of the given kind. */
  const journeyWith = (kind: 'door' | 'tagalong') => {
    for (let d = 1; d <= 120; d++) {
      const date = new Date(Date.UTC(2026, 10, 1) + d * 86_400_000).toISOString().slice(0, 10);
      const j = fresh('Psalm 119:105', CW);
      j.date = date;
      const c = challengeFor(CW, j);
      if (c?.kind === kind) return { j, c };
    }
    throw new Error(`no ${kind} challenge found`);
  };
  /** A verse other than home that holds both families, with enough words to be recognized by its text. */
  const meeting = (a: string, b: string) => {
    const fa = lexicon.family(a)!, fb = lexicon.family(b)!;
    for (const v of fa.verses) if (v !== home && lexicon.verseHas(v, fb) && CW.bible.text(v, 'kjv').split(' ').length >= 8) return v;
    return undefined;
  };

  it('are the same for everyone at the same verse on the same day', () => {
    const { j, c } = journeyWith('door');
    const other = fresh('Psalm 119:105', CW);
    other.date = j.date;
    expect(challengeFor(CW, other)).toEqual(c);
    expect(challengeFor(W, other)).toBeNull(); // and nothing at all with the feature off
  });

  it('a double door doubles the manna of a hop through it, and then closes', async () => {
    const { j, c } = journeyWith('door');
    const fam = lexicon.family(c.family)!;
    const to = [...fam.verses].find((v) => v !== home && CW.bible.text(v, 'kjv').split(' ').length >= 8)!;
    const p = new Player(j, CW);
    const r = await p.hop(c.word, CW.bible.text(to, 'kjv'));
    expect(r.kind).toBe('hop');
    expect(r.hop!.challenge).toMatchObject({ kind: 'door', times: 2 });
    expect(r.hop!.manna).toBe(r.hop!.base * 2);
    expect(r.notes.map((n) => n.code)).toContain('challenge.met');
    // back home after a look back, the door is open again and so is the challenge
    p.lookBack();
    expect(challengeFor(CW, p.j)).toEqual(c);
  });

  it('a tag-along word cannot be a door here, and doubles the manna when the next verse holds it', async () => {
    const { j, c } = journeyWith('tagalong');
    const tag = lexicon.family(c.family)!;
    expect(lexicon.verseHas(home, tag)).toBe(false);
    const doors = lexicon.verseFamilies(home).filter((f) => lexicon.tier(f, CW.rules) !== 'wall' && lexicon.tier(f, CW.rules) !== 'crumb');
    let hopped = false;
    for (const d of doors) {
      const to = meeting(d.key, tag.key);
      if (to === undefined) continue;
      const p = new Player(structuredClone(j), CW);
      const r = await p.hop(lexicon.formsIn(home, d)[0].form, CW.bible.text(to, 'kjv'));
      if (r.kind !== 'hop') continue;
      expect(r.hop!.challenge).toMatchObject({ kind: 'tagalong', word: c.word });
      expect(r.hop!.manna).toBe(r.hop!.base * 2);
      hopped = true;
      break;
    }
    expect(hopped).toBe(true);
  });
});
