// The Journal's binding: the pages on show, and a leaf turning over the spine between them. On a
// phone the book shows one page at a time and the leaf turns away into the binding; on a wider
// screen it lies open in a two-page spread and the leaf turns from one side to the other.
import { useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { isReducedMotion } from '../prefs.ts';
import type { Side } from './pages.tsx';

export interface Turn {
  from: number;
  to: number;
  dir: 1 | -1;
}

const TURN_MS = 780;

/** One leaf turning over: its front is the right-hand page, its back the left-hand one. */
function Leaf({ dir, front, back, onDone }: { dir: 1 | -1; front: ReactNode; back: ReactNode; onDone: () => void }) {
  const leaf = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  done.current = onDone;
  useLayoutEffect(() => {
    const el = leaf.current;
    if (!el) return;
    const [a, b] = dir === 1 ? [0, -180] : [-180, 0];
    const timing: KeyframeAnimationOptions = { duration: isReducedMotion() ? 1 : TURN_MS, easing: 'cubic-bezier(.45,.05,.25,1)', fill: 'forwards' };
    const turn = el.animate([{ transform: `rotateY(${a}deg)` }, { transform: `rotateY(${(a + b) / 2}deg) translateZ(18px)`, offset: 0.5 }, { transform: `rotateY(${b}deg)` }], timing);
    // the light across the paper as it lifts and as it lands
    const [front, back] = el.querySelectorAll<HTMLElement>('.jr-shade');
    front?.animate(dir === 1 ? [{ opacity: 0 }, { opacity: 0.5 }] : [{ opacity: 0.5 }, { opacity: 0 }], timing);
    back?.animate(dir === 1 ? [{ opacity: 0.5 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 0.5 }], timing);
    turn.onfinish = () => done.current();
    return () => turn.cancel();
  }, [dir]);
  return (
    <div ref={leaf} className="jr-leaf" aria-hidden="true">
      <div className="jr-face front">{front}<i className="jr-shade" /></div>
      <div className="jr-face back">{back}<i className="jr-shade" /></div>
    </div>
  );
}

/**
 * The pages on show. `page(i, side)` draws page i on a side (a blank sheet past either end). In a
 * spread, `at` is the left-hand page; on a phone it is the page itself.
 */
export function Stage({ at, spread, turn, page, blank, onTurned }: {
  at: number;
  spread: boolean;
  turn: Turn | null;
  page: (i: number, side: Side) => ReactNode;
  blank: (side: Side) => ReactNode;
  onTurned: () => void;
}) {
  if (!spread) {
    if (!turn) return <div className="jr-stage single">{page(at, 'single')}</div>;
    const forward = turn.dir === 1;
    // forward: the page lifts away to show the next beneath it; back: the page before comes over onto it
    return (
      <div className="jr-stage single turning">
        {page(forward ? turn.to : turn.from, 'single')}
        <Leaf key={`${turn.from}>${turn.to}`} dir={turn.dir} front={page(forward ? turn.from : turn.to, 'single')} back={blank('single')} onDone={onTurned} />
      </div>
    );
  }
  if (!turn) return <div className="jr-stage spread">{page(at, 'left')}{page(at + 1, 'right')}</div>;
  const forward = turn.dir === 1;
  return (
    <div className="jr-stage spread turning">
      {page(forward ? turn.from : turn.to, 'left')}
      {page(forward ? turn.to + 1 : turn.from + 1, 'right')}
      <Leaf
        key={`${turn.from}>${turn.to}`}
        dir={turn.dir}
        front={page(forward ? turn.from + 1 : turn.to + 1, 'right')}
        back={page(forward ? turn.to : turn.from, 'left')}
        onDone={onTurned}
      />
    </div>
  );
}
