import { navigate } from '../router.ts';
import { niceDate, press, useDocumentTitle } from '../ui/base.tsx';
import { Icon } from '../ui/icons.tsx';
import { Standings } from '../ui/Standings.tsx';

export function StandingsScreen({ date }: { date: string }) {
  useDocumentTitle('Standings');
  return (
    <div className="screen leather">
      <header className="bar bar-top">
        <div className="topbar">
          <button className="icon-btn" onClick={() => { press(); navigate('/'); }} aria-label="Back to today"><Icon name="lookback" size="1.3rem" /></button>
          <div className="title">Standings</div>
        </div>
      </header>
      <div className="page-wrap">
        <div className="sheet-page">
          <p className="eyebrow">{niceDate(date)}</p>
          <h1 className="display" style={{ marginTop: '0.4rem' }}>Where you <em>landed</em></h1>
          <Standings date={date} />
          <div className="actions"><button className="btn ghost" onClick={() => { press(); navigate('/'); }}>Back to today</button></div>
        </div>
      </div>
    </div>
  );
}
