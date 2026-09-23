/**
 * HashDup Web UI
 * 100% Client-Side In-Browser Duplicate File Finder using Web Crypto SHA-256
 */

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const folderInput = document.getElementById('folderInput');
const browseFolderBtn = document.getElementById('browseFolderBtn');
const browseFilesBtn = document.getElementById('browseFilesBtn');
const progressCard = document.getElementById('progressCard');
const progressTitle = document.getElementById('progressTitle');
const progressPercent = document.getElementById('progressPercent');
const progressFill = document.getElementById('progressFill');

const metricsGrid = document.getElementById('metricsGrid');
const statScanned = document.getElementById('statScanned');
const statClusters = document.getElementById('statClusters');
const statDuplicates = document.getElementById('statDuplicates');
const statWasted = document.getElementById('statWasted');

const resultsSection = document.getElementById('resultsSection');
const clustersContainer = document.getElementById('clustersContainer');
const exportReportBtn = document.getElementById('exportReportBtn');
const clearBtn = document.getElementById('clearBtn');

let duplicateResults = null;

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

async function computeSha256(file) {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Recursive entry reader for folder drag-and-drop
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

// Drag & drop handlers
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

// Click handlers for buttons & inputs
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

async function processFiles(files) {
  progressCard.classList.remove('hidden');
  progressFill.style.width = '0%';
  progressPercent.textContent = '0%';

  const hashMap = new Map();
  const zeroBytes = [];
  const total = files.length;

  for (let i = 0; i < total; i++) {
    const file = files[i];
    progressTitle.textContent = `Hashing ${file.name} (${i + 1}/${total})...`;
    const pct = Math.round(((i + 1) / total) * 100);
    progressPercent.textContent = `${pct}%`;
    progressFill.style.width = `${pct}%`;

    if (file.size === 0) {
      zeroBytes.push({ name: file.name, size: 0 });
      continue;
    }

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
        size: file.size,
        lastModified: file.lastModified,
      });
    } catch (err) {
      console.error('Failed to hash file:', file.name, err);
    }
  }

  // Filter only duplicate groups (files.length > 1)
  const duplicateGroups = Array.from(hashMap.values()).filter(g => g.files.length > 1);

  let totalDuplicateFiles = 0;
  let totalWastedBytes = 0;

  duplicateGroups.forEach(g => {
    const redundantCount = g.files.length - 1;
    totalDuplicateFiles += redundantCount;
    totalWastedBytes += g.size * redundantCount;
  });

  duplicateResults = {
    totalScanned: total,
    duplicateGroups,
    zeroBytes,
    totalDuplicateFiles,
    totalWastedBytes,
  };

  progressCard.classList.add('hidden');
  renderDashboard(duplicateResults);
}

function renderDashboard(data) {
  metricsGrid.classList.remove('hidden');
  resultsSection.classList.remove('hidden');

  statScanned.textContent = data.totalScanned;
  statClusters.textContent = data.duplicateGroups.length;
  statDuplicates.textContent = data.totalDuplicateFiles;
  statWasted.textContent = formatBytes(data.totalWastedBytes);

  clustersContainer.innerHTML = '';

  if (data.duplicateGroups.length === 0) {
    clustersContainer.innerHTML = `
      <div class="cluster-card" style="text-align: center; color: var(--color-green); padding: 30px;">
        <h3>🎉 No Duplicate Files Found!</h3>
        <p style="color: var(--text-muted); font-size: 13px; margin-top: 6px;">All ${data.totalScanned} scanned files have unique cryptographic SHA-256 signatures.</p>
      </div>
    `;
    return;
  }

  data.duplicateGroups.forEach((group, idx) => {
    const clusterCard = document.createElement('div');
    clusterCard.className = 'cluster-card';

    const wastedForGroup = group.size * (group.files.length - 1);

    let filesHtml = '';
    group.files.forEach((f, fIdx) => {
      const isOriginal = fIdx === 0;
      filesHtml += `
        <div class="cluster-file-item">
          <span class="file-type-icon">${isOriginal ? '⭐' : '📋'}</span>
          <span class="file-item-name" title="${f.name}">${f.name}</span>
          <span class="file-item-tag ${isOriginal ? 'tag-original' : 'tag-duplicate'}">
            ${isOriginal ? 'Original' : 'Duplicate'}
          </span>
        </div>
      `;
    });

    clusterCard.innerHTML = `
      <div class="cluster-header">
        <span class="cluster-hash-badge">SHA-256: ${group.hash.slice(0, 16)}...</span>
        <div>
          <span style="font-size: 12px; color: var(--text-muted); margin-right: 8px;">Size per file: <strong>${formatBytes(group.size)}</strong></span>
          <span class="cluster-wasted-badge">-${formatBytes(wastedForGroup)} Wasted</span>
        </div>
      </div>
      <div class="cluster-files-list">
        ${filesHtml}
      </div>
    `;

    clustersContainer.appendChild(clusterCard);
  });
}

exportReportBtn.addEventListener('click', () => {
  if (!duplicateResults) return;

  const data = JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: {
      totalScanned: duplicateResults.totalScanned,
      duplicateClusters: duplicateResults.duplicateGroups.length,
      redundantCopies: duplicateResults.totalDuplicateFiles,
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
  metricsGrid.classList.add('hidden');
  resultsSection.classList.add('hidden');
  fileInput.value = '';
}

clearBtn.addEventListener('click', clearAll);

const toolbarClearBtn = document.getElementById('toolbarClearBtn');
if (toolbarClearBtn) {
  toolbarClearBtn.addEventListener('click', clearAll);
}

// Quick Demo Generator
const loadDemoBtn = document.getElementById('loadDemoBtn');
if (loadDemoBtn) {
  loadDemoBtn.addEventListener('click', () => {
    const identicalText1 = 'CRITICAL REPORT CONTENT 2026: Quarterly Financial Statement and Projections.';
    const identicalImagePayload = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]); // sample PNG header bytes

    const demoFiles = [
      new File([identicalText1], 'Q3_Financial_Statement.pdf', { type: 'application/pdf', lastModified: 1726000000000 }),
      new File([identicalText1], 'Q3_Financial_Statement (Copy).pdf', { type: 'application/pdf', lastModified: 1726100000000 }),
      new File([identicalText1], 'backup_copy_statement.pdf', { type: 'application/pdf', lastModified: 1726200000000 }),
      new File([identicalImagePayload], 'hero_marketing_banner.png', { type: 'image/png', lastModified: 1726050000000 }),
      new File([identicalImagePayload], 'hero_marketing_banner_final.png', { type: 'image/png', lastModified: 1726080000000 }),
      new File(['completely unique file content for analytics dashboard'], 'analytics_pipeline.py', { type: 'text/x-python', lastModified: 1726090000000 }),
    ];

    processFiles(demoFiles);
  });
}

// Auto-trigger for URL query parameters (e.g. for screenshots)
const params = new URLSearchParams(window.location.search);
if (params.has('demo')) {
  setTimeout(() => loadDemoBtn?.click(), 100);
}


