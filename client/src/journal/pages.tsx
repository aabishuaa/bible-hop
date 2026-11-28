// The pages of the Journal: the bookplate, the contents, a page for each day (its journey pasted in
// like a ticket and stamped, the verses kept that day taped in, and room to write), the well-worn
// verses with their tallies, and an index of every kept verse.
import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { lossInfo } from '../../../shared/messages.ts';
import type { Bookmark, JournalTrip, JournalView, LossReason, TopVerse } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { useApp } from '../app-store.ts';
import { sound } from '../fx/sound.ts';
import { navigate } from '../router.ts';
import { BookmarkButton } from '../ui/Bookmark.tsx';
import { Ornament, press } from '../ui/base.tsx';
import { ICON_PATHS } from '../ui/icon-paths.ts';
import { Icon } from '../ui/icons.tsx';

export type Side = 'left' | 'right' | 'single';

export type PageSpec =
  | { id: 'endpaper'; kind: 'endpaper'; folio: null }
  | { id: 'plate'; kind: 'plate'; folio: number }
  | { id: 'contents'; kind: 'contents'; folio: number }
  | { id: string; kind: 'day'; folio: number; date: string; trips: JournalTrip[]; kept: Bookmark[]; text: string }
  | { id: string; kind: 'worn'; folio: number; rows: TopVerse[]; part: number; parts: number }
  | { id: string; kind: 'index'; folio: number; rows: { b: Bookmark; at: number }[]; part: number; parts: number }
  | { id: 'end'; kind: 'end'; folio: number };

export type DaySpec = Extract<PageSpec, { kind: 'day' }>;

export interface Ctx {
  v: JournalView;
  pages: PageSpec[];
  today: string;
  go: (index: number) => void;
  /** Words saved on a day's page, or on a kept verse, so the page shows them when it's turned to again. */
  wrote: (date: string, text: string) => void;
  noted: (verse: number, note: string) => void;
}

