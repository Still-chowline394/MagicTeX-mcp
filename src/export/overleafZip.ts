// Build a clean Overleaf-ready upload zip: only the build inputs (source +
// figures), no build artifacts / VCS / node_modules. Reuses collectProjectFiles
// (which already gathers exactly those file types and skips .git/node_modules/
// .latex-preview/etc.), so the zip matches what actually compiles. The user
// uploads it via Overleaf → New Project → Upload Project.
import { basename } from 'node:path';
import AdmZip from 'adm-zip';
import { collectProjectFiles } from '../project/collectProjectFiles.js';
import { resolveMainFile } from '../project/resolveMainFile.js';

export interface OverleafZip {
  buffer: Buffer;
  filename: string;
  fileCount: number;
}

export async function buildOverleafZip(root: string): Promise<OverleafZip> {
  const { files } = await collectProjectFiles(root);

  // Drop the compiled main PDF if it happens to sit in the tree (it's output,
  // not an input — matches the skill guide's "exclude main.pdf"). Figures under
  // subdirs (e.g. figures/plot.pdf) are kept.
  let mainPdf = '';
  try {
    const main = await resolveMainFile(root); // e.g. "main.tex"
    mainPdf = main.replace(/\.tex$/i, '.pdf'); // "main.pdf"
  } catch { /* ambiguous/none — keep all */ }

  const zip = new AdmZip();
  let count = 0;
  for (const f of files) {
    if (mainPdf && f.path === mainPdf) continue;
    const data = f.encoding === 'base64' ? Buffer.from(f.content, 'base64') : Buffer.from(f.content, 'utf8');
    zip.addFile(f.path, data);
    count++;
  }

  const name = (basename(root) || 'project').replace(/[^\w.-]+/g, '-');
  return { buffer: zip.toBuffer(), filename: `${name}.zip`, fileCount: count };
}
