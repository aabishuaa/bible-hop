// The questions the game asks during a journey (rules 14.3 and 14.4), and the status sheet.
import { useEffect, useState } from 'react';
import { BOOKS } from '../../../../shared/books.ts';
import { GRACE_CITE } from '../../../../shared/messages.ts';
import type { ConcordanceView, JourneyView, PendingView } from '../../../../shared/types.ts';
import { api } from '../../api.ts';
import { Modal, plural, press } from '../../ui/base.tsx';
import { Icon, TierBadge } from '../../ui/icons.tsx';
import { homeReadiness } from './parts.tsx';

type Confirm = Extract<PendingView, { type: 'confirm' }>;
type Choose = Extract<PendingView, { type: 'choose' }>;
type Lamp = Extract<PendingView, { type: 'lamp' }>;
type Grace = Extract<PendingView, { type: 'grace' }>;

/** Rule 14.3: one proposed verse (Hop there, That's not it), or up to 3 rivals (None of these). */
export function ConfirmModal({ pending, busy, onPick }: { pending: Confirm | Choose | Lamp | null; busy: boolean; onPick: (verse: number | null) => void }) {
  const p = pending;
  return (
    <Modal open={!!p} onClose={() => onPick(null)} label={p?.message.text ?? 'Confirm'}>
      {p?.type === 'confirm' && (
        <>
          <p className="eyebrow">{p.how === 'ai' ? 'A best guess' : 'Just checking'}</p>
          <h2 style={{ marginTop: '0.4rem' }}>{p.how === 'ai' ? 'Did you mean this verse?' : 'Is this the verse you meant?'}</h2>
          {p.how === 'ai' && <p className="lead small">Your wording wasn&rsquo;t one the game holds, so the verse check read it for you.</p>}
          <div className="verse-option" style={{ cursor: 'default' }}>
            <div className="ref">{p.verse.ref}</div>
            <div className="text">{p.verse.text}</div>
          </div>
          <div className="actions two">
            <button className="btn ghost" disabled={busy} onClick={() => onPick(null)}>That&rsquo;s not it</button>
            <button className="btn tier" disabled={busy} data-autofocus onClick={() => onPick(p.verse.id)}>
              Hop there <span className="chev"><Icon name="hop" size="1rem" strokeWidth={2.4} /></span>
            </button>
          </div>
        </>
      )}
      {p?.type === 'choose' && (
        <>
          <p className="eyebrow">More than one fits</p>
          <h2 style={{ marginTop: '0.4rem' }}>Which one did you mean?</h2>
          {p.options.map((o) => (
            <button key={o.id} className="verse-option" disabled={busy} onClick={() => onPick(o.id)}>
              <div className="ref">{o.ref}</div>
              <div className="text">{o.text}</div>
            </button>
          ))}
          <div className="actions">
            <button className="btn ghost" disabled={busy} onClick={() => onPick(null)}>None of these</button>
          </div>
        </>
      )}
      {p?.type === 'lamp' && (
        <>
          <div className="grace-scene">
            <div className="emblem"><Icon name="lamp" /></div>
          </div>
          <h2 style={{ textAlign: 'center' }}>Your lamp will <em>go out</em></h2>
          <p className="lead" style={{ textAlign: 'center' }}>
            You have been to {p.verse.ref} already. Going back burns {plural(p.burn, 'drop')}, and you have {p.have}.
          </p>
          <div className="actions two">
            <button className="btn ghost" disabled={busy} data-autofocus onClick={() => onPick(null)}>Stay here</button>
            <button className="btn" disabled={busy} onClick={() => onPick(p.verse.id)}>Hop anyway</button>
          </div>
        </>
      )}
    </Modal>
  );
}

const LOSS_ICON: Record<string, string> = { lamp: 'lamp', door: 'gate', wilderness: 'hop', fish: 'fish', famine: 'crumb', rooster: 'rooster' };
export const lossIcon = (reason: string) => LOSS_ICON[reason] ?? 'moon';

