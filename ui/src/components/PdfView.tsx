// Center panel: renders /latest.pdf with pdf.js (canvas + selectable text
// layer), re-renders on WS reload, and hosts the LiquidText-style interaction:
// select text on a page → floating "Comment" composer → anchored highlight.
// Highlights are stored at scale 1 and projected by the current SCALE.
import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { createComment, type Comment } from '../api';
import { normalize, phrase } from '../sync';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const SCALE = 1.5;

interface Draft { page: number; quote: string; rects: { x: number; y: number; w: number; h: number }[]; x: number; y: number }
interface SyncTarget { text: string; nonce: number }

export function PdfView({
  reloadTick, comments, onPages, onSelectComment, onSyncToSource, syncTarget,
}: {
  reloadTick: number;
  comments: Comment[];
  onPages?: (n: number) => void;
  onSelectComment?: (id: string) => void;
  onSyncToSource?: (text: string) => void;
  syncTarget?: SyncTarget | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState<string>('waiting for first compile…');
  const [renderTick, setRenderTick] = useState(0); // bumps after pages exist in the DOM
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftText, setDraftText] = useState('');

  // ── Render PDF pages (canvas + text layer) ──────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const container = pagesRef.current;
      const scroller = scrollRef.current;
      if (!container || !scroller) return;
      const res = await fetch('/latest.pdf?t=' + Date.now());
      if (!res.ok) { setNote('No PDF yet — ask Claude to render a preview.'); return; }
      const data = new Uint8Array(await res.arrayBuffer());
      const doc = await pdfjs.getDocument({ data }).promise;
      if (cancelled) return;
      const scroll = scroller.scrollTop;
      // Render every page off-screen, then swap them in at once — the previous
      // PDF stays visible until the new one is ready, so there is no blank flash
      // between recompiles.
      const next = document.createDocumentFragment();
      for (let i = 1; i <= doc.numPages; i++) {
        const pg = await doc.getPage(i);
        if (cancelled) return;
        const vp = pg.getViewport({ scale: SCALE });
        const wrap = document.createElement('div');
        wrap.className = 'page';
        wrap.dataset.page = String(i);
        wrap.style.width = `${vp.width}px`;
        wrap.style.height = `${vp.height}px`;
        wrap.style.setProperty('--scale-factor', String(SCALE));
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        wrap.appendChild(canvas);
        const textDiv = document.createElement('div');
        textDiv.className = 'textLayer';
        wrap.appendChild(textDiv);
        const hlDiv = document.createElement('div');
        hlDiv.className = 'hl-layer';
        wrap.appendChild(hlDiv);
        next.appendChild(wrap);
        await pg.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
        const textLayer = new pdfjs.TextLayer({ textContentSource: pg.streamTextContent(), container: textDiv, viewport: vp });
        await textLayer.render();
      }
      if (cancelled) return;
      container.replaceChildren(next);
      setNote('');
      onPages?.(doc.numPages);
      setRenderTick((t) => t + 1);
      scroller.scrollTop = scroll;
    })().catch((e) => setNote('render failed: ' + String(e)));
    return () => { cancelled = true; };
  }, [reloadTick]);

  // ── Project highlights onto pages ───────────────────────────────────────
  useEffect(() => {
    const container = pagesRef.current;
    if (!container) return;
    for (const layer of container.querySelectorAll('.hl-layer')) layer.innerHTML = '';
    for (const c of comments) {
      const layer = container.querySelector(`.page[data-page="${c.page}"] .hl-layer`);
      if (!layer) continue;
      for (const r of c.rects) {
        const el = document.createElement('div');
        el.className = `hl ${c.status === 'resolved' ? 'hl-resolved' : ''}`;
        el.dataset.id = c.id;
        el.title = c.text;
        el.style.left = `${r.x * SCALE}px`;
        el.style.top = `${r.y * SCALE}px`;
        el.style.width = `${r.w * SCALE}px`;
        el.style.height = `${r.h * SCALE}px`;
        el.addEventListener('click', () => onSelectComment?.(c.id));
        layer.appendChild(el);
      }
    }
  }, [comments, renderTick]);

  // ── Click a word (no selection) → jump to that text in the source ───────
  const onClick = (e: React.MouseEvent) => {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return; // a drag-select is a comment, not a sync
    const span = (e.target as HTMLElement).closest('.textLayer span') as HTMLElement | null;
    if (!span || !onSyncToSource) return;
    // Build a phrase from the clicked span plus the following few, so a single
    // short word still yields something distinctive to search for.
    let text = span.textContent ?? '';
    let n = span.nextElementSibling;
    while (n && normalize(text).split(' ').filter(Boolean).length < 6) {
      text += ' ' + (n.textContent ?? '');
      n = n.nextElementSibling;
    }
    if (normalize(text)) onSyncToSource(text);
  };

  // ── Source → PDF: scroll the matching page/word into view and flash it ──
  useEffect(() => {
    const container = pagesRef.current;
    if (!container || !syncTarget) return;
    const target = phrase(syncTarget.text, 6);
    if (!target) return;
    for (const page of container.querySelectorAll('.page')) {
      const spans = Array.from(page.querySelectorAll('.textLayer span')) as HTMLElement[];
      // Concatenate the page's spans with an offset→span map, then find the phrase.
      let concat = '';
      const map: { start: number; el: HTMLElement }[] = [];
      for (const s of spans) {
        const norm = normalize(s.textContent ?? '');
        if (!norm) continue;
        map.push({ start: concat.length, el: s });
        concat += norm + ' ';
      }
      const at = concat.indexOf(target);
      if (at < 0) continue;
      const hit = [...map].reverse().find((m) => m.start <= at)?.el ?? spans[0];
      hit.scrollIntoView({ behavior: 'smooth', block: 'center' });
      hit.classList.add('sync-flash');
      setTimeout(() => hit.classList.remove('sync-flash'), 1400);
      break;
    }
  }, [syncTarget]);

  // ── Selection → comment composer ────────────────────────────────────────
  const onMouseUp = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const quote = sel.toString().trim();
    if (!quote) return;
    const range = sel.getRangeAt(0);
    const pageEl = (range.startContainer.parentElement as HTMLElement | null)?.closest('.page') as HTMLElement | null;
    if (!pageEl || !scrollRef.current) return;
    const pageRect = pageEl.getBoundingClientRect();
    const rects = Array.from(range.getClientRects())
      .filter((r) => r.width > 1 && r.height > 1)
      .filter((r) => r.left >= pageRect.left - 2 && r.right <= pageRect.right + 2 && r.top >= pageRect.top - 2 && r.bottom <= pageRect.bottom + 2)
      .slice(0, 40)
      .map((r) => ({ x: (r.left - pageRect.left) / SCALE, y: (r.top - pageRect.top) / SCALE, w: r.width / SCALE, h: r.height / SCALE }));
    if (!rects.length) return;
    const scroller = scrollRef.current;
    const scRect = scroller.getBoundingClientRect();
    const last = range.getClientRects()[range.getClientRects().length - 1];
    // Position in the scroller's content space (it is position:relative), pinned
    // near the end of the selection and clamped to the visible viewport so the
    // composer never lands off-screen.
    const rawX = last.right - scRect.left + scroller.scrollLeft;
    const rawY = last.bottom - scRect.top + scroller.scrollTop + 6;
    const x = Math.max(scroller.scrollLeft + 8, Math.min(rawX, scroller.scrollLeft + scroller.clientWidth - 316));
    const y = Math.min(rawY, scroller.scrollTop + scroller.clientHeight - 40);
    setDraft({ page: Number(pageEl.dataset.page), quote: quote.slice(0, 600), rects, x, y });
    setDraftText('');
  };

  const submitDraft = async () => {
    if (!draft || !draftText.trim()) return;
    await createComment({ page: draft.page, quote: draft.quote, rects: draft.rects, text: draftText.trim() });
    setDraft(null);
    window.getSelection()?.removeAllRanges();
  };

  return (
    <div className="pdf-scroll" ref={scrollRef} onMouseUp={onMouseUp} onClick={onClick}>
      {note && <div className="pdf-note">{note}</div>}
      <div className="pdf-pages" ref={pagesRef} />
      {draft && (
        <div className="composer" style={{ left: draft.x, top: draft.y }} onMouseUp={(e) => e.stopPropagation()}>
          <div className="composer-quote">“{draft.quote.slice(0, 120)}{draft.quote.length > 120 ? '…' : ''}”</div>
          <textarea
            autoFocus
            placeholder="Comment for Claude… (e.g. tighten this paragraph)"
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void submitDraft(); if (e.key === 'Escape') setDraft(null); }}
          />
          <div className="composer-actions">
            <button className="ghost" onClick={() => setDraft(null)}>Cancel</button>
            <button className="on" disabled={!draftText.trim()} onClick={() => void submitDraft()}>💬 Add comment</button>
          </div>
        </div>
      )}
    </div>
  );
}
