// Book It: a verse, twenty seconds, and the 66 books on a shelf. Every wrong guess says earlier or
// later and sweeps the wrong side of the shelf away, so the books close in on the answer (growing
// as there is room) while the points a right guess is worth drain with the clock.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BOOKS, DIVISIONS, type Division } from '../../../shared/books.ts';
import type { BookItState } from '../../../shared/minigames.ts';
import { haptics } from '../fx/haptics.ts';
import { sound } from '../fx/sound.ts';
import { isReducedMotion } from '../prefs.ts';
import { Icon } from '../ui/icons.tsx';
import type { GameProps } from './GamesRoute.tsx';
import { TimerRing, sparks, useTick } from './shell.tsx';

/** A colour for each part of the Bible, on the shelf and on its books. */
export const DIV_COLOR: Record<Division, string> = {
  Law: '#e6ad45',
  History: '#dc8550',
  Poetry: '#d77aa0',
  Prophets: '#a194e6',
  'Gospels & Acts': '#55c2bc',
  Letters: '#93c66a',
  Revelation: '#ee6a58',
};

const pretty = (s: string) => s.replace(/'/g, '’');
const LEAVE_MS = 760;

/** The books still possible: everything between the nearest "later" and "earlier"; once over, the answer alone. */
function range(state: BookItState): [number, number] {
  if (state.done && state.answer) return [state.answer.book, state.answer.book];
  let lo = 0, hi = BOOKS.length - 1;
  for (const g of state.guesses) {
    if (g.dir === 'later') lo = Math.max(lo, g.book + 1);
    if (g.dir === 'earlier') hi = Math.min(hi, g.book - 1);
  }
  return [lo, hi];
}

/** How roomy the books can be: the fewer left, the bigger they grow and the more of their names they show. */
function sizeFor(n: number): string {
  return n === 1 ? 'one' : n <= 12 ? 'xl' : n <= 24 ? 'lg' : n <= 40 ? 'md' : 'all';
}

/** What a right guess is worth this moment: it drains with the clock and drops 60 with each miss. */
function Worth({ state, clock }: { state: BookItState; clock: () => number }) {
  useTick(100, !state.done);
  const misses = state.guesses.filter((g) => g.dir !== 'right').length;
  const live = Math.max(100, 1000 - Math.round(Math.min(state.limitMs, Math.max(0, clock() - state.startedAt)) / 25) - misses * 60);
  const won = state.done && !!state.result?.won;
  const value = state.done ? (state.result?.score ?? 0) : live;
  return (
    <div className={`bk-worth ${state.done ? (won ? 'won' : 'lost') : ''}`} aria-label={`Worth ${value} points`}>
      <span>{state.done ? 'Scored' : 'Worth'}</span>
      <b className="tabular">{value}</b>
      {misses > 0 && !state.done && <i key={misses} className="bk-minus" aria-hidden="true">−60</i>}
    </div>
  );
}

function Hint({ state }: { state: BookItState }) {
  const last = state.guesses[state.guesses.length - 1];
  if (state.done && state.answer) {
    const name = BOOKS[state.answer.book].name;
    return state.result?.won
      ? <p key="won" className="bk-hint won"><Icon name="sparkle" /> Booked it! <b>{name}</b></p>
      : <p key="lost" className="bk-hint lost"><Icon name="clock" /> Time&rsquo;s up. It was <b>{name}</b></p>;
  }
  if (!last) return <p className="bk-hint first">Tap the book this verse comes from.</p>;
  return (
    <p key={state.guesses.length} className={`bk-hint ${last.dir}`} aria-live="polite">
      <span className="bk-arrow" aria-hidden="true"><Icon name="hop" strokeWidth={2.6} /></span>
      {last.dir === 'later' ? 'Later than' : 'Earlier than'} <b>{BOOKS[last.book].name}</b>
      {last.sameDivision && <span className="bk-near"><Icon name="sparkle" /> Right section</span>}
    </p>
  );
}

/** The whole Bible as one bar: what's been ruled out fades, a gold window frames what's left, and a pin marks each guess. */
function Shelf({ lo, hi, state }: { lo: number; hi: number; state: BookItState }) {
  const n = BOOKS.length;
  return (
    <div className="bk-shelf">
      <div className="bk-bar" aria-hidden="true">
        {BOOKS.map((b, i) => <i key={i} className={i < lo || i > hi ? 'gone' : ''} style={{ ['--dc' as string]: DIV_COLOR[b.division] }} />)}
        <span className="bk-window" style={{ left: `${(lo / n) * 100}%`, width: `${((hi - lo + 1) / n) * 100}%` }} />
        {state.guesses.map((g) => <span key={g.book} className={`bk-pin ${g.dir}`} style={{ left: `${((g.book + 0.5) / n) * 100}%` }} />)}
      </div>
      {!state.done && (
        <div className="bk-ends">
          <span>{BOOKS[lo].name}</span>
          <b className="tabular">{hi - lo + 1} {hi === lo ? 'book' : 'books'} left</b>
          <span>{BOOKS[hi].name}</span>
        </div>
      )}
    </div>
  );
}

export function BookIt({ state, clock, answer, onDone }: GameProps<BookItState>) {
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<number | null>(null);
  const [lo, hi] = range(state);
  const [shown, setShown] = useState<[number, number]>([lo, hi]);
  const guessed = useMemo(() => new Map(state.guesses.map((g) => [g.book, g])), [state.guesses]);
  const won = state.done && !!state.result?.won;
  const answerBook = state.answer?.book ?? -1;

  // ------------------------------------------------------------ the sweep, and the books closing in
  // Books ruled out leave in a wave from the guess; once they've gone, the rest glide into the space.
  const nodes = useRef(new Map<string, HTMLElement>());
  const firsts = useRef<Map<string, DOMRect> | null>(null);
  const delays = useRef(new Map<number, number>());
  const reg = (k: string) => (el: HTMLElement | null) => {
    if (el) nodes.current.set(k, el);
    else nodes.current.delete(k);
  };
  const last = state.guesses[state.guesses.length - 1];
  const pivot = state.done && state.answer ? state.answer.book : (last?.book ?? 0);
  for (let i = shown[0]; i <= shown[1]; i++) {
    if ((i < lo || i > hi) && !delays.current.has(i)) delays.current.set(i, guessed.has(i) ? 420 : 140 + Math.min(Math.abs(i - pivot), 16) * 18);
  }
  useEffect(() => {
    if (shown[0] === lo && shown[1] === hi) return;
    const t = window.setTimeout(() => {
      firsts.current = new Map([...nodes.current].map(([k, el]) => [k, el.getBoundingClientRect()]));
      delays.current.clear();
      setShown([lo, hi]);
    }, isReducedMotion() ? 0 : LEAVE_MS);
    return () => window.clearTimeout(t);
  }, [lo, hi, shown]);
  useLayoutEffect(() => {
    const before = firsts.current;
    firsts.current = null;
    if (!before || isReducedMotion()) return;
    for (const [k, el] of nodes.current) {
      const a = before.get(k);
      if (!a) continue;
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      const dx = a.left - b.left, dy = a.top - b.top, sx = a.width / b.width, sy = a.height / b.height;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.02 && Math.abs(sy - 1) < 0.02) continue;
      el.animate(
        [{ transformOrigin: '0 0', transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` }, { transformOrigin: '0 0', transform: 'none' }],
        { duration: 440, easing: 'cubic-bezier(.2,.8,.2,1)' },
      );
    }
  }, [shown]);

  // the end: a moment to see it, then the result
  useEffect(() => {
    if (!state.done) return;
    const t = window.setTimeout(onDone, won ? 2300 : 2700);
    return () => window.clearTimeout(t);
  }, [state.done, won, onDone]);

  const guess = (book: number, el: HTMLElement) => {
    if (busy || state.done || guessed.has(book) || book < lo || book > hi) return;
    setBusy(true);
    setPending(book);
    sound.tile();
    haptics.play(6);
    void answer({ book }).then((s) => {
      if (!s || s.game !== 'bookit') return;
      const g = s.guesses[s.guesses.length - 1];
      if (g?.book !== book) return;
      if (g.dir === 'right') {
        sound.correct();
        haptics.play([10, 30, 16, 30, 24]);
        window.setTimeout(() => sparks(el, '#f2c94c', 40), 80);
      } else {
        sound.wrong();
        haptics.play([22]);
        if (g.sameDivision) window.setTimeout(() => sound.combo(2), 180);
      }
    }).finally(() => {
      setBusy(false);
      setPending(null);
    });
  };

  const visible: number[] = [];
  for (let i = shown[0]; i <= shown[1]; i++) visible.push(i);
  const size = sizeFor(shown[1] - shown[0] + 1);
  const len = state.verseText.length;

  return (
    <div className={`bookit ${state.done ? (won ? 'is-won' : 'is-lost') : ''}`}>
      <div className="mg-head bk-head">
        <Worth state={state} clock={clock} />
        <span className="bk-count" aria-hidden="true">
          {state.guesses.length === 0 ? 'First guess' : `${state.guesses.length} ${state.guesses.length === 1 ? 'guess' : 'guesses'}`}
        </span>
        <TimerRing size={60} deadline={state.startedAt + state.limitMs} total={state.limitMs} clock={clock} running={!state.done} onExpire={() => void answer({ timeout: true })} />
      </div>

      <blockquote className={`parchment mg-quote bk-quote ${len > 260 ? 'long' : len > 160 ? 'mid' : ''}`}>
        &ldquo;{pretty(state.verseText)}&rdquo;
        {state.done && state.answer && <cite key="ref" className="bk-ref">{state.answer.verse.ref}</cite>}
      </blockquote>

      <Hint state={state} />
      <Shelf lo={lo} hi={hi} state={state} />

      <div className={`bk-grid size-${size}`}>
        {DIVISIONS.map((d) => {
          const books = visible.filter((i) => BOOKS[i].division === d);
          if (!books.length) return null;
          const leaving = books.every((i) => i < lo || i > hi);
          return (
            <section key={d} className={`bk-div ${leaving ? 'leaving' : ''}`} style={{ ['--dc' as string]: DIV_COLOR[d] }}>
              <h3 ref={reg(`h${d}`)}><i aria-hidden="true" />{d}</h3>
              <div className="bk-books">
                {books.map((i) => {
                  const b = BOOKS[i];
                  const out = i < lo || i > hi;
                  const g = guessed.get(i);
                  const cls = [
                    'bk',
                    out ? 'leaving' : '',
                    g && g.dir !== 'right' ? 'missed' : '',
                    i === answerBook ? (won ? 'right' : 'answer') : '',
                    pending === i ? 'pending' : '',
                  ].join(' ');
                  return (
                    <button
                      key={i}
                      ref={reg(`b${i}`)}
                      className={cls}
                      style={{ ['--d' as string]: `${delays.current.get(i) ?? 0}ms`, ['--r' as string]: `${((i * 37) % 17) - 8}deg` }}
                      disabled={busy || state.done || out}
                      onClick={(e) => guess(i, e.currentTarget)}
                      aria-label={b.name}
                    >
                      <span className="bk-short">{b.short}</span>
                      <span className="bk-full">{b.name}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {state.done && (
        <button className="btn ghost mg-skip" onClick={onDone}>See how you did <Icon name="hop" size="1rem" strokeWidth={2.4} /></button>
      )}
    </div>
  );
}

/** The guesses in order, each with which way it pointed. */
export function BookItRecap({ state }: { state: BookItState }) {
  if (!state.guesses.length) return null;
  return (
    <div className="bk-recap" aria-label="Your guesses">
      {state.guesses.map((g, i) => (
        <span key={i} className={`bk-chip ${g.dir}`} style={{ ['--dc' as string]: DIV_COLOR[BOOKS[g.book].division], ['--i' as string]: i }}>
          {BOOKS[g.book].name}
          {g.dir === 'right' ? <Icon name="sparkle" /> : <Icon name="hop" strokeWidth={2.6} className={g.dir} />}
        </span>
      ))}
    </div>
  );
}
