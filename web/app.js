/**
 * HashDup Web UI
 * Complete CLI / Web Parity:
 * - Direct Computer Folder Scan & Safe Trash Clean (.hashdup-trash) + Undo
 * - 100% Client-Side In-Browser Duplicate File Finder using Web Crypto SHA-256
 * - Two-Phase Optimization (Size filtering + Streaming crypto hash)
 * - Zero-Byte Empty Files Detection & Cleanup
 * - Download Cleaned ZIP (Originals Only)
 */

// Disk Panel Elements
const targetDirInput = document.getElementById('targetDirInput');
const presetDownloads = document.getElementById('presetDownloads');
const presetDesktop = document.getElementById('presetDesktop');
const scanDiskBtn = document.getElementById('scanDiskBtn');
const cleanDiskBtn = document.getElementById('cleanDiskBtn');
const cleanZeroBtn = document.getElementById('cleanZeroBtn');
const undoDiskBtn = document.getElementById('undoDiskBtn');
const diskStatusMsg = document.getElementById('diskStatusMsg');

// Client-Side Dropzone Elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const folderInput = document.getElementById('folderInput');
const browseFolderBtn = document.getElementById('browseFolderBtn');
const browseFilesBtn = document.getElementById('browseFilesBtn');
const progressCard = document.getElementById('progressCard');
const progressTitle = document.getElementById('progressTitle');
const progressPercent = document.getElementById('progressPercent');
const progressFill = document.getElementById('progressFill');

// Metrics Elements
const metricsGrid = document.getElementById('metricsGrid');
const statScanned = document.getElementById('statScanned');
const statClusters = document.getElementById('statClusters');
const statDuplicates = document.getElementById('statDuplicates');
const statZeroBytes = document.getElementById('statZeroBytes');
const statWasted = document.getElementById('statWasted');

// Results Elements
const resultsSection = document.getElementById('resultsSection');
const clustersContainer = document.getElementById('clustersContainer');
const cleanFromResultsBtn = document.getElementById('cleanFromResultsBtn');
const cleanZeroFromResultsBtn = document.getElementById('cleanZeroFromResultsBtn');
const undoFromResultsBtn = document.getElementById('undoFromResultsBtn');
const cleanZeroSectionBtn = document.getElementById('cleanZeroSectionBtn');
const zeroBytesSection = document.getElementById('zeroBytesSection');
const zeroBytesBadge = document.getElementById('zeroBytesBadge');
const zeroBytesList = document.getElementById('zeroBytesList');
const exportReportBtn = document.getElementById('exportReportBtn');
const downloadCleanZipBtn = document.getElementById('downloadCleanZipBtn');
const clearBtn = document.getElementById('clearBtn');
const toolbarClearBtn = document.getElementById('toolbarClearBtn');
const loadDemoBtn = document.getElementById('loadDemoBtn');

