import Table from 'cli-table3';
import chalk from 'chalk';
import path from 'node:path';

/**
 * Format bytes into human-readable string (KB, MB, GB)
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Render duplicate groups as a formatted CLI table
 */
export function renderDuplicateTable(groups) {
  if (groups.length === 0) {
    console.log('\n' + chalk.green('  ✨ No duplicate files found! All files have unique cryptographic hashes.'));
    return;
  }

  console.log(chalk.bold.cyan('\n🔍 Duplicate Files Found:'));

  const table = new Table({
    head: [
      chalk.cyan('Group'),
      chalk.cyan('Size'),
      chalk.cyan('Copies'),
      chalk.cyan('Files (✔ Preserved Original  •  ↳ Duplicates)')
    ],
    chars: {
      'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
      'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
      'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
      'right': '│', 'right-mid': '┤', 'middle': '│'
    },
    style: { head: [], border: ['gray'] },
    wordWrap: true
  });

  groups.forEach((group, index) => {
    const fileList = group.files
      .map((f, i) => (i === 0 ? `${chalk.green.bold('✔ KEEP')} ${chalk.white(f)}` : `${chalk.yellow.bold('↳ DUP ')} ${chalk.dim(f)}`))
      .join('\n');

    table.push([
      `#${index + 1}`,
      chalk.bold.white(formatBytes(group.size)),
      chalk.bold.yellow(group.files.length),
      fileList
    ]);
  });

  console.log(table.toString());
}

/**
 * Render zero-byte empty files table
 */
export function renderZeroByteTable(files) {
  if (files.length === 0) return;

  console.log(chalk.bold.yellow(`\n⚠️  Empty (Zero-Byte) Files Found (${files.length}):`));
  files.slice(0, 15).forEach((f) => {
    console.log(`  ${chalk.dim('•')} ${chalk.gray(f)}`);
  });

  if (files.length > 15) {
    console.log(chalk.dim(`  ... and ${files.length - 15} more empty files.`));
  }
}

/**
 * Render final statistics banner
 */
export function renderSummary({ totalScanned, duplicateGroups, zeroByteCount, totalWastedBytes }) {
  console.log('\n' + chalk.dim('╭─ ') + chalk.bold.cyan('HashDup Scan Summary ') + chalk.dim('─'.repeat(27) + '╮'));

  console.log(chalk.dim('│') + `  📁 Total Files Scanned : ${chalk.bold.white(totalScanned)}`);
  console.log(chalk.dim('│') + `  👥 Duplicate Groups    : ${duplicateGroups.length > 0 ? chalk.bold.yellow(duplicateGroups.length) : chalk.green('0')}`);
  console.log(chalk.dim('│') + `  🗑️  Zero-Byte Files     : ${zeroByteCount > 0 ? chalk.bold.yellow(zeroByteCount) : chalk.green('0')}`);

  const wastedStr = totalWastedBytes > 0 ? chalk.bold.red(formatBytes(totalWastedBytes)) : chalk.bold.green('0 B (Clean)');
  console.log(chalk.dim('│') + `  💾 Reclaimable Space   : ${wastedStr}`);

  console.log(chalk.dim('╰' + '─'.repeat(49) + '╯\n'));
}
