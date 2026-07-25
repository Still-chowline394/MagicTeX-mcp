import { useEffect, useState } from 'react';
import { fetchOverleafLink, fetchDocTitle, recompile, type Status } from '../api';

const STATUS_LABEL: Record<Status, string> = {
  connecting: 'connecting…',
  connected: 'connected',
  compiling: 'compiling…',
  ok: '✓ up to date',
  error: '✖ compile error',
  disconnected: 'disconnected',
};

export function Toolbar({
  status, pages, pdfName, reloadTick, commentsOpen, openCount, onToggleComments,
}: {
  status: Status; pages: number; pdfName: string; reloadTick: number;
  commentsOpen: boolean; openCount: number; onToggleComments: () => void;
}) {
  const [overleafUrl, setOverleafUrl] = useState<string | null>(null);
  const [hasPdf, setHasPdf] = useState(false);
  const [title, setTitle] = useState<string | null>(null);

  useEffect(() => { fetchOverleafLink().then(setOverleafUrl); }, []);
  useEffect(() => { if (status === 'ok') setHasPdf(true); }, [status]);
  // Refresh the \title after each compile (it may have been edited).
  useEffect(() => { fetchDocTitle().then(setTitle); }, [reloadTick]);
  const compiling = status === 'compiling';

  const downloadPdf = async () => {
    const res = await fetch('/latest.pdf?t=' + Date.now());
    if (!res.ok) return;
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url; a.download = `${pdfName}.pdf`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const exportZip = () => {
    const a = document.createElement('a');
    a.href = '/export.zip'; a.download = '';
    document.body.appendChild(a); a.click(); a.remove();
  };

  return (
    <div className="toolbar">
      <strong className="brand" title={title ?? undefined}>{title ?? 'LaTeX Workspace'}</strong>
      <button className="recompile on" onClick={() => void recompile()} disabled={compiling}
              title="Compile now">
        {compiling ? '⟳ Compiling…' : '⟳ Recompile'}
      </button>
      <span className={`status status-${status}`}>{STATUS_LABEL[status]}</span>
      {pages > 0 && <span className="meta">{pages} page{pages === 1 ? '' : 's'}</span>}
      <span className="spacer" />
      <button
        className={`comments-toggle ${commentsOpen ? 'on' : ''} ${openCount > 0 ? 'has-open' : ''}`}
        onClick={onToggleComments}
        title={commentsOpen ? 'Hide the comments panel' : 'Show the comments panel'}
      >
        💬 Comments{openCount > 0 ? ` · ${openCount}` : ''}
      </button>
      <button onClick={exportZip} title="Download a clean Overleaf-ready .zip (build inputs only)">⬆ Export .zip</button>
      <button onClick={downloadPdf} disabled={!hasPdf} title="Download the compiled PDF">⤓ Download PDF</button>
      {overleafUrl && (
        <a className="linkbtn" href={overleafUrl} target="_blank" rel="noopener"
           title="One-click open in Overleaf — works only if your GitHub repo is public">
          Open in Overleaf ↗
        </a>
      )}
    </div>
  );
}
