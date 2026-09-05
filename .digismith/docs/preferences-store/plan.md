# Preferences Store (H) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give any DigiSmith skill a general, per-repo settings store — `.digismith/preferences.yml` — plus a `digismith:preferences` skill wrapping get/set/clear, so a live-interaction decision (starting with W.8's saved finish option) can persist across runs and worktrees without a one-off file format per consumer.

**Architecture:** A small TypeScript module (`scripts/preferences.ts`) does plain-line read/write against `.digismith/preferences.yml` — no YAML library, same parsing convention already used for `.digismith/profile`'s own fields. A thin CLI wraps it (`--key`/`--action`/`--value`, reusing `scripts/cli-args.ts`). `skills/preferences/SKILL.md` is the only thing any consuming skill or Jack ever calls — it shells out to the script. `digismith:bootstrap` and `digismith:adopt` each gain one new worktree-copy sub-step, mirroring the existing `.digismith/profile` copy, so a freshly created worktree doesn't silently look like "no preferences set."

**Tech Stack:** TypeScript (Node ≥24, `node --experimental-strip-types`, no build step), Vitest, no new dependencies.

## Global Constraints

- **Map item:** H (Preferences), reusing the letter W.6 freed by retiring the old "subagent-driven-always." This plan covers H only — **not** W.8 (Saved Finish Option), which depends on H and is planned separately once this ships.
- **Design doc:** `.digismith/docs/preferences-and-finish-option/design.html` (shared with W.8's own future plan) — this plan implements its `#h-storage`, `#h-skill`, `#h-propagation`, and `#h-errors` sections only. Kept as one shared file rather than split per-slug, a deliberate call made when writing this plan (not yet split, per the handoff note in `.digismith/docs/preferences-and-finish-option/design.html`'s own history) — splitting it now would just be busywork with no behavioral benefit, since the anchors already separate H from W.8 cleanly.
- **Storage format:** `.digismith/preferences.yml`, flat `key: value` pairs only, no nesting, no YAML library — plain-text, parsed the same way `.digismith/profile`'s own fields already are (`scripts/model_offload.ts`'s `parseFieldValue`: strip inline `#` comment, trim, strip matching leading/trailing quotes).
- **Scope:** per-repo only. No global-to-you tier, no per-profile tier.
- **Interface:** exactly `get(key)`, `set(key, value)`, `clear(key)`. No enumeration/listing of arbitrary keys — YAGNI, add only when a real need shows up.
- **CLI shape:** `--key <key> --action get|set|clear --value <value>` (flag-based, fitting `scripts/cli-args.ts`'s `--flag value` parsing), invoked as `node --experimental-strip-types scripts/preferences.ts ...` — same invocation convention as `scripts/bump-plugin-version.ts` in `skills/finishing-a-development-branch/SKILL.md`.
- **Error handling:** missing file, malformed/unparseable file, and an unset key all read as "unset" — never throw. This skill never runs `git add`/`git commit`/`git add -f` — committing `.digismith/preferences.yml` (or not) is left entirely to whatever flow eventually commits the surrounding work, same disposition already established for `.digismith/profile`.
- **Testing:** real file fixtures in a temp directory (`fs.mkdtempSync`), no mocking — same shape as `scripts/bump-plugin-version.test.ts`.
- **Worktree propagation:** `.digismith/preferences.yml` needs the same explicit copy-forward into a freshly created/attached worktree that `.digismith/profile` already gets, in both `digismith:bootstrap` and `digismith:adopt` — skipping it would silently make every fresh worktree look like "no preferences set."

---

## File Structure

- `scripts/preferences.ts` — **new.** Core `readPreferences`/`getPreference`/`setPreference`/`clearPreference` logic against a `.digismith/preferences.yml`-shaped file, plus a `main()` CLI entry point. Uses `scripts/cli-args.ts`'s `parseArgs`/`requireArgs` (existing, unchanged). Its own local `parseFieldValue` mirrors `scripts/model_offload.ts`'s function of the same name and behavior — not imported from there, following the precedent that file's own comment already documents ("a local equivalent scoped to the one file this script reads").
- `scripts/preferences.test.ts` — **new.** Real-fixture unit tests, no mocking, same shape as `scripts/bump-plugin-version.test.ts`.
- `skills/preferences/SKILL.md` — **new.** Wraps the script's three operations, the only place any consuming skill (or Jack directly) ever touches `.digismith/preferences.yml`, same pattern `skills/depot/SKILL.md` uses for its own resources.
- `skills/bootstrap/SKILL.md` — **modified.** Step 2 gains a new sub-step 8 (copy `.digismith/preferences.yml` into the worktree, mirroring existing sub-step 6's `.digismith/profile` copy); Quick Reference and Error Handling updated to match.
- `skills/adopt/SKILL.md` — **modified.** Step 5 gains a new "Preferences." paragraph mirroring its existing "Profile." paragraph; Quick Reference updated to match.

---

### Task 1: `scripts/preferences.ts` — core read/write logic and CLI

**Files:**
- Create: `scripts/preferences.ts`
- Create: `scripts/preferences.test.ts`

**Interfaces:**
- Consumes: `parseArgs(argv: string[]): Record<string, string>` and `requireArgs(args: Record<string, string>, names: string[]): void` from `scripts/cli-args.ts` (existing, unchanged).
- Produces: `DEFAULT_PREFERENCES_PATH: string` (constant, value `".digismith/preferences.yml"`); `readPreferences(filePath: string): Map<string, string>`; `getPreference(key: string, filePath: string): string | undefined`; `setPreference(key: string, value: string, filePath: string): void`; `clearPreference(key: string, filePath: string): void`; `main(): void`. `skills/preferences/SKILL.md` (Task 2) shells out to the CLI only — it does not import these functions directly.

- [ ] **Step 1: Write failing tests for `readPreferences`/`getPreference`**

```typescript
// scripts/preferences.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  DEFAULT_PREFERENCES_PATH,
  readPreferences,
  getPreference,
  setPreference,
  clearPreference,
  main,
} from "./preferences.ts";

describe("readPreferences / getPreference", () => {
  let tmpDir: string;
  let prefsPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-prefs-test-"));
    prefsPath = path.join(tmpDir, "preferences.yml");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns an empty map for a missing file", () => {
    expect(readPreferences(prefsPath)).toEqual(new Map());
    expect(getPreference("finish_option", prefsPath)).toBeUndefined();
  });

  it("reads a flat key/value pair, ignoring the header comment", () => {
    fs.writeFileSync(
      prefsPath,
      "# DigiSmith-managed. Settings decided through live interaction, not hand-authored.\nfinish_option: merge_locally\n",
    );
    expect(getPreference("finish_option", prefsPath)).toBe("merge_locally");
  });

  it("strips an inline comment", () => {
    fs.writeFileSync(prefsPath, "finish_option: merge_locally   # set via first-run prompt\n");
    expect(getPreference("finish_option", prefsPath)).toBe("merge_locally");
  });

  it("unwraps a quoted value", () => {
    fs.writeFileSync(prefsPath, 'finish_option: "merge_locally"\n');
    expect(getPreference("finish_option", prefsPath)).toBe("merge_locally");
  });

  it("returns unset for a key that was never set", () => {
    fs.writeFileSync(prefsPath, "finish_option: merge_locally\n");
    expect(getPreference("some_other_key", prefsPath)).toBeUndefined();
  });

  it("treats a non-UTF-8 file as unset rather than throwing", () => {
    fs.writeFileSync(prefsPath, Buffer.from([0x66, 0x3a, 0xff, 0xfe]));
    expect(() => getPreference("finish_option", prefsPath)).not.toThrow();
    expect(getPreference("finish_option", prefsPath)).toBeUndefined();
  });

  it("skips a line with no colon", () => {
    fs.writeFileSync(prefsPath, "not a valid line\nfinish_option: merge_locally\n");
    expect(getPreference("finish_option", prefsPath)).toBe("merge_locally");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run scripts/preferences.test.ts`
Expected: FAIL — `./preferences.ts` does not exist yet (module resolution error).

- [ ] **Step 3: Implement `readPreferences`/`getPreference`**

```typescript
// scripts/preferences.ts
import * as fs from "node:fs";
import * as path from "node:path";
import { parseArgs, requireArgs } from "./cli-args.ts";

export const DEFAULT_PREFERENCES_PATH = ".digismith/preferences.yml";

const HEADER = "# DigiSmith-managed. Settings decided through live interaction, not hand-authored.";

function isFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function readUtf8Strict(filePath: string): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(fs.readFileSync(filePath));
}

// Same "colon, then strip inline comment, then strip matching quotes" line
// shape as scripts/model_offload.ts's parseFieldValue — not imported from
// there, that script is a separate concern; this is a local equivalent
// scoped to the one file this script reads, same convention that file
// itself documents.
function parseFieldValue(line: string): string {
  const colonIndex = line.indexOf(":");
  const afterColon = colonIndex === -1 ? "" : line.slice(colonIndex + 1);
  const hashIndex = afterColon.indexOf("#");
  const beforeComment = hashIndex === -1 ? afterColon : afterColon.slice(0, hashIndex);
  return beforeComment.trim().replace(/^['"]+|['"]+$/g, "");
}

export function readPreferences(filePath: string): Map<string, string> {
  const result = new Map<string, string>();
  if (!isFile(filePath)) return result;

  let content: string;
  try {
    content = readUtf8Strict(filePath);
  } catch {
    return result;
  }

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;
    const key = line.slice(0, colonIndex).trim();
    if (!key) continue;
    result.set(key, parseFieldValue(line));
  }
  return result;
}

export function getPreference(key: string, filePath: string): string | undefined {
  return readPreferences(filePath).get(key);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run scripts/preferences.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/preferences.ts scripts/preferences.test.ts
git commit -m "feat(preferences): read/get against .digismith/preferences.yml"
```

- [ ] **Step 6: Write failing tests for `setPreference`**

```typescript
// append to scripts/preferences.test.ts

describe("setPreference", () => {
  let tmpDir: string;
  let prefsPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-prefs-test-"));
    prefsPath = path.join(tmpDir, "nested", "preferences.yml");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates the file (and parent directory) with the header comment when none existed", () => {
    setPreference("finish_option", "merge_locally", prefsPath);
    const content = fs.readFileSync(prefsPath, "utf8");
    expect(content).toBe(
      "# DigiSmith-managed. Settings decided through live interaction, not hand-authored.\nfinish_option: merge_locally\n",
    );
  });

  it("updates an existing key in place, preserving other keys", () => {
    setPreference("finish_option", "merge_locally", prefsPath);
    setPreference("some_other_key", "abc", prefsPath);
    setPreference("finish_option", "pr", prefsPath);

    expect(getPreference("finish_option", prefsPath)).toBe("pr");
    expect(getPreference("some_other_key", prefsPath)).toBe("abc");
  });
});
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `pnpm vitest run scripts/preferences.test.ts`
Expected: FAIL — `setPreference` is not exported yet.

- [ ] **Step 8: Implement `setPreference`**

```typescript
// add to scripts/preferences.ts, after getPreference

function writePreferences(filePath: string, prefs: Map<string, string>): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [HEADER, ...Array.from(prefs, ([key, value]) => `${key}: ${value}`)];
  fs.writeFileSync(filePath, lines.join("\n") + "\n");
}

export function setPreference(key: string, value: string, filePath: string): void {
  const prefs = readPreferences(filePath);
  prefs.set(key, value);
  writePreferences(filePath, prefs);
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `pnpm vitest run scripts/preferences.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 10: Commit**

```bash
git add scripts/preferences.ts scripts/preferences.test.ts
git commit -m "feat(preferences): set, creating the file and parent dir as needed"
```

- [ ] **Step 11: Write failing tests for `clearPreference`**

```typescript
// append to scripts/preferences.test.ts

describe("clearPreference", () => {
  let tmpDir: string;
  let prefsPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-prefs-test-"));
    prefsPath = path.join(tmpDir, "preferences.yml");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("removes a set key", () => {
    setPreference("finish_option", "merge_locally", prefsPath);
    clearPreference("finish_option", prefsPath);
    expect(getPreference("finish_option", prefsPath)).toBeUndefined();
  });

  it("leaves other keys untouched", () => {
    setPreference("finish_option", "merge_locally", prefsPath);
    setPreference("some_other_key", "abc", prefsPath);
    clearPreference("finish_option", prefsPath);
    expect(getPreference("some_other_key", prefsPath)).toBe("abc");
  });

  it("is a no-op when the key was never set", () => {
    setPreference("some_other_key", "abc", prefsPath);
    clearPreference("finish_option", prefsPath);
    expect(getPreference("some_other_key", prefsPath)).toBe("abc");
  });

  it("is a no-op when the file doesn't exist", () => {
    expect(() => clearPreference("finish_option", prefsPath)).not.toThrow();
    expect(fs.existsSync(prefsPath)).toBe(false);
  });
});
```

- [ ] **Step 12: Run the tests to verify they fail**

Run: `pnpm vitest run scripts/preferences.test.ts`
Expected: FAIL — `clearPreference` is not exported yet.

- [ ] **Step 13: Implement `clearPreference`**

```typescript
// add to scripts/preferences.ts, after setPreference

export function clearPreference(key: string, filePath: string): void {
  const prefs = readPreferences(filePath);
  if (!prefs.has(key)) return;
  prefs.delete(key);
  writePreferences(filePath, prefs);
}
```

- [ ] **Step 14: Run the tests to verify they pass**

Run: `pnpm vitest run scripts/preferences.test.ts`
Expected: PASS (13 tests)

- [ ] **Step 15: Commit**

```bash
git add scripts/preferences.ts scripts/preferences.test.ts
git commit -m "feat(preferences): clear, a no-op when the key or file is absent"
```

- [ ] **Step 16: Write failing tests for the CLI (`main`)**

```typescript
// append to scripts/preferences.test.ts

describe("main (CLI)", () => {
  let tmpDir: string;
  let prefsPath: string;
  let originalArgv: string[];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-prefs-test-"));
    prefsPath = path.join(tmpDir, "preferences.yml");
    originalArgv = process.argv;
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.exitCode = 0;
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('prints "unset" for a get on a key that was never set', () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    process.argv = ["node", "preferences.ts", "--key", "finish_option", "--action", "get", "--path", prefsPath];

    main();

    expect(logSpy).toHaveBeenCalledWith("unset");
  });

  it("writes the value and prints a confirmation for set", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    process.argv = [
      "node",
      "preferences.ts",
      "--key",
      "finish_option",
      "--action",
      "set",
      "--value",
      "merge_locally",
      "--path",
      prefsPath,
    ];

    main();

    expect(logSpy).toHaveBeenCalledWith("preferences: set finish_option=merge_locally");
    expect(getPreference("finish_option", prefsPath)).toBe("merge_locally");
  });

  it("prints the set value back on a subsequent get", () => {
    setPreference("finish_option", "pr", prefsPath);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    process.argv = ["node", "preferences.ts", "--key", "finish_option", "--action", "get", "--path", prefsPath];

    main();

    expect(logSpy).toHaveBeenCalledWith("pr");
  });

  it("clears a key and prints a confirmation", () => {
    setPreference("finish_option", "pr", prefsPath);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    process.argv = ["node", "preferences.ts", "--key", "finish_option", "--action", "clear", "--path", prefsPath];

    main();

    expect(logSpy).toHaveBeenCalledWith("preferences: cleared finish_option");
    expect(getPreference("finish_option", prefsPath)).toBeUndefined();
  });

  it("fails clearly when --value is missing for a set action", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.argv = ["node", "preferences.ts", "--key", "finish_option", "--action", "set", "--path", prefsPath];

    main();

    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith("preferences: failed (missing required flag: --value)");
  });

  it("fails clearly when a required flag is missing", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.argv = ["node", "preferences.ts", "--action", "get", "--path", prefsPath];

    main();

    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith("preferences: failed (missing required flag: --key)");
  });

  it("fails clearly on an unknown action", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.argv = ["node", "preferences.ts", "--key", "finish_option", "--action", "list", "--path", prefsPath];

    main();

    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith("preferences: failed (unknown action: list)");
  });
});
```

- [ ] **Step 17: Run the tests to verify they fail**

Run: `pnpm vitest run scripts/preferences.test.ts`
Expected: FAIL — `main` is not exported yet.

- [ ] **Step 18: Implement `main` and the run-as-CLI guard**

```typescript
// add to scripts/preferences.ts, at the end of the file

