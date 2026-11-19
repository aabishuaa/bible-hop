// After the journey (section 13): welcome home or the loss, the trip map, the Emmaus Road,
// the Book of Numbers and the share card.
import { useEffect, useMemo, useState } from 'react';
import { DIVISIONS } from '../../../shared/books.ts';
import type { Tier } from '../../../shared/rules.ts';
import { TIER_NAMES } from '../../../shared/rules.ts';
import type { Achievement, BookSpan, FinaleView, HopRecord } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { useApp } from '../app-store.ts';
import { sound } from '../fx/sound.ts';
import { isReducedMotion } from '../prefs.ts';
import { navigate } from '../router.ts';
import { TIER_COLOR } from '../theme.ts';
import { BadgeCard, Medal } from '../ui/Badges.tsx';
import { Standings } from '../ui/Standings.tsx';
import { DotsDeco, LinesDeco, PaperCanvas, Torn, plural, press, useDocumentTitle } from '../ui/base.tsx';
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
    <div className="screen kraft">
      <Torn side="bottom" depth={14} seed={41} className="band-top">
        <div className="topbar">
          <button className="icon-btn" onClick={() => { press(); navigate('/'); }} aria-label="Back to today"><Icon name="lookback" size="1.3rem" /></button>
          <div className="title">{title}</div>
        </div>
      </Torn>
      <div className="page-wrap paper-surface">
        <PaperCanvas seed={12} />
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
          <p className="small muted">Every stop in order, from home. The word you came in by is highlighted; the word you left by is underlined.</p>
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

/** Rule 13.3: all 66 books on one line, each as wide as its share of the Bible, every hop an arc. */
export function TripMap({ f, books, route }: { f?: FinaleView; books: BookSpan[]; route?: { from: number; to: number; tier: Tier; home: boolean; revisit: boolean; door: string; fromRef: string; toRef: string }[] }) {
  const W = 1000, H = 150, base = 118;
  const x = (p: number) => 10 + p * (W - 20);
  const [sel, setSel] = useState<number | null>(null);
  const hops = useMemo(() => {
    if (route) return route;
    const path: HopRecord[] = f?.path ?? [];
    const stops = f?.road ?? [];
    return path.map((h, i) => ({ from: stops[i]?.position ?? 0, to: stops[i + 1]?.position ?? 0, tier: h.tier, home: h.home, revisit: h.revisit, door: h.doorWord, fromRef: h.fromRef, toRef: h.toRef }));
  }, [f, route]);
  const homePos = f?.road[0]?.position ?? hops[0]?.from ?? 0;
  const homeRef = f?.home.ref ?? hops[0]?.fromRef ?? '';
  const animate = !isReducedMotion();
  const divisions = useMemo(() => {
    const out: { name: string; start: number; end: number }[] = [];
    for (const d of DIVISIONS) {
      const mine = books.filter((b) => b.division === d);
      if (mine.length) out.push({ name: d, start: mine[0].start, end: mine[mine.length - 1].end });
    }
    return out;
  }, [books]);
  const s = sel !== null ? hops[sel] : null;
  return (
    <div className="tripmap card cream" style={{ padding: '0.9rem 0.8rem 0.7rem' }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`A map of the trip across the Bible: ${hops.length} hops from ${homeRef}.`}>
        {books.map((b, i) => (
          <rect key={b.name} x={x(b.start)} y={base - 5} width={Math.max(0.6, x(b.end) - x(b.start) - 0.8)} height={10} rx={1.5} fill={i % 2 ? '#d9bf94' : '#e7d2ad'} />
        ))}
        {divisions.map((d) => <line key={d.name} x1={x(d.start)} x2={x(d.start)} y1={base - 10} y2={base + 9} stroke="#9c7a4b" strokeWidth={1} />)}
        {hops.map((h, i) => {
          const a = x(h.from), b = x(h.to);
          const lift = 14 + Math.abs(b - a) * 0.19;
          const d = `M${a} ${base - 5} Q ${(a + b) / 2} ${base - 5 - lift * 2} ${b} ${base - 5}`;
          const len = Math.abs(b - a) + lift * 2.2;
          return (
            <g key={i}>
              <path
                className={`arc ${sel === i ? 'sel' : ''}`}
                d={d}
                stroke={h.home ? TIER_COLOR.home : TIER_COLOR[h.tier]}
                strokeWidth={h.home ? 3.4 : 2.4}
                strokeDasharray={animate ? len : undefined}
                strokeDashoffset={animate ? len : undefined}
                style={animate ? { animation: `draw 0.55s ease-out ${0.15 + i * 0.22}s forwards` } : undefined}
                opacity={h.revisit ? 0.42 : 1}
              />
              <path className="hit" d={d} onClick={() => { press(); setSel(sel === i ? null : i); }} />
            </g>
          );
        })}
        <style>{`@keyframes draw { to { stroke-dashoffset: 0; } }`}</style>
        {hops.map((h, i) => <circle key={`s${i}`} cx={x(h.to)} cy={base - 5} r={h.home ? 0 : 3.2} fill="#fffaf0" stroke={TIER_COLOR[h.tier]} strokeWidth={1.8} />)}
        <circle cx={x(homePos)} cy={base - 5} r={5.5} fill={TIER_COLOR.home} stroke="#fffaf0" strokeWidth={2} />
        <text x={x(homePos)} y={base + 26} textAnchor={homePos < 0.15 ? 'start' : homePos > 0.85 ? 'end' : 'middle'} fontSize="11" fontFamily="Poppins, sans-serif" fontWeight="600" fill={TIER_COLOR.home}>
          {homeRef} · home
        </text>
      </svg>
      <div className="divs" style={{ gridTemplateColumns: divisions.map((d) => `${((d.end - d.start) * 100).toFixed(2)}fr`).join(' ') }} aria-hidden="true">
        {divisions.map((d) => <span key={d.name}>{d.name === 'Gospels & Acts' ? 'Gospels' : d.name}</span>)}
      </div>
      <div className="info" aria-live="polite">
        {s ? (
          <>
            <TierBadge tier={s.home ? 'home' : s.tier} size={22} />
            <span>
              <b>{s.fromRef}</b> → <b>{s.toRef}</b> through &ldquo;{pretty(s.door)}&rdquo; ({s.home ? 'home' : TIER_NAMES[s.tier]}{s.revisit ? ', a return visit' : ''})
            </span>
          </>
        ) : (
          <span className="muted small">Tap an arc to see where it went.</span>
        )}
      </div>
    </div>
  );
}