let duplicateResults = null;
let currentClientFiles = [];
let defaultPaths = {};

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function computeSha256(file) {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function showDiskStatus(message, type = 'success') {
  if (!diskStatusMsg) return;
  diskStatusMsg.className = `disk-status-msg ${type}`;
  diskStatusMsg.innerHTML = message;
  diskStatusMsg.classList.remove('hidden');
}

// ----------------------------------------------------
// System Status & Presets Integration
// ----------------------------------------------------
async function initSystemStatus() {
  try {
    const res = await fetch('/api/status');
    if (res.ok) {
      defaultPaths = await res.json();
      if (targetDirInput && !targetDirInput.value) {
        targetDirInput.value = defaultPaths.defaultDownloads || defaultPaths.homeDir || '';
      }
    }
  } catch {
    // Running in purely static environment
  }
}
initSystemStatus();

if (presetDownloads) {
  presetDownloads.addEventListener('click', () => {
    if (defaultPaths.defaultDownloads) {
      targetDirInput.value = defaultPaths.defaultDownloads;
      scanDiskFolder();
    }
  });
}

if (presetDesktop) {
  presetDesktop.addEventListener('click', () => {
    if (defaultPaths.defaultDesktop) {
      targetDirInput.value = defaultPaths.defaultDesktop;
      scanDiskFolder();
    }
  });
}

// ----------------------------------------------------
// Direct Disk Scan, Clean, and Undo
// ----------------------------------------------------
async function scanDiskFolder() {
  const targetDir = targetDirInput.value.trim();
  if (!targetDir) {
    alert('Please enter or select a directory path.');
    return;
  }

  scanDiskBtn.disabled = true;
  scanDiskBtn.textContent = 'Scanning...';

  try {
    const res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetDir })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to scan directory');

    let totalDuplicateFiles = 0;
    data.duplicateGroups.forEach(g => {
      totalDuplicateFiles += (g.files.length - 1);
    });

    duplicateResults = {
      isDiskScan: true,
      targetDir: data.targetDir,
      totalScanned: data.totalScanned,
      duplicateGroups: data.duplicateGroups.map(g => ({
        hash: g.hash,
        size: g.size,
        files: g.files.map(filePath => ({
          name: filePath.split('/').pop(),
          fullPath: filePath,
          size: g.size
        }))
      })),
      zeroBytes: data.zeroByteFiles.map(filePath => ({
        name: filePath.split('/').pop(),
        fullPath: filePath,
        size: 0
      })),
      totalDuplicateFiles,
      totalWastedBytes: data.totalWastedBytes
    };

    if (totalDuplicateFiles > 0 || data.zeroByteFiles.length > 0) {
      showDiskStatus(
        `Found <strong>${totalDuplicateFiles}</strong> duplicate file(s) (${formatBytes(data.totalWastedBytes)} wasted) and <strong>${data.zeroByteFiles.length}</strong> zero-byte file(s) in <code>${escapeHtml(data.targetDir)}</code>.`,
        'success'
      );
    } else {
      showDiskStatus(
        `🎉 Folder <code>${escapeHtml(data.targetDir)}</code> is completely clean! No duplicate or empty files found.`,
        'success'
      );
    }

    renderDashboard(duplicateResults);
  } catch (err) {
    showDiskStatus(`❌ Scan error: ${escapeHtml(err.message)}`, 'error');
  } finally {
    scanDiskBtn.disabled = false;
    scanDiskBtn.textContent = '🔍 Scan Folder';
  }
}

async function cleanDiskDuplicates(cleanZeroBytes = false) {
  const targetDir = targetDirInput.value.trim() || (duplicateResults && duplicateResults.targetDir);
  if (!targetDir) {
    alert('Please enter or select a directory path.');
    return;
  }

  const buttonsToDisable = [
    cleanDiskBtn,
    cleanZeroBtn,
    cleanFromResultsBtn,
    cleanZeroFromResultsBtn,
    cleanZeroSectionBtn
  ].filter(Boolean);

  const prevTexts = new Map();
  buttonsToDisable.forEach(b => {
    prevTexts.set(b, b.textContent);
    b.disabled = true;
    b.textContent = 'Moving to Trash...';
  });

  try {
    const res = await fetch('/api/clean', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetDir, cleanZeroBytes })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to clean duplicates');

    if (data.removedCount > 0) {
      showDiskStatus(
        `🛡️ <strong>Safely moved ${data.removedCount} file(s)</strong> to <code>${escapeHtml(data.trashDir)}</code>! <button type="button" class="preset-btn" style="margin-left:8px" id="inlineUndoBtn">↩️ Undo Clean</button>`,
        'success'
      );
      const inlineUndoBtn = document.getElementById('inlineUndoBtn');
      if (inlineUndoBtn) inlineUndoBtn.addEventListener('click', undoDiskClean);
    } else {
      showDiskStatus('✨ No duplicate files needed cleaning.', 'success');
    }

    await scanDiskFolder();
  } catch (err) {
    showDiskStatus(`❌ Error cleaning files: ${escapeHtml(err.message)}`, 'error');
  } finally {
    buttonsToDisable.forEach(b => {
      b.disabled = false;
      if (prevTexts.has(b)) b.textContent = prevTexts.get(b);
    });
  }
}

