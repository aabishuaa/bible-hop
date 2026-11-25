// Today (rule 14.1): a 3D Bible on the desk, the day's verse, and the way in.
// The screen holds still; tapping the Bible flips through it, just for the fun of it.
import { useMemo, useRef, useState } from 'react';
import type { TodayView } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { useApp } from '../app-store.ts';
import { haptics } from '../fx/haptics.ts';
import { leafTexture } from '../fx/paper.ts';
import { sound } from '../fx/sound.ts';
import { isReducedMotion } from '../prefs.ts';
import { navigate } from '../router.ts';
import { Ornament, niceDate, press, timeLeft, useDocumentTitle } from '../ui/base.tsx';
import { Book3D } from '../ui/Book3D.tsx';
import type { BookDims } from '../ui/Book3D.tsx';
import { Icon } from '../ui/icons.tsx';
import { Logo } from '../ui/Logo.tsx';
import { useNow } from './journey/parts.tsx';

const DIMS: BookDims = { W: 136, H: 184, D: 14, B: 3.5, ov: 3.5 };
const BOOK_BOX = { w: 300, h: 250 };
const REST = 'translate(0px, 0px) rotateX(-12deg) rotateY(32deg) rotateZ(-3deg) scale(1)';

export function TodayScreen({ today, clockSkew }: { today: TodayView; clockSkew: number }) {
  useDocumentTitle('');
  const setToday = useApp((s) => s.setToday);
  const playing = useRef(false);
  const now = useNow(1000) + clockSkew;
  const bookBox = useRef<HTMLButtonElement>(null);
  const home = today.home;
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

  const status = finished
    ? j.status === 'won' ? `Home with ${j.manna} manna` : 'The door shut on this one'
    : started ? `On your way \u00b7 ${j.hops} ${j.hops === 1 ? 'hop' : 'hops'} \u00b7 ${j.manna} manna`
    : 'A new verse is waiting for you';
  const dayLeft = Math.max(0, Math.min(1, left / 86_400_000));
  const tiles: { icon: string; label: string; sub: string; tone: string; go: () => void; show: boolean }[] = [
    { icon: 'trophy', label: 'Standings', sub: 'Live board', tone: 'gold', go: () => navigate(`/standings/${today.date}`), show: true },
    { icon: 'medal', label: 'Badges', sub: 'Your medals', tone: 'crimson', go: () => navigate('/achievements'), show: today.features.achievements },
    { icon: 'lens', label: 'Sunday School', sub: 'Practice any verse', tone: 'fish', go: () => navigate('/practice'), show: today.features.sundaySchool },
    { icon: 'book', label: 'How to play', sub: 'The rules', tone: 'loaf', go: () => navigate('/how'), show: true },
    { icon: 'sparkle', label: 'Revelation', sub: "Yesterday\u2019s results", tone: 'pearl', go: () => navigate(`/revelation/${today.yesterday?.date ?? today.date}`), show: today.features.revelation && today.puzzleNo > 1 },
  ];

  return (
    <div className="home2">
      <div className="home2-bg" aria-hidden="true" />
      <div className="home2-inner">
        <header className="home2-top">
          <span className="home2-mark" aria-hidden="true"><Ornament size={30} /></span>
          <nav className="home2-nav" aria-label="Menu">
            <button className="glass-icon" onClick={() => { press(); navigate('/history'); }} aria-label="History"><Icon name="ribbon" size="1.25rem" /></button>
            <button className="glass-icon" onClick={() => { press(); navigate('/settings'); }} aria-label="Settings"><Icon name="ornament" size="1.35rem" /></button>
          </nav>
        </header>

        <section className="home2-hero">
          <button ref={bookBox} className="mini-bible" style={{ width: BOOK_BOX.w, height: BOOK_BOX.h }} onClick={flipThrough} aria-label="Flip through the Bible">
            <Book3D dims={DIMS} tex={tex} style={{ left: (BOOK_BOX.w - DIMS.W) / 2, top: (BOOK_BOX.h - DIMS.H) / 2 - 6, transformOrigin: `${DIMS.W / 2}px ${DIMS.H / 2}px ${DIMS.D}px`, transform: REST }} />
          </button>
          <h1 className="home2-logo"><Logo tagline="A daily leap of faith" /></h1>
        </section>

        {today.notes.length > 0 && (
          <div className="glass notice2" role="status">
            <Icon name="dove" />
            <span>
              {today.notes.map((n) => <span key={n.id} style={{ display: 'block' }}>{n.text}</span>)}
              <button className="btn small ghost" style={{ marginTop: '0.4rem' }} onClick={() => api.readNotes().then(() => setToday({ ...today, notes: [] }))}>Got it</button>
            </span>
          </div>
        )}
        {today.announcements.map((a) => (
          <div key={a.id} className="glass notice2">
            <Icon name="sparkle" />
            <span><b>{a.title}</b> {a.body}</span>
          </div>
        ))}

        <section className="glass play-card">
          <div className="pc-head">
            <span className="pc-no">#{today.puzzleNo}</span>
            <span className="pc-date">{niceDate(today.date)}</span>
          </div>
          <p className="pc-status">{status}</p>
          {finished ? (
            <button className="btn big gold pc-cta" onClick={() => { press(); navigate(`/finale/${today.date}`); }}>
              <Icon name={j.status === 'won' ? 'home' : 'moon'} size="1.25rem" strokeWidth={2.2} />
              {j.status === 'won' ? 'See your trip home' : 'See how the day ended'}
            </button>
          ) : (
            <button className="btn big gold pc-cta" disabled={!home} onClick={() => { press(); navigate(dest); }}>
              <Icon name={started ? 'hop' : 'book'} size="1.25rem" strokeWidth={2.2} />
              {started ? 'Continue your journey' : p.firstTime ? 'Take your first hop' : "Start today\u2019s journey"}
            </button>
          )}
          <div className={`pc-clock ${late ? 'late' : ''}`}>
            <svg viewBox="0 0 36 36" className="pc-ring" aria-hidden="true">
              <circle cx="18" cy="18" r="15" className="track" />
              <circle cx="18" cy="18" r="15" className="fill" strokeDasharray={`${(dayLeft * 94.25).toFixed(2)} 94.25`} />
            </svg>
            <span>
              {finished ? <>Next verse in <b>{timeLeft(left)}</b></> : late ? <>The door shuts in <b>{timeLeft(left)}</b></> : <><b>{timeLeft(left)}</b> until midnight</>}
            </span>
          </div>
          {p.firstTime && !started && <button className="pc-skip" onClick={() => { press(); navigate('/play'); }}>Skip the guide</button>}
        </section>

        <section className="home2-stats">
          <button className="glass stat2" onClick={() => { press(); navigate('/history'); }} aria-label={`Streak: ${p.streak} days. Open history.`}>
            <span className="orb tone-loaf"><Icon name="streak" /></span>
            <b className="tabular">{p.streak}</b>
            <span>Streak</span>
          </button>
          <button className="glass stat2" onClick={() => { press(); navigate('/history'); }} aria-label={`Treasure in Heaven: ${p.treasure}. Open history.`}>
            <span className="orb tone-gold"><Icon name="treasure" /></span>
            <b className="tabular">{p.treasure.toLocaleString()}</b>
            <span>Treasure</span>
          </button>
          <button className="glass stat2" onClick={() => { press(); if (today.yesterday?.status === 'won' || today.yesterday?.status === 'lost') navigate(`/finale/${today.yesterday.date}`); else navigate('/history'); }} aria-label={`Yesterday: ${yesterdayText(today)}. Open.`}>
            <span className="orb tone-fish"><Icon name={today.yesterday?.status === 'won' ? 'home' : 'moon'} /></span>
            <b className="tabular">{today.yesterday?.status === 'won' ? today.yesterday.manna : '\u2014'}</b>
            <span>Yesterday</span>
          </button>
        </section>

        <section className="home2-tiles">
          {tiles.filter((t) => t.show).map((t) => (
            <button key={t.label} className="glass tile2" onClick={() => { press(); t.go(); }}>
              <span className={`orb tone-${t.tone}`}><Icon name={t.icon} /></span>
              <span className="tile2-text"><b>{t.label}</b><small>{t.sub}</small></span>
              <Icon name="hop" className="tile2-go" size="1rem" strokeWidth={2.2} />
            </button>
          ))}
        </section>
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