/** Rule 13.4: the replay, stop by stop. */
function EmmausRoad({ f }: { f: FinaleView }) {
  const [shown, setShown] = useState(1);
  useEffect(() => {
    if (isReducedMotion() || f.road.length <= 1) {
      setShown(f.road.length);
      return;
    }
    let i = 1;
    const id = window.setInterval(() => {
      i++;
      setShown(i);
      if (i >= f.road.length) window.clearInterval(id);
    }, 420);
    return () => window.clearInterval(id);
  }, [f]);
  return (
    <div className="road">
      {f.road.slice(0, shown).map((stop, i) => {
        const hop = stop.hop;
        return (
          <div key={i}>
            {hop && (
              <div className="road-hop">
                <TierBadge tier={hop.home ? 'home' : hop.tier} size={22} />
                <span>
                  through <b>&ldquo;{pretty(hop.doorWord)}&rdquo;</b>
                  {hop.forms.length && !hop.forms.includes(hop.doorWord.toLowerCase()) ? <> (found as &ldquo;{pretty(hop.forms[0])}&rdquo;)</> : null}
                  {' '}· {hop.home ? 'home' : TIER_NAMES[hop.tier]} · <b>+{hop.manna + hop.calf}</b>
                </span>
                <span className="tags">
                  {hop.refScore === 'exact' && <span className="pill soft">exact reference ×{hop.multiplier}</span>}
                  {hop.refScore === 'chapter' && <span className="pill soft">right chapter ×{hop.multiplier}</span>}
                  {hop.refScore === 'book' && <span className="pill soft">right book ×{hop.multiplier}</span>}
                  {hop.revisit && <span className="pill soft">return visit, {hop.oil} oil</span>}
                  {hop.widow > 0 && <span className="pill soft"><Icon name="lamp" size="0.8rem" /> +{hop.widow} oil</span>}
                  {hop.calf > 0 && <span className="pill soft">Fatted Calf +{hop.calf}</span>}
                </span>
              </div>
            )}
            <div className={`road-stop tier-${hop ? (hop.home ? 'home' : hop.tier) : 'home'}`}>
              <div className="ref">
                {(i === 0 || hop?.home) && <Icon name="home" size="1rem" strokeWidth={2.4} style={{ color: 'var(--gold)' }} />}
                {stop.ref}
                <span className="pill line" style={{ marginLeft: 'auto', fontSize: '0.7rem' }}>{stop.wording.toUpperCase()}</span>
              </div>
              <p className="text">
                {stop.tokens.map((t, k) => (t.m ? <span key={k} className={t.m}>{pretty(t.s)}</span> : <span key={k}>{pretty(t.s)}</span>))}
              </p>
              {stop.cameByIn && <p className="note">The word you came in by is in the {stop.cameByIn.toUpperCase()} wording of this verse.</p>}
              {stop.leftByIn && <p className="note">The word you left by is in the {stop.leftByIn.toUpperCase()} wording of this verse.</p>}
            </div>
          </div>
        );
      })}
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