async function undoDiskClean() {
  const targetDir = targetDirInput.value.trim() || (duplicateResults && duplicateResults.targetDir);
  if (!targetDir) return;

  const undoButtons = [undoDiskBtn, undoFromResultsBtn].filter(Boolean);
  const prevTexts = new Map();
  undoButtons.forEach(b => {
    prevTexts.set(b, b.textContent);
    b.disabled = true;
    b.textContent = 'Undoing...';
  });

  try {
    const res = await fetch('/api/undo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetDir })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Undo failed');

    showDiskStatus(
      `✅ <strong>Successfully restored ${data.revertedCount} of ${data.totalCount} file(s)</strong> back to original locations!`,
      'success'
    );
    await scanDiskFolder();
  } catch (err) {
    showDiskStatus(`❌ Undo error: ${escapeHtml(err.message)}`, 'error');
  } finally {
    undoButtons.forEach(b => {
      b.disabled = false;
      if (prevTexts.has(b)) b.textContent = prevTexts.get(b);
    });
  }
}

async function cleanClusterGroup(group, btnElement) {
  const targetDir = targetDirInput.value.trim() || (duplicateResults && duplicateResults.targetDir);
  if (!targetDir) {
    alert('No folder selected.');
    return;
  }
  const duplicatePaths = group.files.slice(1).map(f => f.fullPath).filter(Boolean);
  if (duplicatePaths.length === 0) return;

  const originalText = btnElement.textContent;
  btnElement.disabled = true;
  btnElement.textContent = 'Moving...';

  try {
    const res = await fetch('/api/clean', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetDir, filePaths: duplicatePaths })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to move cluster duplicates');

    showDiskStatus(
      `🛡️ <strong>Moved ${data.removedCount} duplicate(s)</strong> of group <code>${escapeHtml(group.hash.slice(0, 8))}</code> to Trash! <button type="button" class="preset-btn" style="margin-left:8px" id="inlineUndoBtn">↩️ Undo Clean</button>`,
      'success'
    );
    const inlineUndoBtn = document.getElementById('inlineUndoBtn');
    if (inlineUndoBtn) inlineUndoBtn.addEventListener('click', undoDiskClean);

    await scanDiskFolder();
  } catch (err) {
    showDiskStatus(`❌ Error moving cluster duplicates: ${escapeHtml(err.message)}`, 'error');
    btnElement.disabled = false;
    btnElement.textContent = originalText;
  }
}

async function cleanSingleFile(filePath, btnElement) {
  const targetDir = targetDirInput.value.trim() || (duplicateResults && duplicateResults.targetDir);
  if (!targetDir || !filePath) return;

  btnElement.disabled = true;
  btnElement.textContent = '...';

  try {
    const res = await fetch('/api/clean', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetDir, filePaths: [filePath] })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to move file');

    showDiskStatus(
      `🛡️ Moved duplicate file <code>${escapeHtml(filePath.split('/').pop())}</code> to Trash. <button type="button" class="preset-btn" style="margin-left:8px" id="inlineUndoBtn">↩️ Undo Clean</button>`,
      'success'
    );
    const inlineUndoBtn = document.getElementById('inlineUndoBtn');
    if (inlineUndoBtn) inlineUndoBtn.addEventListener('click', undoDiskClean);

    await scanDiskFolder();
  } catch (err) {
    showDiskStatus(`❌ Error moving file: ${escapeHtml(err.message)}`, 'error');
    btnElement.disabled = false;
    btnElement.textContent = '🗑️ Trash';
  }
}

scanDiskBtn.addEventListener('click', scanDiskFolder);
cleanDiskBtn.addEventListener('click', () => cleanDiskDuplicates(false));
cleanZeroBtn.addEventListener('click', () => cleanDiskDuplicates(true));
undoDiskBtn.addEventListener('click', undoDiskClean);

