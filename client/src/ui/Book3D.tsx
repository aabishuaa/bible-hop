// A Bible built in 3D from flat faces: leather boards, a spine, gilded page edges and pages.
// The book lies in the screen plane with its spine at x = 0 and its front cover facing the viewer;
// tilting the root lays it on a table. Everything right of the spine is the closed book.
//
//   z (toward the viewer):  back board -B..0 | right pages 0..D | left pages D..2D | front cover 2D..2D+B
//
// The front cover and the left half of the pages (".b3d-left") turn about the spine at z = D, so
// they land on the left with the inside page facing up. ".b3d-leaf" sheets turn the same way.
import type { CSSProperties, ReactNode } from 'react';

export interface BookDims {
  W: number; // page width
  H: number; // page height
  D: number; // thickness of half the pages
  B: number; // board thickness
  ov: number; // how far the boards overhang the pages
}

export interface BookTextures {
  right?: string;
  left?: string;
  /** Front and back of each loose leaf that fans over when the book opens. */
  leaves?: { front: string; back: string }[];
}

type Orient = 'z' | 'zb' | 'x' | 'y';

function Face({ x, y, z, w, h, o, cls, style, children }: { x: number; y: number; z: number; w: number; h: number; o: Orient; cls: string; style?: CSSProperties; children?: ReactNode }) {
  const t =
    o === 'z' ? `translate3d(${x}px,${y}px,${z}px)`
    : o === 'zb' ? `translate3d(${x + w}px,${y}px,${z}px) rotateY(180deg)`
    : o === 'x' ? `translate3d(${x}px,${y}px,${z}px) rotateY(-90deg)`
    : `translate3d(${x}px,${y}px,${z}px) rotateX(90deg)`;
  return (
    <div className={`b3d-f ${cls}`} style={{ width: w, height: h, transform: t, ...style }}>
      {children}
    </div>
  );
}

const img = (url?: string): CSSProperties => (url ? { backgroundImage: `url(${url})`, backgroundSize: '100% 100%' } : {});

/** The cover design: leather, a gold frame, a gold cross and the title. */
function CoverArt({ W }: { W: number }) {
  return (
    <>
      <div className="b3d-frame" style={{ inset: Math.max(4, W * 0.045) }} />
      <div className="b3d-cross" style={{ width: W * 0.2 }} />
      <div className="b3d-title" style={{ fontSize: Math.max(7, W * 0.058), bottom: '13%' }}>Holy Bible</div>
    </>
  );
}

export function Book3D({ dims, tex = {}, style, className = '' }: { dims: BookDims; tex?: BookTextures; style?: CSSProperties; className?: string }) {
  const { W, H, D, B, ov } = dims;
  const Wc = W + ov, Hc = H + 2 * ov;
  const leaves = tex.leaves ?? [];
  const pivot: CSSProperties = { transformOrigin: `0px ${H / 2}px ${D}px` };
  return (
    <div className={`b3d ${className}`} style={{ height: H, ...style }}>
      {/* the table's shadow under the book */}
      <Face cls="b3d-shadow" x={-ov - W * 0.08} y={-ov} z={-B - 1} w={Wc + W * 0.22} h={Hc + H * 0.12} o="z" />
      <Face cls="b3d-shadow b3d-shadow-left" x={-Wc - W * 0.14} y={-ov} z={-B - 1} w={Wc + W * 0.14} h={Hc + H * 0.12} o="z" style={{ opacity: 0 }} />

      {/* back board and the spine */}
      <Face cls="b3d-board-in" x={0} y={-ov} z={0} w={Wc} h={Hc} o="z" />
      <Face cls="b3d-board-edge" x={Wc} y={-ov} z={-B} w={B} h={Hc} o="x" />
      <Face cls="b3d-board-edge" x={0} y={-ov} z={-B} w={Wc} h={B} o="y" />
      <Face cls="b3d-board-edge" x={0} y={H + ov} z={-B} w={Wc} h={B} o="y" />
      <Face cls="b3d-spine" x={0} y={-ov} z={-B} w={2 * D + 2 * B} h={Hc} o="x">
        <i /><i /><i />
      </Face>

      {/* the right half of the pages */}
      <Face cls="b3d-page" x={0} y={0} z={D - 1.2} w={W} h={H} o="z" style={img(tex.right)}>
        <div className="b3d-gutter" />
      </Face>
      <Face cls="b3d-edge-v" x={W} y={0} z={0} w={D - 1.2} h={H} o="x" />
      <Face cls="b3d-edge-h" x={0} y={0} z={0} w={W} h={D - 1.2} o="y" />
      <Face cls="b3d-edge-h" x={0} y={H} z={0} w={W} h={D - 1.2} o="y" />

      {/* loose leaves that fan over to the left */}
      {leaves.map((l, i) => (
        <div key={i} className="b3d-g b3d-leaf" style={pivot}>
          <Face cls="b3d-page" x={0} y={0} z={D - 0.3 - i * 0.3} w={W} h={H} o="z" style={img(l.front)} />
          <Face cls="b3d-page" x={0} y={0} z={D - 0.3 - i * 0.3} w={W} h={H} o="zb" style={img(l.back)}>
            <div className="b3d-gutter right" />
          </Face>
        </div>
      ))}

      {/* the front cover and the left half of the pages */}
      <div className="b3d-g b3d-left" style={pivot}>
        <Face cls="b3d-page" x={0} y={0} z={D + 0.15} w={W} h={H} o="zb" style={img(tex.left)}>
          <div className="b3d-gutter right" />
        </Face>
        <Face cls="b3d-edge-v" x={W} y={0} z={D} w={D} h={H} o="x" />
        <Face cls="b3d-edge-h" x={0} y={0} z={D} w={W} h={D} o="y" />
        <Face cls="b3d-edge-h" x={0} y={H} z={D} w={W} h={D} o="y" />
        <Face cls="b3d-board-in" x={0} y={-ov} z={2 * D} w={Wc} h={Hc} o="zb" />
        <Face cls="b3d-board-edge" x={Wc} y={-ov} z={2 * D} w={B} h={Hc} o="x" />
        <Face cls="b3d-board-edge" x={0} y={-ov} z={2 * D} w={Wc} h={B} o="y" />
        <Face cls="b3d-board-edge" x={0} y={H + ov} z={2 * D} w={Wc} h={B} o="y" />
        <Face cls="b3d-leather" x={0} y={-ov} z={2 * D + B} w={Wc} h={Hc} o="z">
          <CoverArt W={Wc} />
        </Face>
      </div>
    </div>
  );
}
