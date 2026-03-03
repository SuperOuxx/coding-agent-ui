import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.claude');
const CONFIG_FILE = path.join(CONFIG_DIR, 'server-settings.json');

const DEFAULTS = {
  workspacesRoot: null,
};

let cachedSettings = null;

function normalizeSettings(value) {
  const source = value && typeof value === 'object' ? value : {};
  const rootValue = typeof source.workspacesRoot === 'string'
    ? source.workspacesRoot.trim()
    : null;

  return {
    ...DEFAULTS,
    workspacesRoot: rootValue || null,
  };
}

function ensureConfigDir() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

function readSettingsFromDisk() {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    return normalizeSettings(JSON.parse(raw));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { ...DEFAULTS };
    }
    console.warn('[settings] Failed to read server settings, fallback to defaults:', error.message);
    return { ...DEFAULTS };
  }
}

function writeSettingsToDisk(settings) {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(settings, null, 2), 'utf8');
}

export function getServerSettings() {
  if (!cachedSettings) {
    cachedSettings = readSettingsFromDisk();
  }
  return { ...cachedSettings };
}

export function updateServerSettings(updates = {}) {
  const current = getServerSettings();
  const merged = normalizeSettings({ ...current, ...updates });
  writeSettingsToDisk(merged);
  cachedSettings = merged;
  return { ...merged };
}

export function getWorkspacesRoot() {
  const settings = getServerSettings();
  if (settings.workspacesRoot) {
    return settings.workspacesRoot;
  }
  if (process.env.WORKSPACES_ROOT && process.env.WORKSPACES_ROOT.trim()) {
    return process.env.WORKSPACES_ROOT.trim();
  }
  return os.homedir();
}
