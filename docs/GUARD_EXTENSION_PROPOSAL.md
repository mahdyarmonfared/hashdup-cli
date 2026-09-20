### 1. Capability Boundary
- **Owned Scope:** Syntax parsing and evidence classification for the `hashdup` CLI (cryptographic duplicate and zero-byte file finder).
- **Non-Destructive Evidence:**
  - Read-only directory scans: `hashdup <dir>`
  - Algorithm configuration: `hashdup <dir> -a sha256` / `--algo md5`
  - Reversible trash staging: `hashdup <dir> -t <folder>` / `--trash <folder>` (when targeting an existing valid directory)
  - Output filtering: `hashdup <dir> --no-zero`
- **Destructive Evidence:**
  - Irreversible deletion: `hashdup <dir> --delete` (unrecoverable permanent `fs.unlink`)
- **Out of Scope:** Execution authority and final enforcement (delegated entirely to Guard policy).

---

### 2. Supported Executable & Dialects
- **Executable name:** `hashdup`
- **Dialect / Engine:** Node.js POSIX CLI
- **Official Repository:** https://github.com/mahdyarmonfared/hashdup-cli
- **Version Coverage:** v1.0.0+

---

### 3. Representative Operations & Fixture Matrix

#### A. Safe Counterparts (Non-destructive evidence)
```bash
hashdup .
hashdup ./downloads --algo sha256
hashdup /workspace/assets -t ./backup_trash
hashdup /workspace/assets --trash ./backup_trash --no-zero
```

#### B. Destructive Operations (Approval-gated evidence)
```bash
hashdup /workspace --delete
hashdup --delete /workspace
hashdup /workspace -a sha256 --delete
```

#### C. Compound Commands, Wrappers & Pipelines
```bash
sh -c 'hashdup /workspace --delete'
bash -c "hashdup ./data --delete"
find /data -maxdepth 1 -type d | xargs -I {} hashdup {} --delete
```

#### D. Fail-Closed Posture & Boundary Violations
```bash
# Ambiguous, unknown, or unparseable flags must fail-closed to destructive review:
hashdup /workspace --delete-mode
hashdup /workspace -x

# Invalid or suspicious trash destinations (e.g. character devices or root overwrite):
hashdup /workspace --trash /dev/null
```

---

### 4. Risk Class & Security Posture
- **Action Classes:**
  - `filesystem.read.inspect` for scan and dry-run flows.
  - `filesystem.mutate.reversible` for `--trash` targeting valid directories.
  - `filesystem.delete.unrecoverable` for `--delete`.
- **Fail-Closed Rule:** Any unparseable, malformed, or unrecognized flag combinations default strictly to destructive review (`pause_for_approval`).

---

### 5. Overlap & Placement
While `command.filesystem` owns generic `rm` / recursive unlinks, `hashdup` introduces a specific CLI contract where `--trash` is non-destructive but `--delete` is destructive. We propose `command.hashdup` as the canonical identifier, but welcome maintainer guidance if grouping under `command.filesystem` is preferred.
