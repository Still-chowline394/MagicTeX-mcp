// Visual (WYSIWYG) mode — a CodeMirror decoration layer over the *same* source
// document (Overleaf's approach), so it stays fully compatible with
// save/compile/sync. When the cursor/selection touches a command or formula its
// raw LaTeX reveals, so everything stays editable.
//   Stage 1 — typography: \section/\textbf/\emph/… concealed + styled.
//   Stage 2 — math: $…$, \(…\), \[…\] typeset with KaTeX.
//   Stage 3 — structure: a brace-matching scanner (handles nested braces),
//             \cite chips, \url/\href links, and itemize/enumerate bullets.
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view';
import { type Extension, type Range } from '@codemirror/state';
import katex from 'katex';
import 'katex/dist/katex.min.css';

const STYLE: Record<string, string> = {
  section: 'cm-vh1', subsection: 'cm-vh2', subsubsection: 'cm-vh3',
  textbf: 'cm-vb', emph: 'cm-vi', textit: 'cm-vi', texttt: 'cm-vt', underline: 'cm-vu',
};

const conceal = Decoration.replace({});

class MathWidget extends WidgetType {
  constructor(readonly tex: string, readonly display: boolean) { super(); }
  eq(o: MathWidget) { return o.tex === this.tex && o.display === this.display; }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-math' + (this.display ? ' cm-math-display' : '');
    try { katex.render(this.tex, span, { throwOnError: false, displayMode: this.display, output: 'html' }); }
    catch { span.textContent = this.tex; span.classList.add('cm-math-bad'); }
    return span;
  }
  ignoreEvent() { return false; }
}

/** A styled inline token (chip, link, bullet) rendered in place of markup. */
class TokenWidget extends WidgetType {
  constructor(readonly text: string, readonly cls: string, readonly href?: string) { super(); }
  eq(o: TokenWidget) { return o.text === this.text && o.cls === this.cls && o.href === this.href; }
  toDOM() {
    const e = document.createElement(this.href ? 'a' : 'span');
    e.className = this.cls;
    e.textContent = this.text;
    if (this.href) { e.setAttribute('href', this.href); e.setAttribute('target', '_blank'); e.setAttribute('rel', 'noopener'); }
    return e;
  }
  ignoreEvent() { return false; }
}

/** Index of the `}` matching the `{` at `open`, honoring \{ \} escapes; -1 if none. */
function matchBrace(t: string, open: number, limit: number): number {
  let depth = 0;
  for (let i = open; i < limit; i++) {
    const c = t[i];
    if (c === '\\') { i++; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  return -1;
}

export function visualMode(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) { this.decorations = build(view); }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged || u.selectionSet) this.decorations = build(u.view);
      }
    },
    { decorations: (v) => v.decorations },
  );
}

