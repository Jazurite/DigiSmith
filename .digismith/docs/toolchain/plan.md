# Toolchain (U) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Jack a standing, dictatable list of tool/technology defaults (test runner, styling, E2E framework, script language, package manager, Node install method) and make `digismith:brainstorming` consult it before asking a tooling/stack question it can already answer.

**Architecture:** A small TypeScript module (`scripts/toolchain.ts`) does plain-line read/write against a repo-root `toolchain.yml` — no YAML library, same parsing convention as `scripts/preferences.ts`. A thin CLI wraps it (`--action`/`--domain`/`--value`, reusing `scripts/cli-args.ts`). `skills/toolchain/SKILL.md` is the only thing any consuming skill or Jack ever calls. One new paragraph in `skills/brainstorming/SKILL.md`'s clarifying-questions guidance runs `list` before a tooling question and either states the assumption or asks as normal.

**Tech Stack:** TypeScript (Node ≥24, `node --experimental-strip-types`, no build step), Vitest, no new dependencies.

## Global Constraints

- **Map item:** U (Toolchain). Design doc: `.digismith/docs/toolchain/design.html`.
- **Storage format:** `toolchain.yml` at DigiSmith's own repo root (not `.digismith/`, not per-consuming-repo), flat `domain: choice` pairs only, no nesting, no YAML library — same parsing convention already used for `.digismith/profile`/`preferences.yml`.
- **Scope:** global to Jack — one file, no per-repo tier, no per-profile tier.
- **Interface:** exactly `list()`, `set(domain, value)`, `clear(domain)`. No single-key `get` — YAGNI, the store stays small and is always read as a unit, not looked up mid-flow.
- **CLI shape:** `--action list|set|clear [--domain <d>] [--value <v>] [--path <path>]` (flag-based, fitting `scripts/cli-args.ts`'s `--flag value` parsing), invoked as `node --experimental-strip-types scripts/toolchain.ts ...`. `--path` exists only for this task's own test isolation — there is exactly one real location, so it is never documented as an end-user override.
- **Error handling:** missing/malformed file → `list` prints nothing, not an error. `set` without `--domain` or `--value` fails clearly, exit 1. `clear` on a domain never set is a silent no-op that still reports success. An ambiguous match against a queued brainstorming question → ask as normal rather than guess.
- **Testing:** real file fixtures in a temp directory (`fs.mkdtempSync`), no mocking — same shape as `scripts/preferences.test.ts`.
- **Brainstorming integration:** one new paragraph in `skills/brainstorming/SKILL.md`'s "Understanding the idea" section — prose, not code; verified by manual read-through and a live CLI check, not an automated test.
- **Trigger scope:** `digismith:brainstorming` only. The broader "any session, any tooling choice" version is explicitly out of scope for this plan — see `backlog/toolchain-general-trigger-scope.md`.
- **Seed data:** `toolchain.yml` ships pre-populated with the six domains already confirmed during brainstorming (`test_runner`, `styling`, `e2e_framework`, `script_language`, `package_manager`, `node_installation`) — not left empty for Jack to dictate from scratch.

---

## File Structure

- `scripts/toolchain.ts` — **new.** Core `readToolchain`/`setToolchainDefault`/`clearToolchainDefault` logic against a `toolchain.yml`-shaped file, plus a `main()` CLI entry point. Reuses `scripts/cli-args.ts`'s `parseArgs`/`requireArgs` (existing, unchanged). Its own local `parseFieldValue` mirrors `scripts/preferences.ts`'s function of the same name and behavior — not imported from there, same "local equivalent scoped to the one file this script reads" precedent that file's own comment documents.
- `scripts/toolchain.test.ts` — **new.** Real-fixture unit tests, no mocking, same shape as `scripts/preferences.test.ts`.
- `toolchain.yml` — **new.** Seed data file at DigiSmith's own repo root, the six standing defaults already confirmed during brainstorming.
- `skills/toolchain/SKILL.md` — **new.** Wraps the script's three operations, the only place any consuming skill (or Jack directly) ever touches `toolchain.yml`, same pattern `skills/preferences/SKILL.md` uses for its own store.
- `skills/brainstorming/SKILL.md` — **modified.** "Understanding the idea" section gains a new "Toolchain defaults" subsection, inserted between the existing bullet list and "Exploring approaches:".

---

### Task 1: `scripts/toolchain.ts` — core read/write logic and CLI

**Files:**
- Create: `scripts/toolchain.ts`
- Create: `scripts/toolchain.test.ts`

**Interfaces:**
- Consumes: `parseArgs(argv: string[]): Record<string, string>` and `requireArgs(args: Record<string, string>, names: string[]): void` from `scripts/cli-args.ts` (existing, unchanged).
- Produces: `DEFAULT_TOOLCHAIN_PATH: string` (constant, value `"toolchain.yml"`); `readToolchain(filePath: string): Map<string, string>`; `setToolchainDefault(domain: string, value: string, filePath: string): void`; `clearToolchainDefault(domain: string, filePath: string): void`; `main(): void`. Task 2's `skills/toolchain/SKILL.md` shells out to the CLI only — it does not import these functions directly.

- [ ] **Step 1: Write failing tests for `readToolchain`**

```typescript
// scripts/toolchain.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  DEFAULT_TOOLCHAIN_PATH,
  readToolchain,
  setToolchainDefault,
  clearToolchainDefault,
  main,
} from "./toolchain.ts";

describe("DEFAULT_TOOLCHAIN_PATH", () => {
  it("locks the documented default path", () => {
    expect(DEFAULT_TOOLCHAIN_PATH).toBe("toolchain.yml");
  });
});

describe("readToolchain", () => {
  let tmpDir: string;
  let toolchainPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-toolchain-test-"));
    toolchainPath = path.join(tmpDir, "toolchain.yml");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns an empty map for a missing file", () => {
    expect(readToolchain(toolchainPath)).toEqual(new Map());
  });

  it("reads a flat domain/value pair, ignoring the header comment", () => {
    fs.writeFileSync(
      toolchainPath,
      "# DigiSmith-managed. Standing toolchain defaults, dictated by Jack.\ntest_runner: Vitest\n",
    );
    expect(readToolchain(toolchainPath).get("test_runner")).toBe("Vitest");
  });

  it("reads multiple entries", () => {
    fs.writeFileSync(toolchainPath, "test_runner: Vitest\nstyling: SCSS\n");
    const entries = readToolchain(toolchainPath);
    expect(entries.get("test_runner")).toBe("Vitest");
    expect(entries.get("styling")).toBe("SCSS");
    expect(entries.size).toBe(2);
  });

  it("strips an inline comment", () => {
    fs.writeFileSync(toolchainPath, "test_runner: Vitest   # confirmed 2026-08-27\n");
    expect(readToolchain(toolchainPath).get("test_runner")).toBe("Vitest");
  });

  it("unwraps a quoted value", () => {
    fs.writeFileSync(toolchainPath, 'test_runner: "Vitest"\n');
    expect(readToolchain(toolchainPath).get("test_runner")).toBe("Vitest");
  });

  it("returns undefined for a domain that was never set", () => {
    fs.writeFileSync(toolchainPath, "test_runner: Vitest\n");
    expect(readToolchain(toolchainPath).get("styling")).toBeUndefined();
  });

  it("treats a non-UTF-8 file as empty rather than throwing", () => {
    fs.writeFileSync(toolchainPath, Buffer.from([0x66, 0x3a, 0xff, 0xfe]));
    expect(() => readToolchain(toolchainPath)).not.toThrow();
    expect(readToolchain(toolchainPath)).toEqual(new Map());
  });

  it("skips a line with no colon", () => {
    fs.writeFileSync(toolchainPath, "not a valid line\ntest_runner: Vitest\n");
    expect(readToolchain(toolchainPath).get("test_runner")).toBe("Vitest");
  });

  it("preserves a value containing its own punctuation", () => {
    fs.writeFileSync(
      toolchainPath,
      "script_language: TypeScript (over Python, absent existing precedent to match)\n",
    );
    expect(readToolchain(toolchainPath).get("script_language")).toBe(
      "TypeScript (over Python, absent existing precedent to match)",
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run scripts/toolchain.test.ts`
Expected: FAIL — `./toolchain.ts` does not exist yet (module resolution error).

- [ ] **Step 3: Implement `readToolchain`**

```typescript
// scripts/toolchain.ts
import * as fs from "node:fs";
import * as path from "node:path";
import { parseArgs, requireArgs } from "./cli-args.ts";

export const DEFAULT_TOOLCHAIN_PATH = "toolchain.yml";

const HEADER = "# DigiSmith-managed. Standing toolchain defaults, dictated by Jack.";

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
// shape as scripts/preferences.ts's parseFieldValue — not imported from
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

export function readToolchain(filePath: string): Map<string, string> {
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
    const domain = line.slice(0, colonIndex).trim();
    if (!domain) continue;
    result.set(domain, parseFieldValue(line));
  }
  return result;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run scripts/toolchain.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/toolchain.ts scripts/toolchain.test.ts
git commit -m "feat(toolchain): read against toolchain.yml"
```

- [ ] **Step 6: Write failing tests for `setToolchainDefault`**

```typescript
// append to scripts/toolchain.test.ts

describe("setToolchainDefault", () => {
  let tmpDir: string;
  let toolchainPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-toolchain-test-"));
    toolchainPath = path.join(tmpDir, "nested", "toolchain.yml");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates the file (and parent directory) with the header comment when none existed", () => {
    setToolchainDefault("test_runner", "Vitest", toolchainPath);
    const content = fs.readFileSync(toolchainPath, "utf8");
    expect(content).toBe(
      "# DigiSmith-managed. Standing toolchain defaults, dictated by Jack.\ntest_runner: Vitest\n",
    );
  });

  it("updates an existing domain in place, preserving other domains", () => {
    setToolchainDefault("test_runner", "Vitest", toolchainPath);
    setToolchainDefault("styling", "SCSS", toolchainPath);
    setToolchainDefault("test_runner", "Jest", toolchainPath);

    const entries = readToolchain(toolchainPath);
    expect(entries.get("test_runner")).toBe("Jest");
    expect(entries.get("styling")).toBe("SCSS");
  });
});
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `pnpm vitest run scripts/toolchain.test.ts`
Expected: FAIL — `setToolchainDefault is not a function` (not exported yet).

- [ ] **Step 8: Implement `setToolchainDefault`**

```typescript
// add to scripts/toolchain.ts, after readToolchain

function writeToolchain(filePath: string, entries: Map<string, string>): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [HEADER, ...Array.from(entries, ([domain, value]) => `${domain}: ${value}`)];
  fs.writeFileSync(filePath, lines.join("\n") + "\n");
}

