// The day's standings, live: a bell curve of everyone's score with a line where you landed,
// and the top of the board. Guests show by their guest name, the same for everyone.
import { useEffect, useRef, useState } from 'react';
import type { StandingsView } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { Icon, TierBadge } from './icons.tsx';

const REFRESH_MS = 8000;

/** Polls the board while it is on screen, so it fills in as more people finish. */
function useLiveStandings(date: string): { s: StandingsView | null; err: string } {
  const [s, setS] = useState<StandingsView | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let dead = false;
    let timer = 0;
    const load = () => {
      if (document.visibilityState !== 'visible') return schedule();
      api.standings(date).then((v) => { if (!dead) { setS(v); setErr(''); } }).catch((e) => { if (!dead) setErr(e.message); }).finally(schedule);
    };
    const schedule = () => {
      if (!dead) timer = window.setTimeout(load, REFRESH_MS);
    };
    load();
    const onShow = () => {
      if (document.visibilityState === 'visible') {
        window.clearTimeout(timer);
        load();
      }
    };
    document.addEventListener('visibilitychange', onShow);
    return () => {
      dead = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, [date]);
  return { s, err };
}

const W = 600, H = 210, PAD_L = 14, PAD_R = 14, BASE = 170, TOP = 34;

/** A normal curve fitted to the day's scores, the players you beat shaded, and a line at your score. */
function BellCurve({ s }: { s: StandingsView }) {
  const sd = Math.max(s.sd, 8);
  const maxScore = s.scores.length ? s.scores[s.scores.length - 1] : 0;
  const lo = 0;
  const hi = Math.max(maxScore, s.mean + 3 * sd, 60);
  const x = (v: number) => PAD_L + ((v - lo) / (hi - lo)) * (W - PAD_L - PAD_R);
  const pdf = (v: number) => Math.exp(-0.5 * ((v - s.mean) / sd) ** 2);
  const pts: [number, number][] = [];
  for (let i = 0; i <= 96; i++) {
    const v = lo + ((hi - lo) * i) / 96;
    pts.push([x(v), BASE - pdf(v) * (BASE - TOP)]);
  }
  const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ');
  const area = `${line} L${x(hi)} ${BASE} L${x(lo)} ${BASE} Z`;
  const you = s.you ? x(s.you.score) : null;
  const youY = s.you ? BASE - pdf(s.you.score) * (BASE - TOP) : 0;
  const ticks = [0, Math.round(s.mean), Math.round(hi)].filter((v, i, a) => a.indexOf(v) === i);
  // label positions stay inside the chart
  const labelX = you === null ? 0 : Math.min(W - 70, Math.max(70, you));
  return (
    <svg className="bell" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={s.you ? `A bell curve of today's scores. You scored ${s.you.score}, better than ${s.you.better}% of players.` : "A bell curve of today's scores."}>
      <defs>
        <linearGradient id="bell-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6e3c0" stopOpacity="0.26" />
          <stop offset="1" stopColor="#f6e3c0" stopOpacity="0.03" />
        </linearGradient>
        <linearGradient id="bell-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f2c94c" stopOpacity="0.9" />
          <stop offset="1" stopColor="#d49a12" stopOpacity="0.35" />
        </linearGradient>
        {you !== null && (
          <clipPath id="bell-beaten">
            <rect x="0" y="0" width={you} height={H} />
          </clipPath>
        )}
      </defs>
      <path d={area} fill="url(#bell-fill)" />
      {you !== null && <path d={area} fill="url(#bell-gold)" clipPath="url(#bell-beaten)" className="bell-beaten" />}
      <path d={line} fill="none" stroke="#e3bc6c" strokeWidth="2.5" strokeLinejoin="round" />
      {/* every player, as a tick on the baseline */}
      <g className="bell-rug">
        {s.scores.map((v, i) => <line key={i} x1={x(v)} x2={x(v)} y1={BASE + 3} y2={BASE + 10} />)}
      </g>
      <line x1={PAD_L} x2={W - PAD_R} y1={BASE} y2={BASE} stroke="rgba(255,226,180,0.3)" strokeWidth="1.5" />
      {ticks.map((v) => (
        <text key={v} x={x(v)} y={BASE + 26} textAnchor={v === 0 ? 'start' : v === Math.round(hi) ? 'end' : 'middle'} className="bell-tick">{v === Math.round(s.mean) && v !== 0 ? `avg ${v}` : v}</text>
      ))}
      {you !== null && s.you && (
        <g className="bell-you">
          <line x1={you} x2={you} y1={TOP - 10} y2={BASE} stroke="#fdf1da" strokeWidth="2.5" strokeDasharray="5 4" />
          <circle cx={you} cy={youY} r="6.5" fill="#f2c94c" stroke="#2a140a" strokeWidth="2.5" />
          <g transform={`translate(${labelX}, ${TOP - 16})`}>
            <rect x="-58" y="-18" width="116" height="26" rx="13" fill="#f2cf7e" />
            <text x="0" y="0" textAnchor="middle" className="bell-you-label">You · {s.you.score}</text>
          </g>
        </g>
      )}
    </svg>
  );
}

export function Standings({ date, compact = false }: { date: string; compact?: boolean }) {
  const { s, err } = useLiveStandings(date);
  const prev = useRef<number | null>(null);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!s) return;
    if (prev.current !== null && s.players !== prev.current) {
      setFlash(true);
      const t = window.setTimeout(() => setFlash(false), 1200);
      prev.current = s.players;
      return () => window.clearTimeout(t);
    }
    prev.current = s.players;
  }, [s]);
  if (err && !s) return <p className="small muted">{err}</p>;
  if (!s) return <p className="small muted">Counting the manna…</p>;
  return (
    <div className="standings card cream">
      <div className="st-live">
        <span className="live-dot" aria-hidden="true" /> Live
        <span className={`st-count ${flash ? 'flash' : ''}`}>{s.players} finished{s.playing ? ` · ${s.playing} still hopping` : ''}</span>
      </div>
      {s.you ? (
        <div className="st-hero">
          <span className="st-top">{s.you.of > 1 ? `${s.you.better}%` : '#1'}</span>
          <p className="st-line">{s.you.of > 1 ? <>You did better than <b>{s.you.better}%</b> of players today</> : <>You&rsquo;re the first to finish today</>}</p>
          <span className="small muted">#{s.you.rank} of {s.you.of}{s.you.won ? '' : ' · your manna spoiled, so you score 0'}</span>
        </div>
      ) : (
        <p className="st-line" style={{ textAlign: 'center' }}>Finish today&rsquo;s journey to see where you land.</p>
      )}
      {s.players > 0 ? <BellCurve s={s} /> : <p className="small muted" style={{ textAlign: 'center', padding: '1.5rem 0' }}>No one has finished yet. Be the first.</p>}
      <p className="st-axis small muted">Manna brought home{s.lost ? ` · ${s.lost} didn’t make it home and score 0` : ''}</p>
      {!compact && s.top.length > 0 && (
        <ol className="st-list">
          {s.top.map((r) => (
            <li key={`${r.rank}-${r.name}`} className={r.you ? 'you' : ''}>
              <span className={`st-place p${Math.min(r.rank, 4)}`}>{r.rank <= 3 ? <Icon name="trophy" size={15} /> : r.rank}</span>
              <span className="st-name"><span>{r.name}{r.you && <em> (you)</em>}</span>{r.guest && <span className="st-guest">guest</span>}</span>
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
