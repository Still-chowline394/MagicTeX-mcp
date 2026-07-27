// Real-TeX backend: compile with a locally installed TeX Live via latexmk, for
// 100% package fidelity (the WASM engine ships a subset). Used by default under
// backend 'auto' when a local TeX is present; 'system' forces it, 'wasm' opts
// out and keeps the zero-install path.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { CompileOutput } from './browserHost.js';
import type { Engine } from '../project/compileProject.js';

const pexec = promisify(execFile);

/**
 * What to tell someone who turns out not to have a local TeX.
 *
 * Naming `latexmk` on its own actively misleads: it is not separately
 * installable, it is a Perl driver that ships inside TeX Live. Someone reading
 * "latexmk was not found" goes looking for a package by that name and finds
 * nothing that helps — this happened, and the user came back asking whether they
 * needed "latexmk or the mactex pkg". So name the distribution instead, and say
 * plainly that they may not need one at all.
 */
export const INSTALL_TEX_HELP = [
  "latexmk isn't installed on its own — it ships with a TeX distribution:",
  '  macOS    MacTeX          https://tug.org/mactex/',
  '  Linux    texlive-full    (via your package manager)',
  '  Windows  TeX Live        https://tug.org/texlive/',
  '',
  "You don't need one to use MagicTeX: the bundled WASM engine compiles with no",
  'install at all. But it is a subset of TeX Live, so packages like `svg` and most',
  "venue classes aren't in it. Install a distribution when you need output that",
  'matches Overleaf exactly.',
].join('\n');

/**
 * The `\usepackage` name is not always the name you install. `tlmgr install
 * algorithm` fails; the bundle is `algorithms`. Handing someone a command that
 * errors is worse than handing them nothing, so map the cases where the two
 * differ and pass everything else through unchanged.
 */
const CTAN_BUNDLE: Record<string, string> = {
  algorithm: 'algorithms',
  algorithmic: 'algorithms',
  algpseudocode: 'algorithmicx',
  algorithmicx: 'algorithmicx',
  IEEEtran: 'ieeetran',
  llncs: 'llncs',
};

export interface SystemFallback {
  errors: string[];
  missingPackages: string[];
  missingClasses: string[];
  /** Tools the document needs that LaTeX refused to run (svg -> Inkscape,
   *  minted -> Pygments). Carried because this is how a real paper's local-TeX
   *  run actually failed, and without it the caller could say only "it failed
   *  for a different reason" and then trail off — classifyCompile files these
   *  under blockedTools, not errors, so `errors` came back empty. */
  blockedTools?: string[];
}

/**
 * Explain a backend substitution in terms the reader can act on: what their own
 * TeX choked on, what they are looking at instead, and the one command that
 * closes the gap.
 *
 * Without this, `auto` falling back to WASM is indistinguishable from a clean
 * success on the toolchain they configured — which is how a minimal BasicTeX
 * install got reported as "Compile succeeded" while quietly producing output
 * from a different TeX Live than the author believed they were using.
 */
