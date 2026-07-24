// Common LaTeX packages that busytex's bundled TeX Live subset omits (the
// algorithms / algorithmicx family). We vendor their .sty under
// assets/fallback-styles and inject them at compile time when the project
// doesn't already ship its own copy — so real papers using these still render
// without a self-hosted package server. Font-based packages (e.g. bbm) can't be
// covered this way and remain unsupported.
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { EngineFile } from './browserHost.js';

const DIR = fileURLToPath(new URL('../../assets/fallback-styles', import.meta.url));

let cache: EngineFile[] | null = null;

export async function getFallbackStyles(): Promise<EngineFile[]> {
  if (cache) return cache;
  try {
    const names = (await readdir(DIR)).filter((n) => n.endsWith('.sty'));
    cache = await Promise.all(
      names.map(async (n) => ({ path: n, content: await readFile(join(DIR, n), 'utf8'), encoding: 'utf8' as const })),
    );
  } catch {
    cache = [];
  }
  return cache;
}
