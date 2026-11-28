// The Bible Hopping wordmark: "Bible" in a flowing italic tucked above "HOPPING", whose O is a
// red ball. On arrival the letters hop in place in a wave. Every so often the ball leaves the O,
// bounces across the tops of the letters (each one dips as it lands) and hops home again; while it
// is away a faint ring keeps the O. Tapping the logo sends it off at once. The small version's
// ball hops in place when the player hops.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { haptics } from '../fx/haptics.ts';
import { sound } from '../fx/sound.ts';
import { isReducedMotion } from '../prefs.ts';

const LETTERS = ['H', 'O', 'P', 'P', 'I', 'N', 'G'];
/** Routes the ball can take, by letter index (the O is 1). Each ends back at the O. */
const ROUTES = [
  [2, 4, 6],
  [3, 5],
  [0, 2, 3, 5],
  [6, 4, 2],
  [2, 3, 4, 5, 6],
];

export function Ball({ className = '' }: { className?: string }) {
  return (
    <span className={`logo-ball ${className}`} aria-hidden="true">
      <span className="ball-body"><i /></span>
      <span className="ball-shadow" />
    </span>
  );
}

/** Sends the ball across the given letters and home, with a dip on each letter it lands on. */
function tour(wrap: HTMLElement, stops: number[], loud: boolean): Promise<void> {
  const letters = [...wrap.querySelectorAll<HTMLElement>('.lh')];
  const ball = wrap.querySelector<HTMLElement>('.lo .ball-body');
  const shadow = wrap.querySelector<HTMLElement>('.lo .ball-shadow');
  if (!ball || !shadow || letters.length < 7) return Promise.resolve();
  const fs = parseFloat(getComputedStyle(wrap).fontSize);
  const home = ball.getBoundingClientRect();
  const baseline = letters[1].getBoundingClientRect().bottom; // the O's box sits on the baseline
  const capTop = baseline - fs * 0.69;
  const at = (k: number) => {
    if (k === 1) return { x: 0, y: 0 };
    const r = letters[k].getBoundingClientRect();
    return { x: r.left + r.width / 2 - (home.left + home.width / 2), y: capTop - home.height + fs * 0.03 - home.top };
  };
  const path = [1, ...stops, 1];
  type F = { t: number; x: number; y: number; sx: number; sy: number };
  const frames: F[] = [{ t: 0, x: 0, y: 0, sx: 1, sy: 1 }];
  const landings: { k: number; t: number }[] = [];
  let t = 0;
  for (let i = 1; i < path.length; i++) {
    const a = at(path[i - 1]), b = at(path[i]);
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const last = i === path.length - 1;
    const dur = 300 + dist * (last ? 1.5 : 1.25);
    const lift = fs * (0.26 + Math.min(0.5, dist / fs) * 0.22) + Math.max(0, a.y - b.y) * 0.4;
    // crouch, then the arc, then the squash on landing and a little settle
    frames.push({ t: t + 70, x: a.x, y: a.y, sx: 1.12, sy: 0.86 });
    const N = 10;
    for (let s = 1; s <= N; s++) {
      const u = s / N;
      const x = a.x + (b.x - a.x) * u;
      const y = a.y + (b.y - a.y) * u - lift * 4 * u * (1 - u);
      const st = u < 0.5 ? 1 + 0.08 * Math.sin(u * Math.PI) : 1;
      frames.push({ t: t + 70 + dur * u, x, y, sx: 1 / st, sy: st });
    }
    t += 70 + dur;
    landings.push({ k: path[i], t });
    frames.push({ t: t + 70, x: b.x, y: b.y, sx: 1.2, sy: 0.8 });
    frames.push({ t: t + 170, x: b.x, y: b.y - fs * 0.02, sx: 0.97, sy: 1.04 });
    frames.push({ t: t + 260, x: b.x, y: b.y, sx: 1, sy: 1 });
    t += last ? 260 : 330;
  }
  const total = t;
  const anim = ball.animate(
    frames.map((f) => ({ offset: Math.min(1, f.t / total), transform: `translate(${f.x.toFixed(1)}px, ${f.y.toFixed(1)}px) scale(${f.sx.toFixed(3)}, ${f.sy.toFixed(3)})` })),
    { duration: total, easing: 'linear' },
  );
  // the shadow stays on the floor by the O: it fades while the ball is up on the letters
  shadow.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0.15, transform: 'scale(0.6)', offset: 0.12 }, { opacity: 0.15, transform: 'scale(0.6)', offset: 0.85 }, { opacity: 1, transform: 'scale(1)' }], { duration: total });
  wrap.classList.add('touring');
  for (const l of landings) {
    if (l.k !== 1) {
      letters[l.k].animate([{ transform: 'none' }, { transform: 'translateY(0.05em) scale(1.06, 0.88)', offset: 0.35 }, { transform: 'none' }], { duration: 340, delay: l.t - 20, easing: 'ease-out' });
    }
    if (loud) {
      window.setTimeout(() => {
        sound.door(l.k === 1 ? 'loaf' : 'crumb');
        haptics.play(l.k === 1 ? 14 : 6);
      }, l.t);
    }
  }
  return anim.finished.then(() => wrap.classList.remove('touring')).catch(() => wrap.classList.remove('touring'));
}

