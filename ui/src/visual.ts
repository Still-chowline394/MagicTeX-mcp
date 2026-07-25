// Visual (WYSIWYG) mode.
//   Stage 1 — typography: conceal \section/\textbf/\emph/… markup, render styled.
//   Stage 2 — math: render $…$, \(…\), and \[…\] as typeset KaTeX widgets.
// A CodeMirror decoration layer over the *same* source document (Overleaf's
// approach), so it stays fully compatible with save/compile/sync. When the
// cursor/selection touches a command or formula, its raw LaTeX reveals so it
// stays editable. Stage 3 (lists / \cite chips / links, via the syntax tree)
// is still to come.
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view';
import { type Extension, type Range } from '@codemirror/state';
import katex from 'katex';
import 'katex/dist/katex.min.css';

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

// Math spans: [full-regex, capture-group index of the TeX, display?].
const MATH: { re: RegExp; g: number; display: boolean }[] = [
  { re: /\\\[([\s\S]+?)\\\]/g, g: 1, display: true },   // \[ … \]
  { re: /\\\(([\s\S]+?)\\\)/g, g: 1, display: false },  // \( … \)
  { re: /(?<![\\$])\$(?!\$)([^\n$]+?)\$(?!\$)/g, g: 1, display: false }, // $ … $ (not $$)
];

const conceal = Decoration.replace({});

class MathWidget extends WidgetType {
  constructor(readonly tex: string, readonly display: boolean) { super(); }
  eq(o: MathWidget) { return o.tex === this.tex && o.display === this.display; }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-math' + (this.display ? ' cm-math-display' : '');
    try {
      katex.render(this.tex, span, { throwOnError: false, displayMode: this.display, output: 'html' });
    } catch {
      span.textContent = this.tex; // malformed math → show the source, never crash
      span.classList.add('cm-math-bad');
    }
    return span;
  }
  ignoreEvent() { return false; }
}

/** Does any selection range touch [a, b]? If so we reveal the raw markup. */
function cursorTouches(view: EditorView, a: number, b: number): boolean {
  for (const r of view.state.selection.ranges) if (r.from <= b && r.to >= a) return true;
  return false;
}

const overlaps = (ranges: [number, number][], a: number, b: number) =>
  ranges.some(([x, y]) => x < b && y > a);

function buildDecorations(view: EditorView): DecorationSet {
  const deco: Range<Decoration>[] = [];
  const consumed: [number, number][] = []; // comment + math spans — rules skip these

  for (const { from, to } of view.visibleRanges) {
    const text = view.state.sliceDoc(from, to);

    // Comments: dim from an unescaped % to end of line (recorded, not concealed).
    for (const m of text.matchAll(/(^|[^\\])(%.*)$/gm)) {
      const start = from + (m.index ?? 0) + m[1].length;
      const end = start + m[2].length;
      consumed.push([start, end]);
      deco.push(Decoration.mark({ class: 'cm-vcomment' }).range(start, end));
    }

    // Math: replace the whole span with a typeset widget (reveal on cursor).
    for (const { re, g, display } of MATH) {
      re.lastIndex = 0;
      for (const m of text.matchAll(re)) {
        const s = from + (m.index ?? 0);
        const e = s + m[0].length;
        if (overlaps(consumed, s, e)) continue; // inside a comment
        consumed.push([s, e]);
        if (cursorTouches(view, s, e)) continue; // editing here → show raw
        const tex = m[g].trim();
        if (!tex) continue;
        deco.push(Decoration.replace({ widget: new MathWidget(tex, display) }).range(s, e));
      }
    }

    // Typography rules: conceal markup + style content.
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      for (const m of text.matchAll(rule.re)) {
        const s = from + (m.index ?? 0);
        const e = s + m[0].length;
        if (overlaps(consumed, s, e)) continue;
        const prefixLen = m[0].indexOf('{') + 1;
        const contentStart = s + prefixLen;
        const contentEnd = e - 1;
        if (contentEnd <= contentStart) continue;
        if (cursorTouches(view, s, e)) continue;
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
