// The Scribe's Desk (Part II): the admin panel, screen by screen (section 16).
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { RuleSpec } from '../../../shared/rules.ts';
import { ApiError, deskCall } from '../api.ts';
import { navigate } from '../router.ts';
import { Icon, TierBadge } from '../ui/icons.tsx';
import './desk.css';

type Role = 'head' | 'scribe' | 'observer';
interface Admin { id: string; username: string; role: Role }
type Any = Record<string, any>;

const get = <T,>(url: string) => deskCall<T>('GET', url);
const post = <T,>(url: string, body: unknown = {}) => deskCall<T>('POST', url, body);
const q = (o: Record<string, string | number | undefined>) => Object.entries(o).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');

/** Rule 17.10: times on the Desk show in the Scribe's own zone and in UTC. */
function when(ms: number | null | undefined): string {
  if (!ms) return '—';
  const d = new Date(ms);
  return `${d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} · ${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (date: string, n: number) => new Date(Date.parse(date) + n * 86_400_000).toISOString().slice(0, 10);

function useLoad<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | null; err: string; reload: () => void; loading: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    fn().then((d) => live && (setData(d), setErr(''))).catch((e) => live && setErr(e.message)).finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { data, err, reload: () => setN((x) => x + 1), loading };
}

function Msg({ text, tone = 'info' }: { text: string; tone?: 'info' | 'warn' | 'bad' | 'good' }) {
  return text ? <div className={`msg-line ${tone}`} role={tone === 'bad' ? 'alert' : 'status'}>{text}</div> : null;
}

/** Runs an action, shows its error, and reloads when it worked. */
function useAction(reload?: () => void): { run: (fn: () => Promise<unknown>, done?: string) => Promise<boolean>; msg: string; tone: 'good' | 'bad'; busy: boolean } {
  const [msg, setMsg] = useState('');
  const [tone, setTone] = useState<'good' | 'bad'>('good');
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn: () => Promise<unknown>, done = 'Saved.') => {
    setBusy(true);
    try {
      await fn();
      setTone('good');
      setMsg(done);
      reload?.();
      return true;
    } catch (e) {
      setTone('bad');
      setMsg(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }, [reload]);
  return { run, msg, tone, busy };
}

const TABS: { id: string; name: string; icon: string; min: Role }[] = [
  { id: 'today', name: 'Today', icon: 'lamp', min: 'observer' },
  { id: 'calendar', name: 'Calendar', icon: 'clock', min: 'observer' },
  { id: 'check', name: 'Verse check', icon: 'lens', min: 'scribe' },
  { id: 'storehouse', name: 'Storehouse', icon: 'loaf', min: 'scribe' },
  { id: 'remembrance', name: 'Remembrance', icon: 'book', min: 'observer' },
  { id: 'lexicon', name: 'Lexicon', icon: 'pearl', min: 'observer' },
  { id: 'law', name: 'The Law', icon: 'gate', min: 'observer' },
  { id: 'disputes', name: 'Disputes', icon: 'strike', min: 'scribe' },
  { id: 'players', name: 'Players', icon: 'dove', min: 'scribe' },
  { id: 'announce', name: 'Announcements', icon: 'sparkle', min: 'scribe' },
  { id: 'audit', name: 'Audit log', icon: 'ribbon', min: 'observer' },
  { id: 'settings', name: 'Settings', icon: 'ornament', min: 'observer' },
];
const RANK: Record<Role, number> = { observer: 0, scribe: 1, head: 2 };

export default function Desk({ path }: { path: string }) {
  const [admin, setAdmin] = useState<Admin | null | undefined>(undefined);
  useEffect(() => {
    get<{ admin: Admin }>('/api/desk/me').then((r) => setAdmin(r.admin)).catch(() => setAdmin(null));
  }, []);
  const tab = path.split('/')[2] || 'today';
  if (admin === undefined) return <div className="desk"><p className="muted" style={{ padding: '2rem' }}>Opening the Desk…</p></div>;
  if (!admin) return <Login onDone={setAdmin} />;
  const can = (min: Role) => RANK[admin.role] >= RANK[min];
  const Screen = { today: Today, calendar: Calendar, check: VerseCheck, storehouse: Storehouse, remembrance: Remembrance, lexicon: LexiconScreen, law: Law, disputes: Disputes, players: Players, announce: Announcements, audit: Audit, settings: Settings }[tab] ?? Today;
  return (
    <div className="desk">
      <aside className="desk-nav">
        <div className="desk-brand">
          <Icon name="ornament" size="1.6rem" strokeWidth={1.3} />
          <div><b>The Scribe&rsquo;s Desk</b><span>{admin.username} · {admin.role}</span></div>
        </div>
        <nav>
          {TABS.filter((t) => can(t.min)).map((t) => (
            <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => navigate(`/desk/${t.id}`)}>
              <Icon name={t.icon} size="1.1rem" /> {t.name}
            </button>
          ))}
        </nav>
        <div className="desk-foot">
          <button onClick={() => navigate('/')}><Icon name="hop" size="1rem" /> The game</button>
          <button onClick={() => post('/api/desk/logout').then(() => setAdmin(null))}><Icon name="lookback" size="1rem" /> Sign out</button>
        </div>
      </aside>
      <main className="desk-main">
        <Screen admin={admin} />
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- sign-in (rule 15.2)

function Login({ onDone }: { onDone: (a: Admin) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'password' | 'totp' | 'enroll'>('password');
  const [qr, setQr] = useState('');
  const [otpauth, setOtpauth] = useState('');
  const [err, setErr] = useState('');
  const setup = useLoad(() => get<{ hasAdmins: boolean }>('/api/desk/setup'), []);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      if (stage === 'password') {
        const r = await post<{ stage: 'totp' | 'enroll'; qr?: string; otpauth?: string }>('/api/desk/login', { username, password });
        setStage(r.stage);
        setQr(r.qr ?? '');
        setOtpauth(r.otpauth ?? '');
      } else {
        const r = await post<{ admin: Admin }>('/api/desk/totp', { code });
        onDone(r.admin);
      }
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'That did not work.');
    }
  };
  const secret = otpauth ? new URL(otpauth).searchParams.get('secret') ?? '' : '';
  return (
    <div className="desk desk-login">
      <form className="card cream" onSubmit={submit}>
        <Icon name="ornament" size="2.4rem" strokeWidth={1.2} className="ornament" />
        <h1 className="display" style={{ fontSize: '2rem', marginTop: '0.4rem' }}>The Scribe&rsquo;s <em>Desk</em></h1>
        {setup.data && !setup.data.hasAdmins && (
          <Msg tone="warn" text="No Scribe exists yet. On the server, run: npm run desk:add -- <username> head" />
        )}
        {stage === 'password' ? (
          <>
            <label className="field-label" htmlFor="du">Username</label>
            <input id="du" className="field" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
            <label className="field-label" htmlFor="dp" style={{ marginTop: '0.6rem' }}>Password</label>
            <input id="dp" className="field" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </>
        ) : (
          <>
            {stage === 'enroll' && (
              <div className="enroll">
                <p className="small">First sign-in: scan this with an authenticator app (Google Authenticator, Authy, 1Password…), then enter the code it shows.</p>
                {qr && <img src={qr} alt="QR code for the authenticator app" width={180} height={180} />}
                <p className="small muted">Or enter the key by hand: <code>{secret}</code></p>
              </div>
            )}
            <label className="field-label" htmlFor="dc" style={{ marginTop: '0.6rem' }}>Code from your authenticator app</label>
            <input id="dc" className="field" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
          </>
        )}
        <Msg tone="bad" text={err} />
        <div className="actions"><button className="btn" type="submit">{stage === 'password' ? 'Continue' : 'Sign in'}</button></div>
        <p className="small muted" style={{ marginTop: '0.8rem' }}><a href="/">Back to the game</a></p>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- Today (16.1)

function Today({ admin }: { admin: Admin }) {
  const { data, err } = useLoad(() => get<Any>('/api/desk/today'), []);
  void admin;
  if (err) return <Msg tone="bad" text={err} />;
  if (!data) return <p className="muted">Loading…</p>;
  return (
    <>
      <h1 className="display">Today</h1>
      <div className="desk-grid">
        {data.days.map((d: Any) => (
          <div key={d.date} className="card cream">
            <div className="eyebrow">#{d.puzzleNo} · {d.date}</div>
            <div className="big-ref">{d.verse ?? 'No verse!'}</div>
            {d.theme && <div className="muted small">{d.theme}</div>}
            <p className="small muted" style={{ marginTop: '0.4rem' }}>Opened {when(d.opensAt)}<br />Closes everywhere {when(d.closesAt)}</p>
            <div className="numbers" style={{ marginTop: '0.8rem' }}>
              <Cell k="Started" v={d.started} /><Cell k="Won" v={d.won} /><Cell k="Lost" v={d.lost} /><Cell k="Playing" v={d.playing} />
              <Cell k="Win rate" v={d.winRate === null ? '—' : `${Math.round(d.winRate * 100)}%`} />
              <Cell k="Median hops" v={d.medianHops} /><Cell k="Median manna" v={d.medianManna} /><Cell k="Strikes / journey" v={d.strikesPerJourney.toFixed(2)} />
              <Cell k="AI checks" v={`${d.ai.used} used · ${d.ai.failed} failed`} />
            </div>
            {Object.keys(d.lostBy).length > 0 && <p className="small" style={{ marginTop: '0.6rem' }}>Lost by: {Object.entries(d.lostBy).map(([k, v]) => `${k} ${v}`).join(', ')}</p>}
          </div>
        ))}
      </div>
      <div className="card cream" style={{ marginTop: '1rem' }}>
        <b>Disputes waiting: {data.disputesWaiting}</b>
      </div>
      <h2 className="display" style={{ fontSize: '1.5rem', marginTop: '1.4rem' }}>Alerts</h2>
      {data.alerts.length === 0 && <p className="muted">Nothing needs attention.</p>}
      {data.alerts.map((a: Any, i: number) => <Msg key={i} tone={a.level === 'urgent' ? 'bad' : a.level === 'warn' ? 'warn' : 'info'} text={a.text} />)}
    </>
  );
}

function Cell({ k, v }: { k: string; v: ReactNode }) {
  return <div className="cell"><div className="k">{k}</div><div className="v" style={{ fontSize: '1.2rem' }}>{v}</div></div>;
}

// ---------------------------------------------------------------------------------------------- Calendar (16.2)

function Calendar({ admin }: { admin: Admin }) {
  const [month, setMonth] = useState(today().slice(0, 7));
  const from = `${month}-01`, to = addDays(`${month}-01`, 40).slice(0, 7) === month ? addDays(`${month}-01`, 40) : addDays(`${addDays(`${month}-01`, 40).slice(0, 7)}-01`, -1);
  const { data, err, reload } = useLoad(() => get<{ days: Any[] }>(`/api/desk/calendar?${q({ from, to })}`), [month]);
  const [sel, setSel] = useState<Any | null>(null);
  const [csv, setCsv] = useState('');
  const [skip, setSkip] = useState(false);
  const [report, setReport] = useState<Any | null>(null);
  const act = useAction(reload);
  const canEdit = RANK[admin.role] >= 1;
  return (
    <>
      <div className="desk-head">
        <h1 className="display">Calendar</h1>
        <div className="seg">
          <button onClick={() => setMonth(addDays(`${month}-01`, -1).slice(0, 7))}>‹</button>
          <button aria-pressed>{month}</button>
          <button onClick={() => setMonth(addDays(`${month}-01`, 32).slice(0, 7))}>›</button>
        </div>
      </div>
      <Msg tone="bad" text={err} />
      <Msg tone={act.tone} text={act.msg} />
      {canEdit && (
        <div className="desk-toolbar">
          <button className="btn small" disabled={act.busy} onClick={() => act.run(() => post<Any>('/api/desk/calendar/fill', { days: 14 }).then((r) => { setReport({ filled: r.filled }); }), 'Filled from the Storehouse.')}>Fill empty dates from the Storehouse</button>
          <details>
            <summary className="btn small ghost">Import CSV</summary>
            <div className="card cream" style={{ marginTop: '0.5rem' }}>
              <p className="small muted">One row per date: <code>date,reference,theme,note</code>. Every row is run through the Verse check and the repeat rule.</p>
              <textarea className="field" style={{ fontFamily: 'monospace', fontSize: '0.9rem' }} rows={6} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={'2026-12-01,John 3:16,Love,\n2026-12-02,Psalm 23:1,,'} />
              <label className="small" style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginTop: '0.4rem' }}><input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} /> Skip failing rows and save the rest</label>
              <button className="btn small" style={{ marginTop: '0.5rem' }} disabled={act.busy} onClick={() => act.run(() => post<Any>('/api/desk/calendar/import', { csv, skipFailing: skip }).then((r) => setReport(r)), 'Import finished.')}>Run import</button>
            </div>
          </details>
        </div>
      )}
      {report?.rows && (
        <div className="card cream" style={{ marginBottom: '1rem' }}>
          <b>Import: {report.saved} saved</b>{report.saved === 0 && report.rows.some((r: Any) => !r.ok) ? ' (nothing was saved because some rows failed; tick "skip failing rows" to save the rest)' : ''}
          <table className="desk-table"><tbody>{report.rows.map((r: Any) => <tr key={r.line} className={r.ok ? '' : 'bad'}><td>{r.line}</td><td>{r.date}</td><td>{r.ref}</td><td>{r.message}</td></tr>)}</tbody></table>
        </div>
      )}
      {report?.filled && <Msg tone="good" text={report.filled.length ? `Filled: ${report.filled.map((f: Any) => `${f.date} ${f.ref}`).join(', ')}` : 'No empty dates to fill in the next 14 days, or the Storehouse has nothing eligible.'} />}
      <div className="desk-split">
        <table className="desk-table">
          <thead><tr><th>Date</th><th>#</th><th>Status</th><th>Verse</th><th>Theme</th><th>Players</th><th>Won</th></tr></thead>
          <tbody>
            {data?.days.map((d) => (
              <tr key={d.date} className={sel?.date === d.date ? 'sel' : ''} onClick={() => setSel(d)} style={{ cursor: 'pointer' }}>
                <td>{d.date}</td><td>{d.puzzleNo}</td><td><span className={`pill soft st-${d.status}`}>{d.status}</span></td><td>{d.verse ?? <span className="muted">empty</span>}</td><td className="muted">{d.theme}</td><td>{d.status === 'scheduled' || d.status === 'empty' ? '' : d.players}</td><td>{d.winRate === null ? '' : `${Math.round(d.winRate * 100)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {sel && <DayEditor key={sel.date} day={sel} admin={admin} onDone={() => { reload(); }} />}
      </div>
    </>
  );
}

