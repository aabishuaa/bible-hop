// Badge medallions. Each badge has its own metal and emblem, can be earned on many days,
// and opens a card in its own colours that says how to earn it.
import type { Achievement } from '../../../shared/types.ts';
import { Modal, niceDate } from './base.tsx';
import { Icon } from './icons.tsx';

export const METAL: Record<string, string> = { prodigal: 'gold', bread: 'loaf', fishers: 'fish', gold: 'nugget', law: 'bronze', covenant: 'crimson' };
const metalOf = (a: Achievement) => METAL[a.id] ?? 'gold';

export function Medal({ a, size = 64, onClick, showCount = true }: { a: Achievement; size?: number; onClick?: () => void; showCount?: boolean }) {
  const earned = (a.count ?? (a.earnedOn ? 1 : 0)) > 0;
  return (
    <button className={`medal-btn ${earned ? 'earned' : 'locked'}`} onClick={onClick} aria-label={`${a.name}. ${earned ? `Earned ${a.count ?? 1} ${a.count === 1 ? 'time' : 'times'}.` : 'Not earned yet.'} Show how to earn it.`}>
      <span className={`medal metal-${metalOf(a)}`} style={{ width: size, height: size }}>
        <span className="medal-inner"><Icon name={a.icon ?? 'sparkle'} size={size * 0.42} strokeWidth={1.8} /></span>
        {showCount && earned && (a.count ?? 1) > 1 && <span className="medal-count">&times;{a.count}</span>}
      </span>
      <span className="medal-name">{a.name}</span>
    </button>
  );
}

/** The card a badge opens: its medallion, how to earn it, and the player's record with it. */
export function BadgeCard({ a, onClose }: { a: Achievement | null; onClose: () => void }) {
  const n = a?.count ?? (a?.earnedOn ? 1 : 0);
  return (
    <Modal open={!!a} onClose={onClose} label={a ? `${a.name} badge` : 'Badge'} center className={a ? `badge-card metal-${metalOf(a)}` : ''}>
      {a && (
        <div className="bc">
          <div className="bc-shine" aria-hidden="true" />
          <span className={`medal metal-${metalOf(a)} bc-medal ${n ? '' : 'dim'}`}>
            <span className="medal-inner"><Icon name={a.icon ?? 'sparkle'} size={54} strokeWidth={1.7} /></span>
          </span>
          <p className="bc-eyebrow">{n ? 'Badge earned' : 'Badge to earn'}</p>
          <h2 className="bc-name">{a.name}</h2>
          {a.cite && <p className="bc-cite">{a.cite}</p>}
          <div className="bc-how">
            <span className="bc-how-label">How to earn it</span>
            <p>{a.how}</p>
            <p className="bc-again">You can earn it again on any day you do it.</p>
          </div>
          <div className="bc-stats">
            <div><b className="tabular">{n}</b><span>{n === 1 ? 'time' : 'times'}</span></div>
            <div><b>{a.firstOn ? niceDate(a.firstOn, { month: 'short', day: 'numeric' }) : '—'}</b><span>first</span></div>
            <div><b>{a.earnedOn ? niceDate(a.earnedOn, { month: 'short', day: 'numeric' }) : '—'}</b><span>latest</span></div>
          </div>
          <button className="btn bc-close" data-autofocus onClick={onClose}>Close</button>
        </div>
      )}
    </Modal>
  );
}
