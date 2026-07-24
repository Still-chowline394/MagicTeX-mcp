// Singleton headless-Chromium host. Launches the browser + engine page ONCE
// (the WASM engine initializes once and is reused across compiles), and drives
// compiles via page.evaluate. This is the Node<->browser bridge that exists
// solely because the WASM TeX engines require DOM/Worker globals (spike finding).
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';
import { startPreviewServer, type PreviewServerHandle } from '../preview/previewServer.js';
import { ensureAssets } from './assets.js';

const PKG_ROOT = fileURLToPath(new URL('../..', import.meta.url));

export interface EngineFile {
  path: string;
  content: string; // text as-is; binary content is base64-encoded
  encoding?: 'utf8' | 'base64';
}

export interface CompileOutput {
  success: boolean;
  exitCode?: number;
  pdf?: Uint8Array;
  pdfLen: number;
  log: string;
  ms: number;
  error?: string;
}

let started: Promise<{ browser: Browser; page: Page; preview: PreviewServerHandle }> | null = null;

async function start() {
  await ensureAssets(PKG_ROOT); // fetch WASM assets on first run if missing
  const preview = await startPreviewServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('[engine page error]', e.message));
  await page.goto(`${preview.url}/host.html`, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForFunction('window.__ready === true || window.__initError', { timeout: 120_000 });
  const initError = await page.evaluate('window.__initError');
  if (initError) throw new Error(`Engine failed to initialize: ${initError}`);
  return { browser, page, preview };
}

/** Idempotent: starts the browser+engine on first call, reuses it after. */
export function ensureEngine() {
  if (!started) started = start();
  return started;
}

export async function getPreview(): Promise<PreviewServerHandle> {
  const { preview } = await ensureEngine();
  return preview;
}

export async function compile(
  files: EngineFile[],
  mainTexPath: string,
  engine: 'xelatex' | 'pdflatex' | 'lualatex' = 'xelatex',
  opts: { bibtex?: boolean; rerun?: boolean } = {},
): Promise<CompileOutput> {
  const { page } = await ensureEngine();
  const raw = (await page.evaluate(
    // eslint-disable-next-line no-undef
    ([f, m, e, o]) => (window as any).__compile(f, m, e, o),
    [files, mainTexPath, engine, opts] as const,
  )) as { success: boolean; exitCode?: number; pdfBytes: number[] | null; pdfLen: number; log?: string; ms: number; error?: string };

  return {
    success: raw.success,
    exitCode: raw.exitCode,
    pdf: raw.pdfBytes ? Uint8Array.from(raw.pdfBytes) : undefined,
    pdfLen: raw.pdfLen ?? 0,
    log: raw.log ?? '',
    ms: raw.ms,
    error: raw.error,
  };
}

/**
 * Open the side-by-side diff page, wait for it to render, and screenshot it.
 * Returns { empty: true } when there's nothing to diff. Used by the show_diff
 * tool to return a diff image inline in the conversation.
 */
export async function captureDiff(path: string): Promise<{ empty: boolean; png?: Buffer }> {
  const { browser, preview } = await ensureEngine();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  try {
    await page.goto(`${preview.url}${path}`, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForFunction('window.__rendered === true', { timeout: 20_000 });
    if (await page.evaluate('window.__empty === true')) return { empty: true };
    const el = await page.$('#diff');
    const png = el ? await el.screenshot({ type: 'png' }) : await page.screenshot({ type: 'png', fullPage: true });
    return { empty: false, png: png as Buffer };
  } finally {
    await page.close().catch(() => {});
  }
}

export async function shutdownEngine() {
  if (!started) return;
  const { browser, preview } = await started;
  await browser.close().catch(() => {});
  preview.server.close();
  started = null;
}
