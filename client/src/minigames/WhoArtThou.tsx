// Who Art Thou? Five clues, from the niche to the general, twenty seconds each. The newest clue
// takes the stage; the earlier ones sit in a short list beneath. A wrong name (or the clock) opens
// the next clue and drops the prize a step down the ladder; "which one?" costs nothing.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { WhoState } from '../../../shared/minigames.ts';
import { haptics } from '../fx/haptics.ts';
import { sound } from '../fx/sound.ts';
import { Icon } from '../ui/icons.tsx';
import type { GameProps } from './GamesRoute.tsx';
import { TimerRing, sparks } from './shell.tsx';

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();

const SHAKE: Keyframe[] = [
  { transform: 'translateX(0)' },
  { transform: 'translateX(-9px)' },
  { transform: 'translateX(8px)' },
  { transform: 'translateX(-5px)' },
  { transform: 'translateX(3px)' },
  { transform: 'translateX(0)' },
];

/** Names that fit what's typed: an exact match first, then names that start with it, then names with a word that does. */
function suggest(names: string[], text: string, tried: Set<string>): string[] {
  const t = fold(text);
  if (!t) return [];
  const found: [number, string][] = [];
  for (const n of names) {
    const f = fold(n);
    if (tried.has(f)) continue;
    const rank = f === t ? 0 : f.startsWith(t) ? 1 : f.includes(` ${t}`) ? 2 : -1;
    if (rank >= 0) found.push([rank, n]);
  }
  return found.sort((a, b) => a[0] - b[0] || a[1].length - b[1].length || a[1].localeCompare(b[1])).slice(0, 6).map((x) => x[1]);
}

/** The typed part of a suggestion, in bold. */
function Matched({ name, q }: { name: string; q: string }) {
  const t = q.trim().toLowerCase();
  const at = t ? name.toLowerCase().indexOf(t) : -1;
  if (at < 0) return <>{name}</>;
  return <>{name.slice(0, at)}<b>{name.slice(at, at + t.length)}</b>{name.slice(at + t.length)}</>;
}

