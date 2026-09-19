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
  if (groups.length === 0) return;

  console.log(chalk.bold.cyan('\n🔍 Duplicate Files Found:'));

  const table = new Table({
    head: [
      chalk.white('Group'),
      chalk.white('Size (each)'),
      chalk.white('Copies'),
      chalk.white('Files (first is original, rest are duplicates)')
    ],
    colWidths: [8, 14, 10, 60],
    wordWrap: true
  });

  groups.forEach((group, index) => {
    const fileList = group.files
      .map((f, i) => (i === 0 ? chalk.green(`[ORIGINAL] ${f}`) : chalk.yellow(`[DUP] ${f}`)))
      .join('\n');

    table.push([
      `#${index + 1}`,
      formatBytes(group.size),
      chalk.bold(group.files.length),
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
    console.log(`  ${chalk.gray('•')} ${chalk.white(f)}`);
  });

  if (files.length > 15) {
    console.log(chalk.gray(`  ... and ${files.length - 15} more empty files.`));
  }
}

/**
 * Render final statistics banner
 */
export function renderSummary({ totalScanned, duplicateGroups, zeroByteCount, totalWastedBytes }) {
  console.log('\n' + chalk.bold.cyan('━'.repeat(55)));
  console.log(chalk.bold.cyan('  📊 HashDup Scan Summary'));
  console.log(chalk.bold.cyan('━'.repeat(55)));

  console.log(`  📁 Total Files Scanned  : ${chalk.bold.white(totalScanned)}`);
  console.log(`  👥 Duplicate Groups     : ${chalk.bold.yellow(duplicateGroups.length)}`);
  console.log(`  🗑️  Zero-Byte Files      : ${chalk.bold.yellow(zeroByteCount)}`);
  console.log(`  💾 Wasted Disk Space    : ${chalk.bold.red(formatBytes(totalWastedBytes))}`);
  console.log(chalk.bold.cyan('━'.repeat(55)) + '\n');
}
