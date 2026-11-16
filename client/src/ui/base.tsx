// The pieces every screen is built from: paper, torn edges, ornaments, dialogs.
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useLayoutEffect, useMemo, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { haptics } from '../fx/haptics.ts';
import { paintPage, tornClip, tornCorner } from '../fx/paper.ts';
import { sound } from '../fx/sound.ts';
import { Icon } from './icons.tsx';

/** The paper a page is printed on. It fills its parent and repaints when the page changes size. */
export function PaperCanvas({ spine = 'none', seed = 3, watermark = true }: { spine?: 'left' | 'right' | 'none'; seed?: number; watermark?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const canvas = ref.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    let frame = 0;
    const paint = () => {
      const { width, height } = parent.getBoundingClientRect();
      if (width < 2 || height < 2) return;
      paintPage(canvas, { w: width, h: height, dpr: Math.min(2, window.devicePixelRatio || 1), spine, seed, watermark });
    };
    paint();
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(paint);
    });
    ro.observe(parent);
    // the blackletter face may arrive after the first paint
    void document.fonts?.load('40px UnifrakturMaguntia').then(paint).catch(() => undefined);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [spine, seed, watermark]);
  return <canvas ref={ref} className="paper" aria-hidden="true" />;
}

/** A strip of kraft paper with one edge torn, as in the sample decks. */
export function Torn({ side, depth = 16, seed = 1, className = '', children, style }: { side: 'top' | 'bottom'; depth?: number; seed?: number; className?: string; children?: ReactNode; style?: CSSProperties }) {
  const clip = useMemo(() => tornClip(side, depth, seed), [side, depth, seed]);
  const fibre = useMemo(() => tornClip(side, depth, seed + 7), [side, depth, seed]);
  return (
    <div className={`torn on-kraft ${className}`} style={style}>
      <div className="torn-fibre" style={{ clipPath: fibre, transform: `translateY(${side === 'bottom' ? 3 : -3}px)` }} aria-hidden="true" />
      <div className="torn-body" style={{ clipPath: clip }}>
        {children}
      </div>
    </div>
  );
}

export function TornCorner({ corner, seed }: { corner: 'tl' | 'br'; seed: number }) {
  const clip = useMemo(() => tornCorner(corner, seed), [corner, seed]);
  const fibre = useMemo(() => tornCorner(corner, seed + 5), [corner, seed]);
  const nudge = corner === 'tl' ? 'translate(4px, 4px)' : 'translate(-4px, -4px)';
  return (
    <div className={`corner ${corner}`} aria-hidden="true">
      <i className="fibre" style={{ clipPath: fibre, transform: nudge }} />
      <i className="body" style={{ clipPath: clip }} />
    </div>
  );
}

export function Sparkle({ size = 22, className = '', style, twinkle = true }: { size?: number; className?: string; style?: CSSProperties; twinkle?: boolean }) {
  return <Icon name="sparkle" size={size} className={`sparkle ${twinkle ? 'twinkle' : ''} ${className}`} style={style} />;
}

export function Ornament({ size = 40, className = '', style }: { size?: number; className?: string; style?: CSSProperties }) {
  return <Icon name="ornament" size={size} strokeWidth={1.25} className={`ornament ${className}`} style={style} />;
}

export function DotsDeco({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return (
    <span className={`dots-deco ${className}`} style={style} aria-hidden="true">
      <i /><i /><i /><i /><i />
    </span>
  );
}

export function LinesDeco({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return (
    <span className={`lines-deco ${className}`} style={style} aria-hidden="true">
      <i /><i /><i /><i /><i /><i />
    </span>
  );
}

/** A dialog that rises from the bottom of the screen (or sits in the middle with `center`). */
export function Modal({ open, onClose, children, center = false, label, dismissable = true, className = '' }: { open: boolean; onClose?: () => void; children: ReactNode; center?: boolean; label: string; dismissable?: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const first = node?.querySelector<HTMLElement>('[data-autofocus], button, [href], input, textarea, select');
    first?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable) onClose?.();
      if (e.key !== 'Tab' || !node) return;
      const items = [...node.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, textarea, select, [tabindex]:not([tabindex="-1"])')];
      if (!items.length) return;
      const a = items[0], z = items[items.length - 1];
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.({ preventScroll: true });
    };
  }, [open, dismissable, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={`scrim ${center ? 'center' : ''}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget && dismissable) onClose?.();
          }}
        >
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            id={id}
            className={`modal ${className}`}
            initial={center ? { scale: 0.92, opacity: 0, y: 10 } : { y: '100%' }}
            animate={center ? { scale: 1, opacity: 1, y: 0 } : { y: 0 }}
            exit={center ? { scale: 0.96, opacity: 0 } : { y: '100%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 36, mass: 0.9 }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** A button press you can hear and feel. */
export function press(kind: 'tap' | 'soft' = 'tap'): void {
  sound.unlock();
  if (kind === 'tap') {
    sound.click();
    haptics.tap();
  }
}

export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title ? `${title} · Bible Hopping` : 'Bible Hopping';
  }, [title]);
}

/** Counts a number up or down to its new value, so manna feels gathered rather than replaced. */
export function useCountTo(value: number, ms = 600): number {
  const ref = useRef(value);
  const [, force] = useReducerTick();
  useEffect(() => {
    const from = ref.current;
    if (from === value) return;
    if (document.documentElement.dataset.motion === 'reduced') {
      ref.current = value;
      force();
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      ref.current = Math.round(from + (value - from) * (1 - Math.pow(1 - p, 3)));
      force();
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms, force]);
  return ref.current;
}

import { useReducer } from 'react';
function useReducerTick(): [number, () => void] {
  return useReducer((n: number) => n + 1, 0) as [number, () => void];
}

export function plural(n: number, one: string, many = one + 's'): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function timeLeft(ms: number): string {
  if (ms <= 0) return '0m';
  const m = Math.floor(ms / 60000);
  if (m < 1) return `${Math.max(1, Math.ceil(ms / 1000))}s`;
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

export function niceDate(date: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' }): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' });
}
