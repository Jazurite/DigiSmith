# Pluggable Runners (K.6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the coding-agent **runner** — OpenCode or Claude Code — pluggable per-profile in `skills/offload-implementer`, the same shape K.3 already established for the gateway **vendor** (Chutes/TokenReply).

**Architecture:** A `Runner` Strategy interface one level over K.3's `GatewayProvider` — `scripts/runners/types.ts`, one concrete module per runner (`opencode.ts`, `claude-code.ts`), a `resolveRunner()` factory (`registry.ts`), and a new `parse-result.ts` CLI that normalizes either runner's raw event stream into one `ParsedResult` shape. `GatewayProvider` gains `supportsRunner: RunnerName[]` so a runner/vendor combination that can't authenticate is rejected before dispatch. `offload-implementer/SKILL.md`'s Steps 1, 2, 4, 5 become runner-conditional; Steps 0, 3, 6 and Error Handling stay untouched. `depot/SKILL.md` gains a new, stateless `ensure-claude-code` operation — no process, no pid, no port, since `claude -p` spawns fresh per dispatch.

**Tech Stack:** TypeScript (Node 24 native type-stripping, no `ts-node`/`tsx`), Vitest — matches K.3, no new dependencies. `tsconfig.json`/root `package.json` scaffolding already exists from K.3; this plan adds no scaffolding task.

**Spec:** [.digismith/docs/pluggable-runners/design.html](.digismith/docs/pluggable-runners/design.html)

## Global Constraints

- Node `>=24` only; every new script runs directly via `node <file>.ts` — never add `ts-node`/`tsx`/a build step.
- ESM throughout, every relative import uses an explicit `.ts` extension (`NodeNext` module resolution requires it) — matches every existing file under `scripts/`.
- **Windows CLI main-guard:** every new CLI entry point uses the verified-working form (confirmed live on this machine that the `import.meta.url === \`file://${process.argv[1]}\`` pattern always evaluates `false` on Windows):
  ```ts
  import { pathToFileURL } from "node:url";
  if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    main();
  }
  ```
- Reuse `scripts/cli-args.ts`'s `parseArgs`/`requireArgs` for every new CLI — do not reinvent flag parsing.
- `scripts/runners/` mirrors `scripts/providers/`'s file shape and test conventions exactly (`registry.test.ts`'s shared `assertConforms()` helper pattern; `print-config.test.ts`'s `execFileSync`-against-`fileURLToPath`-resolved-script-path CLI-contract pattern) — both quoted in full in the tasks below.
- No new npm dependencies.
- `GatewayProvider`'s existing 6 fields (`name`, `displayName`, `baseUrl`, `credentialEnv`, `contextWindow`, `model()`) are untouched; this plan only adds a 7th field, `supportsRunner`.

---

### Task 1: Runner Strategy core — types, OpenCode, Claude Code, registry

**Files:**
- Create: `scripts/runners/types.ts`
- Create: `scripts/runners/opencode.ts`
- Create: `scripts/runners/claude-code.ts`
- Create: `scripts/runners/registry.ts`
- Test: `scripts/runners/registry.test.ts`
- Test: `scripts/runners/opencode.test.ts`
- Test: `scripts/runners/claude-code.test.ts`

**Interfaces:**
- Consumes: `GatewayProvider` from `scripts/providers/types.ts` (`{ name, displayName, baseUrl, credentialEnv, contextWindow, model(role) }`); `buildOpencodeProviderBlock(provider, role)` from `scripts/providers/print-config.ts`.
- Produces: `RunnerName = "opencode" | "claude-code"`; `interface Runner { name: RunnerName; buildConfig(provider: GatewayProvider, role: "mechanical" | "task"): Record<string, unknown>; parseResult(eventsFile: string): ParsedResult; }`; `interface ParsedResult { status: "success" | "error" | "interrupted"; resultText: string | null; sessionId: string | null; costUsd?: number; }`; `resolveRunner(name: string): Runner | undefined`; concrete `opencode: Runner` and `claudeCode: Runner` — consumed by Task 2's `parse-result.ts` CLI, Task 3's `supportsRunner` field, and Task 5's `offload-implementer/SKILL.md` edit.

- [ ] **Step 1: Write `scripts/runners/types.ts`**

```ts
import type { GatewayProvider, OffloadRole } from "../providers/types.ts";

export type RunnerName = "opencode" | "claude-code";

export interface ParsedResult {
  status: "success" | "error" | "interrupted";
  resultText: string | null;
  sessionId: string | null;
  costUsd?: number;
}

export interface Runner {
  name: RunnerName;
  buildConfig(provider: GatewayProvider, role: OffloadRole): Record<string, unknown>;
  parseResult(eventsFile: string): ParsedResult;
}
```

- [ ] **Step 2: Write the failing test for the OpenCode runner module**

```ts
// scripts/runners/opencode.test.ts
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { opencode } from "./opencode.ts";
import { chutes } from "../providers/chutes.ts";
import { buildOpencodeProviderBlock } from "../providers/print-config.ts";

describe("opencode.buildConfig", () => {
  it("delegates to buildOpencodeProviderBlock unchanged", () => {
    expect(opencode.buildConfig(chutes, "task")).toEqual(
      buildOpencodeProviderBlock(chutes, "task"),
    );
  });
});

describe("opencode.parseResult", () => {
  function writeEvents(lines: Record<string, unknown>[]): string {
    const dir = mkdtempSync(join(tmpdir(), "opencode-events-"));
    const path = join(dir, "events.jsonl");
    writeFileSync(path, lines.map((l) => JSON.stringify(l)).join("\n") + "\n", "utf-8");
    return path;
  }

  it("extracts the last text event's nested part.text and top-level sessionID", () => {
    const path = writeEvents([
      { type: "step-start", sessionID: "ses_abc" },
      {
        type: "text",
        sessionID: "ses_abc",
        part: { id: "prt_1", type: "text", text: "first reply" },
      },
      {
        type: "text",
        sessionID: "ses_abc",
        part: { id: "prt_2", type: "text", text: "final reply" },
      },
    ]);
    expect(opencode.parseResult(path)).toEqual({
      status: "success",
      resultText: "final reply",
      sessionId: "ses_abc",
      costUsd: undefined,
    });
  });

  it("returns status error when no text event exists", () => {
    const path = writeEvents([{ type: "step-start", sessionID: "ses_xyz" }]);
    expect(opencode.parseResult(path)).toEqual({
      status: "error",
      resultText: null,
      sessionId: "ses_xyz",
      costUsd: undefined,
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run scripts/runners/opencode.test.ts`
Expected: FAIL — `Cannot find module './opencode.ts'`

- [ ] **Step 4: Write `scripts/runners/opencode.ts`**

```ts
import { readFileSync } from "node:fs";
import type { GatewayProvider, OffloadRole } from "../providers/types.ts";
import { buildOpencodeProviderBlock } from "../providers/print-config.ts";
import type { ParsedResult, Runner } from "./types.ts";

interface OpencodeEvent {
  type: string;
  sessionID?: string;
  part?: { type: string; text?: string };
}

function parseResult(eventsFile: string): ParsedResult {
  const lines = readFileSync(eventsFile, "utf-8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as OpencodeEvent);

  const sessionId = lines.find((e) => e.sessionID)?.sessionID ?? null;
  const lastText = [...lines].reverse().find((e) => e.type === "text");

  if (!lastText || typeof lastText.part?.text !== "string") {
    return { status: "error", resultText: null, sessionId };
  }

  return { status: "success", resultText: lastText.part.text, sessionId };
}

export const opencode: Runner = {
  name: "opencode",
  buildConfig(provider: GatewayProvider, role: OffloadRole) {
    return buildOpencodeProviderBlock(provider, role);
  },
  parseResult,
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run scripts/runners/opencode.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Write the failing test for the Claude Code runner module**

```ts
// scripts/runners/claude-code.test.ts
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { claudeCode } from "./claude-code.ts";
import { tokenreply } from "../providers/tokenreply.ts";

describe("claudeCode.buildConfig", () => {
  it("returns the base URL and credential env var, not an opencode.json block", () => {
    expect(claudeCode.buildConfig(tokenreply, "task")).toEqual({
      baseUrl: "https://api.tokenreply.com/v1",
      credentialEnv: "TOKENREPLY_API_KEY",
    });
  });
});

