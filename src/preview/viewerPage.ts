// The human-facing preview page. Loads pdf.js from the local server (offline,
// CSP-safe — no CDN), renders /latest.pdf, and re-renders on a WebSocket "reload"
// push, preserving scroll. A toggleable History panel shows the auto-checkpoints
// (git, hidden ref) and their diffs beside the live PDF.
export function viewerPageHtml(): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>LaTeX Live Preview</title>
<style>
  :root { color-scheme: light dark; }
  html, body { height: 100%; }
  body { margin: 0; background: #525659; font-family: system-ui, sans-serif; display: flex; flex-direction: column; }
  #bar { display: flex; align-items: center; gap: 12px; padding: 6px 12px; background: #333; color: #ddd; font-size: 13px; flex: 0 0 auto; }
  #status { padding: 2px 8px; border-radius: 3px; }
  #status.ok { color: #9f9; } #status.err { color: #f99; } #status.busy { color: #fd8; }
  #spacer { margin-left: auto; }
  button { font: inherit; font-size: 12px; color: #ddd; background: #4a4a4a; border: 1px solid #666;
           border-radius: 4px; padding: 4px 12px; cursor: pointer; }
  button:hover:not(:disabled) { background: #565656; }
  button:disabled { opacity: .5; cursor: default; }
  button.on { background: #2d6cdf; border-color: #2d6cdf; color: #fff; }
  #layout { flex: 1 1 auto; display: flex; min-height: 0; }
  #main { flex: 1 1 auto; overflow: auto; }
  #err { white-space: pre-wrap; font-family: ui-monospace, monospace; font-size: 12px;
         color: #fbb; background: #3a2a2a; margin: 8px 12px; padding: 8px; border-radius: 4px; display: none; }
  #pages { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 12px; }
  canvas { box-shadow: 0 2px 12px rgba(0,0,0,.5); background: white; max-width: 100%; }
  #panel { flex: 0 0 400px; max-width: 55%; overflow: auto; background: #2b2b2b; color: #ddd;
           border-left: 1px solid #1c1c1c; display: none; font-size: 12px; }
  body.show-panel #panel { display: block; }
  #panel h3 { margin: 0; padding: 10px 12px; font-size: 12px; letter-spacing: .04em; text-transform: uppercase;
              color: #aaa; border-bottom: 1px solid #1c1c1c; position: sticky; top: 0; background: #2b2b2b; }
  #hint { padding: 12px; color: #999; line-height: 1.5; }
  .ck { padding: 8px 12px; border-bottom: 1px solid #232323; cursor: pointer; }
  .ck:hover { background: #343434; }
  .ck.sel { background: #2d3b57; }
  .ck .t { color: #cfcfcf; }
  .ck .s { color: #8a8a8a; margin-top: 2px; }
  .ck .s .add { color: #6fbf73; } .ck .s .del { color: #d07a7a; }
  #diff { margin: 0; padding: 10px 12px; white-space: pre-wrap; word-break: break-word;
          font-family: ui-monospace, monospace; font-size: 11.5px; line-height: 1.4; border-top: 1px solid #1c1c1c; }
  #diff .add { color: #6fbf73; } #diff .del { color: #d07a7a; }
  #diff .hunk { color: #7aa2d0; } #diff .meta { color: #777; }
</style></head>
<body>
  <div id="bar">
    <strong>LaTeX Live Preview</strong>
    <span id="status" class="busy">connecting…</span>
    <span id="meta"></span>
    <span id="spacer"></span>
    <button id="history" title="Show change history (auto-checkpoints)">⏱ History</button>
    <button id="download" disabled title="Download the compiled PDF">⤓ Download PDF</button>
  </div>
  <div id="layout">
    <div id="main">
      <pre id="err"></pre>
      <div id="pages"></div>
    </div>
    <div id="panel">
      <h3>Change history</h3>
      <div id="hint"></div>
      <div id="list"></div>
      <pre id="diff"></pre>
    </div>
  </div>
<script type="module">
  import * as pdfjs from '/pdfjs/build/pdf.min.mjs';
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/build/pdf.worker.min.mjs';

  const statusEl = document.getElementById('status');
  const metaEl = document.getElementById('meta');
  const errEl = document.getElementById('err');
  const pagesEl = document.getElementById('pages');
  const mainEl = document.getElementById('main');
  const downloadBtn = document.getElementById('download');
  const historyBtn = document.getElementById('history');
  const hintEl = document.getElementById('hint');
  const listEl = document.getElementById('list');
  const diffEl = document.getElementById('diff');

  function setStatus(cls, text) { statusEl.className = cls; statusEl.textContent = text; }

  // ---- Download ----
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

  // ---- PDF render ----
  async function render() {
    setStatus('busy', 'rendering…');
    const scroll = mainEl.scrollTop;
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
      mainEl.scrollTop = scroll;
    } catch (e) {
      setStatus('err', 'render failed');
      errEl.style.display = 'block';
      errEl.textContent = String(e);
    }
  }

  // ---- History panel ----
  let isRepo = false;
  let selectedSha = null;

  function fmtTime(iso) {
    try { return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
    catch { return iso; }
  }

  function renderDiff(text) {
    diffEl.textContent = '';
    for (const line of text.split(/\\r?\\n/)) {
      const span = document.createElement('span');
      if (line.startsWith('@@')) span.className = 'hunk';
      else if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ') || line.startsWith('index ')) span.className = 'meta';
      else if (line.startsWith('+')) span.className = 'add';
      else if (line.startsWith('-')) span.className = 'del';
      span.textContent = line + '\\n';
      diffEl.appendChild(span);
    }
  }

  async function selectCheckpoint(sha, row) {
    selectedSha = sha;
    for (const el of listEl.querySelectorAll('.ck')) el.classList.toggle('sel', el === row);
    diffEl.textContent = 'loading…';
    try {
      const res = await fetch('/git/diff?sha=' + encodeURIComponent(sha));
      renderDiff(res.ok ? await res.text() : 'could not load diff');
    } catch { diffEl.textContent = 'could not load diff'; }
  }

  async function loadHistory() {
    if (!isRepo) {
      hintEl.textContent = 'Not a git repository — run "git init" in your project to track change history.';
      listEl.innerHTML = ''; diffEl.textContent = ''; return;
    }
    let items = [];
    try { items = await (await fetch('/git/checkpoints')).json(); } catch {}
    if (!items.length) {
      hintEl.textContent = 'No checkpoints yet. One is saved automatically after each successful compile.';
      listEl.innerHTML = ''; return;
    }
    hintEl.textContent = '';
    listEl.innerHTML = '';
    let selRow = null;
    for (const c of items) {
      const row = document.createElement('div');
      row.className = 'ck';
      const t = document.createElement('div'); t.className = 't'; t.textContent = fmtTime(c.time);
      const s = document.createElement('div'); s.className = 's';
      const files = document.createElement('span');
      files.textContent = c.filesChanged + ' file' + (c.filesChanged === 1 ? '' : 's');
      s.appendChild(files);
      if (c.insertions) { const a = document.createElement('span'); a.className = 'add'; a.textContent = '  +' + c.insertions; s.appendChild(a); }
      if (c.deletions) { const d = document.createElement('span'); d.className = 'del'; d.textContent = '  −' + c.deletions; s.appendChild(d); }
      row.appendChild(t); row.appendChild(s);
      row.addEventListener('click', () => selectCheckpoint(c.sha, row));
      listEl.appendChild(row);
      if (c.sha === selectedSha) selRow = row;
    }
    // Keep the previously-selected diff if it still exists; otherwise show the newest.
    if (selRow) selRow.classList.add('sel');
    else selectCheckpoint(items[0].sha, listEl.firstChild);
  }

  historyBtn.addEventListener('click', async () => {
    const show = !document.body.classList.contains('show-panel');
    document.body.classList.toggle('show-panel', show);
    historyBtn.classList.toggle('on', show);
    if (show) { isRepo = (await (await fetch('/git/status')).json()).isRepo; loadHistory(); }
  });

  // ---- WebSocket ----
  function connect() {
    const ws = new WebSocket('ws://' + location.host);
    ws.onopen = () => { setStatus('ok', 'connected'); render(); };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'reload') {
        if (msg.name) pdfBase = String(msg.name).split(/[\\\\/]/).pop().replace(/\\.tex$/i, '') || 'preview';
        render();
        if (document.body.classList.contains('show-panel')) loadHistory();
      } else if (msg.type === 'compile-error') {
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
