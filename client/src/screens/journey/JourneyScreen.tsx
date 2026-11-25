// The journey screen (rule 14.2), played inside an open Bible. Tap a word, type a verse, and the
// pages turn to it: a flick for a crumb, a brisk turn for a loaf, a glide for a fish, a slow sweep
// for a pearl, each in its own color, with its own sound and its own feel in the hand.
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Tier } from '../../../../shared/rules.ts';
import { TIER_NAMES } from '../../../../shared/rules.ts';
import type { ActionResult, DoorView, FinaleView, JourneyView, MessageView, Wording } from '../../../../shared/types.ts';
import { ApiError, api } from '../../api.ts';
import { useApp } from '../../app-store.ts';
import { burst } from '../../fx/burst.ts';
import { flipStage } from '../../fx/flip.ts';
import { Cover } from './Cover.tsx';
import { Logo } from '../../ui/Logo.tsx';
import { HomeCelebration, NuggetFlash } from './Celebrations.tsx';
import type { FlipPlan } from '../../fx/flip.ts';
import { haptics } from '../../fx/haptics.ts';
import { leafTexture } from '../../fx/paper.ts';
import { snapshot } from '../../fx/snapshot.ts';
import { sound } from '../../fx/sound.ts';
import { drafts, isReducedMotion, usePrefs } from '../../prefs.ts';
import { navigate } from '../../router.ts';
import { FLIP_FEEL, TIER_HINT, rgb, TIER_COLOR } from '../../theme.ts';
import { PaperCanvas, press, useDocumentTitle } from '../../ui/base.tsx';
import { Icon, TierBadge } from '../../ui/icons.tsx';
import { ConcordanceModal, ConfirmModal, GraceModal, LookBackModal, ReportModal, StatusModal } from './modals.tsx';
import { CanonBar, Chain, HomeWords, Hud, VerseWords, homeReadiness, useIsWide, useKeyboardInset } from './parts.tsx';

export interface CoachStep {
  /** What the coach says. */
  text: string;
  /** The word to light up on the page, if any. */
  spot?: string;
  /** Text to offer for the verse box, if any. */
  fill?: string;
}

export interface JourneyScreenProps {
  initial: JourneyView;
  clockSkew: number;
  /** The guided first journey's script (rule 2.1). */
  coach?: { steps: CoachStep[]; onSkip: () => void };
  onFinale: (f: FinaleView) => void;
  onExit: () => void;
}

type Pending = JourneyView['pending'];

