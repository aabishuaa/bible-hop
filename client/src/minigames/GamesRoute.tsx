// The daily games: the hub at /games, and one round at /games/:id (intro, play, result).
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import type { ActionState, BabbleState, BookItState, GameId, GameInfo, GameState, GamesHub, PlaySummary, WhoState } from '../../../shared/minigames.ts';
import { GAMES, lineup } from '../../../shared/minigames.ts';
import { ApiError, api } from '../api.ts';
import { haptics } from '../fx/haptics.ts';
import { sound } from '../fx/sound.ts';
import { navigate } from '../router.ts';
import { press, useDocumentTitle } from '../ui/base.tsx';
import { Icon } from '../ui/icons.tsx';
import { BabbleRecap, BibleOrBabble } from './BibleOrBabble.tsx';
import { BookIt, BookItRecap } from './BookIt.tsx';
import { Intro, ResultCard, TONES, useTick } from './shell.tsx';
import { WhoArtThou, WhoRecap } from './WhoArtThou.tsx';
import './games.css';

const FixYourEyes = lazy(() => import('./FixYourEyes.tsx'));
const LoavesAndFishes = lazy(() => import('./LoavesAndFishes.tsx'));

export interface GameProps<S extends GameState> {
  state: S;
  clock: () => number;
  answer: (body: Record<string, unknown>) => Promise<GameState | null>;
  finish: (body: Record<string, unknown>) => Promise<GameState | null>;
  /** On to the result. The quiz games call it once they've shown how the round ended. */
  onDone: () => void;
}

const QUIZ: GameId[] = ['bookit', 'whoartthou', 'babble'];

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
  // resting games stay playable by their address
  if (id && GAMES.some((g) => g.id === id)) return <GameScreen key={id} id={id} />;
  return <GamesHubScreen />;
}

/** H:MM:SS until the next round, ticking. */
function Countdown({ ms }: { ms: number }) {
  const until = useRef(Date.now() + ms);
  useEffect(() => {
    until.current = Date.now() + ms;
  }, [ms]);
  useTick(1000);
  const s = Math.max(0, Math.floor((until.current - Date.now()) / 1000));
  return <b className="tabular">{Math.floor(s / 3600)}:{String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:{String(s % 60).padStart(2, '0')}</b>;
}

// ------------------------------------------------------------------------------------- the hub

function HubCard({ g, p, i }: { g: GameInfo; p?: PlaySummary; i: number }) {
  const done = !!p?.done;
  return (
    <button className={`hub-card tone-${TONES[g.id]} ${done ? 'done' : ''} ${p?.won ? 'won' : ''}`} style={{ ['--i' as string]: i }} onClick={() => { press(); navigate(`/games/${g.id}`); }}>
      <span className="hub-art" aria-hidden="true">
        <span className={`orb tone-${TONES[g.id]}`}><Icon name={g.icon} /></span>
        {done && <span className={`hub-tick ${p?.won ? 'won' : ''}`}><Icon name={p?.won ? 'sparkle' : 'moon'} /></span>}
      </span>
      <span className="hub-text">
        <b>{g.name}</b>
        <small>{g.tagline}</small>
        <span className="hub-row">
          <span className="hub-meta">
            {done
              ? <span className={`hub-res ${p?.won ? 'won' : ''}`}>{p?.line}</span>
              : <span><Icon name="clock" /> {p?.played ? 'Under way' : g.timing}</span>}
            {p && p.streak > 0 && <span className="hub-streak"><Icon name="streak" /> {p.streak}</span>}
          </span>
          <span className="hub-go">{done ? <>See <Icon name="hop" strokeWidth={2.4} /></> : p?.played ? <>Resume <Icon name="hop" strokeWidth={2.4} /></> : <>Play <Icon name="hop" strokeWidth={2.4} /></>}</span>
        </span>
      </span>
    </button>
  );
}

function GamesHubScreen() {
  useDocumentTitle('Daily games');
  const games = lineup();
  const [hub, setHub] = useState<GamesHub | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api.games().then(setHub).catch((e: Error) => setErr(e.message));
  }, []);
  const play = (id: GameId) => hub?.plays.find((p) => p.game === id);
  const done = games.filter((g) => play(g.id)?.done).length;
  const won = games.filter((g) => play(g.id)?.won).length;
  const all = hub && done === games.length;
  return (
    <Frame title="Daily games" back="/">
      <div className="hub-hero">
        <p className="eyebrow">{hub ? `Round #${hub.puzzleNo}` : 'Today'}</p>
        <h1 className="display">Today&rsquo;s <em>games</em></h1>
        <p className="lead">Three quick games. One round of each a day, the same for everyone.</p>
      </div>
      {err && <p className="msg-line bad">{err}</p>}
      {hub && !hub.enabled && <p className="msg-line info">The daily games are resting today. The daily journey is open as always.</p>}
      {hub && (
        <div className={`hub-progress ${all ? 'all' : ''}`}>
          <span className="hub-dots" aria-hidden="true">
            {games.map((g) => {
              const p = play(g.id);
              return <i key={g.id} className={p?.done ? (p.won ? 'won' : 'done') : ''} />;
            })}
          </span>
          <span className="hub-tally">{all ? <><b>{won}</b> of {games.length} won today</> : <><b>{done}</b> of {games.length} played</>}</span>
          <span className="hub-next"><Icon name="clock" /> New round in <Countdown ms={hub.nextIn} /></span>
        </div>
      )}
      <div className="hub-list">
        {games.map((g, i) => <HubCard key={g.id} g={g} p={play(g.id)} i={i} />)}
      </div>
      {all && <p className="hub-all"><Icon name="sparkle" /> That&rsquo;s today&rsquo;s set. Come back tomorrow for a new round.</p>}
    </Frame>
  );
}