/** Rule 14.4: the loss, its line, what Grace will do, and the choice. Play is frozen until the player chooses. */
export function GraceModal({ pending, busy, onDecide }: { pending: Grace | null; busy: boolean; onDecide: (use: boolean) => void }) {
  const p = pending;
  return (
    <Modal open={!!p} label={p ? `${p.loss.name}. Grace is offered.` : 'Grace'} dismissable={false} center>
      {p && (
        <div className="grace-scene">
          <div className="emblem"><Icon name={lossIcon(p.loss.reason)} /></div>
          <h2>{p.loss.name}</h2>
          <p className="lead">{p.loss.line}</p>
          <p className="cite">{p.loss.cite}</p>
          <div className="emblem dove" style={{ marginTop: '1.2rem', width: '3.8rem', height: '3.8rem', fontSize: '2rem' }}><Icon name="dove" /></div>
          <div className="grace-box">
            <span>
              <b>You have one Grace today.</b> {p.graceText} <span className="cite" style={{ fontSize: '0.92rem' }}>{GRACE_CITE}</span>
            </span>
          </div>
          <div className="actions two">
            <button className="btn ghost" disabled={busy} onClick={() => onDecide(false)}>End the day</button>
            <button className="btn gold" disabled={busy} data-autofocus onClick={() => onDecide(true)}>
              <Icon name="dove" size="1.1rem" strokeWidth={2} /> Use Grace
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Rule 9.8: the game asks first, and shows the exact cost. */
export function LookBackModal({ open, j, busy, onClose, onConfirm }: { open: boolean; j: JourneyView; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  const lb = j.lookBack;
  return (
    <Modal open={open} onClose={onClose} label="Look back">
      <p className="eyebrow">Undo your last hop</p>
      <h2 style={{ marginTop: '0.4rem' }}>Look back to <em>{lb.toRef}</em>?</h2>
      <p className="lead">
        You give up the {lb.earned} manna that hop earned, plus {lb.salt} for the salt. That is <b>{lb.cost} manna</b> in all.
        Oil already burned stays burned.
      </p>
      {lb.famine && (
        <div className="msg-line bad" role="alert">
          <Icon name="crumb" />
          <span>Your manna is already below zero, so this brings <b>Famine</b> and ends the day unless Grace steps in.</span>
        </div>
      )}
      {!lb.famine && j.manna - lb.cost < 0 && (
        <div className="msg-line warn">
          <Icon name="salt" />
          <span>This takes your manna below zero. You can carry on in debt, but looking back again while in debt ends the day.</span>
        </div>
      )}
      <div className="actions two">
        <button className="btn ghost" disabled={busy} data-autofocus onClick={onClose}>Stay here</button>
        <button className="btn" disabled={busy} onClick={onConfirm}>
          <Icon name="lookback" size="1.1rem" strokeWidth={2.2} /> Look back
        </button>
      </div>
    </Modal>
  );
}

/** Every meter, in plain words (rule 14.2). */
export function StatusModal({ open, j, onClose, onMode }: { open: boolean; j: JourneyView; onClose: () => void; onMode?: (mode: 'standard' | 'berean') => void }) {
  const ready = homeReadiness(j);
  return (
    <Modal open={open} onClose={onClose} label="Journey status">
      <p className="eyebrow">{j.kind === 'practice' ? 'Practice journey' : j.kind === 'guide' ? 'Guided journey' : `Bible Hopping #${j.puzzleNo}`}</p>
      <h2 style={{ marginTop: '0.4rem' }}>Where you <em>stand</em></h2>
      <div className="checklist" style={{ marginTop: '1rem' }}>
        <div className={`item ${ready.verses === 0 ? 'done' : ''}`}>
          <span className="box"><Icon name="strike" size="0.8rem" style={{ display: 'none' }} /><CheckMark /></span>
          <span>Visit {j.cord.need} different verses <b className="tabular">({j.cord.have}/{j.cord.need})</b></span>
        </div>
        <div className={`item ${ready.manna === 0 ? 'done' : ''}`}>
          <span className="box"><CheckMark /></span>
          <span>Gather {j.gate} manna <b className="tabular">({j.manna}/{j.gate})</b></span>
        </div>
        <div className="item">
          <span className="box" style={{ background: 'rgba(199,146,38,0.25)', color: 'var(--gold)' }}><Icon name="home" size="0.9rem" strokeWidth={2.4} /></span>
          <span>Then come home through a word your home verse shares. Not a crumb, and not the word you left by.</span>
        </div>
      </div>
      <div style={{ display: 'grid', gap: '0.55rem', marginTop: '1.2rem' }}>
        <StatusRow icon="manna" title={`${j.manna} manna`} text={j.manna < 0 ? 'You are in debt. Looking back again while in debt ends the day.' : 'Your points. Rarer words earn more, and a correct reference can double them.'} />
        <StatusRow icon="lamp" title={`${plural(j.oil, 'drop')} of oil`} text="Each hop burns 1 drop; returning to a verse burns 3. A verse that mentions oil refills 3. At zero the lamp goes out." />
        <StatusRow icon="hop" title={`${j.hops} of ${j.hopLimit} hops`} text={`You must be home within ${j.hopLimit} hops. Hops you undo still count.`} />
        <StatusRow icon="rooster" title={`${plural(j.strikes, 'strike')} in a row`} text={`Typing a verse that doesn’t hold your word is a strike. ${j.strikesMax} in a row and the rooster crows. A good hop clears them.`} />
        <StatusRow icon="dove" title={j.graces > 0 ? 'Grace is ready' : 'Grace is spent'} text="Once a day, Grace can rescue you: it relights the lamp, clears strikes, or brings you back from a dead end." />
        {j.deadline !== null && <StatusRow icon="clock" title={`The door shuts at midnight, ${j.tzLabel}`} text="Manna you haven&rsquo;t brought home by then is lost." />}
      </div>
      {j.canChangeMode && onMode && (
        <div className="set-row" style={{ marginTop: '0.8rem', borderTop: '1.5px solid var(--line)' }}>
          <div className="txt">
            <b>Berean Mode</b>
            <span>Harder: each word carries you only once today, and every hop needs its book and chapter. Choose before your first hop.</span>
          </div>
          <label className="switch">
            <input type="checkbox" checked={j.mode === 'berean'} onChange={(e) => onMode(e.target.checked ? 'berean' : 'standard')} aria-label="Berean Mode" />
            <span />
          </label>
        </div>
      )}
      <div className="actions">
        <button className="btn" data-autofocus onClick={onClose}>Back to the verse</button>
      </div>
    </Modal>
  );
}

function CheckMark() {
  return (
    <svg width="0.9em" height="0.9em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function StatusRow({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
      <span className="tier-badge" style={{ width: '2.2rem', height: '2.2rem', background: 'radial-gradient(circle at 34% 28%, #f4d27e, #c8921f 62%, #7d5306)', color: '#3a2004' }}><Icon name={icon} size="1.2rem" /></span>
      <span>
        <b style={{ display: 'block' }}>{title}</b>
        <span className="small muted" dangerouslySetInnerHTML={{ __html: text }} />
      </span>
    </div>
  );
}

/** Rule 10.5: report a wrong call. Play carries on while the report waits. */
export function ReportModal({ open, onClose, onSend }: { open: boolean; onClose: () => void; onSend: (comment: string) => void }) {
  const [comment, setComment] = useState('');
  return (
    <Modal open={open} onClose={onClose} label="Report a wrong call">
      <p className="eyebrow">Think the game got it wrong?</p>
      <h2 style={{ marginTop: '0.4rem' }}>Report this <em>call</em></h2>
      <p className="lead">A Scribe will look at what you typed. If the call was wrong, the strike is taken back while today is still open. You can keep playing in the meantime.</p>
      <label className="field-label" htmlFor="report-comment" style={{ marginTop: '1rem' }}>Anything to add? (optional)</label>
      <textarea id="report-comment" className="field" style={{ fontFamily: 'var(--font-ui)', fontSize: '1rem' }} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} />
      <div className="actions two">
        <button className="btn ghost" onClick={onClose}>Never mind</button>
        <button className="btn" onClick={() => onSend(comment)}>Send report</button>
      </div>
    </Modal>
  );
}

/** Sunday School's one extra help (rule 18.3): up to 50 verses that hold the chosen word, by book. */
export function ConcordanceModal({ open, journeyId, door, onClose, onUse }: { open: boolean; journeyId: string; door: string; onClose: () => void; onUse: (text: string, ref: string) => void }) {
  const [book, setBook] = useState<number | undefined>(undefined);
  const [data, setData] = useState<ConcordanceView | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!open || !door) return;
    setData(null);
    setErr('');
    api.concordance(journeyId, door, book).then(setData).catch((e) => setErr(e.message));
  }, [open, journeyId, door, book]);
  return (
    <Modal open={open} onClose={onClose} label="Concordance">
      <p className="eyebrow">Sunday School only</p>
      <h2 style={{ marginTop: '0.4rem' }}>Verses with <em>&ldquo;{door}&rdquo;</em></h2>
      <p className="lead small">{data ? `${plural(data.total, 'verse')} hold this word. Here are up to 50.` : 'Looking…'} Tap one to practise typing it.</p>
      <select className="field" style={{ marginTop: '0.8rem' }} aria-label="Filter by book" value={book ?? ''} onChange={(e) => setBook(e.target.value === '' ? undefined : Number(e.target.value))}>
        <option value="">Every book</option>
        {BOOKS.map((b, i) => <option key={b.name} value={i}>{b.name}</option>)}
      </select>
      {err && <div className="msg-line warn" style={{ marginTop: '0.6rem' }}>{err}</div>}
      {data?.verses.map((v) => (
        <button key={v.id} className="verse-option" onClick={() => { press(); onUse(v.text, v.ref); }}>
          <div className="ref">{v.ref}</div>
          <div className="text">{v.text}</div>
        </button>
      ))}
      {data && data.verses.length === 0 && <p className="lead">No verses here. Try another book.</p>}
      <div className="actions"><button className="btn ghost" onClick={onClose}>Close</button></div>
    </Modal>
  );
}

export { TierBadge };
