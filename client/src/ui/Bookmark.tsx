// The ribbon beside a verse: tap it to keep the verse in your Journal, tap again to let it go.
import { useEffect, useState } from 'react';
import { useApp } from '../app-store.ts';
import { useBookmarks } from '../bookmarks.ts';
import { haptics } from '../fx/haptics.ts';
import { sound } from '../fx/sound.ts';
import { Icon } from './icons.tsx';

export function BookmarkButton({ verse, refLabel, source, size = '1.15rem', className = '', label = false }: { verse: number; refLabel: string; source: string; size?: string; className?: string; label?: boolean }) {
  const saved = useBookmarks((s) => s.saved.has(verse));
  const load = useBookmarks((s) => s.load);
  const toggle = useBookmarks((s) => s.toggle);
  const toast = useApp((s) => s.toast);
  const [pop, setPop] = useState(0);
  useEffect(() => {
    void load();
  }, [load]);
  const click = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!saved) {
      sound.keep();
      haptics.play([6, 30, 10]);
      setPop((p) => p + 1);
    } else {
      sound.unkeep();
      haptics.play(6);
    }
    toggle(verse, source)
      .then((now) => toast(now ? `${refLabel} is in your Journal.` : `${refLabel} left your Journal.`))
      .catch((err: Error) => toast(err.message));
  };
  return (
    <button
      type="button"
      className={`bm-btn ${saved ? 'on' : ''} ${className}`}
      onClick={click}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${refLabel} from your Journal` : `Keep ${refLabel} in your Journal`}
      title={saved ? 'In your Journal' : 'Keep in your Journal'}
    >
      <Icon key={pop} name="ribbon" size={size} strokeWidth={2} className={pop && saved ? 'bm-pop' : ''} />
      {label && <span>{saved ? 'Kept' : 'Keep'}</span>}
    </button>
  );
}
