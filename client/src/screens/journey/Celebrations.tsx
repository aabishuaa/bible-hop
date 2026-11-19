// The big moments: a Golden Nugget found, and coming home.
import { useEffect, useMemo, useState } from 'react';
import type { FinaleView } from '../../../../shared/types.ts';
import { haptics } from '../../fx/haptics.ts';
import { sound } from '../../fx/sound.ts';
import { useCountTo } from '../../ui/base.tsx';
import { Icon } from '../../ui/icons.tsx';

/** "Golden Nugget!" stamped across the page, with gold raining down. */
export function NuggetFlash({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onDone, 2300);
    return () => window.clearTimeout(t);
  }, [onDone]);
  const flakes = useMemo(() => Array.from({ length: 34 }, (_, i) => ({ left: (i * 37) % 100, delay: (i % 9) * 0.07, size: 5 + ((i * 7) % 9), dur: 1.3 + ((i * 13) % 7) / 10 })), []);
  return (
    <div className="nugget-flash" aria-live="polite" onPointerDown={onDone}>
      <div className="nugget-rays" />
      {flakes.map((f, i) => <i key={i} className="flake" style={{ left: `${f.left}%`, width: f.size, height: f.size * 0.7, animationDelay: `${f.delay}s`, animationDuration: `${f.dur}s` }} />)}
      <div className="nugget-stamp">
        <span className="tier-badge tier-nugget" style={{ width: 84, height: 84 }}><Icon name="nugget" size={46} strokeWidth={1.6} /></span>
        <b>Golden Nugget</b>
        <span>The Golden Road home is open</span>
      </div>
    </div>
  );
}

/** Coming home: the light breaks, the house rises, the manna counts up, then the finale. */
export function HomeCelebration({ finale, onDone }: { finale: FinaleView; onDone: () => void }) {
  const [shown, setShown] = useState(0);
  const total = useCountTo(shown, 1300);
  useEffect(() => {
    sound.home(0);
    haptics.home();
    const a = window.setTimeout(() => setShown(finale.manna), 700);
    const b = window.setTimeout(() => {
      sound.achievement();
      haptics.play([10, 40, 18]);
    }, 2100);
    const c = window.setTimeout(onDone, 3600);
    return () => [a, b, c].forEach((t) => window.clearTimeout(t));
  }, [finale.manna, onDone]);
  const confetti = useMemo(() => Array.from({ length: 60 }, (_, i) => ({ left: (i * 53) % 100, delay: 0.3 + (i % 12) * 0.09, dur: 2 + ((i * 17) % 10) / 10, hue: i % 4, rot: (i * 47) % 360 })), []);
  return (
    <div className="home-celebration" onPointerDown={onDone} role="status" aria-label={`Welcome home. ${finale.manna} manna.`}>
      <div className="hc-rays" />
      <div className="hc-glow" />
      {confetti.map((c, i) => <i key={i} className={`hc-confetti c${c.hue}`} style={{ left: `${c.left}%`, animationDelay: `${c.delay}s`, animationDuration: `${c.dur}s`, ['--r' as string]: `${c.rot}deg` }} />)}
      <div className="hc-center">
        <div className="hc-house"><Icon name="home" size={74} strokeWidth={1.8} /></div>
        <p className="hc-eyebrow">The day is won</p>
        <h1 className="hc-title">Welcome <em>home</em></h1>
        <div className="hc-manna"><Icon name="manna" size={30} /> <span className="tabular">{total}</span> <small>manna</small></div>
        {finale.calf > 0 && <p className="hc-sub">The Fatted Calf adds {finale.calf}{finale.path[finale.path.length - 1]?.how === 'golden' ? ' by the Golden Road' : ''}</p>}
        {finale.achievements.filter((a) => a.badge).map((a) => (
          <div key={a.id} className="hc-badge"><Icon name={a.icon ?? 'sparkle'} size={20} /> New badge: <b>{a.name}</b></div>
        ))}
      </div>
    </div>
  );
}
