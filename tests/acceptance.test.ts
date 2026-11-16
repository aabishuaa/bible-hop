// Section 21 of the directive: the acceptance tests, numbered as they are there.
// Unless a test says otherwise it starts a fresh journey on Psalm 119:105 with the default rule set.
import { describe, expect, it } from 'vitest';
import { cordCount, doorState } from '../server/game/engine.ts';
import type { AiCheck } from '../server/game/engine.ts';
import { buildShare } from '../server/game/finale.ts';
import { Player, W, bible, fresh, lexicon, text, verseId } from './helpers.ts';

const fam = (w: string) => lexicon.familyOfWord(w)!;

/** The worked example of section 2, up to Hebrews 4:12 (manna 50). */
async function exampleToHebrews(): Promise<Player> {
  const p = new Player(fresh());
  await p.to('light', 'Genesis 1:3', true);
  await p.hop('God', 'Jesus wept');
  await p.to('God', 'Genesis 1:1', true);
  await p.to('beginning', 'John 1:1', true);
  await p.home('Word');
  await p.hop('God', text('Hebrews 4:12'), 'Hebrews 4:12');
  return p;
}

describe('acceptance tests (directive section 21)', () => {
  it('1: light to Genesis 1:3 with the exact reference', async () => {
    const p = new Player(fresh());
    const r = await p.hop('light', 'And God said, Let there be light: and there was light.', 'Genesis 1:3');
    expect(r.kind).toBe('hop');
    expect(p.at).toBe('Genesis 1:3');
    expect(r.hop!.manna).toBe(20); // Fish 10 x 2
    expect(p.j.manna).toBe(20);
    expect(p.j.oil).toBe(11);
    // light is closed in both verses
    expect(doorState(W, p.j, p.j.home, fam('light'))).toBe('used');
    expect(doorState(W, p.j, verseId('Genesis 1:3'), fam('light'))).toBe('used');
  });

  it('2: another wording, no reference', async () => {
    const p = new Player(fresh());
    const r = await p.hop('light', "God said, 'Let there be light,' and there was light");
    expect(r.kind).toBe('hop');
    expect(p.at).toBe('Genesis 1:3');
    expect(r.hop!.manna).toBe(10);
  });

  it("3: lamp to Matthew 25:8 as lamps, and Widow's Oil caps at 12", async () => {
    const p = new Player(fresh());
    const r = await p.hop('lamp', 'Give us of your oil; for our lamps are gone out');
    expect(r.kind).toBe('hop');
    expect(p.at).toBe('Matthew 25:8');
    expect(r.hop!.forms).toContain('lamps');
    expect(r.hop!.manna).toBe(10);
    expect(r.hop!.widow).toBe(1); // 11 -> 12, the cap
    expect(p.j.oil).toBe(12);
  });

  it('4: John 11:35 has no God: strike 1, nothing else changes', async () => {
    const p = new Player(fresh());
    await p.to('light', 'Genesis 1:3', true);
    const before = { manna: p.j.manna, oil: p.j.oil, hops: p.j.hopsTaken, at: p.at };
    const r = await p.hop('God', 'Jesus wept');
    expect(r.kind).toBe('strike');
    expect(r.message!.text).toContain('Strike 1 of 3');
    expect(p.j.strikes).toBe(1);
    expect({ manna: p.j.manna, oil: p.j.oil, hops: p.j.hopsTaken, at: p.at }).toEqual(before);
  });

  it('5: home too soon is refused by the Threefold Cord, with no strike and no oil', async () => {
    const p = new Player(fresh());
    await p.to('light', 'Genesis 1:3', true);
    const r = await p.home('and');
    expect(r.kind).toBe('refuse');
    expect(r.message!.code).toBe('refuse.cord');
    expect(r.message!.text).toContain('2 more verses');
    expect(p.j.strikes).toBe(0);
    expect(p.j.oil).toBe(11);
  });

  it('6: no crumbs at the Strait Gate', async () => {
    const p = new Player(fresh());
    await p.to('light', 'Genesis 1:3');
    await p.to('God', 'Genesis 1:1');
    await p.to('beginning', 'John 1:1');
    expect(p.j.manna).toBe(20);
    const r = await p.home('and');
    expect(r.message!.code).toBe('refuse.crumb');
  });

  it('7: the Strait Gate needs 50 manna', async () => {
    const p = new Player(fresh());
    await p.to('light', 'Genesis 1:3');
    await p.to('God', 'Genesis 1:1');
    await p.to('beginning', 'John 1:1');
    const r = await p.home('Word');
    expect(r.message!.code).toBe('refuse.manna');
    expect(r.message!.text).toContain('You have 20');
    expect(p.j.strikes).toBe(0);
    expect(p.j.oil).toBe(9);
  });

  it('8: a used door cannot be chosen again', async () => {
    const p = new Player(fresh());
    await p.to('light', 'Genesis 1:3', true);
    const r = await p.to('light', 'Matthew 5:14');
    expect(r.message!.code).toBe('refuse.exit');
    // and neither can another form of it
    expect(doorState(W, p.j, p.j.current, fam('lights'))).toBe('used');
  });

  it('9: a door already used in the destination is refused, at home too', async () => {
    const p = new Player(fresh());
    await p.to('light', 'Genesis 1:3', true);
    await p.to('God', 'Genesis 1:1', true);
    await p.to('earth', 'Psalm 24:1', true);
    await p.to('world', 'Matthew 5:14', true);
    expect(p.at).toBe('Matthew 5:14');
    expect(p.j.manna).toBe(60);
    let r = await p.to('light', 'Genesis 1:3');
    expect(r.message!.code).toBe('refuse.entry');
    r = await p.home('light');
    expect(r.message!.code).toBe('refuse.entryHome');
    expect(p.j.strikes).toBe(0);
  });

  it('10: a revisit burns 3 drops', async () => {
    const p = new Player(fresh());
    await p.to('light', 'Genesis 1:3');
    expect(p.j.oil).toBe(11);
    await p.to('God', 'Genesis 1:1');
    expect(p.j.oil).toBe(10);
    await p.to('heaven', 'Genesis 1:14');
    expect(p.j.oil).toBe(9);
    const r = await p.to('said', 'Genesis 1:3');
    expect(r.kind).toBe('hop');
    expect(r.hop!.revisit).toBe(true);
    expect(p.j.oil).toBe(6);
    expect(p.j.manna).toBe(25);
  });

  it('11: looking back', async () => {
    const p = new Player(fresh());
    await p.to('light', 'Genesis 1:3');
    await p.to('God', 'Genesis 1:1');
    await p.to('heaven', 'Genesis 1:14');
    await p.to('said', 'Genesis 1:3');
    const r = p.lookBack();
    expect(r.kind).toBe('lookback');
    expect(p.at).toBe('Genesis 1:14');
    expect(p.j.manna).toBe(10); // 25 - 5 - 10
    expect(p.j.oil).toBe(6);
    expect(p.j.hopsTaken).toBe(4);
    expect(doorState(W, p.j, p.j.current, fam('said'))).toBe('open');
    expect(doorState(W, p.j, verseId('Genesis 1:3'), fam('said'))).toBe('open');
  });

  it('12: debt, then Famine, and Grace sets manna to 0', async () => {
    const p = new Player(fresh());
    await p.to('and', 'Genesis 1:2');
    expect(p.j.manna).toBe(1);
    p.lookBack();
    expect(p.j.manna).toBe(-10);
    expect(p.at).toBe('Psalm 119:105');
    await p.to('and', 'Genesis 1:2');
    expect(p.j.manna).toBe(-9);
    const r = p.lookBack();
    expect(r.kind).toBe('grace');
    expect(p.j.pending).toMatchObject({ type: 'grace', losses: ['famine'] });
    p.grace(true);
    expect(p.j.manna).toBe(0);
    expect(p.j.status).toBe('playing');
  });

  it('13: the lamp goes out, and Grace relights it with 3 drops', async () => {
    const p = new Player(fresh());
    p.j.current = verseId('Psalm 78:19');
    p.j.oil = 1;
    const r = await p.to('God', 'Genesis 1:1');
    expect(p.j.oil).toBe(0);
    expect(r.kind).toBe('grace');
    expect(p.j.pending).toMatchObject({ type: 'grace', losses: ['lamp'] });
    p.grace(true);
    expect(p.j.oil).toBe(3);
    expect(p.at).toBe('Genesis 1:1');
    expect(p.j.gracesLeft).toBe(0);
  });

  it("14: Widow's Oil comes before the lamp check", async () => {
    const p = new Player(fresh());
    p.j.current = verseId('Psalm 78:19');
    p.j.oil = 1;
    const r = await p.hop('table', 'Thou preparest a table before me in the presence of mine enemies');
    expect(r.kind).toBe('hop');
    expect(p.at).toBe('Psalm 23:5');
    expect(p.j.oil).toBe(3);
    expect(p.j.pending).toBeNull();
  });

  it('15: coming home on the last drop', async () => {
    const p = await exampleToHebrews();
    expect(p.at).toBe('Hebrews 4:12');
    expect(p.j.manna).toBe(50);
    p.j.oil = 1;
    const r = await p.home('word');
    expect(r.kind).toBe('home');
    expect(p.j.status).toBe('won');
    expect(p.j.oil).toBe(0);
    expect(p.j.manna).toBe(65);
  });

  it('16: the 40th hop must be the homecoming', async () => {
    const p = new Player(fresh());
    p.j.hopsTaken = 39;
    const r = await p.to('light', 'Genesis 1:3');
    expect(r.kind).toBe('lost');
    expect(p.j.status).toBe('lost');
    expect(p.j.loss).toBe('wilderness');
    expect(p.j.pending).toBeNull(); // no Grace offered
    expect(p.j.gracesLeft).toBe(1);
  });

  it('17: three wrong verses in a row and the rooster crows', async () => {
    const p = new Player(fresh());
    expect((await p.hop('lamp', 'Jesus wept')).kind).toBe('strike');
    expect((await p.hop('lamp', 'In the beginning God created the heaven and the earth')).kind).toBe('strike');
    const r = await p.hop('lamp', 'Pray without ceasing');
    expect(r.kind).toBe('grace');
    expect(p.j.pending).toMatchObject({ type: 'grace', losses: ['rooster'] });
    p.grace(true);
    expect(p.j.strikes).toBe(0);
    expect(p.j.status).toBe('playing');
  });

  it('18: swallowed by the fish, and Grace returns the player with the hop\'s manna removed', async () => {
    const p = new Player(fresh());
    const thess = verseId('1 Thessalonians 5:17');
    p.j.current = verseId('Genesis 1:2');
    p.j.visits[thess] = 1;
    p.j.doors[thess] = ['pray', fam('ceasing').key];
    p.j.manna = 30;
    let r = await p.hop('without', 'Pray without ceasing');
    expect(r.kind).toBe('grace');
    expect(r.hop!.revisit).toBe(true);
    expect(r.hop!.oil).toBe(3);
    expect(p.j.oil).toBe(9);
    expect(p.j.pending).toMatchObject({ type: 'grace', losses: ['fish'] });
    r = p.grace(true);
    expect(p.at).toBe('Genesis 1:2');
    expect(p.j.manna).toBe(30); // the crumb's 1 manna is removed, with no salt
    expect(p.j.looksBack).toBe(0);
  });

  it('19: a translation gap is no hop and no strike', async () => {
    const p = new Player(fresh());
    p.j.current = verseId('John 1:41');
    const r = await p.hop('Messiah', 'You are the Messiah, the Son of the living God', 'Matthew 16:16');
    expect(r.kind).toBe('gap');
    expect(r.message!.text).toContain('Matthew 16:16');
    expect(p.j.strikes).toBe(0);
    expect(p.at).toBe('John 1:41');
  });

  it('20: a refrain asks for the reference, and the reference then earns the exact bonus', async () => {
    const p = new Player(fresh());
    p.j.current = verseId('Psalm 23:6');
    let r = await p.hop('mercy', 'for his mercy endureth for ever');
    expect(r.kind).toBe('ask');
    expect(r.message!.code).toBe('ask.refrain');
    r = await p.hop('mercy', 'for his mercy endureth for ever', 'Psalm 136:1');
    expect(r.kind).toBe('hop');
    expect(p.at).toBe('Psalm 136:1');
    expect(r.hop!.refScore).toBe('exact');
    expect(r.hop!.manna).toBe(r.hop!.base * 2);
  });

  it('21: only a reference in the verse box asks for the words, with no strike', async () => {
    const p = new Player(fresh());
    const r = await p.hop('light', 'John 3:16');
    expect(r.kind).toBe('ask');
    expect(r.message!.code).toBe('ask.refOnly');
    expect(p.j.strikes).toBe(0);
  });

  it('22: spake and spoke are forms of speak', async () => {
    const p = new Player(fresh());
    p.j.current = verseId('1 Samuel 3:9');
    const r = await p.hop('Speak', 'And the LORD spake unto Moses, saying', 'Exodus 14:1');
    expect(r.kind).toBe('hop');
    expect(p.at).toBe('Exodus 14:1');
    expect(r.hop!.forms).toEqual(expect.arrayContaining(['spake', 'spoke']));
  });
});

