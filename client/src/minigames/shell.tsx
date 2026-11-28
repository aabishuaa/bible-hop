// What every daily game shares: the clock (kept by the server) and its ring, count-ups and sparks,
// the intro card, and the result: a stamp, your points, your record, how everyone else did today,
// the verse to keep and the share card.
import { useEffect, useRef, useState } from 'react';
import type { GameInfo, GameResult } from '../../../shared/minigames.ts';
import { useApp } from '../app-store.ts';
import { burst } from '../fx/burst.ts';
import { haptics } from '../fx/haptics.ts';
import { sound } from '../fx/sound.ts';
import { isReducedMotion } from '../prefs.ts';
import { navigate } from '../router.ts';
import { BookmarkButton } from '../ui/Bookmark.tsx';
import { press } from '../ui/base.tsx';
import { Icon } from '../ui/icons.tsx';

export const TONES: Record<string, string> = { bookit: 'loaf', whoartthou: 'pearl', babble: 'crimson', fixyoureyes: 'fish', loaves: 'gold' };

/** A shower of gold from the middle of an element. */
export function sparks(el: Element | null | undefined, color = '#f2c94c', n = 26): void {
  if (!el) return;
  const r = el.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, color, n, true);
}

/** A number that rolls up to its value. */
export function useCountUp(target: number, ms = 900, delay = 0): number {
  const [v, setV] = useState(isReducedMotion() ? target : 0);
  useEffect(() => {
    if (isReducedMotion()) {
      setV(target);
      return;
    }
    let raf = 0, last = -1;
    const t0 = performance.now() + delay;
    const step = (now: number) => {
      const u = Math.max(0, Math.min(1, (now - t0) / ms));
      const e = 1 - Math.pow(1 - u, 3);
      const n = Math.round(target * e);
      if (n !== last && u > 0 && u < 1 && n % Math.max(1, Math.round(target / 12)) === 0) sound.count();
      last = n;
      setV(n);
      if (u < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, delay]);
  return v;
}

/** Re-renders every `ms` milliseconds. */
export function useTick(ms: number, on = true): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!on) return;
    const id = window.setInterval(() => setN((x) => x + 1), ms);
    return () => window.clearInterval(id);
  }, [ms, on]);
  return n;
}

/**
 * A countdown to a moment in server time. It ticks in the last five seconds; in the last three a
 * heartbeat sounds and the edges of the screen glow red. `onExpire` is called once.
 */
