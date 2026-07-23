// The TeX Live WASM assets (~480MB download, ~649MB on disk) are NOT committed to
// git — they're fetched once on first run. This checks for them and, if missing,
// runs texlyre-busytex's downloader into <pkgRoot>/assets. Progress streams to
// stderr (stdout is the MCP JSON-RPC channel and must stay clean).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

export async function ensureAssets(pkgRoot: string): Promise<void> {
  const marker = join(pkgRoot, 'assets', 'busytex', 'busytex.wasm');
  if (existsSync(marker)) return;

  console.error('[latex-live-preview-mcp] First run: downloading TeX Live WASM assets (~480 MB, one time). This can take a few minutes…');
  await new Promise<void>((resolve, reject) => {
    const child = spawn('npx', ['texlyre-busytex', 'download-assets', 'assets'], {
      cwd: pkgRoot,
      stdio: ['ignore', 'inherit', 'inherit'],
      shell: process.platform === 'win32', // npx.cmd on Windows
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`asset download failed (exit ${code}). Run manually: npx texlyre-busytex download-assets assets`))));
    child.on('error', reject);
  });

  if (!existsSync(marker)) {
    throw new Error('Assets download finished but busytex.wasm is still missing. Run manually: npx texlyre-busytex download-assets assets');
  }
  console.error('[latex-live-preview-mcp] Assets ready.');
}
