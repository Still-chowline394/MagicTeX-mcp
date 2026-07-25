// A small, self-contained unified-diff renderer for the History panel.
// We render the raw `git diff` text ourselves instead of diff2html so we get:
//   - calm, line-level coloring only (no busy word-level highlights),
//   - a fully dark palette (diff2html's light "changed line" yellow was leaking),
//   - wrapping long lines, so nothing overflows the panel and the line-number
//     gutter always stays aligned with its (possibly wrapped) code line.
import { useMemo, useState } from 'react';

type RowType = 'file' | 'hunk' | 'add' | 'del' | 'ctx';
interface Row { type: RowType; oldNo?: number; newNo?: number; text: string }
interface FileSection { file: string; rows: Row[]; adds: number; dels: number }

function parseDiff(diff: string): Row[] {
  const rows: Row[] = [];
  let oldNo = 0, newNo = 0, inHunk = false;
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git')) {
      const m = line.match(/ b\/(.+)$/);
      rows.push({ type: 'file', text: m ? m[1] : line.replace('diff --git ', '') });
      inHunk = false;
      continue;
    }
    // Skip file metadata and (for `git show`) the commit message before the hunks.
    if (!inHunk && !line.startsWith('@@')) continue;
    if (line.startsWith('@@')) {
      const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) { oldNo = +m[1]; newNo = +m[2]; inHunk = true; rows.push({ type: 'hunk', text: line }); }
      continue;
    }
    const c = line[0];
    if (c === '+') { rows.push({ type: 'add', newNo, text: line.slice(1) }); newNo++; }
    else if (c === '-') { rows.push({ type: 'del', oldNo, text: line.slice(1) }); oldNo++; }
    else if (c === '\\') { /* "\ No newline at end of file" — ignore */ }
    else { rows.push({ type: 'ctx', oldNo, newNo, text: line.slice(1) }); oldNo++; newNo++; }
  }
  return rows;
}

/** Group the flat rows into per-file sections (with add/del counts). */
function toSections(rows: Row[]): FileSection[] {
  const sections: FileSection[] = [];
  let cur: FileSection | null = null;
  for (const r of rows) {
    if (r.type === 'file') { cur = { file: r.text, rows: [], adds: 0, dels: 0 }; sections.push(cur); continue; }
    if (!cur) { cur = { file: '(changes)', rows: [], adds: 0, dels: 0 }; sections.push(cur); }
    cur.rows.push(r);
    if (r.type === 'add') cur.adds++; else if (r.type === 'del') cur.dels++;
  }
  return sections;
}

export function DiffView({ diff }: { diff: string }) {
  const sections = useMemo(() => toSections(parseDiff(diff)), [diff]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  return (
    <div className="diffview">
      {sections.map((s, si) => {
        const isCollapsed = collapsed[s.file];
        return (
          <div key={si} className="dv-section">
            <div className="dv-file" onClick={() => setCollapsed((c) => ({ ...c, [s.file]: !isCollapsed }))} title="Click to collapse / expand">
              <span className="dv-file-caret">{isCollapsed ? '▸' : '▾'}</span>
              <span className="dv-file-name">{s.file}</span>
              <span className="dv-file-stat">
                {s.adds > 0 && <span className="add">+{s.adds}</span>}
                {s.dels > 0 && <span className="del"> −{s.dels}</span>}
              </span>
            </div>
            {!isCollapsed && s.rows.map((r, i) =>
              r.type === 'hunk'
                ? <div key={i} className="dv-hunk">{r.text}</div>
                : (
                  <div key={i} className={`dv-row dv-${r.type}`}>
                    <span className="dv-num">{r.oldNo ?? ''}</span>
                    <span className="dv-num">{r.newNo ?? ''}</span>
                    <span className="dv-sign">{r.type === 'add' ? '+' : r.type === 'del' ? '−' : ''}</span>
                    <span className="dv-code">{r.text || ' '}</span>
                  </div>
                ),
            )}
          </div>
        );
      })}
    </div>
  );
}