function DayEditor({ day, admin, onDone }: { day: Any; admin: Admin; onDone: () => void }) {
  const [ref, setRef] = useState(day.verse ?? '');
  const [theme, setTheme] = useState(day.theme ?? '');
  const [note, setNote] = useState(day.note ?? '');
  const [check, setCheck] = useState<Any | null>(null);
  const [reason, setReason] = useState('');
  const [other, setOther] = useState('');
  const act = useAction(onDone);
  const locked = day.status === 'live' || day.status === 'closed';
  const canEdit = RANK[admin.role] >= 1 && !locked;
  const isHead = admin.role === 'head';
  const runCheck = () => act.run(() => get<Any>(`/api/desk/verse-check?${q({ ref, date: day.date })}`).then(setCheck), 'Checked.');
  return (
    <div className="card cream desk-editor">
      <div className="eyebrow">{day.date} · #{day.puzzleNo} · {day.status}</div>
      {locked && <p className="small muted">This date has opened somewhere on Earth, so it is locked (rule 17.1).{day.status === 'live' && isHead ? ' Only the Head Scribe can replace a live verse, in an emergency.' : ''}</p>}
      <label className="field-label">Verse</label>
      <input className="field" value={ref} onChange={(e) => setRef(e.target.value)} disabled={!canEdit && !(isHead && day.status === 'live')} placeholder="e.g. Psalm 23:1" />
      {!locked && <>
        <label className="field-label" style={{ marginTop: '0.5rem' }}>Theme (optional)</label>
        <input className="field" value={theme} onChange={(e) => setTheme(e.target.value)} disabled={!canEdit} />
        <label className="field-label" style={{ marginTop: '0.5rem' }}>Note (optional)</label>
        <input className="field" value={note} onChange={(e) => setNote(e.target.value)} disabled={!canEdit} />
      </>}
      {check && <CheckSummary c={check} />}
      {check?.repeatConflict && isHead && !locked && <>
        <label className="field-label" style={{ marginTop: '0.5rem' }}>Reason for overriding the repeat rule</label>
        <input className="field" value={reason} onChange={(e) => setReason(e.target.value)} />
      </>}
      {isHead && day.status === 'live' && <>
        <label className="field-label" style={{ marginTop: '0.5rem' }}>Reason for the emergency replacement</label>
        <input className="field" value={reason} onChange={(e) => setReason(e.target.value)} />
      </>}
      <Msg tone={act.tone} text={act.msg} />
      <div className="desk-toolbar" style={{ marginTop: '0.6rem' }}>
        {(canEdit || (isHead && day.status === 'live')) && <button className="btn small ghost" disabled={act.busy || !ref} onClick={runCheck}>Check</button>}
        {canEdit && <button className="btn small" disabled={act.busy || !ref} onClick={() => act.run(() => post('/api/desk/calendar/schedule', { date: day.date, ref, theme, note, rev: day.rev || undefined, override: !!(check?.repeatConflict && isHead), reason }), 'Scheduled.')}>Schedule</button>}
        {canEdit && day.verse && <button className="btn small ghost" disabled={act.busy} onClick={() => act.run(() => post('/api/desk/calendar/clear', { date: day.date }), 'Cleared.')}>Clear</button>}
        {isHead && day.status === 'live' && <button className="btn small" style={{ background: 'var(--red)' }} disabled={act.busy || !ref || !reason} onClick={() => act.run(() => post('/api/desk/calendar/replace', { date: day.date, ref, reason }), 'Replaced. An announcement was drafted.')}>Replace live verse</button>}
      </div>
      {canEdit && day.verse && (
        <div className="desk-toolbar" style={{ marginTop: '0.6rem', alignItems: 'center' }}>
          <input className="field" style={{ width: '10.5rem' }} type="date" value={other} onChange={(e) => setOther(e.target.value)} aria-label="Other date" />
          <button className="btn small ghost" disabled={act.busy || !other} onClick={() => act.run(() => post('/api/desk/calendar/move', { from: day.date, to: other }), 'Moved.')}>Move to</button>
          <button className="btn small ghost" disabled={act.busy || !other} onClick={() => act.run(() => post('/api/desk/calendar/swap', { a: day.date, b: other }), 'Swapped.')}>Swap with</button>
        </div>
      )}
    </div>
  );
}

