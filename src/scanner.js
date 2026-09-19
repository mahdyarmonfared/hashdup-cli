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
    if (IGNORE_DIRS.has(entry.name) || entry.name.startsWith('.trash')) {
      continue;
    }

    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      await collectFiles(fullPath, filesList);
    } else if (entry.isFile()) {
      try {
        const stat = await fs.stat(fullPath);
        filesList.push({ path: fullPath, size: stat.size });
      } catch {
        // Ignore files that cannot be accessed
      }
    }
  }

  return filesList;
}

/**
 * Main scanner function with two-phase detection (size filtering + stream hashing)
 */
export async function findDuplicates(targetDir, options = {}) {
  const {
    algorithm = 'sha256',
    deleteDuplicates = false,
    trashDir = null,
    onProgress = null
  } = options;

  const absoluteTarget = path.resolve(targetDir);
  const allFiles = await collectFiles(absoluteTarget);

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
            const destPath = path.join(trashDir, path.basename(dupPath));
            await fs.rename(dupPath, destPath);
          } else if (deleteDuplicates) {
            await fs.unlink(dupPath);
          }
          deletedFiles.push(dupPath);
        } catch {
          // Handle file removal failure
        }
      }
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
