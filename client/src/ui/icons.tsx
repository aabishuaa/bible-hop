// Icons: the game's own symbols (icon-paths.ts) and a few everyday ones from Lucide.
import type { CSSProperties } from 'react';
import type { Tier } from '../../../shared/rules.ts';
import { ICON_PATHS } from './icon-paths.ts';

export type IconName = keyof typeof ICON_PATHS;

export interface IconProps {
  name: string;
  size?: number | string;
  className?: string;
  style?: CSSProperties;
  /** Read aloud by screen readers. Without it the icon is decoration and is skipped. */
  label?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = '1em', className, style, label, strokeWidth = 1.7 }: IconProps) {
  const paths = ICON_PATHS[name] ?? [];
  return (
    <svg
      className={`icon ${className ?? ''}`}
      style={style}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {paths.map((p, i) => (p.fill ? <path key={i} d={p.d} fill="currentColor" stroke="none" /> : <path key={i} d={p.d} />))}
    </svg>
  );
}

export const tierIcon = (tier: Tier | 'home'): string => tier;

/** A tier's emblem on its round badge, as in the sample decks. */
export function TierBadge({ tier, size = 34, className }: { tier: Tier | 'home'; size?: number; className?: string }) {
  return (
    <span className={`tier-badge tier-${tier} ${className ?? ''}`} style={{ width: size, height: size }} aria-hidden="true">
      <Icon name={tier} size={size * 0.58} />
    </span>
  );
}