if (cleanFromResultsBtn) {
  cleanFromResultsBtn.addEventListener('click', () => cleanDiskDuplicates(false));
}
if (cleanZeroFromResultsBtn) {
  cleanZeroFromResultsBtn.addEventListener('click', () => cleanDiskDuplicates(true));
}
if (undoFromResultsBtn) {
  undoFromResultsBtn.addEventListener('click', undoDiskClean);
}
if (cleanZeroSectionBtn) {
  cleanZeroSectionBtn.addEventListener('click', () => cleanDiskDuplicates(true));
}

// ----------------------------------------------------
// Client-Side Drag & Drop (Two-Phase Optimization)
// ----------------------------------------------------
async function getAllFileEntries(dataTransferItemList) {
  const fileList = [];
  const queue = [];

  for (let i = 0; i < dataTransferItemList.length; i++) {
    const item = dataTransferItemList[i];
    if (item.webkitGetAsEntry) {
      const entry = item.webkitGetAsEntry();
      if (entry) queue.push(entry);
    } else if (item.getAsFile) {
      const file = item.getAsFile();
      if (file) fileList.push(file);
    }
  }

  while (queue.length > 0) {
    const entry = queue.shift();
    if (entry.isFile) {
      await new Promise((resolve) => {
        entry.file((file) => {
          fileList.push(file);
          resolve();
        }, () => resolve());
      });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const readBatch = () => new Promise((resolve) => {
        reader.readEntries((entries) => resolve(entries), () => resolve([]));
      });
      let entries;
      do {
        entries = await readBatch();
        for (const child of entries) {
          queue.push(child);
        }
      } while (entries && entries.length > 0);
    }
  }

  return fileList;
}

['dragenter', 'dragover'].forEach(name => {
  dropZone.addEventListener(name, (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-active');
  });
});

['dragleave', 'drop'].forEach(name => {
  dropZone.addEventListener(name, (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-active');
  });
});

dropZone.addEventListener('drop', async (e) => {
  let files = [];
  if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
    files = await getAllFileEntries(e.dataTransfer.items);
  } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    files = Array.from(e.dataTransfer.files);
  }
  if (files.length > 0) processFiles(files);
});

browseFolderBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  folderInput.click();
});

browseFilesBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  fileInput.click();
});

dropZone.addEventListener('click', (e) => {
  if (!e.target.closest('button')) {
    folderInput.click();
  }
});

folderInput.addEventListener('change', (e) => {
  const files = Array.from(e.target.files);
  if (files.length > 0) processFiles(files);
  folderInput.value = '';
});

fileInput.addEventListener('change', (e) => {
  const files = Array.from(e.target.files);
  if (files.length > 0) processFiles(files);
  fileInput.value = '';
});

/**
 * Optimized Two-Phase File Processing:
 * Phase 1: Group files by exact byte size.
 * Phase 2: Compute SHA-256 hashes ONLY for files that share identical byte sizes!
 */