describe('the worked example of section 2', () => {
  it('plays out exactly as written', async () => {
    const p = new Player(fresh());
    let r = await p.to('light', 'Genesis 1:3', true);
    expect([p.j.manna, p.j.oil]).toEqual([20, 11]);
    r = await p.hop('God', 'Jesus wept');
    expect(r.kind).toBe('strike');
    expect([p.j.manna, p.j.oil, p.j.strikes]).toEqual([20, 11, 1]);
    r = await p.to('God', 'Genesis 1:1', true);
    expect([p.j.manna, p.j.oil, p.j.strikes]).toEqual([30, 10, 0]);
    r = await p.to('beginning', 'John 1:1', true);
    expect([p.j.manna, p.j.oil]).toEqual([40, 9]);
    expect(cordCount(p.j)).toBe(3);
    r = await p.home('Word');
    expect(r.message!.code).toBe('refuse.manna');
    expect([p.j.manna, p.j.oil, p.j.strikes]).toEqual([40, 9, 0]);
    r = await p.hop('God', 'For the word of God is quick, and powerful', 'Hebrews 4:12');
    expect(r.kind).toBe('hop');
    expect([p.j.manna, p.j.oil]).toEqual([50, 8]);
    r = await p.home('word');
    expect(r.kind).toBe('home');
    expect(r.hop!.manna).toBe(5); // no reference bonus at home
    expect(r.hop!.calf).toBe(10); // the Fatted Calf
    expect([p.j.manna, p.j.oil]).toEqual([65, 7]);
    expect(buildShare(W, p.j)).toBe('Bible Hopping #1  \u{1F3E0}\u{1F41F}\u{1F35E}\u{1F35E}\u{1F35E}\u{1F35E}\u{1F3E0}\n5 hops · 65 manna · \u{1FA94} 7/12');
  });

  it('step 6 would be refused in Berean Mode: God has already carried the player once', async () => {
    const p = new Player(fresh('Psalm 119:105', W, 'berean'));
    await p.to('light', 'Genesis 1:3', true);
    await p.to('God', 'Genesis 1:1', true);
    await p.to('beginning', 'John 1:1', true);
    const r = await p.hop('God', text('Hebrews 4:12'), 'Hebrews 4:12');
    expect(r.message!.code).toBe('refuse.repeat');
  });
});

