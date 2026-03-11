import path from 'node:path';

export const E2E_ROOT = path.resolve(process.cwd(), 'tmp', 'e2e');
export const E2E_HOME = path.join(E2E_ROOT, 'home');
export const E2E_WORKSPACES_ROOT = path.join(E2E_ROOT, 'workspaces');
export const E2E_DATABASE_PATH = path.join(E2E_ROOT, 'auth.db');
export const E2E_RUNTIME_STATE = path.join(E2E_ROOT, 'runtime-state.json');

export const E2E_SERVER_PORT = '3617';
export const E2E_CLIENT_PORT = '5617';
export const E2E_HOST = '127.0.0.1';

export const E2E_ENV = {
  HOST: E2E_HOST,
  PORT: E2E_SERVER_PORT,
  VITE_PORT: E2E_CLIENT_PORT,
  JWT_SECRET: 'playwright-e2e-secret',
  DATABASE_PATH: E2E_DATABASE_PATH,
  WORKSPACES_ROOT: E2E_WORKSPACES_ROOT,
  NO_PROXY: 'localhost,127.0.0.1',
  HOME: E2E_HOME,
  USERPROFILE: E2E_HOME,
};
