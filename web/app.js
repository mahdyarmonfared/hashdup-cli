/**
 * HashDup Web UI
 * 100% Client-Side In-Browser Duplicate File Finder using Web Crypto SHA-256
 */

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
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

dropZone.addEventListener('drop', (e) => {
  const files = Array.from(e.dataTransfer.files);
  if (files.length > 0) processFiles(files);
});

fileInput.addEventListener('change', (e) => {
  const files = Array.from(e.target.files);
  if (files.length > 0) processFiles(files);
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

clearBtn.addEventListener('click', () => {
  duplicateResults = null;
  metricsGrid.classList.add('hidden');
  resultsSection.classList.add('hidden');
  fileInput.value = '';
});
