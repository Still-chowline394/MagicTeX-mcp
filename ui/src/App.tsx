// The workspace shell: toolbar on top; left tabbed panel (Source | History);
// PDF center with anchored comments; Comments workspace on the right. Both side
// panels resize with Overleaf-style drag splitters (widths persisted).
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchComments, useLive, type Comment } from './api';
import { Toolbar } from './components/Toolbar';
import { PdfView } from './components/PdfView';
import { HistoryPanel } from './components/HistoryPanel';
import { SourcePanel } from './components/SourcePanel';
import { CommentsPanel } from './components/CommentsPanel';
import { ErrorBoundary } from './components/ErrorBoundary';

type LeftTab = 'source' | 'history';

const MIN_PANEL = 220;
const maxPanel = () => Math.max(MIN_PANEL, Math.floor(window.innerWidth * 0.6));

/** Panel width with drag-resize support, persisted to localStorage. */
function usePanelWidth(key: string, initial: number) {
  const [width, setWidth] = useState(() => {
    const saved = Number(localStorage.getItem(key));
    return Number.isFinite(saved) && saved >= MIN_PANEL ? Math.min(saved, maxPanel()) : initial;
  });
  useEffect(() => { localStorage.setItem(key, String(width)); }, [key, width]);
  return [width, setWidth] as const;
}

/** Overleaf-style drag handle. `dir` is which side the panel sits on. */
function Splitter({ dir, width, setWidth }: { dir: 'left' | 'right'; width: number; setWidth: (w: number) => void }) {
  const drag = useRef<{ startX: number; startW: number } | null>(null);
  return (
    <div
      className="splitter"
      onPointerDown={(e) => {
        drag.current = { startX: e.clientX, startW: width };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        document.body.classList.add('resizing');
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const dx = e.clientX - drag.current.startX;
        const next = dir === 'left' ? drag.current.startW + dx : drag.current.startW - dx;
        setWidth(Math.min(Math.max(next, MIN_PANEL), maxPanel()));
      }}
      onPointerUp={(e) => {
        drag.current = null;
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
        document.body.classList.remove('resizing');
      }}
      title="Drag to resize"
    />
  );
}

export default function App() {
  const [comments, setComments] = useState<Comment[]>([]);
  const [selectedComment, setSelectedComment] = useState<string | null>(null);
  const [leftTab, setLeftTab] = useState<LeftTab>('history');
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(false);
  const [pages, setPages] = useState(0);
  const [leftWidth, setLeftWidth] = usePanelWidth('ws-left-width', 360);
  const [rightWidth, setRightWidth] = usePanelWidth('ws-right-width', 320);
  // Text-match sync between the PDF and the source editor (nonce forces re-fire
  // even when the same text is clicked twice).
  const [syncToSource, setSyncToSource] = useState<{ text: string; nonce: number } | null>(null);
  const [syncToPdf, setSyncToPdf] = useState<{ text: string; nonce: number } | null>(null);
  const onSyncToSource = useCallback((text: string) => {
    setLeftTab('source');
    setLeftOpen(true);
    setSyncToSource({ text, nonce: Date.now() });
  }, []);
  const onSyncToPdf = useCallback((text: string) => { setSyncToPdf({ text, nonce: Date.now() }); }, []);

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
      <Toolbar
        status={status} pages={pages} pdfName={pdfName} reloadTick={reloadTick}
        commentsOpen={rightOpen}
        openCount={comments.filter((c) => c.status !== 'resolved').length}
        onToggleComments={() => setRightOpen((o) => !o)}
      />
      <div className="layout">
        <div className={`left ${leftOpen ? '' : 'closed'}`} style={leftOpen ? { flexBasis: leftWidth } : undefined}>
          <div className="tabs">
            <button className={leftTab === 'source' ? 'on' : ''} onClick={() => setLeftTab('source')}>Source</button>
            <button className={leftTab === 'history' ? 'on' : ''} onClick={() => setLeftTab('history')}>History</button>
            <span className="spacer" />
            <button className="ghost" onClick={() => setLeftOpen(false)} title="Collapse">«</button>
          </div>
          {leftTab === 'history' && <ErrorBoundary name="History panel"><HistoryPanel reloadTick={reloadTick} /></ErrorBoundary>}
          {leftTab === 'source' && <ErrorBoundary name="Source editor"><SourcePanel reloadTick={reloadTick} syncTarget={syncToSource} onSyncToPdf={onSyncToPdf} /></ErrorBoundary>}
        </div>
        {leftOpen && <Splitter dir="left" width={leftWidth} setWidth={setLeftWidth} />}
        {!leftOpen && <button className="edge-open left-edge" onClick={() => setLeftOpen(true)} title="Open panel">»</button>}

        <div className="center">
          {errorLog && <pre className="compile-error">{errorLog}</pre>}
          <ErrorBoundary name="PDF view">
            <PdfView reloadTick={reloadTick} comments={comments} onPages={setPages} onSelectComment={onSelectFromPdf} onSyncToSource={onSyncToSource} syncTarget={syncToPdf} />
          </ErrorBoundary>
        </div>

        {rightOpen && <Splitter dir="right" width={rightWidth} setWidth={setRightWidth} />}
        <div className={`right ${rightOpen ? '' : 'closed'}`} style={rightOpen ? { flexBasis: rightWidth } : undefined}>
          <div className="tabs">
            <strong className="tab-title">Comments</strong>
            <span className="spacer" />
            <button className="ghost" onClick={() => setRightOpen(false)} title="Collapse">»</button>
          </div>
          <ErrorBoundary name="Comments panel">
            <CommentsPanel comments={comments} selectedId={selectedComment} onJump={jumpToComment} />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
