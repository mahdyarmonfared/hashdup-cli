import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { computeFileHash } from '../src/hasher.js';
import { findDuplicates, undoLastTrash } from '../src/scanner.js';
import { formatBytes } from '../src/formatter.js';

test('computeFileHash returns valid SHA-256 hex string', async () => {
  const tempFile = path.join(os.tmpdir(), `hash-test-${Date.now()}.txt`);
  await fs.writeFile(tempFile, 'Hello Clean Code 2026');

  try {
    const hash = await computeFileHash(tempFile, 'sha256');
    assert.equal(typeof hash, 'string');
    assert.equal(hash.length, 64);
  } finally {
    await fs.unlink(tempFile);
  }
});

test('formatBytes converts units correctly', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(2048), '2 KB');
  assert.equal(formatBytes(10485760), '10 MB');
});

test('findDuplicates detects duplicate files and empty zero-byte files', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hashdup-test-'));
  const subDir = path.join(tempDir, 'subfolder');
  await fs.mkdir(subDir);

  try {
    const content = 'Identical contents for testing duplicate detection.';
    await fs.writeFile(path.join(tempDir, 'original.txt'), content);
    await fs.writeFile(path.join(subDir, 'copy.txt'), content);
    await fs.writeFile(path.join(tempDir, 'unique.txt'), 'Totally different content');
    await fs.writeFile(path.join(tempDir, 'empty.txt'), '');

    const result = await findDuplicates(tempDir);

    assert.equal(result.totalScanned, 4);
    assert.equal(result.duplicateGroups.length, 1);
    assert.equal(result.duplicateGroups[0].files.length, 2);
    assert.equal(result.zeroByteFiles.length, 1);
    assert.ok(result.totalWastedBytes > 0);

    // Test moving to trash
    const trashDir = path.join(tempDir, 'trash_bin');
    const trashResult = await findDuplicates(tempDir, { trashDir });

    assert.equal(trashResult.deletedFiles.length, 1);
    const originalStillExists = await fs.stat(path.join(tempDir, 'original.txt')).then(() => true).catch(() => false);
    assert.ok(originalStillExists, 'Original file must be preserved');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('findDuplicates deterministically preserves the oldest file as original', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hashdup-mtime-test-'));

  try {
    const filePathNewer = path.join(tempDir, 'file_newer.txt');
    const filePathOlder = path.join(tempDir, 'file_older.txt');
    const duplicateContent = 'Same content for mtime determinism test';

    await fs.writeFile(filePathNewer, duplicateContent);
    await fs.writeFile(filePathOlder, duplicateContent);

    // Explicitly set older file's mtime to 1 hour ago
    const oneHourAgo = new Date(Date.now() - 3600 * 1000);
    await fs.utimes(filePathOlder, oneHourAgo, oneHourAgo);

    const result = await findDuplicates(tempDir);
    assert.equal(result.duplicateGroups.length, 1);

    // Index 0 is the survivor original
    const survivor = result.duplicateGroups[0].files[0];
    assert.equal(survivor, filePathOlder, 'Oldest file by mtime must be chosen as the original survivor');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('findDuplicates avoids overwriting identical basenames when moving to trashDir', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hashdup-trash-test-'));
  const subDir1 = path.join(tempDir, 'sub1');
  const subDir2 = path.join(tempDir, 'sub2');
  const trashDir = path.join(tempDir, 'my_trash');
  await fs.mkdir(subDir1);
  await fs.mkdir(subDir2);

  try {
    const content = 'Exact duplicate content across folders';
    await fs.writeFile(path.join(tempDir, 'file.txt'), content);
    await fs.writeFile(path.join(subDir1, 'file.txt'), content);
    await fs.writeFile(path.join(subDir2, 'file.txt'), content);

    const result = await findDuplicates(tempDir, { trashDir });

    assert.equal(result.duplicateGroups.length, 1);
    assert.equal(result.duplicateGroups[0].files.length, 3);
    assert.equal(result.deletedFiles.length, 2);

    // Verify trash contains both moved files without overwriting
    const trashFiles = await fs.readdir(trashDir);
    assert.equal(trashFiles.length, 2);
    assert.ok(trashFiles.includes('file.txt'));
    assert.ok(trashFiles.includes('file (1).txt'));
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('undoLastTrash safely restores files from trash back to their original locations', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hashdup-undo-test-'));
  const subDir = path.join(tempDir, 'nested');
  const trashDir = path.join(tempDir, '.hashdup-trash');
  await fs.mkdir(subDir);

  try {
    const content = 'Duplicate file content for undo test';
    const originalFile = path.join(tempDir, 'original.txt');
    const duplicateFile = path.join(subDir, 'copy.txt');

    await fs.writeFile(originalFile, content);
    await fs.writeFile(duplicateFile, content);

    // Explicitly make originalFile older so it is deterministically preserved as survivor
    const oneHourAgo = new Date(Date.now() - 3600 * 1000);
    await fs.utimes(originalFile, oneHourAgo, oneHourAgo);

    // 1. Move duplicate to trash
    const scanResult = await findDuplicates(tempDir, { trashDir });
    assert.equal(scanResult.deletedFiles.length, 1);

    // Verify copy was moved out of nested folder
    const copyExistsBeforeUndo = await fs.stat(duplicateFile).then(() => true).catch(() => false);
    assert.equal(copyExistsBeforeUndo, false, 'Duplicate file should be moved away');

    // 2. Perform Undo
    const undoResult = await undoLastTrash(tempDir);
    assert.equal(undoResult.success, true);
    assert.equal(undoResult.revertedCount, 1);

    // Verify copy is restored in original nested subfolder
    const copyExistsAfterUndo = await fs.stat(duplicateFile).then(() => true).catch(() => false);
    assert.equal(copyExistsAfterUndo, true, 'Duplicate file must be restored back to original location');

    const restoredContent = await fs.readFile(duplicateFile, 'utf8');
    assert.equal(restoredContent, content);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

