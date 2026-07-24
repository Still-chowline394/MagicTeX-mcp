// The workspace shell: toolbar on top; left tabbed panel (Source | History);
// PDF center; Comments panel on the right (placeholder until P3).
import { useState } from 'react';
import { useLive } from './api';
import { Toolbar } from './components/Toolbar';
import { PdfView } from './components/PdfView';
import { HistoryPanel } from './components/HistoryPanel';
import { SourcePanel } from './components/SourcePanel';

type LeftTab = 'source' | 'history';

export default function App() {
  const { status, errorLog, reloadTick, pdfName } = useLive();
  const [leftTab, setLeftTab] = useState<LeftTab>('history');
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(false);
  const [pages, setPages] = useState(0);

  return (
    <div className="app">
      <Toolbar status={status} pages={pages} pdfName={pdfName} />
      <div className="layout">
        <div className={`left ${leftOpen ? '' : 'closed'}`}>
          <div className="tabs">
            <button className={leftTab === 'source' ? 'on' : ''} onClick={() => setLeftTab('source')}>Source</button>
            <button className={leftTab === 'history' ? 'on' : ''} onClick={() => setLeftTab('history')}>History</button>
            <span className="spacer" />
            <button className="ghost" onClick={() => setLeftOpen(false)} title="Collapse">«</button>
          </div>
          {leftTab === 'history' && <HistoryPanel reloadTick={reloadTick} />}
          {leftTab === 'source' && <SourcePanel />}
        </div>
        {!leftOpen && <button className="edge-open left-edge" onClick={() => setLeftOpen(true)} title="Open panel">»</button>}

        <div className="center">
          {errorLog && <pre className="compile-error">{errorLog}</pre>}
          <PdfView reloadTick={reloadTick} onPages={setPages} />
        </div>

        <div className={`right ${rightOpen ? '' : 'closed'}`}>
          <div className="tabs">
            <strong className="tab-title">Comments</strong>
            <span className="spacer" />
            <button className="ghost" onClick={() => setRightOpen(false)} title="Collapse">»</button>
          </div>
          <div className="panel-hint">Anchored comments arrive in a later phase.</div>
        </div>
        {!rightOpen && <button className="edge-open right-edge" onClick={() => setRightOpen(true)} title="Comments">💬</button>}
      </div>
    </div>
  );
}
