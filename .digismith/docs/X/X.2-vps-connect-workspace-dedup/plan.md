# VPS Connect Workspace Dedup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `dg vps connect`'s crash-recovery path from leaking a duplicate herdr workspace every time it runs — reuse an existing, matching-labeled workspace's idle pane before creating a new one.

**Architecture:** Add pure builder/parser functions for `herdr workspace list` and `herdr pane list --workspace <id>` (plus a parser for the `agent_pane_busy` error shape) to `checks.ts`, following the exact pattern already used for `buildAgentGetCommand`/`parseAgentGetOutput`. Add one new orchestration function, `tryReuseExistingPane`, to `connect.ts` that's attempted before `buildCreateWorkspaceCommand` in `runConnect`'s recovery branch. A failure that isn't `agent_pane_busy` stays a hard failure, matching today's behavior for a start-agent failure.

**Tech Stack:** TypeScript (Node ≥24, native type-stripping in dev, `tsc` for the published build), Vitest.

## Global Constraints

- Every new exported function follows the existing `build<Verb>Command`/`parse<Noun>Output` naming and file-placement split already established in `checks.ts` (read/check-style builders and parsers) vs. `connect.ts` (mutating actions and orchestration).
- `workspace list`/`pane list` failures are **soft-fail**: any parse or exit-code failure returns an empty array, never throws, never exits the process. This dedup logic is a leak-reduction optimization on top of an already-working recovery path — a failure in it must never make `connect` less reliable than it is today.
- Only a confirmed `agent_pane_busy` error moves to the next candidate pane/workspace. Every other `agent start` failure remains a hard, terminal failure (`process.exit(1)`), unchanged from today.
- No new runtime dependencies.
- Full design context: `.digismith/docs/X/X.2-vps-connect-workspace-dedup/design.html`.

---

### Task 1: herdr workspace/pane list builders and parsers

**Files:**
- Modify: `packages/cli/src/vps/checks.ts`
- Test: `packages/cli/src/vps/checks.test.ts`

**Interfaces:**
- Produces: `buildWorkspaceListCommand(config: VpsConfig): SshCommand`
- Produces: `buildPaneListCommand(config: VpsConfig, workspaceId: string): SshCommand`
- Produces: `interface WorkspaceInfo { workspaceId: string; label: string }`
- Produces: `parseWorkspaceListOutput(exitCode: number, stdout: string): WorkspaceInfo[]`
- Produces: `parsePaneListOutput(exitCode: number, stdout: string): string[]`
- Produces: `isAgentPaneBusyError(exitCode: number, stdout: string): boolean`

- [ ] **Step 1: Write the failing tests**