export function setToolchainDefault(domain: string, value: string, filePath: string): void {
  const entries = readToolchain(filePath);
  entries.set(domain, value);
  writeToolchain(filePath, entries);
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `pnpm vitest run scripts/toolchain.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 10: Commit**

```bash
git add scripts/toolchain.ts scripts/toolchain.test.ts
git commit -m "feat(toolchain): add setToolchainDefault"
```

- [ ] **Step 11: Write failing tests for `clearToolchainDefault`**

```typescript
// append to scripts/toolchain.test.ts

describe("clearToolchainDefault", () => {
  let tmpDir: string;
  let toolchainPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-toolchain-test-"));
    toolchainPath = path.join(tmpDir, "toolchain.yml");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("removes a set domain", () => {
    setToolchainDefault("test_runner", "Vitest", toolchainPath);
    clearToolchainDefault("test_runner", toolchainPath);
    expect(readToolchain(toolchainPath).get("test_runner")).toBeUndefined();
  });

  it("leaves other domains untouched", () => {
    setToolchainDefault("test_runner", "Vitest", toolchainPath);
    setToolchainDefault("styling", "SCSS", toolchainPath);
    clearToolchainDefault("test_runner", toolchainPath);
    expect(readToolchain(toolchainPath).get("styling")).toBe("SCSS");
  });

  it("is a no-op when the domain was never set", () => {
    setToolchainDefault("styling", "SCSS", toolchainPath);
    clearToolchainDefault("test_runner", toolchainPath);
    expect(readToolchain(toolchainPath).get("styling")).toBe("SCSS");
  });

  it("is a no-op when the file doesn't exist", () => {
    expect(() => clearToolchainDefault("test_runner", toolchainPath)).not.toThrow();
    expect(fs.existsSync(toolchainPath)).toBe(false);
  });
});
```

- [ ] **Step 12: Run the tests to verify they fail**

Run: `pnpm vitest run scripts/toolchain.test.ts`
Expected: FAIL — `clearToolchainDefault is not a function` (not exported yet).

- [ ] **Step 13: Implement `clearToolchainDefault`**

```typescript
// add to scripts/toolchain.ts, after setToolchainDefault

export function clearToolchainDefault(domain: string, filePath: string): void {
  const entries = readToolchain(filePath);
  if (!entries.has(domain)) return;
  entries.delete(domain);
  writeToolchain(filePath, entries);
}
```

- [ ] **Step 14: Run the tests to verify they pass**

Run: `pnpm vitest run scripts/toolchain.test.ts`
Expected: PASS (16 tests)

- [ ] **Step 15: Commit**

```bash
git add scripts/toolchain.ts scripts/toolchain.test.ts
git commit -m "feat(toolchain): add clearToolchainDefault"
```

- [ ] **Step 16: Write failing tests for the `main()` CLI**

```typescript
// append to scripts/toolchain.test.ts

describe("main (CLI)", () => {
  let tmpDir: string;
  let toolchainPath: string;
  let originalArgv: string[];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-toolchain-test-"));
    toolchainPath = path.join(tmpDir, "toolchain.yml");
    originalArgv = process.argv;
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.exitCode = 0;
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("prints nothing for list on a missing file", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    process.argv = ["node", "toolchain.ts", "--action", "list", "--path", toolchainPath];

    main();

    expect(logSpy).not.toHaveBeenCalled();
  });

  it("prints every domain/value pair for list", () => {
    setToolchainDefault("test_runner", "Vitest", toolchainPath);
    setToolchainDefault("styling", "SCSS", toolchainPath);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    process.argv = ["node", "toolchain.ts", "--action", "list", "--path", toolchainPath];

    main();

    expect(logSpy).toHaveBeenCalledWith("test_runner: Vitest");
    expect(logSpy).toHaveBeenCalledWith("styling: SCSS");
  });

  it("writes the value and prints a confirmation for set", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    process.argv = [
      "node",
      "toolchain.ts",
      "--action",
      "set",
      "--domain",
      "test_runner",
      "--value",
      "Vitest",
      "--path",
      toolchainPath,
    ];

    main();

    expect(logSpy).toHaveBeenCalledWith("toolchain: set test_runner=Vitest");
    expect(readToolchain(toolchainPath).get("test_runner")).toBe("Vitest");
  });

  it("clears a domain and prints a confirmation", () => {
    setToolchainDefault("test_runner", "Vitest", toolchainPath);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    process.argv = ["node", "toolchain.ts", "--action", "clear", "--domain", "test_runner", "--path", toolchainPath];

    main();

    expect(logSpy).toHaveBeenCalledWith("toolchain: cleared test_runner");
    expect(readToolchain(toolchainPath).get("test_runner")).toBeUndefined();
  });

  it("fails clearly when --domain is missing for set", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.argv = ["node", "toolchain.ts", "--action", "set", "--value", "Vitest", "--path", toolchainPath];

    main();

    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith("toolchain: failed (missing required flag: --domain)");
  });

  it("fails clearly when --value is missing for set", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.argv = ["node", "toolchain.ts", "--action", "set", "--domain", "test_runner", "--path", toolchainPath];

    main();

    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith("toolchain: failed (missing required flag: --value)");
  });

  it("fails clearly when --domain is missing for clear", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.argv = ["node", "toolchain.ts", "--action", "clear", "--path", toolchainPath];

    main();

    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith("toolchain: failed (missing required flag: --domain)");
  });

  it("fails clearly when --action is missing", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.argv = ["node", "toolchain.ts", "--path", toolchainPath];

    main();

    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith("toolchain: failed (missing required flag: --action)");
  });

  it("fails clearly on an unknown action", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.argv = ["node", "toolchain.ts", "--action", "get", "--path", toolchainPath];

    main();

    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith("toolchain: failed (unknown action: get)");
  });
});
```

- [ ] **Step 17: Run the tests to verify they fail**

Run: `pnpm vitest run scripts/toolchain.test.ts`
Expected: FAIL — `main is not a function` (not exported yet).

- [ ] **Step 18: Implement `main()`**

```typescript
// add to scripts/toolchain.ts, after clearToolchainDefault

