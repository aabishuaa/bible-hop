// The Bible, closed, with a cross on the cover. It opens onto the verse.
import { useEffect, useState } from 'react';
import type React from 'react';
import { sound } from '../../fx/sound.ts';
import { isReducedMotion } from '../../prefs.ts';

export function Cover({ spread, onDone, stageRef }: { spread: boolean; onDone?: () => void; stageRef: React.RefObject<HTMLElement | null> }) {
  const [stage, setStage] = useState<'closed' | 'opening' | 'done'>(() => (isReducedMotion() ? 'done' : 'closed'));
  useEffect(() => {
    if (stage === 'done') {
      onDone?.();
      return;
    }
    const a = window.setTimeout(() => {
      setStage('opening');
      sound.cover();
    }, 650);
    const b = window.setTimeout(() => setStage('done'), 650 + 1400);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ x: r.left, y: r.top, w: r.width, h: r.height });
  }, [stageRef]);
  if (stage === 'done' || !rect) return null;
  return (
    <div className={`cover-wrap ${stage} ${spread ? 'spread' : ''}`} style={{ position: 'fixed', left: rect.x, top: rect.y, width: rect.w, height: rect.h }} aria-hidden="true">
      {spread && <div className="cover-back" />}
      <div className="cover">
        <div className="cover-face">
          <div className="cover-frame" />
          <div className="cover-cross" />
          <div className="cover-title">Holy Bible</div>
        </div>
        <div className="cover-inside" />
      </div>
    </div>
  );
}
