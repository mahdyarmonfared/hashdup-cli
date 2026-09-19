import fs from 'node:fs';
import crypto from 'node:crypto';

/**
 * Computes SHA-256 hash using Node streams to handle files of any size without RAM bloat
 * @param {string} filePath - Absolute path to the target file
 * @param {string} algorithm - Hash algorithm ('sha256' or 'md5')
 * @returns {Promise<string>} Hexadecimal hash digest
 */
export function computeFileHash(filePath, algorithm = 'sha256') {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(algorithm);
    const stream = fs.createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => reject(err));
  });
}
