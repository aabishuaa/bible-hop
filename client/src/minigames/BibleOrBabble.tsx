// Bible or Babble: five sayings, each on its own clock. Swipe the card right for Bible or left for
// Babble (or tap a button, or press an arrow key). It flies off, and the card turns over stamped
// with the truth: the verse itself, or where the saying really comes from. Right answers in a row
// build a run, and each one rings a note higher.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { BabbleState } from '../../../shared/minigames.ts';
import { haptics } from '../fx/haptics.ts';
import { sound } from '../fx/sound.ts';
import { isReducedMotion } from '../prefs.ts';
import { Icon } from '../ui/icons.tsx';
import type { GameProps } from './GamesRoute.tsx';
import { TimerRing, sparks } from './shell.tsx';

const pretty = (s: string) => s.replace(/'/g, '’');
/** How far a card must be dragged to count as an answer. */
const SWIPE = 90;

type Answer = BabbleState['answers'][number];

/** Right answers in a row, counting back from the latest. */
function runOf(answers: Answer[]): number {
  let n = 0;
  for (let i = answers.length - 1; i >= 0 && answers[i].right; i--) n++;
  return n;
}

export function BibleOrBabble({ state, clock, answer, onDone }: GameProps<BabbleState>) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [flying, setFlying] = useState<{ text: string; dx: number; dir: -1 | 0 | 1; n: number } | null>(null);
  const drag = useRef<{ x: number; y: number; id: number; axis?: 'x' | 'y'; armed?: boolean } | null>(null);
  const flyEl = useRef<HTMLDivElement>(null);
  const backEl = useRef<HTMLDivElement>(null);
  const heard = useRef(state.answers.length);
  const last = state.answers[state.answers.length - 1];
  const run = runOf(state.answers);
  const right = state.answers.filter((a) => a.right).length;
  const showBack = (state.revealing || state.done) && !!last && !flying;
  const asking = !!state.current && !flying && !busy;

  const work = (on: boolean) => {
    busyRef.current = on;
    setBusy(on);
  };

  // the verdict lands as the card turns over
  useEffect(() => {
    if (state.answers.length <= heard.current) return;
    heard.current = state.answers.length;
    const a = state.answers[state.answers.length - 1];
    const n = runOf(state.answers);
    const t = window.setTimeout(() => {
      sound.stamp();
      if (a.right) {
        if (n >= 2) sound.combo(n, 0.06);
        else sound.correct(0.06);
        haptics.play(n >= 3 ? [10, 30, 10, 30, 24] : [10, 30, 16]);
        sparks(backEl.current?.querySelector('.bb-seal'), a.reveal.answer === 'bible' ? '#f2c94c' : '#ff8a70', n >= 3 ? 40 : 26);
      } else {
        sound.wrong(0.06);
        haptics.play([26]);
      }
    }, isReducedMotion() ? 0 : 420);
    return () => window.clearTimeout(t);
  }, [state.answers]);

  const commit = useCallback((choice: 'bible' | 'babble' | null, from = 0) => {
    if (busyRef.current || !state.current) return;
    work(true);
    const dir = choice === 'bible' ? 1 : choice === 'babble' ? -1 : 0;
    setFlying({ text: state.current.text, dx: from, dir, n: state.index });
    setDx(0);
    setDragging(false);
    drag.current = null;
    if (dir) sound.whoosh(dir);
    haptics.play(8);
    void answer({ index: state.index, choice }).finally(() => work(false));
  }, [state, answer]);

  const next = useCallback(() => {
    if (busyRef.current) return;
    if (state.done) {
      onDone();
      return;
    }
    work(true);
    sound.flip('loaf', 1);
    void answer({ action: 'next' }).finally(() => work(false));
  }, [state.done, answer, onDone]);

  // the card leaving the table, from wherever the finger let it go
  useLayoutEffect(() => {
    const el = flyEl.current;
    if (!flying || !el) return;
    const from = `translateX(${flying.dx}px) rotate(${flying.dx / 16}deg)`;
    const to = flying.dir === 0 ? 'translateY(70px) scale(0.86)' : `translateX(${flying.dir * 130}vw) rotate(${flying.dir * 30}deg)`;
    const anim = el.animate([{ transform: from, opacity: 1 }, { transform: to, opacity: flying.dir === 0 ? 0 : 0.85 }], {
      duration: isReducedMotion() ? 1 : flying.dir === 0 ? 420 : 360,
      easing: 'cubic-bezier(.45,.05,.75,.95)',
      fill: 'forwards',
    });
    anim.onfinish = () => setFlying(null);
    return () => anim.cancel();
  }, [flying]);

  // arrow keys answer; Enter or Space moves on
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLButtonElement) return;
      if (asking && e.key === 'ArrowRight') { e.preventDefault(); commit('bible'); }
      else if (asking && e.key === 'ArrowLeft') { e.preventDefault(); commit('babble'); }
      else if (showBack && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); next(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [asking, showBack, commit, next]);

  // ------------------------------------------------------------------------------------ swiping
  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!asking || (e.pointerType === 'mouse' && e.button !== 0)) return;
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const mx = e.clientX - d.x, my = e.clientY - d.y;
    if (!d.axis) {
      if (Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(my)) {
        d.axis = 'x';
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
      } else if (Math.abs(my) > 10) d.axis = 'y';
    }
    if (d.axis !== 'x') return;
    setDx(mx);
    const armed = Math.abs(mx) >= SWIPE;
    if (armed !== !!d.armed) {
      d.armed = armed;
      if (armed) {
        sound.tile();
        haptics.play(5);
      }
    }
  };
  const up = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.axis !== 'x') return;
    setDragging(false);
    const mx = e.clientX - d.x;
    if (Math.abs(mx) >= SWIPE) commit(mx > 0 ? 'bible' : 'babble', mx);
    else setDx(0);
  };
  const cancel = () => {
    drag.current = null;
    setDragging(false);
    setDx(0);
  };

  const lean = Math.max(-1, Math.min(1, dx / SWIPE));
  const behind = Math.min(2, state.count - state.answers.length - (state.current || flying ? 1 : 0));
  return (
    <div className="bb-game">
      <div className="mg-head bb-head">
        <div className="bb-progress">
          <span className="bb-dots" aria-label={`${right} right of ${state.answers.length}`}>
            {Array.from({ length: state.count }, (_, i) => {
              const a = state.answers[i];
              return <i key={i} className={a ? (a.right ? 'right' : 'wrong') : i === state.answers.length ? 'on' : ''}>{a ? <Icon name={a.right ? 'sparkle' : 'strike'} strokeWidth={2.8} /> : null}</i>;
            })}
          </span>
          <span className="bb-score">
            {run >= 2
              ? <b key={run} className="bb-combo"><Icon name="streak" /> {run} in a row</b>
              : <><b className="tabular">{right}</b> right</>}
          </span>
        </div>
        {state.current && !flying
          ? <TimerRing key={state.index} deadline={state.shownAt + state.current.limitMs} total={state.current.limitMs} clock={clock} running={!busy} onExpire={() => commit(null)} />
          : <div className="timer-slot" aria-hidden="true" />}
      </div>

      <div className="bb-stage">
        {behind > 0 && Array.from({ length: behind }, (_, i) => <div key={`deck${i}`} className={`bb-card deck d${i + 1}`} aria-hidden="true" />)}

        {state.current && !flying && (
          <div
            key={`q${state.index}`}
            className={`bb-card q parchment ${dragging ? 'drag' : ''} ${lean > 0.3 ? 'lean-bible' : lean < -0.3 ? 'lean-babble' : ''}`}
            style={{ transform: `translateX(${dx}px) rotate(${dx / 16}deg)` }}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={cancel}
          >
            <span className="bb-stamp bible" style={{ opacity: Math.max(0, lean) }} aria-hidden="true">Bible</span>
            <span className="bb-stamp babble" style={{ opacity: Math.max(0, -lean) }} aria-hidden="true">Babble</span>
            <span className="bb-no">Saying {state.index + 1} of {state.count}</span>
            <blockquote className={state.current.text.length > 110 ? 'long' : ''}>&ldquo;{pretty(state.current.text)}&rdquo;</blockquote>
            <span className="bb-swipe" aria-hidden="true"><Icon name="hop" strokeWidth={2.4} className="left" /> swipe <Icon name="hop" strokeWidth={2.4} /></span>
          </div>
        )}

        {flying && (
          <div key={`fly${flying.n}`} ref={flyEl} className={`bb-card q parchment flying ${flying.dir > 0 ? 'lean-bible' : flying.dir < 0 ? 'lean-babble' : ''}`} aria-hidden="true">
            <span className="bb-stamp bible" style={{ opacity: flying.dir > 0 ? 1 : 0 }}>Bible</span>
            <span className="bb-stamp babble" style={{ opacity: flying.dir < 0 ? 1 : 0 }}>Babble</span>
            <span className="bb-no">Saying {flying.n + 1} of {state.count}</span>
            <blockquote className={flying.text.length > 110 ? 'long' : ''}>&ldquo;{pretty(flying.text)}&rdquo;</blockquote>
          </div>
        )}

        {showBack && last && (
          <div key={`a${state.answers.length}`} ref={backEl} className={`bb-card back parchment ${last.right ? 'right' : 'wrong'}`}>
            <Verdict a={last} />
          </div>
        )}
      </div>

      {showBack ? (
        <button key="next" className="btn big gold bb-next" disabled={busy} onClick={next}>
          {state.done ? 'See how you did' : 'Next saying'} <span className="chev"><Icon name="hop" size="1rem" strokeWidth={2.4} /></span>
        </button>
      ) : (
        <div className="bb-choices">
          <button className="bb-btn babble" disabled={!asking} onClick={() => commit('babble')}>
            <Icon name="hop" size="1.1rem" strokeWidth={2.6} className="left" /> Babble
          </button>
          <button className="bb-btn bible" disabled={!asking} onClick={() => commit('bible')}>
            Bible <Icon name="hop" size="1.1rem" strokeWidth={2.6} />
          </button>
        </div>
      )}
      {state.answers.length === 0 && !showBack && <p className="bb-tip">Swipe the card, tap a button, or use the arrow keys.</p>}
    </div>
  );
}