type Dot = { x: number; y: number; r: number; o: number };

/** The dotted path of the ball's last hop: from above the G, over the space beside "Bible", down
 *  into the O. Measured from the letters, so it fits whatever size the wordmark is set at. */
function trailDots(btn: HTMLElement, hop: HTMLElement): Dot[] {
  const letters = [...hop.querySelectorAll<HTMLElement>('.lh')];
  const ball = hop.querySelector<HTMLElement>('.lo .ball-body');
  const bible = btn.querySelector<HTMLElement>('.logo-bible');
  if (!ball || !bible || letters.length < 7) return [];
  const box = btn.getBoundingClientRect();
  const fs = parseFloat(getComputedStyle(hop).fontSize);
  const rel = (r: DOMRect) => ({ l: r.left - box.left, t: r.top - box.top, r: r.right - box.left, b: r.bottom - box.top, w: r.width, h: r.height });
  const g = rel(letters[6].getBoundingClientRect());
  const o = rel(ball.getBoundingClientRect());
  const bi = rel(bible.getBoundingClientRect());
  const baseline = rel(letters[1].getBoundingClientRect()).b;
  const capTop = baseline - fs * 0.69;
  const cx = o.l + o.w / 2, cy = o.t + o.h / 2, rad = o.w / 2;
  const S = { x: g.l + g.w * 0.45, y: capTop - fs * 0.1 };
  const ang = (-52 * Math.PI) / 180;
  const E = { x: cx + Math.cos(ang) * rad * 1.45, y: cy + Math.sin(ang) * rad * 1.45 };
  const peak = bi.t + bi.h * 0.42;
  const yc = (8 * peak - S.y - E.y) / 6;
  const C1 = { x: S.x - (S.x - E.x) * 0.12, y: yc };
  const C2 = { x: E.x + (S.x - E.x) * 0.3, y: yc };
  const at = (t: number) => {
    const u = 1 - t;
    return { x: u * u * u * S.x + 3 * u * u * t * C1.x + 3 * u * t * t * C2.x + t * t * t * E.x, y: u * u * u * S.y + 3 * u * u * t * C1.y + 3 * u * t * t * C2.y + t * t * t * E.y };
  };
  // walk the curve in small steps and drop a dot every `gap` pixels
  const gap = fs * 0.17;
  const dots: Dot[] = [];
  let prev = at(0), run = gap;
  const pad = fs * 0.06;
  for (let i = 1; i <= 400; i++) {
    const t = i / 400, p = at(t);
    run += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
    if (run < gap) continue;
    run = 0;
    const inBible = p.x > bi.l - pad && p.x < bi.r + pad && p.y > bi.t + bi.h * 0.18 - pad && p.y < bi.b - bi.h * 0.12 + pad;
    if (inBible) continue;
    dots.push({ x: p.x, y: p.y, r: fs * (0.026 + 0.03 * t), o: 0.3 + 0.62 * t });
  }
  return dots;
}

