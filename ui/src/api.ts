// Same-origin API helpers + the WebSocket live channel. The UI is served by the
// preview server itself, so everything is relative — no config, no CORS.
import { useEffect, useRef, useState } from 'react';

export interface Checkpoint {
  sha: string;
  time: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
}

export type WsMessage =
  | { type: 'reload'; name?: string }
  | { type: 'compiling' }
  | { type: 'compile-error'; log: string }
  | { type: 'comments-changed' };

export type Status = 'connecting' | 'connected' | 'compiling' | 'ok' | 'error' | 'disconnected';

export async function fetchCheckpoints(): Promise<Checkpoint[]> {
  const r = await fetch('/git/checkpoints');
  return r.ok ? r.json() : [];
}

export async function fetchDiff(sha: string): Promise<string> {
  const r = await fetch(`/git/diff?sha=${encodeURIComponent(sha)}`);
  return r.ok ? r.text() : '';
}

export async function fetchGitStatus(): Promise<boolean> {
  try { return (await (await fetch('/git/status')).json()).isRepo; } catch { return false; }
}

export async function fetchOverleafLink(): Promise<string | null> {
  try { return (await (await fetch('/overleaf/link')).json()).url ?? null; } catch { return null; }
}

/** Live channel: connection state + a bump counter that increments on each reload. */
export function useLive(onMessage?: (m: WsMessage) => void) {
  const [status, setStatus] = useState<Status>('connecting');
  const [errorLog, setErrorLog] = useState('');
  const [reloadTick, setReloadTick] = useState(0);
  const [pdfName, setPdfName] = useState('preview');
  const cbRef = useRef(onMessage);
  cbRef.current = onMessage;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;
    const connect = () => {
      ws = new WebSocket(`ws://${location.host}`);
      ws.onopen = () => setStatus('connected');
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data) as WsMessage;
        if (msg.type === 'reload') {
          if (msg.name) setPdfName(String(msg.name).split(/[\\/]/).pop()!.replace(/\.tex$/i, '') || 'preview');
          setErrorLog('');
          setStatus('ok');
          setReloadTick((t) => t + 1);
        } else if (msg.type === 'compiling') {
          setStatus('compiling');
        } else if (msg.type === 'compile-error') {
          setStatus('error');
          setErrorLog(msg.log || 'compile failed');
        }
        cbRef.current?.(msg);
      };
      ws.onclose = () => {
        if (closed) return;
        setStatus('disconnected');
        setTimeout(connect, 1000);
      };
    };
    connect();
    return () => { closed = true; ws?.close(); };
  }, []);

  return { status, errorLog, reloadTick, pdfName };
}
