// Today (rule 14.1), staged as a scene: a Bible in a beam of light on the desk, the day's verse,
// and everything else a step behind. The scene tilts toward the pointer (or the tilted phone).
// Tapping the Bible opens it and riffles through to the day's journey.
import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import type { TodayView, Wording } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { useApp } from '../app-store.ts';
import { haptics } from '../fx/haptics.ts';
import { leafTexture } from '../fx/paper.ts';
import { sound } from '../fx/sound.ts';
import { isReducedMotion } from '../prefs.ts';
import { navigate } from '../router.ts';
import { DotsDeco, Ornament, Sparkle, TornCorner, niceDate, press, timeLeft, useDocumentTitle } from '../ui/base.tsx';
import { BadgeShelf } from '../ui/Badges.tsx';
import { Book3D } from '../ui/Book3D.tsx';
import type { BookDims } from '../ui/Book3D.tsx';
import { Icon, TierBadge } from '../ui/icons.tsx';
import { useNow } from './journey/parts.tsx';

const pretty = (s: string) => s.replace(/'/g, '\u2019');
const DIMS: BookDims = { W: 118, H: 160, D: 12, B: 3, ov: 3 };
const BOOK_BOX = { w: 250, h: 230 };
const REST = 'translateY(0px) rotateX(-12deg) rotateY(32deg) rotateZ(-3deg) scale(1)';

/** The scene leans toward the pointer, or toward the way a phone is tilted. */
function useTilt(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el || isReducedMotion()) return;
    const set = (x: number, y: number) => {
      el.style.setProperty('--tx', (x * 6).toFixed(2));
      el.style.setProperty('--ty', (-y * 5).toFixed(2));
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    };
    let base: number | null = null;
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma === null || e.beta === null) return;
      base ??= e.beta;
      set(Math.max(-1, Math.min(1, e.gamma / 30)), Math.max(-1, Math.min(1, (e.beta - base) / 30)));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('deviceorientation', onTilt);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('deviceorientation', onTilt);
    };
  }, [ref]);
}

