// Bible or Babble: five sayings, each on its own clock. Choose, and the truth is shown: the verse
// itself, or where the saying really comes from.
import { useEffect, useRef, useState } from 'react';
import type { BabbleState } from '../../../shared/minigames.ts';
import { haptics } from '../fx/haptics.ts';
import { sound } from '../fx/sound.ts';
import { Icon } from '../ui/icons.tsx';
import type { GameProps } from './GamesRoute.tsx';
import { TimerRing } from './shell.tsx';

const pretty = (s: string) => s.replace(/'/g, '’');

export function BibleOrBabble({ state, clock, answer }: GameProps<BabbleState>) {
  const [busy, setBusy] = useState(false);
  const shownAnswers = useRef(state.answers.length);
  // a sound for each new answer
  useEffect(() => {
    if (state.answers.length > shownAnswers.current) {
      const a = state.answers[state.answers.length - 1];
      if (a.right) {
        sound.correct();
        haptics.play([10, 30, 16]);
      } else {
        sound.wrong();
        haptics.play([22]);
      }
      shownAnswers.current = state.answers.length;
    }
  }, [state.answers]);
  const choose = (choice: 'bible' | 'babble' | null) => {
    if (busy) return;
    setBusy(true);
    if (choice) sound.door(choice === 'bible' ? 'loaf' : 'fish');
    void answer({ index: state.index, choice }).finally(() => setBusy(false));
  };
  const next = () => {
    if (busy) return;
    setBusy(true);
    sound.flip('loaf', 1);
    void answer({ action: 'next' }).finally(() => setBusy(false));
  };
  const last = state.answers[state.answers.length - 1];
  return (
    <div className="babble">
      <div className="mg-head">
        <div>
          <p className="eyebrow">Bible or Babble?</p>
          <span className="bb-dots" aria-label={`Saying ${Math.min(state.index + 1, state.count)} of ${state.count}`}>
            {Array.from({ length: state.count }, (_, i) => <i key={i} className={i < state.answers.length ? (state.answers[i].right ? 'right' : 'wrong') : i === state.index ? 'on' : ''} />)}
          </span>
        </div>
        {state.current && <TimerRing key={state.index} deadline={state.shownAt + state.current.limitMs} total={state.current.limitMs} clock={clock} running={!busy} onExpire={() => choose(null)} />}
      </div>

      {state.current && (
        <div key={`q${state.index}`} className="bb-q">
          <blockquote className="parchment mg-quote big">&ldquo;{pretty(state.current.text)}&rdquo;</blockquote>
          <div className="bb-choices">
            <button className="bb-btn bible" disabled={busy} onClick={() => choose('bible')}><Icon name="book" size="1.4rem" /> Bible</button>
            <button className="bb-btn babble-b" disabled={busy} onClick={() => choose('babble')}><Icon name="strike" size="1.3rem" strokeWidth={2.4} /> Babble</button>
          </div>
        </div>
      )}

      {state.revealing && last && (
        <div key={`r${state.answers.length}`} className="bb-reveal">
          <Reveal a={last} />
          <button className="btn big gold" disabled={busy} onClick={next}>Next saying <span className="chev"><Icon name="hop" size="1rem" strokeWidth={2.4} /></span></button>
        </div>
      )}
    </div>
  );
}

function Reveal({ a }: { a: BabbleState['answers'][number] }) {
  return (
    <div className={`bb-card ${a.right ? 'right' : 'wrong'}`}>
      <div className="bb-verdict">
        <span className="bb-mark">{a.right ? <Icon name="sparkle" /> : <Icon name="strike" strokeWidth={2.6} />}</span>
        <b>{a.choice === null ? 'Time ran out.' : a.right ? 'Right!' : 'Not quite.'}</b>
        <span className={`bb-answer ${a.reveal.answer}`}>{a.reveal.answer === 'bible' ? 'Bible' : 'Babble'}</span>
      </div>
      <p className="bb-said">&ldquo;{pretty(a.text)}&rdquo;</p>
      <p className="bb-why">{a.reveal.why}</p>
      {a.reveal.verse && (
        <div className="parchment bb-verse">
          <b>{a.reveal.ref}</b>
          <p>{pretty(a.reveal.verse)}</p>
        </div>
      )}
    </div>
  );
}

export function BabbleRecap({ state }: { state: BabbleState }) {
  return (
    <div className="bb-recap">
      {state.answers.map((a, i) => <Reveal key={i} a={a} />)}
    </div>
  );
}
