import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { E2E_RUNTIME_STATE } from './runtime';

async function killProcessTree(pid: number): Promise<void> {
  if (!Number.isInteger(pid) || pid <= 0) {
    return;
  }

  await new Promise<void>((resolve) => {
    const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });

    killer.on('exit', () => resolve());
    killer.on('error', () => resolve());
  });
}

export default async function globalTeardown(): Promise<void> {
  try {
    const rawState = await fs.readFile(E2E_RUNTIME_STATE, 'utf8');
    const state = JSON.parse(rawState) as { serverPid?: number; clientPid?: number };
    await killProcessTree(state.clientPid ?? -1);
    await killProcessTree(state.serverPid ?? -1);
  } catch {
    // Ignore missing/invalid state file.
  } finally {
    await fs.rm(E2E_RUNTIME_STATE, { force: true }).catch(() => undefined);
  }
}
