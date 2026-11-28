// How to play (rule 14.8): the rules on one page, in player language.
import type { Tier } from '../../../shared/rules.ts';
import { TIER_NAMES } from '../../../shared/rules.ts';
import { navigate } from '../router.ts';
import { TIER_HINT } from '../theme.ts';
import { press, useDocumentTitle } from '../ui/base.tsx';
import { Icon, TierBadge } from '../ui/icons.tsx';

const TIERS: { tier: Tier; value: number; sample: string }[] = [
  { tier: 'crumb', value: 1, sample: 'the, and, unto' },
  { tier: 'loaf', value: 5, sample: 'God, word, beginning' },
  { tier: 'fish', value: 10, sample: 'light, oil, shepherd' },
  { tier: 'pearl', value: 25, sample: 'Goliath, mustard, Messiah' },
  { tier: 'nugget', value: 50, sample: 'bdellium, Babel, tiller' },
];

export function HowToPlay() {
  useDocumentTitle('How to play');
  return (
    <div className="screen leather">
      <header className="bar bar-top">
        <div className="topbar">
          <button className="icon-btn" onClick={() => { press(); navigate('/'); }} aria-label="Back to today"><Icon name="lookback" size="1.3rem" /></button>
          <div className="title">How to play</div>
        </div>
      </header>
      <div className="page-wrap">
        <div className="sheet-page">
          <p className="eyebrow">The rules on one page</p>
          <h1 className="display" style={{ marginTop: '0.4rem' }}>A daily leap <em>of faith</em></h1>
          <p className="lead">Each day has one home verse. Leave it, hop from verse to verse through the words they share, gather manna, and get back home before your local midnight.</p>

          <div className="steps">
            <div className="step"><b>Tap a word in the verse you stand on.</b><p>That word is your door. Any word except a wall, and each door opens once per verse.</p></div>
            <div className="step"><b>Type, from memory, another verse that contains that word.</b><p>Any translation counts, and a paraphrase is fine. Other forms of the word count too: love, loves, loved, loveth.</p></div>
            <div className="step"><b>Add the reference for a bonus.</b><p>Exact verse doubles the manna. Right chapter: one and a half times. Right book: a quarter more.</p></div>
            <div className="step"><b>Visit 3 different verses and gather 50 manna.</b><p>Then come home through a word your home verse shares. Not a crumb, and not the word you left home by.</p></div>
            <div className="step"><b>Arriving home wins the day.</b><p>Your homecoming word pays twice its value again: the Fatted Calf.</p></div>
          </div>

          <h2 className="display">Manna, the <em>points</em></h2>
          <div className="tier-table">
            {TIERS.map((t) => (
              <div key={t.tier} className={`tier-row tier-${t.tier}`}>
                <TierBadge tier={t.tier} size={38} />
                <div>
                  <b>{TIER_NAMES[t.tier]}</b>
                  <span className="d">{TIER_HINT[t.tier]}</span>
                  <div className="sample small muted" style={{ textDecoration: 'none', marginTop: '0.15rem' }}>{t.sample}</div>
                </div>
                <span className="v">{t.value}</span>
              </div>
            ))}
            <div className="tier-row tier-wall">
              <TierBadge tier="wall" size={38} />
              <div><b>Wall</b><span className="d">{TIER_HINT.wall}</span></div>
              <span className="v">—</span>
            </div>
          </div>

          <div className="card cream" style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
            <TierBadge tier="nugget" size={44} />
            <p><b>Golden Nuggets</b> are words found in just one other verse. Hop through one and the <b>Golden Road</b> opens: one tap takes you straight home, with a feast of 100 manna.</p>
          </div>

          <h2 className="display">Challenges, the <em>extras</em></h2>
          <div className="card cream">
            <p>Now and then a verse carries a challenge. Everyone who reaches that verse on the same day meets the same one.</p>
            <p style={{ marginTop: '0.5rem' }}><b>Double door.</b> One word on the page glows with ×2. Hop through it and that hop&rsquo;s manna is doubled.</p>
            <p style={{ marginTop: '0.5rem' }}><b>Tag-along.</b> You&rsquo;re given a word that isn&rsquo;t in your verse, so it can&rsquo;t be your door. Hop through any other word into a verse that also has it, and that hop&rsquo;s manna is doubled.</p>
          </div>

          <h2 className="display">Lamp oil, the <em>energy</em></h2>
          <div className="card cream">
            <p>Your lamp holds 12 drops. A hop burns 1. Going back to a verse you already visited burns 3. Landing on a verse that mentions oil refills 3. If the oil runs out before you are home, the lamp goes out.</p>
          </div>

          <h2 className="display">Looking <em>back</em></h2>
          <div className="card cream">
            <p>Undo your last hop at any time. You lose what it earned, plus 10 manna for the salt. The oil already burned stays burned.</p>
          </div>

          <h2 className="display">Strikes and <em>Grace</em></h2>
          <div className="card cream">
            <p>Typing a verse that doesn&rsquo;t hold your word is a strike. Three in a row and the rooster crows. A good hop clears them.</p>
            <p style={{ marginTop: '0.6rem' }}>Once a day, Grace can rescue you: it relights the lamp, clears the strikes, pulls you out of a dead end, or wipes a manna debt. Midnight and the 40-hop limit are beyond its reach.</p>
          </div>

          <h2 className="display">How a day <em>ends</em></h2>
          <div className="card cream">
            <p>The day is won when you arrive home. It is lost when your oil runs out, midnight comes, you take 40 hops, you land in a verse with no open doors, you look back while in manna debt, or the rooster crows.</p>
            <p style={{ marginTop: '0.6rem' }}>Manna you bring home is kept as Treasure in Heaven. Manna you don&rsquo;t bring home spoils at midnight.</p>
          </div>

          <h2 className="display">A few more <em>words</em></h2>
          <dl className="glossary card cream">
            <dt>Berean Mode</dt><dd>Hard mode. Each word carries you once a day, and every hop needs a book and chapter.</dd>
            <dt>Sunday School</dt><dd>Practice on any verse, as often as you like. Nothing counts.</dd>
            <dt>Revelation</dt><dd>The day&rsquo;s shared results, once the date has ended everywhere.</dd>
            <dt>Sabbath Rest</dt><dd>One rest day a week that keeps your streak alive.</dd>
            <dt>KJV and WEB</dt><dd>The two wordings the game holds. Every word in either one is a door.</dd>
          </dl>

          <div className="actions">
            <button className="btn big" onClick={() => { press(); navigate('/'); }}>Back to today</button>
          </div>
        </div>
      </div>
    </div>
  );
}