function build(view: EditorView): DecorationSet {
  const deco: Range<Decoration>[] = [];
  const touches = (a: number, b: number) => view.state.selection.ranges.some((r) => r.from <= b && r.to >= a);

  for (const { from, to } of view.visibleRanges) {
    const t = view.state.sliceDoc(from, to);
    scan(0, t.length);

    // Recursively decorate [lo, hi) of the slice; `base`-relative offsets go out.
    function scan(lo: number, hi: number) {
      let i = lo;
      while (i < hi) {
        const c = t[i];

        // Comments: dim to end of line.
        if (c === '%' && t[i - 1] !== '\\') {
          let j = t.indexOf('\n', i); if (j < 0 || j > hi) j = hi;
          deco.push(Decoration.mark({ class: 'cm-vcomment' }).range(from + i, from + j));
          i = j; continue;
        }

        // Inline math $…$ (not $$).
        if (c === '$' && t[i - 1] !== '\\' && t[i + 1] !== '$') {
          let j = i + 1; while (j < hi && !(t[j] === '$' && t[j - 1] !== '\\')) j++;
          if (j < hi) { math(i, j + 1, t.slice(i + 1, j), false); i = j + 1; continue; }
        }

        if (c === '\\') {
          // Display / inline math delimiters.
          if (t[i + 1] === '[' || t[i + 1] === '(') {
            const close = t[i + 1] === '[' ? '\\]' : '\\)';
            const j = t.indexOf(close, i + 2);
            if (j >= 0 && j < hi) { math(i, j + 2, t.slice(i + 2, j), t[i + 1] === '['); i = j + 2; continue; }
          }
          const m = /^\\([a-zA-Z@]+)\*?/.exec(t.slice(i, i + 32));
          if (m) { const next = command(m[1], i, i + m[0].length); if (next !== null) { i = next; continue; } }
        }
        i++;
      }
    }

    function math(s: number, e: number, tex: string, display: boolean) {
      if (touches(from + s, from + e) || !tex.trim()) return;
      deco.push(Decoration.replace({ widget: new MathWidget(tex.trim(), display) }).range(from + s, from + e));
    }

    // Handle a `\name` starting at `s`, args begin at `argAt`. Returns the new
    // scan index, or null if this command isn't special (caller advances by 1).
    function command(name: string, s: number, argAt: number): number | null {
      // Environments: conceal \begin{itemize|enumerate} / \end{…}.
      if ((name === 'begin' || name === 'end') && t[argAt] === '{') {
        const close = matchBrace(t, argAt, t.length);
        if (close < 0) return null;
        const env = t.slice(argAt + 1, close);
        if (env === 'itemize' || env === 'enumerate') {
          if (!touches(from + s, from + close + 1)) deco.push(conceal.range(from + s, from + close + 1));
          return close + 1;
        }
        return null;
      }
      // \item → bullet marker.
      if (name === 'item') {
        if (!touches(from + s, from + argAt)) deco.push(Decoration.replace({ widget: new TokenWidget('• ', 'cm-vbullet') }).range(from + s, from + argAt));
        return argAt;
      }
      // Citations → a chip showing the keys.
      if ((name === 'cite' || name === 'citep' || name === 'citet') && t[argAt] === '{') {
        const close = matchBrace(t, argAt, t.length);
        if (close < 0) return null;
        if (!touches(from + s, from + close + 1)) {
          const keys = t.slice(argAt + 1, close).split(',').map((k) => k.trim()).join(', ');
          deco.push(Decoration.replace({ widget: new TokenWidget(`[${keys}]`, 'cm-vcite') }).range(from + s, from + close + 1));
        }
        return close + 1;
      }
      // \url{u} and \href{u}{text} → links.
      if (name === 'url' && t[argAt] === '{') {
        const close = matchBrace(t, argAt, t.length);
        if (close < 0) return null;
        const url = t.slice(argAt + 1, close);
        if (!touches(from + s, from + close + 1)) deco.push(Decoration.replace({ widget: new TokenWidget(url, 'cm-vlink', url) }).range(from + s, from + close + 1));
        return close + 1;
      }
      if (name === 'href' && t[argAt] === '{') {
        const c1 = matchBrace(t, argAt, t.length); if (c1 < 0) return null;
        if (t[c1 + 1] !== '{') return null;
        const c2 = matchBrace(t, c1 + 1, t.length); if (c2 < 0) return null;
        const url = t.slice(argAt + 1, c1), label = t.slice(c1 + 2, c2);
        if (!touches(from + s, from + c2 + 1)) deco.push(Decoration.replace({ widget: new TokenWidget(label || url, 'cm-vlink', url) }).range(from + s, from + c2 + 1));
        return c2 + 1;
      }
      // Typography: conceal wrapper, style content, recurse into it (nesting).
      const cls = STYLE[name];
      if (cls && t[argAt] === '{') {
        const close = matchBrace(t, argAt, t.length);
        if (close <= argAt + 1) return null;
        const full = [s, close + 1] as const;
        if (touches(from + full[0], from + full[1])) return close + 1; // reveal raw
        deco.push(conceal.range(from + s, from + argAt + 1));
        deco.push(Decoration.mark({ class: cls }).range(from + argAt + 1, from + close));
        deco.push(conceal.range(from + close, from + close + 1));
        scan(argAt + 1, close); // nested commands inside the content
        return close + 1;
      }
      return null;
    }
  }
  return Decoration.set(deco, true);
}