export function main(): void {
  const args = parseArgs(process.argv.slice(2));

  try {
    requireArgs(args, ["action"]);
  } catch (err) {
    console.error(`toolchain: failed (${(err as Error).message})`);
    process.exitCode = 1;
    return;
  }

  const filePath = args.path ?? DEFAULT_TOOLCHAIN_PATH;

  switch (args.action) {
    case "list": {
      for (const [domain, value] of readToolchain(filePath)) {
        console.log(`${domain}: ${value}`);
      }
      return;
    }
    case "set": {
      if (args.domain === undefined) {
        console.error("toolchain: failed (missing required flag: --domain)");
        process.exitCode = 1;
        return;
      }
      if (args.value === undefined) {
        console.error("toolchain: failed (missing required flag: --value)");
        process.exitCode = 1;
        return;
      }
      setToolchainDefault(args.domain, args.value, filePath);
      console.log(`toolchain: set ${args.domain}=${args.value}`);
      return;
    }
    case "clear": {
      if (args.domain === undefined) {
        console.error("toolchain: failed (missing required flag: --domain)");
        process.exitCode = 1;
        return;
      }
      clearToolchainDefault(args.domain, filePath);
      console.log(`toolchain: cleared ${args.domain}`);
      return;
    }
    default:
      console.error(`toolchain: failed (unknown action: ${args.action})`);
      process.exitCode = 1;
  }
}

