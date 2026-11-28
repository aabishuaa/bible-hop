// The day's standings, live: a bell curve of the field with a line at the share of players you
// finished ahead of, and the top of the board. Guests show by their guest name, the same for everyone.
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

const W = 720, H = 236, PAD_L = 18, PAD_R = 18, BASE = 222, TOP = 26;
/** How far out the curve is drawn, in standard deviations. The very top and bottom sit at the ends. */
const Z = 2.5;

/** The inverse of the normal curve's running total (Acklam's approximation). */
function invNorm(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - lo) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}
/** Where a share of players beaten (0 to 1) sits along the curve. */
const zOf = (p: number) => (p <= 0 ? -Z : p >= 1 ? Z : Math.max(-Z, Math.min(Z, invNorm(p))));
const xOf = (z: number) => PAD_L + ((z + Z) / (2 * Z)) * (W - PAD_L - PAD_R);
const yOf = (z: number) => BASE - Math.exp(-0.5 * z * z) * (BASE - TOP);

/**
 * The field as a bell curve, read from left (beat nobody) to right (beat everybody). You stand at
 * the share of players you finished ahead of, so the gold under the curve is exactly that share,
 * and the first one home stands at the right-hand end.
 */
function BellCurve({ s }: { s: StandingsView }) {
  const pts: string[] = [];
  for (let i = 0; i <= 120; i++) {
    const z = -Z + (2 * Z * i) / 120;
    pts.push(`${i ? 'L' : 'M'}${xOf(z).toFixed(1)} ${yOf(z).toFixed(1)}`);
  }
  const line = pts.join(' ');
  const area = `${line} L${xOf(Z)} ${BASE} L${xOf(-Z)} ${BASE} Z`;
  const share = s.you ? s.you.better / 100 : null;
  const youZ = share === null ? null : zOf(share);
  const you = youZ === null ? null : xOf(youZ);
  const youY = youZ === null ? 0 : yOf(youZ);
  // every finisher as a tick, spread by rank: the curve's shape is the field's shape
  const m = Math.min(s.players, 160);
  const rug = Array.from({ length: m }, (_, j) => xOf(zOf(m === 1 ? 1 : j / (m - 1))));
  return (
    <div className="bell-wrap">
      {you !== null && s.you && (
        <span className="bell-tag" style={{ left: `${Math.min(86, Math.max(14, (you / W) * 100))}%` }}>You · {s.you.score} manna</span>
      )}
      <svg className="bell" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={s.you ? `You finished ahead of ${s.you.better}% of today's players.` : "Where today's players finished."}>
        <defs>
          <linearGradient id="bell-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff4dc" stopOpacity="0.3" />
            <stop offset="1" stopColor="#fff4dc" stopOpacity="0.04" />
          </linearGradient>
          <linearGradient id="bell-gold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffd866" stopOpacity="0.95" />
            <stop offset="1" stopColor="#d49a12" stopOpacity="0.4" />
          </linearGradient>
          {you !== null && (
            <clipPath id="bell-beaten">
              <rect className="bell-clip" x="0" y="0" height={H} style={{ width: you }} />
            </clipPath>
          )}
        </defs>
        <path d={area} fill="url(#bell-fill)" />
        {you !== null && <path d={area} fill="url(#bell-gold)" clipPath="url(#bell-beaten)" className="bell-beaten" />}
        <path d={line} fill="none" stroke="#f3d084" strokeWidth="3" strokeLinejoin="round" className="bell-line" pathLength={1} vectorEffect="non-scaling-stroke" />
        <g className="bell-rug">{rug.map((x, i) => <line key={i} x1={x} x2={x} y1={BASE + 3} y2={BASE + 12} vectorEffect="non-scaling-stroke" />)}</g>
        <line x1={PAD_L} x2={W - PAD_R} y1={BASE} y2={BASE} stroke="rgba(255,240,215,0.4)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        {you !== null && s.you && (
          <g className="bell-you">
            <line x1={you} x2={you} y1={0} y2={BASE} stroke="#fdf1da" strokeWidth="2" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
            <circle cx={you} cy={youY} r="7" fill="#ffd866" stroke="#2a140a" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
          </g>
        )}
      </svg>
      <div className="bell-ticks" aria-hidden="true"><span>0%</span><span>50%</span><span>100%</span></div>
    </div>
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
  const best = s.scores.length ? s.scores[s.scores.length - 1] : 0;
  return (
    <div className="st-wrap">
    <div className="standings card cream">
      <div className="st-live">
        <span className="live-dot" aria-hidden="true" /> Live
        <span className={`st-count ${flash ? 'flash' : ''}`}>{s.players} finished{s.playing ? ` · ${s.playing} still hopping` : ''}</span>
      </div>
      {s.you ? (
        <div className="st-hero">
          <span className="st-top">{s.you.of > 1 ? `${s.you.better}%` : '#1'}</span>
          <p className="st-line">{s.you.of > 1 ? <>You finished ahead of <b>{s.you.better}%</b> of today&rsquo;s players</> : <>You&rsquo;re the first one home today, ahead of everyone so far</>}</p>
          <span className="small muted">#{s.you.rank} of {s.you.of}{s.you.won ? '' : ' · your manna spoiled, so you score 0'}</span>
        </div>
      ) : (
        <p className="st-line" style={{ textAlign: 'center' }}>Finish today&rsquo;s journey to see where you land.</p>
      )}
      {s.players > 0 ? <BellCurve s={s} /> : <p className="small muted" style={{ textAlign: 'center', padding: '1.5rem 0' }}>No one has finished yet. Be the first.</p>}
      <p className="st-axis small muted">Share of today&rsquo;s players you finished ahead of</p>
      {s.players > 0 && (
        <div className="st-facts">
          <span><b className="tabular">{s.players}</b> finished</span>
          <span><b className="tabular">{Math.round(s.mean)}</b> average manna</span>
          <span><b className="tabular">{best}</b> best</span>
          {s.lost > 0 && <span><b className="tabular">{s.lost}</b> didn&rsquo;t make it home</span>}
        </div>
      )}
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
    </div>
  );
}
