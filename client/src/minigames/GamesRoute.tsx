// The daily games: the hub at /games, and one round at /games/:id (intro, play, result).
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import type { ActionState, BabbleState, BookItState, GameId, GameState, GamesHub, WhoState } from '../../../shared/minigames.ts';
import { GAMES } from '../../../shared/minigames.ts';
import { ApiError, api } from '../api.ts';
import { haptics } from '../fx/haptics.ts';
import { sound } from '../fx/sound.ts';
import { navigate } from '../router.ts';
import { press, timeLeft, useDocumentTitle } from '../ui/base.tsx';
import { Icon } from '../ui/icons.tsx';
import { BabbleRecap, BibleOrBabble } from './BibleOrBabble.tsx';
import { BookIt, BookItRecap } from './BookIt.tsx';
import { Intro, ResultCard, TONES } from './shell.tsx';
import { WhoArtThou, WhoRecap } from './WhoArtThou.tsx';
import './games.css';

const FixYourEyes = lazy(() => import('./FixYourEyes.tsx'));
const LoavesAndFishes = lazy(() => import('./LoavesAndFishes.tsx'));

export interface GameProps<S extends GameState> {
  state: S;
  clock: () => number;
  answer: (body: Record<string, unknown>) => Promise<GameState | null>;
  finish: (body: Record<string, unknown>) => Promise<GameState | null>;
}

function Frame({ title, back = '/games', children }: { title: React.ReactNode; back?: string; children: React.ReactNode }) {
  return (
    <div className="screen leather">
      <header className="bar bar-top">
        <div className="topbar">
          <button className="icon-btn" onClick={() => { press(); navigate(back); }} aria-label="Back"><Icon name="lookback" size="1.3rem" /></button>
          <div className="title">{title}</div>
        </div>
      </header>
      <div className="page-wrap">
        <div className="sheet-page mg-page">{children}</div>
      </div>
    </div>
  );
}

export default function GamesRoute({ path }: { path: string }) {
  const id = path.split('/')[2] as GameId | undefined;
  if (id && GAMES.some((g) => g.id === id)) return <GameScreen key={id} id={id} />;
  return <GamesHubScreen />;
}

// ------------------------------------------------------------------------------------- the hub

function GamesHubScreen() {
  useDocumentTitle('Daily games');
  const [hub, setHub] = useState<GamesHub | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api.games().then(setHub).catch((e: Error) => setErr(e.message));
  }, []);
  const done = hub?.plays.filter((p) => p.done).length ?? 0;
  return (
    <Frame title="Daily games" back="/">
      <p className="eyebrow">{hub ? `Round #${hub.puzzleNo}` : 'Today'}</p>
      <h1 className="display">Today&rsquo;s <em>games</em></h1>
      <p className="lead">Five small games, one round of each a day, the same for everyone. The daily journey is still the heart of it all.</p>
      {err && <p className="msg-line bad">{err}</p>}
      {hub && !hub.enabled && <p className="msg-line info">The daily games are resting today. The daily journey is open as always.</p>}
      {hub && (
        <div className="hub-progress">
          <span className="hub-dots" aria-hidden="true">{hub.plays.map((p) => <i key={p.game} className={p.done ? (p.won ? 'won' : 'done') : ''} />)}</span>
          <span><b>{done}</b> of {GAMES.length} played</span>
          <span className="hub-next"><Icon name="clock" /> New round in {timeLeft(hub.nextIn)}</span>
        </div>
      )}
      <div className="hub-list">
        {GAMES.map((g, i) => {
          const p = hub?.plays.find((x) => x.game === g.id);
          return (
            <button key={g.id} className={`hub-card ${p?.done ? 'done' : ''}`} style={{ ['--i' as string]: i }} onClick={() => { press(); navigate(`/games/${g.id}`); }}>
              <span className={`orb tone-${TONES[g.id]}`}><Icon name={g.icon} /></span>
              <span className="hub-text">
                <b>{g.name}</b>
                <small>{g.tagline}</small>
                <span className="hub-meta">
                  {p?.done ? <span className={`hub-res ${p.won ? 'won' : ''}`}><Icon name={p.won ? 'sparkle' : 'moon'} /> {p.line}</span> : <span><Icon name="clock" /> {p?.played ? 'Under way' : g.timing}</span>}
                  {p && p.streak > 1 && <span className="hub-streak"><Icon name="streak" /> {p.streak}</span>}
                </span>
              </span>
              <span className="hub-go">{p?.done ? <Icon name="lookback" /> : <>Play <Icon name="hop" strokeWidth={2.4} /></>}</span>
            </button>
          );
        })}
      </div>
    </Frame>
  );
}

