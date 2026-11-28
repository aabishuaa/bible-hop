// Sunday School (rule 18.3): practice from a random approved verse or any verse the player picks.
// The first journeys are free; after that Infinity mode (Bible Hopping Plus) takes over.
import { useState } from 'react';
import type { FinaleView, JourneyView } from '../../../shared/types.ts';
import { ApiError, api } from '../api.ts';
import { useApp } from '../app-store.ts';
import { navigate } from '../router.ts';
import { press, useDocumentTitle } from '../ui/base.tsx';
import { Icon } from '../ui/icons.tsx';
import { setLastFinale } from './FinaleScreen.tsx';
import { JourneyScreen } from './journey/JourneyScreen.tsx';

export function PracticeScreen({ clockSkew }: { clockSkew: number }) {
  useDocumentTitle('Sunday School');
  const berean = useApp((s) => s.today?.features.berean ?? false);
  const allowance = useApp((s) => s.today?.player.practice);
  const loadToday = useApp((s) => s.loadToday);
  const left = allowance?.left ?? null;
  const out = left === 0;
  const [verse, setVerse] = useState(() => new URLSearchParams(location.search).get('verse') ?? '');
  const [mode, setMode] = useState<'standard' | 'berean'>('standard');
  const [journey, setJourney] = useState<JourneyView | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const start = async () => {
    press();
    setBusy(true);
    setErr('');
    try {
      const r = await api.practiceStart(verse, mode);
      setJourney(r.journey);
      void loadToday();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not start. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (journey) {
    return (
      <JourneyScreen
        key={journey.id}
        initial={journey}
        clockSkew={clockSkew}
        onFinale={(f: FinaleView) => {
          setLastFinale(f);
          setJourney(null);
          navigate('/finale');
        }}
        onExit={() => setJourney(null)}
      />
    );
  }

  return (
    <div className="screen leather">
      <header className="bar bar-top">
        <div className="topbar">
          <button className="icon-btn" onClick={() => { press(); navigate('/'); }} aria-label="Back to today"><Icon name="lookback" size="1.3rem" /></button>
          <div className="title">Sunday School</div>
        </div>
      </header>
      <div className="page-wrap">
        <div className="sheet-page">
          <p className="eyebrow">Practice</p>
          <h1 className="display" style={{ marginTop: '0.4rem' }}>Play <em>any</em> verse</h1>
          <p className="lead">The same rules as the daily journey. Nothing here counts toward Treasure, streaks or the day&rsquo;s results. One extra help is open here: the Concordance, which lists verses that hold the word you chose.</p>
          {allowance && (
            left === null ? (
              <div className="allowance plus"><Icon name="sparkle" /> <span><b>Infinity mode</b> is on: practise as often as you like.</span></div>
            ) : (
              <div className={`allowance ${out ? 'out' : ''}`}>
                <span className="allow-pips" aria-hidden="true">{Array.from({ length: allowance.free }, (_, i) => <i key={i} className={i < allowance.used ? 'used' : ''} />)}</span>
                <span><b>{left}</b> of {allowance.free} free practice {allowance.free === 1 ? 'journey' : 'journeys'} left</span>
              </div>
            )
          )}
          {out ? (
            <div className="card infinity-card">
              <div className="inf-mark" aria-hidden="true">∞</div>
              <h2 className="display">Infinity <em>mode</em></h2>
              <p>You&rsquo;ve used your {allowance?.free} free Sunday School journeys. Infinity mode, coming with <b>Bible Hopping Plus</b>, lets you practise on any verse without limit, and opens the mini games every day.</p>
              <p className="small muted" style={{ marginTop: '0.6rem' }}>The daily journey stays free for everyone, always.</p>
              <div className="actions">
                <button className="btn big gold" disabled>Coming soon</button>
                <button className="btn ghost" onClick={() => { press(); navigate('/'); }}>Back to today&rsquo;s journey</button>
              </div>
            </div>
          ) : (
          <div className="card cream">
            <label className="field-label" htmlFor="practice-verse">Start from a verse (leave empty for a random one)</label>
            <input id="practice-verse" className="field" placeholder="e.g. John 3:16" value={verse} onChange={(e) => setVerse(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void start(); }} />
            {berean && (
              <div className="set-row" style={{ borderBottom: 0, paddingBottom: 0 }}>
                <div className="txt"><b>Berean Mode</b><span>Each word carries you once; every hop needs a reference.</span></div>
                <label className="switch"><input type="checkbox" checked={mode === 'berean'} onChange={(e) => setMode(e.target.checked ? 'berean' : 'standard')} aria-label="Berean Mode" /><span /></label>
              </div>
            )}
            {err && <div className="msg-line warn" style={{ marginTop: '0.6rem' }}>{err}</div>}
            <div className="actions">
              <button className="btn big gold" disabled={busy} onClick={() => void start()}>
                <Icon name="lens" size="1.1rem" /> {verse.trim() ? 'Start here' : 'Pick one for me'}
                <span className="chev"><Icon name="hop" size="1rem" strokeWidth={2.4} /></span>
              </button>
            </div>
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
