// Passive live-reload: watch the project's source files and recompile on save,
// so the preview stays live even between explicit render_preview calls (manual
// edits, or several Claude Edit calls before it invokes the tool). Debounced so
// a burst of edits from one turn collapses into a single compile.
import chokidar, { type FSWatcher } from 'chokidar';
import { requestCompile } from '../coordinator.js';

const WATCH_GLOBS = ['**/*.tex', '**/*.bib', '**/*.cls', '**/*.sty', '**/*.bst', '**/*.png', '**/*.jpg', '**/*.jpeg', '**/*.pdf', '**/*.eps', '**/*.svg'];
const IGNORED = /(^|[/\\])(\.git|node_modules|\.latex-preview)([/\\]|$)/;
const DEBOUNCE_MS = 400;

let watcher: FSWatcher | null = null;
let timer: NodeJS.Timeout | null = null;

/** Start watching `projectRoot` (idempotent — only the first call takes effect). */
export function startWatching(projectRoot: string): void {
  if (watcher) return;
  watcher = chokidar.watch(WATCH_GLOBS, {
    cwd: projectRoot,
    ignored: IGNORED,
    ignoreInitial: true, // the tool's own first compile covers the initial state
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
  });
  const onChange = () => {
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
