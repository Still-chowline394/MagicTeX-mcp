// Left-panel Source tab: file list + CodeMirror LaTeX editor.
// "Live" mode (default ON) auto-saves ~1s after you stop typing — the server-
// side watcher then recompiles and the WS reload refreshes the PDF, giving the
// Overleaf/Typst type→render loop. Ctrl+S still saves immediately.
// When a reload event arrives and the editor has no unsaved changes, the open
// file is re-fetched so external edits (Claude's) don't get clobbered by a
// later save from a stale buffer.
// Text-match sync: a click in the PDF sends prose here (find the file+line,
// open it, scroll the editor there); a click in the editor sends the line's
// prose to the PDF.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { EditorView, keymap } from '@codemirror/view';
import { EditorSelection, Prec } from '@codemirror/state';
import { latex } from 'codemirror-lang-latex';
import { normalize, phrase, stripLatex } from '../sync';
import { visualMode } from '../visual';

const AUTOSAVE_MS = 1000;
interface SyncTarget { text: string; nonce: number }

export function SourcePanel({
  reloadTick, syncTarget, onSyncToPdf,
}: {
  reloadTick: number;
  syncTarget?: SyncTarget | null;
  onSyncToPdf?: (text: string) => void;
}) {
  const [files, setFiles] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [live, setLive] = useState(true);
  const [visual, setVisual] = useState(() => localStorage.getItem('ws-visual') === '1');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const contentRef = useRef(content);
  contentRef.current = content;
  const activeRef = useRef(active);
  activeRef.current = active;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const liveRef = useRef(live);
  liveRef.current = live;
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const cache = useRef<Map<string, string>>(new Map());
  const pendingJumpLine = useRef<number | null>(null);

  const openFile = useCallback(async (path: string) => {
    try {
      const r = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
      if (!r.ok) { setLoadError(`Couldn't load ${path}: ${await r.text()}`); return; }
      const text = await r.text();
      cache.current.set(path, text);
      setActive(path);
      setContent(text);
      setDirty(false);
      setSaveState('idle');
      setLoadError(null);
    } catch (e) {
      setLoadError(`Couldn't load ${path}: ${String(e)}`);
    }
  }, []);

  useEffect(() => {
    fetch('/api/files').then((r) => r.json()).then((list: string[]) => {
      setFiles(list);
      if (list.length) openFile(list[0]);
    }).catch(() => {});
  }, [openFile]);

  // External edits (Claude, another editor) recompile → reload event. Drop the
  // cache so cross-file search re-reads, and refresh the open buffer when clean.
  useEffect(() => {
    cache.current.clear();
    const path = activeRef.current;
    if (!path || dirtyRef.current) return;
    fetch(`/api/file?path=${encodeURIComponent(path)}`)
      .then((r) => (r.ok ? r.text() : null))
      .then((text) => {
        if (text === null) return;
        cache.current.set(path, text);
        if (text !== contentRef.current && !dirtyRef.current) setContent(text);
      })
      .catch(() => {});
  }, [reloadTick]);

  const save = useCallback(async () => {
    const path = activeRef.current;
    if (!path) return;
    setSaveState('saving');
    try {
      const r = await fetch(`/api/file?path=${encodeURIComponent(path)}`, { method: 'PUT', body: contentRef.current });
      if (!r.ok) throw new Error(await r.text());
      cache.current.set(path, contentRef.current);
      setDirty(false);
      setSaveState('saved');
      setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 1800);
    } catch {
      setSaveState('error');
    }
  }, []);

  const onChange = useCallback((v: string) => {
    setContent(v);
    setDirty(true);
    if (liveRef.current) {
      if (autoTimer.current) clearTimeout(autoTimer.current);
      autoTimer.current = setTimeout(() => { void save(); }, AUTOSAVE_MS);
    }
  }, [save]);

  useEffect(() => () => { if (autoTimer.current) clearTimeout(autoTimer.current); }, []);

  // Scroll+select a 0-based line in the open editor.
  const jumpToLine = useCallback((line0: number) => {
    const view = cmRef.current?.view;
    if (!view) return;
    const line = view.state.doc.line(Math.min(line0 + 1, view.state.doc.lines));
    view.dispatch({
      selection: EditorSelection.range(line.from, line.to),
      effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
    });
    view.focus();
  }, []);

  // After openFile swaps content in, run any pending jump for that file.
  useEffect(() => {
    if (pendingJumpLine.current === null) return;
    const line = pendingJumpLine.current;
    pendingJumpLine.current = null;
    requestAnimationFrame(() => jumpToLine(line));
  }, [content, jumpToLine]);

  // PDF → source: find the file+line whose prose matches, open it, jump there.
  useEffect(() => {
    if (!syncTarget) return;
    const target = phrase(syncTarget.text, 6);
    if (!target) return;
    (async () => {
      for (const f of files) {
        if (!cache.current.has(f)) {
          try {
            const r = await fetch(`/api/file?path=${encodeURIComponent(f)}`);
            if (r.ok) cache.current.set(f, await r.text());
          } catch { /* ignore */ }
        }
        const lines = (cache.current.get(f) ?? '').split('\n');
        for (let i = 0; i < lines.length; i++) {
          const src = normalize(stripLatex(lines[i]));
          if (src.length < 4) continue;
          if (src.includes(target) || (target.includes(src) && src.length > 10)) {
            if (f === activeRef.current) jumpToLine(i);
            else { pendingJumpLine.current = i; void openFile(f); }
            return;
          }
        }
      }
    })();
  }, [syncTarget, files, openFile, jumpToLine]);

  // ── Formatting toolbar: wrap the selection (or insert a snippet) ────────
  const wrapSelection = useCallback((before: string, after: string, placeholder = '') => {
    const view = cmRef.current?.view;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    const sel = view.state.sliceDoc(from, to) || placeholder;
    const insert = before + sel + after;
    const caret = from + before.length + sel.length; // after the wrapped text
    view.dispatch({ changes: { from, to, insert }, selection: { anchor: caret } });
    view.focus();
  }, []);

  const insertAtLineStart = useCallback((text: string) => {
    const view = cmRef.current?.view;
    if (!view) return;
    const line = view.state.doc.lineAt(view.state.selection.main.head);
    view.dispatch({ changes: { from: line.from, insert: text }, selection: { anchor: line.from + text.length } });
    view.focus();
  }, []);

  // source → PDF: on a click in the editor, send the current line's prose out.
  const emitSyncFromCursor = useCallback(() => {
    const view = cmRef.current?.view;
    if (!view || !onSyncToPdf) return;
    const line = view.state.doc.lineAt(view.state.selection.main.head);
    const prose = phrase(stripLatex(line.text), 8);
    if (prose.split(' ').filter(Boolean).length >= 2) onSyncToPdf(line.text);
  }, [onSyncToPdf]);

  useEffect(() => { localStorage.setItem('ws-visual', visual ? '1' : '0'); }, [visual]);

  const extensions = useMemo(
    () => [
      latex(),
      Prec.high(keymap.of([{ key: 'Mod-s', run: () => { void save(); return true; } }])),
      ...(visual ? [visualMode()] : []),
    ],
    [save, visual],
  );

  return (
    <div className="source">
      <div className="file-list">
        {files.map((f) => (
          <button key={f} className={`file ${f === active ? 'on' : ''}`} onClick={() => openFile(f)} title={f}>
            {f}{f === active && dirty ? ' •' : ''}
          </button>
        ))}
      </div>
      {loadError && <div className="panel-hint load-error">{loadError}</div>}
      {active && (
        <>
          <div className="editor-bar">
            <span className="editor-file">{active}{dirty ? ' •' : ''}</span>
            <span className="seg" title="Code shows raw LaTeX; Visual renders headings, bold, italic in place">
              <button className={visual ? '' : 'on'} onClick={() => setVisual(false)}>Code</button>
              <button className={visual ? 'on' : ''} onClick={() => setVisual(true)}>Visual</button>
            </span>
            <span className="spacer" />
            <span className={`save-state save-${saveState}`}>
              {saveState === 'saving' ? 'saving…' : saveState === 'saved' ? '✓ saved — recompiling' : saveState === 'error' ? 'save failed' : ''}
            </span>
            <button
              className={live ? 'on' : ''}
              onClick={() => setLive((v) => !v)}
              title="Live: auto-save ~1s after you stop typing, so the PDF re-renders as you write"
            >
              ⚡ Live
            </button>
            <button onClick={() => void save()} disabled={!dirty && saveState !== 'error'}>Save</button>
          </div>
          <div className="format-bar">
            <button title="Bold" onClick={() => wrapSelection('\\textbf{', '}', 'bold')}><b>B</b></button>
            <button title="Italic" onClick={() => wrapSelection('\\emph{', '}', 'italic')}><i>I</i></button>
            <span className="fb-sep" />
            <button title="Section" onClick={() => insertAtLineStart('\\section{}')}>H1</button>
            <button title="Subsection" onClick={() => insertAtLineStart('\\subsection{}')}>H2</button>
            <span className="fb-sep" />
            <button title="Bullet list" onClick={() => wrapSelection('\\begin{itemize}\n  \\item ', '\n\\end{itemize}', '')}>•</button>
            <button title="Numbered list" onClick={() => wrapSelection('\\begin{enumerate}\n  \\item ', '\n\\end{enumerate}', '')}>1.</button>
            <span className="fb-sep" />
            <button title="Inline math" onClick={() => wrapSelection('$', '$', 'x')}>√x</button>
            <button title="Display equation" onClick={() => wrapSelection('\\[\n  ', '\n\\]', '')}>∑</button>
            <button title="Citation" onClick={() => wrapSelection('\\cite{', '}', 'key')}>[ ]</button>
          </div>
          <div className="editor-scroll" onClick={emitSyncFromCursor}>
            <CodeMirror
              ref={cmRef}
              value={content}
              theme="dark"
              height="100%"
              extensions={extensions}
              onChange={onChange}
              basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: true }}
            />
          </div>
        </>
      )}
    </div>
  );
}
