// The big moments: a Golden Nugget found, and coming home through the father's door.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FinaleView } from '../../../../shared/types.ts';
import { haptics } from '../../fx/haptics.ts';
import { sound } from '../../fx/sound.ts';
import { isReducedMotion } from '../../prefs.ts';
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

/** Lays a fading veil of the doorway's light over whatever comes next, so the light carries into the finale. */
function carryLight(): void {
  const veil = document.createElement('div');
  veil.className = 'light-veil';
  document.body.appendChild(veil);
  veil.addEventListener('animationend', () => veil.remove(), { once: true });
  window.setTimeout(() => veil.remove(), 1500);
}

/**
 * Coming home: the father's door, over the page. It swings open, light bursts through and spills
 * across the floor, the welcome and the manna rise in the light, and then the light fills the
 * screen and carries into the finale.
 */
export function HomeCelebration({ finale, onDone }: { finale: FinaleView; onDone: () => void }) {
  const [shown, setShown] = useState(0);
  const total = useCountTo(shown, 1300);
  const [leaving, setLeaving] = useState(false);
  const done = useRef(false);
  const finish = useCallback(() => {
    if (done.current) return;
    done.current = true;
    carryLight();
    onDone();
  }, [onDone]);
  useEffect(() => {
    const reduced = isReducedMotion();
    sound.creak(0.15);
    haptics.play([12, 60, 8]);
    const t = [
      window.setTimeout(() => { sound.swell(); sound.home(0.15); haptics.home(); }, reduced ? 0 : 650),
      window.setTimeout(() => setShown(finale.manna), reduced ? 100 : 1250),
      window.setTimeout(() => { if (finale.achievements.some((x) => x.badge)) { sound.achievement(); haptics.play([10, 40, 18]); } }, 2500),
      window.setTimeout(() => setLeaving(true), reduced ? 2600 : 3700),
      window.setTimeout(finish, reduced ? 2800 : 4250),
    ];
    return () => t.forEach((x) => window.clearTimeout(x));
  }, [finale, finish]);
  const motes = useMemo(() => Array.from({ length: 14 }, (_, i) => ({ left: 30 + ((i * 37) % 40), delay: 0.9 + (i % 7) * 0.35, dur: 3 + ((i * 13) % 10) / 5, size: 2 + (i % 3) })), []);
  const golden = finale.path[finale.path.length - 1]?.how === 'golden';
  return (
    <div className={`homecoming ${leaving ? 'leaving' : ''}`} onPointerDown={finish} role="status" aria-label={`Welcome home. ${finale.manna} manna.`}>
      <div className="hm-dim" />
      <div className="hm-stage">
        <div className="hm-glow" />
        <div className="hm-rays" />
        <div className="hm-door">
          <div className="hm-light">
            {motes.map((m, i) => <i key={i} className="hm-mote" style={{ left: `${m.left}%`, width: m.size, height: m.size, animationDelay: `${m.delay}s`, animationDuration: `${m.dur}s` }} />)}
          </div>
          <div className="hm-leaf left"><i className="hm-ring" /></div>
          <div className="hm-leaf right"><i className="hm-ring" /></div>
          <div className="hm-arch" />
        </div>
        <div className="hm-spill" />
        <div className="hm-text">
          <p className="hm-eyebrow">The day is won</p>
          <h1 className="hm-title">Welcome <em>home</em></h1>
          <div className="hm-manna"><Icon name="manna" size={26} /> <span className="tabular">{total}</span> <small>manna</small></div>
          {finale.calf > 0 && <p className="hm-sub">The Fatted Calf adds {finale.calf}{golden ? ' by the Golden Road' : ''}</p>}
          {finale.achievements.filter((a) => a.badge).map((a) => (
            <div key={a.id} className="hm-badge"><Icon name={a.icon ?? 'sparkle'} size={18} /> {(a.count ?? 1) > 1 ? 'Badge earned again:' : 'New badge:'} <b>{a.name}</b>{(a.count ?? 1) > 1 ? ` \u00d7${a.count}` : ''}</div>
          ))}
        </div>
      </div>
      <div className="hm-flood" />
    </div>
  );
}
