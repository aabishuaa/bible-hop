// After the journey (section 13): welcome home or the loss, the trip map, the Emmaus Road,
// the Book of Numbers and the share card.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DIVISIONS } from '../../../shared/books.ts';
import type { Tier } from '../../../shared/rules.ts';
import { TIER_NAMES } from '../../../shared/rules.ts';
import type { Achievement, BookSpan, FinaleView, HopRecord } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { useApp } from '../app-store.ts';
import { haptics } from '../fx/haptics.ts';
import { sound } from '../fx/sound.ts';
import { isReducedMotion } from '../prefs.ts';
import { navigate } from '../router.ts';
import { TIER_COLOR } from '../theme.ts';
import { BadgeCard, Medal } from '../ui/Badges.tsx';
import { BookmarkButton } from '../ui/Bookmark.tsx';
import { Standings } from '../ui/Standings.tsx';
import { DotsDeco, LinesDeco, plural, press, useDocumentTitle } from '../ui/base.tsx';
import { Icon, TierBadge } from '../ui/icons.tsx';
import { lossIcon } from './journey/modals.tsx';

/** The finale of the journey that just ended, kept so the screen can show it without a round trip. */
export let lastFinale: FinaleView | null = null;
export function setLastFinale(f: FinaleView | null): void {
  lastFinale = f;
}

const pretty = (s: string) => s.replace(/'/g, '’');

export function FinaleScreen({ date }: { date?: string }) {
  const [f, setF] = useState<FinaleView | null>(() => (date && lastFinale?.date === date && lastFinale.kind === 'daily') || !date ? lastFinale : null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (f || !date) return;
    api.finale({ date }).then(setF).catch((e) => setErr(e.message));
  }, [date, f]);
  useDocumentTitle(f ? (f.won ? 'Welcome home' : f.loss?.name ?? 'The day ended') : 'Finale');
  if (err) return <Shell title="Finale"><p className="lead">{err}</p><button className="btn" onClick={() => navigate('/')}>Back to today</button></Shell>;
  if (!f) return <Shell title="Finale"><p className="lead muted">Turning the pages back&hellip;</p></Shell>;
  return <Finale f={f} />;
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="screen leather">
      <header className="bar bar-top">
        <div className="topbar">
          <button className="icon-btn" onClick={() => { press(); navigate('/'); }} aria-label="Back to today"><Icon name="lookback" size="1.3rem" /></button>
          <div className="title">{title}</div>
        </div>
      </header>
      <div className="page-wrap">
        <div className="sheet-page">{children}</div>
      </div>
    </div>
  );
}

