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
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