export function main(): void {
  const args = parseArgs(process.argv.slice(2));

  try {
    requireArgs(args, ["key", "action"]);
  } catch (err) {
    console.error(`preferences: failed (${(err as Error).message})`);
    process.exitCode = 1;
    return;
  }

  const filePath = args.path ?? DEFAULT_PREFERENCES_PATH;
  const key = args.key;

  switch (args.action) {
    case "get": {
      const value = getPreference(key, filePath);
      console.log(value === undefined ? "unset" : value);
      return;
    }
    case "set": {
      if (args.value === undefined) {
        console.error("preferences: failed (missing required flag: --value)");
        process.exitCode = 1;
        return;
      }
      setPreference(key, args.value, filePath);
      console.log(`preferences: set ${key}=${args.value}`);
      return;
    }
    case "clear": {
      clearPreference(key, filePath);
      console.log(`preferences: cleared ${key}`);
      return;
    }
    default:
      console.error(`preferences: failed (unknown action: ${args.action})`);
      process.exitCode = 1;
  }
}

if (import.meta.filename === process.argv[1]) {
  main();
}
```

- [ ] **Step 19: Run the tests to verify they pass**

Run: `pnpm vitest run scripts/preferences.test.ts`
Expected: PASS (20 tests)

- [ ] **Step 20: Commit**

```bash
git add scripts/preferences.ts scripts/preferences.test.ts
git commit -m "feat(preferences): add get/set/clear CLI wrapping scripts/preferences.ts"
```

---

### Task 2: `skills/preferences/SKILL.md`

**Files:**
- Create: `skills/preferences/SKILL.md`

**Interfaces:**
- Consumes: Task 1's CLI exactly as documented (`node --experimental-strip-types scripts/preferences.ts --key <key> --action get|set|clear [--value <value>] [--path <path>]`). This skill never imports `scripts/preferences.ts`'s functions directly — it only shells out to the CLI.
- Produces: the only documented entry point any consuming skill (or Jack directly) uses to read or write `.digismith/preferences.yml`. `finishing-a-development-branch` (W.8, planned separately) will invoke this skill by name, not the script directly.

This task has no automated test harness — it's skill prose, same as `skills/depot/SKILL.md` — so its steps are write-then-self-check rather than write-test-implement.

- [ ] **Step 1: Write `skills/preferences/SKILL.md`**

```markdown
---
name: preferences
description: Read, write, or clear a small per-repo setting persisted in `.digismith/preferences.yml` — general infrastructure any DigiSmith skill can call into (starting with `finishing-a-development-branch`'s saved finish-option check, map item W.8) or that Jack can invoke directly ("what's my preference for X in this repo", "set my preference for X to Y", "clear my preference for X in this repo"). Not for enumerating/listing every preference set for a repo — no known use case yet.
---

# Preferences

## Overview

DigiSmith's map item **H** (reusing the letter freed when W.6 retired the old
`digismith:subagent-driven-always`). A general per-repo settings store for any
small setting decided through live interaction rather than hand-authored —
first consumer: `finishing-a-development-branch`'s saved finish-option check
(map item W.8, not yet built).

