# Migrate DigiSmith's Own Repo to config.yml Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move DigiSmith's own repo from `.digismith/profile` and `.digismith/preferences.yml` to a committed `.digismith/config.yml`, and pin the result with a test.

**Architecture:** `git mv` the two old files to `*.migrated`. Generate `config.yml` with the shipped `migrate` function in a scratch copy, because `migrate` refuses to run in a linked worktree. A new test reruns `migrate` on the frozen `*.migrated` files and checks the committed `config.yml` against it. No reader changes: `session-init.ts` and `model_offload.ts` already go through `resolve`.

**Tech Stack:** TypeScript run with `node --experimental-strip-types`, Vitest, git, pnpm.

Design: `.digismith/docs/A/A.2/migrate-own-repo-config-yml/design.html`. Ticket: DGS-142.

## Global Constraints

- Commit message, exactly: `chore(config): migrate to .digismith/config.yml` (the value of `MIGRATE_COMMIT_MESSAGE` in `scripts/config.ts`). Title only, no attribution lines, no `Co-Authored-By`.
- Never `git add -f`, and never commit on `main` from this plan. Work stays on branch `migrate-own-repo-config-yml` in `.worktrees/migrate-own-repo-config-yml`.
- Do not edit `scripts/config.ts`, `scripts/session-init.ts` or `scripts/model_offload.ts`.
- Do not hand-write `.digismith/config.yml`: copy the output of `migrate` from a scratch copy.
- The committed `*.migrated` files are frozen: the test reads them, and nothing may change them after the commit.
- The test does not compare preference values in the live `config.yml`. `digismith:preferences` can change them later, and a test that fails after a legitimate `set` is wrong.
- The full suite must show only the two known DGS-117 failures: `process-lifecycle.test.ts` (netstat check) and `index.e2e.test.ts` (`--help` check).
- The ticket that removes the A.2 fallback also deletes `scripts/own-repo-config.test.ts` and the `*.migrated` files.

## File Structure

| Path | Change | Responsibility |
|---|---|---|
| `.digismith/profile` | Rename to `.digismith/profile.migrated` | Frozen copy of the old profile (`digismith`, CRLF line ending) |
| `.digismith/preferences.yml` | Rename to `.digismith/preferences.yml.migrated` | Frozen copy of the old preferences |
| `.digismith/config.yml` | Create | The live config: `profile` plus `preferences:` |
| `scripts/own-repo-config.test.ts` | Create | Pins the migration and the live file's shape |

---

### Task 1: Migrate the config files and pin them with a test

**Files:**
- Create: `scripts/own-repo-config.test.ts`
- Create: `.digismith/config.yml`
- Rename: `.digismith/profile` to `.digismith/profile.migrated`
- Rename: `.digismith/preferences.yml` to `.digismith/preferences.yml.migrated`

**Interfaces:**
- Consumes, from `scripts/config.ts`: `migrate(dir: string): MigrateReport`, `readConfig(dir?: string): Map<string, ConfigValue>`, `resolve(key: string, dir?: string): { value: ConfigValue; source: string } | undefined`, `CONFIG_FILE` (`"config.yml"`), `MIGRATED_SUFFIX` (`".migrated"`). From `scripts/config-write.ts`: `HEADER`.
- Produces: nothing that a later task imports. Task 2 only runs commands against the result.

- [ ] **Step 1: Write the failing test**