function CheckSummary({ c }: { c: Any }) {
  return (
    <div className="check-summary">
      <div><b>{c.ref}</b> · {c.waysHome} ways home · <b>{c.rating}</b> · {c.words} words · {c.meaningWords} meaning words{c.history.length ? ` · home on ${c.history.join(', ')}` : ''}</div>
      {c.warnings.map((w: string, i: number) => <Msg key={i} tone="warn" text={w} />)}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- Verse check (16.3)

function VerseCheck({ admin }: { admin: Admin }) {
  const [ref, setRef] = useState('');
  const [date, setDate] = useState('');
  const [c, setC] = useState<Any | null>(null);
  const [chapter, setChapter] = useState<Any | null>(null);
  const act = useAction();
  const run = () => act.run(() => get<Any>(`/api/desk/verse-check?${q({ ref, date })}`).then((r) => { setC(r); setChapter(null); }), 'Checked.');
  return (
    <>
      <h1 className="display">Verse check</h1>
      <div className="desk-toolbar" style={{ alignItems: 'flex-end' }}>
        <div><label className="field-label">Verse</label><input className="field" value={ref} onChange={(e) => setRef(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run()} placeholder="e.g. Isaiah 40:31" /></div>
        <div><label className="field-label">For date (optional)</label><input className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <button className="btn" disabled={act.busy || !ref} onClick={run}>Check</button>
      </div>
      <Msg tone={act.tone} text={act.msg} />
      {c && (
        <div className="desk-split">
          <div>
            <div className="card cream">
              <div className="big-ref">{c.ref}</div>
              <p className="scripture" style={{ fontSize: '1.15rem', marginTop: '0.4rem' }}><b className="small">KJV</b> {c.kjv || <em className="muted">not in the KJV</em>}</p>
              <p className="scripture" style={{ fontSize: '1.15rem', marginTop: '0.4rem' }}><b className="small">WEB</b> {c.web || <em className="muted">not in the WEB</em>}</p>
              <CheckSummary c={c} />
              <div className="desk-toolbar" style={{ marginTop: '0.6rem' }}>
                <button className="btn small ghost" onClick={() => get<Any>(`/api/desk/chapter?${q({ book: c.book, chapter: c.chapter })}`).then(setChapter)}>Show the chapter</button>
                <a className="btn small ghost" href={`/practice?verse=${encodeURIComponent(c.ref)}`} target="_blank" rel="noreferrer">Test this verse</a>
                <button className="btn small ghost" disabled={c.inStorehouse || act.busy} onClick={() => act.run(() => post('/api/desk/storehouse/add', { ref: c.ref }).then(() => setC({ ...c, inStorehouse: true })), 'Added to the Storehouse.')}>{c.inStorehouse ? 'In the Storehouse' : 'Add to the Storehouse'}</button>
                <ScheduleFor refText={c.ref} act={act} />
              </div>
            </div>
            {chapter && (
              <div className="card cream" style={{ marginTop: '0.8rem', maxHeight: '22rem', overflow: 'auto' }}>
                <b>{chapter.ref}</b>
                {chapter.verses.map((v: Any) => <p key={v.v} className="scripture small" style={{ marginTop: '0.3rem' }}><b>{v.v}</b> {v.kjv}</p>)}
              </div>
            )}
          </div>
          <table className="desk-table">
            <thead><tr><th>Word</th><th>In this verse as</th><th>Kind</th><th>Verses</th></tr></thead>
            <tbody>
              {c.families.map((f: Any) => (
                <tr key={f.key} className={f.tier === 'wall' ? 'muted' : ''}>
                  <td><TierBadge tier={f.tier} size={18} /> {f.key}</td><td>{f.forms.join(', ')}</td><td>{f.tier}</td><td>{f.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {admin.role === 'observer' && <p className="muted small">Observers can look but not schedule.</p>}
    </>
  );
}

function ScheduleFor({ refText, act }: { refText: string; act: ReturnType<typeof useAction> }) {
  const [date, setDate] = useState('');
  return (
    <span style={{ display: 'inline-flex', gap: '0.4rem' }}>
      <input className="field" style={{ width: '10.5rem', padding: '0.4rem 0.7rem' }} type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Schedule for date" />
      <button className="btn small" disabled={!date || act.busy} onClick={() => act.run(() => post('/api/desk/calendar/schedule', { date, ref: refText }), `Scheduled for ${date}.`)}>Schedule</button>
    </span>
  );
}

// ---------------------------------------------------------------------------------------------- Storehouse (16.4)

function Storehouse({ admin }: { admin: Admin }) {
  const { data, err, reload } = useLoad(() => get<{ verses: Any[] }>('/api/desk/storehouse'), []);
  const [ref, setRef] = useState('');
  const act = useAction(reload);
  const canEdit = RANK[admin.role] >= 1;
  const move = (i: number, d: number) => {
    const list = data!.verses.map((v) => v.verse);
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    void act.run(() => post('/api/desk/storehouse/order', { verses: list }), 'Reordered.');
  };
  return (
    <>
      <div className="desk-head"><h1 className="display">Storehouse</h1>{data && <span className="pill soft">{data.verses.length} verses</span>}</div>
      <p className="small muted">The reserve of approved verses, in order. An empty date is filled from here 48 hours before it opens: the first verse that was not home in the last 365 days and not from a chapter used in the last 30.</p>
      <Msg tone="bad" text={err} /><Msg tone={act.tone} text={act.msg} />
      {canEdit && (
        <div className="desk-toolbar">
          <input className="field" style={{ maxWidth: '16rem' }} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Add a verse, e.g. Romans 8:28" onKeyDown={(e) => e.key === 'Enter' && act.run(() => post('/api/desk/storehouse/add', { ref }).then(() => setRef('')), 'Added.')} />
          <button className="btn small" disabled={act.busy || !ref} onClick={() => act.run(() => post('/api/desk/storehouse/add', { ref }).then(() => setRef('')), 'Added.')}>Add</button>
          <button className="btn small ghost" disabled={act.busy} onClick={() => act.run(() => post('/api/desk/storehouse/order', { shuffle: true }), 'Shuffled.')}>Shuffle</button>
        </div>
      )}
      <table className="desk-table">
        <thead><tr><th>#</th><th>Verse</th><th>Ways home</th><th>Rating</th><th>Last home</th><th></th></tr></thead>
        <tbody>
          {data?.verses.map((v, i) => (
            <tr key={v.verse}>
              <td>{i + 1}</td><td><b>{v.ref}</b> <span className="muted small">{v.text}…</span></td><td>{v.waysHome}</td><td>{v.rating}</td><td>{v.lastHome ?? '—'}</td>
              <td className="row-actions">{canEdit && <><button onClick={() => move(i, -1)} aria-label="Move up">↑</button><button onClick={() => move(i, 1)} aria-label="Move down">↓</button><button onClick={() => act.run(() => post('/api/desk/storehouse/remove', { verse: v.verse }), 'Removed.')} aria-label="Remove">✕</button></>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

// ---------------------------------------------------------------------------------------------- Book of Remembrance (16.5)

function Remembrance({ admin }: { admin: Admin }) {
  const [search, setSearch] = useState('');
  const { data, err, reload } = useLoad(() => get<{ dates: Any[] }>(`/api/desk/remembrance?${q({ q: search })}`), [search]);
  const act = useAction(reload);
  const [editing, setEditing] = useState<string | null>(null);
  const [note, setNote] = useState('');
  return (
    <>
      <div className="desk-head"><h1 className="display">Book of Remembrance</h1><a className="btn small ghost" href="/api/desk/remembrance.csv">Export CSV</a></div>
      <input className="field" style={{ maxWidth: '22rem' }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by reference, book or word" />
      <Msg tone="bad" text={err} /><Msg tone={act.tone} text={act.msg} />
      <table className="desk-table">
        <thead><tr><th>Date</th><th>#</th><th>Verse</th><th>Players</th><th>Won</th><th>Median manna</th><th>First door</th><th>Home door</th><th>Rarest home</th><th>Note</th></tr></thead>
        <tbody>
          {data?.dates.map((d) => (
            <tr key={d.date}>
              <td>{d.date}</td><td>{d.puzzleNo}</td><td><b>{d.ref}</b>{d.replaced.length > 0 && <div className="small muted">replaced {d.replaced.map((r: Any) => r.ref).join(', ')}</div>}</td><td>{d.players}</td><td>{d.winRate === null ? '—' : `${Math.round(d.winRate * 100)}%`}</td><td>{d.medianManna ?? '—'}</td><td>{d.firstDoor ?? '—'}</td><td>{d.homeDoor ?? '—'}</td><td>{d.rarestHomeDoor ?? '—'}</td>
              <td>
                {editing === d.date ? (
                  <span style={{ display: 'flex', gap: '0.3rem' }}>
                    <input className="field" style={{ padding: '0.3rem 0.6rem' }} value={note} onChange={(e) => setNote(e.target.value)} />
                    <button className="btn small" onClick={() => act.run(() => post('/api/desk/remembrance/note', { date: d.date, note }).then(() => setEditing(null)), 'Note saved.')}>Save</button>
                  </span>
                ) : (
                  <span>{d.note ?? <span className="muted">—</span>} {RANK[admin.role] >= 1 && <button className="link-btn" onClick={() => { setEditing(d.date); setNote(d.note ?? ''); }}>edit</button>}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

// ---------------------------------------------------------------------------------------------- Lexicon (16.6)

const OPS: { id: string; name: string; fields: ('word' | 'other' | 'base' | 'form' | 'tier' | 'reason')[] }[] = [
  { id: 'addCrumb', name: 'Make a word a crumb', fields: ['word'] },
  { id: 'removeCrumb', name: 'Remove a word from the crumbs', fields: ['word'] },
  { id: 'split', name: 'Split a form out of its family', fields: ['word'] },
  { id: 'unsplit', name: 'Undo a split', fields: ['word'] },
  { id: 'join', name: 'Join two families', fields: ['word', 'other'] },
  { id: 'irregular', name: 'Add an irregular form', fields: ['base', 'form'] },
  { id: 'variant', name: 'Add a spelling variant', fields: ['word', 'other'] },
  { id: 'neverStem', name: 'Put a word on the never-stem list', fields: ['word'] },
  { id: 'allowStem', name: 'Take a word off the never-stem list', fields: ['word'] },
  { id: 'pin', name: 'Pin a family to a tier', fields: ['word', 'tier', 'reason'] },
  { id: 'unpin', name: 'Unpin a family', fields: ['word'] },
];

function LexiconScreen({ admin }: { admin: Admin }) {
  const [word, setWord] = useState('');
  const [looked, setLooked] = useState('');
  const { data, err } = useLoad(() => get<Any>(`/api/desk/lexicon?${q({ word: looked })}`), [looked]);
  const [op, setOp] = useState<Any>({ type: 'addCrumb' });
  const [preview, setPreview] = useState<Any | null>(null);
  const [note, setNote] = useState('');
  const act = useAction();
  const spec = OPS.find((o) => o.id === op.type)!;
  const w = data?.word;
  return (
    <>
      <h1 className="display">Lexicon</h1>
      <p className="small muted">Words, families and tiers (section 4). Changes take effect from the next date that hasn&rsquo;t opened; a journey keeps the version it started with.</p>
      <div className="desk-toolbar">
        <input className="field" style={{ maxWidth: '16rem' }} value={word} onChange={(e) => setWord(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setLooked(word)} placeholder="Look up a word" />
        <button className="btn small" onClick={() => setLooked(word)}>Look up</button>
      </div>
      <Msg tone="bad" text={err} />
      {w && (w.found ? (
        <div className="card cream">
          <div><TierBadge tier={w.tier} size={22} /> <b>{w.key}</b> · {w.tier} · in {w.count} verses{w.crumb ? ' · crumb' : ''}{w.pinned ? ` · pinned to ${w.pinned.tier} (${w.pinned.reason})` : ''}{w.neverStem ? ' · never stemmed' : ''}</div>
          <p className="small" style={{ marginTop: '0.3rem' }}>Forms: {w.forms.join(', ')}</p>
          {w.sample.map((s: Any) => <p key={s.ref} className="scripture small" style={{ marginTop: '0.3rem' }}><b>{s.ref}</b> {s.text}</p>)}
        </div>
      ) : <Msg tone="warn" text={`"${w.word}" is not in the KJV or the WEB.`} />)}
      <h2 className="display" style={{ fontSize: '1.5rem', marginTop: '1.4rem' }}>Make a change</h2>
      <div className="card cream">
        <select className="field" value={op.type} onChange={(e) => { setOp({ type: e.target.value }); setPreview(null); }}>
          {OPS.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <div className="desk-toolbar" style={{ marginTop: '0.5rem' }}>
          {spec.fields.map((f) => f === 'tier' ? (
            <select key={f} className="field" style={{ maxWidth: '10rem' }} value={op.tier ?? 'crumb'} onChange={(e) => setOp({ ...op, tier: e.target.value })}>{['crumb', 'loaf', 'fish', 'pearl'].map((t) => <option key={t}>{t}</option>)}</select>
          ) : (
            <input key={f} className="field" style={{ maxWidth: f === 'reason' ? '20rem' : '12rem' }} placeholder={f} value={op[f] ?? ''} onChange={(e) => setOp({ ...op, [f]: e.target.value })} />
          ))}
          <button className="btn small ghost" disabled={act.busy} onClick={() => act.run(() => post<Any>('/api/desk/lexicon/preview', { op }).then(setPreview), 'Previewed.')}>Preview the effect</button>
        </div>
        {preview && (
          <div className="check-summary">
            <div>Before: {preview.before ? `${preview.before.key} (${preview.before.tier}, ${preview.before.count} verses: ${preview.before.forms.join(', ')})` : 'not a known word'}</div>
            <div>After: {preview.after ? `${preview.after.key} (${preview.after.tier}, ${preview.after.count} verses: ${preview.after.forms.join(', ')})` : 'not a known word'}</div>
            <div><b>{preview.versesGainDoors}</b> verses gain a door, <b>{preview.versesLoseDoors}</b> lose one.{preview.tierMoves.length ? ` Tier moves: ${preview.tierMoves.map((t: Any) => `${t.word} ${t.from} → ${t.to}`).join(', ')}.` : ''} Takes effect from {preview.effectiveFrom}.</div>
          </div>
        )}
        {admin.role === 'head' && (
          <div className="desk-toolbar" style={{ marginTop: '0.6rem' }}>
            <input className="field" style={{ maxWidth: '24rem' }} placeholder="Note for the record" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn small" disabled={act.busy || !preview} onClick={() => act.run(() => post<Any>('/api/desk/lexicon/save', { op, note }).then((r) => { setPreview(null); setNote(''); return r; }), 'Saved as a new lexicon version.')}>Save</button>
          </div>
        )}
        {admin.role !== 'head' && <p className="small muted" style={{ marginTop: '0.5rem' }}>Only the Head Scribe can save lexicon changes.</p>}
        <Msg tone={act.tone} text={act.msg} />
      </div>
      {data?.versions && (
        <table className="desk-table" style={{ marginTop: '1rem' }}>
          <thead><tr><th>Version</th><th>Effective from</th><th>Saved</th><th>By</th><th>Note</th></tr></thead>
          <tbody>{data.versions.map((v: Any) => <tr key={v.version}><td>{v.version}</td><td>{v.effective_from}</td><td>{when(v.created_at)}</td><td>{v.created_by}</td><td>{v.note}</td></tr>)}</tbody>
        </table>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------- The Law (16.7)

function Law({ admin }: { admin: Admin }) {
  const { data, err, reload } = useLoad(() => get<{ version: number; effectiveFrom: string; rules: Any; specs: RuleSpec[]; history: Any[] }>('/api/desk/rules'), []);
  const [draft, setDraft] = useState<Any>({});
  const [note, setNote] = useState('');
  const act = useAction(() => { reload(); setDraft({}); });
  const groups = useMemo(() => {
    const g = new Map<string, RuleSpec[]>();
    for (const s of data?.specs ?? []) g.set(s.group, [...(g.get(s.group) ?? []), s]);
    return [...g];
  }, [data]);
  if (err) return <Msg tone="bad" text={err} />;
  if (!data) return <p className="muted">Loading…</p>;
  const value = (k: string) => (k in draft ? draft[k] : data.rules[k]);
  const changed = Object.keys(draft).filter((k) => draft[k] !== data.rules[k]);
  return (
    <>
      <div className="desk-head"><h1 className="display">The Law</h1><span className="pill soft">version {data.version} · from {data.effectiveFrom}</span></div>
      <p className="small muted">Every value of Appendix A, with its allowed range. Saved changes form a new rule set that takes effect from the next date that hasn&rsquo;t opened.</p>
      {groups.map(([group, specs]) => (
        <div key={group} className="card cream" style={{ marginTop: '0.8rem' }}>
          <b>{group}</b>
          <table className="desk-table compact">
            <tbody>
              {specs.map((s) => (
                <tr key={s.key} className={s.key in draft && draft[s.key] !== data.rules[s.key] ? 'sel' : ''}>
                  <td><code>{s.key}</code></td><td>{s.sets}</td><td className="muted small">{typeof s.default === 'boolean' ? '' : `${s.min}–${s.max}`}</td>
                  <td>
                    {typeof s.default === 'boolean' ? (
                      <input type="checkbox" checked={!!value(s.key)} disabled={admin.role !== 'head'} onChange={(e) => setDraft({ ...draft, [s.key]: e.target.checked })} />
                    ) : (
                      <input className="field" style={{ width: '6.5rem', padding: '0.25rem 0.5rem' }} type="number" step={s.step ?? 1} min={s.min} max={s.max} value={value(s.key)} disabled={admin.role !== 'head'} onChange={(e) => setDraft({ ...draft, [s.key]: Number(e.target.value) })} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {admin.role === 'head' && (
        <div className="desk-toolbar" style={{ marginTop: '0.8rem' }}>
          <input className="field" style={{ maxWidth: '24rem' }} placeholder="Note for the record" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn" disabled={act.busy || !changed.length} onClick={() => act.run(() => post('/api/desk/rules', { rules: Object.fromEntries(changed.map((k) => [k, draft[k]])), note }), 'Saved as a new rule set.')}>Save {changed.length ? `${changed.length} change${changed.length === 1 ? '' : 's'}` : ''}</button>
        </div>
      )}
      <Msg tone={act.tone} text={act.msg} />
      <table className="desk-table" style={{ marginTop: '1rem' }}>
        <thead><tr><th>Version</th><th>Effective from</th><th>Saved</th><th>By</th><th>Note</th></tr></thead>
        <tbody>{data.history.map((v) => <tr key={v.version}><td>{v.version}</td><td>{v.effective_from}</td><td>{when(v.created_at)}</td><td>{v.created_by}</td><td>{v.note}</td></tr>)}</tbody>
      </table>
    </>
  );
}

// ---------------------------------------------------------------------------------------------- Disputes (16.8)

function Disputes({ admin }: { admin: Admin }) {
  const [status, setStatus] = useState('waiting');
  const { data, err, reload } = useLoad(() => get<{ disputes: Any[] }>(`/api/desk/disputes?${q({ status })}`), [status]);
  const act = useAction(reload);
  void admin;
  return (
    <>
      <div className="desk-head">
        <h1 className="display">Disputes</h1>
        <div className="seg">{['waiting', 'all'].map((s) => <button key={s} aria-pressed={status === s} onClick={() => setStatus(s)}>{s}</button>)}</div>
      </div>
      <p className="small muted">Players&rsquo; wrong-call reports. Overturning removes the strike if the date is still open, and reopens a journey that the rooster ended. Only Scribes see what a player typed.</p>
      <Msg tone="bad" text={err} /><Msg tone={act.tone} text={act.msg} />
      {data?.disputes.length === 0 && <p className="muted">Nothing waiting.</p>}
      {data?.disputes.map((d) => <DisputeCard key={d.id} d={d} act={act} />)}
    </>
  );
}

function DisputeCard({ d, act }: { d: Any; act: ReturnType<typeof useAction> }) {
  const [right, setRight] = useState(d.reference ?? '');
  const [alias, setAlias] = useState(false);
  const [note, setNote] = useState('');
  return (
    <div className="card cream" style={{ marginTop: '0.7rem' }}>
      <div className="eyebrow">#{d.id} · {d.date} · {when(d.created_at)} · <span className={`pill soft`}>{d.status}</span>{!d.dateOpen && ' · date closed'}</div>
      <p style={{ marginTop: '0.4rem' }}>Door <b>{d.door}</b> · reference <b>{d.reference || '—'}</b> · the game said <b>{d.call === 'strike.word' ? `${d.callRef} has no "${d.door}"` : 'no verse matches'}</b></p>
      <p className="scripture" style={{ background: 'var(--white)', padding: '0.5rem 0.7rem', borderRadius: '0.8rem', marginTop: '0.4rem' }}>{d.typed ?? <em className="muted">typed text deleted after 30 days</em>}</p>
      {d.comment && <p className="small muted" style={{ marginTop: '0.3rem' }}>Player: {d.comment}</p>}
      <p className="small muted" style={{ marginTop: '0.3rem' }}>State then: {d.state ? `on ${d.state.current}, home ${d.state.home}, ${d.state.manna} manna, ${d.state.oil} oil, ${d.state.strikes} strikes, ${d.state.status}${d.state.loss ? ` (${d.state.loss})` : ''}` : '—'}</p>
      {d.status === 'waiting' ? (
        <div className="desk-toolbar" style={{ marginTop: '0.6rem', alignItems: 'center' }}>
          <input className="field" style={{ maxWidth: '12rem' }} placeholder="The right verse" value={right} onChange={(e) => setRight(e.target.value)} />
          <label className="small" style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}><input type="checkbox" checked={alias} onChange={(e) => setAlias(e.target.checked)} /> teach the game this wording</label>
          <input className="field" style={{ maxWidth: '16rem' }} placeholder="Note to the player (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn small" disabled={act.busy || !right} onClick={() => act.run(() => post('/api/desk/disputes/resolve', { id: d.id, outcome: 'overturn', rightRef: right, alias, note }), 'Overturned.')}>Overturn</button>
          <button className="btn small ghost" disabled={act.busy} onClick={() => act.run(() => post('/api/desk/disputes/resolve', { id: d.id, outcome: 'uphold', note }), 'Upheld.')}>Uphold</button>
        </div>
      ) : (
        <p className="small" style={{ marginTop: '0.4rem' }}>{d.outcome === 'uphold' ? 'Upheld' : `Overturned (${d.outcome})`}{d.rightRef ? ` · right verse ${d.rightRef}` : ''} by {d.resolved_by} · {when(d.resolved_at)}{d.note ? ` · ${d.note}` : ''}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- Players (16.9)

function Players({ admin }: { admin: Admin }) {
  const [search, setSearch] = useState('');
  const [looked, setLooked] = useState('');
  const { data, err } = useLoad(() => (looked ? get<{ players: Any[] }>(`/api/desk/players?${q({ q: looked })}`) : Promise.resolve({ players: [] })), [looked]);
  const [sel, setSel] = useState<string | null>(null);
  return (
    <>
      <h1 className="display">Players</h1>
      <div className="desk-toolbar">
        <input className="field" style={{ maxWidth: '20rem' }} value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setLooked(search)} placeholder="Search by name or id" />
        <button className="btn small" onClick={() => setLooked(search)}>Search</button>
      </div>
      <Msg tone="bad" text={err} />
      <div className="desk-split">
        <table className="desk-table">
          <thead><tr><th>Name</th><th>Treasure</th><th>Streak</th><th>Journeys</th><th>Since</th></tr></thead>
          <tbody>{data?.players.map((p) => <tr key={p.id} className={sel === p.id ? 'sel' : ''} style={{ cursor: 'pointer' }} onClick={() => setSel(p.id)}><td>{p.name ?? <span className="muted">guest {p.id.slice(0, 8)}</span>}{p.scribe && ' · scribe'}</td><td>{p.treasure}</td><td>{p.streak}</td><td>{p.journeys}</td><td>{when(p.createdAt)}</td></tr>)}</tbody>
        </table>
        {sel && <PlayerDetail key={sel} id={sel} admin={admin} />}
      </div>
    </>
  );
}

function PlayerDetail({ id, admin }: { id: string; admin: Admin }) {
  const { data, err, reload } = useLoad(() => get<Any>(`/api/desk/players/${id}`), [id]);
  const [reason, setReason] = useState('');
  const [streak, setStreak] = useState('');
  const [lastWin, setLastWin] = useState('');
  const [journeyId, setJourneyId] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const act = useAction(reload);
  if (err) return <Msg tone="bad" text={err} />;
  if (!data) return <p className="muted">Loading…</p>;
  const p = data.player;
  const run = (action: string, extra: Any = {}) => act.run(() => post(`/api/desk/players/${id}/action`, { action, reason, ...extra }), 'Done.');
  return (
    <div className="card cream desk-editor">
      <div className="big-ref">{p.name ?? `guest ${p.id.slice(0, 8)}`}</div>
      <p className="small muted">Treasure {p.treasure} · streak {p.streak} (best {p.bestStreak}) · last win {p.lastWin ?? '—'} · rest day {p.restDay === 0 ? 'Sunday' : p.restDay === 6 ? 'Saturday' : 'none'} · since {when(p.createdAt)}</p>
      <label className="field-label" style={{ marginTop: '0.6rem' }}>Reason (required for every action)</label>
      <input className="field" value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="desk-toolbar" style={{ marginTop: '0.5rem', alignItems: 'center' }}>
        <select className="field" style={{ maxWidth: '14rem' }} value={journeyId} onChange={(e) => setJourneyId(e.target.value)}><option value="">Choose a journey…</option>{data.journeys.map((j: Any) => <option key={j.id} value={j.id}>{j.date} {j.kind} {j.status}</option>)}</select>
        <button className="btn small ghost" disabled={act.busy || !reason || !journeyId} onClick={() => run('resetJourney', { journeyId })}>Reset journey</button>
      </div>
      <div className="desk-toolbar" style={{ marginTop: '0.5rem', alignItems: 'center' }}>
        <input className="field" style={{ width: '6rem' }} type="number" placeholder="streak" value={streak} onChange={(e) => setStreak(e.target.value)} />
        <input className="field" style={{ width: '10.5rem' }} type="date" value={lastWin} onChange={(e) => setLastWin(e.target.value)} />
        <button className="btn small ghost" disabled={act.busy || !reason || !streak} onClick={() => run('restoreStreak', { streak: Number(streak), lastWin })}>Restore streak</button>
      </div>
      <div className="desk-toolbar" style={{ marginTop: '0.5rem' }}>
        {p.name && <button className="btn small ghost" disabled={act.busy || !reason} onClick={() => run('removeName')}>Remove display name</button>}
        {admin.role === 'head' && <button className="btn small" style={{ background: 'var(--red)' }} disabled={act.busy || !reason} onClick={() => confirm('Delete this player and everything they typed?') && run('delete')}>Delete account</button>}
      </div>
      <Msg tone={act.tone} text={act.msg} />
      <h3 style={{ marginTop: '0.8rem' }}>Journeys</h3>
      {data.journeys.map((j: Any) => (
        <div key={j.id} className="small" style={{ borderTop: '1px solid var(--line)', padding: '0.4rem 0' }}>
          <button className="link-btn" onClick={() => setOpen(open === j.id ? null : j.id)}><b>{j.date}</b> · {j.kind} · {j.status}{j.loss ? ` (${j.loss})` : ''} · home {j.home} · {j.hops} hops · {j.manna} manna · {j.strikes} strikes</button>
          {open === j.id && (
            <div style={{ marginTop: '0.3rem' }}>
              {j.path.map((s: string, i: number) => <div key={i}>{s}</div>)}
              <details><summary>Every action ({j.events.length})</summary>{j.events.map((e: Any, i: number) => <div key={i} className="muted">{when(e.at)} · {e.type} · {e.code}{e.door ? ` · door ${e.door}` : ''}{e.reference ? ` · ref ${e.reference}` : ''}{e.typed ? ` · "${e.typed}"` : ''}</div>)}</details>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- Announcements (16.10)

function Announcements({ admin }: { admin: Admin }) {
  const { data, err, reload } = useLoad(() => get<{ announcements: Any[] }>('/api/desk/announcements'), []);
  const act = useAction(reload);
  const blank = { title: '', body: '', startsAt: toLocal(Date.now()), endsAt: toLocal(Date.now() + 86_400_000), draft: false };
  const [form, setForm] = useState<Any>(blank);
  void admin;
  return (
    <>
      <h1 className="display">Announcements</h1>
      <p className="small muted">A notice shown to players between a start and an end time, for errata and outages.</p>
      <Msg tone="bad" text={err} /><Msg tone={act.tone} text={act.msg} />
      <div className="card cream">
        <input className="field" placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <textarea className="field" style={{ fontFamily: 'var(--font-ui)', fontSize: '1rem', marginTop: '0.5rem' }} placeholder="Body" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        <div className="desk-toolbar" style={{ marginTop: '0.5rem', alignItems: 'center' }}>
          <input className="field" type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} style={{ maxWidth: '14rem' }} />
          <span className="small muted">to</span>
          <input className="field" type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} style={{ maxWidth: '14rem' }} />
          <label className="small" style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}><input type="checkbox" checked={form.draft} onChange={(e) => setForm({ ...form, draft: e.target.checked })} /> draft</label>
          <button className="btn small" disabled={act.busy} onClick={() => act.run(() => post('/api/desk/announcements', { ...form, startsAt: Date.parse(form.startsAt), endsAt: Date.parse(form.endsAt) }).then(() => setForm(blank)), form.id ? 'Updated.' : 'Posted.')}>{form.id ? 'Update' : 'Post'}</button>
          {form.id && <button className="btn small ghost" onClick={() => setForm(blank)}>New</button>}
        </div>
      </div>
      <table className="desk-table">
        <thead><tr><th>Title</th><th>From</th><th>To</th><th>State</th><th></th></tr></thead>
        <tbody>{data?.announcements.map((a) => <tr key={a.id}><td><b>{a.title}</b><div className="small muted">{a.body}</div></td><td>{when(a.starts_at)}</td><td>{when(a.ends_at)}</td><td>{a.draft ? 'draft' : a.ends_at < Date.now() ? 'ended' : 'live'}</td><td className="row-actions"><button onClick={() => setForm({ id: a.id, title: a.title, body: a.body, startsAt: toLocal(a.starts_at), endsAt: toLocal(a.ends_at), draft: !!a.draft })}>edit</button><button onClick={() => act.run(() => post('/api/desk/announcements/delete', { id: a.id }), 'Deleted.')}>✕</button></td></tr>)}</tbody>
      </table>
    </>
  );
}

function toLocal(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------------------------------------------------------------------------------------------- Audit log (16.11)

function Audit({ admin }: { admin: Admin }) {
  const [by, setBy] = useState('');
  const [action, setAction] = useState('');
  const { data, err } = useLoad(() => get<{ entries: Any[] }>(`/api/desk/audit?${q({ admin: by, action })}`), [by, action]);
  void admin;
  return (
    <>
      <div className="desk-head"><h1 className="display">Audit log</h1><a className="btn small ghost" href="/api/desk/audit.csv">Export CSV</a></div>
      <div className="desk-toolbar">
        <input className="field" style={{ maxWidth: '12rem' }} placeholder="Scribe" value={by} onChange={(e) => setBy(e.target.value)} />
        <input className="field" style={{ maxWidth: '12rem' }} placeholder="Action, e.g. calendar." value={action} onChange={(e) => setAction(e.target.value)} />
      </div>
      <Msg tone="bad" text={err} />
      <table className="desk-table">
        <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th><th>Before</th><th>After</th><th>Reason</th></tr></thead>
        <tbody>{data?.entries.map((e) => <tr key={e.id}><td>{when(e.at)}</td><td>{e.admin} ({e.role})</td><td>{e.action}</td><td>{e.target}</td><td className="small muted">{e.before}</td><td className="small">{e.after}</td><td className="small">{e.reason}</td></tr>)}</tbody>
      </table>
    </>
  );
}

// ---------------------------------------------------------------------------------------------- Settings (16.12)

function Settings({ admin }: { admin: Admin }) {
  const { data, err, reload } = useLoad(() => get<Any>('/api/desk/settings'), []);
  const act = useAction(reload);
  const [form, setForm] = useState<Any | null>(null);
  const [newAdmin, setNewAdmin] = useState({ username: '', password: '', role: 'scribe' });
  useEffect(() => {
    if (data && !form) setForm({ display: data.display, defaultWording: data.defaultWording, ai: data.ai, launchDate: data.launchDate });
  }, [data, form]);
  if (err) return <Msg tone="bad" text={err} />;
  if (!data || !form) return <p className="muted">Loading…</p>;
  const head = admin.role === 'head';
  return (
    <>
      <h1 className="display">Settings</h1>
      <Msg tone={act.tone} text={act.msg} />
      <div className="card cream">
        <b>Wordings</b>
        <p className="small muted">The game holds the KJV and the WEB, and both are always in play. Choose which players can display, and the default.</p>
        <div className="desk-toolbar" style={{ alignItems: 'center' }}>
          {['kjv', 'web'].map((w) => <label key={w} className="small" style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}><input type="checkbox" disabled={!head} checked={form.display.includes(w)} onChange={(e) => setForm({ ...form, display: e.target.checked ? [...form.display, w] : form.display.filter((x: string) => x !== w) })} /> {w.toUpperCase()}</label>)}
          <span className="small">default</span>
          <select className="field" style={{ maxWidth: '8rem' }} disabled={!head} value={form.defaultWording} onChange={(e) => setForm({ ...form, defaultWording: e.target.value })}><option value="kjv">KJV</option><option value="web">WEB</option></select>
        </div>
      </div>
      <div className="card cream" style={{ marginTop: '0.8rem' }}>
        <b>The AI check</b> <span className={`pill soft`}>{data.aiReady ? 'ready' : 'no key on the server'}</span>
        <p className="small muted">Runs on the server only, with keys that never reach the client. The timeout and the daily limit per player are in The Law.</p>
        <div className="desk-toolbar" style={{ alignItems: 'center' }}>
          <select className="field" style={{ maxWidth: '10rem' }} disabled={!head} value={form.ai.provider} onChange={(e) => setForm({ ...form, ai: { ...form.ai, provider: e.target.value } })}><option value="anthropic">Anthropic</option><option value="off">Off</option></select>
          <input className="field" style={{ maxWidth: '14rem' }} disabled={!head} value={form.ai.model} onChange={(e) => setForm({ ...form, ai: { ...form.ai, model: e.target.value } })} placeholder="model" />
          <span className="small">monthly alert at</span>
          <input className="field" style={{ width: '7rem' }} type="number" disabled={!head} value={form.ai.monthlyAlert} onChange={(e) => setForm({ ...form, ai: { ...form.ai, monthlyAlert: Number(e.target.value) } })} />
          <span className="small">checks</span>
        </div>
      </div>
      <div className="card cream" style={{ marginTop: '0.8rem' }}>
        <b>Launch date</b> <span className="pill soft">{data.launched ? 'launched: fixed' : 'not launched yet'}</span>
        <p className="small muted">Puzzle #1 is the launch date. It can&rsquo;t change after launch, because puzzle numbers are permanent.</p>
        <input className="field" style={{ maxWidth: '12rem' }} type="date" disabled={!head || data.launched} value={form.launchDate} onChange={(e) => setForm({ ...form, launchDate: e.target.value })} />
      </div>
      {head && <div className="desk-toolbar" style={{ marginTop: '0.8rem' }}><button className="btn" disabled={act.busy} onClick={() => act.run(() => post('/api/desk/settings', form), 'Settings saved.')}>Save settings</button></div>}

      <h2 className="display" style={{ fontSize: '1.5rem', marginTop: '1.4rem' }}>Roles</h2>
      <table className="desk-table">
        <thead><tr><th>Username</th><th>Role</th><th>2FA</th><th>Since</th><th></th></tr></thead>
        <tbody>
          {data.admins.map((a: Any) => (
            <tr key={a.id} className={a.disabled ? 'muted' : ''}>
              <td>{a.username}{a.disabled ? ' (disabled)' : ''}</td>
              <td>{head ? <select className="field" style={{ padding: '0.25rem 0.5rem', maxWidth: '8rem' }} value={a.role} onChange={(e) => act.run(() => post(`/api/desk/admins/${a.id}`, { role: e.target.value }), 'Role changed.')}><option>head</option><option>scribe</option><option>observer</option></select> : a.role}</td>
              <td>{a.totp_confirmed ? 'set up' : 'pending'}</td><td>{when(a.created_at)}</td>
              <td className="row-actions">{head && a.id !== admin.id && <><button onClick={() => act.run(() => post(`/api/desk/admins/${a.id}`, { disabled: !a.disabled }), a.disabled ? 'Enabled.' : 'Disabled.')}>{a.disabled ? 'enable' : 'disable'}</button><button onClick={() => act.run(() => post(`/api/desk/admins/${a.id}`, { resetTotp: true }), '2FA reset: they will scan a new code at their next sign-in.')}>reset 2FA</button></>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {head && (
        <div className="desk-toolbar" style={{ marginTop: '0.6rem', alignItems: 'center' }}>
          <input className="field" style={{ maxWidth: '12rem' }} placeholder="username" value={newAdmin.username} onChange={(e) => setNewAdmin({ ...newAdmin, username: e.target.value })} />
          <input className="field" style={{ maxWidth: '12rem' }} type="password" placeholder="password (10+)" value={newAdmin.password} onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })} />
          <select className="field" style={{ maxWidth: '8rem' }} value={newAdmin.role} onChange={(e) => setNewAdmin({ ...newAdmin, role: e.target.value })}><option>head</option><option>scribe</option><option>observer</option></select>
          <button className="btn small" disabled={act.busy} onClick={() => act.run(() => post('/api/desk/admins', newAdmin).then(() => setNewAdmin({ username: '', password: '', role: 'scribe' })), 'Scribe added.')}>Add a Scribe</button>
        </div>
      )}
      <div className="card cream" style={{ marginTop: '1rem' }}>
        <b>Your own play</b>
        <p className="small muted">Scribes know the verses in advance, so their daily journeys are marked and left out of the public statistics (rule 17.9). Link the player this browser plays as.</p>
        <button className="btn small ghost" onClick={() => act.run(() => post('/api/desk/link-player'), 'Linked: your journeys are now marked as a Scribe’s.')}>Link my player</button>
      </div>
    </>
  );
}
