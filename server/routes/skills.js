import express from 'express';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import matter from 'gray-matter';
import { validateWorkspacePath } from './projects.js';

const router = express.Router();
const PROVIDER_CONFIG_DIRECTORIES = {
  claude: '.claude',
  codex: '.codex',
};

const SKILL_SOURCE = {
  GLOBAL: 'global',
  PROJECT: 'project',
};

function normalizeProvider(providerParam) {
  if (typeof providerParam !== 'string') {
    return '';
  }
  return providerParam.trim().toLowerCase();
}

function isSupportedProvider(provider) {
  return Object.prototype.hasOwnProperty.call(PROVIDER_CONFIG_DIRECTORIES, provider);
}

function getProviderConfigDir(provider) {
  return PROVIDER_CONFIG_DIRECTORIES[provider];
}

function isIgnoredDirectoryReadError(error) {
  return error?.code === 'ENOENT' || error?.code === 'ENOTDIR';
}

function isMissingFileError(error) {
  return error?.code === 'ENOENT';
}

function createBadRequestError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function getErrorStatusCode(error) {
  return Number.isInteger(error?.statusCode) ? error.statusCode : 500;
}

function getErrorMessage(error, fallbackMessage) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallbackMessage;
}

async function getSkillDisplayName(skillMdPath, fallbackName) {
  try {
    const content = await fs.readFile(skillMdPath, 'utf8');
    const parsed = matter(content);
    const chineseName = parsed?.data?.chinese;
    if (typeof chineseName === 'string' && chineseName.trim()) {
      return chineseName.trim();
    }
  } catch (error) {
    if (!isMissingFileError(error)) {
      console.warn(`Failed to parse ${skillMdPath}:`, getErrorMessage(error, 'Unknown parse error'));
    }
  }

  return fallbackName;
}

async function readSkillDirectories(skillsMap, directoryPath, source) {
  let entries;
  try {
    entries = await fs.readdir(directoryPath, { withFileTypes: true });
  } catch (error) {
    if (isIgnoredDirectoryReadError(error)) {
      return;
    }
    throw error;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) {
      continue;
    }

    const skillValue = entry.name;
    const skillMdPath = path.join(directoryPath, skillValue, 'SKILL.md');
    const displayName = await getSkillDisplayName(skillMdPath, skillValue);

    skillsMap.set(skillValue, {
      name: displayName,
      value: skillValue,
      source,
    });
  }
}

async function resolveValidatedProjectPath(projectPathParam) {
  if (typeof projectPathParam !== 'string') {
    return null;
  }

  const trimmedPath = projectPathParam.trim();
  if (!trimmedPath) {
    return null;
  }

  const validation = await validateWorkspacePath(trimmedPath);
  if (!validation.valid) {
    throw createBadRequestError(validation.error || 'Invalid projectPath');
  }

  return validation.resolvedPath || path.resolve(trimmedPath);
}

function getSkillsDirectories(provider, projectPath) {
  const configDir = getProviderConfigDir(provider);
  const directories = [
    { path: path.join(os.homedir(), '.agents', 'skills'), source: SKILL_SOURCE.GLOBAL },
    { path: path.join(os.homedir(), configDir, 'skills'), source: SKILL_SOURCE.GLOBAL },
  ];

  if (projectPath) {
    directories.push({
      path: path.join(projectPath, configDir, 'skills'),
      source: SKILL_SOURCE.PROJECT,
    });
  }

  return directories;
}

function sortSkillsByName(skills) {
  return skills.sort((left, right) =>
    left.name.localeCompare(right.name, 'zh-Hans-CN', { sensitivity: 'base' }),
  );
}

router.get('/', async (req, res) => {
  try {
    const provider = normalizeProvider(req.query.provider);
    if (!isSupportedProvider(provider)) {
      return res.status(400).json({ error: 'provider must be "claude" or "codex"' });
    }

    const projectPath = await resolveValidatedProjectPath(req.query.projectPath);
    const skillsMap = new Map();
    const skillsDirectories = getSkillsDirectories(provider, projectPath);

    for (const directory of skillsDirectories) {
      await readSkillDirectories(skillsMap, directory.path, directory.source);
    }

    const skills = sortSkillsByName(Array.from(skillsMap.values()));
    res.json({ skills });
  } catch (error) {
    const statusCode = getErrorStatusCode(error);
    console.error('Error loading skills:', error);
    res.status(statusCode).json({ error: getErrorMessage(error, 'Failed to load skills') });
  }
});

export default router;