describe('the AI check (rule 5.7)', () => {
  const answering = (ref: string | null, confidence = 0.9): AiCheck => async () => (ref ? { status: 'proposal', ref, confidence } : { status: 'none' });

  it('a paraphrase the game does not hold is proposed, and the player confirms it', async () => {
    const p = new Player(fresh(), W, answering('Jeremiah 29:11'));
    p.j.current = verseId('Psalm 33:11'); // thoughts
    const r = await p.hop('thoughts', 'I know the plans I have in mind for you, plans for welfare and a future with hope');
    expect(['confirm', 'hop']).toContain(r.kind);
    if (r.kind === 'confirm') {
      expect(p.j.pending).toMatchObject({ type: 'confirm' });
      const done = p.confirm(verseId('Jeremiah 29:11'));
      expect(done.kind).toBe('hop');
    }
    expect(p.at).toBe('Jeremiah 29:11');
  });

  it('gibberish is a no-match and a strike once the AI check has answered', async () => {
    const p = new Player(fresh(), W, answering(null));
    const r = await p.hop('light', 'asdf qwer zxcv');
    expect(r.kind).toBe('strike');
    expect(r.message!.code).toBe('strike.nomatch');
    expect(p.j.strikes).toBe(1);
  });

  it('there is no strike when the AI check is unavailable', async () => {
    const p = new Player(fresh(), W, async () => ({ status: 'unavailable' }));
    const r = await p.hop('light', 'asdf qwer zxcv');
    expect(r.kind).toBe('ask');
    expect(r.message!.code).toBe('ask.aiDown');
    expect(p.j.strikes).toBe(0);
  });

  it('a reference spelled out as words does not pass as a recitation', async () => {
    const p = new Player(fresh(), W, answering('John 3:16', 0.95));
    const r = await p.hop('light', 'John three sixteen');
    expect(r.kind).toBe('ask');
    expect(p.j.pending).toBeNull();
    expect(p.at).toBe('Psalm 119:105');
  });

  it('a low-confidence proposal does not count', async () => {
    const p = new Player(fresh(), W, answering('Jeremiah 29:11', 0.4));
    const r = await p.hop('light', 'I know the plans I have in mind for you, plans for welfare and a future with hope');
    expect(r.kind).not.toBe('hop');
    expect(p.j.strikes).toBe(0);
  });

  it('turning a proposal down is never a strike', async () => {
    const p = new Player(fresh(), W, answering('Jeremiah 29:11'));
    p.j.current = verseId('Psalm 33:11');
    const r = await p.hop('thoughts', 'I know the plans I have in mind for you, plans for welfare and a future with hope');
    if (r.kind === 'confirm') {
      const no = p.confirm(null);
      expect(no.kind).toBe('declined');
      expect(p.j.strikes).toBe(0);
      expect(p.at).toBe('Psalm 33:11');
    }
  });
});

describe('sanity', () => {
  it('the example verses are what the directive quotes', () => {
    expect(text('Psalm 119:105')).toBe('Thy word is a lamp unto my feet, and a light unto my path.');
    expect(bible.count).toBe(31102);
  });
});
