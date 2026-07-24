// Center panel: renders /latest.pdf with pdf.js, re-renders when reloadTick
// bumps (WS push after each successful compile), preserving scroll position.
import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const SCALE = 1.5;

export function PdfView({ reloadTick, onPages }: { reloadTick: number; onPages?: (n: number) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState<string>('waiting for first compile…');

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
      container.innerHTML = '';
      for (let i = 1; i <= doc.numPages; i++) {
        const pg = await doc.getPage(i);
        if (cancelled) return;
        const vp = pg.getViewport({ scale: SCALE });
        const wrap = document.createElement('div');
        wrap.className = 'page';
        wrap.dataset.page = String(i);
        wrap.style.width = `${vp.width}px`;
        wrap.style.height = `${vp.height}px`;
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        wrap.appendChild(canvas);
        container.appendChild(wrap);
        await pg.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
      }
      setNote('');
      onPages?.(doc.numPages);
      scroller.scrollTop = scroll;
    })().catch((e) => setNote('render failed: ' + String(e)));
    return () => { cancelled = true; };
  }, [reloadTick]);

  return (
    <div className="pdf-scroll" ref={scrollRef}>
      {note && <div className="pdf-note">{note}</div>}
      <div className="pdf-pages" ref={pagesRef} />
    </div>
  );
}
