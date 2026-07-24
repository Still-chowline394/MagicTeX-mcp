// Detect a GitHub origin remote so the viewer can offer a one-click
// "Open in Overleaf" link (Overleaf fetches the repo's public archive zip).
import { gitOrNull } from './exec.js';

export interface GitHubRemote {
  owner: string;
  repo: string;
  branch: string;
}

// Matches both remote URL forms:
//   https://github.com/owner/repo(.git)
//   git@github.com:owner/repo(.git)
const GH_RE = /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/i;

export async function getGitHubRemote(root: string): Promise<GitHubRemote | null> {
  const url = (await gitOrNull(root, ['config', '--get', 'remote.origin.url']))?.trim();
  if (!url) return null;
  const m = url.match(GH_RE);
  if (!m) return null;

  const branch = (await gitOrNull(root, ['rev-parse', '--abbrev-ref', 'HEAD']))?.trim();
  if (!branch || branch === 'HEAD') return null; // detached — no branch archive URL

  return { owner: m[1], repo: m[2], branch };
}
