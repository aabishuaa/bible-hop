// Loaves and Fishes: the crowd sits on the hillside in groups, by hundreds and by fifties (Mark 6:40).
// When a group raises its hands, tap it to bless and break the bread for them; feed quickly and the
// blessing grows. Then gather up the fragments into twelve baskets, that nothing be lost (John 6:12).
// The hunger of the crowd is drawn from the day's seed, so everyone feeds the same crowd.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActionState } from '../../../shared/minigames.ts';
import { haptics } from '../fx/haptics.ts';
import { sound } from '../fx/sound.ts';
import type { GameProps } from './GamesRoute.tsx';
import { TimerRing } from './shell.tsx';

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FEED_S = 45;
const GATHER_S = 12;
const GOAL = 5000;
const ROBES = ['#8a4b2a', '#5b6e3a', '#7b5a8e', '#2f5d78', '#a8743c', '#8e3b32', '#c9a66b', '#4d4a6e'];

interface Group { x: number; y: number; s: number; size: number; figures: { dx: number; dy: number; c: string }[]; hungryAt: number; until: number; fedAt: number; missedAt: number }
interface Flight { from: { x: number; y: number }; to: { x: number; y: number }; at: number; n: number }
interface Crumb { x: number; y: number; got: boolean; gotAt: number }

