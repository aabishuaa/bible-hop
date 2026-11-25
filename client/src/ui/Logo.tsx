// The Bible Hopping wordmark. HOPPING in chunky stamped letters, with the O as a red ball caught
// mid-hop. On arrival the letters hop in place in a wave and the O jumps highest; after that only
// the O hops, now and then. A tap replays the wave. The small version's O hops when the player does.
import { useEffect, useState } from 'react';
import { haptics } from '../fx/haptics.ts';
import { sound } from '../fx/sound.ts';
import { isReducedMotion } from '../prefs.ts';

const LETTERS = ['H', 'O', 'P', 'P', 'I', 'N', 'G'];

export function Ball({ className = '' }: { className?: string }) {
  return (
    <span className={`logo-ball ${className}`} aria-hidden="true">
      <span className="ball-body"><i /></span>
      <span className="ball-shadow" />
    </span>
  );
}

export function Logo({ size = 'hero', hopKey, tagline }: { size?: 'hero' | 'mini'; hopKey?: number; tagline?: string }) {
  const [wave, setWave] = useState(() => (isReducedMotion() ? 0 : 1));
  const [hop, setHop] = useState(0);
  useEffect(() => {
    if (hopKey === undefined || hopKey === 0 || isReducedMotion()) return;
    setHop((h) => h + 1);
  }, [hopKey]);
  const replay = () => {
    if (isReducedMotion()) return;
    setWave((w) => w + 1);
    sound.unlock();
    sound.door('loaf');
    window.setTimeout(() => sound.land('crumb'), 380);
    haptics.play([8, 40, 8, 40, 14]);
  };
  const label = 'Bible Hopping';
  if (size === 'mini') {
    return (
      <span className="logo mini" role="img" aria-label={label}>
        <span className="logo-bible">Bible</span>
        <span className="logo-hop" aria-hidden="true">
          {LETTERS.map((l, i) => (i === 1 ? <span key={`o${hop}`} className={`lh lo ${hop ? 'jump' : ''}`}><Ball /></span> : <span key={i} className="lh">{l}</span>))}
        </span>
      </span>
    );
  }
  return (
    <button type="button" className="logo hero" onClick={replay} aria-label={label}>
      <span className="logo-bible">Bible</span>
      <span className={`logo-hop ${wave ? 'wave' : ''}`} key={wave} aria-hidden="true">
        {LETTERS.map((l, i) => (i === 1
          ? <span key={i} className="lh lo" style={{ ['--i' as string]: i }}><Ball className="idle" /></span>
          : <span key={i} className="lh" style={{ ['--i' as string]: i }}>{l}</span>))}
      </span>
      {tagline && <span className="logo-tag">{tagline}</span>}
    </button>
  );
}