export function TimerRing({ deadline, total, clock, running, onExpire, size = 68 }: { deadline: number; total: number; clock: () => number; running: boolean; onExpire?: () => void; size?: number }) {
  const [left, setLeft] = useState(() => Math.max(0, deadline - clock()));
  const fired = useRef(false);
  const lastSec = useRef(Math.ceil(left / 1000));
  // kept in a ref, so a new function on each render doesn't restart the clock
  const expire = useRef(onExpire);
  expire.current = onExpire;
  useEffect(() => {
    fired.current = false;
  }, [deadline]);
  useEffect(() => {
    const body = document.body;
    if (!running) {
      body.classList.remove('mg-danger');
      return;
    }
    let raf = 0;
    const step = () => {
      const l = Math.max(0, deadline - clock());
      setLeft(l);
      const sec = Math.ceil(l / 1000);
      body.classList.toggle('mg-danger', sec <= 3 && sec > 0);
      if (sec !== lastSec.current) {
        lastSec.current = sec;
        if (sec <= 5 && sec > 0) sound.tick(sec <= 3);
        if (sec <= 3 && sec > 0) {
          sound.heartbeat();
          haptics.play(6);
        }
      }
      if (l <= 0) {
        body.classList.remove('mg-danger');
        if (!fired.current) {
          fired.current = true;
          sound.timeUp();
          haptics.play([20, 40, 20]);
          expire.current?.();
        }
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      body.classList.remove('mg-danger');
    };
  }, [deadline, running, clock]);
  const r = 27, c = 2 * Math.PI * r;
  const share = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0;
  const secs = Math.ceil(left / 1000);
  return (
    <div className={`timer ${secs <= 3 ? 'late' : secs <= 5 ? 'warn' : ''} ${running ? '' : 'paused'}`} style={{ width: size, height: size }} role="timer" aria-label={`${secs} seconds left`}>
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r={r} className="t-track" />
        <circle cx="32" cy="32" r={r} className="t-fill" strokeDasharray={c} strokeDashoffset={c * (1 - share)} />
      </svg>
      <b key={secs <= 5 ? secs : 'n'} className={`tabular ${secs <= 5 ? 'beat' : ''}`}>{secs}</b>
    </div>
  );
}

/** The card before a round: what it is, how to play, and the one button that starts the clock. */
export function Intro({ info, onBegin, busy, streak }: { info: GameInfo; onBegin: () => void; busy: boolean; streak?: number }) {
  return (
    <div className={`mg-intro tone-${TONES[info.id]}`}>
      <div className="mg-emblem-wrap">
        <div className="mg-rays" aria-hidden="true" />
        <div className={`mg-emblem orb tone-${TONES[info.id]}`}><Icon name={info.icon} /></div>
      </div>
      <h1 className="display">{info.name}</h1>
      <p className="mg-tagline">{info.tagline}</p>
      {info.cite && <p className="cite">{info.cite}</p>}
      {!!streak && streak > 0 && <p className="mg-streak-note"><Icon name="streak" /> {streak} {streak === 1 ? 'day' : 'days'} in a row. Keep it going.</p>}
      <ol className="mg-how">
        {info.how.map((h, i) => <li key={i} style={{ ['--i' as string]: i }}>{h}</li>)}
      </ol>
      <div className="mg-meta">
        <span><Icon name="clock" /> {info.timing}</span>
        <span><Icon name="sparkle" /> One round a day</span>
      </div>
      <button className="btn big gold mg-begin" disabled={busy} onClick={onBegin}>
        <Icon name="hop" size="1.2rem" strokeWidth={2.4} /> Begin
      </button>
      <p className="small muted" style={{ textAlign: 'center' }}>The clock starts when you tap Begin.</p>
    </div>
  );
}

function clockText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function Stat({ value, label, delay, icon }: { value: number; label: string; delay: number; icon?: string }) {
  const v = useCountUp(value, 700, delay);
  return (
    <div className="rs-stat">
      <b className="tabular">{icon && <Icon name={icon} />}{v}</b>
      <span>{label}</span>
    </div>
  );
}

/** How everyone did today: a bar for each result, yours in gold. */
function Spread({ id, rows }: { id: string; rows: GameResult['distribution'] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const total = rows.reduce((n, r) => n + r.count, 0);
  const label = (l: string) => (l === 'X' ? <Icon name="moon" /> : l);
  const unit = id === 'bookit' ? 'Guesses' : id === 'whoartthou' ? 'Clues needed' : 'Right of 5';
  return (
    <div className="rs-spread">
      <div className="rs-spread-head"><b>Today&rsquo;s players</b><span>{unit} · {total} {total === 1 ? 'player' : 'players'}</span></div>
      {rows.map((r, i) => (
        <div key={r.label} className={`rs-row ${r.mine ? 'mine' : ''}`}>
          <span className="rs-label">{label(r.label)}</span>
          <span className="rs-bar"><i style={{ width: `${Math.max(r.count ? 8 : 0, (r.count / max) * 100)}%`, animationDelay: `${300 + i * 70}ms` }} /></span>
          <span className="rs-count tabular">{r.count}</span>
        </div>
      ))}
    </div>
  );
}

/** The end of a round. */
export function ResultCard({ info, result, nextGame, nextIn, children }: { info: GameInfo; result: GameResult; nextGame?: GameInfo; nextIn?: number; children?: React.ReactNode }) {
  const toast = useApp((s) => s.toast);
  const medal = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const score = useCountUp(result.score, 1100, 450);
  const until = useRef(Date.now() + (nextIn ?? 0));
  useEffect(() => {
    until.current = Date.now() + (nextIn ?? 0);
  }, [nextIn]);
  useTick(1000, nextIn !== undefined);
  useEffect(() => {
    sound.stamp(0.05);
    if (result.won) {
      window.setTimeout(() => {
        sound.fanfare();
        sparks(medal.current, '#f2c94c', 34);
      }, 250);
      haptics.play([12, 40, 12, 40, 30]);
    } else {
      sound.lose(0.2);
      haptics.play([30]);
    }
  }, [result.won]);
  const canShare = typeof navigator !== 'undefined' && !!navigator.share;
  const copy = async () => {
    press();
    try {
      await navigator.clipboard.writeText(result.share);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast(result.share);
    }
  };
  const share = async () => {
    press();
    try {
      await navigator.share({ text: result.share });
    } catch {
      /* closed */
    }
  };
  const st = result.stats;
  return (
    <div className={`rs ${result.won ? 'won' : 'lost'}`}>
      <div className="rs-hero">
        <div className="rs-medal-wrap" ref={medal}>
          {result.won && <div className="mg-rays" aria-hidden="true" />}
          <div className={`rs-medal orb tone-${TONES[info.id]}`}><Icon name={result.won ? 'sparkle' : info.icon} /></div>
        </div>
        <h2 className="display">{result.title}</h2>
        <p className="rs-line">{result.line}</p>
        <div className="rs-score"><b className="tabular">{score.toLocaleString()}</b><span>points</span></div>
      </div>
      {children}
      {result.verse && (
        <div className="parchment rs-verse">
          <div className="rs-verse-head"><b>{result.verse.ref}</b><BookmarkButton verse={result.verse.id} refLabel={result.verse.ref} source="game" label /></div>
          <p>{result.verse.text}</p>
        </div>
      )}
      <div className="rs-stats">
        <Stat value={st.played} label="Played" delay={600} />
        <Stat value={st.played ? Math.round((100 * st.won) / st.played) : 0} label="Win %" delay={700} />
        <Stat value={st.streak} label="Streak" delay={800} icon="streak" />
        <Stat value={st.best} label="Best" delay={900} />
      </div>
      {result.distribution.length > 0 && <Spread id={info.id} rows={result.distribution} />}
      <div className="rs-share">
        <pre>{result.share}</pre>
        <div className="rs-share-btns">
          <button className={`btn gold ${copied ? 'copied' : ''}`} onClick={copy}>{copied ? <><Icon name="sparkle" /> Copied!</> : <><Icon name="book" size="1rem" /> Copy result</>}</button>
          {canShare && <button className="btn ghost" onClick={share}><Icon name="hop" size="1rem" strokeWidth={2.2} /> Share</button>}
        </div>
      </div>
      <div className="rs-next">
        {nextGame ? (
          <button className="btn big gold" onClick={() => { press(); navigate(`/games/${nextGame.id}`); }}>
            Next: {nextGame.name} <span className="chev"><Icon name="hop" size="1rem" strokeWidth={2.4} /></span>
          </button>
        ) : (
          <p className="rs-done"><Icon name="sparkle" /> That&rsquo;s every game for today.</p>
        )}
        <button className="btn ghost" onClick={() => { press(); navigate('/games'); }}><Icon name="lookback" size="1rem" /> All of today&rsquo;s games</button>
        {nextIn !== undefined && <p className="rs-countdown">Next round in <b className="tabular">{clockText(until.current - Date.now())}</b></p>}
      </div>
    </div>
  );
}
