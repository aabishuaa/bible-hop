// Fix Your Eyes: Peter walks on the water while his eyes stay on Jesus (Matthew 14:28-31).
// Press and hold to look; your gaze follows your finger. Keep it on the light across the water and
// Peter walks; let the wind push it away, or look at the waves, and he begins to sink. The storm is
// drawn from the day's seed, so everyone faces the same wind.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActionState } from '../../../shared/minigames.ts';
import { haptics } from '../fx/haptics.ts';
import { sound } from '../fx/sound.ts';
import { Icon } from '../ui/icons.tsx';
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

interface Gust { at: number; dur: number; dx: number; dy: number }
interface Flash { at: number }
interface Swell { at: number; dur: number }

/** The day's storm: when the wind blows and which way, when the lightning comes, when a wave rises. */
function storm(seed: number) {
  const r = rng(seed);
  const gusts: Gust[] = [];
  for (let t = 2.5; t < 45; t += 2.6 + r() * 2.4) {
    const a = r() * Math.PI * 2;
    const s = 70 + r() * 90 + t * 2.2;
    gusts.push({ at: t, dur: 1.1 + r() * 1.3, dx: Math.cos(a) * s, dy: Math.sin(a) * s * 0.75 });
  }
  const flashes: Flash[] = [];
  for (let t = 5 + r() * 4; t < 45; t += 6 + r() * 6) flashes.push({ at: t });
  const swells: Swell[] = [];
  for (let t = 4 + r() * 3; t < 45; t += 5 + r() * 5) swells.push({ at: t, dur: 1.4 + r() * 0.8 });
  return { gusts, flashes, swells };
}

const WALK_SECONDS = 22; // a perfect walk across
const SINK_SECONDS = 2.6; // looking away this long, and Peter is under

