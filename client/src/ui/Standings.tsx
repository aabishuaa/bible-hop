// The day's standings: where you landed among everyone who played, as a distribution and a table.
import { useEffect, useState } from 'react';
import type { StandingsView } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { Icon, TierBadge } from './icons.tsx';

export function Standings({ date, compact = false }: { date: string; compact?: boolean }) {
  const [s, setS] = useState<StandingsView | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api.standings(date).then(setS).catch((e) => setErr(e.message));
  }, [date]);
  if (err) return <p className="small muted">{err}</p>;
  if (!s) return <p className="small muted">Counting the manna…</p>;
  if (!s.players) return <p className="small muted">No one has finished this day yet. Be the first.</p>;
  const max = Math.max(1, ...s.bins.map((b) => b.count), s.lost);
  const topPct = s.you ? Math.max(1, Math.round((100 * s.you.rank) / s.you.of)) : 0;
  return (
    <div className="standings card cream">
      {s.you && (
        <div className="st-hero">
          <div className="st-rank">
            <span className="st-top">{s.you.of > 1 ? `Top ${topPct}%` : '#1'}</span>
            <span className="small muted">#{s.you.rank} of {s.you.of} {s.you.of === 1 ? 'player' : 'players'}</span>
          </div>
          <p className="st-line">{s.you.of > 1 ? <>You did better than <b>{s.you.better}%</b> of players today.</> : <>You&rsquo;re the first to finish today.</>}</p>
        </div>
      )}
      <div className="st-chart" role="img" aria-label={`Manna brought home: ${s.bins.map((b) => `${b.count} players with ${b.from} to ${b.to}`).join(', ')}; ${s.lost} did not make it home.`}>
        {s.bins.map((b, i) => {
          const mine = s.you?.bin === i;
          return (
            <div key={i} className={`st-col ${mine ? 'mine' : ''}`}>
              {mine && <span className="st-you"><Icon name="home" size={12} strokeWidth={2.6} /> You</span>}
              <span className="st-bar" style={{ height: `${Math.max(4, (b.count / max) * 100)}%` }}><i>{b.count}</i></span>
              <span className="st-label">{b.from}</span>
            </div>
          );
        })}
        {s.lost > 0 && (
          <div className={`st-col lost ${s.you && !s.you.won ? 'mine' : ''}`}>
            {s.you && !s.you.won && <span className="st-you">You</span>}
            <span className="st-bar" style={{ height: `${Math.max(4, (s.lost / max) * 100)}%` }}><i>{s.lost}</i></span>
            <span className="st-label"><Icon name="moon" size={11} /></span>
          </div>
        )}
      </div>
      <p className="st-axis small muted">Manna brought home{s.lost > 0 ? ' · the dark bar did not make it home' : ''}</p>
      {!compact && (
        <ol className="st-list">
          {s.top.map((r) => (
            <li key={`${r.rank}-${r.name}`} className={r.you ? 'you' : ''}>
              <span className={`st-place p${Math.min(r.rank, 4)}`}>{r.rank <= 3 ? <Icon name="trophy" size={15} /> : r.rank}</span>
              <span className="st-name">{r.you ? 'You' : r.name}</span>
              <span className="st-tiers" aria-hidden="true">{r.tiers.slice(0, 7).map((t, i) => <TierBadge key={i} tier={t} size={14} />)}</span>
              <span className="st-num tabular">{r.won ? r.manna : <Icon name="moon" size={14} />}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="st-note small muted">Ranked by who made it home, then manna, then oil left, then fewest hops.</p>
    </div>
  );
}
