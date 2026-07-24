// The one source of truth for "which project are we previewing". Set by the
// coordinator on each render_preview; read by the git endpoints. A tiny standalone
// module (no imports) so the coordinator and preview server can share it without
// an import cycle. Defaults to cwd — in normal use Claude Code spawns the MCP
// server with cwd = the user's project, so this is correct even before the first
// render_preview.
let projectRoot = process.cwd();

export function setProjectRoot(root: string): void { projectRoot = root; }
export function getProjectRoot(): string { return projectRoot; }