if (import.meta.filename === process.argv[1]) {
  main();
}
```

- [ ] **Step 19: Run the tests to verify they pass**

Run: `pnpm vitest run scripts/toolchain.test.ts`
Expected: PASS (25 tests)

- [ ] **Step 20: Commit**

```bash
git add scripts/toolchain.ts scripts/toolchain.test.ts
git commit -m "feat(toolchain): add list/set/clear CLI"
```

---

### Task 2: Seed data and `skills/toolchain/SKILL.md`

**Files:**
- Create: `toolchain.yml`
- Create: `skills/toolchain/SKILL.md`

**Interfaces:**
- Consumes: Task 1's CLI exactly as documented (`node --experimental-strip-types scripts/toolchain.ts --action list|set|clear [--domain <d>] [--value <v>] [--path <path>]`). This skill never imports `scripts/toolchain.ts`'s functions directly — it only shells out to the CLI.
- Produces: the only documented entry point any consuming skill (or Jack directly) uses to read or write `toolchain.yml`. `skills/brainstorming/SKILL.md` (Task 3) invokes this skill by name, not the script directly.

This task has no automated test harness for its SKILL.md half — it's skill prose, same as `skills/preferences/SKILL.md` — so those steps are write-then-self-check rather than write-test-implement. The seed-data half is verified with a live CLI check instead of a unit test, since it's real repo data, not logic.

- [ ] **Step 1: Write the seed data file**

```
# DigiSmith-managed. Standing toolchain defaults, dictated by Jack.
test_runner: Vitest
styling: SCSS
e2e_framework: Playwright
package_manager: pnpm (workspace/monorepo management and global CLI installs)
node_installation: nvm (over distro-packaged Node — apt/NodeSource — on a server)
script_language: TypeScript (over Python, absent existing precedent to match)
```

Save this as `toolchain.yml` at the DigiSmith repo root (sibling to `MEMORY.md`, `package.json`).

- [ ] **Step 2: Verify the CLI reads the seed file back correctly**

Run: `node --experimental-strip-types scripts/toolchain.ts --action list`
Expected output (order matches the file):
```
test_runner: Vitest
styling: SCSS
e2e_framework: Playwright
package_manager: pnpm (workspace/monorepo management and global CLI installs)
node_installation: nvm (over distro-packaged Node — apt/NodeSource — on a server)
script_language: TypeScript (over Python, absent existing precedent to match)
```

- [ ] **Step 3: Write `skills/toolchain/SKILL.md`**

```markdown
---
name: toolchain
description: Read or dictate Jack's standing toolchain defaults (test runner, styling, E2E framework, script language, package manager, Node install method) stored in `toolchain.yml` at DigiSmith's own repo root — general infrastructure `digismith:brainstorming` consults before asking a tooling/stack question, or that Jack can invoke directly ("what are my toolchain defaults", "set my default styling to X", "clear my default for Y").
---

