import express from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { createHash } from 'crypto';
import os from 'os';
import multer from 'multer';
import { getWorkspacesRoot } from '../config.js';
import {
  addProjectManually,
  extractProjectDirectory,
  getProjectUploadsDirectoryByPath,
  initializeProjectUploadsDirectoryByPath,
} from '../projects.js';

const router = express.Router();

function sanitizeGitError(message, token) {
  if (!message || !token) return message;
  return message.replace(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '***');
}

// System-critical paths that should never be used as workspace directories
export const FORBIDDEN_PATHS = [
  // Unix
  '/',
  '/etc',
  '/bin',
  '/sbin',
  '/usr',
  '/dev',
  '/proc',
  '/sys',
  '/var',
  '/boot',
  '/root',
  '/lib',
  '/lib64',
  '/opt',
  '/tmp',
  '/run',
  // Windows
  'C:\\Windows',
  'C:\\Program Files',
  'C:\\Program Files (x86)',
  'C:\\ProgramData',
  'C:\\System Volume Information',
  'C:\\$Recycle.Bin'
];

const DEFAULT_UPLOADS_DIRECTORY = 'upload_files';
const MAX_UPLOAD_FILE_SIZE = 50 * 1024 * 1024;
const IGNORED_SCAN_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  '.next',
  'dist',
  'build',
  '.cache',
  '.turbo',
]);

