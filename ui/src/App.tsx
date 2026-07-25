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

// Minimum widths are measured, not guessed. The left panel carries fixed-size
// control rows, and the widest rigid one is the format bar: 15 buttons that
// cannot shrink or collapse, needing 375px. Below that the rows wrap and the
// controls scroll out of sight. 400 leaves margin for the file tree's header
// and the editor bar. The right panel is prose that reflows, so it goes lower.
// Keep MIN_LEFT in sync with --min-left in styles.css.
const MIN_LEFT = 400;
const MIN_RIGHT = 260;
const maxPanel = (min: number) => Math.max(min, Math.floor(window.innerWidth * 0.6));

/** Panel width with drag-resize support, persisted to localStorage. */
function usePanelWidth(key: string, initial: number, min: number) {
  const [width, setWidth] = useState(() => {
    const saved = Number(localStorage.getItem(key));
    // A width persisted by an older build can be narrower than today's minimum,
    // so clamp up rather than only rejecting non-numbers.
    if (!Number.isFinite(saved) || saved <= 0) return initial;
    return Math.min(Math.max(saved, min), maxPanel(min));
  });
  useEffect(() => { localStorage.setItem(key, String(width)); }, [key, width]);
  return [width, setWidth] as const;
}

/** Overleaf-style drag handle. `dir` is which side the panel sits on. */
function Splitter({ dir, width, setWidth, min }: { dir: 'left' | 'right'; width: number; setWidth: (w: number) => void; min: number }) {
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
        setWidth(Math.min(Math.max(next, min), maxPanel(min)));
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
  const [leftWidth, setLeftWidth] = usePanelWidth('ws-left-width', 420, MIN_LEFT);
  const [rightWidth, setRightWidth] = usePanelWidth('ws-right-width', 320, MIN_RIGHT);
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
    const hls = document.querySelectorAll(`.hl[data-id="${c.id}"]`);
    if (hls.length) {
      hls[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      for (const el of hls) { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600); }
    } else {
      // Resolved comments carry no highlight — locate the passage by text and flash it.
      setSyncToPdf({ text: c.quote, nonce: Date.now() });
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
        {leftOpen && <Splitter dir="left" width={leftWidth} setWidth={setLeftWidth} min={MIN_LEFT} />}
        {!leftOpen && <button className="edge-open left-edge" onClick={() => setLeftOpen(true)} title="Open panel">»</button>}

        <div className="center">
          {errorLog && <pre className="compile-error">{errorLog}</pre>}
          <ErrorBoundary name="PDF view">
            <PdfView reloadTick={reloadTick} comments={comments} onPages={setPages} onSelectComment={onSelectFromPdf} onSyncToSource={onSyncToSource} syncTarget={syncToPdf} />
          </ErrorBoundary>
        </div>

        {rightOpen && <Splitter dir="right" width={rightWidth} setWidth={setRightWidth} min={MIN_RIGHT} />}
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
