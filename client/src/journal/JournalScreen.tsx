// The Journal: a leather-bound book of the player's days on the road. The cover opens onto a
// bookplate and the contents, then a page for every day they played or kept a verse or wrote, each
// with that day's journey pasted in and stamped, the verses kept that day taped in, and room to
// write; then the verses they keep coming back to, and an index. Turn the pages with a swipe, the
// arrow keys, the page corners or the tabs on the fore-edge.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { JournalView } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { useBookmarks } from '../bookmarks.ts';
import { haptics } from '../fx/haptics.ts';
import { sound } from '../fx/sound.ts';
import { isReducedMotion } from '../prefs.ts';
import { navigate } from '../router.ts';
import { press, useDocumentTitle } from '../ui/base.tsx';
import { Icon } from '../ui/icons.tsx';
import { Stage } from './Book.tsx';
import type { Turn } from './Book.tsx';
import { Endpaper, PageContent, Paper, buildPages, localDate, longDate, weekdayOf } from './pages.tsx';
import type { Ctx, PageSpec, Side } from './pages.tsx';
import './journal.css';

const OPENED = 'bh.journal.opened';
const PLACE = 'bh.journal.page';
const stored = {
  get: (k: string) => {
    try {
      return sessionStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      sessionStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
};

function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => typeof matchMedia === 'function' && matchMedia(query).matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const m = matchMedia(query);
    const change = () => setOn(m.matches);
    m.addEventListener('change', change);
    return () => m.removeEventListener('change', change);
  }, [query]);
  return on;
}

/** The closed book: tooled leather, a gilt title, the owner's name and an elastic band. */
function Cover({ name, state, onOpen }: { name: string | null; state: 'closed' | 'opening'; onOpen: () => void }) {
  return (
    <button className={`jr-cover ${state}`} onClick={onOpen} aria-label="Open your Journal">
      <span className="jr-cover-front">
        <span className="jr-cover-stitch" aria-hidden="true" />
        <span className="jr-cover-emblem" aria-hidden="true"><Icon name="cross" strokeWidth={1.4} /></span>
        <span className="jr-cover-title">Journal</span>
        <span className="jr-cover-rule" aria-hidden="true" />
        <span className="jr-cover-name">{name ?? 'Bible Hopping'}</span>
        <span className="jr-cover-band" aria-hidden="true" />
        {state === 'closed' && <span className="jr-cover-hint">tap to open</span>}
      </span>
      <span className="jr-cover-inside" aria-hidden="true"><span className="jr-marble" /></span>
    </button>
  );
}

const pageLabel = (p: PageSpec | undefined, today: string): string => {
  if (!p) return '';
  if (p.kind === 'day') return p.date === today ? 'Today' : `${weekdayOf(p.date)}, ${longDate(p.date)}`;
  return { endpaper: 'Inside the cover', plate: 'The bookplate', contents: 'Contents', worn: 'Well-worn verses', index: 'Index of kept verses', end: 'The last page, for now' }[p.kind];
};

