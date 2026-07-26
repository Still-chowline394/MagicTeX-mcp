// One local HTTP + WebSocket server, two roles:
//   - engine host: /host.html + /engine/* (texlyre-busytex dist) + /busytex/*
//     (WASM assets) for the HIDDEN headless-Chromium page that runs the compiler.
//   - viewer: /viewer (pdf.js page) + /pdfjs/* + /latest.pdf + a WS channel that
//     pushes reload/compiling/error events to the human's open tab.
// COOP/COEP headers are set on everything — the engine's Worker/SharedArrayBuffer
// need cross-origin isolation (spike finding).
import { createServer, type Server, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { hostPageHtml } from '../engine/hostPage.js';
import { viewerPageHtml } from './viewerPage.js';
import { diffViewHtml } from './diffViewPage.js';
import { canTrackHistory, historyStatus, listCheckpoints, getCheckpointDiff, getWorkingDiff, restoreCheckpoint, restoreFile } from '../git/checkpoints.js';
import { listTextFiles, readTextFile, writeTextFile, listTree, createTextFile, createDir, renameEntry, deleteEntry, writeUpload } from './filesApi.js';
import { suppressNextChange } from '../watch/fileWatcher.js';
import { listComments, addComment, updateComment, deleteComment, addReply } from './commentsStore.js';
import { getGitHubRemote } from '../git/remote.js';
import { buildOverleafZip } from '../export/overleafZip.js';
import { resolveMainFile } from '../project/resolveMainFile.js';
import { getProjectRoot } from '../session.js';
import { busytexDir } from '../engine/assetsDir.js';

const PKG_ROOT = fileURLToPath(new URL('../..', import.meta.url));

// Locate a dependency's install directory via Node's OWN resolver rather than
// assuming `<pkg-root>/node_modules/<dep>`. When MagicTeX is installed from npm,
// npm hoists dependencies to the CONSUMER's top-level node_modules, so that
// assumed path doesn't exist and every asset below 404s — which silently breaks
// the compile engine, since the engine only loads on the first render_preview.
// It only looked fine in development because a cloned repo does have its own
// node_modules. Resolving `<dep>/package.json` walks the real lookup chain, so
// it works hoisted, nested, or linked.
const require = createRequire(import.meta.url);
function depDir(pkg: string): string {
  return dirname(require.resolve(`${pkg}/package.json`));
}

const ENGINE_DIST = join(depDir('texlyre-busytex'), 'dist');
const PDFJS_ROOT = depDir('pdfjs-dist');
const DIFF2HTML_ROOT = join(depDir('diff2html'), 'bundles');
const UI_DIST = join(PKG_ROOT, 'ui', 'dist');

const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.wasm': 'application/wasm', '.data': 'application/octet-stream',
  '.json': 'application/json', '.txt': 'text/plain', '.pdf': 'application/pdf',
  '.map': 'application/json', '.css': 'text/css',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml', '.png': 'image/png',
};

const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'cross-origin',
};

async function serveFrom(root: string, rel: string, res: ServerResponse) {
  const filePath = normalize(join(root, rel));
  if (!filePath.startsWith(root)) { res.writeHead(403).end('forbidden'); return; }
  try {
    const body = await readFile(filePath);
    // HTML must never be cached: after a UI rebuild the old hashed chunks are
    // gone, and a cached index.html pointing at them renders a blank page.
    // Hashed assets are immutable by construction, so they can cache forever.
    const ext = extname(filePath);
    const cache = ext === '.html'
      ? 'no-store'
      : /[-.][A-Za-z0-9_-]{8,}\.(js|css|mjs)$/.test(filePath) ? 'public, max-age=31536000, immutable' : 'no-cache';
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cache, ...ISOLATION_HEADERS });
    res.end(body);
  } catch {
    res.writeHead(404, ISOLATION_HEADERS).end('not found');
  }
}

export interface PreviewServerHandle {
  server: Server;
  port: number;
  url: string;
  viewerUrl: string;
  /** Replace the current PDF and notify viewers to re-render. `name` is the
   *  source main-file (e.g. "main.tex") used for the download filename. */
  setLatestPdf: (pdf: Uint8Array, name?: string) => void;
  /** Tell viewers a compile is running / failed, or that comments changed. */
  broadcast: (msg: { type: 'compiling' } | { type: 'compile-error'; log: string } | { type: 'comments-changed' }) => void;
  /** Say goodbye to open tabs, drop every socket, and stop listening. */
  close: () => Promise<void>;
}

