// A picture of a page as it stands, for the page that lifts first (and the one that lands last)
// in a hop. The paper comes from the page's own background canvas; the words are redrawn where
// the browser laid them out, in the same type, so the picture and the real page line up.

const ascents = new Map<string, number>();

function ascentOf(g: CanvasRenderingContext2D, font: string): number {
  let a = ascents.get(font);
  if (a === undefined) {
    const m = g.measureText('Hg');
    a = m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent;
    ascents.set(font, a);
  }
  return a;
}

/**
 * Draws `page` (an element holding one page of the book) into a new canvas.
 * Every element marked data-snap has its text drawn; everything else is left to the paper.
 */
export function snapshot(page: HTMLElement, dpr = Math.min(2, window.devicePixelRatio || 1)): HTMLCanvasElement {
  const box = page.getBoundingClientRect();
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(box.width * dpr));
  out.height = Math.max(1, Math.round(box.height * dpr));
  const g = out.getContext('2d')!;
  const paper = page.querySelector<HTMLCanvasElement>('canvas.paper');
  if (paper && paper.width > 0) g.drawImage(paper, 0, 0, out.width, out.height);
  else {
    g.fillStyle = '#fbeed6';
    g.fillRect(0, 0, out.width, out.height);
  }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.textBaseline = 'alphabetic';
  const range = document.createRange();
  for (const el of page.querySelectorAll<HTMLElement>('[data-snap]')) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.nodeValue ?? '';
      if (!text.trim()) continue;
      const parent = node.parentElement;
      if (!parent) continue;
      const cs = getComputedStyle(parent);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      g.font = font;
      g.fillStyle = cs.color;
      const spacing = cs.letterSpacing !== 'normal' ? cs.letterSpacing : '0px';
      if ('letterSpacing' in g) (g as unknown as { letterSpacing: string }).letterSpacing = spacing;
      const upper = cs.textTransform === 'uppercase';
      const ascent = ascentOf(g, font);
      // one word at a time: a word never breaks across lines, so each has one place on the page
      for (const m of text.matchAll(/\S+/g)) {
        range.setStart(node, m.index);
        range.setEnd(node, m.index + m[0].length);
        const r = range.getBoundingClientRect();
        if (!r.width || r.bottom < box.top || r.top > box.bottom) continue;
        g.fillText(upper ? m[0].toUpperCase() : m[0], r.left - box.left, r.top - box.top + ascent);
      }
    }
  }
  if ('letterSpacing' in g) (g as unknown as { letterSpacing: string }).letterSpacing = '0px';
  return out;
}
