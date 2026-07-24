// Left-panel Source tab: file list + CodeMirror LaTeX editor. Saving writes to
// disk via PUT /api/file — the server-side watcher then recompiles and the WS
// reload refreshes the PDF, so the editor gets the same live loop as any edit.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { keymap } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import { latex } from 'codemirror-lang-latex';

export function SourcePanel() {
  const [files, setFiles] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const contentRef = useRef(content);
  contentRef.current = content;
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    fetch('/api/files').then((r) => r.json()).then((list: string[]) => {
      setFiles(list);
      if (list.length && !active) openFile(list[0]);
    }).catch(() => {});
  }, []);

  const openFile = useCallback(async (path: string) => {
    const r = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
    if (!r.ok) return;
    setActive(path);
    setContent(await r.text());
    setDirty(false);
    setSaveState('idle');
  }, []);

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
      {active && (
        <>
          <div className="editor-bar">
            <span className="editor-file">{active}{dirty ? ' •' : ''}</span>
            <span className="spacer" />
            <span className={`save-state save-${saveState}`}>
              {saveState === 'saving' ? 'saving…' : saveState === 'saved' ? '✓ saved — recompiling' : saveState === 'error' ? 'save failed' : ''}
            </span>
            <button onClick={() => void save()} disabled={!dirty && saveState !== 'error'}>Save</button>
          </div>
          <div className="editor-scroll">
            <CodeMirror
              value={content}
              theme="dark"
              height="100%"
              extensions={extensions}
              onChange={(v) => { setContent(v); setDirty(true); }}
              basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: true }}
            />
          </div>
        </>
      )}
    </div>
  );
}
