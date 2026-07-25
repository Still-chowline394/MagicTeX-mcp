// A small, self-contained unified-diff renderer for the History panel.
// We render the raw `git diff` text ourselves instead of diff2html so we get:
//   - calm, line-level coloring only (no busy word-level highlights),
//   - a fully dark palette (diff2html's light "changed line" yellow was leaking),
//   - wrapping long lines, so nothing overflows the panel and the line-number
//     gutter always stays aligned with its (possibly wrapped) code line.
import { useMemo } from 'react';

type RowType = 'file' | 'hunk' | 'add' | 'del' | 'ctx';
interface Row { type: RowType; oldNo?: number; newNo?: number; text: string }

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

export function DiffView({ diff }: { diff: string }) {
  const rows = useMemo(() => parseDiff(diff), [diff]);
  return (
    <div className="diffview">
      {rows.map((r, i) => {
        if (r.type === 'file') return <div key={i} className="dv-file">{r.text}</div>;
        if (r.type === 'hunk') return <div key={i} className="dv-hunk">{r.text}</div>;
        return (
          <div key={i} className={`dv-row dv-${r.type}`}>
            <span className="dv-num">{r.oldNo ?? ''}</span>
            <span className="dv-num">{r.newNo ?? ''}</span>
            <span className="dv-sign">{r.type === 'add' ? '+' : r.type === 'del' ? '−' : ''}</span>
            <span className="dv-code">{r.text || ' '}</span>
          </div>
        );
      })}
    </div>
  );
}
