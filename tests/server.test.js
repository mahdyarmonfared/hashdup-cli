import test from 'node:test';
import assert from 'node:assert/strict';
import { startWebServer } from '../src/server.js';

test('startWebServer serves HashDup web UI on port', async () => {
  const testPort = 3699;
  const server = await startWebServer({ port: testPort });

  try {
    const res = await fetch(`http://localhost:${testPort}/`);
    assert.equal(res.status, 200);

    const contentType = res.headers.get('content-type');
    assert.ok(contentType.includes('text/html'));

    const html = await res.text();
    assert.ok(html.includes('HashDup'));
    assert.ok(html.includes('Duplicate'));

    // Check style.css
    const cssRes = await fetch(`http://localhost:${testPort}/style.css`);
    assert.equal(cssRes.status, 200);

    // Check 404
    const notFoundRes = await fetch(`http://localhost:${testPort}/non-existent.xyz`);
    assert.equal(notFoundRes.status, 404);

    // Check GET /api/status
    const statusRes = await fetch(`http://localhost:${testPort}/api/status`);
    assert.equal(statusRes.status, 200);
    const statusData = await statusRes.json();
    assert.ok(statusData.homeDir);
    assert.ok(statusData.defaultDownloads);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('server API endpoints: /api/scan, /api/clean, and /api/undo', async () => {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const os = await import('node:os');

  const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hashdup-api-test-'));
  const testPort = 3698;
  const server = await startWebServer({ port: testPort });

  try {
    const file1 = path.join(testDir, 'f1.txt');
    const file2 = path.join(testDir, 'f2.txt');
    await fs.writeFile(file1, 'Duplicate API content');
    await fs.writeFile(file2, 'Duplicate API content');

    // 1. POST /api/scan
    const scanRes = await fetch(`http://localhost:${testPort}/api/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetDir: testDir })
    });
    assert.equal(scanRes.status, 200);
    const scanData = await scanRes.json();
    assert.equal(scanData.success, true);
    assert.equal(scanData.duplicateGroups.length, 1);

    // 2. POST /api/clean
    const cleanRes = await fetch(`http://localhost:${testPort}/api/clean`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetDir: testDir })
    });
    assert.equal(cleanRes.status, 200);
    const cleanData = await cleanRes.json();
    assert.equal(cleanData.success, true);
    assert.equal(cleanData.removedCount, 1);

    // 3. POST /api/undo
    const undoRes = await fetch(`http://localhost:${testPort}/api/undo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetDir: testDir })
    });
    assert.equal(undoRes.status, 200);
    const undoData = await undoRes.json();
    assert.equal(undoData.success, true);
    assert.equal(undoData.revertedCount, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(testDir, { recursive: true, force: true });
  }
});
