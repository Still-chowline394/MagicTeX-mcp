// Overleaf-style file tree: nested folders + editable files, with new file /
// new folder / rename / delete. Click a file to open it in the editor.
import { useCallback, useEffect, useState } from 'react';
import { fetchTree, fsOp, type TreeNode } from '../api';

export function FileTree({
  active, onOpen, refreshKey,
}: {
  active: string | null;
  onOpen: (path: string) => void;
  refreshKey: number; // bump to reload the tree (e.g. after external edits)
}) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const t = await fetchTree().catch(() => []);
    if (t.length) { setTree(t); return; }
    // Fallback for an older server without /api/tree: show the flat file list.
    try {
      const files: string[] = await (await fetch('/api/files')).json();
      setTree(files.map((f) => ({ name: f.split('/').pop() ?? f, path: f, type: 'file' as const })));
    } catch { setTree([]); }
  }, []);
  useEffect(() => { reload(); }, [reload, refreshKey]);

  const doOp = async (op: string, path: string, to?: string) => {
    const e = await fsOp(op, path, to);
    if (e) { setErr(e); setTimeout(() => setErr(null), 4000); return false; }
    reload();
    return true;
  };

  // Create in a folder (or root). Prompt is the simplest reliable affordance here.
  const newFile = async (dir: string) => {
    const name = prompt(`New file name in ${dir || 'project root'} (e.g. sections/intro.tex):`);
    if (name) { const path = dir ? `${dir}/${name}` : name; if (await doOp('mkfile', path)) onOpen(path); }
  };
  const newFolder = async (dir: string) => {
    const name = prompt(`New folder name in ${dir || 'project root'}:`);
    if (name) await doOp('mkdir', dir ? `${dir}/${name}` : name);
  };
  const rename = async (node: TreeNode) => {
    const to = prompt('Rename to (path relative to project root):', node.path);
    if (to && to !== node.path) await doOp('rename', node.path, to);
  };
  const del = async (node: TreeNode) => {
    if (confirm(`Delete ${node.type === 'dir' ? 'folder' : 'file'} "${node.path}"?${node.type === 'dir' ? ' All contents will be removed.' : ''}`)) {
      await doOp('delete', node.path);
    }
  };

  const Row = ({ node, depth }: { node: TreeNode; depth: number }) => {
    const isOpen = open[node.path] ?? depth === 0;
    return (
      <>
        <div
          className={`tree-row ${node.type} ${node.path === active ? 'on' : ''}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => node.type === 'dir' ? setOpen((o) => ({ ...o, [node.path]: !isOpen })) : onOpen(node.path)}
          title={node.path}
        >
          <span className="tree-caret">{node.type === 'dir' ? (isOpen ? '▾' : '▸') : ''}</span>
          <span className="tree-icon">{node.type === 'dir' ? '📁' : '📄'}</span>
          <span className="tree-name">{node.name}</span>
          <span className="tree-actions" onClick={(e) => e.stopPropagation()}>
            {node.type === 'dir' && <button title="New file here" onClick={() => newFile(node.path)}>+</button>}
            <button title="Rename" onClick={() => rename(node)}>✎</button>
            <button title="Delete" onClick={() => del(node)}>🗑</button>
          </span>
        </div>
        {node.type === 'dir' && isOpen && node.children?.map((c) => <Row key={c.path} node={c} depth={depth + 1} />)}
      </>
    );
  };

  return (
    <div className="file-tree">
      <div className="tree-head">
        <span>Files</span>
        <span className="spacer" />
        <button title="New file" onClick={() => newFile('')}>＋ File</button>
        <button title="New folder" onClick={() => newFolder('')}>＋ Folder</button>
      </div>
      {err && <div className="panel-hint load-error">{err}</div>}
      <div className="tree-body">
        {tree.map((n) => <Row key={n.path} node={n} depth={0} />)}
        {tree.length === 0 && <div className="panel-hint">No files yet.</div>}
      </div>
    </div>
  );
}
