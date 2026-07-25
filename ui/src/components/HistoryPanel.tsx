// Left-panel History tab: checkpoint timeline (hidden git ref) + colorized diff.
// Reuses the existing /git/* endpoints; diff rendered by our own DiffView.
import { useEffect, useState } from 'react';
import { fetchCheckpoints, fetchDiff, fetchGitStatus, type Checkpoint } from '../api';
import { DiffView } from './DiffView';

export function HistoryPanel({ reloadTick }: { reloadTick: number }) {
  const [isRepo, setIsRepo] = useState<boolean | null>(null);
  const [items, setItems] = useState<Checkpoint[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [diff, setDiff] = useState('');

  useEffect(() => { fetchGitStatus().then(setIsRepo); }, []);

  useEffect(() => {
    if (isRepo === false) return;
    fetchCheckpoints().then((list) => {
      setItems(list);
      if (list.length && !list.some((c) => c.sha === selected)) setSelected(list[0].sha);
    });
  }, [reloadTick, isRepo]);

  useEffect(() => {
    if (!selected) { setDiff(''); return; }
    fetchDiff(selected).then(setDiff);
  }, [selected]);

  if (isRepo === false) {
    return <div className="panel-hint">Not a git repository — run "git init" in your project to track history.</div>;
  }
  if (!items.length) {
    return <div className="panel-hint">No checkpoints yet. One is saved automatically after each successful compile.</div>;
  }

  const fmt = (iso: string) => {
    try { return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
    catch { return iso; }
  };

  return (
    <div className="history">
      <div className="history-list">
        {items.map((c) => (
          <div key={c.sha} className={`ck ${c.sha === selected ? 'sel' : ''}`} onClick={() => setSelected(c.sha)}>
            <div className="ck-t">{fmt(c.time)}</div>
            <div className="ck-s">
              {c.filesChanged} file{c.filesChanged === 1 ? '' : 's'}
              {c.insertions > 0 && <span className="add"> +{c.insertions}</span>}
              {c.deletions > 0 && <span className="del"> −{c.deletions}</span>}
            </div>
          </div>
        ))}
      </div>
      {diff ? <DiffView diff={diff} /> : <div className="panel-hint">Select a checkpoint to see its diff.</div>}
    </div>
  );
}
