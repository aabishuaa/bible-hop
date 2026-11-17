// The journey opens on a closed Bible lying on the table. The cover swings open, a few pages fan
// over, and the camera comes down onto the verse, where the real page takes over. Tap to skip.
import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { haptics } from '../../fx/haptics.ts';
import { leafTexture } from '../../fx/paper.ts';
import { snapshot } from '../../fx/snapshot.ts';
import { sound } from '../../fx/sound.ts';
import { isReducedMotion } from '../../prefs.ts';
import { Book3D } from '../../ui/Book3D.tsx';
import type { BookDims, BookTextures } from '../../ui/Book3D.tsx';

interface Geo {
  dims: BookDims;
  spineX: number;
  top: number;
  tex: BookTextures;
}

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const jpeg = (c: HTMLCanvasElement) => c.toDataURL('image/jpeg', 0.88);

export function Cover({ journeyId, spread, stageRef, rightRef, leftRef }: {
  journeyId: string;
  spread: boolean;
  stageRef: React.RefObject<HTMLElement | null>;
  rightRef: React.RefObject<HTMLElement | null>;
  leftRef: React.RefObject<HTMLElement | null>;
}) {
  const [done, setDone] = useState(() => {
    if (isReducedMotion()) return true;
    // the full opening plays once per journey per visit; coming back opens straight onto the verse
    try {
      const key = `bible-hopping.opened.${journeyId}`;
      if (sessionStorage.getItem(key)) return true;
      sessionStorage.setItem(key, '1');
    } catch {
      /* private browsing: just play it */
    }
    return false;
  });
  const [geo, setGeo] = useState<Geo | null>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const anims = useRef<Animation[]>([]);

  // 1. measure the page and take its picture, so the book opens onto exactly what is there
  useEffect(() => {
    if (done) return;
    let dead = false;
    (async () => {
      try {
        await document.fonts?.ready;
      } catch {
        /* fonts are a nicety */
      }
      await frame();
      await frame();
      const box = stageRef.current, page = rightRef.current;
      if (dead) return;
      if (!box || !page) return setDone(true);
      const r = (spread ? box : page).getBoundingClientRect();
      const W = spread ? r.width / 2 : r.width, H = r.height;
      const plain = (i: number) => jpeg(leafTexture('crumb', W, H, i, true));
      const left = spread && leftRef.current ? jpeg(snapshot(leftRef.current)) : plain(4);
      setGeo({
        dims: { W, H, D: Math.max(10, W * 0.05), B: Math.max(3, W * 0.012), ov: Math.max(4, W * 0.022) },
        spineX: spread ? r.left + r.width / 2 : r.left,
        top: r.top,
        tex: {
          right: jpeg(snapshot(page)),
          left: plain(4),
          leaves: [
            { front: plain(0), back: plain(1) },
            { front: plain(2), back: plain(3) },
            { front: plain(5), back: left },
          ],
        },
      });
    })();
    return () => {
      dead = true;
    };
  }, [done, spread, stageRef, rightRef, leftRef]);

  // 2. play the opening
  useEffect(() => {
    const ov = overlay.current;
    const el = ov?.querySelector<HTMLElement>('.b3d-scene');
    if (!geo || !ov || !el) return;
    const { W, H, D } = geo.dims;
    const vw = window.innerWidth, vh = window.innerHeight;
    const s0 = Math.min(0.88 * vw / (2 * W + 2 * geo.dims.ov), 0.7 * vh / H, 1);
    const ty = vh * 0.5 - (geo.top + H / 2);
    const txClosed = vw / 2 - geo.spineX - (W * s0) / 2;
    const txOpen = vw / 2 - geo.spineX;
    const zTop = D - 1.2;
    const cam = (tx: number, y: number, s: number, rx: number, rz: number) =>
      `translate(${tx}px, ${y}px) scale(${s}) rotateX(${rx}deg) rotateZ(${rz}deg) translateZ(${-zTop}px)`;
    const run = (target: Element | null, kf: Keyframe[], o: KeyframeAnimationOptions) => {
      if (!target) return;
      const a = target.animate(kf, { fill: 'both', ...o });
      anims.current.push(a);
      return a;
    };
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));

    // the book settles onto the table, opens while the camera pans, then the camera comes down
    run(el, [
      { transform: cam(txClosed, ty + 60, s0 * 0.86, 58, -9), offset: 0 },
      { transform: cam(txClosed, ty, s0, 44, -4), offset: 0.16 },
      { transform: cam(txClosed, ty, s0, 44, -4), offset: 0.2 },
      { transform: cam(txOpen, ty, s0, 36, -2), offset: 0.55, easing: 'cubic-bezier(.45,.05,.2,1)' },
      { transform: cam(txOpen, ty * 0.6, s0 * 1.04, 32, -1.5), offset: 0.7, easing: 'cubic-bezier(.65,0,.25,1)' },
      { transform: cam(0, 0, 1, 0, 0), offset: 1 },
    ], { duration: 4000, easing: 'cubic-bezier(.4,0,.2,1)' });
    run(ov.querySelector('.b3d-stage'), [{ opacity: 0 }, { opacity: 1 }], { duration: 600, easing: 'ease-out' });
    run(el.querySelector('.b3d-left'), [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(-180deg)' }], { duration: 1500, delay: 800, easing: 'cubic-bezier(.5,.02,.18,1)' });
    run(el.querySelector('.b3d-spine'), [{ opacity: 1 }, { opacity: 0 }], { duration: 500, delay: 1000 });
    run(el.querySelector('.b3d-shadow-left'), [{ opacity: 0 }, { opacity: 1 }], { duration: 1200, delay: 1000 });
    el.querySelectorAll('.b3d-leaf').forEach((leaf, i) =>
      run(leaf, [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(-180deg)' }], { duration: 800, delay: 2050 + i * 210, easing: 'cubic-bezier(.4,0,.2,1)' }),
    );
    el.querySelectorAll('.b3d-gutter').forEach((g) => run(g, [{ opacity: 1 }, { opacity: 0 }], { duration: 500, delay: 3400 }));
    const fade = run(ov, [{ opacity: 1 }, { opacity: 0 }], { duration: 380, delay: 4000, easing: 'ease-out' });

    at(800, () => {
      sound.cover();
      haptics.play([18]);
    });
    [0, 1, 2].forEach((i) => at(2100 + i * 210, () => {
      sound.flip('fish', 1);
      haptics.play(8);
    }));
    at(3950, () => {
      sound.land('loaf');
      haptics.play([12, 40, 24]);
    });
    fade?.finished.then(() => setDone(true)).catch(() => undefined);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      anims.current.forEach((a) => a.cancel());
      anims.current = [];
    };
  }, [geo]);

  if (done) return null;
  const skip = () => {
    anims.current.forEach((a) => a.finish());
    setDone(true);
  };
  return (
    <div ref={overlay} className="b3d-overlay" onPointerDown={skip} aria-hidden="true">
      <div className="b3d-stage">
        {geo && <Book3D dims={geo.dims} tex={geo.tex} style={{ left: geo.spineX, top: geo.top, transformOrigin: `0px ${geo.dims.H / 2}px` }} className="b3d-scene" />}
      </div>
    </div>
  );
}