export function systemFallbackNote(f: SystemFallback): string {
  const missing = [...f.missingPackages, ...f.missingClasses];
  const why = missing.length
    ? `${missing.map((m) => `\`${m}\``).join(', ')} not found`
    : (f.errors[0] ?? 'it produced no PDF');
  const packages = [...new Set(missing.map((m) => CTAN_BUNDLE[m] ?? m))];
  const fix = packages.length
    ? `\n\nTo compile with your own TeX instead:\n  tlmgr install ${packages.join(' ')}\n(prefix with sudo on a system-wide TeX Live)`
    : '';
  return `Your local TeX was tried first and failed — ${why}. Fell back to the bundled WASM engine, which got through it, so this PDF exists — but it came from a subset of TeX Live and may not match Overleaf.${fix}`;
}

/**
 * Why the local TeX could not be used. `'absent'` and `'broken'` are different
 * problems with opposite answers, and collapsing them cost a real afternoon: a
 * user installed MiKTeX, MagicTeX went on saying no local TeX was found, and an
 * agent eventually gave up and invoked the compiler itself.
 */
export interface SystemTexProbe {
  usable: boolean;
  reason?: 'absent' | 'broken';
  /** What the OS or the tool actually said. The most useful line available here
   *  is produced by MiKTeX, and used to be discarded by a bare catch. */
  detail?: string;
}

let probe: SystemTexProbe | undefined;

/** Is `latexmk` present AND able to run? */
export async function probeSystemTex(): Promise<SystemTexProbe> {
  // Only a negative result is re-checked, and only that one can change under us:
  // people install TeX while the server is running — often *because* we just
  // told them a package was missing — and this is a long-lived stdio process.
  // A permanent memo meant that install never took effect for the rest of the
  // session, and `backend: "system"` kept reporting "no local TeX was found"
  // about a latexmk sitting on PATH.
  //
  // A positive result is kept: TeX does not uninstall itself mid-session, and
  // re-probing before every compile would spawn a process for nothing.
  if (probe?.usable) return probe;
  try {
    await pexec('latexmk', ['-version'], { timeout: 6000 });
    probe = { usable: true };
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    // ENOENT is "no such executable". Anything else means latexmk was found and
    // failed to run — on Windows that is nearly always MiKTeX, whose latexmk is
    // a Perl script it ships no interpreter for, so the binary exists and can
    // never execute. Reported as "not found", that sends people off to install
    // a distribution they already have.
    const absent = err.code === 'ENOENT';
    const said = [err.stdout, err.stderr, err.message].filter(Boolean).join('\n').trim();
    probe = {
      usable: false,
      reason: absent ? 'absent' : 'broken',
      detail: absent ? undefined : said.slice(0, 600) || undefined,
    };
  }
  return probe;
}

/** Is a usable local TeX (latexmk) on PATH? */
export async function hasSystemTex(): Promise<boolean> {
  return (await probeSystemTex()).usable;
}

/** Reset the probe — for tests, and for anything that knows the environment
 *  changed under us. */
export function forgetSystemTex(): void {
  probe = undefined;
}

/**
 * What the reader should do about the local TeX, given what we found when we
 * looked for one. Used when the bundled engine could not compile at all — the
 * moment where "install a TeX distribution" is either the right answer or
 * exactly the wrong one, and the difference is invisible from the log.
 */
export function systemTexAdvice(
  p?: SystemTexProbe,
  ctx: { packages?: string[]; fallback?: SystemFallback } = {},
): string {
  // Two things this got wrong on its first outing against a real paper, both the
  // same mistake — asserting something that had not been measured:
  //
  //   1. Asked for `backend: "wasm"` it said "your local TeX ran and did not get
  //      through this either" about a TeX that was never invoked.
  //   2. Under `auto` it blamed the local TeX's failure on THIS missing package,
  //      when the local TeX had sailed past it and died on something else
  //      entirely (a figure needing shell-escape).
  //
  // So: only the `fallback` — which exists solely when the local TeX actually
  // ran — may be used to say anything about what the local TeX did, and only the
  // packages IT reported missing may be handed to tlmgr.
  const bundle = (n: string) => CTAN_BUNDLE[n] ?? n;
  if (p?.usable) {
    if (!ctx.fallback) {
      return 'You have a working local TeX, and it was not used because this run asked for the bundled engine. Re-run without `backend: "wasm"` — the default picks your local TeX up automatically, and it is likely to have this package.';
    }
    const alsoMissingThere = [...new Set([...ctx.fallback.missingPackages, ...ctx.fallback.missingClasses])]
      .filter((m) => (ctx.packages ?? []).includes(m));
    if (alsoMissingThere.length) {
      return `Your local TeX ran and is missing ${alsoMissingThere.length > 1 ? 'these too' : 'this too'}. Add ${alsoMissingThere.length > 1 ? 'them' : 'it'} with \`tlmgr install ${[...new Set(alsoMissingThere.map(bundle))].join(' ')}\` (prefix with sudo on a system-wide TeX Live).`;
    }
    // The local TeX got past this package and failed on something else. Saying
    // "install it there" would send the reader to fix a problem they do not have.
    // Three sources for "why", in descending order of how much they tell the
    // reader — and a real one for the case where the local run reported nothing
    // at all, which does happen: latexmk on a second run over an existing build
    // directory can fail with a log carrying none of the signatures we classify,
    // leaving every field of the fallback empty. An earlier version trailed off
    // mid-sentence there.
    const why = ctx.fallback.errors[0]
      ? `:\n\n  ${ctx.fallback.errors[0]}`
      : ctx.fallback.blockedTools?.length
        ? `: the document needs ${ctx.fallback.blockedTools.join(', ')}, which LaTeX will not run without shell-escape. Re-run with \`shellEscape: true\` if you trust this source.`
        : ', which it did not report in a form we could read. Re-run with `backend: "system"` to see its output directly.';
    return `Your local TeX ran and got further — it did not report this package missing, so it has it. It failed for a different reason${why}\n\nFixing that is the shorter path to a PDF than getting the bundled engine through this package.`;
  }
  if (p?.reason === 'broken') {
    const perl = /script engine|perl/i.test(p.detail ?? '');
    return [
      'A local TeX would have this package, and MagicTeX uses one automatically when it can.',
      '`latexmk` is on PATH here but could not run:',
      ...(p.detail ? ['', p.detail.split('\n').map((l) => `  ${l}`).join('\n')] : []),
      '',
      ...(perl
        ? ['latexmk is a Perl script and MiKTeX ships no Perl interpreter. Install Strawberry',
           'Perl (https://strawberryperl.com/), or TeX Live for Windows (https://tug.org/texlive/),',
           'which bundles one.']
        : ['Fix that and MagicTeX will pick it up without any further configuration.']),
    ].join('\n');
  }
  return `A local TeX install would have this package, and MagicTeX picks one up automatically once there is one.\n\n${INSTALL_TEX_HELP}`;
}