function Finale({ f }: { f: FinaleView }) {
  const [badge, setBadge] = useState<Achievement | null>(null);
  const books = useApp((s) => s.today?.books ?? []);
  const toast = useApp((s) => s.toast);
  const today = useApp((s) => s.today);
  const loadToday = useApp((s) => s.loadToday);
  useEffect(() => {
    void loadToday();
  }, [loadToday]);
  const guide = f.kind === 'guide';
  const practice = f.kind === 'practice';
  const copy = async () => {
    press();
    try {
      await navigator.clipboard.writeText(f.share);
      toast('Copied. Paste it wherever you like.');
      void api.track('share.copied');
    } catch {
      toast('Could not copy here. Select the card text to copy it.');
    }
  };
  const share = async () => {
    press();
    try {
      await navigator.share({ text: f.share });
      void api.track('share.copied');
    } catch {
      /* the player closed the sheet */
    }
  };
  const canShare = typeof navigator.share === 'function';
  return (
    <Shell title={guide ? 'Your first hop' : practice ? 'Sunday School' : `Bible Hopping #${f.puzzleNo}`}>
      <div className={`finale-hero ${f.won ? '' : 'lost'}`}>
        <div className="emblem" aria-hidden="true"><Icon name={f.won ? 'home' : lossIcon(f.loss?.reason ?? 'door')} /></div>
        <p className="eyebrow">{guide ? 'You know how it works' : practice ? 'Practice makes perfect' : f.won ? 'The day is won' : 'The day is lost'}</p>
        <h1 className="display">{f.won ? <>Welcome <em>home</em></> : <>{f.loss?.name}</>}</h1>
        {f.won ? (
          <p className="line">
            You came home to <b>{f.home.ref}</b> through &ldquo;{pretty(f.homeWord ?? '')}&rdquo;, and the Fatted Calf adds <b>{f.calf}</b> manna.
            {!guide && !practice && <> <b>{f.manna}</b> manna gathered &middot; Treasure in Heaven <b>{f.treasure.toLocaleString()}</b> &middot; streak <b>{f.streak}</b>.</>}
          </p>
        ) : (
          <p className="line">
            {f.loss?.line} <span className="cite">{f.loss?.cite}</span>
            <br />
            {!practice && <>Today&rsquo;s {f.manna} manna spoiled before it reached home.</>}
          </p>
        )}
        {guide && (
          <div className="actions" style={{ marginTop: '1.2rem' }}>
            <button className="btn big gold" onClick={() => { press(); navigate('/play'); }}>
              Now try today&rsquo;s verse <span className="chev"><Icon name="hop" size="1rem" strokeWidth={2.4} /></span>
            </button>
          </div>
        )}
      </div>

      {!guide && (
        <div className="tally">
          <div className="stat"><span className="n"><Icon name="hop" />{f.numbers.hops}</span><span className="l">Hops</span></div>
          <div className="stat"><span className="n"><Icon name="manna" />{f.manna}</span><span className="l">Manna</span></div>
          <div className="stat"><span className="n"><Icon name="lamp" />{f.numbers.oilLeft}<small style={{ fontSize: '0.9rem', color: 'var(--ink-3)' }}>/{f.numbers.oilCap}</small></span><span className="l">Oil left</span></div>
        </div>
      )}

      {!guide && !practice && (
        <div className="sharecard" aria-label="Share card">
          <div className="t">Bible Hopping #{f.puzzleNo}</div>
          <div className="trail" aria-hidden="true">
            <span className="end"><Icon name="home" /></span>
            {f.shareTiers.map((t, i) => <TierBadge key={i} tier={t} size={24} />)}
            <span className={`end ${f.won ? '' : 'lost'}`}><Icon name={f.won ? 'home' : 'moon'} /></span>
          </div>
          <div className="line2">
            <span>{plural(f.numbers.hops, 'hop')}</span>
            <span>{f.manna} manna</span>
            <span><Icon name="lamp" /> {f.numbers.oilLeft}/{f.numbers.oilCap}</span>
            {f.looksBack > 0 && <span>{Array.from({ length: Math.min(5, f.looksBack) }, (_, i) => <Icon key={i} name="salt" />)}</span>}
            {f.numbers.graceUsed && <span><Icon name="dove" /></span>}
            {f.mode === 'berean' && <span>Berean</span>}
          </div>
          <pre className="sr-only">{f.share}</pre>
          <div className="btns" style={canShare ? undefined : { gridTemplateColumns: '1fr' }}>
            <button className="btn caramel" onClick={copy}><Icon name="book" size="1rem" /> Copy the card</button>
            {canShare && <button className="btn caramel" onClick={share}><Icon name="hop" size="1rem" strokeWidth={2.2} /> Share</button>}
          </div>
        </div>
      )}

      {f.achievements.length > 0 && (
        <div className="finale-badges">
          {f.achievements.map((a) => a.badge ? <Medal key={a.id} a={a} size={72} onClick={() => { press(); setBadge(a); }} /> : (
            <div key={a.id} className="badge earned">
              <span className="medal-small"><Icon name="sparkle" /></span>
              <span><b>{a.name}</b><span>{a.how}{a.cite ? ` \u00b7 ${a.cite}` : ''}</span></span>
            </div>
          ))}
        </div>
      )}

      {!guide && !practice && (
        <>
          <h2 className="display">Today&rsquo;s <em>standings</em></h2>
          <Standings date={f.date} />
        </>
      )}

      {!guide && (
        <>
          <h2 className="display">The trip <em>map</em></h2>
          <TripMap f={f} books={books.length ? books : today?.books ?? []} />
          <h2 className="display">The Emmaus <em>Road</em></h2>
          <p className="small muted">Walk back along your road: tap a stop, or step through with the arrows. The word you came in by is highlighted; the word you left by is underlined.</p>
          <EmmausRoad f={f} />
          <h2 className="display">The Book of <em>Numbers</em></h2>
          <Numbers f={f} />
        </>
      )}

      <div className="actions" style={{ display: 'grid', gap: '0.6rem', marginTop: '1.6rem' }}>
        {practice && <button className="btn" onClick={() => { press(); navigate('/practice'); }}>Practise again</button>}
        <button className="btn ghost" onClick={() => { press(); navigate('/'); }}><Icon name="lookback" size="1rem" /> Back to today</button>
      </div>
      <BadgeCard a={badge} onClose={() => setBadge(null)} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2rem' }}>
        <DotsDeco />
        <LinesDeco />
      </div>
    </Shell>
  );
}

