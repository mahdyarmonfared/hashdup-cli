<div align="center">

# 🔍 HashDup CLI

**Lightning-fast, memory-efficient duplicate and zero-byte file finder powered by SHA-256 stream hashing.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org)
[![CI Status](https://github.com/mahdyarmonfared/hashdup-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/mahdyarmonfared/hashdup-cli/actions)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com)


</div>

---

## 🧐 Why HashDup?

Files get duplicated all the time — duplicate photo albums, downloaded invoices, identical movies or archives copied across multiple folders. Comparing every file against each other manually is impossible.

Most duplicate finder scripts try to load full files into memory, which crashes when scanning large files.

**HashDup** uses a smart **two-phase architecture**:
1. 📏 **Phase 1 (Instant Filter):** Groups files by exact byte size. If two files have different sizes, they *cannot* be duplicates. This eliminates 95% of unnecessary disk I/O.
2. 🔐 **Phase 2 (Cryptographic Streaming):** Reads candidate files in non-blocking 64KB streams using `crypto.createHash('sha256')`. Zero RAM spikes, even for 20GB+ files!

---

## ✨ Features

- 🚀 **Two-Phase Smart Scan:** Hashing is only performed when file sizes match.
- 🌊 **Stream-Based Hashing:** Zero RAM bottleneck, handles multi-gigabyte files with ease.
- 🗑️ **Zero-Byte File Audit:** Detects corrupt or empty files cluttering your filesystem.
- 🛡️ **Safe Trash Option (`-t`):** Move duplicate copies to an isolated `.trash` folder instead of permanent deletion.
- 📊 **Beautiful Terminal Tables:** Detailed group breakdown, wasted storage statistics, and path previews.

---

## 🚀 Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/mahdyarmonfared/hashdup-cli.git
cd hashdup-cli

# Install dependencies
npm install

# Link globally (optional)
npm link
```

### Direct Run

```bash
# Scan current directory
node bin/hashdup.js

# Scan specific folder (e.g. Pictures)
node bin/hashdup.js ~/Pictures

# Launch interactive in-browser duplicate finder
node bin/hashdup.js --web
```

---

## 📖 Usage & Options

```bash
hashdup [directory] [options]
```

### Options

| Flag | Shorthand | Description |
| :--- | :--- | :--- |
| `--algo <name>` | `-a` | Hash algorithm (`sha256` or `md5`, default: `sha256`) |
| `--trash <folder>`| `-t` | Move duplicates to a safe trash folder instead of deleting |
| `--delete` | | Permanently remove duplicate copies (preserves first original) |
| `--no-zero` | | Do not report empty zero-byte files |
| `--help` | `-h` | Display help message |
| `--version` | `-V` | Output version number |

### Examples

#### 1. Audit duplicate files in Downloads:
```bash
hashdup ~/Downloads
```

#### 2. Safely isolate duplicates into a trash folder:
```bash
hashdup ~/Documents -t ~/Documents/.trash
```

#### 3. Use faster MD5 algorithm for non-cryptographic local scans:
```bash
hashdup ~/Videos -a md5
```

---

## 🧪 Running Tests

HashDup uses Node's native test runner (`node:test`):

```bash
npm test
```

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/mahdyarmonfared/hashdup-cli/issues).

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