// ------------------------------------------------------------------------------------ a round

function GameScreen({ id }: { id: GameId }) {
  const info = GAMES.find((g) => g.id === id)!;
  useDocumentTitle(info.name);
  const [hub, setHub] = useState<GamesHub | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [phase, setPhase] = useState<'loading' | 'intro' | 'play' | 'done'>('loading');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const skew = useRef(0);
  const clock = useCallback(() => Date.now() + skew.current, []);

  const accept = useCallback((s: GameState) => {
    skew.current = s.now - Date.now();
    setState(s);
    setPhase((was) => {
      const next = s.done ? 'done' : 'play';
      if (was !== next) sound.flip('loaf', 1);
      return next;
    });
    if (s.done) void api.games().then(setHub).catch(() => undefined);
    return s;
  }, []);
  const fail = useCallback((e: unknown) => {
    setErr(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
    return null;
  }, []);

  useEffect(() => {
    api.games().then((h) => {
      setHub(h);
      const mine = h.plays.find((p) => p.game === id);
      if (mine?.played) return api.gameStart(id).then(accept);
      setPhase('intro');
      return null;
    }).catch(fail);
  }, [id, accept, fail]);

  const begin = () => {
    press();
    haptics.play([8, 30, 8]);
    setBusy(true);
    api.gameStart(id).then(accept).catch(fail).finally(() => setBusy(false));
  };
  const answer = useCallback((body: Record<string, unknown>) => api.gameAnswer(id, body).then(accept).catch(fail), [id, accept, fail]);
  const finish = useCallback((body: Record<string, unknown>) => api.gameFinish(id, body).then(accept).catch(fail), [id, accept, fail]);

  const nextGame = hub ? GAMES.find((g) => g.id !== id && !hub.plays.find((p) => p.game === g.id)?.done) : undefined;
  const props = state ? { clock, answer, finish } : null;
  return (
    <Frame title={<>{info.name}{hub && <small>#{hub.puzzleNo}</small>}</>}>
      {err && <p className="msg-line bad">{err}</p>}
      {phase === 'loading' && <p className="muted">Setting the table&hellip;</p>}
      <div key={phase} className="mg-turn">
        {phase === 'intro' && <Intro info={info} onBegin={begin} busy={busy} />}
        {phase === 'play' && state && props && (
          <>
            {state.game === 'bookit' && <BookIt state={state as BookItState} {...props} />}
            {state.game === 'whoartthou' && <WhoArtThou state={state as WhoState} {...props} />}
            {state.game === 'babble' && <BibleOrBabble state={state as BabbleState} {...props} />}
            <Suspense fallback={<p className="muted">Calming the sea&hellip;</p>}>
              {state.game === 'fixyoureyes' && <FixYourEyes state={state as ActionState} {...props} />}
              {state.game === 'loaves' && <LoavesAndFishes state={state as ActionState} {...props} />}
            </Suspense>
          </>
        )}
        {phase === 'done' && state?.result && (
          <ResultCard info={info} result={state.result} nextGame={nextGame} nextIn={hub?.nextIn}>
            {state.game === 'bookit' && <BookItRecap state={state as BookItState} />}
            {state.game === 'whoartthou' && <WhoRecap state={state as WhoState} />}
            {state.game === 'babble' && <BabbleRecap state={state as BabbleState} />}
          </ResultCard>
        )}
      </div>
    </Frame>
  );
}
