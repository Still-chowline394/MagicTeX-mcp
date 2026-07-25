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

export interface CommentRect { x: number; y: number; w: number; h: number }
export type CommentStatus = 'suggested' | 'pending' | 'resolved';
export type CommentRole = 'human' | 'reviewer' | 'defender' | 'author';
export interface Reply { by: CommentRole; text: string; at: string }
export interface Comment {
  id: string;
  page: number;
  quote: string;
  rects: CommentRect[];
  text: string;
  status: CommentStatus;
  role?: CommentRole;
  replies?: Reply[];
  created: string;
  resolvedNote?: string;
}

export async function fetchComments(): Promise<Comment[]> {
  const r = await fetch('/api/comments');
  return r.ok ? r.json() : [];
}

export async function createComment(input: { page: number; quote: string; rects: CommentRect[]; text: string }): Promise<void> {
  await fetch('/api/comments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
}

export async function patchComment(id: string, patch: { status?: CommentStatus; text?: string }): Promise<void> {
  await fetch(`/api/comments?id=${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
}

export async function removeComment(id: string): Promise<void> {
  await fetch(`/api/comments?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function replyComment(id: string, text: string): Promise<void> {
  await fetch(`/api/comments/reply?id=${encodeURIComponent(id)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, by: 'human' }),
  });
}

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

export interface TreeNode { name: string; path: string; type: 'file' | 'dir'; children?: TreeNode[] }
export async function fetchTree(): Promise<TreeNode[]> {
  const r = await fetch('/api/tree');
  return r.ok ? r.json() : [];
}
/** File-system op: mkfile | mkdir | rename | delete. Returns an error string or null. */
export async function fsOp(op: string, path: string, to?: string): Promise<string | null> {
  const r = await fetch('/api/fs', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op, path, to }),
  });
  return r.ok ? null : (await r.text()) || 'operation failed';
}

/** Trigger a compile now (the toolbar's manual "Recompile"). */
export async function recompile(): Promise<void> {
  try { await fetch('/api/recompile', { method: 'POST' }); } catch { /* ignore */ }
}

/** The document's \title{…} (from the main .tex) for the header, if any. */
export async function fetchDocTitle(): Promise<string | null> {
  try {
    const files: string[] = await (await fetch('/api/files')).json();
    for (const f of files) {
      if (!/\.tex$/i.test(f)) continue;
      const src = await (await fetch(`/api/file?path=${encodeURIComponent(f)}`)).text();
      if (!/\\documentclass/.test(src)) continue;
      const m = src.match(/\\title\s*(?:\[[^\]]*\])?\s*\{((?:[^{}]|\{[^{}]*\})*)\}/);
      if (m) return m[1].replace(/\\\\|\\thanks\{[^}]*\}/g, ' ').replace(/\s+/g, ' ').trim();
    }
  } catch { /* ignore */ }
  return null;
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
