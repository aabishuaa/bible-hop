// Today (rule 14.1): the puzzle number, the date, the home verse with the wording switch,
// the time until the door shuts, Start or Continue, yesterday's result, the streak,
// Treasure in Heaven and How to play.
import { useState } from 'react';
import type { TodayView, Wording } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { useApp } from '../app-store.ts';
import { sound } from '../fx/sound.ts';
import { navigate } from '../router.ts';
import { DotsDeco, Ornament, Sparkle, TornCorner, niceDate, press, timeLeft, useDocumentTitle } from '../ui/base.tsx';
import { Book3D } from '../ui/Book3D.tsx';
import { Icon, TierBadge } from '../ui/icons.tsx';
import { useNow } from './journey/parts.tsx';

const pretty = (s: string) => s.replace(/'/g, '’');

export function TodayScreen({ today, clockSkew }: { today: TodayView; clockSkew: number }) {
  useDocumentTitle('');
  const setToday = useApp((s) => s.setToday);
  const [wording, setWording] = useState<Wording>(today.player.wording);
  const now = useNow(1000) + clockSkew;
  const home = today.home;
  const shown: Wording = home?.wordings[wording] ? wording : home?.wordings.kjv ? 'kjv' : 'web';
  const text = home ? (home.wordings[shown] ?? []).map((t) => pretty(t.s)).join('') : '';
  const left = today.deadline - now;
  const j = today.journey;
  const p = today.player;
  const started = !!j;
  const finished = j && j.status !== 'playing';
  const late = !started && today.lateMinutes !== null;

  const switchWording = (w: Wording) => {
    sound.unlock();
    sound.wording();
    setWording(w);
    void api.settings({ wording: w }).then((r) => setToday({ ...today, player: r.player })).catch(() => undefined);
  };

  return (
    <div className="today paper-surface">
      <TornCorner corner="tl" seed={21} />
      <TornCorner corner="br" seed={34} />
      <Sparkle size={18} style={{ position: 'absolute', left: '6%', top: '19%', zIndex: 2 }} />
      <Sparkle size={14} style={{ position: 'absolute', right: '8%', top: '31%', zIndex: 2, animationDelay: '1.2s' }} className="on-paper" />
      <Sparkle size={16} style={{ position: 'absolute', right: '12%', bottom: '9%', zIndex: 2, animationDelay: '0.6s' }} />
      <Ornament size={44} style={{ position: 'absolute', right: '5%', top: '7%', zIndex: 2, opacity: 0.85 }} />
      <Ornament size={34} style={{ position: 'absolute', left: '5%', bottom: '8%', zIndex: 2, opacity: 0.85 }} />
      <div className="today-inner">
        <div className="today-top">
          <DotsDeco style={{ color: 'var(--white)' }} />
          <span style={{ display: 'flex', gap: '0.1rem' }}>
            <button className="icon-btn" onClick={() => { press(); navigate('/history'); }} aria-label="History">
              <Icon name="ribbon" size="1.4rem" />
            </button>
            <button className="icon-btn" onClick={() => { press(); navigate('/settings'); }} aria-label="Settings">
              <Icon name="ornament" size="1.5rem" />
            </button>
          </span>
        </div>

        <div className="today-hero">
          <button className="mini-bible" onClick={() => { press(); navigate(today.journey && today.journey.status !== 'playing' ? `/finale/${today.date}` : '/play'); }} aria-label={started ? 'Continue your journey' : "Open today\u2019s Bible"}>
            <Book3D dims={{ W: 84, H: 114, D: 9, B: 3, ov: 3 }} style={{ left: 38, top: 18, transformOrigin: '42px 57px 9px' }} className="floating" />
          </button>
          <p className="eyebrow">A daily leap of faith</p>
          <h1 className="display">
            <span>Bible</span>
            <span className="caps">HOPPING</span>
          </h1>
          <p className="tagline">Hop from verse to verse, and make it home before midnight.</p>
          <div className="day-line">
            <span className="no">#{today.puzzleNo}</span>
            <span>{niceDate(today.date)}</span>
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
          <div className="card home-card">
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
          <div className="card home-card">
            <p className="text">The first verse arrives soon. Puzzle #1 begins on {niceDate(today.date)} where you are.</p>
          </div>
        )}

        <div className="cta">
          {finished ? (
            <>
              <button className="btn big gold" onClick={() => { press(); navigate(`/finale/${today.date}`); }}>
                <Icon name={j.status === 'won' ? 'home' : 'moon'} size="1.2rem" strokeWidth={2.2} />
                {j.status === 'won' ? 'See your trip home' : 'See how the day ended'}
                <span className="chev"><Icon name="hop" size="1rem" strokeWidth={2.4} /></span>
              </button>
              <p className="when">
                <Icon name="clock" size="1rem" /> Tomorrow&rsquo;s verse arrives in {timeLeft(left)}
              </p>
            </>
          ) : (
            <>
              {p.firstTime && !started && (
                <button className="btn big" onClick={() => { press(); navigate('/play?guide=1'); }}>
                  <Icon name="sparkle" size="1.1rem" /> Take your first hop
                  <span className="chev"><Icon name="hop" size="1rem" strokeWidth={2.4} /></span>
                </button>
              )}
              <button className={`btn big ${p.firstTime && !started ? 'ghost' : 'tier'}`} style={{ ['--accent' as string]: 'var(--brown)' }} disabled={!home} onClick={() => { press(); navigate('/play'); }}>
                <Icon name={started ? 'hop' : 'book'} size="1.2rem" strokeWidth={2.2} />
                {started ? `Continue · ${j.hops} ${j.hops === 1 ? 'hop' : 'hops'} · ${j.manna} manna` : "Start today’s journey"}
                {!p.firstTime && <span className="chev"><Icon name="hop" size="1rem" strokeWidth={2.4} /></span>}
              </button>
              <p className={`when ${late ? 'late' : ''}`}>
                <Icon name="clock" size="1rem" />
                {late ? `The door shuts in ${timeLeft(left)}, ${today.tzLabel}` : `The door shuts at midnight, ${today.tzLabel} · ${timeLeft(left)} left`}
              </p>
            </>
          )}
        </div>

        <div className="stat-row">
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
          <button className="btn small ghost" onClick={() => { press(); navigate('/how'); }}><Icon name="book" size="1rem" /> How to play</button>
          {today.features.sundaySchool && <button className="btn small ghost" onClick={() => { press(); navigate('/practice'); }}><Icon name="lens" size="1rem" /> Sunday School</button>}
          {today.features.revelation && today.puzzleNo > 1 && <button className="btn small ghost" onClick={() => { press(); navigate(`/revelation/${today.yesterday?.date ?? today.date}`); }}><Icon name="sparkle" size="1rem" /> Revelation</button>}
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
