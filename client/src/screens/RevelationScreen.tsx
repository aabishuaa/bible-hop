// Revelation (rule 18.2): the day's shared results, once the date has ended everywhere.
import { useEffect, useState } from 'react';
import type { RevelationView } from '../../../shared/types.ts';
import { ApiError, api } from '../api.ts';
import { useApp } from '../app-store.ts';
import { navigate } from '../router.ts';
import { niceDate, press, useDocumentTitle } from '../ui/base.tsx';
import { Icon, TierBadge } from '../ui/icons.tsx';
import { TripMap } from './FinaleScreen.tsx';

export function RevelationScreen({ date }: { date: string }) {
  useDocumentTitle('Revelation');
  const books = useApp((s) => s.today?.books ?? []);
  const [r, setR] = useState<RevelationView | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api.revelation(date).then(setR).catch((e) => setErr(e instanceof ApiError ? e.message : 'Could not load Revelation.'));
  }, [date]);
  const route = r?.best?.route.slice(1).map((s, i) => ({ from: r.best!.route[i].position, to: s.position, tier: s.tier ?? 'loaf', home: !!s.home, revisit: !!s.revisit, door: s.door ?? '', fromRef: r.best!.route[i].ref, toRef: s.ref }));
  return (
    <div className="screen leather">
      <header className="bar bar-top">
        <div className="topbar">
          <button className="icon-btn" onClick={() => { press(); navigate('/'); }} aria-label="Back to today"><Icon name="lookback" size="1.3rem" /></button>
          <div className="title">Revelation</div>
        </div>
      </header>
      <div className="page-wrap">
        <div className="sheet-page">
          <p className="eyebrow">{niceDate(date)}</p>
          {err && <><h1 className="display" style={{ marginTop: '0.4rem' }}>Not <em>yet</em></h1><p className="lead">{err}</p></>}
          {r && (
            <>
              <h1 className="display" style={{ marginTop: '0.4rem' }}>Bible Hopping <em>#{r.puzzleNo}</em></h1>
              <p className="lead">Home was <b>{r.homeRef}</b>. {r.players} {r.players === 1 ? 'player' : 'players'} set out; {Math.round(r.winRate * 100)}% made it home.</p>
              {r.place && <p className="pill soft">You placed {r.place.rank} of {r.place.of}</p>}
              {r.best && (
                <>
                  <h2 className="display">The day&rsquo;s best: <em>{r.best.manna} manna</em></h2>
                  <TripMap books={books} route={route} />
                  <pre className="card cream" style={{ fontFamily: 'var(--font-ui)', whiteSpace: 'pre-wrap', fontSize: '0.95rem' }}>{r.best.share}</pre>
                </>
              )}
              <div className="numbers">
                <div className="cell"><div className="k">Most common first door</div><div className="v">{r.firstDoor ?? '—'}</div></div>
                <div className="cell"><div className="k">Most common way home</div><div className="v">{r.homeDoor ?? '—'}</div></div>
                <div className="cell"><div className="k">Rarest way home</div><div className="v">{r.rarestHomeDoor ? <>{r.rarestHomeDoor.word}<small> · {r.rarestHomeDoor.count} verses</small></> : '—'}</div></div>
              </div>
              <p className="small muted"><TierBadge tier="home" size={16} /> Scribes&rsquo; journeys are left out.</p>
            </>
          )}
          <div className="actions"><button className="btn ghost" onClick={() => { press(); navigate('/'); }}>Back to today</button></div>
        </div>
      </div>
    </div>
  );
}
