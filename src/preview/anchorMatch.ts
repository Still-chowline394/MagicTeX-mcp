// Locate a PDF comment's quoted passage back in the LaTeX source, so the agent
// loop gets a precise {file, line} to edit instead of having to search. Same
// text-match heuristic the workspace uses for PDF↔source sync (the WASM engine
// can't emit a real SyncTeX map): match the visible prose, ignore LaTeX markup.
// Works for prose (the bulk of a paper); command/math-only lines simply won't
// match, and the agent falls back to searching for the quote itself.
import { listTextFiles, readTextFile } from './filesApi.js';

export interface Anchor { file: string; line: number; snippet: string }

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const stripLatex = (line: string) =>
  line
    .replace(/%.*$/, '')              // comments
    .replace(/\\[a-zA-Z@]+\*?/g, ' ') // \commands
    .replace(/[{}$&~^_\\]/g, ' ')     // markup punctuation
    .replace(/\[[^\]]*\]/g, ' ')      // optional args
    .trim();

const phrase = (text: string, words: number) =>
  normalize(text).split(' ').filter(Boolean).slice(0, words).join(' ');

/** Find the source file+line whose prose best matches `quote`, or null. */
export async function findAnchor(root: string, quote: string): Promise<Anchor | null> {
  let files: string[];
  try { files = await listTextFiles(root); } catch { return null; }
  const texish = files.filter((f) => /\.(tex|bib|cls|sty)$/i.test(f));

  // Try a distinctive 6-word phrase first, then a looser 4-word fallback.
  for (const words of [6, 4]) {
    const target = phrase(quote, words);
    if (!target) continue;
    for (const f of texish) {
      let content: string;
      try { content = await readTextFile(root, f); } catch { continue; }
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const src = normalize(stripLatex(lines[i]));
        if (src.length < 4) continue;
        if (src.includes(target) || (target.includes(src) && src.length > 10)) {
          const snippet = lines.slice(Math.max(0, i - 1), i + 2).join('\n');
          return { file: f, line: i + 1, snippet };
        }
      }
    }
  }
  return null;
}
