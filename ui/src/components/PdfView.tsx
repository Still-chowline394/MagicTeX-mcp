// Center panel: renders /latest.pdf with pdf.js (canvas + selectable text
// layer), re-renders on WS reload, and hosts the LiquidText-style interaction:
// select text on a page → floating "Comment" composer → anchored highlight.
// A control strip provides Overleaf-style zoom + page navigation; the render
// scale is state, and highlights are stored at scale 1 and projected by it.
import { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { createComment, type Comment } from '../api';
import { normalize, phrase } from '../sync';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const MIN_SCALE = 0.4;
const MAX_SCALE = 3;

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
  const [scale, setScale] = useState(1.5);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const baseWidth = useRef(0); // page-1 width at scale 1, for fit-to-width
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

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
      // Preserve scroll position as a ratio so zoom keeps you in place.
      const ratio = scroller.scrollHeight ? scroller.scrollTop / scroller.scrollHeight : 0;
      // Render every page off-screen, then swap in at once — no blank flash.
      const next = document.createDocumentFragment();
      for (let i = 1; i <= doc.numPages; i++) {
        const pg = await doc.getPage(i);
        if (cancelled) return;
        if (i === 1) baseWidth.current = pg.getViewport({ scale: 1 }).width;
        const vp = pg.getViewport({ scale: scaleRef.current });
        const wrap = document.createElement('div');
        wrap.className = 'page';
        wrap.dataset.page = String(i);
        wrap.style.width = `${vp.width}px`;
        wrap.style.height = `${vp.height}px`;
        wrap.style.setProperty('--scale-factor', String(scaleRef.current));
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
      setNumPages(doc.numPages);
      onPages?.(doc.numPages);
      setRenderTick((t) => t + 1);
      scroller.scrollTop = ratio * scroller.scrollHeight;
    })().catch((e) => setNote('render failed: ' + String(e)));
    return () => { cancelled = true; };
  }, [reloadTick, scale, onPages]);

  // ── Track which page is in view (for the page indicator) ────────────────
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const mid = scroller.scrollTop + scroller.clientHeight / 2;
        let best = 1;
        for (const page of pagesRef.current?.querySelectorAll('.page') ?? []) {
          const el = page as HTMLElement;
          if (el.offsetTop <= mid) best = Number(el.dataset.page);
        }
        setCurrentPage(best);
      });
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => { scroller.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
  }, [renderTick]);

  const zoomBy = (f: number) => setScale((s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, +(s * f).toFixed(3))));
  const fitWidth = () => {
    const scroller = scrollRef.current;
    if (!scroller || !baseWidth.current) return;
    setScale(Math.min(MAX_SCALE, Math.max(MIN_SCALE, +((scroller.clientWidth - 40) / baseWidth.current).toFixed(3))));
  };
  const goToPage = (n: number) => {
    const p = Math.min(Math.max(1, n), numPages || 1);
    pagesRef.current?.querySelector(`.page[data-page="${p}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ── Click a word (no selection) → jump to that text in the source ───────
  const onClick = (e: React.MouseEvent) => {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return; // a drag-select is a comment, not a sync
    const span = (e.target as HTMLElement).closest('.textLayer span') as HTMLElement | null;
    if (!span || !onSyncToSource) return;
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

  // ── Project highlights onto pages ───────────────────────────────────────
  useEffect(() => {
    const container = pagesRef.current;
    if (!container) return;
    for (const layer of container.querySelectorAll('.hl-layer')) layer.innerHTML = '';

    const box = (layer: Element, c: Comment, statusCls: string, left: number, top: number, w: number, h: number) => {
      const el = document.createElement('div');
      el.className = `hl ${statusCls}`;
      el.dataset.id = c.id;
      el.title = c.text;
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      el.addEventListener('click', () => onSelectComment?.(c.id));
      layer.appendChild(el);
    };

    // Re-anchor a quote onto a page's *live* text layer, returning boxes at the
    // current glyph positions — so a highlight follows the text through
    // recompiles/reflows instead of sitting at frozen coordinates. We anchor by a
    // head phrase and a tail phrase (not the whole quote), and try progressively
    // shorter phrases (8→3 words) so it still lands when the AI rewrote words near
    // an edge; only if even a 3-word head is gone do we give up (→ null) and let
    // the caller fall back to the stored rects.
    const anchor = (concat: string, words: string[], fromStart: boolean): number => {
      for (const n of [8, 6, 4, 3]) {
        const ph = (fromStart ? words.slice(0, n) : words.slice(-n)).join(' ');
        if (words.length < n && n > 3) continue; // don't retry the same whole-string phrase
        const idx = fromStart ? concat.indexOf(ph) : concat.lastIndexOf(ph);
        if (idx >= 0) return fromStart ? idx : idx + ph.length;
      }
      return -1;
    };
    const liveBoxes = (page: Element, quote: string): { l: number; t: number; w: number; h: number }[] | null => {
      const norm = normalize(quote);
      if (!norm) return null;
      const words = norm.split(' ').filter(Boolean);
      let concat = '';
      const map: { start: number; len: number; el: HTMLElement }[] = [];
      for (const s of page.querySelectorAll('.textLayer span')) {
        const n = normalize((s as HTMLElement).textContent ?? '');
        if (!n) continue;
        map.push({ start: concat.length, len: n.length, el: s as HTMLElement });
        concat += n + ' ';
      }
      const at = anchor(concat, words, true);
      if (at < 0) return null;
      const tailEnd = anchor(concat, words, false);
      const end = tailEnd > at ? tailEnd : Math.min(concat.length, at + norm.length);
      // Collect the matched word spans, then MERGE them per visual line into one
      // continuous box each (a highlighter stroke over whole lines), instead of a
      // choppy box per word. Same line = tops within ~60% of the line height.
      const spans: { l: number; t: number; w: number; h: number }[] = [];
      for (const m of map) {
        if (m.start < end && m.start + m.len > at) spans.push({ l: m.el.offsetLeft, t: m.el.offsetTop, w: m.el.offsetWidth, h: m.el.offsetHeight });
      }
      if (!spans.length) return null;
      spans.sort((a, b) => a.t - b.t || a.l - b.l);
      // "Same line" = the new span's vertical range overlaps the accumulated
      // line's range — NOT how close their tops are. Italic runs, inline math,
      // and sub/superscripts get taller or shifted bounding boxes from pdf.js
      // than the surrounding roman text even on the same baseline, so a
      // top-distance check splits them into their own tiny box; an overlap
      // check tolerates that and still keeps genuinely different lines apart
      // (real line gaps are ~a full font-size, far bigger than any overlap).
      const lines: { l: number; t: number; r: number; b: number }[] = [];
      for (const s of spans) {
        const cur = lines[lines.length - 1];
        const overlap = cur ? Math.min(s.t + s.h, cur.b) - Math.max(s.t, cur.t) : -1;
        if (cur && overlap > Math.min(s.h, cur.b - cur.t) * 0.3) {
          cur.l = Math.min(cur.l, s.l); cur.r = Math.max(cur.r, s.l + s.w);
          cur.t = Math.min(cur.t, s.t); cur.b = Math.max(cur.b, s.t + s.h);
        } else {
          lines.push({ l: s.l, t: s.t, r: s.l + s.w, b: s.t + s.h });
        }
      }
      return lines.map((L) => ({ l: L.l, t: L.t, w: L.r - L.l, h: L.b - L.t }));
    };

    for (const c of comments) {
      // pending → yellow, suggested → purple dashed, resolved → GREEN (the AI
      // did it, awaiting your review). Closing a resolved comment removes it and
      // its highlight — that's the "human-confirmed" step, so colors don't pile up.
      const statusCls = c.status === 'resolved' ? 'hl-resolved' : c.status === 'suggested' ? 'hl-suggested' : '';
      if (c.rects.length) {
        // Prefer re-anchoring onto the live text so the box tracks reflow; only
        // fall back to the frozen rects (projected by scale) if the text is gone.
        const pageEl = container.querySelector(`.page[data-page="${c.page}"]`);
        const layer = pageEl?.querySelector('.hl-layer');
        if (!layer) continue;
        const boxes = liveBoxes(pageEl!, c.quote);
        if (boxes) for (const b of boxes) box(layer, c, statusCls, b.l, b.t, b.w, b.h);
        else for (const r of c.rects) box(layer, c, statusCls, r.x * scale, r.y * scale, r.w * scale, r.h * scale);
        continue;
      }
      // Reviewer/agent comment posted without PDF coords → find the quote anywhere.
      for (const page of container.querySelectorAll('.page')) {
        const boxes = liveBoxes(page, c.quote);
        if (!boxes) continue;
        const layer = page.querySelector('.hl-layer')!;
        for (const b of boxes) box(layer, c, statusCls, b.l, b.t, b.w, b.h);
        break;
      }
    }
  }, [comments, renderTick, scale, onSelectComment]);

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
      .map((r) => ({ x: (r.left - pageRect.left) / scale, y: (r.top - pageRect.top) / scale, w: r.width / scale, h: r.height / scale }));
    if (!rects.length) return;
    const scroller = scrollRef.current;
    const scRect = scroller.getBoundingClientRect();
    const last = range.getClientRects()[range.getClientRects().length - 1];
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

  const pct = Math.round(scale * 100);

  return (
    <div className="pdf-wrap">
      <div className="pdf-toolbar">
        <div className="pager">
          <button className="ghost" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} title="Previous page">▲</button>
          <input
            className="page-input"
            value={currentPage}
            onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, '')); if (n) setCurrentPage(n); }}
            onKeyDown={(e) => { if (e.key === 'Enter') goToPage(currentPage); }}
            onBlur={() => goToPage(currentPage)}
          />
          <span className="of">/ {numPages || '—'}</span>
          <button className="ghost" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= numPages} title="Next page">▼</button>
        </div>
        <span className="spacer" />
        <div className="zoom">
          <button className="ghost" onClick={() => zoomBy(1 / 1.1)} disabled={scale <= MIN_SCALE} title="Zoom out">−</button>
          <button className="zoom-val" onClick={fitWidth} title="Fit to width">{pct}%</button>
          <button className="ghost" onClick={() => zoomBy(1.1)} disabled={scale >= MAX_SCALE} title="Zoom in">+</button>
        </div>
      </div>
      <div className="pdf-scroll" ref={scrollRef} onMouseUp={onMouseUp} onClick={onClick}>
        {note && <div className="pdf-note">{note}</div>}
        <div className="pdf-pages" ref={pagesRef} />
        {draft && (
          <div className="composer" style={{ left: draft.x, top: draft.y }} onMouseUp={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
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
    </div>
  );
}