## Invoked By

- **Automatically**, by any consuming skill that needs to read or write a
  preference for the repo currently being worked in. A consuming skill never
  parses `.digismith/preferences.yml` itself; it always goes through this
  skill's operations below.
- **Directly**, on explicit user request: "what's my preference for `<key>`
  in this repo", "set my preference for `<key>` to `<value>`", "clear my
  preference for `<key>` in this repo". This is the only path that changes a
  preference outside of a consuming skill's own first-time "remember this?"
  flow (a mechanism each consumer defines for itself — not something this
  skill invents).

## Storage

`.digismith/preferences.yml`, sibling to `.digismith/profile`, one per
consumer repo (DigiSmith's own repo included, no special-casing). Flat
key/value pairs, plain-text, no YAML library:

```
# DigiSmith-managed. Settings decided through live interaction, not hand-authored.
finish_option: merge_locally
```

Per-repo scope only — no separate global-to-you tier, no per-profile tier.
Same commit disposition as `.digismith/profile`: where a repo's `.digismith/`
isn't gitignored, committing this file along with the rest of the work is
fine; where it is, it's written but never force-added. This skill never runs
`git add`/`git commit`/`git add -f` itself — committing (or not) is left
entirely to whatever flow eventually commits the surrounding work.

## Operations

All three run `scripts/preferences.ts` from the repo root of whichever repo
is currently being worked in:

### `get`

```bash
node --experimental-strip-types scripts/preferences.ts --key <key> --action get
```

Prints the value on stdout, or the literal `unset` if the key was never set,
the file doesn't exist, or the file couldn't be parsed. Never errors over a
missing or malformed file.

### `set`

```bash
node --experimental-strip-types scripts/preferences.ts --key <key> --action set --value <value>
```

Writes `<key>: <value>` into `.digismith/preferences.yml`, creating the file
(with the header comment) and its parent directory if either doesn't exist
yet, and preserving every other key already set. Prints
`preferences: set <key>=<value>` on success.

### `clear`

```bash
node --experimental-strip-types scripts/preferences.ts --key <key> --action clear
```

Removes `<key>` if present; a no-op (not an error) if the key was never set
or the file doesn't exist. Prints `preferences: cleared <key>` either way.

`--path <path>` overrides the default `.digismith/preferences.yml` on any of
the three operations — only needed by this skill's own test suite and by
callers working outside the current directory; a normal invocation from
inside the repo being worked in never needs it.

## Worktree Propagation

Copying `.digismith/preferences.yml` into a freshly created worktree is
`digismith:bootstrap` Step 2 (sub-step 8) and `digismith:adopt` Step 5's job
(alongside their existing `.digismith/profile` copy) — this skill has no
worktree-creation logic of its own and is never invoked as part of that
copy.

## Error Handling

| Case | Disposition |
|---|---|
| `.digismith/preferences.yml` missing | Every key reads as `unset`; not an error. |
| File present but malformed/unparseable (e.g. non-UTF-8) | Treated as `unset`, same as missing. Never crashes the caller. |
| `get`/`clear` on a key that was never set | Returns/reports `unset`, not an error. |
| `set` invoked without `--value` | Fails clearly (`preferences: failed (missing required flag: --value)`), exit 1. Never silently sets an empty string. |
| Target path gitignored in this repo | Write still succeeds; committing is simply skipped by whatever flow would otherwise commit it. Never force-added. |

## Out of Scope

- A global-to-you preference tier spanning all repos — considered,
  explicitly declined in favor of per-repo-only.
- Enumerating/listing all preferences set for a repo — no concrete need yet
  (YAGNI); add only when one shows up.
- Any git add/commit logic — this skill only ever reads and writes the file;
  committing (or not) is left entirely to the surrounding flow, same as
  `.digismith/profile`.
- Migrating any `profiles/*.yml` field into this store — those remain
  DigiSmith-repo-side, hand-authored, per-profile-class config; this store
  is per-individual-repo, dynamically written through live interaction.

## Quick Reference

| Operation | Command | Effect |
|---|---|---|
| `get` | `node --experimental-strip-types scripts/preferences.ts --key <key> --action get` | Prints the value, or `unset` |
| `set` | `node --experimental-strip-types scripts/preferences.ts --key <key> --action set --value <value>` | Writes the key, creating the file/parent dir if needed; prints confirmation |
| `clear` | `node --experimental-strip-types scripts/preferences.ts --key <key> --action clear` | Removes the key if present (no-op otherwise); prints confirmation |
```

- [ ] **Step 2: Self-check the file's shape**

Confirm `skills/preferences/SKILL.md` sits exactly one level under `skills/`
(plugin skill discovery requires this — see `skills/depot/SKILL.md`'s own
`W.1` history for why), and that its frontmatter `name: preferences` is the
name every other skill will invoke as `digismith:preferences`.

- [ ] **Step 3: Commit**

```bash
git add skills/preferences/SKILL.md
git commit -m "feat(preferences): add digismith:preferences skill wrapping get/set/clear"
```

---

### Task 3: Worktree propagation in `digismith:bootstrap` and `digismith:adopt`

**Files:**
- Modify: `skills/bootstrap/SKILL.md` (Step 2's numbered list, its Quick Reference table, its Error Handling list)
- Modify: `skills/adopt/SKILL.md` (Step 5's labeled paragraphs, its Quick Reference table)

**Interfaces:**
- Consumes: nothing new — this task only adds a file-copy instruction (plain `cp`, no script/skill call), mirroring the existing `.digismith/profile` copy already documented in both files.
- Produces: nothing other skill relies on — this closes the propagation gap Task 1/2 depend on being closed for `.digismith/preferences.yml` to actually persist across worktrees.

This task is prose-only (no automated test harness), same as Task 2 — verification is a careful manual read-through confirming the new text is consistent with the surrounding steps it mirrors.

- [ ] **Step 1: Add sub-step 8 to `skills/bootstrap/SKILL.md` Step 2**

In `skills/bootstrap/SKILL.md`, immediately after existing sub-step 7 (the
`.digismith/telemetry-marker` copy) and before `### Step 3: Hand Off to
Brainstorming`, insert:

```markdown
8. **Make `.digismith/preferences.yml` visible inside the worktree, if one
   exists.** Whichever of 2.3 or 2.5 produced the worktree you're now in,
   check whether the original checkout (the directory Step 0 ran in) has a
   `.digismith/preferences.yml`. **Present** → copy it into
   `<worktree-path>/.digismith/preferences.yml` if it isn't already there: a
   plain file copy, **not** `git add`, **not** `git add -f`, **not** a
   commit — same reasoning as sub-step 6's profile copy, a worktree checks
   out only committed files. **Absent** → nothing to copy; no preferences
   have been set for this repo yet, which is not an error (see
   `digismith:preferences`'s own Error Handling — a missing file simply
   reads as every key being unset). Do this before Step 3 hands off, same as
   sub-steps 6 and 7.
```

- [ ] **Step 2: Update `skills/bootstrap/SKILL.md`'s Quick Reference row for Step 2**

Change the existing Step 2 row from:

```
| 2 | Derive `<Key>__<slug>` (or `<slug>` alone under `ticket: false`) branch name; reuse an existing worktree, or attach one to an existing branch (`git worktree add`, no `-b`), or create both (verify/rename to the exact name if the creation tool altered it); ask on collision with an unrelated ticket; then **2.6** copy `.digismith/profile` and **2.7** copy `.digismith/telemetry-marker` into the worktree, only if Step 1.5 just wrote one this run — both plain file copies, never `git add -f` |
```

to:

```
| 2 | Derive `<Key>__<slug>` (or `<slug>` alone under `ticket: false`) branch name; reuse an existing worktree, or attach one to an existing branch (`git worktree add`, no `-b`), or create both (verify/rename to the exact name if the creation tool altered it); ask on collision with an unrelated ticket; then **2.6** copy `.digismith/profile`, **2.7** copy `.digismith/telemetry-marker` (only if Step 1.5 just wrote one this run), and **2.8** copy `.digismith/preferences.yml` if the original checkout has one — all three plain file copies, never `git add -f` |
```

- [ ] **Step 3: Add an Error Handling bullet to `skills/bootstrap/SKILL.md`**

Immediately after the existing `.digismith/telemetry-marker` absent bullet in
the Error Handling section, insert:

```markdown
- **`.digismith/preferences.yml` absent inside the worktree Step 2
  produced** → expected when no preference has ever been set for this repo;
  not an error. Copy it in from the original checkout (sub-step 8) when
  present there. Never resolve this with `git add -f`.
```

- [ ] **Step 4: Add a "Preferences." paragraph to `skills/adopt/SKILL.md` Step 5**

In `skills/adopt/SKILL.md`, immediately after the existing "**Profile.**"
paragraph and before the existing "**Ticket docs.**" paragraph in Step 5,
insert:

```markdown
**Preferences.** If the original checkout (wherever Step 2 ran) has a
`.digismith/preferences.yml` and Step 4 attached a worktree other than that
checkout, copy it in now the same way: a plain file copy, never `git add`,
never `git add -f`, never a commit. Absent in the original checkout →
nothing to copy, not an error — no preferences have been set for this repo
yet.
```

- [ ] **Step 5: Update `skills/adopt/SKILL.md`'s Quick Reference row for Step 5**

Change the existing Step 5 row from:

```
| 5 | Copy `.digismith/profile` and (if Step 4 attached a new worktree) the `.digismith/docs/<slug>/` folder in; unconditionally clear then (if `logging: true`) write and copy in a fresh telemetry marker |
```

to:

```
| 5 | Copy `.digismith/profile`, `.digismith/preferences.yml` (if the original checkout has one), and (if Step 4 attached a new worktree) the `.digismith/docs/<slug>/` folder in; unconditionally clear then (if `logging: true`) write and copy in a fresh telemetry marker |
```

- [ ] **Step 6: Read through both files once, end to end**

Confirm the new bootstrap sub-step 8 and its Quick Reference/Error Handling
updates read consistently with sub-steps 6/7 around it, and that adopt's new
"Preferences." paragraph reads consistently with "Profile."/"Ticket
docs."/"Telemetry marker." around it. No automated check exists for this —
this read-through is the verification.

- [ ] **Step 7: Commit**

```bash
git add skills/bootstrap/SKILL.md skills/adopt/SKILL.md
git commit -m "feat(preferences): propagate .digismith/preferences.yml into fresh worktrees"
```

---

## Self-Review

**Spec coverage** (against `.digismith/docs/preferences-and-finish-option/design.html`'s H sections):
- `#h-problem` — motivation only, no task needed.
- `#h-storage` — Task 1 (`readPreferences`/`getPreference`/`setPreference`/`writePreferences`'s exact format, header comment, per-repo-only scope).
- `#h-skill` — Task 2 (`skills/preferences/SKILL.md`, automatic + direct invocation, `get`/`set`/`clear` interface, no enumeration).
- `#h-propagation` — Task 3 (bootstrap sub-step 8, adopt's "Preferences." paragraph).
- `#h-errors` — Task 1 (missing/malformed file → unset, never throw) and Task 2's Error Handling table (documents the same dispositions for callers); gitignore/never-force-add disposition documented in both Task 1's Global Constraints and Task 2's Storage section.

**Placeholder scan:** no `TBD`/`TODO`/"add appropriate error handling"-style text anywhere above; every step has real, runnable code or the exact prose to insert.

**Type consistency:** `getPreference`/`setPreference`/`clearPreference` all take `(key: string, ..., filePath: string)` consistently across Task 1's Steps 3, 8, 13, and 18's `main()`; `DEFAULT_PREFERENCES_PATH` is defined once (Step 3) and referenced only in `main()` (Step 18) — no second, differently-named constant introduced later.
