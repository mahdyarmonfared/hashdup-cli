import fs from 'node:fs/promises';
import path from 'node:path';
import { computeFileHash } from './hasher.js';

const IGNORE_DIRS = new Set(['.git', 'node_modules', '.cache', '.DS_Store']);

/**
 * Scan directory recursively and collect all file paths and sizes
 */
async function collectFiles(dirPath, filesList = []) {
  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return filesList;
  }

  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name) || entry.name.startsWith('.trash') || entry.name.startsWith('.hashdup')) {
      continue;
    }

    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      await collectFiles(fullPath, filesList);
    } else if (entry.isFile()) {
      try {
        const stat = await fs.stat(fullPath);
        filesList.push({ path: fullPath, size: stat.size, mtimeMs: stat.mtimeMs });
      } catch {
        // Ignore files that cannot be accessed
      }
    }
  }

  return filesList;
}

/**
 * Safely move a file across devices (handles EXDEV errors)
 */
export async function safeMoveFile(source, destination) {
  try {
    await fs.rename(source, destination);
  } catch (err) {
    if (err.code === 'EXDEV') {
      await fs.copyFile(source, destination);
      await fs.unlink(source);
    } else {
      throw err;
    }
  }
}

/**
 * Generate collision-safe path in trash directory
 */
export async function getUniqueTrashPath(targetDir, fileName) {
  let dest = path.join(targetDir, fileName);
  try {
    await fs.access(dest);
  } catch {
    return dest;
  }

  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  let counter = 1;

  while (true) {
    dest = path.join(targetDir, `${base} (${counter})${ext}`);
    try {
      await fs.access(dest);
      counter++;
    } catch {
      return dest;
    }
  }
}

const HISTORY_FILE = '.hashdup-history.json';

export async function saveTrashHistory(targetDir, moves) {
  if (moves.length === 0) return;
  const historyPath = path.join(targetDir, HISTORY_FILE);
  let historyList = [];
  try {
    const data = await fs.readFile(historyPath, 'utf8');
    historyList = JSON.parse(data);
    if (!Array.isArray(historyList)) historyList = [];
  } catch {
    // History file does not exist yet
  }

  historyList.push({
    timestamp: new Date().toISOString(),
    moves
  });

  try {
    await fs.writeFile(historyPath, JSON.stringify(historyList, null, 2), 'utf8');
  } catch (err) {
    console.error(`Failed to save trash history: ${err.message}`);
  }
}

export async function undoLastTrash(targetDir) {
  const absoluteTarget = path.resolve(targetDir);
  const historyPath = path.join(absoluteTarget, HISTORY_FILE);

  let historyList = [];
  try {
    const data = await fs.readFile(historyPath, 'utf8');
    historyList = JSON.parse(data);
  } catch {
    return {
      success: false,
      message: 'No undo history found in this directory.'
    };
  }

  if (!Array.isArray(historyList) || historyList.length === 0) {
    return {
      success: false,
      message: 'No actions to undo.'
    };
  }

  const lastAction = historyList.pop();
  let revertedCount = 0;

  for (const move of lastAction.moves) {
    try {
      await fs.access(move.trashPath);
      await fs.mkdir(path.dirname(move.originalPath), { recursive: true });
      await safeMoveFile(move.trashPath, move.originalPath);
      revertedCount++;
    } catch {
      // Continue restoring other files
    }
  }

  // Update history file
  try {
    if (historyList.length > 0) {
      await fs.writeFile(historyPath, JSON.stringify(historyList, null, 2), 'utf8');
    } else {
      await fs.unlink(historyPath);
    }
  } catch {}

  return {
    success: true,
    revertedCount,
    totalCount: lastAction.moves.length
  };
}

/**
 * Main scanner function with two-phase detection (size filtering + stream hashing)
 */
