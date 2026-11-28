// The Journal: the verses a player has kept, each with room for a note, and their go-to verses,
// the ones they hop to most, ranked, with where each stands among every player's favourites.
import { useEffect, useRef, useState } from 'react';
import type { Bookmark, JournalView, TopVerse } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { useApp } from '../app-store.ts';
import { useBookmarks } from '../bookmarks.ts';
import { navigate } from '../router.ts';
import { BookmarkButton } from '../ui/Bookmark.tsx';
import { plural, press, useDocumentTitle } from '../ui/base.tsx';
import { Icon } from '../ui/icons.tsx';

const pretty = (s: string) => s.replace(/'/g, '’');
const when = (at: number) => new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export function JournalScreen() {
  useDocumentTitle('Journal');
  const [v, setV] = useState<JournalView | null>(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<'saved' | 'top'>(() => (sessionStorage.getItem('bh.journalTab') === 'top' ? 'top' : 'saved'));
  const saved = useBookmarks((s) => s.saved);
  const reload = () => api.journal().then(setV).catch((e) => setErr(e.message));
  useEffect(() => {
    void reload();
  }, []);
  // a ribbon tapped on this screen changes the lists too
  useEffect(() => {
    if (v && (v.bookmarks.some((b) => !saved.has(b.verse)) || v.top.some((t) => t.saved !== saved.has(t.verse)))) void reload();
  }, [saved]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (t: 'saved' | 'top') => {
    press();
    setTab(t);
    try {
      sessionStorage.setItem('bh.journalTab', t);
    } catch {
      /* private mode */
    }
  };
  return (
    <div className="screen leather">
      <header className="bar bar-top">
        <div className="topbar">
          <button className="icon-btn" onClick={() => { press(); navigate('/'); }} aria-label="Back to today"><Icon name="lookback" size="1.3rem" /></button>
          <div className="title">Journal</div>
        </div>
      </header>
      <div className="page-wrap">
        <div className="sheet-page">
          <p className="eyebrow">Your study</p>
          <h1 className="display">My <em>Journal</em></h1>
          <p className="lead">Keep the verses that speak to you, with a note of your own, and see the verses you keep coming back to.</p>
          {err && <p className="msg-line bad">{err}</p>}
          {!v && !err && <p className="muted">Opening your Journal&hellip;</p>}
          {v && (
            <>
              <div className="jr-stats">
                <div className="stat"><div className="n tabular">{v.totals.saved}</div><div className="l">Verses kept</div></div>
                <div className="stat"><div className="n tabular">{v.totals.verses}</div><div className="l">Verses visited</div></div>
                <div className="stat"><div className="n tabular">{v.totals.hops}</div><div className="l">Hops counted</div></div>
              </div>
              <div className="seg jr-tabs" role="tablist" aria-label="Journal">
                <button role="tab" aria-pressed={tab === 'saved'} aria-selected={tab === 'saved'} onClick={() => pick('saved')}><Icon name="ribbon" size="0.95rem" /> Kept verses</button>
                <button role="tab" aria-pressed={tab === 'top'} aria-selected={tab === 'top'} onClick={() => pick('top')}><Icon name="trophy" size="0.95rem" /> Go-to verses</button>
              </div>
              {tab === 'saved' ? <Kept list={v.bookmarks} /> : <GoTo list={v.top} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Kept({ list }: { list: Bookmark[] }) {
  if (!list.length) {
    return (
      <div className="jr-empty card">
        <Icon name="ribbon" size="2rem" />
        <p><b>Nothing kept yet.</b> Tap the ribbon beside any verse, on the page while you hop or along your Emmaus Road, and it will wait for you here.</p>
      </div>
    );
  }
  return (
    <div className="jr-list">
      {list.map((b, i) => <KeptCard key={b.verse} b={b} i={i} />)}
    </div>
  );
}

function KeptCard({ b, i }: { b: Bookmark; i: number }) {
  const [note, setNote] = useState(b.note);
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const last = useRef(b.note);
  const toast = useApp((s) => s.toast);
  const save = () => {
    if (note === last.current) return;
    setState('saving');
    api.saveBookmark(b.verse, note).then((r) => {
      last.current = r.note;
      setState('saved');
      window.setTimeout(() => setState('idle'), 1600);
    }).catch((e: Error) => {
      setState('idle');
      toast(e.message);
    });
  };
  return (
    <article className="parchment jr-card" style={{ ['--i' as string]: i }}>
      <header className="jr-head">
        <span className="jr-ref">{b.ref}</span>
        <span className="jr-meta">{b.wording.toUpperCase()} · kept {when(b.savedAt)}{b.uses ? ` · hopped here ${b.uses}×` : ''}</span>
        <BookmarkButton verse={b.verse} refLabel={b.ref} source="journal" />
      </header>
      <p className="jr-text">{pretty(b.text)}</p>
      <label className="sr-only" htmlFor={`note-${b.verse}`}>Your note on {b.ref}</label>
      <textarea
        id={`note-${b.verse}`}
        className="jr-note"
        placeholder="Write what this verse means to you…"
        value={note}
        rows={note ? Math.min(6, note.split('\n').length + 1) : 2}
        maxLength={2000}
        onChange={(e) => setNote(e.target.value)}
        onBlur={save}
      />
      <span className={`jr-saved ${state}`} aria-live="polite">{state === 'saving' ? 'Saving…' : state === 'saved' ? 'Note saved' : ''}</span>
    </article>
  );
}

function GoTo({ list }: { list: TopVerse[] }) {
  if (!list.length) {
    return (
      <div className="jr-empty card">
        <Icon name="hop" size="2rem" />
        <p><b>No hops counted yet.</b> Every verse you hop to is counted here, so the verses you know by heart rise to the top.</p>
      </div>
    );
  }
  return (
    <ol className="jr-list jr-top">
      {list.map((t, i) => (
        <li key={t.verse} className="parchment jr-card" style={{ ['--i' as string]: i }}>
          <header className="jr-head">
            <span className={`jr-rank r${Math.min(t.rank, 4)}`}>{t.rank <= 3 ? <Icon name="trophy" size="0.95rem" /> : `#${t.rank}`}</span>
            <span className="jr-ref">{t.ref}</span>
            <BookmarkButton verse={t.verse} refLabel={t.ref} source="journal" />
          </header>
          <p className="jr-text">{pretty(t.text)}</p>
          <div className="jr-chips">
            <span className="jr-chip"><b>{t.count}</b> {plural(t.count, 'hop')} here</span>
            <span className="jr-chip">#{t.rank} for you</span>
            {t.everyoneRank !== null && <span className="jr-chip gold">#{t.everyoneRank} among all players</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}