async function processFiles(files) {
  currentClientFiles = files;
  progressCard.classList.remove('hidden');
  progressFill.style.width = '0%';
  progressPercent.textContent = '0%';
  progressTitle.textContent = 'Grouping files by size (Phase 1)...';

  const sizeMap = new Map();
  const zeroBytes = [];
  const total = files.length;

  for (let i = 0; i < total; i++) {
    const file = files[i];
    if (file.size === 0) {
      zeroBytes.push({ name: file.name, size: 0, fullPath: file.webkitRelativePath || file.name });
      continue;
    }
    if (!sizeMap.has(file.size)) {
      sizeMap.set(file.size, []);
    }
    sizeMap.get(file.size).push(file);
  }

  // Filter candidates that share byte sizes
  const candidates = [];
  for (const [size, list] of sizeMap.entries()) {
    if (list.length > 1) {
      candidates.push(...list);
    }
  }

  const hashMap = new Map();
  const candidateCount = candidates.length;

  for (let i = 0; i < candidateCount; i++) {
    const file = candidates[i];
    progressTitle.textContent = `Streaming SHA-256 for ${file.name} (${i + 1}/${candidateCount})...`;
    const pct = Math.round(((i + 1) / candidateCount) * 100);
    progressPercent.textContent = `${pct}%`;
    progressFill.style.width = `${pct}%`;

    try {
      const hash = await computeSha256(file);
      if (!hashMap.has(hash)) {
        hashMap.set(hash, {
          hash,
          size: file.size,
          files: [],
        });
      }
      hashMap.get(hash).files.push({
        name: file.name,
        fullPath: file.webkitRelativePath || file.name,
        size: file.size,
        lastModified: file.lastModified || 0,
        fileRef: file
      });
    } catch (err) {
      console.error('Failed to hash file:', file.name, err);
    }
  }

  // Filter only duplicate groups (files.length > 1)
  const duplicateGroups = Array.from(hashMap.values()).filter(g => g.files.length > 1);

  // Sort each group deterministically: oldest modified is original
  duplicateGroups.forEach(g => {
    g.files.sort((a, b) => {
      if (a.lastModified !== b.lastModified) return a.lastModified - b.lastModified;
      return a.name.localeCompare(b.name);
    });
  });

  let totalDuplicateFiles = 0;
  let totalWastedBytes = 0;

  duplicateGroups.forEach(g => {
    const redundantCount = g.files.length - 1;
    totalDuplicateFiles += redundantCount;
    totalWastedBytes += g.size * redundantCount;
  });

  duplicateResults = {
    isDiskScan: false,
    totalScanned: total,
    duplicateGroups,
    zeroBytes,
    totalDuplicateFiles,
    totalWastedBytes,
  };

  progressCard.classList.add('hidden');
  renderDashboard(duplicateResults);
}