const pretty = (s: string) => s.replace(/'/g, '’');

/** YYYY-MM-DD of a moment, in the player's own time. */
export function localDate(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const noon = (date: string) => new Date(`${date}T12:00:00`);
export const weekdayOf = (date: string) => noon(date).toLocaleDateString(undefined, { weekday: 'long' });
export const longDate = (date: string) => noon(date).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
const monthOf = (date: string) => noon(date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
const stampDate = (date: string) => noon(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase();

/** A small deterministic random number source, so a page looks the same every time it's turned to. */
function seeded(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const hashOf = (s: string) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);

// ------------------------------------------------------------------------------- the paper

/** A sheet of the Journal's paper. Left and right pages are shaded toward the spine. */
export function Paper({ side, folio, className = '', children }: { side: Side; folio: number | null; className?: string; children?: ReactNode }) {
  return (
    <div className={`jr-paper ${side} ${className}`}>
      <div className="jr-paper-body">{children}</div>
      {folio !== null && <span className="jr-folio">{folio}</span>}
    </div>
  );
}

/** The marbled paper inside the covers. */
export function Endpaper({ side }: { side: Side }) {
  return <div className={`jr-paper ${side} jr-endpaper`} aria-hidden="true"><div className="jr-marble" /></div>;
}

/** A hand-drawn underline. */
function Scribble({ seed }: { seed: number }) {
  const r = seeded(seed);
  const y = () => (4 + r() * 4).toFixed(1);
  return (
    <svg className="jr-scribble" viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true">
      <path d={`M2 ${y()} C 40 ${y()}, 80 ${y()}, 118 ${y()} S 170 ${y()}, 198 ${y()}`} />
    </svg>
  );
}

/** A little sketch in the margin. */
const DOODLES = ['dove', 'lamp', 'loaf', 'fish', 'cross', 'scroll', 'home', 'pearl', 'drop', 'gate'];
function Doodle({ seed }: { seed: number }) {
  const r = seeded(seed);
  const name = DOODLES[Math.floor(r() * DOODLES.length)];
  return <Icon name={name} className="jr-doodle" strokeWidth={1.3} style={{ ['--r' as string]: `${Math.round((r() - 0.5) * 30)}deg` }} />;
}

/** The game's icons drawn inside another drawing (the stamp). */
function Glyph({ name, x, y, size }: { name: string; x: number; y: number; size: number }) {
  const s = size / 24;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      {(ICON_PATHS[name] ?? []).map((p, i) => <path key={i} d={p.d} fill={p.fill ? 'currentColor' : 'none'} stroke={p.fill ? 'none' : 'currentColor'} />)}
    </g>
  );
}

// ---------------------------------------------------------------------------- writing in ink

/**
 * The owner's handwriting on ruled lines. It saves itself a moment after they stop writing, when
 * they leave the page, and if the page is turned while they're still writing.
 */
export function Ink({ value, onSave, placeholder, minRows = 2, label }: { value: string; onSave: (text: string) => Promise<string>; placeholder: string; minRows?: number; label: string }) {
  const toast = useApp((s) => s.toast);
  const [text, setText] = useState(value);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const area = useRef<HTMLTextAreaElement>(null);
  const last = useRef(value);
  const latest = useRef(value);
  const timer = useRef(0);
  const saver = useRef(onSave);
  saver.current = onSave;
  useEffect(() => {
    // fresh words from the server, as long as nothing unsaved would be lost
    if (value !== last.current && latest.current === last.current) {
      last.current = value;
      latest.current = value;
      setText(value);
    }
  }, [value]);
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);
  const save = useCallback((t: string, quiet = false) => {
    window.clearTimeout(timer.current);
    if (t === last.current) return;
    last.current = t;
    if (!quiet) setState('saving');
    saver.current(t).then((kept) => {
      last.current = kept;
      if (quiet) return;
      setState('saved');
      sound.scribble();
      window.setTimeout(() => setState((s) => (s === 'saved' ? 'idle' : s)), 1800);
    }).catch((e: Error) => {
      last.current = '\u0000'; // try again next time
      if (!quiet) setState('error');
      toast(e.message);
    });
  }, [toast]);
  // a page turned mid-sentence still keeps what was written
  useEffect(() => () => save(latest.current, true), [save]);
  return (
    <div className="jr-inkwell">
      <textarea
        ref={area}
        className="jr-ink"
        value={text}
        rows={minRows}
        placeholder={placeholder}
        aria-label={label}
        maxLength={4000}
        spellCheck
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          latest.current = t;
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => save(t), 1400);
        }}
        onBlur={() => save(latest.current)}
      />
      <span className={`jr-inked ${state}`} aria-live="polite">{state === 'saving' ? 'drying…' : state === 'saved' ? 'saved' : state === 'error' ? 'not saved' : ''}</span>
    </div>
  );
}

// ------------------------------------------------------------------------- the day's journey

const STAMP_LOSS: Record<LossReason, string> = {
  lamp: 'THE LAMP WENT OUT',
  door: 'THE DOOR WAS SHUT',
  wilderness: 'LOST IN THE WILDERNESS',
  fish: 'SWALLOWED BY THE FISH',
  famine: 'FAMINE',
  rooster: 'THE ROOSTER CROWED',
};
const LOSS_GLYPH: Record<LossReason, string> = { lamp: 'lamp', door: 'gate', wilderness: 'moon', fish: 'fish', famine: 'crumb', rooster: 'rooster' };

/** The rubber stamp on a finished day: home, or how the journey ended. */
function Stamp({ trip }: { trip: JournalTrip }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const won = trip.status === 'won';
  const top = won ? 'MADE IT HOME' : STAMP_LOSS[trip.loss ?? 'lamp'];
  const r = seeded(hashOf(trip.date));
  return (
    <svg className={`jr-stamp ${won ? 'won' : 'lost'}`} viewBox="0 0 120 120" style={{ ['--r' as string]: `${Math.round(-22 + r() * 20)}deg` }} role="img" aria-label={won ? `Made it home, ${longDate(trip.date)}` : lossInfo(trip.loss ?? 'lamp').name}>
      <defs>
        <path id={`${uid}t`} d="M 16 60 A 44 44 0 0 1 104 60" />
        <path id={`${uid}b`} d="M 13 60 A 47 47 0 0 0 107 60" />
      </defs>
      <circle cx="60" cy="60" r="56.5" strokeWidth="3.2" />
      <circle cx="60" cy="60" r="36" strokeWidth="1.4" />
      <text className={top.length > 16 ? 'long' : ''}><textPath href={`#${uid}t`} startOffset="50%" textAnchor="middle">{top}</textPath></text>
      <text className="small"><textPath href={`#${uid}b`} startOffset="50%" textAnchor="middle">{stampDate(trip.date)}</textPath></text>
      <Glyph name={won ? 'home' : LOSS_GLYPH[trip.loss ?? 'lamp']} x={43} y={43} size={34} />
    </svg>
  );
}

