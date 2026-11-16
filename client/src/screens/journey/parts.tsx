// The pieces of the journey screen (rule 14.2): the verse with its doors, the home verse,
// the meters, the chain and the little map of the Bible.
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Tier } from '../../../../shared/rules.ts';
import { TIER_NAMES } from '../../../../shared/rules.ts';
import type { DoorView, JourneyView, VerseView, Wording } from '../../../../shared/types.ts';
import { TIER_COLOR } from '../../theme.ts';
import { plural, timeLeft, useCountTo } from '../../ui/base.tsx';
import { Icon, TierBadge } from '../../ui/icons.tsx';

/** Straight apostrophes are set as curled ones; the words themselves are untouched. */
const pretty = (s: string) => s.replace(/'/g, '’');

export function doorLabel(word: string, d: DoorView): string {
  if (d.state === 'wall') return `${word}, a wall: found in this verse only, so it cannot be chosen`;
  if (d.state === 'used') return `${word}, a door you have already used in this verse`;
  if (d.state === 'spent') return `${word}, already used today`;
  return `${word}, ${TIER_NAMES[d.tier]}, ${d.value} manna${d.inHome ? ', also in your home verse' : ''}`;
}

export interface WordsProps {
  verse: VerseView;
  wording: Wording;
  chosen: string | null;
  /** The door the player came in by, marked on the page. */
  entry?: string;
  /** A word the guide wants tapped. */
  spot?: string;
  shake?: string | null;
  onTap?: (door: DoorView, word: string, el: HTMLElement) => void;
}

/** A verse with every word a door (rules 3.2 to 3.5). Arrow keys move between words. */
export function VerseWords({ verse, wording, chosen, entry, spot, shake, onTap }: WordsProps) {
  const tokens = verse.wordings[wording] ?? verse.wordings.kjv ?? verse.wordings.web ?? [];
  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const all = [...(e.currentTarget.parentElement?.querySelectorAll<HTMLElement>('button.w') ?? [])];
    const i = all.indexOf(e.currentTarget as HTMLElement);
    const next = all[i + (e.key === 'ArrowRight' ? 1 : -1)];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  };
  let i = 0;
  return (
    <>
      {tokens.map((t, k) => {
        if (t.d === undefined) return <span key={k} style={{ ['--i' as string]: i }}>{pretty(t.s)}</span>;
        const d = verse.doors[t.d];
        const isChosen = chosen === d.key;
        const cls = `w tier-${d.tier} ${d.state}${isChosen ? ' chosen' : ''}${entry === d.key ? ' entry' : ''}${spot && spot === d.key && !isChosen ? ' spot' : ''}${shake === d.key ? ' shake' : ''}`;
        return (
          <button
            key={k}
            type="button"
            className={cls}
            style={{ ['--i' as string]: i++ }}
            aria-label={doorLabel(t.s, d)}
            aria-pressed={d.state === 'open' ? isChosen : undefined}
            aria-disabled={d.state !== 'open' || undefined}
            onClick={(e) => onTap?.(d, t.s, e.currentTarget)}
            onKeyDown={onKey}
          >
            {pretty(t.s)}
            {d.inHome && d.state === 'open' && !isChosen && <Icon name="home" className="hm" strokeWidth={2.6} />}
          </button>
        );
      })}
    </>
  );
}

/** The home verse, always in sight, with the doors already used there struck through. */
export function HomeWords({ home, wording, match }: { home: VerseView; wording: Wording; match: string | null }) {
  const tokens = home.wordings[wording] ?? home.wordings.kjv ?? home.wordings.web ?? [];
  return (
    <>
      {tokens.map((t, k) => {
        if (t.d === undefined) return <span key={k}>{pretty(t.s)}</span>;
        const d = home.doors[t.d];
        return (
          <span key={k} className={`hw ${d.state === 'used' ? 'used' : ''} ${match && match === d.key && d.state !== 'used' ? 'match' : ''}`}>
            {pretty(t.s)}
          </span>
        );
      })}
    </>
  );
}

export function useNow(everyMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(id);
  }, [everyMs]);
  return now;
}

/** Whether the player may come home now, and what is still missing (rules 8.2 and 8.3, in plain words). */
export function homeReadiness(j: JourneyView): { ready: boolean; verses: number; manna: number } {
  const verses = Math.max(0, j.cord.need - j.cord.have);
  const manna = Math.max(0, j.gate - j.manna);
  return { ready: verses === 0 && manna === 0, verses, manna };
}

