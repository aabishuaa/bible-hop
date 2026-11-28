// Who Art Thou? Clues from the niche to the general, twenty seconds each. Guess as often as you
// like: a wrong name opens the next clue; "which one?" costs nothing.
import { useMemo, useRef, useState } from 'react';
import type { WhoState } from '../../../shared/minigames.ts';
import { haptics } from '../fx/haptics.ts';
import { sound } from '../fx/sound.ts';
import { Icon } from '../ui/icons.tsx';
import type { GameProps } from './GamesRoute.tsx';
import { TimerRing } from './shell.tsx';

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, '');

export function WhoArtThou({ state, clock, answer }: GameProps<WhoState>) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const tried = useMemo(() => new Set(state.guesses.map((g) => fold(g.text))), [state.guesses]);
  const suggestions = useMemo(() => {
    const t = fold(text.trim());
    if (!t) return [];
    return state.names.filter((n) => fold(n).startsWith(t) || fold(n).includes(` ${t}`)).filter((n) => !tried.has(fold(n))).slice(0, 6);
  }, [text, state.names, tried]);
  const send = (guess: string) => {
    const g = guess.trim();
    if (!g || busy) return;
    setBusy(true);
    setNote('');
    const before = state.clues.length;
    void answer({ guess: g }).then((s) => {
      if (!s || s.game !== 'whoartthou') return;
      const v = s.guesses[s.guesses.length - 1]?.verdict;
      if (v === 'right') {
        sound.correct();
        haptics.play([10, 30, 16]);
      } else if (v === 'which') {
        sound.refuse();
        setNote(`Which ${g}? There is more than one by that name. Be more specific.`);
      } else {
        sound.wrong();
        haptics.play([22]);
        if (s.clues.length > before) window.setTimeout(() => sound.reveal(), 200);
      }
      setText('');
      input.current?.focus();
    }).finally(() => setBusy(false));
  };
  const nextClue = () => {
    if (busy) return;
    setBusy(true);
    sound.reveal();
    void answer({ timeout: true }).finally(() => setBusy(false));
  };
  const n = state.clues.length;
  return (
    <div className="who">
      <div className="mg-head">
        <div>
          <p className="eyebrow">Who art thou?</p>
          <span className="who-track" aria-label={`Clue ${n} of ${state.total}`}>
            {Array.from({ length: state.total }, (_, i) => <i key={i} className={i < n - 1 ? 'past' : i === n - 1 ? 'on' : ''} />)}
            <b>Clue {n} of {state.total}</b>
          </span>
        </div>
        <TimerRing deadline={state.clueShownAt + state.clueMs} total={state.clueMs} clock={clock} running={!state.done} onExpire={nextClue} />
      </div>
      <ol className="who-clues">
        {state.clues.map((c, i) => (
          <li key={i} className={`parchment who-clue ${i === n - 1 ? 'new' : ''}`}>
            <span className="who-no">{i + 1}</span>
            <p>{c.text}</p>
          </li>
        )).reverse()}
      </ol>
      <form className="who-form" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <label className="sr-only" htmlFor="who-guess">Your guess</label>
        <input id="who-guess" ref={input} className="field" placeholder="Type a name…" value={text} autoComplete="off" autoCapitalize="words" onChange={(e) => setText(e.target.value)} autoFocus />
        <button className="btn gold" disabled={busy || !text.trim()}>Guess</button>
      </form>
      {suggestions.length > 0 && (
        <div className="who-suggest">
          {suggestions.map((s) => <button key={s} type="button" className="mg-pill" onClick={() => send(s)}>{s}</button>)}
        </div>
      )}
      {note && <p className="msg-line warn">{note}</p>}
      <div className="who-foot">
        {state.guesses.filter((g) => g.text).length > 0 && (
          <span className="who-tried">
            {state.guesses.filter((g) => g.text && g.verdict !== 'right').map((g, i) => <span key={i} className={`mg-pill ${g.verdict === 'which' ? '' : 'wrong'}`}>{g.text}</span>)}
          </span>
        )}
        {n < state.total && <button type="button" className="link-btn2" onClick={nextClue} disabled={busy}>Next clue <Icon name="hop" strokeWidth={2.4} /></button>}
      </div>
    </div>
  );
}

export function WhoRecap({ state }: { state: WhoState }) {
  return (
    <ol className="who-clues recap">
      {state.clues.map((c, i) => (
        <li key={i} className="parchment who-clue">
          <span className="who-no">{i + 1}</span>
          <p>{c.text} <span className="who-cite">{c.cite}</span></p>
        </li>
      ))}
    </ol>
  );
}