export default function FixYourEyes({ state, clock, finish }: GameProps<ActionState>) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const pointer = useRef<{ x: number; y: number; down: boolean }>({ x: 0, y: 0, down: false });
  const [hud, setHud] = useState({ p: 0, sink: 0, onTarget: false, started: false });
  const [over, setOver] = useState<null | { reached: boolean }>(null);
  const sent = useRef(false);

  const end = useCallback((r: { reached: boolean; ms: number; steady: number; distance: number }) => {
    if (sent.current) return;
    sent.current = true;
    setOver({ reached: r.reached });
    if (r.reached) {
      sound.fanfare();
      haptics.play([12, 40, 12, 40, 30]);
    } else {
      sound.splash(0, 0.2);
      haptics.play([40, 60, 40]);
    }
    window.setTimeout(() => void finish(r), 1600);
  }, [finish]);

  useEffect(() => {
    const cv = canvas.current!;
    const box = wrap.current!;
    const ctx = cv.getContext('2d')!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let W = 0, H = 0;
    const size = () => {
      W = box.clientWidth;
      H = box.clientHeight;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      cv.style.width = `${W}px`;
      cv.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(box);

    const sky = storm(state.seed);
    const r = rng(state.seed ^ 0x9e3779b9);
    const drops = Array.from({ length: 140 }, () => ({ x: r(), y: r(), l: 8 + r() * 14, s: 0.6 + r() * 0.8 }));
    const clouds = Array.from({ length: 7 }, (_, i) => ({ x: r(), y: 0.04 + r() * 0.22, w: 0.25 + r() * 0.35, s: 0.006 + r() * 0.01, d: i % 3 }));
    // the clock runs from when the round began on the server, so time spent loading still counts
    const t0 = performance.now() - Math.max(0, clock() - state.startedAt);
    let last = performance.now();
    let p = 0, sink = 0, onFor = 0, total = 0, stepClock = 0;
    let gaze = { x: 0, y: 0 }, push = { x: 0, y: 0 };
    let gazeInit = false;
    let lastGust = -1, lastFlash = -1, lastSwell = -1;
    let flashAt = -99;
    let started = false;
    let done = false;
    let hudAt = 0;
    let raf = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = (now - t0) / 1000;
      const horizon = H * 0.4;
      // where Jesus stands: far off at first, closer as Peter walks
      const left = 1 - p;
      const jx = W * 0.3 + left * W * 0.52 + Math.sin(t * 0.6) * W * 0.03;
      const jy = horizon + H * 0.08 + (1 - left) * H * 0.12 + Math.sin(t * 1.4) * 7;
      const js = 0.55 + (1 - left) * 0.55;
      if (!gazeInit) {
        gaze = { x: jx, y: jy };
        gazeInit = true;
      }
      if (!done) {
        // the wind pushes the eyes
        const g = sky.gusts.find((x) => t >= x.at && t < x.at + x.dur);
        if (g) {
          const k = Math.sin(((t - g.at) / g.dur) * Math.PI);
          push.x += g.dx * k * dt * 0.95;
          push.y += g.dy * k * dt * 0.95;
          const gi = sky.gusts.indexOf(g);
          if (gi !== lastGust) {
            lastGust = gi;
            sound.wind(0, 0.06 + Math.min(0.06, t / 600));
          }
        }
        push.x *= Math.pow(0.35, dt);
        push.y *= Math.pow(0.35, dt);
        const fi = sky.flashes.findIndex((x) => t >= x.at && t < x.at + 0.1);
        if (fi >= 0 && fi !== lastFlash) {
          lastFlash = fi;
          flashAt = t;
          sound.thunder(0.15);
          haptics.play([30]);
        }
        const si = sky.swells.findIndex((x) => t >= x.at && t < x.at + 0.05);
        if (si >= 0 && si !== lastSwell) lastSwell = si;
        // the gaze follows the finger while it is held, and falls to the waves when it is not
        const pt = pointer.current;
        if (pt.down) {
          started = true;
          gaze.x += (pt.x + push.x - gaze.x) * Math.min(1, dt * 14);
          gaze.y += (pt.y + push.y - gaze.y) * Math.min(1, dt * 14);
        } else {
          gaze.x += (W * 0.3 - gaze.x) * Math.min(1, dt * 1.5);
          gaze.y += (H * 0.86 - gaze.y) * Math.min(1, dt * 1.5);
        }
        const R = 50 * js + 16;
        const onTarget = pt.down && Math.hypot(gaze.x - jx, gaze.y - jy) < R;
        // a moment's grace at the very start, before the first touch
        const grace = !started && t < 2.5;
        total += dt;
        if (onTarget) {
          onFor += dt;
          p = Math.min(1, p + dt / WALK_SECONDS);
          sink = Math.max(0, sink - dt / 1.2);
          stepClock += dt;
          if (stepClock > 0.48) {
            stepClock = 0;
            sound.splash(0, 0.025);
          }
        } else if (!grace) {
          const before = sink;
          sink = Math.min(1, sink + dt / SINK_SECONDS);
          if (before < 0.5 && sink >= 0.5) {
            sound.splash(0, 0.09);
            haptics.play([18, 40, 18]);
          }
        }
        const limit = state.limitMs / 1000;
        if (p >= 1) {
          done = true;
          end({ reached: true, ms: Math.round(Math.min(limit, t) * 1000), steady: Math.round((100 * onFor) / Math.max(0.001, total)), distance: 1 });
        } else if (sink >= 1 || t >= limit) {
          done = true;
          end({ reached: false, ms: Math.round(Math.min(limit, t) * 1000), steady: Math.round((100 * onFor) / Math.max(0.001, total)), distance: p });
        }
        if (now - hudAt > 90) {
          hudAt = now;
          setHud({ p, sink, onTarget, started });
        }
      }

      // ---------------------------------------------------------------- drawing
      ctx.clearRect(0, 0, W, H);
      const flash = Math.max(0, 1 - (t - flashAt) / 0.35);
      const skyG = ctx.createLinearGradient(0, 0, 0, horizon);
      skyG.addColorStop(0, '#070b1c');
      skyG.addColorStop(0.6, '#1d1733');
      skyG.addColorStop(1, '#3b2533');
      ctx.fillStyle = skyG;
      ctx.fillRect(0, 0, W, horizon + 2);
      // the moon behind the clouds
      const moon = ctx.createRadialGradient(W * 0.72, horizon * 0.35, 0, W * 0.72, horizon * 0.35, H * 0.3);
      moon.addColorStop(0, 'rgba(255,240,210,0.35)');
      moon.addColorStop(1, 'rgba(255,240,210,0)');
      ctx.fillStyle = moon;
      ctx.fillRect(0, 0, W, horizon);
      for (const c of clouds) {
        const cx = (((c.x + t * c.s) % 1.4) - 0.2) * W;
        ctx.fillStyle = c.d === 0 ? 'rgba(20,16,32,0.85)' : c.d === 1 ? 'rgba(34,26,46,0.7)' : 'rgba(52,40,60,0.55)';
        ctx.beginPath();
        ctx.ellipse(cx, c.y * H, c.w * W * 0.5, H * 0.05, 0, 0, Math.PI * 2);
        ctx.ellipse(cx + c.w * W * 0.2, c.y * H - H * 0.025, c.w * W * 0.3, H * 0.045, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // the light of Jesus, across the water
      const glow = ctx.createRadialGradient(jx, jy - 30 * js, 0, jx, jy - 30 * js, 140 * js);
      glow.addColorStop(0, 'rgba(255,248,220,0.95)');
      glow.addColorStop(0.25, 'rgba(255,224,150,0.45)');
      glow.addColorStop(1, 'rgba(255,214,130,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(jx - 160 * js, jy - 190 * js, 320 * js, 320 * js);
      // the sea, in three bands of waves
      const wave = (base: number, amp: number, len: number, speed: number, phase: number) => (x: number) =>
        base + Math.sin(x / len + t * speed + phase) * amp + Math.sin(x / (len * 0.43) - t * speed * 1.3 + phase * 2) * amp * 0.45;
      const band = (fy: (x: number) => number, top: string, bottom: string, foam: string) => {
        ctx.beginPath();
        ctx.moveTo(0, H);
        for (let x = 0; x <= W + 8; x += 8) ctx.lineTo(x, fy(x));
        ctx.lineTo(W, H);
        ctx.closePath();
        const g = ctx.createLinearGradient(0, horizon, 0, H);
        g.addColorStop(0, top);
        g.addColorStop(1, bottom);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = foam;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let x = 0; x <= W + 8; x += 8) (x === 0 ? ctx.moveTo : ctx.lineTo).call(ctx, x, fy(x));
        ctx.stroke();
      };
      band(wave(horizon + 4, 3, 40, 1.1, 0), '#1b3a4a', '#0a1c26', 'rgba(220,235,240,0.18)');
      // Jesus, standing on the water
      ctx.save();
      ctx.translate(jx, jy);
      ctx.scale(js, js);
      ctx.fillStyle = 'rgba(255,252,240,0.96)';
      ctx.beginPath();
      ctx.moveTo(-15, 0);
      ctx.lineTo(-9, -46);
      ctx.lineTo(9, -46);
      ctx.lineTo(15, 0);
      ctx.closePath();
      ctx.fill();
      const reach = p > 0.82 ? Math.min(1, (p - 0.82) / 0.18) : 0;
      ctx.strokeStyle = 'rgba(255,252,240,0.96)';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-6, -38);
      ctx.lineTo(-18 - reach * 14, -26 - reach * 10);
      ctx.moveTo(6, -38);
      ctx.lineTo(16, -24);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -54, 7.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // the boat, left behind
      const bx = W * 0.07 - p * W * 0.25;
      const by = horizon + H * 0.13 + Math.sin(t * 1.2) * 4;
      ctx.fillStyle = '#26160d';
      ctx.beginPath();
      ctx.moveTo(bx - 60, by);
      ctx.quadraticCurveTo(bx, by + 26, bx + 60, by);
      ctx.lineTo(bx + 50, by + 6);
      ctx.lineTo(bx - 50, by + 6);
      ctx.fill();
      ctx.fillRect(bx - 2, by - 54, 4, 54);
      // a great wave can rise between Peter and Jesus
      const sw = sky.swells.find((x) => t >= x.at && t < x.at + x.dur);
      const swellK = sw ? Math.sin(((t - sw.at) / sw.dur) * Math.PI) : 0;
      band(wave(horizon + H * 0.16 - swellK * H * 0.14, 6 + swellK * 10, 70, 1.6, 1.3), '#163444', '#08161f', 'rgba(230,240,245,0.32)');
      // Peter, sinking as his eyes leave Jesus
      const px = W * 0.22, py = horizon + H * 0.33 + Math.sin(t * 2.2) * 3 + sink * 46;
      ctx.save();
      ctx.translate(px, py);
      ctx.fillStyle = '#6a3a22';
      ctx.beginPath();
      ctx.moveTo(-16, 0);
      ctx.lineTo(-10, -52);
      ctx.lineTo(10, -52);
      ctx.lineTo(16, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#d9a77a';
      ctx.beginPath();
      ctx.arc(0, -61, 8.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#6a3a22';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      // arms out for balance, or one reaching up when he sinks
      ctx.moveTo(-6, -44);
      ctx.lineTo(-22, -36 + Math.sin(t * 4) * 4);
      ctx.moveTo(6, -44);
      ctx.lineTo(sink > 0.4 ? 14 : 22, sink > 0.4 ? -76 : -36 - Math.sin(t * 4) * 4);
      ctx.stroke();
      ctx.restore();
      // the near waves, over his feet
      band(wave(horizon + H * 0.34, 7, 55, 2, 2.1), 'rgba(16,44,58,0.96)', '#061016', 'rgba(240,248,250,0.42)');
      // rain, slanted by the wind
      ctx.strokeStyle = 'rgba(200,215,230,0.28)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const slant = push.x / 200;
      for (const d of drops) {
        const x = ((d.x * W + t * 60 * d.s * (1 + slant)) % (W + 40)) - 20;
        const y = (d.y * H + t * 520 * d.s) % H;
        ctx.moveTo(x, y);
        ctx.lineTo(x - (6 + slant * 10) * d.s, y + d.l);
      }
      ctx.stroke();
      // where Peter is looking
      const on = pointer.current.down && Math.hypot(gaze.x - jx, gaze.y - jy) < 50 * js + 16;
      if (on && !done) {
        ctx.strokeStyle = 'rgba(255,226,150,0.45)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(px, py - 61);
        ctx.lineTo(jx, jy - 52 * js);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.strokeStyle = on ? 'rgba(255,214,110,0.95)' : 'rgba(235,245,255,0.75)';
      ctx.lineWidth = on ? 3 : 2;
      ctx.beginPath();
      ctx.arc(gaze.x, gaze.y, on ? 22 : 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(gaze.x, gaze.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
      if (flash > 0) {
        ctx.fillStyle = `rgba(235,240,255,${0.55 * flash})`;
        ctx.fillRect(0, 0, W, H);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [state.seed, state.limitMs, state.startedAt, clock, end]);

  const at = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    pointer.current.x = e.clientX - r.left;
    pointer.current.y = e.clientY - r.top;
  };
  return (
    <div className="fye">
      <div className="mg-head">
        <div className="fye-meters">
          <span className="fye-meter"><span>Across</span><i><b style={{ width: `${hud.p * 100}%` }} /></i></span>
          <span className={`fye-meter sink ${hud.sink > 0.5 ? 'danger' : ''}`}><span>Sinking</span><i><b style={{ width: `${hud.sink * 100}%` }} /></i></span>
        </div>
        <TimerRing deadline={state.startedAt + state.limitMs} total={state.limitMs} clock={clock} running={!over} />
      </div>
      <div
        ref={wrap}
        className="fye-stage"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pointer.current.down = true; at(e); sound.unlock(); }}
        onPointerMove={at}
        onPointerUp={() => { pointer.current.down = false; }}
        onPointerCancel={() => { pointer.current.down = false; }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <canvas ref={canvas} />
        {!hud.started && !over && <div className="fye-hint"><Icon name="dove" /> Press and hold on the light. Keep your eyes on Jesus.</div>}
        {hud.started && !hud.onTarget && !over && hud.sink > 0.15 && <div className="fye-hint warn">Lord, save me! Look to Jesus</div>}
        {over && <div className={`fye-over ${over.reached ? 'won' : ''}`}>{over.reached ? 'And Jesus stretched forth his hand…' : 'Immediately Jesus stretched forth his hand, and caught him'}</div>}
      </div>
      <p className="small muted fye-cite">“Lord, if it be thou, bid me come unto thee on the water.” Matthew 14:28</p>
    </div>
  );
}
