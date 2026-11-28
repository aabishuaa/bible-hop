import { lazy, Suspense, useEffect, useRef } from 'react';
import { useApp } from './app-store.ts';
import { usePath } from './router.ts';
import { AchievementsScreen } from './screens/AchievementsScreen.tsx';
import { FinaleScreen } from './screens/FinaleScreen.tsx';
import { HistoryScreen } from './screens/HistoryScreen.tsx';
import { HowToPlay } from './screens/HowToPlay.tsx';
import { JournalScreen } from './journal/JournalScreen.tsx';
import { DailyPlay, GuidePlay } from './screens/Play.tsx';
import { PracticeScreen } from './screens/PracticeScreen.tsx';
import { RevelationScreen } from './screens/RevelationScreen.tsx';
import { SettingsScreen } from './screens/SettingsScreen.tsx';
import { StandingsScreen } from './screens/StandingsScreen.tsx';
import { TodayScreen } from './screens/TodayScreen.tsx';

const Desk = lazy(() => import('./desk/Desk.tsx'));
const Games = lazy(() => import('./minigames/GamesRoute.tsx'));

function Loading({ text }: { text: string }) {
  return (
    <div className="screen leather" style={{ alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center' }}>
      <p className="display" style={{ fontSize: '1.6rem', fontStyle: 'italic', color: 'var(--gilt)' }}>{text}</p>
    </div>
  );
}

export function App() {
  const path = usePath();
  const today = useApp((s) => s.today);
  const error = useApp((s) => s.error);
  const loadToday = useApp((s) => s.loadToday);
  const toasts = useApp((s) => s.toasts);
  const skew = useRef(0);
  const loadedAt = useRef(0);

  useEffect(() => {
    void loadToday().then((t) => {
      if (t) {
        skew.current = t.serverNow - Date.now();
        loadedAt.current = Date.now();
      }
    });
    // Rule 12.9: coming back after midnight shows yesterday's result, then today's verse.
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - loadedAt.current < 15000) return;
      void loadToday().then((t) => {
        if (t) {
          skew.current = t.serverNow - Date.now();
          loadedAt.current = Date.now();
        }
      });
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [loadToday]);

  const [route, query] = path.split('?');
  const params = new URLSearchParams(query ?? '');

  let screen: React.ReactNode;
  if (route.startsWith('/desk')) {
    screen = (
      <Suspense fallback={<Loading text="Opening the Desk…" />}>
        <Desk path={route} />
      </Suspense>
    );
  } else if (!today) {
    screen = error ? (
      <Loading text={error} />
    ) : (
      <Loading text="Opening the Book…" />
    );
  } else if (route === '/play') screen = params.get('guide') ? <GuidePlay clockSkew={skew.current} /> : <DailyPlay clockSkew={skew.current} />;
  else if (route === '/practice') screen = <PracticeScreen clockSkew={skew.current} />;
  else if (route.startsWith('/finale')) screen = <FinaleScreen date={route.split('/')[2] || undefined} />;
  else if (route === '/history') screen = <HistoryScreen />;
  else if (route === '/achievements') screen = <AchievementsScreen />;
  else if (route === '/settings') screen = <SettingsScreen today={today} />;
  else if (route === '/how') screen = <HowToPlay />;
  else if (route === '/journal') screen = <JournalScreen />;
  else if (route === '/games' || route.startsWith('/games/')) {
    screen = (
      <Suspense fallback={<Loading text="Setting the table…" />}>
        <Games path={route} />
      </Suspense>
    );
  }
  else if (route.startsWith('/standings/')) screen = <StandingsScreen date={route.split('/')[2]} />;
  else if (route.startsWith('/revelation/')) screen = <RevelationScreen date={route.split('/')[2]} />;
  else screen = <TodayScreen today={today} clockSkew={skew.current} />;

  return (
    <>
      {screen}
      {error && today && <div className="toast-host"><div className="toast" role="alert">{error}</div></div>}
      <div className="toast-host" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className="toast">{t.text}</div>)}
      </div>
    </>
  );
}