export function Hud({ j, clockSkew, onOpen }: { j: JourneyView; clockSkew: number; onOpen: () => void }) {
  const manna = useCountTo(j.manna);
  const now = useNow(1000) + clockSkew;
  const prevOil = useRef(j.oil);
  const [burning, setBurning] = useState<number[]>([]);
  const [filling, setFilling] = useState<number[]>([]);
  useEffect(() => {
    const before = prevOil.current, after = j.oil;
    prevOil.current = after;
    if (after < before) {
      setBurning(Array.from({ length: before - after }, (_, i) => after + i));
      const t = window.setTimeout(() => setBurning([]), 520);
      return () => window.clearTimeout(t);
    }
    if (after > before) {
      setFilling(Array.from({ length: after - before }, (_, i) => before + i));
      const t = window.setTimeout(() => setFilling([]), 520);
      return () => window.clearTimeout(t);
    }
  }, [j.oil]);
  const left = j.deadline === null ? null : j.deadline - now;
  const late = left !== null && left < 30 * 60000;
  const ready = homeReadiness(j);
  return (
    <>
      <div className="hud">
        <button className={`hud-manna ${j.manna < 0 ? 'debt' : ''}`} onClick={onOpen} aria-label={`${j.manna} manna${j.manna < 0 ? ', in debt' : ''}. Open the journey status.`}>
          <TierBadge tier="home" size={32} className="manna-badge" />
          <span>
            <span className="tabular">{manna}</span>
            <small>{j.manna < 0 ? 'in debt' : 'manna'}</small>
          </span>
        </button>
        <button className={`hud-oil ${j.oil <= 2 ? 'low' : ''}`} onClick={onOpen} aria-label={`Lamp oil: ${plural(j.oil, 'drop')} of ${j.oilCap}. Open the journey status.`}>
          <Icon name="lamp" className="lamp" size="1.6rem" />
          <span className="oil-dots" style={{ gridTemplateColumns: `repeat(${j.oilCap}, 1fr)` }} aria-hidden="true">
            {Array.from({ length: j.oilCap }, (_, i) => (
              <i key={i} className={`${i >= j.oil ? 'out' : ''} ${burning.includes(i) ? 'burning' : ''} ${filling.includes(i) ? 'filling' : ''}`} />
            ))}
          </span>
        </button>
        {left !== null && (
          <span className={`hud-time ${late ? 'late' : ''}`} role="timer" aria-label={`${timeLeft(left)} until the door shuts at midnight, ${j.tzLabel}`}>
            <Icon name="clock" size="1rem" />
            {timeLeft(left)}
          </span>
        )}
      </div>
      <div className="hud-row2">
        {ready.ready ? (
          <button className="chip ready" onClick={onOpen}>
            <Icon name="home" size="0.95rem" strokeWidth={2.2} /> You can head home
          </button>
        ) : (
          <button className="chip" onClick={onOpen} aria-label={`${j.cord.have} of ${j.cord.need} verses visited before you can head home`}>
            <Icon name="cord" size="1rem" strokeWidth={2} />
            <span className="pips" aria-hidden="true">
              {Array.from({ length: j.cord.need }, (_, i) => <i key={i} className={i < j.cord.have ? 'on' : ''} />)}
            </span>
            verses
          </button>
        )}
        <button className="chip" onClick={onOpen} aria-label={`${j.hops} of ${j.hopLimit} hops taken`}>
          <Icon name="hop" size="0.95rem" strokeWidth={2.2} /> {j.hops}/{j.hopLimit}
        </button>
        <button className="chip strikes" onClick={onOpen} aria-label={`${plural(j.strikes, 'strike')} in a row, of ${j.strikesMax}`}>
          <Icon name="rooster" size="1rem" strokeWidth={1.9} />
          <span className="pips" aria-hidden="true">
            {Array.from({ length: j.strikesMax }, (_, i) => <i key={i} className={i < j.strikes ? 'on' : ''} />)}
          </span>
        </button>
        <button className={`chip ${j.graces > 0 ? '' : 'spent'}`} onClick={onOpen} aria-label={j.graces > 0 ? `${plural(j.graces, 'Grace')} left` : 'Grace already used'}>
          <Icon name="dove" size="1rem" strokeWidth={1.9} /> {j.graces > 0 ? 'Grace' : 'Grace used'}
        </button>
        {j.mode === 'berean' && (
          <span className="chip">
            <Icon name="berean" size="0.95rem" strokeWidth={2} /> Berean
          </span>
        )}
        {j.kind === 'practice' && <span className="chip">Practice</span>}
      </div>
    </>
  );
}

