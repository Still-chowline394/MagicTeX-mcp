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

const PKG_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const ENGINE_DIST = join(PKG_ROOT, 'node_modules', 'texlyre-busytex', 'dist');
const BUSYTEX_ASSETS = join(PKG_ROOT, 'assets', 'busytex');
const PDFJS_ROOT = join(PKG_ROOT, 'node_modules', 'pdfjs-dist');

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
  /** Replace the current PDF and notify viewers to re-render. */
  setLatestPdf: (pdf: Uint8Array) => void;
  /** Tell viewers a compile is running / failed. */
  broadcast: (msg: { type: 'compiling' } | { type: 'compile-error'; log: string }) => void;
}

export function startPreviewServer(): Promise<PreviewServerHandle> {
  let latestPdf: Buffer | null = null;
  const clients = new Set<WebSocket>();

  const send = (msg: unknown) => {
    const data = JSON.stringify(msg);
    for (const ws of clients) { try { ws.send(data); } catch { /* dropped */ } }
  };

  const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://127.0.0.1').pathname);

    if (pathname === '/' || pathname === '/host.html') {
      res.writeHead(200, { 'Content-Type': 'text/html', ...ISOLATION_HEADERS }); res.end(hostPageHtml()); return;
    }
    if (pathname === '/viewer') {
      res.writeHead(200, { 'Content-Type': 'text/html', ...ISOLATION_HEADERS }); res.end(viewerPageHtml()); return;
    }
    if (pathname === '/latest.pdf') {
      if (!latestPdf) { res.writeHead(404, ISOLATION_HEADERS).end('no pdf yet'); return; }
      res.writeHead(200, { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store', ...ISOLATION_HEADERS });
      res.end(latestPdf); return;
    }
    if (pathname.startsWith('/engine/')) return serveFrom(ENGINE_DIST, pathname.slice('/engine/'.length), res);
    if (pathname.startsWith('/busytex/')) return serveFrom(BUSYTEX_ASSETS, pathname.slice('/busytex/'.length), res);
    if (pathname.startsWith('/pdfjs/')) return serveFrom(PDFJS_ROOT, pathname.slice('/pdfjs/'.length), res);

    res.writeHead(404, ISOLATION_HEADERS).end('not found');
  });

  const wss = new WebSocketServer({ server });
  wss.on('connection', (ws) => { clients.add(ws); ws.on('close', () => clients.delete(ws)); });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      const url = `http://127.0.0.1:${port}`;
      resolve({
        server, port, url, viewerUrl: `${url}/viewer`,
        setLatestPdf: (pdf) => { latestPdf = Buffer.from(pdf); send({ type: 'reload' }); },
        broadcast: (msg) => send(msg),
      });
    });
  });
}