/** The journey pasted into the page like a ticket: where it set out, every word it went through, and where it ended. */
function Ticket({ trip, today }: { trip: JournalTrip; today: string }) {
  const daily = trip.kind === 'daily';
  const hops = trip.route.length;
  const r = seeded(hashOf(`${trip.date}${trip.startedAt}`));
  const ended = trip.status === 'won'
    ? <>Made it home in <b>{hops}</b> {hops === 1 ? 'hop' : 'hops'} with <b>{trip.manna}</b> manna.</>
    : trip.status === 'lost'
      ? <>{lossInfo(trip.loss ?? 'lamp').name}, after {hops} {hops === 1 ? 'hop' : 'hops'}.</>
      : <>On the road: {hops} {hops === 1 ? 'hop' : 'hops'} so far.</>;
  return (
    <div className={`jr-ticket ${daily ? '' : 'school'}`} style={{ ['--r' as string]: `${(r() * 2.4 - 1.2).toFixed(2)}deg` }}>
      <div className="jr-ticket-stub">
        {daily && trip.puzzleNo > 0 ? <><span>No.</span><b>{trip.puzzleNo}</b></> : <Icon name="book" />}
      </div>
      <div className="jr-ticket-body">
        <p className="jr-ticket-kind">{daily ? 'The daily journey' : 'Sunday School'}</p>
        <p className="jr-route">
          <span className="jr-stop first">{trip.homeRef}</span>
          {trip.route.map((h, i) => (
            <Fragment key={i}>
              {' '}<span className="jr-door"><i>{h.door}</i></span>{' '}
              <span className={`jr-stop ${h.home ? 'home' : ''}`}>{h.home ? 'Home' : h.ref}</span>
            </Fragment>
          ))}
        </p>
        <p className="jr-ticket-foot">
          {ended}
          {trip.status === 'playing' && trip.date === today && (
            <button className="jr-link" onClick={() => { press(); navigate(daily ? '/play' : '/practice'); }}>Carry on</button>
          )}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------- a kept verse

const SOURCE: Record<string, string> = {
  page: 'kept while hopping',
  road: 'kept along the Emmaus Road',
  game: 'kept from a daily game',
  journal: 'kept in these pages',
};

function Kept({ b, ctx }: { b: Bookmark; ctx: Ctx }) {
  const r = seeded(b.verse + 7);
  const where = (b.source && SOURCE[b.source]) || 'kept';
  return (
    <div className="jr-kept">
      <figure className={`jr-slip tape-${b.verse % 4}`} style={{ ['--r' as string]: `${(r() * 2.2 - 1.1).toFixed(2)}deg`, ['--t' as string]: `${(r() * 8 - 4).toFixed(1)}deg` }}>
        <figcaption>
          <b>{b.ref}</b>
          <BookmarkButton verse={b.verse} refLabel={b.ref} source="journal" className="on-paper" size="1.05rem" />
        </figcaption>
        <blockquote>{pretty(b.text)}</blockquote>
      </figure>
      <p className="jr-margin">{where}{b.uses > 0 && <> &middot; hopped here {b.uses === 1 ? 'once' : `${b.uses} times`}</>}</p>
      <Ink value={b.note} placeholder="What does this verse say to you?" label={`Your note on ${b.ref}`} onSave={(t) => api.saveBookmark(b.verse, t).then((x) => { ctx.noted(b.verse, x.note); return x.note; })} />
    </div>
  );
}

// ---------------------------------------------------------------------------- the pages

function DayPage({ p, ctx }: { p: DaySpec; ctx: Ctx }) {
  const isToday = p.date === ctx.today;
  const daily = p.trips.find((t) => t.kind === 'daily');
  const school = p.trips.filter((t) => t.kind === 'practice');
  const seed = hashOf(p.date);
  return (
    <>
      <header className={`jr-day-head ${daily && daily.status !== 'playing' ? 'stamped' : ''}`}>
        <p className="jr-weekday">{weekdayOf(p.date)}{isToday && <span className="jr-today">today</span>}</p>
        <h2 className="jr-date">{longDate(p.date)}<Scribble seed={seed} /></h2>
      </header>
      {daily && daily.status !== 'playing' && <Stamp trip={daily} />}
      {daily && <Ticket trip={daily} today={ctx.today} />}
      {school.map((t) => <Ticket key={t.startedAt} trip={t} today={ctx.today} />)}
      {!daily && isToday && (
        <p className="jr-pencil">No journey yet today. <button className="jr-link" onClick={() => { press(); navigate('/'); }}>The road is open</button></p>
      )}
      {p.kept.length > 0 && <h3 className="jr-hand-h">{p.kept.length === 1 ? 'A verse I kept' : 'Verses I kept'}</h3>}
      {p.kept.map((b) => <Kept key={b.verse} b={b} ctx={ctx} />)}
      <section className="jr-thoughts">
        <h3 className="jr-hand-h">{isToday ? 'Today’s thoughts' : 'Thoughts'}</h3>
        <Ink value={p.text} minRows={4} placeholder={isToday ? 'Write about today…' : 'Write about this day…'} label={`Your page for ${longDate(p.date)}`} onSave={(t) => api.writePage(p.date, t).then((x) => { ctx.wrote(p.date, x.text); return x.text; })} />
      </section>
      <Doodle seed={seed} />
      {seed % 4 === 1 && <span className="jr-ring" style={{ ['--r' as string]: `${seed % 360}deg` }} aria-hidden="true" />}
    </>
  );
}

function PlatePage({ ctx }: { ctx: Ctx }) {
  const { v } = ctx;
  const homes = v.trips.filter((t) => t.kind === 'daily' && t.status === 'won').length;
  const days = new Set(v.trips.filter((t) => t.kind === 'daily').map((t) => t.date)).size;
  return (
    <div className="jr-plate-page">
      <div className="jr-plate">
        <Ornament size={34} className="jr-plate-orn" />
        <p className="jr-exlibris">Ex Libris</p>
        <p className="jr-belongs">This journal belongs to</p>
        <p className="jr-owner">{v.owner.name ?? 'a fellow traveller'}</p>
        <p className="jr-begun">begun {longDate(localDate(v.owner.since))}</p>
      </div>
      <blockquote className="jr-epigraph">
        Thy word have I hid in mine heart, that I might not sin against thee.
        <cite>Psalm 119:11</cite>
      </blockquote>
      {days + v.totals.hops + v.totals.saved === 0 ? (
        <p className="jr-pencil">Nothing written here yet. Every day you hop, the Journal grows by a page.</p>
      ) : (
      <ul className="jr-tallies">
        <li><b>{days}</b> {days === 1 ? 'day on the road' : 'days on the road'}</li>
        <li><b>{homes}</b> {homes === 1 ? 'time home' : 'times home'}</li>
        <li><b>{v.totals.saved}</b> {v.totals.saved === 1 ? 'verse kept' : 'verses kept'}</li>
        <li><b>{v.totals.hops}</b> {v.totals.hops === 1 ? 'hop' : 'hops'}, through <b>{v.totals.verses}</b> {v.totals.verses === 1 ? 'verse' : 'verses'}</li>
      </ul>
      )}
    </div>
  );
}

function ContentsPage({ ctx }: { ctx: Ctx }) {
  const { pages, go, today } = ctx;
  const at = (id: string) => pages.findIndex((x) => x.id === id);
  const months: { label: string; index: number }[] = [];
  pages.forEach((x, i) => {
    if (x.kind !== 'day') return;
    const m = monthOf(x.date);
    if (!months.length || months[months.length - 1].label !== m) months.push({ label: m, index: i });
  });
  const line = (label: ReactNode, index: number, sub = false) => (
    <li key={`${index}-${String(label)}`} className={sub ? 'sub' : ''}>
      <button onClick={() => go(index)}>
        <span>{label}</span><i className="jr-leader" aria-hidden="true" /><span className="jr-pg">{pages[index]?.folio}</span>
      </button>
    </li>
  );
  return (
    <>
      <h2 className="jr-print-title">Contents</h2>
      <ol className="jr-contents">
        {line('The bookplate', at('plate'))}
        <li className="jr-contents-h">Days on the road</li>
        {months.map((m) => line(m.label, m.index, true))}
        {line('Today', at(`day:${today}`), true)}
        {line('Well-worn verses', at('worn:0'))}
        {line('Index of kept verses', at('index:0'))}
      </ol>
      <p className="jr-pencil small">Every day you hop, a page is added. Write on any of them.</p>
    </>
  );
}

/** Tally marks, in fives. */
function Tally({ n, seed }: { n: number; seed: number }) {
  const shown = Math.min(n, 25);
  const groups = Math.ceil(shown / 5);
  const r = seeded(seed);
  const marks: ReactNode[] = [];
  for (let g = 0; g < groups; g++) {
    const inGroup = Math.min(5, shown - g * 5);
    const x0 = g * 31;
    for (let k = 0; k < Math.min(4, inGroup); k++) {
      const x = x0 + 4 + k * 6 + (r() - 0.5) * 1.6;
      marks.push(<path key={`${g}.${k}`} d={`M${x.toFixed(1)} ${(3 + r() * 2).toFixed(1)} L${(x + (r() - 0.5) * 2.6).toFixed(1)} ${(20 + r() * 2).toFixed(1)}`} />);
    }
    if (inGroup === 5) marks.push(<path key={`${g}.x`} d={`M${x0 + 0.5} ${(17 + r() * 3).toFixed(1)} L${x0 + 26} ${(5 + r() * 3).toFixed(1)}`} />);
  }
  return (
    <span className="jr-tally" aria-label={`${n} ${n === 1 ? 'hop' : 'hops'}`}>
      <svg viewBox={`0 0 ${Math.max(1, groups) * 31} 24`} width={Math.max(1, groups) * 27} height="21" aria-hidden="true">{marks}</svg>
      {n > 25 && <b>+{n - 25}</b>}
    </span>
  );
}

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

function WornPage({ p, ctx }: { p: Extract<PageSpec, { kind: 'worn' }>; ctx: Ctx }) {
  return (
    <>
      <h2 className="jr-hand-title">Well-worn verses{p.parts > 1 && <small> ({p.part + 1} of {p.parts})</small>}</h2>
      <p className="jr-hand-sub">the verses I keep coming back to</p>
      {p.rows.length === 0 ? (
        <p className="jr-pencil">Every verse you hop to is counted here, so the ones you know by heart rise to the top.</p>
      ) : (
        <ol className="jr-worn">
          {p.rows.map((t) => {
            const kept = ctx.v.bookmarks.find((b) => b.verse === t.verse);
            const at = kept ? ctx.pages.findIndex((x) => x.id === `day:${localDate(kept.savedAt)}`) : -1;
            return (
              <li key={t.verse}>
                <span className="jr-rank">
                  <svg viewBox="0 0 30 28" aria-hidden="true"><path d="M15 2.5 C23 2,28 8,27.5 14.5 C27 21,21 26,14 25.5 C6.5 25,2 19.5,2.5 13 C3 6.5,8.5 2.6,17 3.4" /></svg>
                  <b>{t.rank}</b>
                </span>
                <div className="jr-worn-main">
                  <p className="jr-worn-head">
                    {at >= 0 ? <button className="jr-worn-ref" onClick={() => ctx.go(at)}>{t.ref}</button> : <b className="jr-worn-ref">{t.ref}</b>}
                    <Tally n={t.count} seed={t.verse} />
                  </p>
                  <p className="jr-worn-text">{pretty(t.text)}</p>
                  {t.everyoneRank !== null && <p className="jr-worn-all">{ordinal(t.everyoneRank)} among all players</p>}
                </div>
                {t.rank <= 3 && <span className={`jr-star r${t.rank}`} aria-hidden="true" />}
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}

function IndexPage({ p, ctx }: { p: Extract<PageSpec, { kind: 'index' }>; ctx: Ctx }) {
  return (
    <>
      <h2 className="jr-print-title">Index of kept verses{p.parts > 1 && <small> {p.part + 1} of {p.parts}</small>}</h2>
      {p.rows.length === 0 ? (
        <p className="jr-pencil">No verses kept yet. Tap the ribbon beside any verse, while you hop or along your Emmaus Road, and it is taped into that day&rsquo;s page.</p>
      ) : (
        <ul className="jr-index">
          {p.rows.map(({ b, at }) => (
            <li key={b.verse}>
              <button onClick={() => ctx.go(at)}>
                <span>{b.ref}</span><i className="jr-leader" aria-hidden="true" /><span className="jr-pg">{ctx.pages[at]?.folio}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function EndPage() {
  return (
    <div className="jr-end">
      <Icon name="lamp" className="jr-end-lamp" strokeWidth={1.2} />
      <p className="jr-pencil">The pages after this one are still blank. Every day you hop, the Journal grows by a page.</p>
      <blockquote className="jr-epigraph">Thy word is a lamp unto my feet, and a light unto my path.<cite>Psalm 119:105</cite></blockquote>
    </div>
  );
}

/** What goes on a page. */
export function PageContent({ p, ctx }: { p: PageSpec; ctx: Ctx }) {
  switch (p.kind) {
    case 'plate': return <PlatePage ctx={ctx} />;
    case 'contents': return <ContentsPage ctx={ctx} />;
    case 'day': return <DayPage p={p} ctx={ctx} />;
    case 'worn': return <WornPage p={p} ctx={ctx} />;
    case 'index': return <IndexPage p={p} ctx={ctx} />;
    case 'end': return <EndPage />;
    default: return null;
  }
}

/** The Journal's pages in order: the bookplate, the contents, each day (oldest first), the well-worn verses and the index. */
export function buildPages(v: JournalView, today: string, spread: boolean): PageSpec[] {
  const group = <T,>(xs: T[], key: (x: T) => string) => {
    const m = new Map<string, T[]>();
    for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
    return m;
  };
  const trips = group(v.trips, (t) => t.date);
  const kept = group(v.bookmarks, (b) => localDate(b.savedAt));
  const written = new Map(v.pages.map((p) => [p.date, p.text]));
  const dates = [...new Set([today, ...trips.keys(), ...kept.keys(), ...written.keys()])].sort();
  const pages: PageSpec[] = [];
  if (spread) pages.push({ id: 'endpaper', kind: 'endpaper', folio: null });
  let folio = 1;
  pages.push({ id: 'plate', kind: 'plate', folio: folio++ });
  pages.push({ id: 'contents', kind: 'contents', folio: folio++ });
  for (const date of dates) {
    pages.push({
      id: `day:${date}`,
      kind: 'day',
      folio: folio++,
      date,
      trips: (trips.get(date) ?? []).sort((a, b) => Number(a.kind === 'practice') - Number(b.kind === 'practice') || a.startedAt - b.startedAt),
      kept: (kept.get(date) ?? []).sort((a, b) => a.savedAt - b.savedAt),
      text: written.get(date) ?? '',
    });
  }
  const WORN = 6;
  const wornParts = Math.max(1, Math.ceil(v.top.length / WORN));
  for (let i = 0; i < wornParts; i++) pages.push({ id: `worn:${i}`, kind: 'worn', folio: folio++, rows: v.top.slice(i * WORN, (i + 1) * WORN), part: i, parts: wornParts });
  const where = new Map(pages.map((p, i) => [p.id, i]));
  const byBible = [...v.bookmarks].sort((a, b) => a.verse - b.verse);
  const IDX = 18;
  const idxParts = Math.max(1, Math.ceil(byBible.length / IDX));
  for (let i = 0; i < idxParts; i++) {
    const rows = byBible.slice(i * IDX, (i + 1) * IDX).map((b) => ({ b, at: where.get(`day:${localDate(b.savedAt)}`) ?? 0 }));
    pages.push({ id: `index:${i}`, kind: 'index', folio: folio++, rows, part: i, parts: idxParts });
  }
  pages.push({ id: 'end', kind: 'end', folio: folio++ });
  return pages;
}
