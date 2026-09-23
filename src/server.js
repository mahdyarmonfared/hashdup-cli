import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';

import os from 'node:os';
import { findDuplicates, undoLastTrash } from './scanner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIR = path.resolve(__dirname, '../web');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

/**
 * Start the built-in HashDup Web UI server.
 * @param {object} [options={}]
 * @param {number} [options.port=3002]
 * @returns {Promise<http.Server>}
 */
export function startWebServer(options = {}) {
  const port = options.port || 3002;

  const server = http.createServer(async (req, res) => {
    try {
      const pathname = req.url.split('?')[0];

      // API: Get System Paths & Status
      if (req.method === 'GET' && pathname === '/api/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          homeDir: os.homedir(),
          defaultDownloads: path.join(os.homedir(), 'Downloads'),
          defaultDesktop: path.join(os.homedir(), 'Desktop')
        }));
        return;
      }

      // API: Scan Directory on Disk
      if (req.method === 'POST' && pathname === '/api/scan') {
        const data = await readJsonBody(req);
        const target = path.resolve(data.targetDir || os.homedir());
        const results = await findDuplicates(target, { algorithm: data.algorithm || 'sha256' });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, ...results }));
        return;
      }

      // API: Move Duplicates to Trash (.hashdup-trash)
      if (req.method === 'POST' && pathname === '/api/clean') {
        const data = await readJsonBody(req);
        const target = path.resolve(data.targetDir || os.homedir());
        const trashDir = path.join(target, '.hashdup-trash');
        const results = await findDuplicates(target, {
          algorithm: data.algorithm || 'sha256',
          trashDir,
          cleanZeroBytes: Boolean(data.cleanZeroBytes)
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          targetDir: target,
          trashDir,
          removedCount: results.deletedFiles.length,
          deletedFiles: results.deletedFiles
        }));
        return;
      }

      // API: Undo Last Clean Operation
      if (req.method === 'POST' && pathname === '/api/undo') {
        const data = await readJsonBody(req);
        const target = path.resolve(data.targetDir || os.homedir());
        const result = await undoLastTrash(target);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
      }

      const urlPath = (pathname === '/' || pathname === '') ? '/index.html' : pathname;
      const filePath = path.join(WEB_DIR, urlPath);

      if (!filePath.startsWith(WEB_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('403 Forbidden');
        return;
      }

      const fileContent = await fs.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, { 'Content-Type': contentType });
      res.end(fileContent);
    } catch (err) {
      if (req.url.startsWith('/api/')) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
    }
  });

  return new Promise((resolve, reject) => {
    server.listen(port, () => {
      console.log('');
      console.log(chalk.cyan.bold('🔍 HashDup Web Finder is live!'));
      console.log(`  🌐 Local:   ${chalk.green.bold(`http://localhost:${port}`)}`);
      console.log(`  🔒 Privacy: ${chalk.white('100% Client-Side / Web Crypto SHA-256')}`);
      console.log(`  🛑 Stop:    ${chalk.gray('Press Ctrl+C to shutdown')}`);
      console.log('');
      resolve(server);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(chalk.yellow(`Port ${port} in use, trying ${port + 1}...`));
        resolve(startWebServer({ ...options, port: port + 1 }));
      } else {
        reject(err);
      }
    });
  });
}
