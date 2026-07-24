// The human-facing preview page. Loads pdf.js from the local server (offline,
// CSP-safe — no CDN), renders /latest.pdf, and re-renders on a WebSocket "reload"
// push, preserving scroll position for continuity between compiles.
export function viewerPageHtml(): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>LaTeX Live Preview</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; background: #525659; font-family: system-ui, sans-serif; }
  #bar { position: sticky; top: 0; display: flex; align-items: center; gap: 12px;
         padding: 6px 12px; background: #333; color: #ddd; font-size: 13px; z-index: 10; }
  #status { padding: 2px 8px; border-radius: 3px; }
  #status.ok { color: #9f9; } #status.err { color: #f99; } #status.busy { color: #fd8; }
  #spacer { margin-left: auto; }
  button { font: inherit; font-size: 12px; color: #ddd; background: #4a4a4a; border: 1px solid #666;
           border-radius: 4px; padding: 4px 12px; cursor: pointer; }
  button:hover:not(:disabled) { background: #565656; }
  button:disabled { opacity: .5; cursor: default; }
  #err { white-space: pre-wrap; font-family: ui-monospace, monospace; font-size: 12px;
         color: #fbb; background: #3a2a2a; margin: 8px 12px; padding: 8px; border-radius: 4px; display: none; }
  #pages { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 12px; }
  canvas { box-shadow: 0 2px 12px rgba(0,0,0,.5); background: white; max-width: 100%; }
</style></head>
<body>
  <div id="bar">
    <strong>LaTeX Live Preview</strong>
    <span id="status" class="busy">connecting…</span>
    <span id="meta"></span>
    <span id="spacer"></span>
    <button id="download" disabled title="Download the compiled PDF">⤓ Download PDF</button>
  </div>
  <pre id="err"></pre>
  <div id="pages"></div>
<script type="module">
  import * as pdfjs from '/pdfjs/build/pdf.min.mjs';
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/build/pdf.worker.min.mjs';

  const statusEl = document.getElementById('status');
  const metaEl = document.getElementById('meta');
  const errEl = document.getElementById('err');
  const pagesEl = document.getElementById('pages');
  const downloadBtn = document.getElementById('download');

  function setStatus(cls, text) { statusEl.className = cls; statusEl.textContent = text; }

  // Download filename derived from the source main file (e.g. main.tex -> main.pdf).
  let pdfBase = 'preview';
  let hasPdf = false;
  downloadBtn.addEventListener('click', async () => {
    if (!hasPdf) return;
    const res = await fetch('/latest.pdf?t=' + Date.now());
    if (!res.ok) return;
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url; a.download = pdfBase + '.pdf';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  });

  async function render() {
    setStatus('busy', 'rendering…');
    const scrollY = window.scrollY;
    try {
      const res = await fetch('/latest.pdf?t=' + Date.now());
      if (!res.ok) { setStatus('err', 'no PDF yet'); return; }
      const buf = new Uint8Array(await res.arrayBuffer());
      const doc = await pdfjs.getDocument({ data: buf }).promise;
      pagesEl.innerHTML = '';
      for (let i = 1; i <= doc.numPages; i++) {
        const pg = await doc.getPage(i);
        const vp = pg.getViewport({ scale: 1.6 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width; canvas.height = vp.height;
        pagesEl.appendChild(canvas);
        await pg.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      }
      metaEl.textContent = doc.numPages + ' page' + (doc.numPages === 1 ? '' : 's');
      errEl.style.display = 'none';
      setStatus('ok', '✓ up to date');
      hasPdf = true; downloadBtn.disabled = false;
      window.scrollTo(0, scrollY);
    } catch (e) {
      setStatus('err', 'render failed');
      errEl.style.display = 'block';
      errEl.textContent = String(e);
    }
  }

  function connect() {
    const ws = new WebSocket('ws://' + location.host);
    ws.onopen = () => { setStatus('ok', 'connected'); render(); };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'reload') {
        if (msg.name) pdfBase = String(msg.name).split(/[\\\\/]/).pop().replace(/\\.tex$/i, '') || 'preview';
        render();
      }
      else if (msg.type === 'compile-error') {
        setStatus('err', '✖ compile error');
        errEl.style.display = 'block';
        errEl.textContent = msg.log || 'compile failed';
      } else if (msg.type === 'compiling') {
        setStatus('busy', 'compiling…');
      }
    };
    ws.onclose = () => { setStatus('err', 'disconnected'); setTimeout(connect, 1000); };
  }
  connect();
</script>
</body></html>`;
}