export function WhoArtThou({ state, clock, answer, onDone }: GameProps<WhoState>) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const hero = useRef<HTMLDivElement>(null);
  const tried = useMemo(() => new Set(state.guesses.filter((g) => g.text).map((g) => fold(g.text))), [state.guesses]);
  const list = useMemo(() => suggest(state.names, text, tried), [state.names, text, tried]);
  useEffect(() => setHi(0), [text]);
  useEffect(() => {
    input.current?.focus({ preventScroll: true });
  }, []);

  const total = state.total;
  const won = state.done && !!state.result?.won;
  // which clue the round is on (0-based): while playing, the newest; once over, where it ended
  const step = !state.done ? state.clues.length - 1 : won ? total - Math.round((state.result?.score ?? 0) / 200) : total;
  const seen = state.done ? Math.min(total, won ? step + 1 : total) : state.clues.length;
  const current = state.clues[state.clues.length - 1];
  const earlier = state.clues.slice(0, state.done ? seen : seen - 1).map((c, i) => ({ ...c, i })).reverse();
  const misses = state.guesses.filter((g) => g.text && g.verdict !== 'right');

  // the end: the name on the stage for a moment, then the result
  useEffect(() => {
    if (!state.done) return;
    const t = window.setTimeout(onDone, won ? 2300 : 2700);
    return () => window.clearTimeout(t);
  }, [state.done, won, onDone]);

  const send = (raw: string) => {
    const g = raw.trim();
    if (!g || busy || state.done) return;
    setBusy(true);
    setNote('');
    setOpen(false);
    sound.tile();
    const before = state.clues.length;
    void answer({ guess: g }).then((s) => {
      if (!s || s.game !== 'whoartthou') return;
      const v = s.guesses[s.guesses.length - 1]?.verdict;
      if (v === 'right') {
        sound.correct();
        haptics.play([10, 30, 16, 30, 24]);
        window.setTimeout(() => sparks(hero.current, '#f2c94c', 44), 160);
      } else if (v === 'which') {
        sound.refuse();
        haptics.play(8);
        setNote(`Which ${g}? There is more than one. Try a fuller name.`);
      } else {
        sound.wrong();
        haptics.play([22]);
        form.current?.animate(SHAKE, { duration: 380, easing: 'ease-out' });
        if (s.clues.length > before) window.setTimeout(() => sound.reveal(), 240);
      }
      setText('');
      if (!s.done) input.current?.focus();
    }).finally(() => setBusy(false));
  };

  const nextClue = (timedOut = false) => {
    if (busy || state.done) return;
    setBusy(true);
    setNote('');
    if (!timedOut) sound.tile();
    void answer({ timeout: true }).then((s) => {
      if (s && s.game === 'whoartthou' && !s.done) sound.reveal();
    }).finally(() => setBusy(false));
  };

  const listOpen = open && list.length > 0 && !state.done;
  return (
    <div className={`who ${state.done ? (won ? 'is-won' : 'is-lost') : ''}`}>
      <div className="mg-head who-head">
        <div className="who-prize">
          <p className="eyebrow">{state.done ? (won ? 'Named!' : 'Not this time') : `Clue ${step + 1} of ${total}`}</p>
          <div className="who-ladder" aria-label={state.done ? `Scored ${state.result?.score ?? 0}` : `Worth ${(total - step) * 200} points`}>
            {Array.from({ length: total }, (_, i) => (
              <span key={i} className={i < step ? 'gone' : i === step ? (state.done ? (won ? 'won' : 'gone') : 'on') : 'next'}>
                {(total - i) * 200}
              </span>
            ))}
          </div>
        </div>
        <TimerRing deadline={state.clueShownAt + state.clueMs} total={state.clueMs} clock={clock} running={!state.done} onExpire={() => nextClue(true)} />
      </div>

      {!state.done ? (
        <div key={`clue${state.clues.length}`} ref={hero} className="parchment who-hero">
          <span className="who-seal">Clue {state.clues.length}</span>
          <p>{current.text}</p>
        </div>
      ) : (
        <div key="answer" ref={hero} className={`who-hero who-answer ${won ? 'won' : 'lost'}`}>
          <span className="who-seal">{won ? 'You named them' : 'It was'}</span>
          <p className="who-name">{state.answer?.name}</p>
          {state.answer?.cite && <p className="who-cite">{state.answer.cite}</p>}
        </div>
      )}

      {!state.done && (
        <div className="who-play">
          <form ref={form} className="who-form" onSubmit={(e) => { e.preventDefault(); send(listOpen ? list[hi] : text); }}>
            <div className="who-field">
              <Icon name="lens" className="who-lens" />
              <label className="sr-only" htmlFor="who-guess">Your guess</label>
              <input
                id="who-guess"
                ref={input}
                className="field"
                placeholder="Who is it?"
                value={text}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                autoCapitalize="words"
                enterKeyHint="go"
                role="combobox"
                aria-expanded={listOpen}
                aria-controls="who-list"
                aria-autocomplete="list"
                aria-activedescendant={listOpen ? `who-opt-${hi}` : undefined}
                onChange={(e) => { setText(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                onBlur={() => window.setTimeout(() => setOpen(false), 160)}
                onKeyDown={(e) => {
                  if (!listOpen) return;
                  if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => (h + 1) % list.length); }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => (h - 1 + list.length) % list.length); }
                  else if (e.key === 'Escape') setOpen(false);
                }}
              />
              {listOpen && (
                <ul id="who-list" className="who-list" role="listbox" aria-label="Names">
                  {list.map((s, i) => (
                    <li key={s} id={`who-opt-${i}`} role="option" aria-selected={i === hi} className={i === hi ? 'hi' : ''} onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setHi(i)} onClick={() => send(s)}>
                      <span className="who-opt"><Matched name={s} q={text} /></span>
                      {i === hi && <kbd aria-hidden="true">Enter</kbd>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button className="btn gold who-go" disabled={busy || !text.trim()}>Guess</button>
          </form>

          {note && <p key={note} className="who-note" role="status"><Icon name="lens" /> {note}</p>}

          {(misses.length > 0 || state.clues.length < total) && (
            <div className="who-foot">
              <div className="who-tried" aria-label="Wrong guesses">
                {misses.map((g, i) => <span key={`${g.text}${i}`} className={`who-miss ${g.verdict}`}>{g.verdict === 'which' ? <Icon name="lens" /> : <Icon name="strike" strokeWidth={2.6} />}{g.text}</span>)}
              </div>
              {state.clues.length < total && (
                <button type="button" className="who-skip" onClick={() => nextClue()} disabled={busy}>
                  Next clue <small>−200</small>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {earlier.length > 0 && (
        <section className="who-earlier" aria-label={state.done ? 'The clues' : 'Earlier clues'}>
          <h3>{state.done ? 'The clues' : 'Earlier clues'}</h3>
          <ol>
            {earlier.map((c) => (
              <li key={c.i}>
                <span className="who-no">{c.i + 1}</span>
                <p>{c.text}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {state.done && (
        <button className="btn ghost mg-skip" onClick={onDone}>See how you did <Icon name="hop" size="1rem" strokeWidth={2.4} /></button>
      )}
    </div>
  );
}

/** Every clue, with where to read it, and the one the player named them on. */
export function WhoRecap({ state }: { state: WhoState }) {
  const won = !!state.result?.won;
  const at = won ? state.total - Math.round((state.result?.score ?? 0) / 200) : -1;
  return (
    <section className="who-recap" aria-label="The clues">
      <ol>
        {state.clues.map((c, i) => (
          <li key={i} className={i === at ? 'named' : i < at || !won ? 'seen' : 'unseen'} style={{ ['--i' as string]: i }}>
            <span className="who-no">{i + 1}</span>
            <p>{c.text} <span className="who-ref">{c.cite}</span></p>
          </li>
        ))}
      </ol>
    </section>
  );
}