/**
 * What to say when `backend: "system"` was asked for and cannot be honoured.
 *
 * The two cases need opposite things from the reader and used to get the same
 * sentence. "Found but cannot execute" is the one that reads as a lie, because
 * `latexmk` is right there on PATH.
 */
export function systemTexUnavailableMessage(p: SystemTexProbe): string {
  if (p.reason !== 'broken') {
    return `backend "system" was requested, but no local TeX was found — looked for \`latexmk\` on PATH.\n\n${INSTALL_TEX_HELP}`;
  }
  const perl = /script engine|perl/i.test(p.detail ?? '');
  return [
    'backend "system" was requested. `latexmk` is on PATH but could not run:',
    ...(p.detail ? ['', p.detail.split('\n').map((l) => `  ${l}`).join('\n')] : []),
    '',
    ...(perl
      ? [
          'latexmk is a Perl script, and MiKTeX does not ship a Perl interpreter —',
          'so its latexmk.exe can never execute on its own. Install Strawberry Perl',
          '(https://strawberryperl.com/), or use TeX Live for Windows',
          '(https://tug.org/texlive/), which bundles one.',
          '',
        ]
      : []),
    'Or use backend "wasm", which needs nothing installed.',
  ].join('\n');
}

const ENGINE_FLAG: Record<Engine, string> = {
  xelatex: '-xelatex', lualatex: '-lualatex', pdflatex: '-pdf',
};

/** Compile `mainRelPath` (relative to `root`) with local latexmk; artifacts go
 *  under .latex-preview/build so the project tree stays clean. */
export async function compileWithSystemTex(root: string, mainRelPath: string, engine: Engine, shellEscape = false): Promise<CompileOutput> {
  const started = Date.now();
  const outdir = join(root, '.latex-preview', 'build');
  await mkdir(outdir, { recursive: true });
  // -shell-escape lets the document execute arbitrary shell commands, so it is
  // opt-in per call rather than a default. Packages like svg and minted cannot
  // work without it, and the user is the only one who can say whether this
  // particular source is trusted.
  const args = [
    ENGINE_FLAG[engine] ?? '-pdf', '-interaction=nonstopmode', '-file-line-error',
    ...(shellEscape ? ['-shell-escape'] : []),
    `-outdir=${outdir}`, mainRelPath,
  ];
  try {
    const { stdout, stderr } = await pexec('latexmk', args, { cwd: root, timeout: 180_000, maxBuffer: 32 * 1024 * 1024 });
    const pdfPath = join(outdir, basename(mainRelPath).replace(/\.tex$/i, '') + '.pdf');
    const pdf = new Uint8Array(await readFile(pdfPath));
    return { success: true, exitCode: 0, pdf, pdfLen: pdf.length, log: stdout + stderr, ms: Date.now() - started };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; code?: number; message?: string };
    const log = (err.stdout ?? '') + (err.stderr ?? err.message ?? 'latexmk failed');
    return { success: false, exitCode: err.code ?? 1, pdf: undefined, pdfLen: 0, log, ms: Date.now() - started, error: 'system latexmk compile failed' };
  }
}
