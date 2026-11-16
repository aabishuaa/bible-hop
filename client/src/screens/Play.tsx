// The daily journey, and the guided first journey (rule 2.1).
import { useEffect, useState } from 'react';
import type { FinaleView, JourneyView } from '../../../shared/types.ts';
import { ApiError, api } from '../api.ts';
import type { GuideScript } from '../api.ts';
import { useApp } from '../app-store.ts';
import { navigate } from '../router.ts';
import { PaperCanvas } from '../ui/base.tsx';
import { setLastFinale } from './FinaleScreen.tsx';
import { JourneyScreen } from './journey/JourneyScreen.tsx';
import type { CoachStep } from './journey/JourneyScreen.tsx';

function Loading({ text }: { text: string }) {
  return (
    <div className="screen paper-surface" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <PaperCanvas seed={2} />
      <p className="display" style={{ fontSize: '1.6rem', fontStyle: 'italic', color: 'var(--brown)' }}>{text}</p>
    </div>
  );
}

export function DailyPlay({ clockSkew }: { clockSkew: number }) {
  const [journey, setJourney] = useState<JourneyView | null>(null);
  const [err, setErr] = useState('');
  const loadToday = useApp((s) => s.loadToday);
  useEffect(() => {
    api.start().then((r) => {
      if (r.journey.status !== 'playing') navigate(`/finale/${r.journey.date}`, { replace: true });
      else setJourney(r.journey);
    }).catch((e) => setErr(e instanceof ApiError ? e.message : 'Could not open the journey.'));
  }, []);
  if (err) return <Loading text={err} />;
  if (!journey) return <Loading text="Opening the Book…" />;
  return (
    <JourneyScreen
      key={journey.id}
      initial={journey}
      clockSkew={clockSkew}
      onFinale={(f: FinaleView) => {
        setLastFinale(f);
        void loadToday();
        navigate(`/finale/${f.date}`, { replace: true });
      }}
      onExit={() => {
        void loadToday();
        navigate('/');
      }}
    />
  );
}

/** Tap a word, type a verse, then come home: skippable, and never the day's home verse. */
export function GuidePlay({ clockSkew }: { clockSkew: number }) {
  const [journey, setJourney] = useState<JourneyView | null>(null);
  const [script, setScript] = useState<GuideScript | null>(null);
  const loadToday = useApp((s) => s.loadToday);
  useEffect(() => {
    api.guideStart().then((r) => {
      setScript(r.script);
      setJourney(r.journey);
    }).catch(() => navigate('/play', { replace: true }));
  }, []);
  if (!journey || !script) return <Loading text="Opening the Book…" />;
  const keyOf = (word: string) => journey.current.doors.find((d) => d.forms.includes(word.toLowerCase()))?.key ?? journey.home.doors.find((d) => d.forms.includes(word.toLowerCase()))?.key ?? word.toLowerCase();
  const steps: CoachStep[] = [
    { text: `Every word is a door. Tap <b>${script.outDoor}</b> to choose it.`, spot: keyOf(script.outDoor) },
    { text: `Now type another verse that has that word in it. Here is one to try: <b>${script.outRef}</b>. Then tap <b>Hop</b>.`, fill: script.outText },
    { text: `You hopped! The pages turned to your new verse. Now come home: tap <b>${script.backDoor}</b>, a word your home verse shares.`, spot: keyOf(script.backDoor) },
    { text: `Type your home verse and tap <b>Hop</b>. Normally you need 3 verses and 50 manna first; today the gate is open.`, fill: script.homeText },
  ];
  const skip = () => {
    void api.guideSkip().finally(() => {
      void loadToday();
      navigate('/play', { replace: true });
    });
  };
  return (
    <JourneyScreen
      key={journey.id}
      initial={journey}
      clockSkew={clockSkew}
      coach={{ steps, onSkip: skip }}
      onFinale={(f: FinaleView) => {
        setLastFinale(f);
        void loadToday();
        navigate('/finale', { replace: true });
      }}
      onExit={skip}
    />
  );
}