# Toolchain

## Overview

DigiSmith's map item **U**. A standing, dictatable list of Jack's tool/technology
defaults for common greenfield decisions — test runner, styling approach, E2E
framework, script language, package manager, Node install method. First (and
so far only) consumer: `digismith:brainstorming`'s clarifying-questions step,
so it stops re-asking questions Jack has already decided.

## Invoked By

- **Automatically**, by `digismith:brainstorming` before asking a clarifying
  question about a tooling/stack choice. A consuming skill never parses
  `toolchain.yml` itself; it always goes through this skill's operations below.
- **Directly**, on explicit request: "what are my toolchain defaults", "set my
  default styling to X", "clear my default for Y".

## Storage

`toolchain.yml` at DigiSmith's own repo root — global to Jack, not per
consuming repo (unlike `.digismith/preferences.yml`, map item H, which is
per-repo project config; these are Jack's own standing choices). Flat
domain/value pairs, plain-text, no YAML library:

```
# DigiSmith-managed. Standing toolchain defaults, dictated by Jack.
test_runner: Vitest
styling: SCSS
```

## Operations

All three run `scripts/toolchain.ts` from DigiSmith's own repo root. Locate it
the same way `digismith:preferences` and `digismith:inject-standards` already
do: current working directory is the DigiSmith repo
(`.claude-plugin/plugin.json` with `"name": "digismith"`) → use directly;
otherwise ask once for DigiSmith's repo path and remember it for the session.

### `list`

```bash
node --experimental-strip-types <digismith-repo>/scripts/toolchain.ts --action list
```

Prints every domain/value pair, one per line (`<domain>: <value>`). Prints
nothing for a missing or malformed file — not an error.

### `set`

```bash
node --experimental-strip-types <digismith-repo>/scripts/toolchain.ts --action set --domain <domain> --value <value>
```

Writes `<domain>: <value>`, creating the file (with the header comment) if it
doesn't exist yet, and preserving every other domain already set. Prints
`toolchain: set <domain>=<value>` on success.

### `clear`

```bash
node --experimental-strip-types <digismith-repo>/scripts/toolchain.ts --action clear --domain <domain>
```

Removes `<domain>` if present; a no-op (not an error) if it was never set or
the file doesn't exist. Prints `toolchain: cleared <domain>` either way.

`--path <path>` overrides the default `toolchain.yml` location — used only by
this skill's own test suite; there is exactly one real location, so a normal
invocation never needs it.

## Error Handling

| Case | Disposition |
|---|---|
| `toolchain.yml` missing | `list` prints nothing; every domain reads as unset. Not an error. |
| File present but malformed/unparseable (e.g. non-UTF-8) | Treated as empty, same as missing. Never crashes the caller. |
| `set` invoked without `--domain` or `--value` | Fails clearly (`toolchain: failed (missing required flag: --domain|--value)`), exit 1. Never silently sets an empty string. |
| `clear` on a domain that was never set | Silent no-op; still reports `toolchain: cleared <domain>` (never an error). |

## Out of Scope

- A per-repo override tier — these are Jack's own defaults, not project
  config, unlike map item H's `.digismith/preferences.yml`.
- A single-key `get` operation — the store stays small and is always read as
  a unit via `list`; add one only if a real need for it shows up.
- Any trigger point beyond `digismith:brainstorming` — deferred, see
  `backlog/toolchain-general-trigger-scope.md`.
- Auto-persisting an override back to the file when Jack overrides a stated
  assumption in the moment — that turn's choice is used as-is, not written
  back without a separate explicit confirmation.

## Quick Reference

| Operation | Command | Effect |
|---|---|---|
| `list` | `node --experimental-strip-types <digismith-repo>/scripts/toolchain.ts --action list` | Prints every domain/value pair, or nothing |
| `set` | `... --action set --domain <domain> --value <value>` | Writes the domain, creating the file if needed; prints confirmation |
| `clear` | `... --action clear --domain <domain>` | Removes the domain if present (no-op otherwise); prints confirmation |
```

- [ ] **Step 4: Self-check the file's shape**

Confirm `skills/toolchain/SKILL.md` sits exactly one level under `skills/`
(plugin skill discovery requires this — see `skills/depot/SKILL.md`'s own
`W.1` history for why), and that its frontmatter `name: toolchain` is the name
every other skill will invoke as `digismith:toolchain`.

- [ ] **Step 5: Commit**

```bash
git add toolchain.yml skills/toolchain/SKILL.md
git commit -m "feat(toolchain): seed defaults and add digismith:toolchain skill"
```

---

### Task 3: `digismith:brainstorming` consult step

**Files:**
- Modify: `skills/brainstorming/SKILL.md` ("Understanding the idea" section, lines 65-74 as of this plan's writing)

**Interfaces:**
- Consumes: `digismith:toolchain`'s `list`/`set` operations (Task 2) exactly as documented — this task never shells out to `scripts/toolchain.ts` directly, it invokes the skill by name, same as every other cross-cutting hook into this vendored primitive.
- Produces: nothing further downstream — this is the terminal consumer for map item U's initial scope.

This task is prose, not code — no automated test harness. Its step is write-then-self-check, verified live rather than by a unit test (per the design doc's own Testing section).

- [ ] **Step 1: Insert the new subsection**

In `skills/brainstorming/SKILL.md`, find this existing text under `## The Process` → `**Understanding the idea:**`:

```markdown
- For appropriately-scoped projects, ask questions one at a time to refine the idea
- Prefer multiple choice questions when possible, but open-ended is fine too
- Only one question per message - if a topic needs more exploration, break it into multiple questions
- Focus on understanding: purpose, constraints, success criteria

**Exploring approaches:**
```

Replace it with (adds one new subsection between the two, changes nothing else):

```markdown
- For appropriately-scoped projects, ask questions one at a time to refine the idea
- Prefer multiple choice questions when possible, but open-ended is fine too
- Only one question per message - if a topic needs more exploration, break it into multiple questions
- Focus on understanding: purpose, constraints, success criteria

**Toolchain defaults (map item U):**

- Before asking a clarifying question about a tooling/technology choice (test runner, styling approach, E2E framework, script language, package manager, Node install method, or anything in the same spirit), run `digismith:toolchain`'s `list` operation once and hold the result for the rest of this step.
- Match the question you're about to ask against the listed domains by meaning, not exact wording (e.g. "which test runner do you want" matches a stored `test_runner` entry).
- **Match found** — state the assumption instead of asking: "`<domain>`: defaulting to `<value>` per your standing default — say the word if you want something else this time." Still honor an immediate override in the same turn if given; don't write the override back automatically.
- **No match** — ask via `AskUserQuestion` as normal. If the answer reads as a standing preference rather than a one-off choice, offer to record it: "Want me to remember `<value>` as your standing default for `<domain>`?" On yes, call `digismith:toolchain`'s `set` operation.
- Missing/empty/malformed `toolchain.yml` → `list` returns nothing; ask every tooling question fresh, same as before this mechanism existed. Never blocks this step.
- This check runs only here, inside `digismith:brainstorming` — not inside `digismith:writing-plans`, subagent dispatch, or any other flow. See `backlog/toolchain-general-trigger-scope.md` for the deferred broader version.

**Exploring approaches:**
```

- [ ] **Step 2: Self-check**

Read the full "Understanding the idea" section once more, start to finish.
Confirm: the new subsection sits between the existing bullet list and
"Exploring approaches:" (not inside either); it doesn't restate or contradict
Checklist item 3 ("Ask clarifying questions — one at a time, understand
purpose/constraints/success criteria"); and the two bullets under "Match
found"/"No match" are unambiguous about exactly one of two things happening
per queued tooling question — never both, never neither.

- [ ] **Step 3: Live-verify against the real seed file**

Run: `node --experimental-strip-types scripts/toolchain.ts --action list`
(from the DigiSmith repo root) and confirm the six entries from Task 2 print
back exactly as seeded. This is the exact data the new subsection's "Match
found" branch will match a live clarifying question against.

- [ ] **Step 4: Commit**

```bash
git add skills/brainstorming/SKILL.md
git commit -m "feat(brainstorming): consult toolchain defaults before a tooling question"
```