Add to the end of `packages/cli/src/vps/checks.test.ts` (the file already imports `describe`, `it`, `expect` from `vitest` and a `CONFIG: VpsConfig` constant at the top — reuse `CONFIG`, don't redeclare it):

```ts
import {
  buildWorkspaceListCommand,
  buildPaneListCommand,
  parseWorkspaceListOutput,
  parsePaneListOutput,
  isAgentPaneBusyError,
} from "./checks.ts";

describe("buildWorkspaceListCommand", () => {
  it("lists herdr workspaces after ensuring herdr is on PATH", () => {
    const cmd = buildWorkspaceListCommand(CONFIG);
    const remote = cmd.args[cmd.args.length - 1];
    expect(remote).toContain(HERDR_PATH_PREFIX);
    expect(remote).toContain("herdr workspace list");
  });
});

describe("buildPaneListCommand", () => {
  it("lists panes for the given workspace id after ensuring herdr is on PATH", () => {
    const cmd = buildPaneListCommand(CONFIG, "w2");
    const remote = cmd.args[cmd.args.length - 1];
    expect(remote).toContain(HERDR_PATH_PREFIX);
    expect(remote).toContain("herdr pane list --workspace w2");
  });
});

const WORKSPACE_LIST_STDOUT = JSON.stringify({
  id: "cli:workspace:list",
  result: {
    type: "workspace_list",
    workspaces: [
      { workspace_id: "w2", label: "opencode-k3-spike", pane_count: 1, agent_status: "unknown" },
      { workspace_id: "w3", label: "digismith-main", pane_count: 1, agent_status: "unknown" },
    ],
  },
});

describe("parseWorkspaceListOutput", () => {
  it("parses every workspace's id and label on success", () => {
    expect(parseWorkspaceListOutput(0, WORKSPACE_LIST_STDOUT)).toEqual([
      { workspaceId: "w2", label: "opencode-k3-spike" },
      { workspaceId: "w3", label: "digismith-main" },
    ]);
  });

  it("returns an empty array on a non-zero exit code", () => {
    expect(parseWorkspaceListOutput(1, WORKSPACE_LIST_STDOUT)).toEqual([]);
  });

  it("returns an empty array when stdout isn't parseable JSON despite exit 0", () => {
    expect(parseWorkspaceListOutput(0, "not json")).toEqual([]);
  });

  it("returns an empty array when result.workspaces is missing", () => {
    expect(parseWorkspaceListOutput(0, JSON.stringify({ id: "cli:workspace:list", result: {} }))).toEqual([]);
  });

  it("skips an entry missing workspace_id or label", () => {
    const stdout = JSON.stringify({
      result: { workspaces: [{ workspace_id: "w2" }, { label: "only-a-label" }, { workspace_id: "w4", label: "ok" }] },
    });
    expect(parseWorkspaceListOutput(0, stdout)).toEqual([{ workspaceId: "w4", label: "ok" }]);
  });
});

const PANE_LIST_STDOUT = JSON.stringify({
  id: "cli:pane:list",
  result: {
    type: "pane_list",
    panes: [
      { pane_id: "w2:p1", agent_status: "idle", workspace_id: "w2" },
      { pane_id: "w2:p2", agent_status: "unknown", workspace_id: "w2" },
    ],
  },
});

describe("parsePaneListOutput", () => {
  it("parses every pane's id, in order, on success", () => {
    expect(parsePaneListOutput(0, PANE_LIST_STDOUT)).toEqual(["w2:p1", "w2:p2"]);
  });

  it("returns an empty array on a non-zero exit code", () => {
    expect(parsePaneListOutput(1, PANE_LIST_STDOUT)).toEqual([]);
  });

  it("returns an empty array when stdout isn't parseable JSON despite exit 0", () => {
    expect(parsePaneListOutput(0, "not json")).toEqual([]);
  });

  it("returns an empty array when result.panes is missing", () => {
    expect(parsePaneListOutput(0, JSON.stringify({ id: "cli:pane:list", result: {} }))).toEqual([]);
  });
});

describe("isAgentPaneBusyError", () => {
  it("is true for a real agent_pane_busy error payload", () => {
    const stdout = JSON.stringify({
      error: { code: "agent_pane_busy", message: "agent target pane w2:p1 is not an available shell" },
      id: "cli:agent:start",
    });
    expect(isAgentPaneBusyError(1, stdout)).toBe(true);
  });

  it("is false for a different error code", () => {
    const stdout = JSON.stringify({ error: { code: "workspace_not_found" }, id: "cli:agent:start" });
    expect(isAgentPaneBusyError(1, stdout)).toBe(false);
  });

  it("is false on a zero exit code, regardless of stdout shape", () => {
    expect(isAgentPaneBusyError(0, JSON.stringify({ error: { code: "agent_pane_busy" } }))).toBe(false);
  });

  it("is false when stdout isn't parseable JSON", () => {
    expect(isAgentPaneBusyError(1, "not json")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- packages/cli/src/vps/checks.test.ts`
Expected: FAIL — `buildWorkspaceListCommand`, `buildPaneListCommand`, `parseWorkspaceListOutput`, `parsePaneListOutput`, and `isAgentPaneBusyError` are not exported from `./checks.ts`.

- [ ] **Step 3: Implement the builders and parsers**

Add to `packages/cli/src/vps/checks.ts`, after `buildCredentialsCheckCommand` and before `isHerdrInstalled`:

```ts
export function buildWorkspaceListCommand(config: VpsConfig): SshCommand {
  return { command: "ssh", args: [...buildBaseSshArgs(config), `${HERDR_PATH_PREFIX}; herdr workspace list`] };
}

export function buildPaneListCommand(config: VpsConfig, workspaceId: string): SshCommand {
  return {
    command: "ssh",
    args: [...buildBaseSshArgs(config), `${HERDR_PATH_PREFIX}; herdr pane list --workspace ${workspaceId}`],
  };
}
```

Add to the end of `packages/cli/src/vps/checks.ts`:

```ts
export interface WorkspaceInfo {
  workspaceId: string;
  label: string;
}

interface HerdrWorkspaceListResponse {
  result?: { workspaces?: Array<{ workspace_id?: unknown; label?: unknown }> };
}

// Soft-fail by design: any exit-code or parse failure reads as "no reusable
// candidates," never as a reason to abort connect — this is a leak-reduction
// optimization on top of an already-working recovery path, not a
// correctness requirement.
export function parseWorkspaceListOutput(exitCode: number, stdout: string): WorkspaceInfo[] {
  if (exitCode !== 0) return [];
  let parsed: HerdrWorkspaceListResponse;
  try {
    parsed = JSON.parse(stdout) as HerdrWorkspaceListResponse;
  } catch {
    return [];
  }
  const workspaces = parsed.result?.workspaces;
  if (!Array.isArray(workspaces)) return [];
  const result: WorkspaceInfo[] = [];
  for (const w of workspaces) {
    if (typeof w.workspace_id === "string" && typeof w.label === "string") {
      result.push({ workspaceId: w.workspace_id, label: w.label });
    }
  }
  return result;
}

interface HerdrPaneListResponse {
  result?: { panes?: Array<{ pane_id?: unknown }> };
}

export function parsePaneListOutput(exitCode: number, stdout: string): string[] {
  if (exitCode !== 0) return [];
  let parsed: HerdrPaneListResponse;
  try {
    parsed = JSON.parse(stdout) as HerdrPaneListResponse;
  } catch {
    return [];
  }
  const panes = parsed.result?.panes;
  if (!Array.isArray(panes)) return [];
  const result: string[] = [];
  for (const p of panes) {
    if (typeof p.pane_id === "string") result.push(p.pane_id);
  }
  return result;
}

interface HerdrErrorResponse {
  error?: { code?: unknown };
}

export function isAgentPaneBusyError(exitCode: number, stdout: string): boolean {
  if (exitCode === 0) return false;
  let parsed: HerdrErrorResponse;
  try {
    parsed = JSON.parse(stdout) as HerdrErrorResponse;
  } catch {
    return false;
  }
  return parsed.error?.code === "agent_pane_busy";
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- packages/cli/src/vps/checks.test.ts`
Expected: PASS, all tests in the file green.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/vps/checks.ts packages/cli/src/vps/checks.test.ts
git commit -m "feat(vps): add herdr workspace/pane list builders and parsers"
```

---

### Task 2: Reuse an existing pane in `runConnect` before creating a new workspace

**Files:**
- Modify: `packages/cli/src/vps/connect.ts:1-11` (imports), `packages/cli/src/vps/connect.ts:262-292` (recovery branch)

**Interfaces:**
- Consumes (from Task 1): `buildWorkspaceListCommand(config: VpsConfig): SshCommand`, `buildPaneListCommand(config: VpsConfig, workspaceId: string): SshCommand`, `parseWorkspaceListOutput(exitCode: number, stdout: string): WorkspaceInfo[]`, `parsePaneListOutput(exitCode: number, stdout: string): string[]`, `isAgentPaneBusyError(exitCode: number, stdout: string): boolean`
- Consumes (already in `connect.ts`): `buildStartAgentCommand(config: VpsConfig, paneId: string): SshCommand`, `runSshCommand(cmd: SshCommand): CommandResult`, `describeSshFailure(result: CommandResult): string`
- Produces: `tryReuseExistingPane(config: VpsConfig): boolean`

This task has no new unit tests of its own — `tryReuseExistingPane` and `runConnect` are orchestration over live SSH calls, which this codebase deliberately keeps live-verify-only (see X.1's own precedent: no mocked `spawnSync` for the SSH/tmux orchestration layer). Task 1's builders/parsers already cover every piece of logic that can be unit tested here. The deliverable is verified by the full test suite staying green and a clean typecheck/build (Steps 2 and 4 below), then Task 3's live verification.

- [ ] **Step 1: Update imports and add `tryReuseExistingPane`**

In `packages/cli/src/vps/connect.ts`, change the `checks.ts` import (currently line 7):

```ts
import { buildBaseSshArgs, buildHerdrServerCheckCommand, HERDR_PATH_PREFIX, type SshCommand } from "./checks.ts";
```

to:

```ts
import {
  buildBaseSshArgs,
  buildHerdrServerCheckCommand,
  buildWorkspaceListCommand,
  buildPaneListCommand,
  parseWorkspaceListOutput,
  parsePaneListOutput,
  isAgentPaneBusyError,
  HERDR_PATH_PREFIX,
  type SshCommand,
} from "./checks.ts";
```

Add this function right after `buildStartAgentCommand` (currently ending at line 53) and before `buildAttachArgs`:

```ts
// Tries every pane of every workspace already carrying config.workspace_label,
// in list order, before the caller falls back to creating a brand-new
// workspace — closing the leak where a crash-recovered OpenCode process's
// still-alive pane gets abandoned instead of reused. agent_pane_busy on a
// candidate just means "try the next one"; any other start failure is a
// hard failure, same as an unrecoverable start failure on a freshly created
// pane always has been.
export function tryReuseExistingPane(config: VpsConfig): boolean {
  const listWorkspaces = runSshCommand(buildWorkspaceListCommand(config));
  const workspaces = parseWorkspaceListOutput(listWorkspaces.status, listWorkspaces.stdout);
  const matches = workspaces.filter((w) => w.label === config.workspace_label);

  for (const workspace of matches) {
    const listPanes = runSshCommand(buildPaneListCommand(config, workspace.workspaceId));
    const paneIds = parsePaneListOutput(listPanes.status, listPanes.stdout);

    for (const paneId of paneIds) {
      const startAgent = runSshCommand(buildStartAgentCommand(config, paneId));
      if (startAgent.status === 0) {
        console.log(`vps-session: reusing existing pane ${paneId} in workspace ${workspace.workspaceId}`);
        return true;
      }
      if (!isAgentPaneBusyError(startAgent.status, startAgent.stdout)) {
        console.error(
          `vps-session: failed to start the OpenCode agent on existing pane ${paneId} — ${describeSshFailure(startAgent)}`
        );
        process.exit(1);
      }
    }
  }

  return false;
}
```

- [ ] **Step 2: Run the full test suite to confirm no regressions before touching `runConnect`**

Run: `pnpm test`
Expected: PASS, same 52 files / 493 tests as the worktree's clean baseline (the new function isn't called from anywhere yet, so nothing behavioral has changed).

- [ ] **Step 3: Wire `tryReuseExistingPane` into `runConnect`'s recovery branch**

In `packages/cli/src/vps/connect.ts`, replace this block (currently lines 262-292):

```ts
  if (!status.agentAlive.ok) {
    console.log(`vps-session: workspace/agent "${config.agent_name}" not found, creating it...`);
    const create = runSshCommand(buildCreateWorkspaceCommand(config));
    if (create.status !== 0) {
      console.error(`vps-session: failed to create the herdr workspace — ${describeSshFailure(create)}`);
      process.exit(1);
    }
    // Idempotent — writes the plugin file if absent, no-ops otherwise.
    const integrationInstall = runSshCommand(buildInstallHerdrIntegrationCommand(config));
    if (integrationInstall.status !== 0) {
      console.error(
        `vps-session: warning — herdr integration install failed: ${describeSshFailure(integrationInstall)}`
      );
    }
    let paneId: string | null = null;
    try {
      const parsed = JSON.parse(create.stdout) as { result?: { root_pane?: { pane_id?: string } } };
      paneId = parsed.result?.root_pane?.pane_id ?? null;
    } catch {
      paneId = null;
    }
    if (!paneId) {
      console.error(`vps-session: could not parse a pane_id from workspace creation output:\n${create.stdout}`);
      process.exit(1);
    }
    const startAgent = runSshCommand(buildStartAgentCommand(config, paneId));
    if (startAgent.status !== 0) {
      console.error(`vps-session: failed to start the OpenCode agent — ${describeSshFailure(startAgent)}`);
      process.exit(1);
    }
  }
```

with:

```ts
  if (!status.agentAlive.ok) {
    console.log(
      `vps-session: workspace/agent "${config.agent_name}" not found, checking for a reusable "${config.workspace_label}" workspace...`
    );
    // Idempotent — writes the plugin file if absent, no-ops otherwise. Runs
    // unconditionally here since it's machine-wide, not workspace-specific,
    // regardless of whether we end up reusing a pane or creating a new one.
    const integrationInstall = runSshCommand(buildInstallHerdrIntegrationCommand(config));
    if (integrationInstall.status !== 0) {
      console.error(
        `vps-session: warning — herdr integration install failed: ${describeSshFailure(integrationInstall)}`
      );
    }

    if (!tryReuseExistingPane(config)) {
      console.log(`vps-session: no reusable pane found, creating a new workspace...`);
      const create = runSshCommand(buildCreateWorkspaceCommand(config));
      if (create.status !== 0) {
        console.error(`vps-session: failed to create the herdr workspace — ${describeSshFailure(create)}`);
        process.exit(1);
      }
      let paneId: string | null = null;
      try {
        const parsed = JSON.parse(create.stdout) as { result?: { root_pane?: { pane_id?: string } } };
        paneId = parsed.result?.root_pane?.pane_id ?? null;
      } catch {
        paneId = null;
      }
      if (!paneId) {
        console.error(`vps-session: could not parse a pane_id from workspace creation output:\n${create.stdout}`);
        process.exit(1);
      }
      const startAgent = runSshCommand(buildStartAgentCommand(config, paneId));
      if (startAgent.status !== 0) {
        console.error(`vps-session: failed to start the OpenCode agent — ${describeSshFailure(startAgent)}`);
        process.exit(1);
      }
    }
  }
```

- [ ] **Step 4: Run the full test suite and a typecheck build**

Run: `pnpm test`
Expected: PASS, same 52 files / 493 tests — `runConnect` itself has no direct unit tests (live-verify-only), so this confirms nothing else broke.

Run: `pnpm --filter @digismith/cli build`
Expected: succeeds with no TypeScript errors (confirms the new imports and the reworked recovery branch type-check cleanly).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/vps/connect.ts
git commit -m "fix(vps): reuse an existing labeled workspace/pane before creating a new one"
```

---

### Task 3: Live verification — crash-recovery no longer leaks a workspace

**Files:** none (no code changes — this task only runs commands against the real VPS and records the result)

This mirrors X.1's own Task 6 crash-simulation (`backlog/vps-connect-workspace-dedup-x1.md` was filed directly from that verification run). `~/.digismith-depot/vps.json` must exist for `dg vps connect`/`dg vps status` to resolve VPS connection details — it's expected to already be present on this machine from X.1's own live verification.

- [ ] **Step 1: Build the CLI with this task's changes**

Run: `pnpm --filter @digismith/cli build`
Expected: succeeds (same as Task 2 Step 4 — rebuilding here in case Task 3 runs in a fresh shell).

- [ ] **Step 2: Record the current workspace count for the configured label**

Run: `node packages/cli/dist/index.js vps status`
Expected: reports the agent as alive (a healthy session from a prior connect). Note the output for comparison.

Then, to see the raw workspace list directly (bypassing the CLI, straight against herdr, to get an authoritative baseline):

```bash
ssh -i <identity_file from vps.json> <user>@<host> 'export PATH="$HOME/.local/bin:$PATH"; herdr workspace list'
```

Record how many workspaces currently carry the configured `workspace_label` (expected: exactly 1, the healthy session from Step 2).

- [ ] **Step 3: Simulate a crash**

Kill the OpenCode process inside the existing pane without closing the pane or the workspace itself — this reproduces exactly the state X.1's Task 6 confirmed (pane alive, agent registration gone):

```bash
ssh -i <identity_file> <user>@<host> 'export PATH="$HOME/.local/bin:$PATH"; herdr agent get <agent_name>'
```

Then find and kill the underlying OpenCode process for that pane (e.g. via `pkill -f opencode` on the VPS, or the equivalent process-targeting approach used during X.1's own Task 6 — check `backlog/vps-connect-workspace-dedup-x1.md` and X.1's own plan.md Task 6 for the exact command used there, and reuse it for consistency).

Confirm the crash landed in the expected state:

```bash
ssh -i <identity_file> <user>@<host> 'export PATH="$HOME/.local/bin:$PATH"; herdr agent get <agent_name>'
```

Expected: `agent_not_found` (or equivalent — the registration is gone) while the workspace/pane themselves are untouched.

- [ ] **Step 4: Run `dg vps connect` and confirm it reuses the existing pane, not a new workspace**

Run: `node packages/cli/dist/index.js vps connect`
Expected console output includes a line like `vps-session: reusing existing pane <pane_id> in workspace <workspace_id>` — **not** `vps-session: no reusable pane found, creating a new workspace...`. (Detach/exit the interactive attach once this is confirmed — the point of this check is the log line before the attach, not staying attached.)

- [ ] **Step 5: Confirm no duplicate workspace was created**

```bash
ssh -i <identity_file> <user>@<host> 'export PATH="$HOME/.local/bin:$PATH"; herdr workspace list'
```

Expected: the same workspace count for the configured `workspace_label` as recorded in Step 2 — no new entry.

- [ ] **Step 6: Record the result**

Update `backlog/vps-connect-workspace-dedup-x1.md`'s `Status:` line (currently `Not applied.`) to record that X.2 fixed this, with the date and a one-line pointer to `.digismith/docs/X/X.2-vps-connect-workspace-dedup/`. Commit:

```bash
git add backlog/vps-connect-workspace-dedup-x1.md
git commit -m "docs(X.2): record live verification of the workspace-dedup fix"
```
