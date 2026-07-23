// Singleton headless-Chromium host. Launches the browser + engine page ONCE
// (the WASM engine initializes once and is reused across compiles), and drives
// compiles via page.evaluate. This is the Node<->browser bridge that exists
// solely because the WASM TeX engines require DOM/Worker globals (spike finding).
import { chromium, type Browser, type Page } from 'playwright';
import { startPreviewServer, type PreviewServerHandle } from '../preview/previewServer.js';

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

export async function shutdownEngine() {
  if (!started) return;
  const { browser, preview } = await started;
  await browser.close().catch(() => {});
  preview.server.close();
  started = null;
}