Create `scripts/own-repo-config.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { HEADER } from "./config-write.ts";
import { CONFIG_FILE, MIGRATED_SUFFIX, migrate, readConfig, resolve } from "./config.ts";

// DGS-142: DigiSmith's own repo moved from .digismith/profile and .digismith/preferences.yml to
// .digismith/config.yml. The ticket that drops the A.2 fallback also deletes this file and the
// *.migrated copies it reads.
const REPO_DIR = fileURLToPath(new URL("../.digismith", import.meta.url));
const OLD_FILES = ["profile", "preferences.yml"];
const KEYS = ["profile", "preferences.finish_option", "preferences.clear_context", "preferences.ssh_key"];

let tmpDir: string;
let scratch: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-own-repo-config-test-"));
  scratch = path.join(tmpDir, ".digismith");
  fs.mkdirSync(scratch);
  process.env.GIT_CEILING_DIRECTORIES = fs.realpathSync.native(path.dirname(tmpDir));
});

afterEach(() => {
  delete process.env.GIT_CEILING_DIRECTORIES;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function migrateFrozenCopies(): void {
  for (const file of OLD_FILES) {
    fs.copyFileSync(path.join(REPO_DIR, file + MIGRATED_SUFFIX), path.join(scratch, file));
  }
  migrate(scratch);
}

describe("DigiSmith's own repo config (DGS-142)", () => {
  it("keeps the old files only as .migrated copies", () => {
    for (const file of OLD_FILES) {
      expect(fs.existsSync(path.join(REPO_DIR, file)), `${file} is still in place`).toBe(false);
      expect(fs.existsSync(path.join(REPO_DIR, file + MIGRATED_SUFFIX)), `${file}${MIGRATED_SUFFIX} is missing`).toBe(true);
    }
  });

  it("migrate turns the .migrated copies into the expected config.yml", () => {
    migrateFrozenCopies();
    expect(fs.readFileSync(path.join(scratch, CONFIG_FILE), "utf8")).toBe(
      `${HEADER}\nprofile: digismith\n\npreferences:\n  finish_option: merge_locally\n  clear_context: no\n  ssh_key: /root/.ssh/jazurite_github\n`,
    );
  });

  // Values are not compared: digismith:preferences may change them later with a legitimate set.
  it("config.yml still carries every key the migration produced", () => {
    migrateFrozenCopies();
    const live = readConfig(REPO_DIR);
    for (const key of readConfig(scratch).keys()) {
      expect(live.has(key), `${key} is missing from .digismith/config.yml`).toBe(true);
    }
  });

  it("resolves the profile and the preferences from config.yml, not the fallback", () => {
    for (const key of KEYS) {
      expect(resolve(key, REPO_DIR)?.source, key).toBe(path.join(REPO_DIR, CONFIG_FILE));
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run scripts/own-repo-config.test.ts`
Expected: 4 FAIL. The first fails with "profile is still in place". The second and third fail with `ENOENT` on `profile.migrated`. The fourth fails because the source is `.digismith/profile`, not `config.yml`.

- [ ] **Step 3: Migrate the repo's config files**

Run from the worktree root:

```bash
git mv .digismith/profile .digismith/profile.migrated
git mv .digismith/preferences.yml .digismith/preferences.yml.migrated
SCRATCH=$(mktemp -d)
mkdir "$SCRATCH/.digismith"
cp .digismith/profile.migrated "$SCRATCH/.digismith/profile"
cp .digismith/preferences.yml.migrated "$SCRATCH/.digismith/preferences.yml"
node --experimental-strip-types scripts/config.ts --action migrate --dir "$SCRATCH/.digismith"
cp "$SCRATCH/.digismith/config.yml" .digismith/config.yml
rm -rf "$SCRATCH"
cat -A .digismith/config.yml
```

Expected: `migrate` prints "config: added profile, preferences.finish_option, preferences.clear_context, preferences.ssh_key". `cat -A` shows exactly seven lines, each ending in `$` with no `^M`:

```
# DigiSmith config for this checkout. Edit by hand or through digismith:preferences.$
profile: digismith$
$
preferences:$
  finish_option: merge_locally$
  clear_context: no$
  ssh_key: /root/.ssh/jazurite_github$
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run scripts/own-repo-config.test.ts scripts/config.test.ts scripts/preferences.test.ts scripts/session-init.test.ts`
Expected: PASS for all four files, and the new file shows 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add .digismith/config.yml scripts/own-repo-config.test.ts
git status --short
git commit -m "chore(config): migrate to .digismith/config.yml"
```

Expected from `git status --short`: `A  .digismith/config.yml`, `R  .digismith/preferences.yml -> .digismith/preferences.yml.migrated`, `R  .digismith/profile -> .digismith/profile.migrated`, `A  scripts/own-repo-config.test.ts`, and nothing else.

---

### Task 2: Verify against the baseline

**Files:** none changed.

**Interfaces:**
- Consumes: the commit from Task 1.
- Produces: the verification result, for the test-results checkpoint.

- [ ] **Step 1: Check the preference read and the session banner**

Run from the worktree root:

```bash
node --experimental-strip-types scripts/preferences.ts --key finish_option --action get
node --experimental-strip-types scripts/preferences.ts --key clear_context --action get
node --experimental-strip-types scripts/preferences.ts --key ssh_key --action get
node --experimental-strip-types scripts/session-init.ts | grep "profile="
```

Expected: `merge_locally`, `no`, `/root/.ssh/jazurite_github`, then a line that starts `DigiSmith: profile=digismith`.

- [ ] **Step 2: Check the commit's contents**

Run: `git show --stat --format=%s HEAD`
Expected: the title `chore(config): migrate to .digismith/config.yml`, then four paths: `config.yml` added, the two renames, and the new test. No other file.

- [ ] **Step 3: Run the full suite**

```bash
OUT=$(mktemp)
pnpm test > "$OUT" 2>&1
tail -15 "$OUT"
grep -E "^ FAIL " "$OUT" | sort -u
```

Expected: the only `FAIL` lines are the two DGS-117 tests (`process-lifecycle.test.ts`, `index.e2e.test.ts`). The test count is 4 higher than the count on `main`, and the pass count is the total minus 2.

- [ ] **Step 4: Record the result**

Write the totals (files, tests, passed, failed) and the two failure names into the report for the test-results checkpoint. No commit.