/** Where a saying sits inside its verse, to be marked there: [before, the saying, after], or null. */
function within(verse: string, said: string): [string, string, string] | null {
  const s = said.replace(/[.,;:!?'"’”]+$/, '').trim();
  const at = s ? verse.toLowerCase().indexOf(s.toLowerCase()) : -1;
  return at < 0 ? null : [verse.slice(0, at), verse.slice(at, at + s.length), verse.slice(at + s.length)];
}

/** The back of the card: the truth stamped on it, and where the saying really comes from. */
function Verdict({ a }: { a: Answer }) {
  // a saying from the Bible is shown marked inside its verse, rather than twice
  const parts = a.reveal.answer === 'bible' && a.reveal.verse ? within(a.reveal.verse, a.text) : null;
  return (
    <>
      <div className="bb-top">
        <span className={`bb-mark ${a.right ? 'right' : 'wrong'}`}>
          {a.choice === null ? <><Icon name="clock" /> Time ran out</> : a.right ? <><Icon name="sparkle" /> Right!</> : <><Icon name="strike" strokeWidth={2.6} /> Not quite</>}
        </span>
        <span className={`bb-seal ${a.reveal.answer}`}>{a.reveal.answer === 'bible' ? 'Bible' : 'Babble'}</span>
      </div>
      {!parts && <p className="bb-said">&ldquo;{pretty(a.text)}&rdquo;</p>}
      <p className="bb-why">{a.reveal.why}</p>
      {a.reveal.verse && (
        <div className="bb-verse">
          <b>{a.reveal.ref}</b>
          <p>{parts ? <>{pretty(parts[0])}<mark>{pretty(parts[1])}</mark>{pretty(parts[2])}</> : pretty(a.reveal.verse)}</p>
        </div>
      )}
    </>
  );
}

/** The five sayings in a short list: right or wrong, which it was, and where it's from. */
export function BabbleRecap({ state }: { state: BabbleState }) {
  return (
    <ol className="bb-recap" aria-label="The sayings">
      {state.answers.map((a, i) => (
        <li key={i} className={a.right ? 'right' : 'wrong'} style={{ ['--i' as string]: i }}>
          <span className="bb-rmark">{a.right ? <Icon name="sparkle" /> : <Icon name="strike" strokeWidth={2.6} />}</span>
          <div>
            <p>&ldquo;{pretty(a.text)}&rdquo;</p>
            <small><b className={`bb-kind ${a.reveal.answer}`}>{a.reveal.answer === 'bible' ? 'Bible' : 'Babble'}</b>{a.reveal.ref ? ` · ${a.reveal.ref}` : ''}</small>
          </div>
        </li>
      ))}
    </ol>
  );
}
