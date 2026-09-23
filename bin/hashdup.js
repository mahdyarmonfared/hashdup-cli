#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { findDuplicates, undoLastTrash } from '../src/scanner.js';
import { renderDuplicateTable, renderZeroByteTable, renderSummary } from '../src/formatter.js';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
const program = new Command();

program
  .name('hashdup')
  .description('⚡ Lightning-fast duplicate and zero-byte file finder powered by cryptographic hash streams.')
  .version(pkg.version)
  .argument('[args...]', 'Target directory to scan, "scan [dir]", "undo [dir]", or "web [port]"')
  .option('-a, --algo <algorithm>', 'Hash algorithm to use (sha256 or md5)', 'sha256')
  .option('-t, --trash [folder]', 'Safely move duplicate copies to a trash folder (default: .hashdup-trash)')
  .option('-d, --delete', 'Safely move duplicate copies to .hashdup-trash folder')
  .option('--permanent', 'Permanently delete duplicate copies (WARNING: irreversible)')
  .option('-u, --undo', 'Undo the last clean operation and restore files from .hashdup-trash')
  .option('--no-zero', 'Do not report zero-byte empty files')
  .option('--clean-zero', 'Also move zero-byte empty files to trash')
  .option('--web [port]', 'Launch browser Web UI locally')
  .action(async (args, options) => {
    const rawArgs = Array.isArray(args) ? args : (args ? [args] : []);
    const firstArg = rawArgs[0];

    // Handle Web Server launch
    if (options.web || firstArg === 'web') {
      const { startWebServer } = await import('../src/server.js');
      const port = typeof options.web === 'string' || typeof options.web === 'number'
        ? parseInt(options.web, 10)
        : (rawArgs[1] ? parseInt(rawArgs[1], 10) : 3002);
      await startWebServer({ port });
      return;
    }

    // Determine target directory and command
    let targetDir = '.';
    let isUndo = Boolean(options.undo);

    if (firstArg === 'undo') {
      isUndo = true;
      targetDir = rawArgs[1] || '.';
    } else if (firstArg === 'scan') {
      targetDir = rawArgs[1] || '.';
    } else if (firstArg) {
      targetDir = firstArg;
    }

    const absoluteTarget = path.resolve(targetDir);

    console.log(chalk.bold.cyan(`\n🔍 HashDup v${pkg.version}`));
    console.log(chalk.gray(`Target: ${absoluteTarget}`));

    // Handle Undo Action
    if (isUndo) {
      const spinner = ora('Restoring duplicate files from .hashdup-trash...').start();
      try {
        const result = await undoLastTrash(absoluteTarget);
        if (result.success) {
          spinner.succeed(chalk.green(`Successfully restored ${result.revertedCount} of ${result.totalCount} file(s) back to original locations!`));
        } else {
          spinner.warn(chalk.yellow(result.message));
        }
      } catch (err) {
        spinner.fail(chalk.red(`Undo failed: ${err.message}`));
        process.exit(1);
      }
      return;
    }

    console.log(chalk.gray(`Algorithm: ${options.algo.toUpperCase()}\n`));

    const spinner = ora('Scanning file tree and analyzing sizes...').start();

    try {
      // Safe deletion policy:
      // If --delete or --trash is requested:
      // Unless --permanent is explicitly provided, default to .hashdup-trash
      let trashDir = null;
      let deleteDuplicates = false;

      if (options.permanent) {
        deleteDuplicates = true;
      } else if (options.delete || options.trash) {
        trashDir = typeof options.trash === 'string'
          ? path.resolve(options.trash)
          : path.join(absoluteTarget, '.hashdup-trash');
      }

      const results = await findDuplicates(absoluteTarget, {
        algorithm: options.algo,
        deleteDuplicates,
        trashDir,
        cleanZeroBytes: Boolean(options.cleanZero)
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
        if (trashDir) {
          console.log(chalk.bold.green(`🛡️  Safely moved ${results.deletedFiles.length} file(s) to ${path.relative(process.cwd(), trashDir) || '.hashdup-trash'}`));
          console.log(chalk.gray(`   Run "hashdup undo ${targetDir}" to revert changes anytime.\n`));
        } else {
          console.log(chalk.bold.red(`⚠️  Permanently deleted ${results.deletedFiles.length} duplicate file(s).\n`));
        }
      }
    } catch (err) {
      spinner.fail(chalk.red(`Scan failed: ${err.message}`));
      process.exit(1);
    }
  });

program.parse(process.argv);