// ------------------------------------------------------------------------------------ a round

type Phase = 'loading' | 'intro' | 'play' | 'done';

function GameScreen({ id }: { id: GameId }) {
  const info = GAMES.find((g) => g.id === id)!;
  useDocumentTitle(info.name);
  const [hub, setHub] = useState<GamesHub | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [phase, setPhaseState] = useState<Phase>('loading');
  const phaseRef = useRef<Phase>('loading');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const skew = useRef(0);
  const clock = useCallback(() => Date.now() + skew.current, []);

  const go = useCallback((next: Phase) => {
    if (phaseRef.current === next) return;
    if (phaseRef.current !== 'loading') sound.flip('loaf', 1);
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  const accept = useCallback((s: GameState) => {
    skew.current = s.now - Date.now();
    setState(s);
    setErr('');
    // a round that ends in play stays on the board until the game has shown how it ended
    if (!s.done) go('play');
    else if (!(phaseRef.current === 'play' && QUIZ.includes(s.game))) go('done');
    if (s.done) void api.games().then(setHub).catch(() => undefined);
    return s;
  }, [go]);
  const fail = useCallback((e: unknown) => {
    setErr(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
    return null;
  }, []);

  useEffect(() => {
    api.games().then((h) => {
      setHub(h);
      const mine = h.plays.find((p) => p.game === id);
      if (mine?.played) return api.gameStart(id).then(accept);
      go('intro');
      return null;
    }).catch(fail);
  }, [id, accept, fail, go]);

  const begin = () => {
    press();
    haptics.play([8, 30, 8]);
    setBusy(true);
    api.gameStart(id).then(accept).catch(fail).finally(() => setBusy(false));
  };
  const answer = useCallback((body: Record<string, unknown>) => api.gameAnswer(id, body).then(accept).catch(fail), [id, accept, fail]);
  const finish = useCallback((body: Record<string, unknown>) => api.gameFinish(id, body).then(accept).catch(fail), [id, accept, fail]);
  const onDone = useCallback(() => go('done'), [go]);

  const nextGame = hub ? lineup().find((g) => g.id !== id && !hub.plays.find((p) => p.game === g.id)?.done) : undefined;
  const mine = hub?.plays.find((p) => p.game === id);
  const props = { clock, answer, finish, onDone };
  return (
    <Frame title={<>{info.name}{hub && <small>#{hub.puzzleNo}</small>}</>}>
      {err && <p className="msg-line bad">{err}</p>}
      {phase === 'loading' && <p className="muted">Setting the table&hellip;</p>}
      <div key={phase} className="mg-turn">
        {phase === 'intro' && <Intro info={info} onBegin={begin} busy={busy} streak={mine?.streak} />}
        {phase === 'play' && state && (
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