// ----------------------------------------------------
// UI Dashboard Renderer
// ----------------------------------------------------
function renderDashboard(data) {
  metricsGrid.classList.remove('hidden');
  resultsSection.classList.remove('hidden');

  statScanned.textContent = data.totalScanned;
  statClusters.textContent = data.duplicateGroups.length;
  statDuplicates.textContent = data.totalDuplicateFiles;
  if (statZeroBytes) statZeroBytes.textContent = data.zeroBytes.length;
  statWasted.textContent = formatBytes(data.totalWastedBytes);

  if (downloadCleanZipBtn) {
    downloadCleanZipBtn.style.display = (!data.isDiskScan && data.duplicateGroups.length > 0) ? 'inline-block' : 'none';
  }

  // Toggle Action Buttons in Duplicate Groups Header
  if (cleanFromResultsBtn) {
    cleanFromResultsBtn.style.display = (data.isDiskScan && data.totalDuplicateFiles > 0) ? 'inline-block' : 'none';
  }
  if (cleanZeroFromResultsBtn) {
    cleanZeroFromResultsBtn.style.display = (data.isDiskScan && data.zeroBytes && data.zeroBytes.length > 0) ? 'inline-block' : 'none';
  }
  if (undoFromResultsBtn) {
    undoFromResultsBtn.style.display = data.isDiskScan ? 'inline-block' : 'none';
  }
  if (cleanZeroSectionBtn) {
    cleanZeroSectionBtn.style.display = (data.isDiskScan && data.zeroBytes && data.zeroBytes.length > 0) ? 'inline-block' : 'none';
  }

  clustersContainer.innerHTML = '';

  if (data.duplicateGroups.length === 0) {
    clustersContainer.innerHTML = `
      <div class="cluster-card" style="text-align: center; color: var(--color-green); padding: 30px;">
        <h3>🎉 No Duplicate Files Found!</h3>
        <p style="color: var(--text-muted); font-size: 13px; margin-top: 6px;">All ${data.totalScanned} scanned files have unique cryptographic SHA-256 signatures.</p>
      </div>
    `;
  } else {
    data.duplicateGroups.forEach((group, idx) => {
      const clusterCard = document.createElement('div');
      clusterCard.className = 'cluster-card';

      const wastedForGroup = group.size * (group.files.length - 1);

      let filesHtml = '';
      group.files.forEach((f, fIdx) => {
        const isOriginal = fIdx === 0;
        const displayPath = f.fullPath || f.name;
        filesHtml += `
          <div class="cluster-file-item">
            <span class="file-type-icon">${isOriginal ? '⭐' : '📋'}</span>
            <span class="file-item-name" title="${escapeHtml(displayPath)}">
              ${escapeHtml(displayPath)}
            </span>
            <span class="file-item-tag ${isOriginal ? 'tag-original' : 'tag-duplicate'}">
              ${isOriginal ? '✔ KEEP Original' : '↳ DUP to Trash'}
            </span>
            ${(!isOriginal && data.isDiskScan) ? `
              <button type="button" class="btn-clean-single-file" data-cluster-idx="${idx}" data-file-idx="${fIdx}" title="Move only this duplicate to trash">
                🗑️ Trash
              </button>
            ` : ''}
          </div>
        `;
      });

      clusterCard.innerHTML = `
        <div class="cluster-header">
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span class="cluster-hash-badge">SHA-256: ${group.hash.slice(0, 16)}...</span>
            <span style="font-size: 12px; color: var(--text-muted);">Size per file: <strong>${formatBytes(group.size)}</strong></span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span class="cluster-wasted-badge">-${formatBytes(wastedForGroup)} Wasted</span>
            ${data.isDiskScan ? `
              <button type="button" class="btn-clean-group" data-cluster-idx="${idx}" title="Safely move duplicates in this group to trash">
                🗑️ Trash Group Duplicates (${group.files.length - 1})
              </button>
            ` : ''}
          </div>
        </div>
        <div class="cluster-files-list">
          ${filesHtml}
        </div>
      `;

      clustersContainer.appendChild(clusterCard);
    });

    // Attach event listeners for group clean and single file clean
    if (data.isDiskScan) {
      clustersContainer.querySelectorAll('.btn-clean-group').forEach(btn => {
        btn.addEventListener('click', () => {
          const clusterIdx = parseInt(btn.dataset.clusterIdx, 10);
          const group = data.duplicateGroups[clusterIdx];
          if (group) cleanClusterGroup(group, btn);
        });
      });

      clustersContainer.querySelectorAll('.btn-clean-single-file').forEach(btn => {
        btn.addEventListener('click', () => {
          const clusterIdx = parseInt(btn.dataset.clusterIdx, 10);
          const fileIdx = parseInt(btn.dataset.fileIdx, 10);
          const group = data.duplicateGroups[clusterIdx];
          if (group && group.files[fileIdx]) {
            cleanSingleFile(group.files[fileIdx].fullPath, btn);
          }
        });
      });
    }
  }

  // Render Zero-Byte Files Section
  if (zeroBytesSection && zeroBytesList) {
    if (data.zeroBytes && data.zeroBytes.length > 0) {
      zeroBytesSection.classList.remove('hidden');
      if (zeroBytesBadge) zeroBytesBadge.textContent = `${data.zeroBytes.length} Empty File(s)`;
      zeroBytesList.innerHTML = '';
      data.zeroBytes.forEach(zb => {
        const item = document.createElement('div');
        item.className = 'zero-byte-item';
        item.innerHTML = `
          <span>📄 <code>${escapeHtml(zb.fullPath || zb.name)}</code></span>
          <span class="file-item-tag tag-duplicate">0 B • Empty</span>
        `;
        zeroBytesList.appendChild(item);
      });
    } else {
      zeroBytesSection.classList.add('hidden');
    }
  }
}

