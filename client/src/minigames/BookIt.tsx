// Book It: a verse, twenty seconds, and the 66 books. A wrong guess says earlier or later, and
// rules out every book on the wrong side of it.
import { useMemo, useState } from 'react';
import { BOOKS, DIVISIONS } from '../../../shared/books.ts';
import type { BookItState } from '../../../shared/minigames.ts';
import { haptics } from '../fx/haptics.ts';
import { sound } from '../fx/sound.ts';
import { Icon } from '../ui/icons.tsx';
import type { GameProps } from './GamesRoute.tsx';
import { TimerRing } from './shell.tsx';

const pretty = (s: string) => s.replace(/'/g, '’');

/** The books still possible after the guesses so far: everything between the nearest "later" and "earlier". */
function range(state: BookItState): [number, number] {
  let lo = 0, hi = 65;
  for (const g of state.guesses) {
    if (g.dir === 'later') lo = Math.max(lo, g.book + 1);
    if (g.dir === 'earlier') hi = Math.min(hi, g.book - 1);
  }
  return [lo, hi];
}

export function BookIt({ state, clock, answer }: GameProps<BookItState>) {
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState<number | null>(null);
  const [lo, hi] = range(state);
  const last = state.guesses[state.guesses.length - 1];
  const guessed = useMemo(() => new Map(state.guesses.map((g) => [g.book, g])), [state.guesses]);
  const guess = (book: number) => {
    if (busy || guessed.has(book) || book < lo || book > hi) return;
    setBusy(true);
    sound.door('loaf');
    haptics.play(6);
    void answer({ book }).then((s) => {
      const g = s && s.game === 'bookit' ? s.guesses[s.guesses.length - 1] : undefined;
      if (g?.dir === 'right') {
        sound.correct();
        haptics.play([10, 30, 16]);
      } else if (g) {
        sound.wrong();
        haptics.play([22]);
        setShake(book);
        window.setTimeout(() => setShake(null), 420);
      }
    }).finally(() => setBusy(false));
  };
  return (
    <div className="bookit">
      <div className="mg-head">
        <div>
          <p className="eyebrow">Which book?</p>
          <p className="mg-hint" aria-live="polite">
            {!last ? 'Tap the book this verse comes from.' : (
              <>
                {last.dir === 'later' ? <><Icon name="hop" className="down" /> Later in the Bible</> : <><Icon name="hop" className="up" /> Earlier in the Bible</>}
                {last.sameDivision && <span className="mg-near"> · right section!</span>}
              </>
            )}
          </p>
        </div>
        <TimerRing deadline={state.startedAt + state.limitMs} total={state.limitMs} clock={clock} running={!state.done} onExpire={() => void answer({ timeout: true })} />
      </div>
      <blockquote className="parchment mg-quote">&ldquo;{pretty(state.verseText)}&rdquo;</blockquote>
      <div className="bk-grid">
        {DIVISIONS.map((d) => (
          <section key={d} className="bk-div">
            <h3>{d}</h3>
            <div className="bk-books">
              {BOOKS.map((b, i) => (b.division !== d ? null : (
                <button
                  key={b.name}
                  className={`bk ${guessed.has(i) ? (guessed.get(i)!.dir === 'right' ? 'right' : 'wrong') : ''} ${i < lo || i > hi ? 'out' : ''} ${shake === i ? 'shake' : ''}`}
                  disabled={busy || guessed.has(i) || i < lo || i > hi}
                  onClick={() => guess(i)}
                  aria-label={b.name}
                  title={b.name}
                >
                  {b.short}
                </button>
              )))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export function BookItRecap({ state }: { state: BookItState }) {
  if (!state.guesses.length) return null;
  return (
    <div className="mg-recap">
      {state.guesses.map((g, i) => (
        <span key={i} className={`mg-pill ${g.dir === 'right' ? 'right' : 'wrong'}`}>
          {BOOKS[g.book].short} {g.dir === 'right' ? <Icon name="sparkle" /> : g.dir === 'later' ? '↓' : '↑'}
        </span>
      ))}
    </div>
  );
}