type MapHop = { from: number; to: number; tier: Tier; home: boolean; revisit: boolean; door: string; fromRef: string; toRef: string };

const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
/** Runs fn(t) for t from 0 to 1 over `ms`, one frame at a time; stops early if `alive()` turns false. */
function tween(ms: number, alive: () => boolean, fn: (t: number) => void): Promise<boolean> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const step = (now: number) => {
      if (!alive()) return resolve(false);
      const t = Math.min(1, (now - t0) / ms);
      fn(t);
      if (t < 1) requestAnimationFrame(step);
      else resolve(true);
    };
    requestAnimationFrame(step);
  });
}
const easeInOut = (t: number) => 0.5 - Math.cos(Math.PI * t) / 2;

/**
 * Rule 13.3: all 66 books on one line, each as wide as its share of the Bible, every hop an arc.
 * When the map comes into view (and whenever it is tapped) the ball replays the trip: it hops each
 * arc in turn, drawing it as it goes, and skips twice where it lands.
 */
export function TripMap({ f, books, route }: { f?: FinaleView; books: BookSpan[]; route?: MapHop[] }) {
  const W = 1000, H = 236, base = 190, R = 9;
  const ground = base - 5;
  const x = (p: number) => 14 + p * (W - 28);
  const [sel, setSel] = useState<number | null>(null);
  const [cur, setCur] = useState<number | null>(null);
  const [phase, setPhase] = useState<'idle' | 'playing' | 'done'>('idle');
  const wrap = useRef<HTMLDivElement>(null);
  const ball = useRef<SVGGElement>(null);
  const shadow = useRef<SVGEllipseElement>(null);
  const arcs = useRef<(SVGPathElement | null)[]>([]);
  const run = useRef(0);
  const hops = useMemo<MapHop[]>(() => {
    if (route) return route;
    const path: HopRecord[] = f?.path ?? [];
    const stops = f?.road ?? [];
    return path.map((h, i) => ({ from: stops[i]?.position ?? 0, to: stops[i + 1]?.position ?? 0, tier: h.tier, home: h.home, revisit: h.revisit, door: h.doorWord, fromRef: h.fromRef, toRef: h.toRef }));
  }, [f, route]);
  const homePos = f?.road[0]?.position ?? hops[0]?.from ?? 0;
  const homeRef = f?.home.ref ?? hops[0]?.fromRef ?? '';
  const divisions = useMemo(() => {
    const out: { name: string; start: number; end: number }[] = [];
    for (const d of DIVISIONS) {
      const mine = books.filter((b) => b.division === d);
      if (mine.length) out.push({ name: d, start: mine[0].start, end: mine[mine.length - 1].end });
    }
    return out;
  }, [books]);
  // each arc as tall as its reach, but never taller than the card
  const geo = useMemo(() => hops.map((h) => {
    const a = x(h.from), b = x(h.to);
    const reach = Math.min(1, Math.abs(b - a) / (W - 28));
    const lift = 18 + (ground - 18 - 20) * Math.pow(reach, 0.6);
    return { a, b, lift, d: `M${a.toFixed(1)} ${ground} Q ${((a + b) / 2).toFixed(1)} ${(ground - lift * 2).toFixed(1)} ${b.toFixed(1)} ${ground}` };
  }), [hops]); // eslint-disable-line react-hooks/exhaustive-deps

  const placeBall = (px: number, py: number, sx = 1, sy = 1) => {
    ball.current?.setAttribute('transform', `translate(${px.toFixed(1)} ${py.toFixed(1)}) scale(${sx.toFixed(3)} ${sy.toFixed(3)})`);
    const h = Math.max(0, ground - py);
    shadow.current?.setAttribute('cx', px.toFixed(1));
    shadow.current?.setAttribute('rx', (R * (1 - Math.min(0.6, h / 260))).toFixed(1));
    shadow.current?.setAttribute('opacity', (0.45 * (1 - Math.min(0.8, h / 200))).toFixed(2));
  };
  const drawAll = (shown: boolean) => arcs.current.forEach((p) => {
    if (!p) return;
    const L = p.getTotalLength();
    p.style.strokeDasharray = `${L}`;
    p.style.strokeDashoffset = shown ? '0' : `${L}`;
  });

  const play = useCallback(async () => {
    if (!hops.length) return;
    if (isReducedMotion()) {
      drawAll(true);
      setPhase('done');
      return;
    }
    const token = ++run.current;
    const alive = () => run.current === token;
    setPhase('playing');
    setSel(null);
    drawAll(false);
    placeBall(x(hops[0].from), ground);
    await wait(300);
    for (let i = 0; i < hops.length; i++) {
      if (!alive()) return;
      const h = hops[i], g = geo[i], path = arcs.current[i];
      if (!path) continue;
      setCur(i);
      const L = path.getTotalLength();
      // crouch
      if (!(await tween(90, alive, (t) => placeBall(g.a, ground, 1 + 0.16 * t, 1 - 0.18 * t)))) return;
      sound.door(h.home ? 'loaf' : h.tier);
      // the hop, drawing the arc behind the ball
      const ms = 520 + 760 * Math.sqrt(Math.min(1, Math.abs(g.b - g.a) / (W - 28)));
      if (!(await tween(ms, alive, (t) => {
        const e = easeInOut(t);
        const pt = path.getPointAtLength(L * e);
        path.style.strokeDashoffset = `${L * (1 - e)}`;
        const st = 1 + 0.1 * Math.sin(Math.PI * t);
        placeBall(pt.x, pt.y, 1 / st, st);
      }))) return;
      path.style.strokeDashoffset = '0';
      sound.land(h.home ? 'home' : h.tier);
      haptics.play(h.home ? [14, 40, 20] : 10);
      // land, then two little skips
      if (!(await tween(90, alive, (t) => placeBall(g.b, ground, 1 + 0.24 * Math.sin(Math.PI * t), 1 - 0.26 * Math.sin(Math.PI * t))))) return;
      for (const [hgt, d] of [[16, 210], [6, 150]] as const) {
        if (!(await tween(d, alive, (t) => placeBall(g.b, ground - hgt * 4 * t * (1 - t), 1, 1)))) return;
        if (!(await tween(60, alive, (t) => placeBall(g.b, ground, 1 + 0.12 * Math.sin(Math.PI * t), 1 - 0.12 * Math.sin(Math.PI * t))))) return;
      }
      await wait(120);
    }
    if (!alive()) return;
    setCur(null);
    setPhase('done');
    if (hops[hops.length - 1].home) sound.home();
  }, [hops, geo]); // eslint-disable-line react-hooks/exhaustive-deps

  // play the trip the first time the map comes into view
  useEffect(() => {
    const el = wrap.current;
    if (!el || !hops.length) return;
    if (isReducedMotion() || typeof IntersectionObserver === 'undefined') {
      setPhase('done');
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        void play();
      }
    }, { threshold: 0.6 });
    io.observe(el);
    return () => {
      io.disconnect();
      run.current++;
    };
  }, [hops, play]);
  useEffect(() => {
    if (phase === 'done') {
      drawAll(true);
      const last = hops[hops.length - 1];
      if (last) placeBall(x(last.to), ground);
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const shownHop = cur !== null ? cur : sel;
  const s = shownHop !== null ? hops[shownHop] : null;
  const replay = () => { press(); void play(); };
  return (
    <div ref={wrap} className={`tripmap card cream ${phase}`} style={{ padding: '0.9rem 0.8rem 0.7rem' }}>
      <svg className="map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`A map of the trip across the Bible: ${hops.length} hops from ${homeRef}. Tap to replay it.`} onClick={replay}>
        <defs>
          <radialGradient id="map-ball" cx="0.34" cy="0.3" r="0.75">
            <stop offset="0" stopColor="#ffe3d2" /><stop offset="0.2" stopColor="#ff8a5c" /><stop offset="0.5" stopColor="#e3542a" /><stop offset="0.8" stopColor="#b7310f" /><stop offset="1" stopColor="#6e1904" />
          </radialGradient>
        </defs>
        {books.map((b, i) => (
          <rect key={b.name} x={x(b.start)} y={base - 5} width={Math.max(0.6, x(b.end) - x(b.start) - 0.8)} height={10} rx={1.5} fill={i % 2 ? '#d9bf94' : '#e7d2ad'} />
        ))}
        {divisions.map((d) => <line key={d.name} x1={x(d.start)} x2={x(d.start)} y1={base - 10} y2={base + 9} stroke="#9c7a4b" strokeWidth={1} />)}
        {hops.map((h, i) => (
          <g key={i}>
            <path
              ref={(el) => { arcs.current[i] = el; }}
              className={`arc ${shownHop === i ? 'sel' : ''} ${h.revisit ? 'revisit' : ''}`}
              d={geo[i].d}
              stroke={h.home ? TIER_COLOR.home : TIER_COLOR[h.tier]}
              strokeWidth={h.home ? 3.6 : 2.6}
            />
            <path className="hit" d={geo[i].d} onClick={(e) => { e.stopPropagation(); press(); if (phase !== 'playing') setSel(sel === i ? null : i); }} />
          </g>
        ))}
        {hops.map((h, i) => <circle key={`s${i}`} cx={x(h.to)} cy={ground} r={h.home ? 0 : 3.4} fill="#fffaf0" stroke={TIER_COLOR[h.tier]} strokeWidth={1.8} />)}
        <circle cx={x(homePos)} cy={ground} r={5.5} fill={TIER_COLOR.home} stroke="#fffaf0" strokeWidth={2} />
        <text x={x(homePos)} y={base + 30} textAnchor={homePos < 0.15 ? 'start' : homePos > 0.85 ? 'end' : 'middle'} fontSize="13" fontFamily="Poppins, sans-serif" fontWeight="600" fill="#9a6c0c">
          {homeRef} · home
        </text>
        {hops.length > 0 && (
          <>
            <ellipse ref={shadow} className="map-shadow" cx={x(homePos)} cy={ground + 1} rx={R} ry={2.6} fill="#3b1f12" opacity={0.45} />
            <g ref={ball} className="map-ball" transform={`translate(${x(homePos)} ${ground})`}>
              <circle cx={0} cy={-R} r={R} fill="url(#map-ball)" />
              <ellipse cx={-3} cy={-R - 3.4} rx={2.8} ry={1.7} fill="#fff" opacity={0.85} transform={`rotate(-30 -3 ${-R - 3.4})`} />
            </g>
          </>
        )}
      </svg>
      <div className="divs" style={{ gridTemplateColumns: divisions.map((d) => `${((d.end - d.start) * 100).toFixed(2)}fr`).join(' ') }} aria-hidden="true">
        {divisions.map((d) => <span key={d.name}>{d.end - d.start < 0.03 ? '' : d.name === 'Gospels & Acts' ? 'Gospels' : d.name}</span>)}
      </div>
      <div className="info" aria-live="polite">
        {s ? (
          <>
            <TierBadge tier={s.home ? 'home' : s.tier} size={22} />
            <span className="info-text">
              {cur !== null && <b className="info-step">Hop {cur + 1} of {hops.length} · </b>}
              <b>{s.fromRef}</b> → <b>{s.toRef}</b> through &ldquo;{pretty(s.door)}&rdquo; ({s.home ? 'home' : TIER_NAMES[s.tier]}{s.revisit ? ', a return visit' : ''})
            </span>
          </>
        ) : (
          <span className="muted small info-text">{phase === 'playing' ? 'Setting off from home…' : 'Tap the map to watch the trip again, or tap an arc to see where it went.'}</span>
        )}
        {hops.length > 0 && phase !== 'playing' && (
          <button className="map-replay" onClick={replay} aria-label="Replay the trip"><Icon name="hop" strokeWidth={2.4} /> Replay</button>
        )}
      </div>
    </div>
  );
}

const SP = 108, PAD = 70, ROAD_H = 186;

/**
 * Rule 13.4: the replay, as a road. Every stop of the journey is a milestone along a winding road;
 * tap one (or step with the arrows, or swipe the card) and the ball hops there and the stop's verse
 * opens below, with the word you came in by and the word you left by.
 */
function EmmausRoad({ f }: { f: FinaleView }) {
  const n = f.road.length;
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const scroller = useRef<HTMLDivElement>(null);
  const ballEl = useRef<HTMLSpanElement>(null);
  const prevAt = useRef<{ x: number; y: number } | null>(null);
  const swipe = useRef<number | null>(null);
  const roadW = PAD * 2 + Math.max(0, n - 1) * SP;
  const pts = useMemo(() => f.road.map((_, k) => ({ x: PAD + k * SP, y: 92 + Math.sin(k * 1.15 + 0.6) * 16 })), [f]);
  const roadD = useMemo(() => {
    if (!pts.length) return '';
    let d = `M${pts[0].x - PAD} ${pts[0].y} L${pts[0].x} ${pts[0].y}`;
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1], b = pts[k];
      d += ` C${a.x + SP / 2} ${a.y} ${b.x - SP / 2} ${b.y} ${b.x} ${b.y}`;
    }
    const last = pts[pts.length - 1];
    return `${d} L${last.x + PAD} ${last.y}`;
  }, [pts]);

  const go = (k: number) => {
    const next = Math.max(0, Math.min(n - 1, k));
    if (next === i) return;
    press();
    setDir(next > i ? 1 : -1);
    setI(next);
    const hop = f.road[next].hop;
    sound.door(hop ? (hop.home ? 'loaf' : hop.tier) : 'loaf');
  };

  // keep the chosen stop in view, and hop the ball over to it
  useLayoutEffect(() => {
    const at = pts[i];
    const sc = scroller.current;
    if (!at || !sc) return;
    sc.scrollTo({ left: Math.max(0, at.x - sc.clientWidth / 2), behavior: isReducedMotion() ? 'auto' : 'smooth' });
    const from = prevAt.current;
    prevAt.current = at;
    const el = ballEl.current;
    if (!el || !from || isReducedMotion()) return;
    const dx = from.x - at.x, dy = from.y - at.y;
    const lift = 34 + Math.min(40, Math.abs(dx) * 0.12);
    el.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(1.1, 0.88)` },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - lift}px) scale(0.94, 1.08)`, offset: 0.5 },
      { transform: 'translate(0, 0) scale(1.18, 0.82)', offset: 0.86 },
      { transform: 'none' },
    ], { duration: 420 + Math.min(380, Math.abs(dx) * 0.6), easing: 'cubic-bezier(.3,.6,.3,1)' });
  }, [i, pts]);

  if (!n) return null;
  const stop = f.road[i];
  const hop = stop.hop;
  const next = f.road[i + 1]?.hop;
  const tierOf = (k: number) => {
    const h = f.road[k].hop;
    return h ? (h.home ? 'home' : h.tier) : 'home';
  };
  return (
    <div className="emmaus" onKeyDown={(e) => { if (e.key === 'ArrowRight') go(i + 1); if (e.key === 'ArrowLeft') go(i - 1); }}>
      <div className="em-scroller" ref={scroller}>
        <div className="em-road" style={{ width: roadW, height: ROAD_H }}>
          <svg width={roadW} height={ROAD_H} aria-hidden="true">
            <path d={roadD} className="em-road-edge" />
            <path d={roadD} className="em-road-body" />
            <path d={roadD} className="em-road-line" />
          </svg>
          {f.road.map((st, k) => {
            const t = tierOf(k);
            const isHome = k === 0 || st.hop?.home;
            return (
              <button
                key={k}
                className={`em-stop tier-${t} ${k === i ? 'on' : ''} ${k < i ? 'past' : ''}`}
                style={{ left: pts[k].x, top: pts[k].y, ['--d' as string]: `${k * 70}ms` }}
                onClick={() => go(k)}
                aria-label={`Stop ${k + 1} of ${n}: ${st.ref}`}
                aria-current={k === i ? 'step' : undefined}
              >
                <span className="em-dot">{isHome ? <Icon name="home" size="1.05em" strokeWidth={2.4} /> : k}</span>
                <span className={`em-ref ${k % 2 ? 'low' : ''}`}>{st.ref}</span>
              </button>
            );
          })}
          <span ref={ballEl} className="em-ball" style={{ left: pts[i].x, top: pts[i].y }} aria-hidden="true"><i /></span>
        </div>
      </div>

      <div
        key={i}
        className={`road-stop em-card tier-${tierOf(i)} ${dir > 0 ? 'from-right' : 'from-left'}`}
        onPointerDown={(e) => { swipe.current = e.clientX; }}
        onPointerUp={(e) => {
          if (swipe.current === null) return;
          const dx = e.clientX - swipe.current;
          swipe.current = null;
          if (Math.abs(dx) > 50) go(i + (dx < 0 ? 1 : -1));
        }}
      >
        <div className="em-head">
          <span className="em-step">{i === 0 ? 'Home' : hop?.home ? 'Home again' : `Stop ${i}`} · {i + 1} of {n}</span>
          <span className="pill line" style={{ fontSize: '0.7rem' }}>{stop.wording.toUpperCase()}</span>
          <BookmarkButton verse={stop.id} refLabel={stop.ref} source="road" className="on-paper" />
        </div>
        <div className="ref">
          {(i === 0 || hop?.home) && <Icon name="home" size="1rem" strokeWidth={2.4} style={{ color: 'var(--gold)' }} />}
          {stop.ref}
        </div>
        <p className="text">
          {stop.tokens.map((t, k) => (t.m ? <span key={k} className={t.m}>{pretty(t.s)}</span> : <span key={k}>{pretty(t.s)}</span>))}
        </p>
        {stop.cameByIn && <p className="note">The word you came in by is in the {stop.cameByIn.toUpperCase()} wording of this verse.</p>}
        {stop.leftByIn && <p className="note">The word you left by is in the {stop.leftByIn.toUpperCase()} wording of this verse.</p>}
        <div className="em-doors">
          {hop ? (
            <div className="em-door">
              <TierBadge tier={hop.home ? 'home' : hop.tier} size={24} />
              <span>
                Came in through <b>&ldquo;{pretty(hop.doorWord)}&rdquo;</b>
                {hop.forms.length && !hop.forms.includes(hop.doorWord.toLowerCase()) ? <> (as &ldquo;{pretty(hop.forms[0])}&rdquo;)</> : null}
                {' '}· {hop.home ? 'home' : TIER_NAMES[hop.tier]} · <b>+{hop.manna + hop.calf}</b> manna
              </span>
            </div>
          ) : (
            <div className="em-door"><TierBadge tier="home" size={24} /><span>Where the day began.</span></div>
          )}
          {next && (
            <div className="em-door out">
              <Icon name="hop" size="1.1rem" strokeWidth={2.4} />
              <span>Left by <b>&ldquo;{pretty(next.doorWord)}&rdquo;</b> for {next.toRef}</span>
            </div>
          )}
          {hop && (
            <span className="tags">
              {hop.refScore === 'exact' && <span className="pill soft">exact reference ×{hop.multiplier}</span>}
              {hop.refScore === 'chapter' && <span className="pill soft">right chapter ×{hop.multiplier}</span>}
              {hop.refScore === 'book' && <span className="pill soft">right book ×{hop.multiplier}</span>}
              {hop.revisit && <span className="pill soft">return visit, {hop.oil} oil</span>}
              {hop.widow > 0 && <span className="pill soft"><Icon name="lamp" size="0.8rem" /> +{hop.widow} oil</span>}
              {hop.calf > 0 && <span className="pill soft">Fatted Calf +{hop.calf}</span>}
              {hop.challenge && <span className="pill soft">{hop.challenge.kind === 'door' ? 'double door' : 'tag-along'} ×{hop.challenge.times}</span>}
            </span>
          )}
        </div>
      </div>

      <div className="em-nav">
        <button className="btn ghost" disabled={i === 0} onClick={() => go(i - 1)} aria-label="Previous stop"><Icon name="lookback" size="1rem" strokeWidth={2.4} /> Back</button>
        <span className="em-pips" aria-hidden="true">{f.road.map((_, k) => <i key={k} className={k === i ? 'on' : ''} />)}</span>
        <button className="btn" disabled={i === n - 1} onClick={() => go(i + 1)} aria-label="Next stop">Next <Icon name="hop" size="1rem" strokeWidth={2.4} /></button>
      </div>
    </div>
  );
}

/** Rule 13.5. */
function Numbers({ f }: { f: FinaleView }) {
  const n = f.numbers;
  const cells: [string, React.ReactNode][] = [
    ['Hops', n.hops],
    ['Manna', n.manna],
    ['Oil left', <>{n.oilLeft}<small>/{n.oilCap}</small></>],
    ['Books visited', n.books],
    ['Testaments', n.testaments],
    ['Rarest word', n.rarest ? <>{pretty(n.rarest.word)}<small> · {n.rarest.count} verses</small></> : '—'],
    ['Chapter and Verse', <>{n.exactRefs}<small> exact references</small></>],
    ['Return visits', n.revisits],
    ['Looks back', n.looksBack],
    ['Strikes', n.strikes],
    ['Grace', n.graceUsed ? 'used' : 'kept'],
  ];
  return (
    <div className="numbers">
      {cells.map(([k, v]) => (
        <div key={k} className="cell">
          <div className="k">{k}</div>
          <div className="v">{v}</div>
        </div>
      ))}
    </div>
  );
}

export function playFinaleSound(f: FinaleView): void {
  if (f.won) sound.home();
}