// ----------------------------------------------------
// Download Cleaned ZIP (Client-Side Mode)
// ----------------------------------------------------
if (downloadCleanZipBtn) {
  downloadCleanZipBtn.addEventListener('click', async () => {
    if (!currentClientFiles || currentClientFiles.length === 0 || !duplicateResults) return;

    // Collect all duplicate file objects to exclude
    const duplicateFileRefs = new Set();
    duplicateResults.duplicateGroups.forEach(g => {
      // Index 0 is original; index 1..N are duplicates
      for (let i = 1; i < g.files.length; i++) {
        if (g.files[i].fileRef) {
          duplicateFileRefs.add(g.files[i].fileRef);
        }
      }
    });

    const originalText = downloadCleanZipBtn.textContent;
    downloadCleanZipBtn.disabled = true;
    downloadCleanZipBtn.textContent = '⏳ Creating Clean ZIP...';

    try {
      const zip = new window.JSZip();

      for (const file of currentClientFiles) {
        if (!duplicateFileRefs.has(file)) {
          const zipPath = file.webkitRelativePath || file.name;
          zip.file(zipPath, file);
        }
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = 'HashDup_Clean_Unique_Files.zip';
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      alert(`Failed to create ZIP: ${err.message}`);
    } finally {
      downloadCleanZipBtn.disabled = false;
      downloadCleanZipBtn.textContent = originalText;
    }
  });
}

// ----------------------------------------------------
// Export JSON Report
// ----------------------------------------------------
exportReportBtn.addEventListener('click', () => {
  if (!duplicateResults) return;

  const data = JSON.stringify({
    timestamp: new Date().toISOString(),
    target: duplicateResults.targetDir || 'In-Browser Upload',
    summary: {
      totalScanned: duplicateResults.totalScanned,
      duplicateClusters: duplicateResults.duplicateGroups.length,
      redundantCopies: duplicateResults.totalDuplicateFiles,
      zeroByteCount: duplicateResults.zeroBytes.length,
      wastedBytes: duplicateResults.totalWastedBytes,
    },
    clusters: duplicateResults.duplicateGroups,
    zeroByteFiles: duplicateResults.zeroBytes,
  }, null, 2);

  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'hashdup-report.json';
  a.click();
  URL.revokeObjectURL(url);
});

function clearAll() {
  duplicateResults = null;
  currentClientFiles = [];
  metricsGrid.classList.add('hidden');
  resultsSection.classList.add('hidden');
  if (zeroBytesSection) zeroBytesSection.classList.add('hidden');
  if (diskStatusMsg) diskStatusMsg.classList.add('hidden');
  if (cleanFromResultsBtn) cleanFromResultsBtn.style.display = 'none';
  if (cleanZeroFromResultsBtn) cleanZeroFromResultsBtn.style.display = 'none';
  if (undoFromResultsBtn) undoFromResultsBtn.style.display = 'none';
  if (cleanZeroSectionBtn) cleanZeroSectionBtn.style.display = 'none';
  if (downloadCleanZipBtn) downloadCleanZipBtn.style.display = 'none';
  fileInput.value = '';
  folderInput.value = '';
}

clearBtn.addEventListener('click', clearAll);
if (toolbarClearBtn) toolbarClearBtn.addEventListener('click', clearAll);

// Quick Demo Generator
if (loadDemoBtn) {
  loadDemoBtn.addEventListener('click', () => {
    const identicalText1 = 'CRITICAL REPORT CONTENT 2026: Quarterly Financial Statement and Projections.';
    const identicalImagePayload = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);

    const demoFiles = [
      new File([identicalText1], 'Q3_Financial_Statement.pdf', { type: 'application/pdf', lastModified: 1726000000000 }),
      new File([identicalText1], 'Q3_Financial_Statement (Copy).pdf', { type: 'application/pdf', lastModified: 1726100000000 }),
      new File([identicalText1], 'backup_copy_statement.pdf', { type: 'application/pdf', lastModified: 1726200000000 }),
      new File([identicalImagePayload], 'hero_marketing_banner.png', { type: 'image/png', lastModified: 1726050000000 }),
      new File([identicalImagePayload], 'hero_marketing_banner_final.png', { type: 'image/png', lastModified: 1726080000000 }),
      new File(['completely unique file content for analytics dashboard'], 'analytics_pipeline.py', { type: 'text/x-python', lastModified: 1726090000000 }),
      new File([''], 'empty_log_file.txt', { type: 'text/plain', lastModified: 1726095000000 }),
    ];

    processFiles(demoFiles);
  });
}
