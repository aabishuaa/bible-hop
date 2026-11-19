// Badge medallions: each badge has its own metal and emblem; ones not yet earned are dimmed.
import type { Achievement } from '../../../shared/types.ts';
import { Icon } from './icons.tsx';

const METAL: Record<string, string> = { prodigal: 'gold', bread: 'loaf', fishers: 'fish', gold: 'nugget', law: 'bronze', covenant: 'crimson' };

export function Medal({ a, size = 64, onClick }: { a: Achievement; size?: number; onClick?: () => void }) {
  const earned = !!a.earnedOn;
  return (
    <button className={`medal-btn ${earned ? 'earned' : 'locked'}`} onClick={onClick} title={`${a.name}: ${a.how}`} aria-label={`${a.name}. ${a.how}${earned ? ` Earned ${a.earnedOn}.` : ' Not earned yet.'}`}>
      <span className={`medal metal-${METAL[a.id] ?? 'gold'}`} style={{ width: size, height: size }}>
        <span className="medal-inner"><Icon name={a.icon ?? 'sparkle'} size={size * 0.42} strokeWidth={1.8} /></span>
      </span>
      <span className="medal-name">{a.name}</span>
    </button>
  );
}

export function BadgeShelf({ badges, onPick }: { badges: Achievement[]; onPick?: (a: Achievement) => void }) {
  const got = badges.filter((b) => b.earnedOn).length;
  return (
    <div className="badge-shelf">
      <div className="badge-shelf-head"><span className="eyebrow">Badges</span><span className="pill soft">{got} of {badges.length}</span></div>
      <div className="badge-shelf-row">
        {badges.map((b) => <Medal key={b.id} a={b} size={58} onClick={() => onPick?.(b)} />)}
      </div>
    </div>
  );
}
