# User guide

## Everyday use

1. Add the server to your paper project's `.mcp.json` (see the README), restart Claude Code.
2. Ask Claude to *"render a preview"*. A browser tab opens with the live PDF.
3. From then on it's automatic — every edit (Claude's or your own saves) recompiles and the
   preview reloads. Say it once; you don't repeat it.

Toolbar: **⏱ History** (change checkpoints + diffs), **⬆ Export .zip**, **⤓ Download PDF**, and
**Open in Overleaf ↗** (when available — see below).

## Getting your paper into Overleaf

There are three ways, depending on your setup. The tool can't push to Overleaf *for* you without
your credentials, so these keep you in control.

### 1. Upload a clean zip (works for everyone)

Click **⬆ Export .zip**. You get a zip containing only the build inputs — `.tex`, `.bib`,
`.cls`/`.sty`/`.bst`, and figures — with build artifacts (`.aux`, `.log`, the compiled PDF),
`.git/`, and `node_modules/` left out. In Overleaf: **New Project → Upload Project**, drop the zip.

This is the reliable, universal path — no account linking, no public repo needed.

### 2. One-click "Open in Overleaf" (public GitHub repos)

If your project is a git repo with a **public** GitHub `origin`, the toolbar shows
**Open in Overleaf ↗**. Clicking it asks Overleaf to import your repo's current-branch archive
directly — a new project, one click. It only works if the repo is public, because Overleaf's
servers fetch the archive over the internet.

### 3. Sync to an existing Overleaf project (Overleaf Premium — Git bridge)

Overleaf Premium exposes each project as a git remote. Set it up once, yourself (your token is a
credential the tool never handles):

```bash
git remote add overleaf https://git.overleaf.com/<your-project-id>
# use your Overleaf git token when git prompts for a password
git push overleaf <branch>
```

After that, publishing an update is just `git push overleaf` — you can ask Claude to run it.

## Notes

- The compiled PDF is an approximation of what Overleaf produces (a current TeX Live via WASM),
  not a guaranteed bit-identical match. It's accurate for the vast majority of papers; always do
  a final compile on your target (Overleaf or your submission system).
- Change history is stored under a hidden git ref (`refs/latex-preview/checkpoints`) and never
  touches your branches, `git log`, or working tree.
