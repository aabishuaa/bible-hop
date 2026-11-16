// Sunday School (rule 18.3): practice from a random approved verse or any verse the player picks.
import { useState } from 'react';
import type { FinaleView, JourneyView } from '../../../shared/types.ts';
import { ApiError, api } from '../api.ts';
import { useApp } from '../app-store.ts';
import { navigate } from '../router.ts';
import { PaperCanvas, Torn, press, useDocumentTitle } from '../ui/base.tsx';
import { Icon } from '../ui/icons.tsx';
import { setLastFinale } from './FinaleScreen.tsx';
import { JourneyScreen } from './journey/JourneyScreen.tsx';

export function PracticeScreen({ clockSkew }: { clockSkew: number }) {
  useDocumentTitle('Sunday School');
  const berean = useApp((s) => s.today?.features.berean ?? false);
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
    <div className="screen kraft">
      <Torn side="bottom" depth={14} seed={81} className="band-top">
        <div className="topbar">
          <button className="icon-btn" onClick={() => { press(); navigate('/'); }} aria-label="Back to today"><Icon name="lookback" size="1.3rem" /></button>
          <div className="title">Sunday School</div>
        </div>
      </Torn>
      <div className="page-wrap paper-surface">
        <PaperCanvas seed={14} />
        <div className="sheet-page">
          <p className="eyebrow">Practice</p>
          <h1 className="display" style={{ marginTop: '0.4rem' }}>Play <em>any</em> verse</h1>
          <p className="lead">The same rules as the daily journey, as often as you like. Nothing here counts toward Treasure, streaks or the day&rsquo;s results. One extra help is open here: the Concordance, which lists verses that hold the word you chose.</p>
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
              <button className="btn big" disabled={busy} onClick={() => void start()}>
                <Icon name="lens" size="1.1rem" /> {verse.trim() ? 'Start here' : 'Pick one for me'}
                <span className="chev"><Icon name="hop" size="1rem" strokeWidth={2.4} /></span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
