# Autonomous jobs run the built CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Nexus jobs autonomous-scan and autonomous-report run the built CLI of the main checkout, and the CLI source runs under type stripping.

**Architecture:** `registry.ts` points `DG` at `<MAIN_CHECKOUT>/packages/cli/dist/index.js` with no strip-types flag. Parameter properties become plain fields. A smoke test spawns the source CLI under strip-types.

**Tech Stack:** TypeScript, Node `--experimental-strip-types`, vitest, pnpm.

## Global Constraints

- pnpm only. No push, no merge until "go: merge". No ClickUp write.
- `MAIN_CHECKOUT` is `join(homedir(), 'Workspace', 'Jazurite', 'DigiSmith')` (already in the registry).
- No wrapper for a missing `dist`: node prints `Error: Cannot find module '<MAIN_CHECKOUT>/packages/cli/dist/index.js'` and exits 1.
- Do not touch `scripts/nexus-api/src/scheduler/` beyond `registry.ts` and `registry.test.ts` (DGS-582 edits the same area).
- Commits: title-only, conventional, no AI attribution.

---

### Task 1: Registry runs the built CLI

**Files:**
- Modify: `scripts/nexus-api/src/scheduler/registry.ts:5-7`
- Test: `scripts/nexus-api/src/scheduler/registry.test.ts`

**Interfaces:**
- Consumes: none.
- Produces: `DG` is `[<MAIN_CHECKOUT>/packages/cli/dist/index.js]`. The two autonomous jobs keep their names and args after `DG`.

- [ ] **Step 1: Write the failing test.** In `registry.test.ts` add `import { homedir } from 'node:os'` and, in the same `describe` as the autonomous tests:

```ts
  it('autonomous jobs run the built CLI of the main checkout, not strip-types source', () => {
    const dist = join(homedir(), 'Workspace', 'Jazurite', 'DigiSmith', 'packages', 'cli', 'dist', 'index.js')
    for (const name of ['autonomous-scan', 'autonomous-report']) {
      const { command } = JOBS.find((j) => j.name === name)!
      expect(command.file).toBe(process.execPath)
      expect(command.args[0]).toBe(dist)
      expect(command.args).not.toContain('--experimental-strip-types')
    }
  })
```

- [ ] **Step 2: Run it and see it fail.** Run: `pnpm vitest run scripts/nexus-api/src/scheduler/registry.test.ts`. Expected: FAIL (first arg is `--experimental-strip-types`).

- [ ] **Step 3: Change the registry.** Replace lines 5-7 with:

```ts
const MAIN_CHECKOUT = join(homedir(), 'Workspace', 'Jazurite', 'DigiSmith')
// The built CLI of the main checkout: the same build the global `dg` runs. A missing dist fails the job with node's "Cannot find module".
const DG = [join(MAIN_CHECKOUT, 'packages', 'cli', 'dist', 'index.js')]
```

Remove the now-unused `DEPOT` const only if no other line uses it (`grep -n DEPOT registry.ts`).

- [ ] **Step 4: Run the registry tests.** Run: `pnpm vitest run scripts/nexus-api`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add scripts/nexus-api/src/scheduler/registry.ts scripts/nexus-api/src/scheduler/registry.test.ts
git commit -m "fix(nexus): run the built CLI of the main checkout in the autonomous jobs"
```

### Task 2: Plain fields instead of parameter properties, with a smoke test

**Files:**
- Create: `packages/cli/src/strip-types.smoke.test.ts`
- Modify: `packages/cli/src/autonomous/tracker-clickup.ts:37`
- Modify: `packages/cli/src/steward/fake-tracker.test-util.ts:21`

**Interfaces:**
- Consumes: none.
- Produces: `ClickUpLoTracker` keeps its constructor signature `(client: ClickUpClient, spaceId: string)`. `FakeTracker` keeps `(ticket: TicketSnapshot)`, and `ticket` stays a public mutable field.

- [ ] **Step 1: Write the failing smoke test.**

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, it, expect } from "vitest";

const run = promisify(execFile);
const entry = new URL("./index.ts", import.meta.url).pathname;

// Autonomous jobs once ran the source under type stripping; vitest hides syntax that stripping refuses.
describe("source CLI under --experimental-strip-types", () => {
  for (const args of [["--help"], ["autonomous", "--help"]]) {
    it(`dg ${args.join(" ")} runs`, async () => {
      const { stdout } = await run(process.execPath, ["--experimental-strip-types", entry, ...args]);
      expect(stdout).toMatch(/autonomous|scan|report/i);
    }, 30_000);
  }
});
```

- [ ] **Step 2: Run it and see it fail.** Run: `pnpm --filter @digismith/cli exec vitest run src/strip-types.smoke.test.ts`. Expected: FAIL with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` (parameter properties).

- [ ] **Step 3: Fix `tracker-clickup.ts:37`.**

```ts
  private readonly client: ClickUpClient;
  private readonly spaceId: string;

  constructor(client: ClickUpClient, spaceId: string) {
    this.client = client;
    this.spaceId = spaceId;
  }
```

Put the two field declarations with the other fields above the constructor. Then fix `fake-tracker.test-util.ts:21`:

```ts
  ticket: TicketSnapshot;
  constructor(ticket: TicketSnapshot) {
    this.ticket = ticket;
  }
```

Re-run the smoke test. If it names another file, fix that file the same way (enums and namespaces become plain objects and modules). Repeat until it passes.

- [ ] **Step 4: Run the CLI tests and the type check.** Run: `pnpm --filter @digismith/cli test` and `pnpm --filter @digismith/cli exec tsc -p tsconfig.build.json --noEmit`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add packages/cli/src
git commit -m "fix(cli): use plain fields so the source runs under type stripping"
```

### Task 3: Check the built CLI and the whole suite

**Files:**
- None created. A failure here means a fix in Task 1 or 2.

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces: evidence for the report.

- [ ] **Step 1: Build the CLI in the worktree.** Run: `pnpm --filter @digismith/cli build`. Expected: exit 0. The main checkout's dist is not touched.

- [ ] **Step 2: Run the built CLI.** Run: `node packages/cli/dist/index.js autonomous --help`. Expected: help text, exit 0.

- [ ] **Step 3: Run the missing-dist case and record the output.** Run: `node /nonexistent/packages/cli/dist/index.js autonomous status; echo exit=$?`. Expected: `Cannot find module`, `exit=1`. Put the output in the report.

- [ ] **Step 4: Run all tests.** Run: `pnpm test`. Expected: PASS.
