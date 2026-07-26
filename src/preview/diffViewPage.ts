// A standalone page that renders a unified diff as a side-by-side view using
// diff2html (served locally). The MCP `show_diff` tool screenshots this page and
// returns the PNG inline, so the user sees a real side-by-side diff inside the
// Claude conversation (Claude Code can't render a diff view itself). Sets
// window.__rendered / window.__empty so the screenshotter knows when to capture.
import { scriptSafeJson } from './scriptSafeJson.js';

export function diffViewHtml(diff: string): string {
  const empty = diff.trim() === '';
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>diff</title>
<link rel="stylesheet" href="/diff2html/css/diff2html.min.css">
<script src="/diff2html/js/diff2html.min.js"></script>
<style>
  body { margin: 0; background: #ffffff; font-family: system-ui, sans-serif; }
  #diff { padding: 8px; }
  #empty { padding: 18px; color: #666; font-size: 14px; }
  .d2h-file-header { background: #f3f4f6; }
  .d2h-file-list-wrapper { display: none; }
</style></head>
<body>
${empty ? '<div id="empty">No changes to show — the working tree is clean.</div>' : '<div id="diff"></div>'}
<script>
  window.__empty = ${empty ? 'true' : 'false'};
  ${empty ? '' : `try {
    var diffStr = ${scriptSafeJson(diff)};
    document.getElementById('diff').innerHTML =
      Diff2Html.html(diffStr, { drawFileList: false, matching: 'lines', outputFormat: 'side-by-side' });
  } catch (e) { document.body.innerHTML = '<pre>' + String(e) + '</pre>'; }`}
  window.__rendered = true;
</script>
</body></html>`;
}
