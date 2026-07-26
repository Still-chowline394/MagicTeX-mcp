// Left-panel History tab: checkpoint timeline (hidden git ref) + colorized diff.
// Reuses the existing /git/* endpoints; diff rendered by our own DiffView.
import { useEffect, useState } from 'react';
import { fetchCheckpoints, fetchDiff, fetchGitStatus, restoreCheckpoint, restoreFile, type Checkpoint, type HistoryMode } from '../api';
import { DiffView } from './DiffView';

export function HistoryPanel({ reloadTick }: { reloadTick: number }) {
  const [isRepo, setIsRepo] = useState<boolean | null>(null);
  const [mode, setMode] = useState<HistoryMode | null>(null);
  const [items, setItems] = useState<Checkpoint[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [diff, setDiff] = useState('');
  const [busy, setBusy] = useState(false);

  const restore = async (sha: string) => {
    if (!confirm('Restore the project to this version? Your current text is snapshotted first (a new checkpoint), so you can undo this.')) return;
    setBusy(true);
    await restoreCheckpoint(sha);
    setBusy(false);
    // the recompile fires a reload → the effect above refreshes the checkpoint list
  };

  useEffect(() => { fetchGitStatus().then((s) => { setIsRepo(s.isRepo); setMode(s.mode); }); }, []);

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
    // A project that isn't a git repo now gets a shadow repo in the cache, so
    // the only way to reach this is a missing binary. Saying "not a git
    // repository" here sent people off to run `git init`, which wouldn't help.
    return (
      <div className="panel-hint">
        History needs <code>git</code>, and none was found on your PATH. Install it
        from <a href="https://git-scm.com/" target="_blank" rel="noreferrer">git-scm.com</a> and
        restart — no account and no remote are involved; the history stays on this machine.
      </div>
    );
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
      {/* Say where it is. Someone whose folder isn't a repo gets history that
          works, then finds `git log` empty with nothing to go on. This is not a
          warning — the feature is working — so it sits quietly above the
          timeline rather than as a banner. */}
      {mode === 'shadow' && (
        <div className="history-note">
          Tracked outside your project — this folder isn't a git repository, so history lives
          in MagicTeX's own cache. Nothing is added to your files, and nothing is pushed anywhere.
        </div>
      )}
      <div className="history-list">
        {items.map((c, i) => (
          <div key={c.sha} className={`ck ${c.sha === selected ? 'sel' : ''}`} onClick={() => setSelected(c.sha)}>
            <div className="ck-t">
              {fmt(c.time)}
              {i > 0 && (
                <button className="ck-restore" disabled={busy} title="Restore the project to this version (reversible)"
                        onClick={(e) => { e.stopPropagation(); void restore(c.sha); }}>
                  ↩ restore
                </button>
              )}
            </div>
            <div className="ck-s">
              {c.filesChanged} file{c.filesChanged === 1 ? '' : 's'}
              {c.insertions > 0 && <span className="add"> +{c.insertions}</span>}
              {c.deletions > 0 && <span className="del"> −{c.deletions}</span>}
            </div>
          </div>
        ))}
      </div>
      {diff ? (
        <DiffView
          diff={diff}
          onRevertFile={selected ? async (file) => {
            if (!confirm(`Revert "${file}" to this version? Only this file changes; current state is snapshotted first (reversible).`)) return;
            setBusy(true); await restoreFile(selected, file); setBusy(false);
          } : undefined}
        />
      ) : <div className="panel-hint">Select a checkpoint to see its diff.</div>}
    </div>
  );
}
