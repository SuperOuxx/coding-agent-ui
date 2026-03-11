import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import type { FullConfig } from '@playwright/test';
import {
  E2E_CLIENT_PORT,
  E2E_DATABASE_PATH,
  E2E_ENV,
  E2E_HOME,
  E2E_HOST,
  E2E_ROOT,
  E2E_RUNTIME_STATE,
  E2E_SERVER_PORT,
  E2E_WORKSPACES_ROOT,
} from './runtime';

async function waitForReady(url: string, timeoutMs = 180_000): Promise<void> {
  const startAt = Date.now();
  while (Date.now() - startAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

function spawnDetached(command: string, args: string[], env: NodeJS.ProcessEnv): number {
  const child = spawn(`${command} ${args.join(' ')}`, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...env,
    },
    detached: true,
    stdio: 'ignore',
    shell: true,
    windowsHide: true,
  });
  child.unref();
  return child.pid ?? -1;
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  await fs.rm(E2E_ROOT, { recursive: true, force: true });
  await fs.mkdir(E2E_ROOT, { recursive: true });
  await fs.mkdir(E2E_HOME, { recursive: true });
  await fs.mkdir(E2E_WORKSPACES_ROOT, { recursive: true });
  await fs.rm(E2E_DATABASE_PATH, { force: true });
  await fs.rm(E2E_RUNTIME_STATE, { force: true });

  const serverPid = spawnDetached('npm.cmd', ['run', 'server'], E2E_ENV);
  await waitForReady(`http://${E2E_HOST}:${E2E_SERVER_PORT}/api/auth/status`);

  const clientPid = spawnDetached('npm.cmd', ['run', 'client'], E2E_ENV);
  await waitForReady(`http://${E2E_HOST}:${E2E_CLIENT_PORT}`);

  await fs.writeFile(
    E2E_RUNTIME_STATE,
    JSON.stringify({ serverPid, clientPid }, null, 2),
    'utf8',
  );
}