describe("claudeCode.parseResult", () => {
  function writeEvents(lines: Record<string, unknown>[]): string {
    const dir = mkdtempSync(join(tmpdir(), "claude-code-events-"));
    const path = join(dir, "events.jsonl");
    writeFileSync(path, lines.map((l) => JSON.stringify(l)).join("\n") + "\n", "utf-8");
    return path;
  }

  it("parses a success result line", () => {
    const path = writeEvents([
      { type: "system", subtype: "init", session_id: "sess_1" },
      {
        type: "result",
        subtype: "success",
        result: "the actual reply content",
        session_id: "sess_1",
        cost: { total_cost_usd: 0.0123 },
      },
    ]);
    expect(claudeCode.parseResult(path)).toEqual({
      status: "success",
      resultText: "the actual reply content",
      sessionId: "sess_1",
      costUsd: 0.0123,
    });
  });

  it("parses an error result line", () => {
    const path = writeEvents([
      {
        type: "result",
        subtype: "error",
        result: null,
        session_id: "sess_2",
        cost: { total_cost_usd: 0.001 },
      },
    ]);
    expect(claudeCode.parseResult(path)).toEqual({
      status: "error",
      resultText: null,
      sessionId: "sess_2",
      costUsd: 0.001,
    });
  });

  it("parses an interrupted result line", () => {
    const path = writeEvents([
      {
        type: "result",
        subtype: "interrupted",
        result: null,
        session_id: "sess_3",
        cost: { total_cost_usd: 0 },
      },
    ]);
    expect(claudeCode.parseResult(path)).toEqual({
      status: "interrupted",
      resultText: null,
      sessionId: "sess_3",
      costUsd: 0,
    });
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npx vitest run scripts/runners/claude-code.test.ts`
Expected: FAIL — `Cannot find module './claude-code.ts'`

- [ ] **Step 8: Write `scripts/runners/claude-code.ts`**

```ts
import { readFileSync } from "node:fs";
import type { GatewayProvider, OffloadRole } from "../providers/types.ts";
import type { ParsedResult, Runner } from "./types.ts";

interface ClaudeResultEvent {
  type: string;
  subtype?: "success" | "error" | "interrupted";
  result?: string | null;
  session_id?: string;
  cost?: { total_cost_usd?: number };
}

function parseResult(eventsFile: string): ParsedResult {
  const lines = readFileSync(eventsFile, "utf-8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as ClaudeResultEvent);

  const last = [...lines].reverse().find((e) => e.type === "result");
  if (!last || !last.subtype) {
    return { status: "error", resultText: null, sessionId: null };
  }

  return {
    status: last.subtype,
    resultText: last.result ?? null,
    sessionId: last.session_id ?? null,
    costUsd: last.cost?.total_cost_usd,
  };
}

export const claudeCode: Runner = {
  name: "claude-code",
  buildConfig(provider: GatewayProvider, _role: OffloadRole) {
    return { baseUrl: provider.baseUrl, credentialEnv: provider.credentialEnv };
  },
  parseResult,
};
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npx vitest run scripts/runners/claude-code.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 10: Write the failing test for the registry**

```ts
// scripts/runners/registry.test.ts
import { describe, expect, it } from "vitest";
import { opencode } from "./opencode.ts";
import { claudeCode } from "./claude-code.ts";
import { resolveRunner } from "./registry.ts";
import type { Runner } from "./types.ts";

function assertConforms(runner: Runner) {
  expect(typeof runner.name).toBe("string");
  expect(runner.name.length).toBeGreaterThan(0);
  expect(typeof runner.buildConfig).toBe("function");
  expect(typeof runner.parseResult).toBe("function");
}

describe("opencode", () => {
  it("conforms to Runner", () => assertConforms(opencode));
});

describe("claudeCode", () => {
  it("conforms to Runner", () => assertConforms(claudeCode));
});

describe("resolveRunner", () => {
  it("resolves a known runner by name", () => {
    expect(resolveRunner("opencode")).toBe(opencode);
    expect(resolveRunner("claude-code")).toBe(claudeCode);
  });

  it("returns undefined for an unknown runner", () => {
    expect(resolveRunner("codex")).toBeUndefined();
    expect(resolveRunner("")).toBeUndefined();
  });
});
```

- [ ] **Step 11: Run test to verify it fails**

Run: `npx vitest run scripts/runners/registry.test.ts`
Expected: FAIL — `Cannot find module './registry.ts'`

- [ ] **Step 12: Write `scripts/runners/registry.ts`**

```ts
import type { Runner, RunnerName } from "./types.ts";
import { opencode } from "./opencode.ts";
import { claudeCode } from "./claude-code.ts";

const runners: Record<RunnerName, Runner> = { opencode, "claude-code": claudeCode };

export function resolveRunner(name: string): Runner | undefined {
  return runners[name as RunnerName];
}
```

- [ ] **Step 13: Run all three new test files and the existing provider suite together**

Run: `npx vitest run scripts/runners scripts/providers`
Expected: PASS, all tests green, no regressions in `scripts/providers`.

- [ ] **Step 14: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 15: Commit**

```bash
git add scripts/runners/types.ts scripts/runners/opencode.ts scripts/runners/claude-code.ts scripts/runners/registry.ts scripts/runners/opencode.test.ts scripts/runners/claude-code.test.ts scripts/runners/registry.test.ts
git commit -m "feat(pluggable-runners): add Runner Strategy core — opencode, claude-code, registry"
```

---

### Task 2: `scripts/runners/parse-result.ts` CLI

**Files:**
- Create: `scripts/runners/parse-result.ts`
- Test: `scripts/runners/parse-result.test.ts`

**Interfaces:**
- Consumes: `resolveRunner(name)` and `ParsedResult` (Task 1).
- Produces: `node scripts/runners/parse-result.ts <runner> <events-file>` — prints one JSON `ParsedResult` object to stdout, exit 0 on a resolvable runner and readable events file, non-zero otherwise. Consumed by Task 5's `offload-implementer/SKILL.md` edit (replaces Step 5's hand-rolled OpenCode-only parsing prose).

- [ ] **Step 1: Write the failing test**

```ts
// scripts/runners/parse-result.test.ts
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SCRIPT_PATH = fileURLToPath(new URL("./parse-result.ts", import.meta.url));

function writeEvents(lines: Record<string, unknown>[]): string {
  const dir = mkdtempSync(join(tmpdir(), "parse-result-events-"));
  const path = join(dir, "events.jsonl");
  writeFileSync(path, lines.map((l) => JSON.stringify(l)).join("\n") + "\n", "utf-8");
  return path;
}

describe("parse-result CLI", () => {
  it("prints a ParsedResult for a known opencode runner and exits 0", () => {
    const eventsFile = writeEvents([
      { type: "text", sessionID: "ses_1", part: { type: "text", text: "hello" } },
    ]);
    const stdout = execFileSync("node", [SCRIPT_PATH, "opencode", eventsFile], {
      encoding: "utf-8",
    });
    expect(JSON.parse(stdout)).toEqual({
      status: "success",
      resultText: "hello",
      sessionId: "ses_1",
    });
  });

  it("prints a ParsedResult for a known claude-code runner and exits 0", () => {
    const eventsFile = writeEvents([
      { type: "result", subtype: "success", result: "hi", session_id: "sess_1", cost: { total_cost_usd: 0.01 } },
    ]);
    const stdout = execFileSync("node", [SCRIPT_PATH, "claude-code", eventsFile], {
      encoding: "utf-8",
    });
    expect(JSON.parse(stdout)).toEqual({
      status: "success",
      resultText: "hi",
      sessionId: "sess_1",
      costUsd: 0.01,
    });
  });

  it("exits non-zero for an unknown runner", () => {
    const eventsFile = writeEvents([{ type: "text", sessionID: "x", part: { type: "text", text: "x" } }]);
    expect(() =>
      execFileSync("node", [SCRIPT_PATH, "codex", eventsFile], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    ).toThrow();
  });

  it("exits non-zero when the events file is missing", () => {
    expect(() =>
      execFileSync("node", [SCRIPT_PATH, "opencode", "/does/not/exist.jsonl"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    ).toThrow();
  });

  it("exits non-zero when a positional argument is missing", () => {
    expect(() =>
      execFileSync("node", [SCRIPT_PATH, "opencode"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/runners/parse-result.test.ts`
Expected: FAIL — `Cannot find module './parse-result.ts'`

- [ ] **Step 3: Write `scripts/runners/parse-result.ts`**

```ts
import { pathToFileURL } from "node:url";
import { resolveRunner } from "./registry.ts";

function main(): void {
  const [runnerName, eventsFile] = process.argv.slice(2);
  if (!runnerName || !eventsFile) {
    console.error("parse-result: missing required positional arguments <runner> <events-file>");
    process.exitCode = 1;
    return;
  }

  const runner = resolveRunner(runnerName);
  if (!runner) {
    console.error(`parse-result: no such registered runner ${JSON.stringify(runnerName)}`);
    process.exitCode = 1;
    return;
  }

  try {
    const result = runner.parseResult(eventsFile);
    console.log(JSON.stringify(result));
    process.exitCode = 0;
  } catch (err) {
    console.error(`parse-result: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/runners/parse-result.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add scripts/runners/parse-result.ts scripts/runners/parse-result.test.ts
git commit -m "feat(pluggable-runners): add parse-result.ts CLI, normalizing either runner's events to ParsedResult"
```

---

### Task 3: `GatewayProvider.supportsRunner` + `print-config.ts --runner`

**Files:**
- Modify: `scripts/providers/types.ts`
- Modify: `scripts/providers/chutes.ts`
- Modify: `scripts/providers/tokenreply.ts`
- Modify: `scripts/providers/print-config.ts`
- Modify: `scripts/providers/registry.test.ts`
- Modify: `scripts/providers/print-config.test.ts`

**Interfaces:**
- Consumes: `Runner`/`RunnerName`/`resolveRunner` (Task 1).
- Produces: `GatewayProvider.supportsRunner: RunnerName[]`; `print-config.ts --runner <name>` flag, delegating config-building to `resolveRunner(name).buildConfig(provider, role)` — consumed by Task 5's `offload-implementer/SKILL.md` edit.

- [ ] **Step 1: Update `scripts/providers/types.ts`**

```ts
import type { RunnerName } from "../runners/types.ts";

export type OffloadRole = "mechanical" | "task";

export interface GatewayProvider {
  name: string;
  displayName: string;
  baseUrl: string;
  credentialEnv: string;
  contextWindow: number;
  model(role: OffloadRole): string;
  supportsRunner: RunnerName[];
}
```

- [ ] **Step 2: Update `scripts/providers/chutes.ts`**

Find:

```ts
export const chutes: GatewayProvider = {
  name: "chutes",
  displayName: "Chutes",
  baseUrl: "https://llm.chutes.ai/v1",
  credentialEnv: "CHUTES_API_KEY",
  contextWindow: 1_048_576,
  model(role) {
    return role === "task" ? "moonshotai/Kimi-K3-TEE" : "google/gemma-4-31B-turbo-TEE";
  },
};
```

Replace with:

```ts
export const chutes: GatewayProvider = {
  name: "chutes",
  displayName: "Chutes",
  baseUrl: "https://llm.chutes.ai/v1",
  credentialEnv: "CHUTES_API_KEY",
  contextWindow: 1_048_576,
  model(role) {
    return role === "task" ? "moonshotai/Kimi-K3-TEE" : "google/gemma-4-31B-turbo-TEE";
  },
  supportsRunner: ["opencode"],
};
```

(Chutes' public docs only show an OpenAI-compatible endpoint, no confirmed Anthropic Messages API compatibility — per the design's scope decision, this is deliberately narrower than TokenReply, not an oversight.)

- [ ] **Step 3: Update `scripts/providers/tokenreply.ts`**

Find:

```ts
export const tokenreply: GatewayProvider = {
  name: "tokenreply",
  displayName: "TokenReply",
  baseUrl: "https://api.tokenreply.com/v1",
  credentialEnv: "TOKENREPLY_API_KEY",
  contextWindow: 200_000,
  model() {
    return "kimi-k2.7";
  },
};
```

Replace with:

```ts
export const tokenreply: GatewayProvider = {
  name: "tokenreply",
  displayName: "TokenReply",
  baseUrl: "https://api.tokenreply.com/v1",
  credentialEnv: "TOKENREPLY_API_KEY",
  contextWindow: 200_000,
  model() {
    return "kimi-k2.7";
  },
  supportsRunner: ["opencode", "claude-code"],
};
```

- [ ] **Step 4: Update `scripts/providers/registry.test.ts`'s `assertConforms` to cover `supportsRunner`**

Find:

```ts
function assertConforms(provider: GatewayProvider) {
  expect(typeof provider.name).toBe("string");
  expect(provider.name.length).toBeGreaterThan(0);
  expect(typeof provider.displayName).toBe("string");
  expect(provider.baseUrl.startsWith("https://")).toBe(true);
  expect(typeof provider.credentialEnv).toBe("string");
  expect(provider.contextWindow).toBeGreaterThan(0);
  expect(typeof provider.model("mechanical")).toBe("string");
  expect(provider.model("mechanical").length).toBeGreaterThan(0);
  expect(typeof provider.model("task")).toBe("string");
  expect(provider.model("task").length).toBeGreaterThan(0);
}
```

Replace with:

```ts
function assertConforms(provider: GatewayProvider) {
  expect(typeof provider.name).toBe("string");
  expect(provider.name.length).toBeGreaterThan(0);
  expect(typeof provider.displayName).toBe("string");
  expect(provider.baseUrl.startsWith("https://")).toBe(true);
  expect(typeof provider.credentialEnv).toBe("string");
  expect(provider.contextWindow).toBeGreaterThan(0);
  expect(typeof provider.model("mechanical")).toBe("string");
  expect(provider.model("mechanical").length).toBeGreaterThan(0);
  expect(typeof provider.model("task")).toBe("string");
  expect(provider.model("task").length).toBeGreaterThan(0);
  expect(Array.isArray(provider.supportsRunner)).toBe(true);
  expect(provider.supportsRunner.length).toBeGreaterThan(0);
}
```

Then add, inside the existing `describe("chutes", ...)` block, a new `it`:

```ts
  it("supports only opencode", () => {
    expect(chutes.supportsRunner).toEqual(["opencode"]);
  });
```

and inside `describe("tokenreply", ...)`:

```ts
  it("supports both runners", () => {
    expect(tokenreply.supportsRunner).toEqual(["opencode", "claude-code"]);
  });
```

- [ ] **Step 5: Run the provider registry test to verify it still passes with the new assertions**

Run: `npx vitest run scripts/providers/registry.test.ts`
Expected: PASS (existing tests plus the 2 new ones)

- [ ] **Step 6: Write the failing test for `print-config.ts --runner`**

Add to `scripts/providers/print-config.test.ts`, inside `describe("print-config CLI", ...)`:

```ts
  it("supports --runner claude-code, returning {baseUrl, credentialEnv} instead of an opencode block", () => {
    const stdout = execFileSync(
      "node",
      [SCRIPT_PATH, "tokenreply", "--role", "task", "--runner", "claude-code"],
      { encoding: "utf-8" },
    );
    expect(JSON.parse(stdout)).toEqual({
      baseUrl: "https://api.tokenreply.com/v1",
      credentialEnv: "TOKENREPLY_API_KEY",
    });
  });

  it("defaults --runner to opencode when omitted, output unchanged from before", () => {
    const stdout = execFileSync("node", [SCRIPT_PATH, "chutes", "--role", "task"], {
      encoding: "utf-8",
    });
    const parsed = JSON.parse(stdout);
    expect(Object.keys(parsed)).toEqual(["chutes"]);
  });
```

- [ ] **Step 7: Run test to verify the new assertions fail**

Run: `npx vitest run scripts/providers/print-config.test.ts`
Expected: FAIL — `--runner claude-code` still returns the opencode-shaped block, since `print-config.ts` doesn't read `--runner` yet.

- [ ] **Step 8: Update `scripts/providers/print-config.ts` to delegate via `resolveRunner`**

Find:

```ts
import { pathToFileURL } from "node:url";
import { parseArgs, requireArgs } from "../cli-args.ts";
import { resolveProvider } from "./registry.ts";
import type { GatewayProvider, OffloadRole } from "./types.ts";
```

Replace with:

```ts
import { pathToFileURL } from "node:url";
import { parseArgs, requireArgs } from "../cli-args.ts";
import { resolveProvider } from "./registry.ts";
import { resolveRunner } from "../runners/registry.ts";
import type { GatewayProvider, OffloadRole } from "./types.ts";
```

Find:

```ts
  const provider = resolveProvider(providerName);
  if (!provider) {
    console.error(`print-config: no such registered provider ${JSON.stringify(providerName)}`);
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify(buildOpencodeProviderBlock(provider, args.role)));
  process.exitCode = 0;
```

Replace with:

```ts
  const provider = resolveProvider(providerName);
  if (!provider) {
    console.error(`print-config: no such registered provider ${JSON.stringify(providerName)}`);
    process.exitCode = 1;
    return;
  }

  const runnerName = args.runner ?? "opencode";
  const runner = resolveRunner(runnerName);
  if (!runner) {
    console.error(`print-config: no such registered runner ${JSON.stringify(runnerName)}`);
    process.exitCode = 1;
    return;
  }

  if (!provider.supportsRunner.includes(runner.name)) {
    console.error(
      `print-config: provider ${JSON.stringify(provider.name)} does not support runner ${JSON.stringify(runner.name)}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify(runner.buildConfig(provider, args.role)));
  process.exitCode = 0;
```

(`buildOpencodeProviderBlock` stays exported from this file unchanged — Task 1's `opencode.ts` imports and delegates to it — but `main()` no longer calls it directly.)

- [ ] **Step 9: Run tests to verify they pass**

Run: `npx vitest run scripts/providers/print-config.test.ts scripts/providers/registry.test.ts`
Expected: PASS, including the two new tests from Step 6 (opencode output byte-identical to before, per the design's requirement).

- [ ] **Step 10: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add scripts/providers/types.ts scripts/providers/chutes.ts scripts/providers/tokenreply.ts scripts/providers/print-config.ts scripts/providers/registry.test.ts scripts/providers/print-config.test.ts
git commit -m "feat(pluggable-runners): add GatewayProvider.supportsRunner and print-config.ts --runner"
```

---

### Task 4: `ensure-claude-code` in `skills/depot/SKILL.md`

**Files:**
- Modify: `skills/depot/SKILL.md`

**Interfaces:**
- Consumes: nothing (prose-only skill file, no code dependency).
- Produces: the `ensure-claude-code` operation, invoked by Task 5's `offload-implementer/SKILL.md` edit in place of `ensure-opencode-server` on the `claude-code` runner branch.

- [ ] **Step 1: Add a new resource section after "Resource: OpenCode Server"**

In `skills/depot/SKILL.md`, find the end of the OpenCode Server resource section — specifically the last line before `## Error Handling`:

```
then delete `~/.digismith/opencode-server.json`. If the file's PID is
already dead (process gone), still delete the tracking file — nothing
to kill, but stale state should not survive.

## Error Handling
```

Replace with:

```
then delete `~/.digismith/opencode-server.json`. If the file's PID is
already dead (process gone), still delete the tracking file — nothing
to kill, but stale state should not survive.

## Resource: Claude Code Readiness

A **stateless readiness check** for `digismith:offload-implementer`'s
`claude-code` runner branch — unlike the OpenCode server, `claude -p`
spawns fresh per dispatch and needs no warm server, so there is no
process, pid, or port to track here, and no `~/.digismith/*.json`
tracking file at all.

### Which Operation

- **Invoked by `digismith:offload-implementer`**, every time a task is
  dispatched via the `claude-code` runner (not just the first — there's
  no persistent state to reuse across dispatches, so this check runs
  every time).

### Operation: `ensure-claude-code` — stateless readiness check

```bash
claude --version >/dev/null 2>&1 && claude -p --help 2>&1 | grep -q -- "--bare"
```

**Exit 0** → `claude` is on PATH and supports `--bare`; return ready.
**Non-zero exit** → not ready (see Error Handling).

## Error Handling
```

- [ ] **Step 2: Add a new row to the Error Handling table**

Find:

```
| `opencode` not on PATH | Stop, tell the caller plainly, point at `pnpm add -g --allow-build=opencode-ai opencode-ai` (plain `pnpm add -g opencode-ai` alone installs a broken binary — pnpm skips postinstall scripts by default). Don't attempt to install it silently. |
```

Replace with:

```
| `opencode` not on PATH | Stop, tell the caller plainly, point at `pnpm add -g --allow-build=opencode-ai opencode-ai` (plain `pnpm add -g opencode-ai` alone installs a broken binary — pnpm skips postinstall scripts by default). Don't attempt to install it silently. |
| `claude` not on PATH, or doesn't support `--bare` | Stop, tell the caller plainly, point at `npm install -g @anthropic-ai/claude-code`. Never auto-install. |
```

- [ ] **Step 3: Add a new row to the Quick Reference table**

Find:

```
| OpenCode server | `stop-opencode-server` | User asks directly, any time | `taskkill` the tracked pid, delete the tracking file (no-op if absent) |
```

Replace with:

```
| OpenCode server | `stop-opencode-server` | User asks directly, any time | `taskkill` the tracked pid, delete the tracking file (no-op if absent) |
| Claude Code readiness | `ensure-claude-code` | Called by `digismith:offload-implementer`, every `claude-code`-runner dispatch | Stateless PATH + `--bare`-support check, no state written |
```

- [ ] **Step 4: Update the skill's frontmatter description to mention Claude Code**

Find:

```
description: Provisions and manages two machine-wide runtime resources that any consumer repo or plan can rely on without knowing where they live — a sparse clone of DigiSmith's shared packages/ code at ~/.digismith/repo (invoked automatically by digismith:bootstrap/digismith:adopt at the start of ticket work; invoke directly any time to pull the latest changes — e.g. "update my DigiSmith clone"), and a shared OpenCode server backing digismith:offload-implementer's Chutes-hosted dispatches (invoked by offload-implementer itself the first time a task is offloaded; invoke directly any time to stop it — e.g. "stop the OpenCode server").
```

Replace with:

```
description: Provisions and manages machine-wide runtime resources that any consumer repo or plan can rely on without knowing where they live — a sparse clone of DigiSmith's shared packages/ code at ~/.digismith/repo (invoked automatically by digismith:bootstrap/digismith:adopt at the start of ticket work; invoke directly any time to pull the latest changes — e.g. "update my DigiSmith clone"), a shared OpenCode server backing digismith:offload-implementer's opencode-runner dispatches (invoked by offload-implementer itself the first time a task is offloaded; invoke directly any time to stop it — e.g. "stop the OpenCode server"), and a stateless Claude Code readiness check backing offload-implementer's claude-code-runner dispatches (invoked by offload-implementer on every such dispatch).
```

- [ ] **Step 5: Verify manually**

Read back `skills/depot/SKILL.md` in full and confirm: the new resource section reads coherently between "OpenCode Server" and "Error Handling"; the Error Handling and Quick Reference tables both render as valid Markdown tables (correct column count, no stray `|`); no other resource's text was altered.

- [ ] **Step 6: Commit**

```bash
git add skills/depot/SKILL.md
git commit -m "feat(pluggable-runners): add stateless ensure-claude-code readiness check to depot"
```

---

### Task 5: Add `task_offload_runner` to every profile

**Files:**
- Modify: `profiles/digismith.yml`
- Modify: `profiles/emma.yml`
- Modify: `profiles/jazurite.yml`
- Modify: `profiles/personal.yml`

**Interfaces:**
- Consumes: nothing (data-only change).
- Produces: the `task_offload_runner` key, read as prose by the updated `offload-implementer/SKILL.md` in Task 6.

**Why every profile, defaulting to `opencode`:** matches K.3's Task 5 precedent for `task_offload_provider` — every profile gets the field explicitly, defaulting to today's only behavior (`opencode`), so every existing profile keeps behaving identically until someone opts in to `claude-code`.

- [ ] **Step 1: Update `profiles/digismith.yml`**

```yaml
name: digismith
standards: [global]
ticket: false
ephemeral: false
reporting: true
publish_artifact: true
logging: true
model_offload_provider: chutes
task_offload_provider: chutes
task_offload_runner: opencode
```

- [ ] **Step 2: Update `profiles/emma.yml`**

```yaml
# `standards` is hand-maintained: keep it in sync with standards/'s
# top-level folder names — a new folder there is not picked up here
# automatically.
name: emma
standards: [global, shopify, team]
ticket: true
ephemeral: true
reporting: true
publish_artifact: true
logging: true
task_offload_provider: chutes
task_offload_runner: opencode
```

- [ ] **Step 3: Update `profiles/jazurite.yml`**

```yaml
name: jazurite
standards: [global]
ticket: false
ephemeral: false
reporting: true
publish_artifact: true
logging: true
task_offload_provider: chutes
task_offload_runner: opencode
```

- [ ] **Step 4: Update `profiles/personal.yml`**

```yaml
name: personal
standards: [global]
ticket: false
ephemeral: false
reporting: true
publish_artifact: true
logging: false
task_offload_provider: chutes
task_offload_runner: opencode
```

- [ ] **Step 5: Verify**

Run: `grep -L "task_offload_runner" profiles/*.yml`
Expected: no output (every profile now has the field).

- [ ] **Step 6: Commit**

```bash
git add profiles/digismith.yml profiles/emma.yml profiles/jazurite.yml profiles/personal.yml
git commit -m "feat(pluggable-runners): add task_offload_runner to every profile, defaulting to opencode"
```

---

### Task 6: Make `skills/offload-implementer/SKILL.md` runner-conditional

**Files:**
- Modify: `skills/offload-implementer/SKILL.md`

**Interfaces:**
- Consumes: `node scripts/providers/print-config.ts <provider> --role task [--runner <name>]` (Task 3); `node scripts/runners/parse-result.ts <runner> <events-file>` (Task 2); `digismith:depot`'s `ensure-claude-code` (Task 4); `task_offload_runner` field (Task 5).
- Produces: nothing consumed by other tasks — this is the leaf skill file.

- [ ] **Step 1: Update the frontmatter description**

Find:

```
description: Use when explicitly asked to offload a specific subagent-driven-development task to a third-party model instead of a normal Claude implementer — runs the task via a persistent OpenCode server backed by a configured gateway provider (Chutes or TokenReply).
```

Replace with:

```
description: Use when explicitly asked to offload a specific subagent-driven-development task to a third-party model instead of a normal Claude implementer — runs the task via a pluggable runner (OpenCode or Claude Code) backed by a configured gateway provider (Chutes or TokenReply).
```

- [ ] **Step 2: Update the Overview**

Find:

```
DigiSmith's map item **K.2**. Runs one `subagent-driven-development`
task on a third-party-hosted model via [OpenCode](https://opencode.ai) instead
of a normal Claude implementer subagent, when explicitly asked to offload
that task. The `Agent` tool has no non-Anthropic model routing, so this
isn't a subagent dispatch — the controller itself drives the `opencode`
CLI directly. Explicit per-task only: nothing here runs automatically.
```

Replace with:

```
DigiSmith's map item **K.2**, extended by **K.6** to make the runner
pluggable. Runs one `subagent-driven-development` task on a
third-party-hosted model via a resolved **runner** —
[OpenCode](https://opencode.ai) or [Claude Code](https://claude.com/product/claude-code)
itself, chosen per-profile — instead of a normal Claude implementer
subagent, when explicitly asked to offload that task. The `Agent` tool
has no non-Anthropic model routing, so this isn't a subagent dispatch —
the controller itself drives the resolved runner's CLI directly.
Explicit per-task only: nothing here runs automatically.
```

- [ ] **Step 3: Update Prerequisites**

Find:

```
`opencode` on PATH (`pnpm add -g --allow-build=opencode-ai opencode-ai`
if missing — plain `pnpm add -g opencode-ai` alone installs a broken
binary, since pnpm skips postinstall scripts by default). Whichever
credential env var the resolved provider needs (`CHUTES_API_KEY` for
Chutes, `TOKENREPLY_API_KEY` for TokenReply — see `scripts/providers/`)
must already be set in the environment `opencode` runs in. Depot's shared
server currently exports only `CHUTES_API_KEY` at launch, so dispatching
with `task_offload_provider: tokenreply` requires the server to have been
started with `TOKENREPLY_API_KEY` set in its environment too — restart it
via `digismith:depot` if it's already running without it.

**`--auto` grants real, unattended authority.** Every dispatch below runs
OpenCode with `--auto` — its own docs describe this as "auto-approve
permissions that are not explicitly denied (dangerous!)", and the
shipped `opencode.json` here declares no `permission` block limiting it.
In practice that means unattended file and shell access within the
target worktree for the life of the dispatch. Only use this skill
against a disposable/isolated worktree — never a checkout holding
anything sensitive.
```

Replace with:

```
Resolve `task_offload_runner` (default `opencode`) from the active
profile before checking prerequisites — they differ by runner:

**`opencode` runner:** `opencode` on PATH (`pnpm add -g
--allow-build=opencode-ai opencode-ai` if missing — plain `pnpm add -g
opencode-ai` alone installs a broken binary, since pnpm skips
postinstall scripts by default). Whichever credential env var the
resolved provider needs (`CHUTES_API_KEY` for Chutes,
`TOKENREPLY_API_KEY` for TokenReply — see `scripts/providers/`) must
already be set in the environment `opencode` runs in. Depot's shared
server currently exports only `CHUTES_API_KEY` at launch, so dispatching
with `task_offload_provider: tokenreply` requires the server to have
been started with `TOKENREPLY_API_KEY` set in its environment too —
restart it via `digismith:depot` if it's already running without it.

**`claude-code` runner:** `claude` on PATH, supporting `--bare` (`npm
install -g @anthropic-ai/claude-code` if missing — never auto-install,
see Error Handling). Whichever credential env var the resolved provider
needs must be set in the environment `claude` runs in — Claude Code
reads it directly at spawn time via `ANTHROPIC_BASE_URL`/
`ANTHROPIC_AUTH_TOKEN`, no shared server to pre-configure. Only
providers whose `supportsRunner` includes `"claude-code"` may be
resolved this way (today, TokenReply only — see `scripts/providers/`).

**`--auto` (opencode) / `--permission-mode auto` (claude-code) grant
real, unattended authority.** Every dispatch below runs its resolved
runner with unattended permission — OpenCode's own docs describe
`--auto` as "auto-approve permissions that are not explicitly denied
(dangerous!)", and Claude Code's `--permission-mode auto` is the
equivalent grant. In practice that means unattended file and shell
access within the target worktree for the life of the dispatch. Only
use this skill against a disposable/isolated worktree — never a
checkout holding anything sensitive.
```

- [ ] **Step 4: Replace Step 1 with the runner-conditional config step**

Find the entire Step 1 section, from its heading through the paragraph ending in "shouldn't be committed." (the full section as it exists today, spanning the worktree-locating logic, the `print-config.ts` invocation, the `opencode.json` write, and the `info/exclude` handling) — quoted here as the exact literal text to find:

```
### Step 1: Ensure `opencode.json` Exists in the Task's Worktree

Check for `opencode.json` in the worktree root. **Present** → continue.
**Missing** → write it. First resolve which provider this dispatch uses: read
`task_offload_provider` from the active profile (`profiles/<name>.yml`,
same file `digismith:inject-standards` already reads `standards:` from),
defaulting to `chutes` if the field is absent (matches every existing
profile — see K.3's design doc).

`print-config.ts` lives in DigiSmith's own repo, not the task worktree
this dispatch targets — Step 4 dispatches into arbitrary consumer-repo
worktrees (`--dir "<task-worktree>"`), so invoking the script by a bare
relative path only works when the controller's cwd already happens to be
DigiSmith's repo, and fails with `MODULE_NOT_FOUND` everywhere else.
Locate DigiSmith's own repo the same way `digismith:inject-standards`
does under "Locating the Standards Library":
1. Is the current working directory itself the DigiSmith repo (has
   `.claude-plugin/plugin.json` with `"name": "digismith"`)? Use it
   directly.
2. Otherwise, ask the user for DigiSmith's repo path this session and
   remember it for the rest of the conversation.

Then run, using that resolved path (absolute, or the cwd-relative path if
step 1 above applied) — never a bare relative path assumed to work from
any cwd:

```bash
node <digismith-repo>/scripts/providers/print-config.ts <resolved-provider> --role task
```

**Exit 0** → its stdout is a single-key JSON object keyed by the provider
name (e.g. `{"chutes": {...}}`). Write `opencode.json` as:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": <that object, verbatim>
}
```

**Non-zero exit** (unrecognized provider name) → stop here and report
`BLOCKED` — the same disposition as a missing `opencode` binary (see
Error Handling). Never write a config that can't authenticate.

Record the resolved provider name and the model ID `print-config.ts` chose
(the single key inside `.models` in its output) — Step 4 needs both to
build its `opencode run --model` argument.

Then check whether `opencode.json` is already ignored one way or
another (`git check-ignore -q opencode.json`, exit 0 = already ignored).
If not, ignore it via `info/exclude` — a local-only, untracked git
mechanism — **never** the worktree's own tracked `.gitignore`. Resolve
its real path first rather than assuming `<worktree>/.git/info/exclude`:
in a linked worktree (the normal case for this skill), `.git` is a
*file* containing a `gitdir:` pointer, not a directory, so that path
doesn't exist and writing to it fails outright. Use:

```bash
EXCLUDE_FILE=$(git rev-parse --git-path info/exclude)
```

This resolves correctly whether the current directory is a plain repo
or a linked worktree. Note it's the **repo-wide common git dir**, shared
across every worktree of this repo — not per-worktree isolated, despite
being reached from inside one.

This is local machine config, the same class of file as
`.digismith/profile`/`.digismith/telemetry-marker` (see `MEMORY.md`'s
"`.digismith/profile` is config, not generated docs output" convention),
guaranteed to stay out of any commit because `info/exclude` is never
part of the repo's tracked tree at all — unlike `.gitignore`, there's no
file here that could ride along in a diff. Read `$EXCLUDE_FILE`'s
current content first (or note its absence), ensure it ends in a
newline if non-empty, and append a new line `opencode.json` — an append
operation only, never a whole-file rewrite. `opencode.json` itself
references your API key only via
`{env:<credential-env-var-for-the-resolved-provider>}` (e.g.
`{env:CHUTES_API_KEY}` or `{env:TOKENREPLY_API_KEY}`, depending on which
provider Step 1 resolved), never a literal value, but it's still local
machine config that shouldn't be committed.
```

Replace it with:

```
### Step 1: Resolve Runner + Provider Config

Resolve `task_offload_runner` (default `opencode`) and
`task_offload_provider` (default `chutes`) from the active profile
(`profiles/<name>.yml`, same file `digismith:inject-standards` already
reads `standards:` from — see K.3's design doc for the provider default).

`print-config.ts` and `parse-result.ts` live in DigiSmith's own repo, not
the task worktree this dispatch targets — Step 4 dispatches into
arbitrary consumer-repo worktrees (`--dir`/`cwd` set to the task
worktree), so invoking either script by a bare relative path only works
when the controller's cwd already happens to be DigiSmith's repo, and
fails with `MODULE_NOT_FOUND` everywhere else. Locate DigiSmith's own
repo the same way `digismith:inject-standards` does under "Locating the
Standards Library":
1. Is the current working directory itself the DigiSmith repo (has
   `.claude-plugin/plugin.json` with `"name": "digismith"`)? Use it
   directly.
2. Otherwise, ask the user for DigiSmith's repo path this session and
   remember it for the rest of the conversation.

Then run, using that resolved path (absolute, or the cwd-relative path if
step 1 above applied) — never a bare relative path assumed to work from
any cwd:

```bash
node <digismith-repo>/scripts/providers/print-config.ts <resolved-provider> --role task --runner <resolved-runner>
```

**Non-zero exit** → either an unrecognized provider/runner name, or the
resolved provider's `supportsRunner` doesn't include the resolved
runner. Stop here and report `BLOCKED` — the same disposition as a
missing runner binary (see Error Handling). Never write a config that
can't authenticate.

**`opencode` runner, exit 0:** stdout is a single-key JSON object keyed
by the provider name (e.g. `{"chutes": {...}}`). Write `opencode.json`
in the worktree root as:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": <that object, verbatim>
}
```

(Skip the write if `opencode.json` is already present in the worktree
root.) Then check whether `opencode.json` is already ignored one way or
another (`git check-ignore -q opencode.json`, exit 0 = already ignored).
If not, ignore it via `info/exclude` — a local-only, untracked git
mechanism — **never** the worktree's own tracked `.gitignore`. Resolve
its real path first rather than assuming `<worktree>/.git/info/exclude`:
in a linked worktree (the normal case for this skill), `.git` is a
*file* containing a `gitdir:` pointer, not a directory, so that path
doesn't exist and writing to it fails outright. Use:

```bash
EXCLUDE_FILE=$(git rev-parse --git-path info/exclude)
```

This resolves correctly whether the current directory is a plain repo
or a linked worktree. Note it's the **repo-wide common git dir**, shared
across every worktree of this repo — not per-worktree isolated, despite
being reached from inside one.

This is local machine config, the same class of file as
`.digismith/profile`/`.digismith/telemetry-marker` (see `MEMORY.md`'s
"`.digismith/profile` is config, not generated docs output" convention),
guaranteed to stay out of any commit because `info/exclude` is never
part of the repo's tracked tree at all — unlike `.gitignore`, there's no
file here that could ride along in a diff. Read `$EXCLUDE_FILE`'s
current content first (or note its absence), ensure it ends in a
newline if non-empty, and append a new line `opencode.json` — an append
operation only, never a whole-file rewrite. `opencode.json` itself
references your API key only via
`{env:<credential-env-var-for-the-resolved-provider>}`, never a literal
value, but it's still local machine config that shouldn't be committed.

Record the resolved provider name and the model ID `print-config.ts`
chose (the single key inside `.models` in its output) — Step 4 needs
both to build its `opencode run --model` argument.

**`claude-code` runner, exit 0:** stdout is `{"baseUrl": "...",
"credentialEnv": "..."}`. No file is written — Step 4 exports these
directly as `ANTHROPIC_BASE_URL`/`ANTHROPIC_AUTH_TOKEN` environment
variables at dispatch time.
```

- [ ] **Step 5: Replace Step 2 with the runner-conditional readiness step**

Find:

```
### Step 2: Ensure the OpenCode Server Is Running

Invoke `digismith:depot`'s `ensure-opencode-server` operation and use
the port it returns for every dispatch below. This server is shared
machine-wide across every concurrent `subagent-driven-development` plan
on this machine, not scoped to this one — Depot owns starting it,
tracking its PID and port, and all the Windows-specific WINPID
resolution that requires, entirely on its own. This skill no longer
tracks a server itself.

If Depot's operation doesn't return a usable port (any of the failure
cases in its own Error Handling table — `opencode` not on PATH, server
fails to start, WINPID unresolvable), stop here and report `BLOCKED`
rather than continuing to Step 3/4 with an undefined port.
```

Replace with:

```
### Step 2: Ensure the Resolved Runner Is Ready

**`opencode` runner:** invoke `digismith:depot`'s
`ensure-opencode-server` operation and use the port it returns for every
dispatch below. This server is shared machine-wide across every
concurrent `subagent-driven-development` plan on this machine, not
scoped to this one — Depot owns starting it, tracking its PID and port,
and all the Windows-specific WINPID resolution that requires, entirely
on its own. This skill no longer tracks a server itself.

If Depot's operation doesn't return a usable port (any of the failure
cases in its own Error Handling table — `opencode` not on PATH, server
fails to start, WINPID unresolvable), stop here and report `BLOCKED`
rather than continuing to Step 3/4 with an undefined port.

**`claude-code` runner:** invoke `digismith:depot`'s `ensure-claude-code`
operation. There is no port, no process, no state to track — this is a
stateless PATH + `--bare`-support check, invoked fresh on every
`claude-code`-runner dispatch, not just the first.

If Depot's operation reports not-ready, stop here and report `BLOCKED`
rather than continuing to Step 3/4.
```

- [ ] **Step 6: Replace Step 4's dispatch commands**

Find:

```
### Step 4: Dispatch

Capture the Step 3 prompt into a shell variable first, via a
single-quoted heredoc — a real task brief or findings list routinely
contains backticks, `$` variable references, and embedded double quotes,
any of which would corrupt or trigger unwanted expansion if interpolated
directly into a double-quoted positional argument. A single-quoted
heredoc (`<<'PROMPT_EOF'`) is immune to expansion during capture; the
resulting `"$PROMPT"` reference is then safe to pass double-quoted,
since a quoted variable reference doesn't re-parse its content.

**Real dispatches routinely take several minutes** — confirmed live:
some took over 5 minutes today. Issue the `opencode run` call below with
an explicit `Bash` tool `timeout` of at least 300000ms (5+ minutes), not
whatever short default the harness would otherwise use. A default
timeout cutting the call off partway through a perfectly healthy run
looks indistinguishable from a real failure otherwise — see Error
Handling for how to tell the two apart.

**Fresh task:**

```bash
PROMPT=$(cat <<'PROMPT_EOF'
<prompt built in Step 3, verbatim>
PROMPT_EOF
)
opencode run --attach "http://127.0.0.1:<port>" \
  --model <resolved-provider>/<resolved-model-id> --auto --format json \
  --dir "<task-worktree>" "$PROMPT" > "<workspace>/task-<N>-opencode-events.jsonl"
```

**Fix round**, same heredoc-capture-then-dispatch pattern, plus
`--session "<captured sessionID>"` — and events redirect to a
`-round<R>` suffixed file, never the original attempt's file, so the fix
round's transcript doesn't overwrite it:

```bash
PROMPT=$(cat <<'PROMPT_EOF'
<prompt built in Step 3, verbatim>
PROMPT_EOF
)
opencode run --attach "http://127.0.0.1:<port>" \
  --model <resolved-provider>/<resolved-model-id> --auto --format json \
  --session "<captured sessionID>" \
  --dir "<task-worktree>" "$PROMPT" > "<workspace>/task-<N>-opencode-events-round<R>.jsonl"
```

No session flag on a fresh task — confirmed live that this always starts
a new, isolated session on an already-running server, never carrying
context from an earlier call.
```

Replace with:

```
### Step 4: Dispatch

Capture the Step 3 prompt into a shell variable first, via a
single-quoted heredoc — a real task brief or findings list routinely
contains backticks, `$` variable references, and embedded double quotes,
any of which would corrupt or trigger unwanted expansion if interpolated
directly into a double-quoted positional argument. A single-quoted
heredoc (`<<'PROMPT_EOF'`) is immune to expansion during capture; the
resulting `"$PROMPT"` reference is then safe to pass double-quoted,
since a quoted variable reference doesn't re-parse its content.

**Real dispatches routinely take several minutes** — confirmed live:
some took over 5 minutes today. Issue either dispatch below with an
explicit `Bash` tool `timeout` of at least 300000ms (5+ minutes), not
whatever short default the harness would otherwise use. A default
timeout cutting the call off partway through a perfectly healthy run
looks indistinguishable from a real failure otherwise — see Error
Handling for how to tell the two apart.

**`opencode` runner, fresh task:**

```bash
PROMPT=$(cat <<'PROMPT_EOF'
<prompt built in Step 3, verbatim>
PROMPT_EOF
)
opencode run --attach "http://127.0.0.1:<port>" \
  --model <resolved-provider>/<resolved-model-id> --auto --format json \
  --dir "<task-worktree>" "$PROMPT" > "<workspace>/task-<N>-opencode-events.jsonl"
```

**`opencode` runner, fix round**, same heredoc-capture-then-dispatch
pattern, plus `--session "<captured sessionID>"` — and events redirect
to a `-round<R>` suffixed file, never the original attempt's file, so
the fix round's transcript doesn't overwrite it:

```bash
PROMPT=$(cat <<'PROMPT_EOF'
<prompt built in Step 3, verbatim>
PROMPT_EOF
)
opencode run --attach "http://127.0.0.1:<port>" \
  --model <resolved-provider>/<resolved-model-id> --auto --format json \
  --session "<captured sessionID>" \
  --dir "<task-worktree>" "$PROMPT" > "<workspace>/task-<N>-opencode-events-round<R>.jsonl"
```

No session flag on a fresh `opencode` task — confirmed live that this
always starts a new, isolated session on an already-running server,
never carrying context from an earlier call.

**`claude-code` runner, fresh task:** export the two env vars Step 1
resolved, set the subprocess `cwd` to the task worktree at spawn time
(there is no `--dir` flag for `claude`):

```bash
PROMPT=$(cat <<'PROMPT_EOF'
<prompt built in Step 3, verbatim>
PROMPT_EOF
)
ANTHROPIC_BASE_URL="<resolved baseUrl>" \
ANTHROPIC_AUTH_TOKEN="<resolved credential env var's value>" \
claude -p "$PROMPT" --bare --model <resolved-model-id> \
  --permission-mode auto --output-format stream-json \
  --allowedTools "Read,Edit,Bash" > "<workspace>/task-<N>-claude-code-events.jsonl"
```

(run with the shell's working directory set to `<task-worktree>` first)

**`claude-code` runner, fix round**, same pattern plus `--resume
"<captured sessionID>"` instead of starting fresh, events to a
`-round<R>` suffixed file:

```bash
PROMPT=$(cat <<'PROMPT_EOF'
<prompt built in Step 3, verbatim>
PROMPT_EOF
)
ANTHROPIC_BASE_URL="<resolved baseUrl>" \
ANTHROPIC_AUTH_TOKEN="<resolved credential env var's value>" \
claude -p "$PROMPT" --bare --model <resolved-model-id> \
  --permission-mode auto --output-format stream-json \
  --resume "<captured sessionID>" \
  --allowedTools "Read,Edit,Bash" > "<workspace>/task-<N>-claude-code-events-round<R>.jsonl"
```

**Why `--bare` doesn't break standards injection:** Step 3 already
inlines the full `inject-standards` output as literal prompt text before
either runner launches — it's not a live skill invocation. `--bare`
only skips auto-discovery of skills/CLAUDE.md/hooks, not content already
pasted into the prompt.
```

- [ ] **Step 7: Replace Step 5 with the runner-conditional parsing step**

Find:

```
### Step 5: Extract the Session ID and the Status Contract

Read events from the file Step 4 actually wrote for this dispatch:
`<workspace>/task-<N>-opencode-events.jsonl` for a fresh task, or
`<workspace>/task-<N>-opencode-events-round<R>.jsonl` for a fix round.
Each line is one JSON event.

**Fresh task only:** every event carries a top-level `sessionID` field —
take it from any line (they're all the same session) and record it:

```bash
echo '{"task": <N>, "sessionID": "<extracted id>"}' >> "<workspace>/opencode-sessions.jsonl"
```

**Fix round:** skip this — the session ID doesn't change on a fix round
(it's the same `--session <id>` just passed on the command line), so
don't re-append a duplicate line to `opencode-sessions.jsonl`.

The status contract text is nested inside the **last** event whose
top-level `"type"` is `"text"` — that's the model's final reply,
matching what Step 3 asked it to send. The reply text itself is **not**
a top-level field on that event: it's one level down, inside a nested
`part` object. A real `type:text` event looks like:

```json
{"type":"text","timestamp":1234567890,"sessionID":"ses_...","part":{"id":"prt_...","messageID":"msg_...","sessionID":"ses_...","type":"text","text":"the actual reply content here"}}
```

Note `"type":"text"` appears at *both* levels — the event and its
nested `part` each carry their own `type` key. Match on the outer
(event-level) `type` to find the right line; the text you actually want
is at `.part.text`, not `.text`.
```

Replace with:

```
### Step 5: Extract the Session ID and the Status Contract

Read events from the file Step 4 actually wrote for this dispatch
(`<workspace>/task-<N>-<runner>-events.jsonl`, or the `-round<R>`
suffixed variant for a fix round), then run:

```bash
node <digismith-repo>/scripts/runners/parse-result.ts <resolved-runner> "<events-file>"
```

This prints a uniform `{status, resultText, sessionId, costUsd?}` JSON
object regardless of which runner produced the raw events — `status` is
one of `"success" | "error" | "interrupted"`, `resultText` is the
model's final reply text (or `null`), and `sessionId` is the id to
capture for fix rounds.

**Fresh task only:** record the returned `sessionId`:

```bash
echo '{"task": <N>, "sessionID": "<parsed sessionId>"}' >> "<workspace>/opencode-sessions.jsonl"
```

(File name and JSON key stay `opencode-sessions.jsonl`/`sessionID` for
backward compatibility with existing workspaces — the value is just an
opaque session id now, not opencode-specific, whichever runner produced
it.)

**Fix round:** skip this — the session ID doesn't change on a fix round
(it's the same id just passed back to the runner on the command line),
so don't re-append a duplicate line to `opencode-sessions.jsonl`.

The status contract text is `resultText` from `parse-result.ts`'s
output — this is the model's final reply, matching what Step 3 asked it
to send.
```

- [ ] **Step 8: Update the Error Handling section**

Find:

```
- **`opencode run` genuinely errors** (a real non-zero exit, an error
  event in the JSON stream, etc.) → report as `BLOCKED`, same
  disposition a stuck Claude implementer would get — surfaces to the
  user via the normal `subagent-driven-development` blocked-handling
  path. Never retried automatically.
```

Replace with:

```
- **The dispatched runner genuinely errors** (a real non-zero exit,
  `parse-result.ts` reporting `status: "error"` or `"interrupted"`,
  etc.) → report as `BLOCKED`, same disposition a stuck Claude
  implementer would get — surfaces to the user via the normal
  `subagent-driven-development` blocked-handling path. Never retried
  automatically.
```

Find:

```
- **A captured `sessionID` no longer resolves on the server** (e.g.
  someone ran `digismith:depot`'s `stop-opencode-server` — possibly for a
  different plan entirely, since the server is now shared machine-wide —
  or the machine itself restarted) → report this plainly rather than
  silently starting a fresh, context-less session under the same session
  ID assumption. Re-run Step 2 (`digismith:depot`'s
  `ensure-opencode-server`) to get a fresh server/port, then re-dispatch
  as a **fresh task**, not a fix round — the old session's context is
  genuinely gone, so resuming it would silently lose all prior context.
```

Replace with:

```
- **A captured session id no longer resolves** — `opencode` runner: e.g.
  someone ran `digismith:depot`'s `stop-opencode-server` (possibly for a
  different plan entirely, since the server is shared machine-wide) or
  the machine restarted; `claude-code` runner: the session was pruned,
  expired, or this is a different machine than the one that created it
  — → report this plainly rather than silently starting a fresh,
  context-less session under the same session-id assumption. Re-run Step
  2 to get a fresh server/port (`opencode`) or confirm readiness
  (`claude-code`), then re-dispatch as a **fresh task**, not a fix round
  — the old session's context is genuinely gone, so resuming it would
  silently lose all prior context.
```

No new Error Handling bullet is needed for the "provider doesn't support
the resolved runner" case — Step 1's replacement text above already
documents that disposition inline (stop, report `BLOCKED`, same as a
missing runner binary), matching how the original provider-mismatch case
was handled before this task.

- [ ] **Step 9: Update the Quick Reference table**

Find:

```
| Step | Action |
|---|---|
| 0 | Determine intent — a stop request is no longer this skill's concern (tell the user to invoke `digismith:depot`'s `stop-opencode-server` directly), otherwise this is a dispatch (fresh/fix round) |
| 1 | Ensure `opencode.json` exists in the task worktree, ignored via `.git/info/exclude` (never the tracked `.gitignore`) |
| 2 | Invoke `digismith:depot`'s `ensure-opencode-server` operation, use the port it returns — Depot owns starting the shared server, tracking its PID/port, and WINPID resolution entirely |
| 3 | Invoke `digismith:inject-standards` (Scenario 4), then build the prompt — brief + standards + report contract requiring implement → test → **commit** → report (fresh), or findings + standards + report contract appending to the same report file (fix round) |
| 4 | Capture the prompt into `$PROMPT` via a single-quoted heredoc, then dispatch via `opencode run --attach ... --format json "$PROMPT"` with an explicit ≥300000ms `Bash` timeout, `--session <id>` on fix rounds, events to a `-round<R>`-suffixed file on fix rounds |
| 5 | Extract the final status-contract text (nested at `.part.text`) from the JSON event stream; capture `sessionID` (event-level) only on a fresh task, never re-appended on a fix round |
| 6 | Independently verify a `DONE`/`DONE_WITH_CONCERNS` claim before trusting it, then hand back to the normal `subagent-driven-development` flow — review, fix loop, completion, unmodified |
```

Replace with:

```
| Step | Action |
|---|---|
| 0 | Determine intent — a stop request is no longer this skill's concern (tell the user to invoke `digismith:depot`'s `stop-opencode-server` directly, `opencode` runner only), otherwise this is a dispatch (fresh/fix round) |
| 1 | Resolve `task_offload_runner`/`task_offload_provider`, run `print-config.ts --runner <name>` — `opencode` runner writes `opencode.json` (ignored via `.git/info/exclude`, never the tracked `.gitignore`); `claude-code` runner gets `{baseUrl, credentialEnv}`, no file written |
| 2 | `opencode` runner: invoke `digismith:depot`'s `ensure-opencode-server`, use the returned port. `claude-code` runner: invoke `digismith:depot`'s `ensure-claude-code` (stateless, every dispatch) |
| 3 | Invoke `digismith:inject-standards` (Scenario 4), then build the prompt — brief + standards + report contract requiring implement → test → **commit** → report (fresh), or findings + standards + report contract appending to the same report file (fix round) |
| 4 | Capture the prompt into `$PROMPT` via a single-quoted heredoc, then dispatch — `opencode run --attach ... --format json "$PROMPT"` or `ANTHROPIC_BASE_URL=... ANTHROPIC_AUTH_TOKEN=... claude -p "$PROMPT" --bare --output-format stream-json` — with an explicit ≥300000ms `Bash` timeout, `--session`/`--resume <id>` on fix rounds, events to a `-round<R>`-suffixed file on fix rounds |
| 5 | Run `parse-result.ts <runner> <events-file>` for a uniform `{status, resultText, sessionId, costUsd?}`; capture `sessionId` into `opencode-sessions.jsonl` only on a fresh task, never re-appended on a fix round |
| 6 | Independently verify a `DONE`/`DONE_WITH_CONCERNS` claim before trusting it, then hand back to the normal `subagent-driven-development` flow — review, fix loop, completion, unmodified |
```

- [ ] **Step 10: Verify manually**

Run: `node scripts/providers/print-config.ts tokenreply --role task --runner claude-code` and confirm the printed JSON matches what Step 1's new instructions expect (`{baseUrl, credentialEnv}`).

Read back `skills/offload-implementer/SKILL.md` in full and confirm: no remaining literal occurrence of a bare, unconditional `opencode run` command outside the `opencode`-labeled branches; every one of Steps 1/2/4/5 now has a clearly-labeled `opencode` branch and `claude-code` branch; Steps 0, 3, 6 are unchanged from before this task.

- [ ] **Step 11: Commit**

```bash
git add skills/offload-implementer/SKILL.md
git commit -m "feat(pluggable-runners): make offload-implementer's runner pluggable (opencode or claude-code)"
```

---

## Self-Review Notes

- **Spec coverage:** every design.html section maps to a task — Architecture/Components (`Runner` interface, `opencode.ts`/`claude-code.ts`/`registry.ts`, `parse-result.ts`, `supportsRunner`) → Tasks 1-3; Depot's `ensure-claude-code` → Task 4; profile field → Task 5; offload-implementer data flow (fresh dispatch + fix round, both runners) and the `--bare`/standards-injection callout → Task 6; Error Handling table's new rows (`supportsRunner` rejection, `claude` not on PATH, `claude -p` errors, stale `--resume` id) → Task 6, Step 8 plus Step 1's "Non-zero exit" text; Testing section's explicit fixtures/CLI-contract requirements → each task's own test file; Out of Scope (K.4/K.5/K.7, Depot cost analytics, auto-fallback, actual benchmark run) → untouched, no task references them.
- **Open questions carried forward, not silently resolved:** the design's own Testing section flags that `claude -p --output-format stream-json`'s real schema hasn't been confirmed live — Task 6, Step 10's manual verification checks `print-config.ts`'s output but does **not** attempt a live `claude -p` invocation (no TokenReply Claude Code credential is confirmed provisioned on this machine per project memory). This plan's tests build `stream-json` fixtures from the documented schema, matching the design's own honest-risk disclosure — a live end-to-end `claude -p` dispatch check should happen as a follow-up before the `claude-code` runner is used for a real task, not assumed complete by this plan's commits.
- **Backward-compatible naming, not renamed:** `opencode-sessions.jsonl` keeps its filename and `sessionID` JSON key across both runners (Task 6, Step 7) — the design doesn't ask for a rename, and changing it would break any in-flight `subagent-driven-development` workspace already referencing the old name.
