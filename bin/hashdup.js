#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { findDuplicates } from '../src/scanner.js';
import { renderDuplicateTable, renderZeroByteTable, renderSummary } from '../src/formatter.js';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
const program = new Command();

program
  .name('hashdup')
  .description('⚡ Lightning-fast duplicate and zero-byte file finder powered by cryptographic hash streams.')
  .version(pkg.version)
  .argument('[directory]', 'Directory to scan recursively', '.')
  .option('-a, --algo <algorithm>', 'Hash algorithm to use (sha256 or md5)', 'sha256')
  .option('-t, --trash <folder>', 'Safely move duplicate copies to a trash folder instead of deleting')
  .option('--delete', 'Permanently delete duplicate copies (WARNING: irreversible)')
  .option('--no-zero', 'Do not report zero-byte empty files')
  .action(async (directory, options) => {
    const targetDir = path.resolve(directory);

    console.log(chalk.bold.cyan(`\n🔍 HashDup v${pkg.version}`));
    console.log(chalk.gray(`Scanning target: ${targetDir}`));
    console.log(chalk.gray(`Algorithm: ${options.algo.toUpperCase()}\n`));

    const spinner = ora('Scanning file tree and analyzing sizes...').start();

    try {
      const results = await findDuplicates(targetDir, {
        algorithm: options.algo,
        deleteDuplicates: Boolean(options.delete),
        trashDir: options.trash ? path.resolve(options.trash) : null
      });

      spinner.succeed(`Scan complete! Scanned ${results.totalScanned} file(s).`);

      // 1. Render Duplicate Groups Table
      renderDuplicateTable(results.duplicateGroups);

      // 2. Render Zero-byte files if enabled
      if (options.zero !== false) {
        renderZeroByteTable(results.zeroByteFiles);
      }

      // 3. Render Summary Banner
      renderSummary({
        totalScanned: results.totalScanned,
        duplicateGroups: results.duplicateGroups,
        zeroByteCount: results.zeroByteFiles.length,
        totalWastedBytes: results.totalWastedBytes
      });

      // 4. Report deletions / moves
      if (results.deletedFiles.length > 0) {
        const actionLabel = options.trash ? 'Moved to trash' : 'Deleted';
        console.log(chalk.bold.green(`✅ ${actionLabel} ${results.deletedFiles.length} duplicate file(s).\n`));
      }
    } catch (err) {
      spinner.fail(chalk.red(`Scan failed: ${err.message}`));
      process.exit(1);
    }
  });

program.parse(process.argv);