export function Logo({ size = 'hero', hopKey, tagline }: { size?: 'hero' | 'mini'; hopKey?: number; tagline?: string }) {
  const [wave, setWave] = useState(() => (isReducedMotion() ? 0 : 1));
  const [hop, setHop] = useState(0);
  const [dots, setDots] = useState<Dot[]>([]);
  const hopRef = useRef<HTMLSpanElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const busy = useRef(false);
  const route = useRef(0);

  const go = useCallback(async (loud: boolean) => {
    const wrap = hopRef.current;
    if (!wrap || busy.current || isReducedMotion() || document.visibilityState !== 'visible') return;
    busy.current = true;
    const stops = ROUTES[route.current++ % ROUTES.length];
    await tour(wrap, stops, loud);
    busy.current = false;
  }, []);

  // now and then the ball goes for a hop around the word
  useEffect(() => {
    if (size !== 'hero' || isReducedMotion()) return;
    let timer = window.setTimeout(function next() {
      void go(false);
      timer = window.setTimeout(next, 8500);
    }, 3200);
    return () => window.clearTimeout(timer);
  }, [size, go]);

  // the hop trail beside "Bible", re-measured whenever the wordmark changes size
  useLayoutEffect(() => {
    if (size !== 'hero') return;
    const btn = btnRef.current;
    if (!btn) return;
    const measure = () => {
      const h = hopRef.current;
      if (h && !h.classList.contains('touring')) setDots(trailDots(btn, h));
    };
    measure();
    void document.fonts?.ready.then(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(btn);
    return () => ro.disconnect();
  }, [size]);

  useEffect(() => {
    if (hopKey === undefined || hopKey === 0 || isReducedMotion()) return;
    setHop((h) => h + 1);
  }, [hopKey]);

  const label = 'Bible Hopping';
  if (size === 'mini') {
    return (
      <span className="logo mini" role="img" aria-label={label}>
        <span className="logo-bible">Bible</span>
        <span className="logo-hop" aria-hidden="true">
          {LETTERS.map((l, i) => (i === 1 ? <span key={`o${hop}`} className={`lh lo ${hop ? 'jump' : ''}`}><Ball /></span> : <span key={i} className="lh">{l}</span>))}
        </span>
      </span>
    );
  }
  return (
    <button
      ref={btnRef}
      type="button"
      className="logo hero"
      aria-label={label}
      onClick={() => {
        sound.unlock();
        if (busy.current) {
          setWave((w) => w + 1);
          haptics.play([8, 40, 8]);
        } else void go(true);
      }}
    >
      {dots.length > 0 && (
        <svg className="hop-trail" aria-hidden="true">
          {dots.map((d, i) => <circle key={i} cx={d.x.toFixed(1)} cy={d.y.toFixed(1)} r={d.r.toFixed(2)} style={{ opacity: d.o, animationDelay: `${700 + i * 45}ms` }} />)}
        </svg>
      )}
      <span className="logo-bible">Bible</span>
      <span ref={hopRef} className={`logo-hop ${wave ? 'wave' : ''}`} key={wave} aria-hidden="true">
        {LETTERS.map((l, i) => (i === 1
          ? <span key={i} className="lh lo" style={{ ['--i' as string]: i }}><Ball /></span>
          : <span key={i} className="lh" style={{ ['--i' as string]: i }}>{l}</span>))}
      </span>
      {tagline && <span className="logo-tag">{tagline}</span>}
    </button>
  );
}
