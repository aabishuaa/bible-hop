// Achievements: the badges (each can be earned again and again) and the one-time milestones.
import { useEffect, useState } from 'react';
import type { Achievement, HistoryView } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { navigate } from '../router.ts';
import { BadgeCard, Medal } from '../ui/Badges.tsx';
import { press, useDocumentTitle } from '../ui/base.tsx';
import { Icon } from '../ui/icons.tsx';

export function AchievementsScreen() {
  useDocumentTitle('Achievements');
  const [h, setH] = useState<HistoryView | null>(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState<Achievement | null>(null);
  useEffect(() => {
    api.history().then(setH).catch((e) => setErr(e.message));
  }, []);
  const total = h?.badges.reduce((n, b) => n + (b.count ?? 0), 0) ?? 0;
  return (
    <div className="screen leather">
      <header className="bar bar-top">
        <div className="topbar">
          <button className="icon-btn" onClick={() => { press(); navigate('/'); }} aria-label="Back to today"><Icon name="lookback" size="1.3rem" /></button>
          <div className="title">Achievements</div>
        </div>
      </header>
      <div className="page-wrap">
        <div className="sheet-page">
          {err && <p className="lead">{err}</p>}
          {h && (
            <>
              <div className="ach-head">
                <h1 className="display">Badges</h1>
                <span className="pill soft">{total} earned</span>
              </div>
              <p className="small muted">Every badge can be earned again on any day. Tap one to see how.</p>
              <div className="ach-grid">
                {h.badges.map((b) => <Medal key={b.id} a={b} size={86} onClick={() => { press(); setOpen(b); }} />)}
              </div>
              {h.allAchievements.length > 0 && (
                <>
                  <h2 className="display">Milestones</h2>
                  <p className="small muted">Earned once, and kept for good.</p>
                  <div className="badge-row">
                    {h.allAchievements.map((a) => {
                      const got = h.achievements.find((x) => x.id === a.id);
                      return (
                        <div key={a.id} className={`badge ${got ? 'earned' : ''}`}>
                          <span className="medal-small" style={got ? undefined : { background: 'rgba(255,236,205,.08)', color: 'var(--ink-3)', boxShadow: 'inset 0 0 0 1px var(--line)' }}><Icon name={got ? 'sparkle' : 'ribbon'} /></span>
                          <span><b>{a.name}</b><span>{a.how}{a.cite ? ` · ${a.cite}` : ''}{got ? ` · earned ${got.earnedOn}` : ''}</span></span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
      <BadgeCard a={open} onClose={() => setOpen(null)} />
    </div>
  );
}
