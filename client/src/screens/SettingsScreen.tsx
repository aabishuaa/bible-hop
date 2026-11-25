// Settings (rule 14.7): the display wording, word values, text size, reduced motion and the
// Sabbath Rest day, plus sound, feel, and the player's account.
import { useState } from 'react';
import type { TodayView } from '../../../shared/types.ts';
import { ApiError, api } from '../api.ts';
import { useApp } from '../app-store.ts';
import { haptics } from '../fx/haptics.ts';
import { sound } from '../fx/sound.ts';
import { usePrefs } from '../prefs.ts';
import { navigate } from '../router.ts';
import { Modal, press, useDocumentTitle } from '../ui/base.tsx';
import { Icon } from '../ui/icons.tsx';

export function SettingsScreen({ today }: { today: TodayView }) {
  useDocumentTitle('Settings');
  const prefs = usePrefs();
  const setToday = useApp((s) => s.setToday);
  const toast = useApp((s) => s.toast);
  const p = today.player;
  const [account, setAccount] = useState<'register' | 'login' | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = async (s: { restDay?: number; wording?: string }) => {
    try {
      const r = await api.settings(s);
      setToday({ ...today, player: r.player });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not save that.');
    }
  };
  const submitAccount = async () => {
    setBusy(true);
    setErr('');
    try {
      if (account === 'register') await api.register(name, password);
      else {
        const r = await api.login(name, password);
        for (const n of r.notices) toast(n);
      }
      setAccount(null);
      setPassword('');
      toast(account === 'register' ? 'Your account is ready. Your progress now follows you.' : `Welcome back, ${name}.`);
      await useApp.getState().loadToday();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen leather">
      <header className="bar bar-top">
        <div className="topbar">
          <button className="icon-btn" onClick={() => { press(); navigate('/'); }} aria-label="Back to today"><Icon name="lookback" size="1.3rem" /></button>
          <div className="title">Settings</div>
        </div>
      </header>
      <div className="page-wrap">
        <div className="sheet-page">
          <h2 className="display" style={{ marginTop: 0 }}>Reading</h2>
          <div className="card cream">
            {today.features.wordingSwitch && (
              <div className="set-row">
                <div className="txt"><b>Wording</b><span>Which wording the pages show. Both are always in play.</span></div>
                <div className="seg" role="group" aria-label="Wording">
                  <button aria-pressed={p.wording === 'kjv'} onClick={() => { press(); void save({ wording: 'kjv' }); }}>KJV</button>
                  <button aria-pressed={p.wording === 'web'} onClick={() => { press(); void save({ wording: 'web' }); }}>WEB</button>
                </div>
              </div>
            )}
            <div className="set-row">
              <div className="txt"><b>Show word values</b><span>Mark every open word with its kind. Off shows them only when you tap a word.</span></div>
              <label className="switch"><input type="checkbox" checked={prefs.showValues} onChange={(e) => { press(); prefs.set({ showValues: e.target.checked }); }} aria-label="Show word values" /><span /></label>
            </div>
            <div className="set-row">
              <div className="txt"><b>Text size</b><span>{Math.round(prefs.textSize * 100)}%</span></div>
              <input type="range" min={0.85} max={2} step={0.05} value={prefs.textSize} onChange={(e) => prefs.set({ textSize: Number(e.target.value) })} aria-label="Text size" />
            </div>
            <div className="set-row">
              <div className="txt"><b>Motion</b><span>Page turns and other movement. &ldquo;Auto&rdquo; follows your device.</span></div>
              <div className="seg" role="group" aria-label="Motion">
                {(['auto', 'full', 'reduced'] as const).map((m) => <button key={m} aria-pressed={prefs.motion === m} onClick={() => { press(); prefs.set({ motion: m }); }}>{m}</button>)}
              </div>
            </div>
          </div>

          <h2 className="display">Sound and feel</h2>
          <div className="card cream">
            <div className="set-row">
              <div className="txt"><b>Sound</b><span>Page turns, bells for pearls, the rooster.</span></div>
              <label className="switch"><input type="checkbox" checked={prefs.sound} onChange={(e) => { prefs.set({ sound: e.target.checked }); if (e.target.checked) { sound.unlock(); window.setTimeout(() => sound.land('fish'), 50); } }} aria-label="Sound" /><span /></label>
            </div>
            <div className="set-row">
              <div className="txt"><b>Volume</b></div>
              <input type="range" min={0} max={1} step={0.05} value={prefs.volume} onChange={(e) => prefs.set({ volume: Number(e.target.value) })} onPointerUp={() => { sound.unlock(); sound.door('pearl'); }} aria-label="Volume" />
            </div>
            <div className="set-row">
              <div className="txt"><b>Feel it</b><span>A tick for every page as it turns, where your device allows it.</span></div>
              <label className="switch"><input type="checkbox" checked={prefs.haptics} onChange={(e) => { prefs.set({ haptics: e.target.checked }); if (e.target.checked) haptics.flip(3, 120, 400, 'fish'); }} aria-label="Haptics" /><span /></label>
            </div>
          </div>

          <h2 className="display">Sabbath rest</h2>
          <div className="card cream">
            <div className="set-row">
              <div className="txt"><b>Rest day</b><span>One day a week you can miss without breaking your streak. Winning on it still counts.</span></div>
              <div className="seg" role="group" aria-label="Rest day">
                <button aria-pressed={p.restDay === 0} onClick={() => { press(); void save({ restDay: 0 }); }}>Sun</button>
                <button aria-pressed={p.restDay === 6} onClick={() => { press(); void save({ restDay: 6 }); }}>Sat</button>
                <button aria-pressed={p.restDay === -1} onClick={() => { press(); void save({ restDay: -1 }); }}>None</button>
              </div>
            </div>
          </div>

          <h2 className="display">Account</h2>
          <div className="card cream">
            {p.guest ? (
              <>
                <p className="small">You are playing as a guest. Your progress is kept on this device. Sign in to keep your Treasure, streak and history across devices.</p>
                <div className="actions two" style={{ marginTop: '0.8rem' }}>
                  <button className="btn ghost" onClick={() => { press(); setAccount('login'); setErr(''); }}>Sign in</button>
                  <button className="btn" onClick={() => { press(); setAccount('register'); setErr(''); }}>Create account</button>
                </div>
              </>
            ) : (
              <>
                <p className="small">Signed in as <b>{p.name}</b>.{p.scribe ? ' You are a Scribe: your daily journeys are left out of the public statistics.' : ''}</p>
                <div className="actions two" style={{ marginTop: '0.8rem' }}>
                  <button className="btn ghost" onClick={() => { press(); api.logout().then(() => useApp.getState().loadToday()).then(() => toast('Signed out.')); }}>Sign out</button>
                  <button className="btn ghost" style={{ color: 'var(--red)' }} onClick={() => { press(); setConfirmDelete(true); }}>Delete account</button>
                </div>
              </>
            )}
            <p className="small muted" style={{ marginTop: '0.9rem' }}>
              Verses you type may be sent to an AI service to check which verse you meant, when the game cannot tell on its own. Nothing you type is shown to other players.
            </p>
          </div>

          <div className="actions" style={{ marginTop: '1.5rem' }}>
            <button className="btn ghost" onClick={() => { press(); navigate('/how'); }}><Icon name="book" size="1rem" /> How to play</button>
            {p.scribe || location.search.includes('desk') ? <button className="btn ghost" onClick={() => navigate('/desk')}>The Scribe&rsquo;s Desk</button> : null}
          </div>
        </div>
      </div>

      <Modal open={!!account} onClose={() => setAccount(null)} label={account === 'register' ? 'Create account' : 'Sign in'}>
        <h2>{account === 'register' ? <>Create an <em>account</em></> : <>Sign <em>in</em></>}</h2>
        <p className="lead small">{account === 'register' ? 'A name and a password. No email needed.' : 'Your guest progress joins your account.'}</p>
        <form onSubmit={(e) => { e.preventDefault(); void submitAccount(); }} style={{ display: 'grid', gap: '0.7rem', marginTop: '1rem' }}>
          <div>
            <label className="field-label" htmlFor="acct-name">Name</label>
            <input id="acct-name" className="field" autoComplete="username" value={name} onChange={(e) => setName(e.target.value)} data-autofocus />
          </div>
          <div>
            <label className="field-label" htmlFor="acct-pass">Password</label>
            <input id="acct-pass" className="field" type="password" autoComplete={account === 'register' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {err && <div className="msg-line bad" role="alert">{err}</div>}
          <div className="actions two" style={{ marginTop: '0.4rem' }}>
            <button type="button" className="btn ghost" onClick={() => setAccount(null)}>Cancel</button>
            <button type="submit" className="btn" disabled={busy}>{account === 'register' ? 'Create' : 'Sign in'}</button>
          </div>
        </form>
      </Modal>
      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} label="Delete account" center>
        <h2>Delete your <em>account</em>?</h2>
        <p className="lead">Your journeys, Treasure, streak and everything you typed are deleted for good.</p>
        <div className="actions two">
          <button className="btn ghost" data-autofocus onClick={() => setConfirmDelete(false)}>Keep it</button>
          <button className="btn" style={{ background: 'var(--red)' }} onClick={() => { api.deleteAccount().then(() => { setConfirmDelete(false); toast('Your account was deleted.'); return useApp.getState().loadToday(); }); }}>Delete</button>
        </div>
      </Modal>
    </div>
  );
}