const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(
      os.tmpdir(),
      'claudecodeui-file-uploads',
      String(req.user?.id ?? 'anonymous'),
    );

    fs.mkdir(uploadDir, { recursive: true })
      .then(() => cb(null, uploadDir))
      .catch((error) => cb(error));
  },
  filename: (req, file, cb) => {
    const originalExt = path.extname(file.originalname).replace(/[^.\w-]/g, '');
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${originalExt}`;
    cb(null, filename);
  },
});

const uploadSingleFile = multer({
  storage: uploadStorage,
  limits: {
    fileSize: MAX_UPLOAD_FILE_SIZE,
    files: 1,
  },
}).single('file');

function toPosixPath(inputPath) {
  return inputPath.split(path.sep).join('/');
}

function normalizeComparablePath(inputPath) {
  if (!inputPath || typeof inputPath !== 'string') {
    return '';
  }

  const withoutLongPathPrefix = inputPath.startsWith('\\\\?\\')
    ? inputPath.slice(4)
    : inputPath;
  const normalized = path.resolve(path.normalize(withoutLongPathPrefix.trim()));
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function isSamePathOrWithin(targetPath, parentPath) {
  const normalizedTarget = normalizeComparablePath(targetPath);
  const normalizedParent = normalizeComparablePath(parentPath);
  if (!normalizedTarget || !normalizedParent) {
    return false;
  }
  return (
    normalizedTarget === normalizedParent
    || normalizedTarget.startsWith(`${normalizedParent}${path.sep}`)
  );
}

function expandHomePath(rawPath) {
  if (typeof rawPath !== 'string') {
    return '';
  }
  const trimmedPath = rawPath.trim();
  if (!trimmedPath) {
    return '';
  }
  if (trimmedPath === '~') {
    return os.homedir();
  }
  if (trimmedPath.startsWith('~/') || trimmedPath.startsWith('~\\')) {
    return path.join(os.homedir(), trimmedPath.slice(2));
  }
  return trimmedPath;
}

export function parseWorkspaceRoots() {
  const rawRoots = getWorkspacesRoot();
  const workspaceRoots = String(rawRoots || '')
    .split(path.delimiter)
    .map(expandHomePath)
    .filter(Boolean)
    .map((workspaceRoot) => path.resolve(workspaceRoot));

  if (workspaceRoots.length > 0) {
    return workspaceRoots;
  }

  return [os.homedir()];
}

export async function resolvePathAllowingNonexistent(inputPath) {
  const absolutePath = path.resolve(inputPath);

  try {
    await fs.access(absolutePath);
    return await fs.realpath(absolutePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }

    const parentPath = path.dirname(absolutePath);
    try {
      const parentRealPath = await fs.realpath(parentPath);
      return path.join(parentRealPath, path.basename(absolutePath));
    } catch (parentError) {
      if (parentError.code === 'ENOENT') {
        return absolutePath;
      }
      throw parentError;
    }
  }
}

const createFileHash = async (filePath) => {
  const fileBuffer = await fs.readFile(filePath);
  return createHash('sha256').update(fileBuffer).digest('hex');
};

const moveFile = async (sourcePath, destinationPath) => {
  try {
    await fs.rename(sourcePath, destinationPath);
  } catch (error) {
    if (error.code !== 'EXDEV') {
      throw error;
    }
    await fs.copyFile(sourcePath, destinationPath);
    await fs.unlink(sourcePath).catch(() => undefined);
  }
};

const safeRemoveFile = async (filePath) => {
  if (!filePath) {
    return;
  }
  await fs.unlink(filePath).catch(() => undefined);
};

const getNextNumericFilename = async (directoryPath, originalFilename) => {
  const directoryEntries = await fs.readdir(directoryPath, { withFileTypes: true });
  let maxNumericFilename = 0;

  for (const entry of directoryEntries) {
    if (!entry.isFile()) {
      continue;
    }
    const numericValue = Number.parseInt(path.parse(entry.name).name, 10);
    if (Number.isFinite(numericValue) && numericValue > maxNumericFilename) {
      maxNumericFilename = numericValue;
    }
  }

  const nextNumericName = maxNumericFilename + 1;
  const extension = path.extname(originalFilename);
  return `${nextNumericName}${extension}`;
};

const listWorkspaceFilesByName = async (rootPath, targetFilename) => {
  const matches = [];
  const queue = [rootPath];

  while (queue.length > 0) {
    const currentPath = queue.pop();
    let entries = [];

    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        if (!IGNORED_SCAN_DIRECTORIES.has(entry.name)) {
          queue.push(entryPath);
        }
        continue;
      }

      if (entry.isFile() && entry.name === targetFilename) {
        matches.push(entryPath);
      }
    }
  }

  return matches;
};

const findMatchingWorkspaceFile = async (projectDir, originalFilename, fileSize, tempFilePath) => {
  const uploadHash = await createFileHash(tempFilePath);
  const candidateFiles = await listWorkspaceFilesByName(projectDir, originalFilename);

  for (const candidatePath of candidateFiles) {
    try {
      const candidateStats = await fs.stat(candidatePath);
      if (!candidateStats.isFile() || candidateStats.size !== fileSize) {
        continue;
      }

      const candidateHash = await createFileHash(candidatePath);
      if (candidateHash === uploadHash) {
        return candidatePath;
      }
    } catch {
      // Skip unreadable files and keep scanning.
    }
  }

  return null;
};

const resolveProjectDirectory = async (projectName) => {
  const decodedProjectName = decodeURIComponent(projectName);
  const projectDir = await extractProjectDirectory(decodedProjectName);
  if (!projectDir) {
    throw new Error(`Project not found: ${decodedProjectName}`);
  }

  const resolvedProjectDir = path.resolve(projectDir);
  const projectStats = await fs.stat(resolvedProjectDir);
  if (!projectStats.isDirectory()) {
    throw new Error(`Project path is not a directory: ${resolvedProjectDir}`);
  }

  return resolvedProjectDir;
};

/**
 * Validates that a path is safe for workspace operations
 * @param {string} requestedPath - The path to validate
 * @returns {Promise<{valid: boolean, resolvedPath?: string, error?: string}>}
 */
export async function validateWorkspacePath(requestedPath) {
  try {
    // Resolve to absolute path
    const absolutePath = path.resolve(requestedPath);

    // Check if path is a forbidden system directory
    const normalizedPath = path.normalize(absolutePath);
    if (FORBIDDEN_PATHS.includes(normalizedPath) || normalizedPath === '/') {
      return {
        valid: false,
        error: 'Cannot use system-critical directories as workspace locations'
      };
    }

    // Additional check for paths starting with forbidden directories
    for (const forbidden of FORBIDDEN_PATHS) {
      if (normalizedPath === forbidden ||
          normalizedPath.startsWith(forbidden + path.sep)) {
        // Exception: /var/tmp and similar user-accessible paths might be allowed
        // but /var itself and most /var subdirectories should be blocked
        if (forbidden === '/var' &&
            (normalizedPath.startsWith('/var/tmp') ||
             normalizedPath.startsWith('/var/folders'))) {
          continue; // Allow these specific cases
        }

        return {
          valid: false,
          error: `Cannot create workspace in system directory: ${forbidden}`
        };
      }
    }

    const realPath = await resolvePathAllowingNonexistent(absolutePath);
    const workspaceRoots = parseWorkspaceRoots();
    const resolvedWorkspaceRoots = await Promise.all(
      workspaceRoots.map((workspaceRoot) => resolvePathAllowingNonexistent(workspaceRoot)),
    );
    const isAllowedRoot = resolvedWorkspaceRoots.some((workspaceRoot) => (
      isSamePathOrWithin(realPath, workspaceRoot)
    ));

    if (!isAllowedRoot) {
      return {
        valid: false,
        error: `Workspace path must be within the allowed workspace root: ${workspaceRoots.join(path.delimiter)}`
      };
    }

    // Additional symlink check for existing paths
    try {
      await fs.access(absolutePath);
      const stats = await fs.lstat(absolutePath);

      if (stats.isSymbolicLink()) {
        // Verify symlink target is also within allowed root
        const linkTarget = await fs.readlink(absolutePath);
        const resolvedTarget = path.resolve(path.dirname(absolutePath), linkTarget);
        const realTarget = await fs.realpath(resolvedTarget);

        const symlinkInAllowedRoots = resolvedWorkspaceRoots.some((workspaceRoot) => (
          isSamePathOrWithin(realTarget, workspaceRoot)
        ));
        if (!symlinkInAllowedRoots) {
          return {
            valid: false,
            error: 'Symlink target is outside the allowed workspace root'
          };
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      // Path doesn't exist - that's fine for new workspace creation
    }

    return {
      valid: true,
      resolvedPath: realPath
    };

  } catch (error) {
    return {
      valid: false,
      error: `Path validation failed: ${error.message}`
    };
  }
}

router.post('/:projectName/files/init', async (req, res) => {
  try {
    const projectDir = await resolveProjectDirectory(req.params.projectName);
    const { uploadsDirectory, created } = await initializeProjectUploadsDirectoryByPath(projectDir);

    res.json({
      success: true,
      created,
      uploadsDirectory,
      referencePrefix: `@${uploadsDirectory}/`,
    });
  } catch (error) {
    console.error('Error initializing uploads directory:', error);
    res.status(500).json({ error: error.message || 'Failed to initialize uploads directory' });
  }
});

router.post('/:projectName/files/upload', (req, res) => {
  uploadSingleFile(req, res, async (uploadError) => {
    if (uploadError) {
      return res.status(400).json({ error: uploadError.message || 'File upload failed' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const tempFilePath = req.file.path;

    try {
      const projectDir = await resolveProjectDirectory(req.params.projectName);
      const uploadsDirectory = await getProjectUploadsDirectoryByPath(projectDir);
      const normalizedUploadsDirectory = uploadsDirectory || DEFAULT_UPLOADS_DIRECTORY;
      const uploadsPath = path.join(projectDir, normalizedUploadsDirectory);
      await fs.mkdir(uploadsPath, { recursive: true });

      const existingWorkspaceFile = await findMatchingWorkspaceFile(
        projectDir,
        req.file.originalname,
        req.file.size,
        tempFilePath,
      );

      if (existingWorkspaceFile) {
        await safeRemoveFile(tempFilePath);
        const relativePath = toPosixPath(path.relative(projectDir, existingWorkspaceFile));
        const reference = `@${relativePath}`;
        return res.json({ success: true, reference, reusedExisting: true });
      }

      const newFilename = await getNextNumericFilename(uploadsPath, req.file.originalname);
      const destinationPath = path.join(uploadsPath, newFilename);
      await moveFile(tempFilePath, destinationPath);

      const reference = `@${toPosixPath(path.join(normalizedUploadsDirectory, newFilename))}`;
      res.json({ success: true, reference, filename: newFilename, reusedExisting: false });
    } catch (error) {
      await safeRemoveFile(tempFilePath);
      console.error('Error uploading project file:', error);
      res.status(500).json({ error: error.message || 'Failed to upload file' });
    }
  });
});

/**
 * Create a new workspace
 * POST /api/projects/create-workspace
 *
 * Body:
 * - workspaceType: 'existing' | 'new'
 * - path: string (workspace path)
 * - githubUrl?: string (optional, for new workspaces)
 * - githubTokenId?: number (optional, ID of stored token)
 * - newGithubToken?: string (optional, one-time token)
 */
router.post('/create-workspace', async (req, res) => {
  try {
    const { workspaceType, path: workspacePath, githubUrl, githubTokenId, newGithubToken } = req.body;

    // Validate required fields
    if (!workspaceType || !workspacePath) {
      return res.status(400).json({ error: 'workspaceType and path are required' });
    }

    if (!['existing', 'new'].includes(workspaceType)) {
      return res.status(400).json({ error: 'workspaceType must be "existing" or "new"' });
    }

    // Validate path safety before any operations
    const validation = await validateWorkspacePath(workspacePath);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Invalid workspace path',
        details: validation.error
      });
    }

    const absolutePath = validation.resolvedPath;

    // Handle existing workspace
    if (workspaceType === 'existing') {
      // Check if the path exists
      try {
        await fs.access(absolutePath);
        const stats = await fs.stat(absolutePath);

        if (!stats.isDirectory()) {
          return res.status(400).json({ error: 'Path exists but is not a directory' });
        }
      } catch (error) {
        if (error.code === 'ENOENT') {
          return res.status(404).json({ error: 'Workspace path does not exist' });
        }
        throw error;
      }

      // Add the existing workspace to the project list
      const project = await addProjectManually(absolutePath);
      await initializeProjectUploadsDirectoryByPath(project.path || absolutePath);

      return res.json({
        success: true,
        project,
        message: 'Existing workspace added successfully'
      });
    }

    // Handle new workspace creation
    if (workspaceType === 'new') {
      // Create the directory if it doesn't exist
      await fs.mkdir(absolutePath, { recursive: true });

      // If GitHub URL is provided, clone the repository
      if (githubUrl) {
        let githubToken = null;

        // Get GitHub token if needed
        if (githubTokenId) {
          // Fetch token from database
          const token = await getGithubTokenById(githubTokenId, req.user.id);
          if (!token) {
            // Clean up created directory
            await fs.rm(absolutePath, { recursive: true, force: true });
            return res.status(404).json({ error: 'GitHub token not found' });
          }
          githubToken = token.github_token;
        } else if (newGithubToken) {
          githubToken = newGithubToken;
        }

        // Extract repo name from URL for the clone destination
        const normalizedUrl = githubUrl.replace(/\/+$/, '').replace(/\.git$/, '');
        const repoName = normalizedUrl.split('/').pop() || 'repository';
        const clonePath = path.join(absolutePath, repoName);

        // Check if clone destination already exists to prevent data loss
        try {
          await fs.access(clonePath);
          return res.status(409).json({
            error: 'Directory already exists',
            details: `The destination path "${clonePath}" already exists. Please choose a different location or remove the existing directory.`
          });
        } catch (err) {
          // Directory doesn't exist, which is what we want
        }

        // Clone the repository into a subfolder
        try {
          await cloneGitHubRepository(githubUrl, clonePath, githubToken);
        } catch (error) {
          // Only clean up if clone created partial data (check if dir exists and is empty or partial)
          try {
            const stats = await fs.stat(clonePath);
            if (stats.isDirectory()) {
              await fs.rm(clonePath, { recursive: true, force: true });
            }
          } catch (cleanupError) {
            // Directory doesn't exist or cleanup failed - ignore
          }
          throw new Error(`Failed to clone repository: ${error.message}`);
        }

        // Add the cloned repo path to the project list
        const project = await addProjectManually(clonePath);
        await initializeProjectUploadsDirectoryByPath(project.path || clonePath);

        return res.json({
          success: true,
          project,
          message: 'New workspace created and repository cloned successfully'
        });
      }

      // Add the new workspace to the project list (no clone)
      const project = await addProjectManually(absolutePath);
      await initializeProjectUploadsDirectoryByPath(project.path || absolutePath);

      return res.json({
        success: true,
        project,
        message: 'New workspace created successfully'
      });
    }

  } catch (error) {
    console.error('Error creating workspace:', error);
    res.status(500).json({
      error: error.message || 'Failed to create workspace',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * Helper function to get GitHub token from database
 */
async function getGithubTokenById(tokenId, userId) {
  const { getDatabase } = await import('../database/db.js');
  const db = await getDatabase();

  const credential = await db.get(
    'SELECT * FROM user_credentials WHERE id = ? AND user_id = ? AND credential_type = ? AND is_active = 1',
    [tokenId, userId, 'github_token']
  );

  // Return in the expected format (github_token field for compatibility)
  if (credential) {
    return {
      ...credential,
      github_token: credential.credential_value
    };
  }

  return null;
}

/**
 * Clone repository with progress streaming (SSE)
 * GET /api/projects/clone-progress
 */
router.get('/clone-progress', async (req, res) => {
  const { path: workspacePath, githubUrl, githubTokenId, newGithubToken } = req.query;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  };

  try {
    if (!workspacePath || !githubUrl) {
      sendEvent('error', { message: 'workspacePath and githubUrl are required' });
      res.end();
      return;
    }

    const validation = await validateWorkspacePath(workspacePath);
    if (!validation.valid) {
      sendEvent('error', { message: validation.error });
      res.end();
      return;
    }

    const absolutePath = validation.resolvedPath;

    await fs.mkdir(absolutePath, { recursive: true });

    let githubToken = null;
    if (githubTokenId) {
      const token = await getGithubTokenById(parseInt(githubTokenId), req.user.id);
      if (!token) {
        await fs.rm(absolutePath, { recursive: true, force: true });
        sendEvent('error', { message: 'GitHub token not found' });
        res.end();
        return;
      }
      githubToken = token.github_token;
    } else if (newGithubToken) {
      githubToken = newGithubToken;
    }

    const normalizedUrl = githubUrl.replace(/\/+$/, '').replace(/\.git$/, '');
    const repoName = normalizedUrl.split('/').pop() || 'repository';
    const clonePath = path.join(absolutePath, repoName);

    // Check if clone destination already exists to prevent data loss
    try {
      await fs.access(clonePath);
      sendEvent('error', { message: `Directory "${repoName}" already exists. Please choose a different location or remove the existing directory.` });
      res.end();
      return;
    } catch (err) {
      // Directory doesn't exist, which is what we want
    }

    let cloneUrl = githubUrl;
    if (githubToken) {
      try {
        const url = new URL(githubUrl);
        url.username = githubToken;
        url.password = '';
        cloneUrl = url.toString();
      } catch (error) {
        // SSH URL or invalid - use as-is
      }
    }

    sendEvent('progress', { message: `Cloning into '${repoName}'...` });

    const gitProcess = spawn('git', ['clone', '--progress', cloneUrl, clonePath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0'
      }
    });

    let lastError = '';

    gitProcess.stdout.on('data', (data) => {
      const message = data.toString().trim();
      if (message) {
        sendEvent('progress', { message });
      }
    });

    gitProcess.stderr.on('data', (data) => {
      const message = data.toString().trim();
      lastError = message;
      if (message) {
        sendEvent('progress', { message });
      }
    });

    gitProcess.on('close', async (code) => {
      if (code === 0) {
        try {
          const project = await addProjectManually(clonePath);
          await initializeProjectUploadsDirectoryByPath(project.path || clonePath);
          sendEvent('complete', { project, message: 'Repository cloned successfully' });
        } catch (error) {
          sendEvent('error', { message: `Clone succeeded but failed to add project: ${error.message}` });
        }
      } else {
        const sanitizedError = sanitizeGitError(lastError, githubToken);
        let errorMessage = 'Git clone failed';
        if (lastError.includes('Authentication failed') || lastError.includes('could not read Username')) {
          errorMessage = 'Authentication failed. Please check your credentials.';
        } else if (lastError.includes('Repository not found')) {
          errorMessage = 'Repository not found. Please check the URL and ensure you have access.';
        } else if (lastError.includes('already exists')) {
          errorMessage = 'Directory already exists';
        } else if (sanitizedError) {
          errorMessage = sanitizedError;
        }
        try {
          await fs.rm(clonePath, { recursive: true, force: true });
        } catch (cleanupError) {
          console.error('Failed to clean up after clone failure:', sanitizeGitError(cleanupError.message, githubToken));
        }
        sendEvent('error', { message: errorMessage });
      }
      res.end();
    });

    gitProcess.on('error', (error) => {
      if (error.code === 'ENOENT') {
        sendEvent('error', { message: 'Git is not installed or not in PATH' });
      } else {
        sendEvent('error', { message: error.message });
      }
      res.end();
    });

    req.on('close', () => {
      gitProcess.kill();
    });

  } catch (error) {
    sendEvent('error', { message: error.message });
    res.end();
  }
});

/**
 * Helper function to clone a GitHub repository
 */
function cloneGitHubRepository(githubUrl, destinationPath, githubToken = null) {
  return new Promise((resolve, reject) => {
    let cloneUrl = githubUrl;

    if (githubToken) {
      try {
        const url = new URL(githubUrl);
        url.username = githubToken;
        url.password = '';
        cloneUrl = url.toString();
      } catch (error) {
        // SSH URL - use as-is
      }
    }

    const gitProcess = spawn('git', ['clone', '--progress', cloneUrl, destinationPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0'
      }
    });

    let stdout = '';
    let stderr = '';

    gitProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    gitProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    gitProcess.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        let errorMessage = 'Git clone failed';

        if (stderr.includes('Authentication failed') || stderr.includes('could not read Username')) {
          errorMessage = 'Authentication failed. Please check your GitHub token.';
        } else if (stderr.includes('Repository not found')) {
          errorMessage = 'Repository not found. Please check the URL and ensure you have access.';
        } else if (stderr.includes('already exists')) {
          errorMessage = 'Directory already exists';
        } else if (stderr) {
          errorMessage = stderr;
        }

        reject(new Error(errorMessage));
      }
    });

    gitProcess.on('error', (error) => {
      if (error.code === 'ENOENT') {
        reject(new Error('Git is not installed or not in PATH'));
      } else {
        reject(error);
      }
    });
  });
}

export default router;