export function JournalScreen() {
  useDocumentTitle('Journal');
  const [v, setV] = useState<JournalView | null>(null);
  const [err, setErr] = useState('');
  const spread = useMedia('(min-width: 62rem)');
  const today = localDate(Date.now());
  const pages = useMemo(() => (v ? buildPages(v, today, spread) : []), [v, today, spread]);
  const [at, setAt] = useState(0);
  const [turn, setTurn] = useState<Turn | null>(null);
  const [cover, setCover] = useState<'closed' | 'opening' | 'gone'>(() => (stored.get(OPENED) || isReducedMotion() ? 'gone' : 'closed'));
  const coverShown = useRef(cover === 'closed');
  const place = useRef<string | null>(stored.get(PLACE));
  /** Where to turn once the cover is open: the page read last time today, or today's page. */
  const resume = useRef<string | null>(place.current);
  const atRef = useRef(at);
  atRef.current = at;
  const turnRef = useRef(turn);
  turnRef.current = turn;
  const saved = useBookmarks((s) => s.saved);
  const step = spread ? 2 : 1;
  const todayIndex = pages.findIndex((p) => p.id === `day:${today}`);

  const reload = useCallback(() => api.journal().then(setV).catch((e: Error) => setErr(e.message)), []);
  useEffect(() => {
    void reload();
  }, [reload]);
  // a ribbon untied on these pages takes its verse out of them
  useEffect(() => {
    if (v && v.bookmarks.some((b) => !saved.has(b.verse))) void reload();
  }, [saved]); // eslint-disable-line react-hooks/exhaustive-deps

  const norm = useCallback((i: number) => {
    const c = Math.max(0, Math.min(pages.length - 1, i));
    return spread ? c - (c % 2) : c;
  }, [pages.length, spread]);

  // stay on the same page when the pages change: a reload, or the screen turning wide or narrow
  useEffect(() => {
    if (!pages.length) return;
    if (cover === 'closed') {
      setAt(0);
      return;
    }
    const want = place.current;
    let i = want ? pages.findIndex((p) => p.id === want) : -1;
    if (i < 0 && want?.startsWith('day:')) {
      // that day's page has gone: the nearest day before it
      const date = want.slice(4);
      for (let k = pages.length - 1; k >= 0; k--) {
        const p = pages[k];
        if (p.kind === 'day' && p.date <= date) {
          i = k;
          break;
        }
      }
    }
    setAt(norm(i >= 0 ? i : todayIndex));
  }, [pages]); // eslint-disable-line react-hooks/exhaustive-deps

  // remember the place, for the next time the Journal is opened today
  useEffect(() => {
    if (turn || cover !== 'gone' || coverShown.current || !pages[at]) return;
    const id = pages[spread && pages[at].kind === 'endpaper' ? at + 1 : at]?.id;
    if (!id) return;
    place.current = id;
    stored.set(PLACE, id);
  }, [at, turn, cover, pages, spread]);

  const go = useCallback((to: number) => {
    if (turnRef.current) return;
    const from = atRef.current;
    const n = norm(to);
    if (n === from || !pages[n]) return;
    const dir: 1 | -1 = n > from ? 1 : -1;
    sound.flip(Math.abs(n - from) > step ? 'fish' : 'loaf', dir);
    haptics.play(6);
    if (isReducedMotion()) {
      setAt(n);
      return;
    }
    setTurn({ from, to: n, dir });
  }, [norm, pages, step]);
  const onTurned = useCallback(() => {
    const t = turnRef.current;
    if (t) setAt(t.to);
    setTurn(null);
  }, []);

  // ---------------------------------------------------------------- the cover
  const open = useCallback(() => {
    if (cover !== 'closed' || !v) return;
    sound.cover();
    haptics.play([8, 40, 8]);
    setCover('opening');
  }, [cover, v]);
  useEffect(() => {
    if (cover !== 'closed' || !v) return;
    const t = window.setTimeout(open, 1300);
    return () => window.clearTimeout(t);
  }, [cover, v, open]);
  useEffect(() => {
    if (cover !== 'opening') return;
    const t = window.setTimeout(() => {
      setCover('gone');
      stored.set(OPENED, '1');
    }, 1150);
    return () => window.clearTimeout(t);
  }, [cover]);
  // once the cover is open, turn to where the ribbon lies: the last page read, or today
  useEffect(() => {
    if (cover !== 'gone' || !coverShown.current || !pages.length) return;
    const id = resume.current;
    const i = id ? pages.findIndex((p) => p.id === id) : -1;
    const t = window.setTimeout(() => {
      coverShown.current = false;
      go(i >= 0 ? i : todayIndex);
    }, 350);
    return () => window.clearTimeout(t);
  }, [cover, pages, go, todayIndex]);

  // ---------------------------------------------------------------- turning by hand
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest('textarea, input, select, [contenteditable="true"]')) return;
      if (e.key === 'ArrowRight') go(atRef.current + step);
      else if (e.key === 'ArrowLeft') go(atRef.current - step);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, step]);
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);
  const down = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('textarea, input, button, a')) return;
    swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const up = (e: React.PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) go(atRef.current + (dx < 0 ? step : -step));
  };

  const wrote = useCallback((date: string, text: string) => setV((x) => x && {
    ...x,
    pages: [...(text ? [{ date, text, updatedAt: Date.now() }] : []), ...x.pages.filter((p) => p.date !== date)],
  }), []);
  const noted = useCallback((verse: number, note: string) => setV((x) => x && {
    ...x,
    bookmarks: x.bookmarks.map((b) => (b.verse === verse ? { ...b, note } : b)),
  }), []);
  const ctx: Ctx | null = useMemo(() => (v ? { v, pages, today, go, wrote, noted } : null), [v, pages, today, go, wrote, noted]);
  const renderPage = (i: number, side: Side) => {
    const p = pages[i];
    if (!p || !ctx) return <Paper key={`blank-${side}`} side={side} folio={null} />;
    if (p.kind === 'endpaper') return <Endpaper key="endpaper" side={side} />;
    return (
      <Paper key={p.id} side={side} folio={p.folio} className={`kind-${p.kind}`}>
        <PageContent p={p} ctx={ctx} />
      </Paper>
    );
  };

  const index = (id: string) => pages.findIndex((p) => p.id === id);
  const shown = spread ? [pages[at], pages[at + 1]] : [pages[at]];
  const tabs = [
    { label: 'Contents', tone: 'gold', to: index('contents'), on: shown.some((p) => p?.kind === 'contents' || p?.kind === 'plate') },
    { label: 'Today', tone: 'red', to: todayIndex, on: shown.some((p) => p?.id === `day:${today}`) },
    { label: 'Well-worn', tone: 'green', to: index('worn:0'), on: shown.some((p) => p?.kind === 'worn') },
    { label: 'Index', tone: 'blue', to: index('index:0'), on: shown.some((p) => p?.kind === 'index') },
  ];
  const last = pages[pages.length - 1]?.folio ?? 1;
  const here = spread ? (pages[at + 1] ?? pages[at]) : pages[at];
  const canBack = at > 0;
  const canOn = at + step < pages.length;

  return (
    <div className="screen leather jr-screen">
      <svg className="jr-defs" width="0" height="0" aria-hidden="true" focusable="false">
        <filter id="jr-rough"><feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="7" /><feDisplacementMap in="SourceGraphic" scale="2.6" /></filter>
        <filter id="jr-marble" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.009 0.028" numOctaves="3" seed="11" /><feDisplacementMap in="SourceGraphic" scale="60" xChannelSelector="R" yChannelSelector="G" /></filter>
      </svg>
      <header className="bar bar-top">
        <div className="topbar">
          <button className="icon-btn" onClick={() => { press(); navigate('/'); }} aria-label="Back to today"><Icon name="lookback" size="1.3rem" /></button>
          <div className="title">Journal</div>
        </div>
      </header>
      <div className="jr-desk">
        {err && <p className="msg-line bad">{err}</p>}
        {!v && !err && <p className="jr-loading">Opening your Journal&hellip;</p>}
        {v && (
          <>
            <div className={`jr-book ${spread ? 'spread' : 'single'} ${cover !== 'gone' ? `cover-${cover}` : ''}`}>
              <div className={`jr-block ${turn ? 'turning' : ''}`} onPointerDown={down} onPointerUp={up} onPointerCancel={() => { swipe.current = null; }}>
                <Stage at={at} spread={spread} turn={turn} page={renderPage} blank={(side) => <Paper side={side} folio={null} />} onTurned={onTurned} />
                <span className="jr-ribbon" aria-hidden="true" />
                {cover === 'gone' && canOn && <button className="jr-corner next" onClick={() => go(at + step)} aria-label="Turn the page" />}
                {cover === 'gone' && canBack && spread && <button className="jr-corner prev" onClick={() => go(at - step)} aria-label="Turn back a page" />}
                {cover !== 'gone' && <Cover name={v.owner.name} state={cover} onOpen={open} />}
              </div>
              <nav className="jr-tabs" aria-label="Sections of the Journal">
                {tabs.map((t) => (
                  <button key={t.label} className={`jr-tab ${t.tone} ${t.on ? 'on' : ''}`} disabled={t.to < 0 || cover !== 'gone'} onClick={() => { press(); go(t.to); }}>
                    {t.label}
                  </button>
                ))}
              </nav>
            </div>
            <div className={`jr-controls ${spread ? 'spread' : ''}`}>
              <button className="jr-arrow" onClick={() => go(at - step)} disabled={!canBack || cover !== 'gone'} aria-label="Previous page"><Icon name="hop" strokeWidth={2.4} className="back" /></button>
              <p className="jr-where" aria-live="polite">
                <span>{pageLabel(here, today)}</span>
                {here?.folio != null && <small>page {here.folio} of {last}</small>}
              </p>
              <button className="jr-arrow" onClick={() => go(at + step)} disabled={!canOn || cover !== 'gone'} aria-label="Next page"><Icon name="hop" strokeWidth={2.4} /></button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
