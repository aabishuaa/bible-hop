// History (rule 14.6): a calendar of past days with their results, Treasure in Heaven and the streak.
import { useEffect, useMemo, useState } from 'react';
import type { DayResult, HistoryView } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { navigate } from '../router.ts';
import { press, useDocumentTitle } from '../ui/base.tsx';
import { Icon } from '../ui/icons.tsx';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out.reverse();
}

export function HistoryScreen() {
  useDocumentTitle('History');
  const [h, setH] = useState<HistoryView | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api.history().then(setH).catch((e) => setErr(e.message));
  }, []);
  const byDate = useMemo(() => new Map((h?.days ?? []).map((d) => [d.date, d])), [h]);
  const today = h?.days[0]?.date ?? new Date().toISOString().slice(0, 10);
  const first = h?.days[h.days.length - 1]?.date ?? today;
  const months = useMemo(() => monthsBetween(first.slice(0, 7) + '-01', today), [first, today]);
  return (
    <div className="screen leather">
      <header className="bar bar-top">
        <div className="topbar">
          <button className="icon-btn" onClick={() => { press(); navigate('/'); }} aria-label="Back to today"><Icon name="lookback" size="1.3rem" /></button>
          <div className="title">History</div>
        </div>
      </header>
      <div className="page-wrap">
        <div className="sheet-page">
          {err && <p className="lead">{err}</p>}
          {h && (
            <>
              <div className="tally" style={{ marginTop: 0 }}>
                <div className="stat"><span className="n"><Icon name="streak" />{h.player.streak}</span><span className="l">Streak</span></div>
                <div className="stat"><span className="n"><Icon name="treasure" />{h.player.treasure.toLocaleString()}</span><span className="l">Treasure</span></div>
                <div className="stat"><span className="n">{h.player.wins}<small style={{ fontSize: '0.9rem', color: 'var(--ink-3)' }}>/{h.player.played}</small></span><span className="l">Days won</span></div>
              </div>
              <p className="small muted">Best streak: {h.player.bestStreak} {h.player.bestStreak === 1 ? 'day' : 'days'}. {h.player.restDay >= 0 ? `Your rest day is ${h.player.restDay === 0 ? 'Sunday' : 'Saturday'}: missing it keeps your streak.` : 'You have no rest day set.'}</p>
              {months.map((ym) => (
                <Month key={ym} ym={ym} byDate={byDate} today={today} launch={h.launchDate} />
              ))}
              <div className="actions" style={{ marginTop: '1.4rem' }}>
                <button className="btn ghost" onClick={() => { press(); navigate('/achievements'); }}><Icon name="medal" size="1rem" /> Badges and milestones</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Month({ ym, byDate, today, launch }: { ym: string; byDate: Map<string, DayResult>; today: string; launch: string }) {
  const [y, m] = ym.split('-').map(Number);
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const name = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return (
    <div>
      <div className="cal-month">{name}</div>
      <div className="cal" role="grid" aria-label={name}>
        {DOW.map((d, i) => <div key={i} className="dow" aria-hidden="true">{d}</div>)}
        {Array.from({ length: firstDow }, (_, i) => <div key={`b${i}`} className="day blank" />)}
        {Array.from({ length: days }, (_, i) => {
          const date = `${ym}-${String(i + 1).padStart(2, '0')}`;
          const r = byDate.get(date);
          const future = date > today || date < launch;
          const cls = r ? r.status : future ? 'blank' : 'missed';
          const clickable = r && (r.status === 'won' || r.status === 'lost');
          const label = r ? `${date}: ${r.status === 'won' ? `home with ${r.manna} manna` : r.status === 'lost' ? 'not home' : r.status === 'rest' ? 'rest day' : r.status === 'playing' ? 'still open' : 'missed'}` : date;
          return (
            <button key={date} className={`day ${cls} ${date === today ? 'today' : ''}`} disabled={!clickable} aria-label={label} onClick={() => { press(); navigate(`/finale/${date}`); }}>
              {future ? '' : i + 1}
              {r?.status === 'won' && <Icon name="home" className="ico" strokeWidth={2.6} />}
              {r?.status === 'lost' && <Icon name="moon" className="ico" />}
              {r?.status === 'rest' && <Icon name="moon" className="ico" style={{ opacity: 0.5 }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
