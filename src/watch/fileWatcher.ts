// Passive live-reload: watch the project's source files and recompile on save,
// so the preview stays live even between explicit render_preview calls (manual
// edits, or several Claude Edit calls before it invokes the tool). Debounced so
// a burst of edits from one turn collapses into a single compile.
//
// chokidar v4 note: glob patterns are NOT supported (v4 removed them — passing
// globs silently watches nothing). So we watch the project directory itself and
// filter events by extension in the handler.
import chokidar, { type FSWatcher } from 'chokidar';
import { basename } from 'node:path';
import { requestCompile } from '../coordinator.js';

const WATCH_EXT = /\.(tex|bib|cls|sty|bst|cfg|clo|def|ldf|fd|bbx|cbx|lbx|png|jpe?g|pdf|eps|svg)$/i;
const IGNORED_DIRS = new Set(['.git', 'node_modules', '.latex-preview', '.vscode', '__pycache__']);
const DEBOUNCE_MS = 400;

let watcher: FSWatcher | null = null;
let timer: NodeJS.Timeout | null = null;

/** Start watching `projectRoot` (idempotent — only the first call takes effect). */
export function startWatching(projectRoot: string): void {
  if (watcher) return;
  watcher = chokidar.watch(projectRoot, {
    // Function form (v4-safe): prune ignored directories from the walk entirely.
    ignored: (path, stats) => {
      const name = basename(path);
      if (stats?.isDirectory() || !/\./.test(name)) return IGNORED_DIRS.has(name) || (name.startsWith('.') && name !== '.');
      return false; // files are filtered by extension in the event handler
    },
    ignoreInitial: true, // the tool's own first compile covers the initial state
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
  });
  const onChange = (path: string) => {
    if (!WATCH_EXT.test(path)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      // Fire-and-forget: the watcher just refreshes the viewer; errors already
      // get pushed to the viewer by the coordinator.
      requestCompile().catch(() => {});
    }, DEBOUNCE_MS);
  };
  watcher.on('add', onChange).on('change', onChange).on('unlink', onChange);
}

export async function stopWatching(): Promise<void> {
  if (timer) clearTimeout(timer);
  await watcher?.close();
  watcher = null;
}
