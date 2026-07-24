// The workspace shell: toolbar on top; left tabbed panel (Source | History);
// PDF center with anchored comments; Comments workspace on the right.
import { useCallback, useEffect, useState } from 'react';
import { fetchComments, useLive, type Comment } from './api';
import { Toolbar } from './components/Toolbar';
import { PdfView } from './components/PdfView';
import { HistoryPanel } from './components/HistoryPanel';
import { SourcePanel } from './components/SourcePanel';
import { CommentsPanel } from './components/CommentsPanel';

type LeftTab = 'source' | 'history';

export default function App() {
  const [comments, setComments] = useState<Comment[]>([]);
  const [selectedComment, setSelectedComment] = useState<string | null>(null);
  const [leftTab, setLeftTab] = useState<LeftTab>('history');
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(false);
  const [pages, setPages] = useState(0);

  const refreshComments = useCallback(() => { fetchComments().then(setComments).catch(() => {}); }, []);
  useEffect(() => { refreshComments(); }, [refreshComments]);

  const { status, errorLog, reloadTick, pdfName } = useLive((m) => {
    if (m.type === 'comments-changed') { refreshComments(); setRightOpen(true); }
  });

  const jumpToComment = useCallback((c: Comment) => {
    setSelectedComment(c.id);
    const hl = document.querySelector(`.hl[data-id="${c.id}"]`) ?? document.querySelector(`.page[data-page="${c.page}"]`);
    hl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    for (const el of document.querySelectorAll(`.hl[data-id="${c.id}"]`)) {
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 1600);
    }
  }, []);

  const onSelectFromPdf = useCallback((id: string) => { setSelectedComment(id); setRightOpen(true); }, []);

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
          <PdfView reloadTick={reloadTick} comments={comments} onPages={setPages} onSelectComment={onSelectFromPdf} />
        </div>

        <div className={`right ${rightOpen ? '' : 'closed'}`}>
          <div className="tabs">
            <strong className="tab-title">Comments</strong>
            <span className="spacer" />
            <button className="ghost" onClick={() => setRightOpen(false)} title="Collapse">»</button>
          </div>
          <CommentsPanel comments={comments} selectedId={selectedComment} onJump={jumpToComment} />
        </div>
        {!rightOpen && (
          <button className="edge-open right-edge" onClick={() => setRightOpen(true)} title="Comments">
            💬{comments.filter((c) => c.status === 'pending').length > 0 ? ` ${comments.filter((c) => c.status === 'pending').length}` : ''}
          </button>
        )}
      </div>
    </div>
  );
}
