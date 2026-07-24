// One local HTTP + WebSocket server, two roles:
//   - engine host: /host.html + /engine/* (texlyre-busytex dist) + /busytex/*
//     (WASM assets) for the HIDDEN headless-Chromium page that runs the compiler.
//   - viewer: /viewer (pdf.js page) + /pdfjs/* + /latest.pdf + a WS channel that
//     pushes reload/compiling/error events to the human's open tab.
// COOP/COEP headers are set on everything — the engine's Worker/SharedArrayBuffer
// need cross-origin isolation (spike finding).
import { createServer, type Server, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { hostPageHtml } from '../engine/hostPage.js';
import { viewerPageHtml } from './viewerPage.js';
import { diffViewHtml } from './diffViewPage.js';
import { isGitRepo, listCheckpoints, getCheckpointDiff, getWorkingDiff } from '../git/checkpoints.js';
import { listTextFiles, readTextFile, writeTextFile } from './filesApi.js';
import { listComments, addComment, updateComment, deleteComment } from './commentsStore.js';
import { getGitHubRemote } from '../git/remote.js';
import { buildOverleafZip } from '../export/overleafZip.js';
import { resolveMainFile } from '../project/resolveMainFile.js';
import { getProjectRoot } from '../session.js';

const PKG_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const ENGINE_DIST = join(PKG_ROOT, 'node_modules', 'texlyre-busytex', 'dist');
const BUSYTEX_ASSETS = join(PKG_ROOT, 'assets', 'busytex');
const PDFJS_ROOT = join(PKG_ROOT, 'node_modules', 'pdfjs-dist');
const DIFF2HTML_ROOT = join(PKG_ROOT, 'node_modules', 'diff2html', 'bundles');
const UI_DIST = join(PKG_ROOT, 'ui', 'dist');

const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.wasm': 'application/wasm', '.data': 'application/octet-stream',
  '.json': 'application/json', '.txt': 'text/plain', '.pdf': 'application/pdf',
  '.map': 'application/json', '.css': 'text/css',
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
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream', ...ISOLATION_HEADERS });
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
  /** Tell viewers a compile is running / failed. */
  broadcast: (msg: { type: 'compiling' } | { type: 'compile-error'; log: string }) => void;
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
    if (pathname === '/git/status') { return json(res, { isRepo: await isGitRepo(getProjectRoot()) }); }
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
          send({ type: 'comments-changed' });
          return json(res, { ok });
        }
        return json(res, await listComments(root));
      } catch (e) {
        res.writeHead(400, ISOLATION_HEADERS).end(String((e as Error).message)); return;
      }
    }

    // Source-panel file API (list / read / write project text files).
    if (pathname === '/api/files') {
      try { return json(res, await listTextFiles(getProjectRoot())); }
      catch (e) { res.writeHead(500, ISOLATION_HEADERS).end(String((e as Error).message)); return; }
    }
    if (pathname === '/api/file') {
      const rel = reqUrl.searchParams.get('path') ?? '';
      try {
        if (req.method === 'PUT') {
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          await writeTextFile(getProjectRoot(), rel, Buffer.concat(chunks).toString('utf8'));
          return json(res, { ok: true });
        }
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...ISOLATION_HEADERS });
        res.end(await readTextFile(getProjectRoot(), rel)); return;
      } catch (e) {
        res.writeHead(400, ISOLATION_HEADERS).end(String((e as Error).message)); return;
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
    if (pathname.startsWith('/busytex/')) return serveFrom(BUSYTEX_ASSETS, pathname.slice('/busytex/'.length), res);
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
      });
    });
  });
}
