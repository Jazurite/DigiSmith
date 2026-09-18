# Jira Client Windows Entry-Guard Fix (I.5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `packages/jira-client/src/cli.ts`'s entry-point guard, which never matches on Windows and silently no-ops every subcommand, and add a regression test that actually exercises it.

**Architecture:** One-line guard fix plus a new subprocess-invocation test in `cli.test.ts` that spawns the real CLI as a child process (`node`) and asserts real stdout/stderr/exit-code behavior — the only way to prove `main()` actually runs, since the existing tests only exercise pure helper functions and never invoke the CLI as a process at all.

**Tech Stack:** TypeScript (Node ≥24 native type stripping, no build step), Vitest, `node:child_process`'s `spawnSync`.

## Global Constraints

- Node ≥24 (per `packages/jira-client/package.json`'s `engines` field) — `import.meta.filename` is stable since Node 21.2, so no compatibility concern.
- No new dependencies — this fix is a guard-string swap and a test using only Node builtins already used elsewhere in this repo's test suite.
- I.6 (attachment upload + inline-image support) is explicitly out of scope for this plan — do not touch `client.ts` or add any new CLI subcommand.

---

### Task 1: Fix the Windows entry-point guard with a regression test

**Files:**
- Modify: `packages/jira-client/src/cli.ts:107`
- Modify: `packages/jira-client/src/cli.test.ts` (add a new `describe` block; existing `parseArgs`/`requireArgs` tests untouched)

**Interfaces:**
- Consumes: nothing new — `cli.ts`'s existing exports (`parseArgs`, `requireArgs`) and the `check-credentials` subcommand's existing behavior (reads `JIRA_EMAIL`/`JIRA_API_TOKEN`/`JIRA_SITE` from `<homedir>/.digismith-depot/.env` via `checkCredentials()` in `client.ts`, prints `"check-credentials: ok"` to stderr on success or `"no credentials: <message>"` to stderr with exit code 1 on failure).
- Produces: nothing new for later tasks — this is a terminal, standalone fix.

- [ ] **Step 1: Write the two failing subprocess tests**

Add to `packages/jira-client/src/cli.test.ts`, after the existing imports (keep the existing `parseArgs`/`requireArgs` tests exactly as they are):

```ts
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT_PATH = fileURLToPath(new URL("./cli.ts", import.meta.url));

describe("check-credentials CLI (entry guard)", () => {
  it("actually runs main() and reports ok with valid credentials", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "jira-client-cli-"));
    const depotDir = join(tmpDir, ".digismith-depot");
    mkdirSync(depotDir);
    writeFileSync(
      join(depotDir, ".env"),
      "JIRA_EMAIL=jack@example.com\nJIRA_API_TOKEN=abc123\nJIRA_SITE=example.atlassian.net\n"
    );

    const result = spawnSync("node", [SCRIPT_PATH, "check-credentials"], {
      encoding: "utf-8",
      env: { ...process.env, HOME: tmpDir, USERPROFILE: tmpDir },
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toContain("check-credentials: ok");
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("actually runs main() and reports the real error with missing credentials", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "jira-client-cli-"));

    const result = spawnSync("node", [SCRIPT_PATH, "check-credentials"], {
      encoding: "utf-8",
      env: { ...process.env, HOME: tmpDir, USERPROFILE: tmpDir },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("no credentials: no credentials file found at");
    rmSync(tmpDir, { recursive: true, force: true });
  });
});
```

`spawnSync` (not `execFileSync`, unlike `scripts/providers/print-config.test.ts`'s existing pattern) because the success-path assertion needs stderr — `check-credentials`'s ok message goes to `console.error`, and `execFileSync` only returns stdout on a non-throwing (exit 0) call. `spawnSync` returns `{status, stdout, stderr}` regardless of exit code, so both tests can assert on `result.stderr` directly. Setting both `HOME` and `USERPROFILE` on the spawned env covers `os.homedir()`'s resolution on both Windows and POSIX without needing any new CLI flag — `checkCredentials()`'s default path already resolves through `homedir()`.

- [ ] **Step 2: Run the tests to verify they currently fail**

Run: `pnpm test -- packages/jira-client/src/cli.test.ts`

Expected on Windows: both new tests **FAIL** — the entry guard (`import.meta.url === \`file://${process.argv[1]}\``) never matches, so `main()` never runs, `check-credentials` prints nothing at all, and neither `result.stderr` assertion finds its expected text (the first test also fails since `result.status` will be `0` from Node's own clean exit, coincidentally matching what's expected, but the stderr assertion right after it still fails — the guard's failure here is silent, not a crash). The existing `parseArgs`/`requireArgs` tests still pass unaffected.

- [ ] **Step 3: Fix the entry-point guard**

In `packages/jira-client/src/cli.ts`, replace line 107:

```ts
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
```

with:

```ts
if (import.meta.filename === process.argv[1]) {
```

- [ ] **Step 4: Run the tests to verify everything passes**

Run: `pnpm test -- packages/jira-client/src/cli.test.ts`

Expected: all tests pass, including the two new subprocess tests — `main()` now actually runs when the script is invoked directly, on Windows and POSIX alike.

- [ ] **Step 5: Commit**

```bash
git add packages/jira-client/src/cli.ts packages/jira-client/src/cli.test.ts
git commit -m "fix(jira-client): correct Windows-broken CLI entry-point guard"
```

## Self-Check Before Finishing

- [ ] Both new tests actually spawn `node` as a real subprocess — neither one imports and calls `main()` directly (that would never exercise the guard at all).
- [ ] The fix is exactly the one-line swap — no unrelated changes to `cli.ts` or `client.ts`, no new subcommand (that's **I.6**, out of scope here).
- [ ] `pnpm test -- packages/jira-client/src/cli.test.ts` passes in full, including the pre-existing `parseArgs`/`requireArgs` tests.