export function TodayScreen({ today, clockSkew }: { today: TodayView; clockSkew: number }) {
  useDocumentTitle('');
  const setToday = useApp((s) => s.setToday);
  const toast = useApp((s) => s.toast);
  const [wording, setWording] = useState<Wording>(today.player.wording);
  const [opening, setOpening] = useState(false);
  const now = useNow(1000) + clockSkew;
  const scene = useRef<HTMLDivElement>(null);
  const bookBox = useRef<HTMLButtonElement>(null);
  const veil = useRef<HTMLDivElement>(null);
  useTilt(scene);
  const home = today.home;
  const shown: Wording = home?.wordings[wording] ? wording : home?.wordings.kjv ? 'kjv' : 'web';
  const text = home ? (home.wordings[shown] ?? []).map((t) => pretty(t.s)).join('') : '';
  const left = today.deadline - now;
  const j = today.journey;
  const p = today.player;
  const started = !!j;
  const finished = j && j.status !== 'playing';
  const late = !started && today.lateMinutes !== null;
  const tex = useMemo(() => {
    const plain = (i: number) => leafTexture('crumb', DIMS.W, DIMS.H, i, true).toDataURL('image/jpeg', 0.8);
    return { right: plain(9), left: plain(8), leaves: [0, 1, 2, 3, 4, 5, 6].map((i) => ({ front: plain(i), back: plain(i + 1) })) };
  }, []);
  const dest = finished ? `/finale/${today.date}` : p.firstTime && !started ? '/play?guide=1' : '/play';

  const switchWording = (w: Wording) => {
    sound.unlock();
    sound.wording();
    setWording(w);
    void api.settings({ wording: w }).then((r) => setToday({ ...today, player: r.player })).catch(() => undefined);
  };

  /** Open the Bible, riffle the pages, and dive into the day. */
  const flipThrough = async () => {
    if (opening) return;
    press();
    if (!home) return;
    const box = bookBox.current, root = box?.querySelector<HTMLElement>('.b3d');
    if (!box || !root || isReducedMotion() || finished) return navigate(dest);
    setOpening(true);
    const anims: Animation[] = [];
    const go = (el: Element | null, kf: Keyframe[], o: KeyframeAnimationOptions) => {
      if (!el) return;
      const a = el.animate(kf, { fill: 'both', ...o });
      anims.push(a);
      return a;
    };
    // face the reader, open, riffle, then come close
    go(root, [
      { transform: REST },
      { transform: 'translateY(10px) rotateX(18deg) rotateY(0deg) rotateZ(0deg) scale(1.15)', offset: 0.18 },
      { transform: 'translateY(10px) rotateX(18deg) rotateY(0deg) rotateZ(0deg) scale(1.15)', offset: 0.78 },
      { transform: 'translateY(40px) rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(5)' },
    ], { duration: 2600, easing: 'cubic-bezier(.45,0,.25,1)' });
    go(root.querySelector('.b3d-left'), [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(-180deg)' }], { duration: 700, delay: 420, easing: 'cubic-bezier(.5,.02,.18,1)' });
    go(root.querySelector('.b3d-spine'), [{ opacity: 1 }, { opacity: 0 }], { duration: 300, delay: 520 });
    root.querySelectorAll('.b3d-leaf').forEach((leaf, i) => {
      go(leaf, [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(-180deg)' }], { duration: 360, delay: 1100 + i * 110, easing: 'cubic-bezier(.4,0,.2,1)' });
      window.setTimeout(() => {
        sound.flip('loaf', 1);
        haptics.play(7);
      }, 1100 + i * 110);
    });
    window.setTimeout(() => {
      sound.cover();
      haptics.play([16]);
    }, 400);
    const fade = go(veil.current, [{ opacity: 0 }, { opacity: 1 }], { duration: 420, delay: 2250, easing: 'ease-in' });
    await fade?.finished.catch(() => undefined);
    // the journey opens straight onto the verse: the Bible has already been opened here
    try {
      sessionStorage.setItem('bible-hopping.skipCover', '1');
    } catch {
      /* fine */
    }
    navigate(dest);
  };

  return (
    <div className="today paper-surface">
      <TornCorner corner="tl" seed={21} />
      <TornCorner corner="br" seed={34} />
      <div className="today-beam" aria-hidden="true">
        {Array.from({ length: 18 }, (_, i) => <i key={i} style={{ left: `${(i * 41) % 100}%`, animationDelay: `${(i * 0.7) % 9}s`, animationDuration: `${7 + (i % 5)}s` }} />)}
      </div>
      <Sparkle size={18} style={{ position: 'absolute', left: '6%', top: '19%', zIndex: 2 }} />
      <Sparkle size={14} style={{ position: 'absolute', right: '8%', top: '31%', zIndex: 2, animationDelay: '1.2s' }} className="on-paper" />
      <Sparkle size={16} style={{ position: 'absolute', right: '12%', bottom: '9%', zIndex: 2, animationDelay: '0.6s' }} />
      <Ornament size={34} style={{ position: 'absolute', left: '5%', bottom: '8%', zIndex: 2, opacity: 0.85 }} />
      <div className="today-scene" ref={scene}>
        <div className="today-inner today-tilt">
          <div className="today-top">
            <DotsDeco style={{ color: 'var(--white)' }} />
            <span style={{ display: 'flex', gap: '0.1rem' }}>
              <button className="icon-btn" onClick={() => { press(); navigate(`/standings/${today.date}`); }} aria-label="Standings">
                <Icon name="trophy" size="1.35rem" />
              </button>
              <button className="icon-btn" onClick={() => { press(); navigate('/history'); }} aria-label="History">
                <Icon name="ribbon" size="1.4rem" />
              </button>
              <button className="icon-btn" onClick={() => { press(); navigate('/settings'); }} aria-label="Settings">
                <Icon name="ornament" size="1.5rem" />
              </button>
            </span>
          </div>

          <div className="today-hero">
            <div className="hero-stage z3">
              <div className="hero-halo" aria-hidden="true" />
              <button ref={bookBox} className={`mini-bible ${opening ? 'opening' : ''}`} style={{ width: BOOK_BOX.w, height: BOOK_BOX.h }} onClick={flipThrough} aria-label={finished ? 'See your trip home' : started ? 'Continue your journey' : "Open today\u2019s Bible"}>
                <Book3D dims={DIMS} tex={tex} style={{ left: (BOOK_BOX.w - DIMS.W) / 2, top: (BOOK_BOX.h - DIMS.H) / 2 - 6, transformOrigin: `${DIMS.W / 2}px ${DIMS.H / 2}px ${DIMS.D}px` }} className={opening ? '' : 'floating'} />
              </button>
              {!opening && <span className="tap-hint">{finished ? 'See your trip' : started ? 'Tap to continue' : 'Tap to open'}</span>}
            </div>
            <div className="z2">
              <p className="eyebrow">A daily leap of faith</p>
              <h1 className="display">
                <span>Bible</span>
                <span className="caps foil">HOPPING</span>
              </h1>
              <div className="day-line">
                <span className="no">#{today.puzzleNo}</span>
                <span>{niceDate(today.date)}</span>
              </div>
            </div>
          </div>

          {today.notes.length > 0 && (
            <div className="notice" role="status">
              <Icon name="dove" />
              <span>
                {today.notes.map((n) => <span key={n.id} style={{ display: 'block' }}>{n.text}</span>)}
                <button className="btn small ghost" style={{ marginTop: '0.4rem' }} onClick={() => api.readNotes().then(() => setToday({ ...today, notes: [] }))}>Got it</button>
              </span>
            </div>
          )}
          {today.announcements.map((a) => (
            <div key={a.id} className="notice">
              <Icon name="sparkle" />
              <span><b>{a.title}</b>{a.body}</span>
            </div>
          ))}

          {home ? (
            <div className="card home-card z1">
              <div className="head">
                <div>
                  <div className="label"><Icon name="home" size="0.85rem" strokeWidth={2.6} /> Today&rsquo;s home verse</div>
                  <div className="ref">{home.ref}</div>
                </div>
                {today.features.wordingSwitch && (
                  <div className="seg" role="group" aria-label="Wording">
                    <button aria-pressed={shown === 'kjv'} disabled={!home.wordings.kjv} onClick={() => switchWording('kjv')}>KJV</button>
                    <button aria-pressed={shown === 'web'} disabled={!home.wordings.web} onClick={() => switchWording('web')}>WEB</button>
                  </div>
                )}
              </div>
              <p className="text">{text}</p>
              {today.theme && <p className="theme">{today.theme}</p>}
            </div>
          ) : (
            <div className="card home-card z1">
              <p className="text">The first verse arrives soon.</p>
            </div>
          )}

          <div className="cta z1">
            {finished ? (
              <>
                <button className="btn big gold" onClick={() => { press(); navigate(`/finale/${today.date}`); }}>
                  <Icon name={j.status === 'won' ? 'home' : 'moon'} size="1.2rem" strokeWidth={2.2} />
                  {j.status === 'won' ? 'See your trip home' : 'See how the day ended'}
                  <span className="chev"><Icon name="hop" size="1rem" strokeWidth={2.4} /></span>
                </button>
                <p className="when"><Icon name="clock" size="1rem" /> Tomorrow&rsquo;s verse arrives in {timeLeft(left)}</p>
              </>
            ) : (
              <>
                <button className="btn big gold" disabled={!home} onClick={flipThrough}>
                  <Icon name={started ? 'hop' : 'book'} size="1.2rem" strokeWidth={2.2} />
                  {started ? `Continue \u00b7 ${j.manna} manna` : p.firstTime ? 'Take your first hop' : "Start today\u2019s journey"}
                  <span className="chev"><Icon name="hop" size="1rem" strokeWidth={2.4} /></span>
                </button>
                {p.firstTime && !started && <button className="btn small ghost" onClick={() => { press(); navigate('/play'); }}>Skip the guide</button>}
                <p className={`when ${late ? 'late' : ''}`}>
                  <Icon name="clock" size="1rem" />
                  {late ? `The door shuts in ${timeLeft(left)}` : `${timeLeft(left)} until midnight, ${today.tzLabel}`}
                </p>
              </>
            )}
          </div>

          <div className="stat-row z1">
            <button className="stat" onClick={() => { press(); navigate('/history'); }} aria-label={`Streak: ${p.streak} days. Open history.`}>
              <span className="n"><Icon name="streak" /> {p.streak}</span>
              <span className="l">Streak</span>
            </button>
            <button className="stat" onClick={() => { press(); navigate('/history'); }} aria-label={`Treasure in Heaven: ${p.treasure}. Open history.`}>
              <span className="n"><Icon name="treasure" /> {p.treasure.toLocaleString()}</span>
              <span className="l">Treasure</span>
            </button>
            <button className="stat" onClick={() => { press(); if (today.yesterday?.status === 'won' || today.yesterday?.status === 'lost') navigate(`/finale/${today.yesterday.date}`); else navigate('/history'); }} aria-label={`Yesterday: ${yesterdayText(today)}. Open.`}>
              <span className="yest" aria-hidden="true"><Yesterday today={today} /></span>
              <span className="l">Yesterday</span>
            </button>
          </div>

          {today.features.achievements && today.badges.length > 0 && (
            <div className="z1">
              <BadgeShelf badges={today.badges} onPick={(b) => { press(); toast(`${b.name}: ${b.how}${b.earnedOn ? ' (earned)' : ''}`); }} />
            </div>
          )}

          <div className="links">
            <button className="btn small ghost" onClick={() => { press(); navigate(`/standings/${today.date}`); }}><Icon name="trophy" size="1rem" /> Standings</button>
            <button className="btn small ghost" onClick={() => { press(); navigate('/how'); }}><Icon name="book" size="1rem" /> How to play</button>
            {today.features.sundaySchool && <button className="btn small ghost" onClick={() => { press(); navigate('/practice'); }}><Icon name="lens" size="1rem" /> Sunday School</button>}
            {today.features.revelation && today.puzzleNo > 1 && <button className="btn small ghost" onClick={() => { press(); navigate(`/revelation/${today.yesterday?.date ?? today.date}`); }}><Icon name="sparkle" size="1rem" /> Revelation</button>}
          </div>
        </div>
      </div>
      <div ref={veil} className="flip-veil" aria-hidden="true" />
    </div>
  );
}

function yesterdayText(t: TodayView): string {
  const y = t.yesterday;
  if (!y) return 'nothing yet';
  if (y.status === 'won') return `home with ${y.manna} manna`;
  if (y.status === 'lost') return 'not home';
  if (y.status === 'rest') return 'a rest day';
  if (y.status === 'playing') return 'still open';
  return 'missed';
}

function Yesterday({ today }: { today: TodayView }) {
  const y = today.yesterday;
  if (!y || y.status === 'missed') return <span className="muted" style={{ fontSize: '0.8rem' }}>—</span>;
  if (y.status === 'rest') return <Icon name="moon" />;
  if (y.status === 'won') return <><TierBadge tier="home" size={22} /><span style={{ fontSize: '0.95rem', fontWeight: 700 }}>{y.manna}</span></>;
  return <Icon name="moon" style={{ opacity: 0.6 }} />;
}