export function startPreviewServer(): Promise<PreviewServerHandle> {
  let latestPdf: Buffer | null = null;
  let latestName: string | undefined;
  const clients = new Set<WebSocket>();

  const send = (msg: unknown) => {
    const data = JSON.stringify(msg);
    for (const ws of clients) { try { ws.send(data); } catch { /* dropped */ } }
  };

  const json = (res: ServerResponse, body: unknown) => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...ISOLATION_HEADERS });
    res.end(JSON.stringify(body));
  };

  const server = createServer(async (req, res) => {
    const reqUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(reqUrl.pathname);

    // Git history endpoints — read-only, over the current project root (the same
    // repo the coordinator checkpoints; git resolves the enclosing repo from there).
    if (pathname === '/git/status') { return json(res, { isRepo: await canTrackHistory(getProjectRoot()), ...(await historyStatus(getProjectRoot())) }); }
    if (pathname === '/git/checkpoints') { return json(res, await listCheckpoints(getProjectRoot())); }
    if (pathname === '/git/diff') {
      const sha = reqUrl.searchParams.get('sha') ?? '';
      try {
        const diff = await getCheckpointDiff(getProjectRoot(), sha);
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...ISOLATION_HEADERS });
        res.end(diff); return;
      } catch (e) {
        res.writeHead(400, ISOLATION_HEADERS).end(String((e as Error).message)); return;
      }
    }
    // Restore the working tree to a checkpoint (revert), then recompile.
    if (pathname === '/git/restore' && req.method === 'POST') {
      const sha = reqUrl.searchParams.get('sha') ?? '';
      try {
        await restoreCheckpoint(getProjectRoot(), sha);
        const { requestCompile } = await import('../coordinator.js');
        requestCompile().catch(() => {});
        return json(res, { ok: true });
      } catch (e) {
        res.writeHead(400, ISOLATION_HEADERS).end(String((e as Error).message)); return;
      }
    }
    // Restore a single file to a checkpoint version (per-file revert).
    if (pathname === '/git/restore-file' && req.method === 'POST') {
      const sha = reqUrl.searchParams.get('sha') ?? '';
      const path = reqUrl.searchParams.get('path') ?? '';
      try {
        await restoreFile(getProjectRoot(), sha, path);
        const { requestCompile } = await import('../coordinator.js');
        requestCompile().catch(() => {});
        return json(res, { ok: true });
      } catch (e) {
        res.writeHead(400, ISOLATION_HEADERS).end(String((e as Error).message)); return;
      }
    }

    // Anchored comments API. Mutations broadcast comments-changed so every open
    // workspace tab (and the Claude-side tools) stay in sync.
    if (pathname === '/api/comments') {
      const root = getProjectRoot();
      try {
        if (req.method === 'POST') {
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const created = await addComment(root, JSON.parse(Buffer.concat(chunks).toString('utf8')));
          send({ type: 'comments-changed' });
          return json(res, created);
        }
        if (req.method === 'PATCH') {
          const id = reqUrl.searchParams.get('id') ?? '';
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const updated = await updateComment(root, id, JSON.parse(Buffer.concat(chunks).toString('utf8')));
          if (!updated) { res.writeHead(404, ISOLATION_HEADERS).end('unknown comment'); return; }
          send({ type: 'comments-changed' });
          return json(res, updated);
        }
        if (req.method === 'DELETE') {
          const id = reqUrl.searchParams.get('id') ?? '';
          const ok = await deleteComment(root, id);
          // 404 like PATCH and /reply above, rather than 200 with ok:false — a
          // caller checking res.ok would otherwise read a no-op as a success.
          // Broadcasting only on a real deletion also spares every connected
          // client a refetch when several agents are working at once.
          if (!ok) { res.writeHead(404, ISOLATION_HEADERS).end('unknown comment'); return; }
          send({ type: 'comments-changed' });
          return json(res, { ok });
        }
        return json(res, await listComments(root));
      } catch (e) {
        res.writeHead(400, ISOLATION_HEADERS).end(String((e as Error).message)); return;
      }
    }

    // Post a reply into a comment's thread (the human's reply from the panel).
    if (pathname === '/api/comments/reply' && req.method === 'POST') {
      const root = getProjectRoot();
      const id = reqUrl.searchParams.get('id') ?? '';
      try {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const { text, by } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const updated = await addReply(root, id, { by: by ?? 'human', text });
        if (!updated) { res.writeHead(404, ISOLATION_HEADERS).end('unknown comment'); return; }
        send({ type: 'comments-changed' });
        return json(res, updated);
      } catch (e) {
        res.writeHead(400, ISOLATION_HEADERS).end(String((e as Error).message)); return;
      }
    }

    // Source-panel file API (list / read / write project text files).
    if (pathname === '/api/files') {
      try { return json(res, await listTextFiles(getProjectRoot())); }
      catch (e) { res.writeHead(500, ISOLATION_HEADERS).end(String((e as Error).message)); return; }
    }

    // File tree (folders + editable files) for the Overleaf-style panel.
    if (pathname === '/api/tree') {
      try { return json(res, await listTree(getProjectRoot())); }
      catch (e) { res.writeHead(500, ISOLATION_HEADERS).end(String((e as Error).message)); return; }
    }

    // Upload a figure/asset: raw binary body, target path in ?path=.
    if (pathname === '/api/upload' && req.method === 'POST') {
      const rel = reqUrl.searchParams.get('path') ?? '';
      try {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        suppressNextChange(join(getProjectRoot(), rel)); // don't auto-recompile on upload
        await writeUpload(getProjectRoot(), rel, Buffer.concat(chunks));
        return json(res, { ok: true });
      } catch (e) {
        res.writeHead(400, ISOLATION_HEADERS).end(String((e as Error).message)); return;
      }
    }

    // File-system mutations: new file / new folder / rename / delete.
    if (pathname === '/api/fs' && req.method === 'POST') {
      const root = getProjectRoot();
      try {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const { op, path: rel, to } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (op === 'mkfile') await createTextFile(root, rel);
        else if (op === 'mkdir') await createDir(root, rel);
        else if (op === 'rename') await renameEntry(root, rel, to);
        else if (op === 'delete') await deleteEntry(root, rel);
        else throw new Error('unknown op');
        return json(res, { ok: true });
      } catch (e) {
        res.writeHead(400, ISOLATION_HEADERS).end(String((e as Error).message)); return;
      }
    }
    if (pathname === '/api/file') {
      const rel = reqUrl.searchParams.get('path') ?? '';
      try {
        if (req.method === 'PUT') {
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          // Suppress the watcher for our own write, then recompile only when the
          // caller asked (?compile=1 — Ctrl+S / Save). A bare save doesn't compile.
          suppressNextChange(join(getProjectRoot(), rel));
          await writeTextFile(getProjectRoot(), rel, Buffer.concat(chunks).toString('utf8'));
          if (reqUrl.searchParams.get('compile') === '1') {
            const { requestCompile } = await import('../coordinator.js');
            requestCompile().catch(() => {});
          }
          return json(res, { ok: true });
        }
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...ISOLATION_HEADERS });
        res.end(await readTextFile(getProjectRoot(), rel)); return;
      } catch (e) {
        res.writeHead(400, ISOLATION_HEADERS).end(String((e as Error).message)); return;
      }
    }

    // Manual recompile (the toolbar's "Recompile" button). Imported lazily to
    // avoid a static import cycle with the coordinator (which holds this server).
    if (pathname === '/api/recompile' && req.method === 'POST') {
      try {
        const { requestCompile } = await import('../coordinator.js');
        const r = await requestCompile();
        return json(res, { ok: r.success });
      } catch (e) {
        res.writeHead(500, ISOLATION_HEADERS).end(String((e as Error).message)); return;
      }
    }

    // Overleaf export — a clean upload zip (build inputs only).
    if (pathname === '/export.zip') {
      try {
        const { buffer, filename } = await buildOverleafZip(getProjectRoot());
        res.writeHead(200, {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store', ...ISOLATION_HEADERS,
        });
        res.end(buffer); return;
      } catch (e) {
        res.writeHead(500, ISOLATION_HEADERS).end(String((e as Error).message)); return;
      }
    }
    // One-click "Open in Overleaf" link — only when the repo has a GitHub origin
    // (Overleaf fetches its public archive zip). null otherwise.
    if (pathname === '/overleaf/link') {
      const root = getProjectRoot();
      const gh = await getGitHubRemote(root);
      if (!gh) return json(res, { url: null });
      let main = 'main.tex';
      try { main = await resolveMainFile(root); } catch { /* fall back */ }
      const archive = `https://github.com/${gh.owner}/${gh.repo}/archive/refs/heads/${gh.branch}.zip`;
      const url = `https://www.overleaf.com/docs?snip_uri=${encodeURIComponent(archive)}&main_document=${encodeURIComponent(main)}`;
      return json(res, { url });
    }

    if (pathname === '/' || pathname === '/host.html') {
      res.writeHead(200, { 'Content-Type': 'text/html', ...ISOLATION_HEADERS }); res.end(hostPageHtml()); return;
    }
    if (pathname === '/viewer') {
      res.writeHead(200, { 'Content-Type': 'text/html', ...ISOLATION_HEADERS }); res.end(viewerPageHtml()); return;
    }
    // Side-by-side diff page — screenshotted by the show_diff tool. `sha` selects a
    // checkpoint; omitted = current uncommitted changes.
    if (pathname === '/diff-view') {
      const root = getProjectRoot();
      const sha = reqUrl.searchParams.get('sha');
      let diff = '';
      try { diff = sha ? await getCheckpointDiff(root, sha) : await getWorkingDiff(root); } catch { /* empty */ }
      res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store', ...ISOLATION_HEADERS });
      res.end(diffViewHtml(diff)); return;
    }
    if (pathname === '/latest.pdf') {
      if (!latestPdf) { res.writeHead(404, ISOLATION_HEADERS).end('no pdf yet'); return; }
      res.writeHead(200, { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store', ...ISOLATION_HEADERS });
      res.end(latestPdf); return;
    }
    if (pathname.startsWith('/engine/')) return serveFrom(ENGINE_DIST, pathname.slice('/engine/'.length), res);
    // Resolved per request through the same helper the downloader writes with,
    // so serving and fetching can't disagree about where the engine lives — and
    // because on a first run the directory appears partway through the process.
    if (pathname.startsWith('/busytex/')) return serveFrom(busytexDir(), pathname.slice('/busytex/'.length), res);
    if (pathname.startsWith('/pdfjs/')) return serveFrom(PDFJS_ROOT, pathname.slice('/pdfjs/'.length), res);
    if (pathname.startsWith('/diff2html/')) return serveFrom(DIFF2HTML_ROOT, pathname.slice('/diff2html/'.length), res);
    // The React workspace (built by `npm run build:ui` into ui/dist).
    if (pathname === '/app' || pathname === '/app/') return serveFrom(UI_DIST, 'index.html', res);
    if (pathname.startsWith('/app/')) return serveFrom(UI_DIST, pathname.slice('/app/'.length), res);

    res.writeHead(404, ISOLATION_HEADERS).end('not found');
  });

  const wss = new WebSocketServer({ server });
  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.on('close', () => clients.delete(ws));
    // A viewer that connects after a compile already ran still needs the current
    // PDF and its name (for the download filename) — push it immediately.
    if (latestPdf) { try { ws.send(JSON.stringify({ type: 'reload', name: latestName })); } catch { /* dropped */ } }
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      const url = `http://127.0.0.1:${port}`;
      resolve({
        server, port, url, viewerUrl: `${url}/viewer`,
        setLatestPdf: (pdf, name) => { latestPdf = Buffer.from(pdf); latestName = name; send({ type: 'reload', name }); },
        broadcast: (msg) => send(msg),
        close: () => new Promise<void>((done) => {
          // Tell the tabs first. Without this a workspace window keeps its last
          // render on screen and retries a port that will never answer again —
          // and a reader has no way to tell a stale error from a live one. That
          // cost a round: a real "render failed" was reported off a dead tab
          // while a healthy instance was compiling the same paper fine.
          send({ type: 'server-closing' });
          // `server.close()` stops new connections but waits for open ones, and a
          // WebSocket is open by design — so closing the http server alone never
          // returns. The sockets have to go first.
          for (const ws of clients) { try { ws.close(); } catch { /* already gone */ } }
          clients.clear();
          wss.close(() => server.close(() => done()));
          // A socket wedged mid-close must not hold the process open past exit.
          server.closeAllConnections?.();
        }),
      });
    });
  });
}