/** The chain (rule 14.2): home and every hop so far, with its door and the manna it earned. */
export function Chain({ j }: { j: JourneyView }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
  }, [j.chain.length]);
  return (
    <div className="chain" ref={ref} role="list" aria-label="Your path so far">
      {j.chain.map((s, i) => (
        <span key={i} role="listitem" style={{ display: 'contents' }}>
          {i > 0 && s.door && s.tier && (
            <>
              <i className="dash" />
              <span className={`link tier-${s.home ? 'home' : s.tier} ${s.revisit ? 'revisit' : ''}`} title={`${TIER_NAMES[s.tier]}${s.revisit ? ', a return visit' : ''}`}>
                <TierBadge tier={s.tier} size={18} />
                {pretty(s.door)} <span className="tabular">+{s.manna}</span>
                <span className="sr-only">
                  {' '}manna, a {TIER_NAMES[s.tier]}{s.revisit ? ', a return visit' : ''}{s.widow ? `, oil refilled by ${s.widow}` : ''}
                </span>
              </span>
              <i className="dash" />
            </>
          )}
          <span className={`stop ${i === 0 || s.home ? 'home' : ''} ${i === j.chain.length - 1 ? 'here' : ''}`}>
            {(i === 0 || s.home) && <Icon name="home" size="0.85rem" strokeWidth={2.4} />}
            {s.ref}
          </span>
        </span>
      ))}
    </div>
  );
}

/** A line from Genesis to Revelation with the trip drawn on it, a small cousin of the finale's map. */
export function CanonBar({ j }: { j: JourneyView }) {
  const W = 1000, H = 44, base = 36;
  const x = (p: number) => 12 + p * (W - 24);
  const ntStart = 23145 / 31102;
  const here = j.chain[j.chain.length - 1];
  return (
    <div className="canon" aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <line x1={x(0)} x2={x(1)} y1={base} y2={base} stroke="rgba(255,250,240,0.5)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
        <line x1={x(ntStart)} x2={x(ntStart)} y1={base - 7} y2={base + 5} stroke="rgba(255,250,240,0.75)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        {j.chain.slice(1).map((s, i) => {
          const a = x(j.chain[i].position), b = x(s.position);
          const lift = Math.min(base - 3, 6 + Math.abs(b - a) * 0.09);
          return (
            <path
              key={i}
              d={`M${a} ${base} Q ${(a + b) / 2} ${base - lift * 2} ${b} ${base}`}
              fill="none"
              stroke={s.home ? '#f6dd95' : TIER_COLOR[s.tier as Tier] === TIER_COLOR.crumb ? '#f0dcb0' : '#fffaf0'}
              strokeOpacity={s.revisit ? 0.45 : 0.9}
              strokeWidth={1.6}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>
      <span style={{ position: 'absolute', left: `calc(${(x(j.chain[0].position) / W) * 100}% - 0.34rem)`, top: '1.02rem', width: '0.68rem', height: '0.68rem', borderRadius: '50%', background: '#f1cf7c', boxShadow: '0 0 0 2px rgba(60,36,12,0.4)' }} />
      {here !== j.chain[0] && (
        <span style={{ position: 'absolute', left: `calc(${(x(here.position) / W) * 100}% - 0.3rem)`, top: '1.06rem', width: '0.6rem', height: '0.6rem', borderRadius: '50%', background: '#fffaf0', boxShadow: '0 0 0 2px var(--accent), 0 0 8px rgba(255,250,240,0.9)', transition: 'left 0.6s cubic-bezier(0.22, 1, 0.36, 1)' }} />
      )}
    </div>
  );
}

/** How much of the page the on-screen keyboard is covering, so the hop slip can sit just above it. */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return inset;
}

export function useIsWide(min = 960): boolean {
  const [wide, setWide] = useState(() => window.innerWidth >= min && window.innerWidth > window.innerHeight);
  useEffect(() => {
    const on = () => setWide(window.innerWidth >= min && window.innerWidth > window.innerHeight);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [min]);
  return wide;
}