export async function findDuplicates(targetDir, options = {}) {
  const {
    algorithm = 'sha256',
    deleteDuplicates = false,
    trashDir = null,
    cleanZeroBytes = false,
    onProgress = null
  } = options;

  const absoluteTarget = path.resolve(targetDir);
  const allFiles = await collectFiles(absoluteTarget);
  const fileMetaMap = new Map(allFiles.map(f => [f.path, f.mtimeMs]));

  const zeroByteFiles = [];
  const sizeMap = new Map();

  // Phase 1: Group files by exact byte size
  for (const file of allFiles) {
    if (file.size === 0) {
      zeroByteFiles.push(file.path);
      continue;
    }

    if (!sizeMap.has(file.size)) {
      sizeMap.set(file.size, []);
    }
    sizeMap.get(file.size).push(file.path);
  }

  // Phase 2: Compute cryptographic hashes only for files with identical sizes
  const candidates = [];
  for (const [size, paths] of sizeMap.entries()) {
    if (paths.length > 1) {
      candidates.push({ size, paths });
    }
  }

  let processedCount = 0;
  const duplicateGroups = [];
  let totalWastedBytes = 0;

  for (const candidate of candidates) {
    const hashMap = new Map();

    for (const filePath of candidate.paths) {
      try {
        const hash = await computeFileHash(filePath, algorithm);
        if (!hashMap.has(hash)) {
          hashMap.set(hash, []);
        }
        hashMap.get(hash).push(filePath);
      } catch {
        // Skip unreadable files
      }

      processedCount++;
      if (onProgress) {
        onProgress(processedCount, candidate.paths.length);
      }
    }

    for (const [hash, filePaths] of hashMap.entries()) {
      if (filePaths.length > 1) {
        // Deterministic survivor selection:
        // 1. Oldest modified file is preserved as the original (earliest mtime)
        // 2. Tie-break lexicographically by path for 100% deterministic reproducibility across filesystems
        filePaths.sort((a, b) => {
          const timeA = fileMetaMap.get(a) || 0;
          const timeB = fileMetaMap.get(b) || 0;
          if (timeA !== timeB) return timeA - timeB;
          return a.localeCompare(b);
        });

        duplicateGroups.push({
          hash,
          size: candidate.size,
          files: filePaths
        });
        totalWastedBytes += (filePaths.length - 1) * candidate.size;
      }
    }
  }

  // Phase 3: Action handling (delete or move to trash if requested)
  const deletedFiles = [];
  const trashMoves = [];

  if (deleteDuplicates || trashDir) {
    if (trashDir) {
      await fs.mkdir(trashDir, { recursive: true });
    }

    for (const group of duplicateGroups) {
      // Keep the first file as the original, act on the rest
      const duplicatesToRemove = group.files.slice(1);
      for (const dupPath of duplicatesToRemove) {
        try {
          if (trashDir) {
            const destPath = await getUniqueTrashPath(trashDir, path.basename(dupPath));
            await safeMoveFile(dupPath, destPath);
            trashMoves.push({ originalPath: dupPath, trashPath: destPath });
          } else if (deleteDuplicates) {
            await fs.unlink(dupPath);
          }
          deletedFiles.push(dupPath);
        } catch {
          // Handle file removal failure
        }
      }
    }

    // Clean zero-byte empty files if requested
    if (cleanZeroBytes) {
      for (const emptyPath of zeroByteFiles) {
        try {
          if (trashDir) {
            const destPath = await getUniqueTrashPath(trashDir, path.basename(emptyPath));
            await safeMoveFile(emptyPath, destPath);
            trashMoves.push({ originalPath: emptyPath, trashPath: destPath, isZeroByte: true });
          } else if (deleteDuplicates) {
            await fs.unlink(emptyPath);
          }
          deletedFiles.push(emptyPath);
        } catch {
          // Ignore removal error
        }
      }
    }

    if (trashDir && trashMoves.length > 0) {
      await saveTrashHistory(absoluteTarget, trashMoves);
    }
  }

  return {
    targetDir: absoluteTarget,
    totalScanned: allFiles.length,
    duplicateGroups,
    zeroByteFiles,
    totalWastedBytes,
    deletedFiles
  };
}
