// Shared git runner — execFile (no shell), used by checkpoints.ts and remote.ts.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export async function git(cwd: string, args: string[], env?: NodeJS.ProcessEnv): Promise<string> {
  const { stdout } = await run('git', args, { cwd, env: env ?? process.env, maxBuffer: 32 * 1024 * 1024, windowsHide: true });
  return stdout;
}

/** Best-effort git call that returns null instead of throwing (e.g. ref/remote missing). */
export async function gitOrNull(cwd: string, args: string[], env?: NodeJS.ProcessEnv): Promise<string | null> {
  try { return await git(cwd, args, env); } catch { return null; }
}