export default function LoavesAndFishes({ state, clock, finish }: GameProps<ActionState>) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const taps = useRef<{ x: number; y: number; at: number }[]>([]);
  const drag = useRef<{ x: number; y: number; down: boolean }>({ x: 0, y: 0, down: false });
  const [hud, setHud] = useState({ fed: 0, combo: 0, mult: 1, phase: 'feed' as 'feed' | 'banner' | 'gather' | 'over', baskets: 0, gatherEnds: 0 });
  const sent = useRef(false);

  const end = useCallback((r: { fed: number; baskets: number; best: number }) => {
    if (sent.current) return;
    sent.current = true;
    window.setTimeout(() => void finish(r), 1400);
  }, [finish]);

  useEffect(() => {
    const cv = canvas.current!;
    const box = wrap.current!;
    const ctx = cv.getContext('2d')!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let W = 0, H = 0;
    const r = rng(state.seed);
    // sixteen groups on the hillside, in four ranks; nearer ranks are larger
    const groups: Group[] = [];
    const layout = () => {
      const rows = 4, cols = W > 640 ? 5 : 4;
      groups.length = 0;
      const rr = rng(state.seed ^ 0x51ed27);
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const s = 0.62 + row * 0.16;
          const size = rr() < 0.5 ? 100 : 50;
          const n = size === 100 ? 9 : 5;
          const figures = Array.from({ length: n }, (_, i) => {
            const a = (i / n) * Math.PI * 2 + rr();
            const d = i === 0 && n > 5 ? 0 : 0.55 + rr() * 0.45;
            return { dx: Math.cos(a) * d * 26, dy: Math.sin(a) * d * 13, c: ROBES[Math.floor(rr() * ROBES.length)] };
          });
          groups.push({ x: W * ((col + 0.5) / cols) + (row % 2 ? W * 0.04 : -W * 0.02), y: H * (0.34 + row * 0.13), s, size, figures, hungryAt: -1, until: -1, fedAt: -9, missedAt: -9 });
        }
      }
    };
    const size = () => {
      W = box.clientWidth;
      H = box.clientHeight;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      cv.style.width = `${W}px`;
      cv.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const keep = groups.map((g) => ({ hungryAt: g.hungryAt, until: g.until, fedAt: g.fedAt, missedAt: g.missedAt }));
      layout();
      keep.forEach((k, i) => groups[i] && Object.assign(groups[i], k));
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(box);

    const crumbs: Crumb[] = [];
    const flights: Flight[] = [];
    const t0 = performance.now() - Math.max(0, clock() - state.startedAt);
    let fed = 0, combo = 0, best = 0, baskets = 0, collected = 0;
    let nextHunger = 0.8;
    let phase: 'feed' | 'banner' | 'gather' | 'over' = 'feed';
    let phaseAt = 0;
    let filled = false;
    let lockUntil = 0;
    let hudAt = 0;
    let raf = 0;
    const mult = () => 1 + 0.5 * Math.min(4, Math.floor(combo / 4));
    const basket = () => ({ x: W * 0.5, y: H * 0.93 });

    const frame = (now: number) => {
      const t = (now - t0) / 1000;
      // ------------------------------------------------------------ the rules of the feast
      if (phase === 'feed') {
        const maxHungry = t < 10 ? 2 : t < 25 ? 3 : 4;
        const patience = 2.8 - Math.min(1, t / FEED_S) * 1.0;
        if (t >= nextHunger) {
          const idle = groups.filter((g) => g.hungryAt < 0 && t - g.fedAt > 1.2);
          if (idle.length && groups.filter((g) => g.hungryAt >= 0).length < maxHungry) {
            const g = idle[Math.floor(r() * idle.length)];
            g.hungryAt = t;
            g.until = t + patience;
          }
          nextHunger = t + 0.45 + r() * 0.5;
        }
        for (const g of groups) {
          if (g.hungryAt >= 0 && t > g.until) {
            g.hungryAt = -1;
            g.missedAt = t;
            combo = 0;
            sound.refuse();
          }
        }
        for (const tap of taps.current.splice(0)) {
          // after tapping a group that wasn't hungry, the hands rest a moment: watch, don't spam
          if (t < lockUntil) continue;
          let hit: Group | null = null, bestD = Infinity;
          for (const g of groups) {
            const d = Math.hypot(tap.x - g.x, tap.y - g.y);
            if (d < 38 * g.s + 12 && d < bestD) {
              hit = g;
              bestD = d;
            }
          }
          if (hit && hit.hungryAt >= 0) {
            combo++;
            best = Math.max(best, combo);
            const gain = Math.round(hit.size * mult());
            fed += gain;
            hit.hungryAt = -1;
            hit.fedAt = t;
            flights.push({ from: basket(), to: { x: hit.x, y: hit.y }, at: t, n: Math.min(9, 3 + Math.floor(combo / 3)) });
            sound.pop();
            haptics.play(6);
            if (!filled && fed >= GOAL) {
              filled = true;
              sound.fanfare();
              haptics.play([12, 40, 12, 40, 30]);
            }
          } else if (hit) {
            combo = 0;
            lockUntil = t + 0.45;
            hit.missedAt = t;
            sound.wrong();
          }
        }
        if (t >= FEED_S) {
          phase = 'banner';
          phaseAt = t;
          for (const g of groups) g.hungryAt = -1;
          // what is left over, scattered over the grass
          const rr = rng(state.seed ^ 0xabcdef);
          crumbs.length = 0;
          for (let i = 0; i < 64; i++) crumbs.push({ x: W * (0.06 + rr() * 0.88), y: H * (0.3 + rr() * 0.52), got: false, gotAt: 0 });
          sound.reveal();
        }
      } else if (phase === 'banner' && t - phaseAt > 1.8) {
        phase = 'gather';
        phaseAt = t;
        taps.current.length = 0;
        setHud((h) => ({ ...h, gatherEnds: clock() + GATHER_S * 1000 }));
      } else if (phase === 'gather') {
        const sweep = [...taps.current.splice(0), ...(drag.current.down ? [{ x: drag.current.x, y: drag.current.y, at: t }] : [])];
        for (const s of sweep) {
          for (const c of crumbs) {
            if (!c.got && Math.hypot(c.x - s.x, c.y - s.y) < 30) {
              c.got = true;
              c.gotAt = t;
              collected++;
              sound.crumb();
              if (collected % 5 === 0 && baskets < 12) {
                baskets++;
                sound.correct();
                haptics.play([8, 20, 8]);
              }
            }
          }
        }
        if (t - phaseAt >= GATHER_S || baskets >= 12) {
          phase = 'over';
          phaseAt = t;
          if (baskets >= 12) sound.fanfare();
          end({ fed, baskets, best });
        }
      }
      if (now - hudAt > 90) {
        hudAt = now;
        setHud((h) => ({ ...h, fed, combo, mult: mult(), phase, baskets }));
      }

      // ------------------------------------------------------------------- drawing
      ctx.clearRect(0, 0, W, H);
      const sky = ctx.createLinearGradient(0, 0, 0, H * 0.3);
      sky.addColorStop(0, '#f3c27a');
      sky.addColorStop(0.7, '#f6dca6');
      sky.addColorStop(1, '#eed9a8');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H * 0.3);
      // the sea of Galilee beyond the hill
      ctx.fillStyle = '#7fa6b0';
      ctx.fillRect(0, H * 0.2, W, H * 0.08);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (let i = 0; i < 6; i++) ctx.fillRect(((i * 173 + t * 12) % (W + 80)) - 40, H * 0.22 + (i % 3) * 6, 26, 1.5);
      // the hill
      const hill = ctx.createLinearGradient(0, H * 0.24, 0, H);
      hill.addColorStop(0, '#9bb06a');
      hill.addColorStop(0.5, '#7f9a4c');
      hill.addColorStop(1, '#5e7a36');
      ctx.fillStyle = hill;
      ctx.beginPath();
      ctx.moveTo(0, H * 0.3);
      ctx.bezierCurveTo(W * 0.3, H * 0.22, W * 0.7, H * 0.32, W, H * 0.25);
      ctx.lineTo(W, H);
      ctx.lineTo(0, H);
      ctx.closePath();
      ctx.fill();
      // "much grass in the place": a few tufts
      ctx.strokeStyle = 'rgba(60,90,30,0.35)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i < 70; i++) {
        const gx = ((i * 97) % 100) / 100 * W, gy = H * (0.32 + ((i * 53) % 100) / 100 * 0.62);
        ctx.moveTo(gx, gy);
        ctx.lineTo(gx - 2, gy - 6);
        ctx.moveTo(gx, gy);
        ctx.lineTo(gx + 2, gy - 5);
      }
      ctx.stroke();
      // the crowd
      for (const g of groups) {
        const hungry = g.hungryAt >= 0;
        const fedGlow = Math.max(0, 1 - (t - g.fedAt) / 1.2);
        const sad = Math.max(0, 1 - (t - g.missedAt) / 1.0);
        ctx.save();
        ctx.translate(g.x, g.y);
        ctx.scale(g.s, g.s);
        if (fedGlow > 0) {
          const gl = ctx.createRadialGradient(0, 0, 0, 0, 0, 48);
          gl.addColorStop(0, `rgba(255,230,140,${0.75 * fedGlow})`);
          gl.addColorStop(1, 'rgba(255,230,140,0)');
          ctx.fillStyle = gl;
          ctx.fillRect(-50, -50, 100, 100);
        }
        // a cloth on the grass
        ctx.fillStyle = 'rgba(240,226,190,0.55)';
        ctx.beginPath();
        ctx.ellipse(0, 2, 36, 16, 0, 0, Math.PI * 2);
        ctx.fill();
        for (const f of g.figures) {
          const bob = hungry ? Math.sin(t * 9 + f.dx) * 1.5 : 0;
          ctx.fillStyle = sad > 0 ? '#8d8070' : f.c;
          ctx.beginPath();
          ctx.ellipse(f.dx, f.dy + 2 + bob, 6, 5, 0, Math.PI, 0);
          ctx.fill();
          ctx.fillStyle = '#d9a77a';
          ctx.beginPath();
          ctx.arc(f.dx, f.dy - 5 + bob, 3.2, 0, Math.PI * 2);
          ctx.fill();
          if (hungry) {
            ctx.strokeStyle = '#d9a77a';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(f.dx - 3, f.dy - 3 + bob);
            ctx.lineTo(f.dx - 6, f.dy - 12 + bob);
            ctx.moveTo(f.dx + 3, f.dy - 3 + bob);
            ctx.lineTo(f.dx + 6, f.dy - 12 + bob);
            ctx.stroke();
          }
        }
        if (hungry) {
          const left = Math.max(0, (g.until - t) / (g.until - g.hungryAt));
          ctx.strokeStyle = left < 0.35 ? 'rgba(200,60,40,0.9)' : 'rgba(255,248,230,0.95)';
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.arc(0, -2, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(60,40,20,0.75)';
        ctx.font = '600 10px Poppins, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(g.size), 0, 28);
        ctx.restore();
      }
      // the basket that never runs out: five loaves and two fishes
      const b = basket();
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.fillStyle = '#8a5a2b';
      ctx.beginPath();
      ctx.ellipse(0, 0, 46, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d7a95a';
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.ellipse(-28 + i * 14, -6, 9, 6, -0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#b9c4c8';
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.ellipse(-8 + i * 18, -13, 10, 4, 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(70,40,15,0.6)';
      ctx.lineWidth = 1;
      for (let i = -40; i <= 40; i += 8) {
        ctx.beginPath();
        ctx.moveTo(i, -4);
        ctx.lineTo(i * 0.9, 10);
        ctx.stroke();
      }
      ctx.restore();
      // bread in flight, breaking and multiplying as it goes
      for (let i = flights.length - 1; i >= 0; i--) {
        const f = flights[i];
        const u = (t - f.at) / 0.55;
        if (u >= 1) {
          flights.splice(i, 1);
          continue;
        }
        const pieces = u < 0.35 ? 1 : f.n;
        for (let k = 0; k < pieces; k++) {
          const spread = pieces === 1 ? 0 : (k / (pieces - 1) - 0.5) * 60 * Math.sin(Math.PI * u);
          const x = f.from.x + (f.to.x - f.from.x) * u + spread;
          const y = f.from.y + (f.to.y - f.from.y) * u - Math.sin(Math.PI * u) * 90;
          ctx.fillStyle = k % 3 === 2 ? '#b9c4c8' : '#e2b465';
          ctx.beginPath();
          ctx.ellipse(x, y, pieces === 1 ? 9 : 5, pieces === 1 ? 6 : 3.5, u * 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // the fragments left over
      if (phase === 'gather' || phase === 'banner' || phase === 'over') {
        for (const c of crumbs) {
          const k = c.got ? Math.min(1, (t - c.gotAt) / 0.35) : 0;
          if (k >= 1) continue;
          const target = { x: W * (0.06 + (Math.min(11, baskets) / 11) * 0.88), y: H * 0.95 };
          const x = c.x + (target.x - c.x) * k, y = c.y + (target.y - c.y) * k;
          ctx.fillStyle = '#e8c27a';
          ctx.beginPath();
          ctx.ellipse(x, y, 5, 3.2, (c.x % 3), 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(120,80,30,0.55)';
          ctx.stroke();
        }
      }
      if (phase === 'banner' || phase === 'gather' || phase === 'over') {
        ctx.fillStyle = 'rgba(40,24,10,0.18)';
        ctx.fillRect(0, H * 0.88, W, H * 0.12);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [state.seed, state.startedAt, clock, end]);

  const point = (e: React.PointerEvent) => {
    const rc = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - rc.left, y: e.clientY - rc.top };
  };
  const pct = Math.min(1, hud.fed / GOAL);
  return (
    <div className="loaves">
      <div className="mg-head">
        <div className="lf-count">
          <b className="tabular">{hud.fed.toLocaleString()}</b> <span>of 5,000 fed</span>
          <i className="lf-bar"><b style={{ width: `${pct * 100}%` }} /></i>
          {hud.phase === 'feed' && hud.mult > 1 && <span key={hud.mult} className="lf-bless">Blessing ×{hud.mult}</span>}
        </div>
        {hud.phase === 'feed' && <TimerRing deadline={state.startedAt + FEED_S * 1000} total={FEED_S * 1000} clock={clock} running />}
        {hud.phase === 'gather' && hud.gatherEnds > 0 && <TimerRing key="g" deadline={hud.gatherEnds} total={GATHER_S * 1000} clock={clock} running />}
      </div>
      <div
        ref={wrap}
        className="lf-stage"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          const p = point(e);
          taps.current.push({ ...p, at: performance.now() });
          drag.current = { ...p, down: true };
          sound.unlock();
        }}
        onPointerMove={(e) => { if (drag.current.down) drag.current = { ...point(e), down: true }; }}
        onPointerUp={() => { drag.current.down = false; }}
        onPointerCancel={() => { drag.current.down = false; }}
      >
        <canvas ref={canvas} />
        {hud.phase === 'feed' && hud.fed === 0 && <div className="lf-hint">Tap a group when its hands go up</div>}
        {hud.phase === 'feed' && hud.fed >= GOAL && <div className="lf-banner filled">They did all eat, and were filled!</div>}
        {hud.phase === 'banner' && <div className="lf-banner">Gather up the fragments that remain, that nothing be lost.</div>}
        {hud.phase === 'gather' && <div className="lf-hint">Tap or sweep over the fragments</div>}
        {(hud.phase === 'gather' || hud.phase === 'over') && (
          <div className="lf-baskets" aria-label={`${hud.baskets} of 12 baskets`}>
            {Array.from({ length: 12 }, (_, i) => <i key={i} className={i < hud.baskets ? 'full' : ''} />)}
          </div>
        )}
      </div>
      <p className="small muted fye-cite">“They sat down in ranks, by hundreds, and by fifties.” Mark 6:40</p>
    </div>
  );
}