const pretty = (s: string) => s.replace(/'/g, '’');

export function JourneyScreen({ initial, clockSkew, coach, onFinale, onExit }: JourneyScreenProps) {
  const [j, setJ] = useState<JourneyView>(initial);
  const [wording, setWording] = useState<Wording>(() => (initial.current.wordings[useApp.getState().today?.player.wording ?? 'kjv'] ? (useApp.getState().today?.player.wording ?? 'kjv') : 'kjv'));
  const [door, setDoor] = useState<DoorView | null>(null);
  const [doorWord, setDoorWord] = useState('');
  const [typed, setTyped] = useState('');
  const [reference, setReference] = useState('');
  const [message, setMessage] = useState<MessageView | null>(null);
  const [notes, setNotes] = useState<MessageView[]>([]);
  const [reportable, setReportable] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [turning, setTurning] = useState(false);
  const [shake, setShake] = useState<string | null>(null);
  const [gain, setGain] = useState<{ n: number; tier: Tier; key: number; home?: boolean } | null>(null);
  const [status, setStatus] = useState(false);
  const [lookBack, setLookBack] = useState(false);
  const [report, setReport] = useState(false);
  const [concordance, setConcordance] = useState(false);
  const [homeOpen, setHomeOpen] = useState(false);
  const [coachStep, setCoachStep] = useState(0);
  const [wash, setWash] = useState<Tier | 'home' | null>(null);
  const [entryKey, setEntryKey] = useState<string | undefined>(undefined);
  const [nugget, setNugget] = useState(false);
  const [celebrate, setCelebrate] = useState<FinaleView | null>(null);

  const toast = useApp((s) => s.toast);
  const wide = useIsWide();
  const kb = useKeyboardInset();
  const rightPage = useRef<HTMLDivElement>(null);
  const rightScroll = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(0);
  const bookRef = useRef<HTMLDivElement>(null);
  const leftPage = useRef<HTMLDivElement>(null);
  const verseBox = useRef<HTMLTextAreaElement>(null);
  const prevOil = useRef(j.oil);
  const pendingShown = useRef<Pending>(null);

  useDocumentTitle(j.current.ref);

  const stillPlaying = j.status === 'playing';
  const pages = usePrefs((s) => s.pages);
  const setPrefs = usePrefs((s) => s.set);
  const spread = wide && pages === 'two';
  const hasWording = (w: Wording, v = j.current) => !!v.wordings[w];
  const shownWording: Wording = hasWording(wording) ? wording : hasWording('kjv') ? 'kjv' : 'web';

  // Rule 12.13: typed text is kept on the device while a hop is written.
  useEffect(() => {
    const d = drafts.load(j.id, j.current.id);
    if (d) {
      const found = j.current.doors.find((x) => x.key === d.door);
      if (found && found.state === 'open') {
        setDoor(found);
        setDoorWord(d.door);
      }
      setTyped(d.typed);
      setReference(d.reference);
    }
  }, [j.id, j.current.id]);
  useEffect(() => {
    if (door || typed || reference) drafts.save(j.id, j.current.id, { door: door?.key ?? '', typed, reference });
  }, [door, typed, reference, j.id, j.current.id]);

  // A pending question survives a reload (rule 11.4): sound it once when it appears.
  useEffect(() => {
    if (j.pending && j.pending !== pendingShown.current) {
      pendingShown.current = j.pending;
      if (j.pending.type === 'grace') {
        sound.unlock();
        if (j.pending.losses.includes('rooster')) sound.rooster(0);
        else sound.loss(j.pending.losses[0] === 'fish' ? 'fish' : j.pending.losses[0] === 'famine' ? 'famine' : 'lamp');
        window.setTimeout(() => sound.graceOffer(), j.pending.losses.includes('rooster') ? 1500 : 700);
        haptics.loss();
      } else sound.ask();
    }
  }, [j.pending]);

  const clearSlip = useCallback(() => {
    setDoor(null);
    setDoorWord('');
    setTyped('');
    setReference('');
    drafts.clear(j.id, j.current.id);
  }, [j.id, j.current.id]);

  // The hop slip sits over the bottom of the page. Give the page that much room at the bottom, so the
  // verse (centred in what is left) is never under the slip, and scroll the verse into view if needed.
  const slipOpen = !!door && stillPlaying && !j.pending;
  useEffect(() => {
    if (!slipOpen) {
      setRoom(0);
      return;
    }
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const scroller = rightScroll.current, sheet = sheetRef.current;
        if (!scroller || !sheet) return;
        // the slip's resting place: fixed to the bottom, just above the on-screen keyboard
        const sheetTop = window.innerHeight - kb - sheet.offsetHeight;
        const box = scroller.getBoundingClientRect();
        const overlap = Math.max(0, Math.round(box.bottom - sheetTop));
        setRoom(overlap ? overlap + 18 : 0);
        // after the padding lands, bring the verse into the visible part
        window.setTimeout(() => {
          const verse = scroller.querySelector<HTMLElement>('.verse');
          if (!verse) return;
          const visibleBottom = Math.min(box.bottom, sheetTop) - 12;
          const v = verse.getBoundingClientRect();
          const chosen = scroller.querySelector<HTMLElement>('.w.chosen')?.getBoundingClientRect();
          // keep the chosen word, or the end of the verse, above the slip
          const target = chosen && v.bottom > visibleBottom ? chosen.bottom : v.bottom;
          if (target > visibleBottom) scroller.scrollBy({ top: target - visibleBottom, behavior: 'smooth' });
          else if (v.top < box.top) scroller.scrollBy({ top: v.top - box.top - 12, behavior: 'smooth' });
        }, 280);
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (sheetRef.current) ro.observe(sheetRef.current);
    if (rightScroll.current) ro.observe(rightScroll.current);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [slipOpen, kb, door?.key, message, notes.length]);

  // ------------------------------------------------------------------ choosing a door (rule 3.2)
  const tapWord = (d: DoorView, word: string, el: HTMLElement) => {
    sound.unlock();
    if (!stillPlaying || turning) return;
    if (d.state === 'wall') {
      sound.wall();
      haptics.door('wall');
      setShake(d.key);
      window.setTimeout(() => setShake(null), 350);
      setMessage({ code: 'refuse.wall', text: `“${word}” appears only in this verse. It is a wall, not a door.`, tone: 'warn' });
      return;
    }
    if (d.state === 'used' || d.state === 'spent') {
      sound.used();
      haptics.used();
      setShake(d.key);
      window.setTimeout(() => setShake(null), 350);
      setMessage({ code: 'refuse.exit', text: d.state === 'used' ? `You already used “${word}” here. Its other forms share that door. Pick another word.` : `“${word}” has already carried you once today.`, tone: 'warn' });
      return;
    }
    if (door?.key === d.key) {
      sound.click();
      haptics.tap();
      setDoor(null);
      setDoorWord('');
      return;
    }
    sound.door(d.tier);
    haptics.door(d.tier);
    setDoor(d);
    setDoorWord(word);
    setMessage(null);
    el.scrollIntoView({ block: 'nearest' });
    if (coach && coach.steps[coachStep]?.spot === d.key) setCoachStep((s) => s + 1);
    window.setTimeout(() => verseBox.current?.focus({ preventScroll: true }), 80);
  };

  // ------------------------------------------------------------------ the page turn
  const turnPages = useCallback(
    async (from: JourneyView, to: JourneyView, tier: Tier | 'home', arrivedHome: boolean): Promise<void> => {
      const stage = flipStage();
      const page = rightPage.current;
      if (!page || isReducedMotion()) {
        // no motion: the color and the sound still mark the hop
        setJ(to);
        sound.flip(tier, 1);
        sound.land(tier, 0.2);
        if (page) {
          const b = page.getBoundingClientRect();
          burst(b.left + b.width * 0.5, b.top + b.height * 0.42, TIER_COLOR[tier], arrivedHome ? 34 : 16, arrivedHome);
        }
        return;
      }
      const box = page.getBoundingClientRect();
      const feel = FLIP_FEEL[tier];
      const dir: 1 | -1 = to.current.id >= from.current.id ? 1 : -1;
      // further hops turn more pages, up to the tier's limit; home gets the full sweep
      const distance = Math.abs(to.current.position - from.current.position);
      const leaves = arrivedHome ? feel.maxLeaves : Math.max(1, Math.min(feel.maxLeaves, Math.ceil(distance * 10)));
      const fromRight = snapshot(page);
      const fromLeft = spread && leftPage.current ? snapshot(leftPage.current) : undefined;
      const generic = [0, 1, 2].map((i) => leafTexture(tier, box.width, box.height, i));
      const plan: FlipPlan = {
        page: { x: box.left, y: box.top, w: box.width, h: box.height },
        spread,
        dir,
        leaves,
        duration: feel.duration,
        stagger: feel.stagger,
        curl: feel.curl,
        tint: rgb(TIER_COLOR[tier]),
        fromRight,
        toRight: fromRight,
        fromLeft,
        toLeft: fromLeft,
        generic,
        onLeaf: (i) => sound.flip(tier, dir, 0),
      };
      // the old page freezes on the canvas, the real page changes underneath
      stage.hold(plan);
      setWash(tier);
      setJ(to);
      await new Promise<void>((r) => window.setTimeout(r, 120));
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      plan.toRight = snapshot(page);
      if (spread && leftPage.current) plan.toLeft = snapshot(leftPage.current);
      haptics.flip(leaves, feel.stagger, feel.duration, tier);
      const total = feel.duration + (leaves - 1) * feel.stagger;
      window.setTimeout(() => sound.land(tier), Math.max(0, total - 120));
      await stage.play(plan);
      const box2 = page.getBoundingClientRect();
      burst(box2.left + box2.width * 0.5, box2.top + box2.height * 0.42, TIER_COLOR[tier], arrivedHome ? 34 : 16, arrivedHome);
      await new Promise<void>((r) => window.setTimeout(r, 260));
      setWash(null);
    },
    [spread],
  );

  // ------------------------------------------------------------------ actions
  const apply = useCallback(
    async (r: ActionResult, previous: JourneyView) => {
      setMessage(r.message);
      setNotes(r.notes);
      setReportable(r.reportable ?? null);
      const next = r.journey;
      const hop = r.hop;
      if (hop) {
        const tier: Tier | 'home' = hop.home ? 'home' : hop.tier;
        setEntryKey(hop.home ? undefined : hop.family);
        clearSlip();
        setTurning(true);
        await turnPages(previous, next, tier, hop.home);
        setTurning(false);
        setGain({ n: hop.manna + hop.calf, tier: hop.tier, key: Date.now(), home: hop.home });
        sound.manna(hop.manna + hop.calf, 0.05);
        if (hop.widow) window.setTimeout(() => sound.oilRefill(hop.widow), 500);
        if (hop.tier === 'nugget' && !hop.home) setNugget(true);
        if (coach && coach.steps[coachStep]?.fill) setCoachStep((s) => s + 1);
      } else if (r.undone) {
        // looking back, or Grace for the fish: the pages turn back
        setEntryKey(undefined);
        clearSlip();
        setTurning(true);
        sound.lookBack();
        haptics.lookBack();
        await turnPages(previous, next, r.undone.tier, false);
        setTurning(false);
      } else {
        setJ(next);
      }
      if (r.kind === 'refuse' || r.kind === 'gap' || r.kind === 'ask') {
        sound.refuse();
        haptics.refuse();
      }
      if (r.kind === 'strike') {
        sound.strike(next.strikes);
        haptics.strike();
      }
      if (r.kind === 'graceUsed') {
        sound.graceUse();
        haptics.grace();
      }
      if (r.kind === 'stale') toast(r.message?.text ?? 'This journey moved on from another device.');
      if (r.finale) {
        const f = r.finale;
        if (!f.won && f.loss) {
          if (f.loss.reason === 'rooster') sound.rooster(0.1);
          else sound.loss(f.loss.reason);
          haptics.loss();
        }
        if (f.won && f.kind !== 'guide') window.setTimeout(() => setCelebrate(f), 350);
        else window.setTimeout(() => onFinale(f), f.won ? 1600 : 1700);
      }
    },
    [clearSlip, coach, coachStep, onFinale, toast, turnPages],
  );

  const run = useCallback(
    async (fn: () => Promise<ActionResult>) => {
      if (busy) return;
      setBusy(true);
      const previous = j;
      try {
        const r = await fn();
        await apply(r, previous);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          toast(e.message);
          onExit();
        } else setMessage({ code: 'error', text: e instanceof Error ? e.message : 'Something went wrong. Please try again.', tone: 'warn' });
      } finally {
        setBusy(false);
      }
    },
    [apply, busy, j, onExit, toast],
  );

  const ref = { journeyId: j.id, version: j.version };
  const submitHop = () => {
    if (!door) {
      setMessage({ code: 'refuse.noDoor', text: 'Tap a word in the verse first. That word is your door.', tone: 'warn' });
      sound.refuse();
      return;
    }
    if (!typed.trim()) {
      verseBox.current?.focus();
      return;
    }
    press('soft');
    void run(() => api.hop(ref, doorWord, typed, reference));
  };

  const onWordingSwitch = (w: Wording) => {
    sound.unlock();
    sound.wording();
    haptics.tap();
    setWording(w);
    void api.settings({ wording: w }).catch(() => undefined);
  };

  // ------------------------------------------------------------------ screen pieces
  const arrived = j.current.id === j.home.id && j.status !== 'won' ? undefined : j.arrivedBy;
  const accentClass = j.status === 'won' ? 'arrived-home' : arrived ? `arrived-${arrived}` : '';
  const verseLen = (j.current.wordings[shownWording] ?? []).reduce((n, t) => n + (t.d !== undefined ? 1 : 0), 0);
  const verseClass = verseLen > 70 ? 'xlong' : verseLen > 38 ? 'long' : '';
  const readiness = homeReadiness(j);
  const isHomeDoor = !!door && door.inHome;
  const bonus = useMemo(() => {
    if (!door) return null;
    const v = door.value;
    return { book: Math.round(v * 1.25), chapter: Math.round(v * 1.5), exact: v * 2 };
  }, [door]);
  const coachNow = coach?.steps[coachStep];
  useEffect(() => {
    if (coachNow?.fill && !typed && door) setTyped(coachNow.fill);
  }, [coachNow, door, typed]);
  useEffect(() => {
    prevOil.current = j.oil;
  }, [j.oil]);

  const pendingConfirm = j.pending && j.pending.type !== 'grace' ? j.pending : null;
  const pendingGrace = j.pending?.type === 'grace' ? j.pending : null;

  return (
    <div className={`journey leather ${accentClass}`}>
      <div className={`wash ${wash ? 'on' : ''} tier-${wash ?? 'home'}`} aria-hidden="true" />
      <header className="bar bar-top">
        <div className="topbar">
          <button className="icon-btn" onClick={() => { press(); onExit(); }} aria-label="Leave the journey for now">
            <Icon name="book" size="1.35rem" />
          </button>
          <div className="title">
            {j.kind === 'daily' ? <><Logo size="mini" hopKey={j.hops} /><small>#{j.puzzleNo}</small></> : j.kind === 'practice' ? 'Sunday School' : 'Your first hop'}
          </div>
          {wide && (
            <div className="seg pages-seg" role="group" aria-label="Page view">
              <button aria-pressed={!spread} aria-label="One page" title="One page" onClick={() => { press(); setPrefs({ pages: 'one' }); }}>
                <Icon name="page1" size="1.15rem" />
              </button>
              <button aria-pressed={spread} aria-label="Two pages: home verse and path" title="Two pages" onClick={() => { press(); setPrefs({ pages: 'two' }); }}>
                <Icon name="page2" size="1.15rem" />
              </button>
            </div>
          )}
          {j.features.wordingSwitch && (
            <div className="seg" role="group" aria-label="Wording">
              <button aria-pressed={shownWording === 'kjv'} disabled={!hasWording('kjv')} onClick={() => onWordingSwitch('kjv')}>KJV</button>
              <button aria-pressed={shownWording === 'web'} disabled={!hasWording('web')} onClick={() => onWordingSwitch('web')}>WEB</button>
            </div>
          )}
          <button className="icon-btn" onClick={() => { press(); setStatus(true); }} aria-label="Journey status and help">
            <Icon name="manna" size="1.35rem" />
          </button>
        </div>
        <Hud j={j} clockSkew={clockSkew} onOpen={() => { press(); setStatus(true); }} />
      </header>

      <div className={`book ${spread ? 'spread' : ''}`} ref={bookRef}>
        {spread && (
          <div className="page left paper-surface" ref={leftPage}>
            <PaperCanvas spine="right" seed={5} />
            <div className="page-edges left" aria-hidden="true" style={{ transform: `scaleX(${0.3 + 0.7 * j.current.position})` }} />
            <div className="page-scroll">
              <div className="home-page-title" data-snap>
                <Icon name="home" size="1rem" strokeWidth={2.4} /> Home verse <span style={{ color: 'var(--ink-2)', letterSpacing: '0.06em', textTransform: 'none', fontSize: '0.84rem' }}>{j.home.ref}</span>
              </div>
              <p className="home-verse" data-snap>
                <HomeWords home={j.home} wording={shownWording} match={door?.key ?? null} />
              </p>
              <p className="small muted" style={{ marginBottom: '1rem' }}>
                {readiness.ready ? 'You can head home now: come through any open word above that your verse also holds.' : 'Come home through a word both verses share, after visiting ' + j.cord.need + ' verses with ' + j.gate + ' manna.'}
              </p>
              <Chain j={j} />
            </div>
          </div>
        )}
        <div className="page right paper-surface" ref={rightPage}>
          <PaperCanvas spine={spread ? 'left' : 'none'} seed={3} />
          <div className="page-edges right" aria-hidden="true" style={{ transform: `scaleX(${0.3 + 0.7 * (1 - j.current.position)})` }} />
          <div className="page-scroll" ref={rightScroll} style={room ? { paddingBottom: room } : undefined}>
            {!spread && (
              <button className={`home-strip ${homeOpen ? 'open' : ''}`} onClick={() => { press(); setHomeOpen((o) => !o); }} aria-expanded={homeOpen} aria-label={`Home verse, ${j.home.ref}. ${homeOpen ? 'Collapse' : 'Expand'}.`}>
                <span className="label" data-snap>
                  <Icon name="home" size="0.9rem" strokeWidth={2.4} /> Home <span className="ref">{j.home.ref}</span>
                  <Icon name={homeOpen ? 'lookback' : 'hop'} size="0.8rem" style={{ marginLeft: 'auto', color: 'var(--ink-3)' }} />
                </span>
                <span className="text" data-snap>
                  <HomeWords home={j.home} wording={shownWording} match={door?.key ?? null} />
                </span>
              </button>
            )}
            <div className="running-head" data-snap>
              <div className="ref">
                <small>{j.current.id === j.home.id ? (j.status === 'won' ? 'Home again' : 'Home') : arrived ? `By a ${TIER_NAMES[arrived]}` : ''}</small>
                {j.current.ref}
              </div>
              <div className="rule" />
            </div>
            <p className={`verse ${verseClass} ink-in`} data-snap key={`${j.current.id}-${shownWording}`} aria-label={`${j.current.ref}. Tap a word to choose it as your door.`}>
              <span className="num" aria-hidden="true">{j.current.verse}</span>
              <VerseWords verse={j.current} wording={shownWording} chosen={door?.key ?? null} entry={entryKey} spot={coachNow?.spot} shake={shake} onTap={tapWord} />
            </p>
            {j.goldenRoad && !door && (
              <button className="golden-road" disabled={busy || turning} onClick={() => { press(); void run(() => api.golden(ref)); }}>
                <span className="tier-badge tier-nugget" style={{ width: 40, height: 40 }}><Icon name="nugget" size={22} /></span>
                <span><b>Take the Golden Road home</b><small>One tap takes you straight home, with a feast</small></span>
                <Icon name="home" size="1.4rem" strokeWidth={2.2} />
              </button>
            )}
            <AnimatePresence>
              {gain && (
                <motion.div key={gain.key} className={`gain tier-${gain.home ? 'home' : gain.tier}`} initial={false} onAnimationEnd={() => setGain(null)} aria-live="polite">
                  <TierBadge tier={gain.home ? 'home' : gain.tier} size={30} />
                  +{gain.n} <small>manna</small>
                </motion.div>
              )}
            </AnimatePresence>
            {message && !door && (
              <div className={`msg-line ${message.tone}`} role={message.tone === 'bad' ? 'alert' : 'status'}>
                <Icon name={message.tone === 'good' ? 'hop' : message.tone === 'bad' ? 'rooster' : 'book'} />
                <span>
                  {message.text}
                  {reportable !== null && j.kind === 'daily' && (
                    <>
                      {' '}
                      <button className="link" onClick={() => setReport(true)}>Report a wrong call</button>
                    </>
                  )}
                </span>
              </div>
            )}
            {!door && notes.map((n, i) => (
              <div key={i} className={`msg-line ${n.tone}`} role="status">
                <Icon name="lamp" />
                <span>{n.text}</span>
              </div>
            ))}
            {!door && !message && stillPlaying && !j.pending && (
              <p className="empty-hint">
                <Icon name="hop" className="nudge" size="1.2rem" strokeWidth={2.2} />
                {readiness.ready ? 'Tap a word your home verse shares to head home.' : 'Tap a word to hop.'}
              </p>
            )}
          </div>
        </div>
      </div>

      {nugget && <NuggetFlash onDone={() => setNugget(false)} />}
      {celebrate && <HomeCelebration finale={celebrate} onDone={() => { const f = celebrate; setCelebrate(null); onFinale(f); }} />}
      <Cover journeyId={j.id} spread={spread} stageRef={bookRef} rightRef={rightPage} leftRef={leftPage} />
      <footer className="bar bar-bottom">
        <div className="dock">
          <div className="dock-row">
            {!spread && <Chain j={j} />}
            {spread && <CanonBar j={j} />}
            <button className="lookback-btn" disabled={!j.lookBack.available || busy || turning} onClick={() => { press(); setLookBack(true); }} aria-label={j.lookBack.available ? `Look back to ${j.lookBack.toRef}, for ${j.lookBack.cost} manna` : 'Look back (nothing to undo yet)'}>
              <Icon name="lookback" size="1rem" strokeWidth={2.2} /> Look back
            </button>
          </div>
          {!spread && <CanonBar j={j} />}
        </div>
      </footer>

      {/* the slip of paper a hop is written on (rule 14.2: the hop panel) */}
      <AnimatePresence>
        {door && stillPlaying && !j.pending && (
          <motion.div className="hop-sheet" style={{ bottom: kb }} initial={{ y: '110%' }} animate={{ y: 0 }} exit={{ y: '110%' }} transition={{ type: 'spring', stiffness: 460, damping: 38 }}>
            <div ref={sheetRef} className={`hop-card tier-${door.tier}`} role="region" aria-label={`Hop through ${doorWord}`}>
              <div className="grab" />
              <div className="hop-head">
                <TierBadge tier={door.tier} size={44} />
                <div>
                  <div className="word">{pretty(doorWord)}</div>
                  <div className="meta">
                    <b>{TIER_NAMES[door.tier]}</b> · <b>{door.value}</b> manna · in <b>{door.count.toLocaleString()}</b> verses
                    {isHomeDoor && (
                      <span className="pill soft" style={{ padding: '0.05rem 0.5rem', fontSize: '0.72rem' }}>
                        <Icon name="home" size="0.75rem" strokeWidth={2.4} /> also at home
                      </span>
                    )}
                  </div>
                </div>
                <button className="icon-btn on-paper close" onClick={() => { press(); setDoor(null); setDoorWord(''); }} aria-label="Choose a different word">
                  <Icon name="strike" size="1.2rem" strokeWidth={2.2} />
                </button>
              </div>
              {(door.forms.some((f) => f !== doorWord.toLowerCase()) || door.tier === 'crumb') && (
                <div className="forms">
                  {door.forms.some((f) => f !== doorWord.toLowerCase()) && <>Also&nbsp;</>}
                  {door.forms.filter((f) => f !== doorWord.toLowerCase()).slice(0, 5).map((f) => <span key={f}>{pretty(f)}</span>)}
                  {door.tier === 'crumb' && <em style={{ marginLeft: 'auto' }}>{TIER_HINT.crumb}</em>}
                </div>
              )}
              {message && (
                <div className={`msg-line ${message.tone}`} style={{ marginTop: 0, marginBottom: '0.6rem' }} role={message.tone === 'bad' ? 'alert' : 'status'}>
                  <Icon name={message.tone === 'good' ? 'hop' : message.tone === 'bad' ? 'rooster' : 'book'} />
                  <span>
                    {message.text}
                    {reportable !== null && j.kind === 'daily' && (
                      <>
                        {' '}
                        <button className="link" onClick={() => setReport(true)}>Report a wrong call</button>
                      </>
                    )}
                  </span>
                </div>
              )}
              {notes.map((n, i) => (
                <div key={i} className={`msg-line ${n.tone}`} style={{ marginTop: 0, marginBottom: '0.6rem' }} role="status">
                  <Icon name="lamp" />
                  <span>{n.text}</span>
                </div>
              ))}
              <div className="hop-inputs">
                <label className="sr-only" htmlFor="verse-box">Type a verse that contains {doorWord}, from memory</label>
                <textarea
                  id="verse-box"
                  ref={verseBox}
                  className="field"
                  placeholder={`Type a verse with “${doorWord}” in it, from memory…`}
                  value={typed}
                  rows={2}
                  autoCapitalize="sentences"
                  autoCorrect="on"
                  spellCheck={false}
                  enterKeyHint="go"
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      submitHop();
                    }
                  }}
                />
                <div className="hop-row">
                  <div>
                    <label className="sr-only" htmlFor="ref-box">Reference, for a bonus (optional)</label>
                    <input
                      id="ref-box"
                      className="field"
                      placeholder={j.mode === 'berean' ? 'Reference (required in Berean Mode)' : 'Reference for a bonus, e.g. John 3:16'}
                      value={reference}
                      autoCapitalize="words"
                      autoCorrect="off"
                      enterKeyHint="go"
                      onChange={(e) => setReference(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          submitHop();
                        }
                      }}
                    />
                  </div>
                  <button className={`btn tier ${busy ? 'pressed' : ''}`} disabled={busy || turning || !typed.trim()} onClick={submitHop} aria-label={isHomeDoor && readiness.ready ? 'Hop (this word can take you home)' : 'Hop'}>
                    {isHomeDoor && readiness.ready ? <Icon name="home" size="1.15rem" strokeWidth={2.4} /> : <Icon name="hop" size="1.15rem" strokeWidth={2.4} />}
                    Hop
                  </button>
                </div>
                {bonus && door.tier !== 'crumb' && (
                  <div className="bonus-hint">
                    <span>With the reference:</span>
                    <span>book <b>{bonus.book}</b></span>
                    <span>chapter <b>{bonus.chapter}</b></span>
                    <span>verse <b>{bonus.exact}</b></span>
                    {j.features.concordance && (
                      <button className="link" style={{ all: 'unset', cursor: 'pointer', marginLeft: 'auto', color: 'var(--accent)', fontWeight: 600, textDecoration: 'underline' }} onClick={() => { press(); setConcordance(true); }}>
                        Concordance
                      </button>
                    )}
                  </div>
                )}
                {bonus && door.tier === 'crumb' && j.features.concordance && (
                  <div className="bonus-hint">
                    <button className="link" style={{ all: 'unset', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600, textDecoration: 'underline' }} onClick={() => { press(); setConcordance(true); }}>
                      Concordance
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {coach && coachNow && stillPlaying && (
        <div className="coach" style={{ bottom: door ? 'auto' : `calc(7.2rem + var(--safe-b))`, top: door ? 'calc(var(--safe-t) + 6.4rem)' : 'auto' }}>
          <div className="coach-card" role="status">
            <span dangerouslySetInnerHTML={{ __html: coachNow.text }} />
            <div className="row">
              <span className="steps-dots" aria-hidden="true">
                {coach.steps.map((_, i) => <i key={i} className={i <= coachStep ? 'on' : ''} />)}
              </span>
              <button className="link" onClick={() => { press(); coach.onSkip(); }}>Skip the guide</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        pending={pendingConfirm}
        busy={busy}
        onPick={(choice) => {
          press();
          void run(() => api.confirm(ref, choice));
        }}
      />
      <GraceModal
        pending={pendingGrace}
        busy={busy}
        onDecide={(use) => {
          press();
          void run(() => api.grace(ref, use));
        }}
      />
      <LookBackModal
        open={lookBack}
        j={j}
        busy={busy}
        onClose={() => setLookBack(false)}
        onConfirm={() => {
          setLookBack(false);
          void run(() => api.lookBack(ref));
        }}
      />
      <StatusModal
        open={status}
        j={j}
        onClose={() => setStatus(false)}
        onMode={(mode) => {
          press();
          void run(() => api.mode(ref, mode));
        }}
      />
      <ReportModal
        open={report}
        onClose={() => setReport(false)}
        onSend={(comment) => {
          setReport(false);
          if (reportable === null) return;
          api.report(j.id, reportable, comment).then(() => toast('Thanks. A Scribe will look at it.')).catch((e) => toast(e.message));
          setReportable(null);
        }}
      />
      {j.features.concordance && door && (
        <ConcordanceModal
          open={concordance}
          journeyId={j.id}
          door={door.key}
          onClose={() => setConcordance(false)}
          onUse={(text) => {
            setConcordance(false);
            setTyped(text);
            window.setTimeout(() => verseBox.current?.focus(), 50);
          }}
        />
      )}
    </div>
  );
}
