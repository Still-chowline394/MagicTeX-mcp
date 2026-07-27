// Same broken command, with and without a bibliography pass.
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const REPO = 'file:///C:/Users/Zoe%20Lin/Documents/GitHub/latex-live-preview-mcp';
const { compileProject } = await import(`${REPO}/src/project/compileProject.ts`);

const BROKEN_LINE = '\\undefinedcommandthatcannotwork';
const plain = ['\\documentclass{article}', '\\begin{document}', 'Hello.', BROKEN_LINE, '\\end{document}', ''].join('\n');
const withBib = ['\\documentclass{article}', '\\begin{document}', 'Hello \\cite{k}.', BROKEN_LINE,
  '\\bibliographystyle{plain}', '\\bibliography{refs}', '\\end{document}', ''].join('\n');

for (const [label, src, bib] of [['no bibliography', plain, false], ['with bibtex + rerun', withBib, true]]) {
  const root = mkdtempSync(join(tmpdir(), 'verdict-'));
  writeFileSync(join(root, 'main.tex'), src);
  if (bib) writeFileSync(join(root, 'refs.bib'), '@article{k, title={T}, author={A}, journal={J}, year={2020}}\n');
  try {
    const r = await compileProject({ projectRoot: root, backend: 'wasm' });
    const errs = r.verdict?.errors ?? [];
    const clean = r.success && errs.length === 0;
    console.log(`${label.padEnd(22)} success=${String(r.success).padEnd(5)} errors=${errs.length}  clean=${clean}  -> UI status ${clean ? "'ok'  *** reported as a clean success ***" : "'error'"}`);
    if (errs.length) console.log(`      ${JSON.stringify(errs[0]).slice(0, 100)}`);
    // Is the error even in the log we classify?
    const log = r.log ?? '';
    console.log(`      log mentions "Undefined control sequence": ${/Undefined control sequence/i.test(log)}   (log ${log.length}B)`);
  } finally { rmSync(root, { recursive: true, force: true }); }
}
process.exit(0);
