// What every mini game shares: the clock (kept by the server), the ring that shows it, the
// intro card, and the result card with its stamp, its verse and the share.
import { useEffect, useRef, useState } from 'react';
import type { GameInfo, GameResult } from '../../../shared/minigames.ts';
import { useApp } from '../app-store.ts';
import { haptics } from '../fx/haptics.ts';
import { sound } from '../fx/sound.ts';
import { navigate } from '../router.ts';
import { BookmarkButton } from '../ui/Bookmark.tsx';
import { press, timeLeft } from '../ui/base.tsx';
import { Icon } from '../ui/icons.tsx';

export const TONES: Record<string, string> = { bookit: 'loaf', whoartthou: 'pearl', babble: 'crimson', fixyoureyes: 'fish', loaves: 'gold' };

/**
 * A countdown to a moment in server time. `clock()` is the server's time now. It ticks in the last
 * five seconds, and calls `onExpire` once when the time is up.
 */
export function TimerRing({ deadline, total, clock, running, onExpire, size = 64 }: { deadline: number; total: number; clock: () => number; running: boolean; onExpire?: () => void; size?: number }) {
  const [left, setLeft] = useState(() => Math.max(0, deadline - clock()));
  const fired = useRef(false);
  const lastSec = useRef(Math.ceil(left / 1000));
  useEffect(() => {
    fired.current = false;
  }, [deadline]);
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const step = () => {
      const l = Math.max(0, deadline - clock());
      setLeft(l);
      const sec = Math.ceil(l / 1000);
      if (sec !== lastSec.current) {
        lastSec.current = sec;
        if (sec <= 5 && sec > 0) {
          sound.tick(sec <= 3);
          if (sec <= 3) haptics.play(4);
        }
      }
      if (l <= 0) {
        if (!fired.current) {
          fired.current = true;
          sound.timeUp();
          haptics.play([20, 40, 20]);
          onExpire?.();
        }
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [deadline, running, clock, onExpire]);
  const r = 26, c = 2 * Math.PI * r;
  const share = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0;
  const secs = Math.ceil(left / 1000);
  return (
    <div className={`timer ${secs <= 3 ? 'late' : secs <= 5 ? 'warn' : ''} ${running ? '' : 'paused'}`} style={{ width: size, height: size }} role="timer" aria-label={`${secs} seconds left`}>
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r={r} className="t-track" />
        <circle cx="32" cy="32" r={r} className="t-fill" strokeDasharray={c} strokeDashoffset={c * (1 - share)} />
      </svg>
      <b className="tabular">{secs}</b>
    </div>
  );
}

/** The card before a round: what it is, how to play, and the one button that starts the clock. */
export function Intro({ info, onBegin, busy }: { info: GameInfo; onBegin: () => void; busy: boolean }) {
  return (
    <div className="mg-intro">
      <div className={`mg-emblem orb tone-${TONES[info.id]}`}><Icon name={info.icon} /></div>
      <h1 className="display">{info.name}</h1>
      <p className="mg-tagline">{info.tagline}</p>
      {info.cite && <p className="cite">{info.cite}</p>}
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

/** The end of a round: a stamp, the verse to keep, how others did, and the share. */
export function ResultCard({ info, result, nextGame, nextIn, children }: { info: GameInfo; result: GameResult; nextGame?: GameInfo; nextIn?: number; children?: React.ReactNode }) {
  const toast = useApp((s) => s.toast);
  useEffect(() => {
    if (result.won) {
      sound.fanfare(0.1);
      haptics.play([12, 40, 12, 40, 30]);
    } else {
      sound.lose(0.1);
      haptics.play([30]);
    }
  }, [result.won]);
  const canShare = typeof navigator !== 'undefined' && !!navigator.share;
  const copy = async () => {
    press();
    try {
      await navigator.clipboard.writeText(result.share);
      toast('Copied. Paste it anywhere.');
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
  return (
    <div className="mg-result">
      <div className={`mg-stamp ${result.won ? 'won' : 'lost'}`}>
        <div className={`orb tone-${TONES[info.id]}`}><Icon name={result.won ? 'sparkle' : info.icon} /></div>
        <h2 className="display">{result.title}</h2>
      </div>
      <p className="mg-line">{result.line}</p>
      {children}
      {result.verse && (
        <div className="parchment mg-verse">
          <div className="mg-verse-head"><b>{result.verse.ref}</b><BookmarkButton verse={result.verse.id} refLabel={result.verse.ref} source="game" label /></div>
          <p>{result.verse.text}</p>
        </div>
      )}
      <div className="mg-chips">
        {result.streak > 0 && <span className="mg-chip"><Icon name="streak" /> {result.streak} {result.streak === 1 ? 'day' : 'days'} in a row</span>}
        {result.others && result.others.players > 1 && <span className="mg-chip"><Icon name="trophy" /> {result.others.wonPct}% of {result.others.players} players got it</span>}
      </div>
      <div className="sharecard mg-share">
        <pre>{result.share}</pre>
        <div className="btns" style={canShare ? undefined : { gridTemplateColumns: '1fr' }}>
          <button className="btn caramel" onClick={copy}><Icon name="book" size="1rem" /> Copy</button>
          {canShare && <button className="btn caramel" onClick={share}><Icon name="hop" size="1rem" strokeWidth={2.2} /> Share</button>}
        </div>
      </div>
      <div className="actions" style={{ display: 'grid', gap: '0.6rem' }}>
        {nextGame && (
          <button className="btn big gold" onClick={() => { press(); navigate(`/games/${nextGame.id}`); }}>
            Next: {nextGame.name} <span className="chev"><Icon name="hop" size="1rem" strokeWidth={2.4} /></span>
          </button>
        )}
        <button className="btn ghost" onClick={() => { press(); navigate('/games'); }}><Icon name="lookback" size="1rem" /> All of today&rsquo;s games</button>
      </div>
      {nextIn !== undefined && <p className="small muted" style={{ textAlign: 'center', marginTop: '0.8rem' }}>A new round of every game in {timeLeft(nextIn)}.</p>}
    </div>
  );
}
