// The TeX Live WASM assets (~480MB download, ~649MB on disk) are NOT committed to
// git — they're fetched once on first run into a per-user cache (see assetsDir.ts
// for why not into the package directory). Progress streams to stderr (stdout is
// the MCP JSON-RPC channel and must stay clean).
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { busytexDir, busytexDownloadDest, busytexPresent } from './assetsDir.js';

export async function ensureAssets(): Promise<void> {
  if (busytexPresent()) return;

  const dest = busytexDownloadDest();
  await mkdir(dest, { recursive: true });

  console.error(`[magictex-mcp] First run: downloading TeX Live WASM assets (~480 MB, one time) into ${busytexDir()}. This can take a few minutes…`);
  await new Promise<void>((resolve, reject) => {
    const child = spawn('npx', ['texlyre-busytex', 'download-assets', dest], {
      stdio: ['ignore', 'inherit', 'inherit'],
      shell: process.platform === 'win32', // npx.cmd on Windows
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`asset download failed (exit ${code}). Run manually: npx texlyre-busytex download-assets "${dest}"`))));
    child.on('error', reject);
  });

  if (!busytexPresent()) {
    throw new Error(`Assets download finished but busytex.wasm is still missing from ${busytexDir()}. Run manually: npx texlyre-busytex download-assets "${dest}"`);
  }
  console.error('[magictex-mcp] Assets ready.');
}
