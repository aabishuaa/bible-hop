// Today (rule 14.1): a 3D Bible on the desk, the day's verse, and the way in.
// The screen holds still; tapping the Bible flips through it, just for the fun of it.
import { useMemo, useRef, useState } from 'react';
import type { TodayView, Wording } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { useApp } from '../app-store.ts';
import { haptics } from '../fx/haptics.ts';
import { leafTexture } from '../fx/paper.ts';
import { sound } from '../fx/sound.ts';
import { isReducedMotion } from '../prefs.ts';
import { navigate } from '../router.ts';
import { DotsDeco, Ornament, Sparkle, TornCorner, niceDate, press, timeLeft, useDocumentTitle } from '../ui/base.tsx';
import { Book3D } from '../ui/Book3D.tsx';
import type { BookDims } from '../ui/Book3D.tsx';
import { Icon, TierBadge } from '../ui/icons.tsx';
import { useNow } from './journey/parts.tsx';

const pretty = (s: string) => s.replace(/'/g, '\u2019');
const DIMS: BookDims = { W: 118, H: 160, D: 12, B: 3, ov: 3 };
const BOOK_BOX = { w: 250, h: 230 };
const REST = 'translate(0px, 0px) rotateX(-12deg) rotateY(32deg) rotateZ(-3deg) scale(1)';

export function TodayScreen({ today, clockSkew }: { today: TodayView; clockSkew: number }) {
  useDocumentTitle('');
  const setToday = useApp((s) => s.setToday);
  const [wording, setWording] = useState<Wording>(today.player.wording);
  const playing = useRef(false);
  const now = useNow(1000) + clockSkew;
  const bookBox = useRef<HTMLButtonElement>(null);
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

  /** Something to play with: the Bible turns to you, opens, riffles its pages, closes and settles back. */
  const flipThrough = () => {
    press();
    const root = bookBox.current?.querySelector<HTMLElement>('.b3d');
    if (!root || playing.current || isReducedMotion()) return;
    playing.current = true;
    const T = 3500;
    const at = (ms: number) => Math.min(1, ms / T);
    const opts: KeyframeAnimationOptions = { duration: T, easing: 'linear' };
    // open, the spine sits in the middle, so the book shifts right by half a page
    const FACE = `translate(${DIMS.W / 2}px, 6px) rotateX(16deg) rotateY(0deg) rotateZ(0deg) scale(1.08)`;
    const ease = 'cubic-bezier(.45,0,.25,1)';
    const done = root.animate([
      { transform: REST, offset: 0, easing: ease },
      { transform: FACE, offset: at(450) },
      { transform: FACE, offset: at(3200), easing: ease },
      { transform: REST, offset: 1 },
    ], opts);
    root.querySelector('.b3d-left')?.animate([
      { transform: 'rotateY(0deg)', offset: 0 },
      { transform: 'rotateY(0deg)', offset: at(380), easing: 'cubic-bezier(.5,.02,.18,1)' },
      { transform: 'rotateY(-180deg)', offset: at(1050) },
      { transform: 'rotateY(-180deg)', offset: at(2720), easing: 'cubic-bezier(.6,0,.4,1)' },
      { transform: 'rotateY(0deg)', offset: at(3200) },
      { transform: 'rotateY(0deg)', offset: 1 },
    ], opts);
    root.querySelector('.b3d-spine')?.animate([{ opacity: 1, offset: 0 }, { opacity: 1, offset: at(450) }, { opacity: 0, offset: at(700) }, { opacity: 0, offset: at(3050) }, { opacity: 1, offset: at(3200) }, { opacity: 1, offset: 1 }], opts);
    const leaves = [...root.querySelectorAll('.b3d-leaf')];
    leaves.forEach((leaf, i) => {
      const go = 1050 + i * 110, back = 2150 + (leaves.length - 1 - i) * 45;
      leaf.animate([
        { transform: 'rotateY(0deg)', offset: 0 },
        { transform: 'rotateY(0deg)', offset: at(go), easing: 'cubic-bezier(.4,0,.2,1)' },
        { transform: 'rotateY(-180deg)', offset: at(go + 360) },
        { transform: 'rotateY(-180deg)', offset: at(back), easing: 'cubic-bezier(.4,0,.2,1)' },
        { transform: 'rotateY(0deg)', offset: at(back + 280) },
        { transform: 'rotateY(0deg)', offset: 1 },
      ], opts);
      window.setTimeout(() => {
        sound.flip('loaf', 1);
        haptics.play(7);
      }, go);
    });
    window.setTimeout(() => sound.flip('fish', -1), 2150);
    window.setTimeout(() => {
      sound.cover();
      haptics.play([16]);
    }, 380);
    window.setTimeout(() => {
      sound.land('crumb');
      haptics.play([14]);
    }, 3180);
    done.finished.finally(() => {
      playing.current = false;
    });
  };

  return (
    <div className="today paper-surface">
      <TornCorner corner="tl" seed={21} />
      <TornCorner corner="br" seed={34} />
      <Sparkle size={18} twinkle={false} style={{ position: 'absolute', left: '6%', top: '19%', zIndex: 2 }} />
      <Sparkle size={14} twinkle={false} style={{ position: 'absolute', right: '8%', top: '31%', zIndex: 2 }} className="on-paper" />
      <Sparkle size={16} twinkle={false} style={{ position: 'absolute', right: '12%', bottom: '9%', zIndex: 2 }} />
      <Ornament size={34} style={{ position: 'absolute', left: '5%', bottom: '8%', zIndex: 2, opacity: 0.85 }} />
      <div className="today-scene">
        <div className="today-inner">
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
              <button ref={bookBox} className="mini-bible" style={{ width: BOOK_BOX.w, height: BOOK_BOX.h }} onClick={flipThrough} aria-label="Flip through the Bible">
                <Book3D dims={DIMS} tex={tex} style={{ left: (BOOK_BOX.w - DIMS.W) / 2, top: (BOOK_BOX.h - DIMS.H) / 2 - 6, transformOrigin: `${DIMS.W / 2}px ${DIMS.H / 2}px ${DIMS.D}px`, transform: REST }} />
              </button>
              <span className="tap-hint">Tap to flip through</span>
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
                <button className="btn big gold" disabled={!home} onClick={() => { press(); navigate(dest); }}>
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

          <div className="links">
            <button className="btn small ghost" onClick={() => { press(); navigate(`/standings/${today.date}`); }}><Icon name="trophy" size="1rem" /> Standings</button>
            {today.features.achievements && <button className="btn small ghost" onClick={() => { press(); navigate('/achievements'); }}><Icon name="medal" size="1rem" /> Badges</button>}
            <button className="btn small ghost" onClick={() => { press(); navigate('/how'); }}><Icon name="book" size="1rem" /> How to play</button>
            {today.features.sundaySchool && <button className="btn small ghost" onClick={() => { press(); navigate('/practice'); }}><Icon name="lens" size="1rem" /> Sunday School</button>}
            {today.features.revelation && today.puzzleNo > 1 && <button className="btn small ghost" onClick={() => { press(); navigate(`/revelation/${today.yesterday?.date ?? today.date}`); }}><Icon name="sparkle" size="1rem" /> Revelation</button>}
          </div>
        </div>
      </div>
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
