// Left-panel Source tab: file list + CodeMirror LaTeX editor.
// "Live" mode (default ON) auto-saves ~1s after you stop typing — the server-
// side watcher then recompiles and the WS reload refreshes the PDF, giving the
// Overleaf/Typst type→render loop. Ctrl+S still saves immediately.
// When a reload event arrives and the editor has no unsaved changes, the open
// file is re-fetched so external edits (Claude's) don't get clobbered by a
// later save from a stale buffer.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { keymap } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import { latex } from 'codemirror-lang-latex';

const AUTOSAVE_MS = 1000;

export function SourcePanel({ reloadTick }: { reloadTick: number }) {
  const [files, setFiles] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [live, setLive] = useState(true);
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

  const openFile = useCallback(async (path: string) => {
    try {
      const r = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
      if (!r.ok) { setLoadError(`Couldn't load ${path}: ${await r.text()}`); return; }
      setActive(path);
      setContent(await r.text());
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

  // External edits (Claude, another editor) recompile → reload event. If we have
  // no unsaved changes, refresh the buffer so it can't drift stale.
  useEffect(() => {
    const path = activeRef.current;
    if (!path || dirtyRef.current) return;
    fetch(`/api/file?path=${encodeURIComponent(path)}`)
      .then((r) => (r.ok ? r.text() : null))
      .then((text) => {
        if (text !== null && text !== contentRef.current && !dirtyRef.current) setContent(text);
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

  const extensions = useMemo(
    () => [
      latex(),
      Prec.high(keymap.of([{ key: 'Mod-s', run: () => { void save(); return true; } }])),
    ],
    [save],
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
          <div className="editor-scroll">
            <CodeMirror
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
