// Visual (WYSIWYG) mode — Stage 1: typography.
// A CodeMirror decoration layer over the *same* source document (Overleaf's
// approach), so it stays fully compatible with save/compile/sync. It conceals
// the markup of a handful of commands and renders their content styled; when
// the cursor/selection touches a command, that command reveals its raw LaTeX so
// it stays editable. Stage 2 will add math (KaTeX); Stage 3 lists/cites/links.
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { type Extension, type Range } from '@codemirror/state';

interface Rule { re: RegExp; cls: string }

// Each rule matches `\cmd{content}` (no nested braces — Stage 1 scope). The
// prefix (up to and including `{`) and the closing `}` are concealed; the
// captured content is styled with `cls`.
const RULES: Rule[] = [
  { re: /\\section\*?\{([^{}]*)\}/g, cls: 'cm-vh1' },
  { re: /\\subsection\*?\{([^{}]*)\}/g, cls: 'cm-vh2' },
  { re: /\\subsubsection\*?\{([^{}]*)\}/g, cls: 'cm-vh3' },
  { re: /\\textbf\{([^{}]*)\}/g, cls: 'cm-vb' },
  { re: /\\(?:emph|textit)\{([^{}]*)\}/g, cls: 'cm-vi' },
  { re: /\\texttt\{([^{}]*)\}/g, cls: 'cm-vt' },
];

const conceal = Decoration.replace({});

/** Does any selection range touch [a, b]? If so we reveal the raw markup. */
function cursorTouches(view: EditorView, a: number, b: number): boolean {
  for (const r of view.state.selection.ranges) if (r.from <= b && r.to >= a) return true;
  return false;
}

function buildDecorations(view: EditorView): DecorationSet {
  const deco: Range<Decoration>[] = [];
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.sliceDoc(from, to);
    // Comments: dim from an unescaped % to end of line (not concealed).
    for (const m of text.matchAll(/(^|[^\\])(%.*)$/gm)) {
      const start = from + (m.index ?? 0) + m[1].length;
      deco.push(Decoration.mark({ class: 'cm-vcomment' }).range(start, start + m[2].length));
    }
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      for (const m of text.matchAll(rule.re)) {
        const s = from + (m.index ?? 0);
        const e = s + m[0].length;
        const prefixLen = m[0].indexOf('{') + 1;
        const contentStart = s + prefixLen;
        const contentEnd = e - 1;
        if (contentEnd <= contentStart) continue;
        if (cursorTouches(view, s, e)) continue; // editing here → show raw
        deco.push(conceal.range(s, contentStart));
        deco.push(Decoration.mark({ class: rule.cls }).range(contentStart, contentEnd));
        deco.push(conceal.range(contentEnd, e));
      }
    }
  }
  // `true` tells CodeMirror to sort the ranges (and their sides) for us.
  return Decoration.set(deco, true);
}

/** The Visual-mode extension. Add to the editor only when Visual is on. */
export function visualMode(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) { this.decorations = buildDecorations(view); }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged || u.selectionSet)
          this.decorations = buildDecorations(u.view);
      }
    },
    { decorations: (v) => v.decorations },
  );
}
