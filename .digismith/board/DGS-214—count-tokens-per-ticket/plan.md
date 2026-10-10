# DGS-214 Token Counter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Count the tokens of every ticket from Claude Code transcripts (counts only), per step and per task, with `dg tokens <ticket>` and a `tokens.json` snapshot.

**Architecture:** A library under `packages/cli/src/tokens/` holds one reader per source (phase 1: Claude Code) behind a common `UsageRecord`, a registry behind an `append`/`read` interface, a grouping function that builds the snapshot, and two front ends: the yargs command `dg tokens` and a plain-Node `entry.ts` that skills call from the depot clone (the `jira-client` pattern). Shipped in two slices: slice 1 = reader, registry interface, fallback tagging, `dg tokens`; slice 2 = the registry writes in the skills and the SDD ledger rows.

**Tech Stack:** TypeScript (Node 24, `--experimental-strip-types` for the plain entry), vitest, yargs (CLI only), pnpm. Node built-ins only inside the library files, so `entry.ts` runs without a build.

**Design:** `design.html` in this folder (approved checkpoint 1, 2026-10-10).

## Global Constraints

- Counts only. No prices, no dollars, no price table read, at any level.
- Transcripts are read for `usage`, `model`, ids and timestamps only. No message text is copied out, stored or printed.
- pnpm only, never npm. No token, SSH key or `.env` read.
- Library files import only `node:` built-ins and sibling files with `.ts` extensions (so `node --experimental-strip-types` runs them and `tsc` rewrites them).
- The registry is used only through `Registry.append` and `Registry.read`.
- `tokens.json` carries `schema_version: 1` and is self-describing.
- Times in UTC+7 first, UTC in brackets, in any prose output.
- No AI attribution in commits. Conventional commit titles only (no body, no footer).
- Skill edits follow `digismith:writing-skills`.

## Open items resolved

| Open item | Decision |
|---|---|
| Interim registry default | Depot per ticket: `~/.digismith-depot/token-registry/<ticket>.jsonl` (env `DIGISMITH_TOKEN_REGISTRY_DIR` overrides, used by tests). Marked interim; DGS-220 replaces the implementation behind the interface. |
| Review note 1, consumer repos | The registry is always in the depot. `tokens.json` is written to the ticket's board folder only when the repo is DigiSmith's own (`.claude-plugin/plugin.json` named `digismith`). In any other repo it goes to `~/.digismith-depot/token-registry/<ticket>.tokens.json`. DigiSmith session ids never reach a client's git. |
| Code home and `dg` command | `packages/cli/src/tokens/` (library, tests, `entry.ts`) and the command `dg tokens <ticket>` registered in `packages/cli/src/index.ts`. No new package, so no new build chain. DGS-220 can move the library; the interface and schema are the contract. |
| Review note 2, task to subagent | SDD records the agent id of every dispatch in the ledger (`Task N: dispatch <role> agent=<id>`). The Agent tool result carries `agentId`. Subagent files are `<session>/subagents/agent-<id>.jsonl`. A task's tokens are the sum of the files of its agent ids. |
| `executing-plans` task rows | No task rows. It has no ledger and no subagents. Its tasks stay inside the `implementation` step. |
| Review note 3, slicing | Two slices, in this order. Slice 1 (Tasks 1-6) ships and merges first. Slice 2 (Tasks 7-10) follows. Jack decides at checkpoint 2 whether slice 2 starts right after slice 1 merges. |
| Review note 4, `iterations` and compaction | Task 6 verifies on real transcripts. A real multi-iteration case in the corpus decides whether the reader uses `usage.iterations`. Until then the reader uses top-level counts (checked: a single-iteration entry equals the top level). |

## File Structure

All under `packages/cli/src/tokens/` unless noted.

| File | Responsibility |
|---|---|
| `types.ts` | `UsageRecord`, `Counts`, `RegistryEntry`, `Snapshot`, step names |
| `claude-code-reader.ts` | Claude Code transcript (and its subagent files) to deduped `UsageRecord[]` |
| `registry.ts` | `Registry` interface and the depot-per-ticket implementation |
| `attribution.ts` | Find sessions of a ticket by title, branch and cwd (fallback), find transcripts by session id |
| `snapshot.ts` | Group records into steps, tasks, sessions; build the `Snapshot` |
| `ledger.ts` | Parse SDD ledger lines (slice 2) |
| `entry.ts` | Plain-Node front end for skills (slice 2 subcommands) |
| `index.ts` | yargs command `dg tokens` |
| `*.test.ts` | One test file per unit |
| `packages/cli/src/index.ts` | Register the command (modify) |

---

## Slice 1: reader, registry interface, fallback tagging, `dg tokens`

### Task 1: Types and the Claude Code reader

**Files:**
- Create: `packages/cli/src/tokens/types.ts`
- Create: `packages/cli/src/tokens/claude-code-reader.ts`
- Test: `packages/cli/src/tokens/claude-code-reader.test.ts`

**Interfaces:**
- Produces: `UsageRecord`, `Counts`, `emptyCounts()`, `addCounts(a, b)`, and `readClaudeCodeSession(transcriptPath: string): UsageRecord[]` (reads the main file and `<dir>/<sessionId>/subagents/agent-*.jsonl`).

- [ ] **Step 1: Write `types.ts`**

```ts
export const STEPS = ["brainstorming", "writing-plans", "implementation", "finishing", "other"] as const;
export type Step = (typeof STEPS)[number];

export interface Counts {
  input: number;
  output: number;
  cache_read: number;
  cache_write_5m: number;
  cache_write_1h: number;
  responses: number;
}

export function emptyCounts(): Counts {
  return { input: 0, output: 0, cache_read: 0, cache_write_5m: 0, cache_write_1h: 0, responses: 0 };
}

export function addCounts(a: Counts, b: Counts): Counts {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cache_read: a.cache_read + b.cache_read,
    cache_write_5m: a.cache_write_5m + b.cache_write_5m,
    cache_write_1h: a.cache_write_1h + b.cache_write_1h,
    responses: a.responses + b.responses,
  };
}

export interface UsageRecord {
  source: string; // reader name, phase 1: "claude-code"
  session_id: string;
  agent_id: string | null; // subagent id, null for the main thread
  response_id: string; // dedupe key
  model: string;
  ts: string; // ISO-8601 UTC
  input: number;
  output: number;
  cache_read: number;
  cache_write_5m: number;
  cache_write_1h: number;
  write_split: "known" | "unknown";
}

export type Role = "worker" | "maestro" | "reviewer" | "other";

export type RegistryEntry =
  | { kind: "session"; ticket: string; session_id: string; source: string; role: Role; ts: string }
  | { kind: "step_start"; ticket: string; step: Step; session_id: string; ts: string }
  | { kind: "step_end"; ticket: string; step: Step; session_id: string; ts: string };

export interface Registry {
  append(entry: RegistryEntry): void;
  read(ticket: string): RegistryEntry[];
}

export interface Snapshot {
  schema_version: 1;
  ticket: string;
  generated_at: string;
  reader_versions: Record<string, string>;
  steps: Record<string, Record<string, Counts>>; // step -> model -> counts
  tasks: Record<string, Record<string, Counts>>; // task id -> model -> counts
  sessions: { session_id: string; role: Role | "unknown"; attribution: "registry" | "inferred" }[];
  unattributed: Record<string, Counts>;
}
```

- [ ] **Step 2: Write the failing test** (`claude-code-reader.test.ts`; builds synthetic transcripts, no real text)

```ts
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readClaudeCodeSession } from "./claude-code-reader.ts";

function line(o: object): string {
  return JSON.stringify(o);
}

function assistant(opts: {
  id: string; req: string; output: number; ts: string; sessionId: string; model?: string;
  agentId?: string; split?: boolean;
}) {
  const usage: Record<string, unknown> = {
    input_tokens: 2,
    output_tokens: opts.output,
    cache_read_input_tokens: 100,
    cache_creation_input_tokens: 30,
  };
  if (opts.split !== false) usage.cache_creation = { ephemeral_5m_input_tokens: 10, ephemeral_1h_input_tokens: 20 };
  return line({
    type: "assistant", uuid: `${opts.id}-${opts.output}`, timestamp: opts.ts, sessionId: opts.sessionId,
    requestId: opts.req, ...(opts.agentId ? { agentId: opts.agentId, isSidechain: true } : {}),
    message: { id: opts.id, model: opts.model ?? "claude-opus-5-5", usage },
  });
}

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "tok-"));
  const sid = "11111111-1111-1111-1111-111111111111";
  return { dir, sid, file: join(dir, `${sid}.jsonl`) };
}

describe("readClaudeCodeSession", () => {
  it("dedupes lines with the same message id and request id, keeping the highest output", () => {
    const { file, sid } = setup();
    writeFileSync(file, [
      assistant({ id: "m1", req: "r1", output: 5, ts: "2026-10-10T01:00:00Z", sessionId: sid }),
      assistant({ id: "m1", req: "r1", output: 427, ts: "2026-10-10T01:00:01Z", sessionId: sid }),
      assistant({ id: "m2", req: "r2", output: 9, ts: "2026-10-10T01:01:00Z", sessionId: sid }),
    ].join("\n"));
    const records = readClaudeCodeSession(file);
    expect(records).toHaveLength(2);
    expect(records.find((r) => r.response_id === "m1|r1")!.output).toBe(427);
  });

  it("splits cache writes by 5-minute and 1-hour", () => {
    const { file, sid } = setup();
    writeFileSync(file, assistant({ id: "m1", req: "r1", output: 1, ts: "2026-10-10T01:00:00Z", sessionId: sid }));
    const [r] = readClaudeCodeSession(file);
    expect(r).toMatchObject({ cache_write_5m: 10, cache_write_1h: 20, cache_read: 100, input: 2, write_split: "known" });
  });

  it("puts all cache writes in the 5-minute bucket and marks the split unknown when cache_creation is missing", () => {
    const { file, sid } = setup();
    writeFileSync(file, assistant({ id: "m1", req: "r1", output: 1, ts: "2026-10-10T01:00:00Z", sessionId: sid, split: false }));
    const [r] = readClaudeCodeSession(file);
    expect(r).toMatchObject({ cache_write_5m: 30, cache_write_1h: 0, write_split: "unknown" });
  });

  it("reads subagent files under <session>/subagents and tags the agent id", () => {
    const { dir, file, sid } = setup();
    writeFileSync(file, assistant({ id: "m1", req: "r1", output: 1, ts: "2026-10-10T01:00:00Z", sessionId: sid }));
    mkdirSync(join(dir, sid, "subagents"), { recursive: true });
    writeFileSync(
      join(dir, sid, "subagents", "agent-abc123.jsonl"),
      assistant({ id: "s1", req: "q1", output: 7, ts: "2026-10-10T01:02:00Z", sessionId: sid, agentId: "abc123" }),
    );
    const records = readClaudeCodeSession(file);
    expect(records).toHaveLength(2);
    expect(records.find((r) => r.agent_id === "abc123")).toMatchObject({ session_id: sid, output: 7 });
    expect(records.find((r) => r.agent_id === null)).toBeDefined();
  });

  it("skips synthetic responses and non-assistant lines", () => {
    const { file, sid } = setup();
    writeFileSync(file, [
      line({ type: "user", message: { content: "x" } }),
      assistant({ id: "m1", req: "r1", output: 1, ts: "2026-10-10T01:00:00Z", sessionId: sid, model: "<synthetic>" }),
      "not json",
    ].join("\n"));
    expect(readClaudeCodeSession(file)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `pnpm --filter @digismith/cli exec vitest run src/tokens/claude-code-reader.test.ts`
Expected: FAIL, "Cannot find module './claude-code-reader.ts'".

- [ ] **Step 4: Write `claude-code-reader.ts`**

```ts
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { UsageRecord } from "./types.ts";

interface Line {
  type?: string;
  timestamp?: string;
  sessionId?: string;
  requestId?: string;
  agentId?: string;
  uuid?: string;
  message?: {
    id?: string;
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number };
    };
  };
}

function parseFile(path: string, sessionFallback: string, into: Map<string, UsageRecord>): void {
  for (const raw of readFileSync(path, "utf-8").split("\n")) {
    if (!raw) continue;
    let o: Line;
    try {
      o = JSON.parse(raw) as Line;
    } catch {
      continue;
    }
    const m = o.message;
    if (o.type !== "assistant" || !m?.usage || !m.model || m.model === "<synthetic>") continue;
    const u = m.usage;
    const split = u.cache_creation;
    const total = u.cache_creation_input_tokens ?? 0;
    const record: UsageRecord = {
      source: "claude-code",
      session_id: o.sessionId ?? sessionFallback,
      agent_id: o.agentId ?? null,
      response_id: m.id && o.requestId ? `${m.id}|${o.requestId}` : `uuid|${o.uuid ?? raw.length}`,
      model: m.model,
      ts: o.timestamp ?? "",
      input: u.input_tokens ?? 0,
      output: u.output_tokens ?? 0,
      cache_read: u.cache_read_input_tokens ?? 0,
      cache_write_5m: split ? (split.ephemeral_5m_input_tokens ?? 0) : total,
      cache_write_1h: split ? (split.ephemeral_1h_input_tokens ?? 0) : 0,
      write_split: split ? "known" : "unknown",
    };
    const prior = into.get(record.response_id);
    if (!prior || record.output >= prior.output) into.set(record.response_id, record);
  }
}

export function readClaudeCodeSession(transcriptPath: string): UsageRecord[] {
  const sessionId = basename(transcriptPath, ".jsonl");
  const byId = new Map<string, UsageRecord>();
  parseFile(transcriptPath, sessionId, byId);
  const subDir = join(dirname(transcriptPath), sessionId, "subagents");
  if (existsSync(subDir)) {
    for (const name of readdirSync(subDir)) {
      if (name.startsWith("agent-") && name.endsWith(".jsonl")) parseFile(join(subDir, name), sessionId, byId);
    }
  }
  return [...byId.values()].sort((a, b) => a.ts.localeCompare(b.ts));
}
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `pnpm --filter @digismith/cli exec vitest run src/tokens/claude-code-reader.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/tokens/types.ts packages/cli/src/tokens/claude-code-reader.ts packages/cli/src/tokens/claude-code-reader.test.ts
git commit -m "feat(tokens): add Claude Code usage reader"
```

---

### Task 2: The registry interface and the depot default

**Files:**
- Create: `packages/cli/src/tokens/registry.ts`
- Test: `packages/cli/src/tokens/registry.test.ts`

**Interfaces:**
- Consumes: `Registry`, `RegistryEntry` from `types.ts`.
- Produces: `createDepotRegistry(dir?: string): Registry`, `depotRegistryDir(): string`.

- [ ] **Step 1: Write the failing test**

```ts
import { appendFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDepotRegistry } from "./registry.ts";

describe("depot registry", () => {
  it("appends one JSON line per entry and reads them back by ticket", () => {
    const dir = mkdtempSync(join(tmpdir(), "reg-"));
    const reg = createDepotRegistry(dir);
    reg.append({ kind: "session", ticket: "DGS-1", session_id: "s1", source: "claude-code", role: "worker", ts: "2026-10-10T01:00:00Z" });
    reg.append({ kind: "step_start", ticket: "DGS-1", step: "brainstorming", session_id: "s1", ts: "2026-10-10T01:00:01Z" });
    reg.append({ kind: "session", ticket: "DGS-2", session_id: "s2", source: "claude-code", role: "worker", ts: "2026-10-10T02:00:00Z" });
    expect(reg.read("DGS-1")).toHaveLength(2);
    expect(reg.read("DGS-2")).toHaveLength(1);
    expect(readFileSync(join(dir, "DGS-1.jsonl"), "utf-8").trim().split("\n")).toHaveLength(2);
  });

  it("returns an empty list for a ticket with no file", () => {
    const reg = createDepotRegistry(mkdtempSync(join(tmpdir(), "reg-")));
    expect(reg.read("DGS-9")).toEqual([]);
  });

  it("skips malformed lines", () => {
    const dir = mkdtempSync(join(tmpdir(), "reg-"));
    const reg = createDepotRegistry(dir);
    reg.append({ kind: "session", ticket: "DGS-1", session_id: "s1", source: "claude-code", role: "worker", ts: "t" });
    // simulate a torn write
    appendFileSync(join(dir, "DGS-1.jsonl"), "{broken\n");
    expect(reg.read("DGS-1")).toHaveLength(1);
  });

  it("rejects a ticket key that could escape the directory", () => {
    const reg = createDepotRegistry(mkdtempSync(join(tmpdir(), "reg-")));
    expect(() => reg.read("../x")).toThrow(/ticket/);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @digismith/cli exec vitest run src/tokens/registry.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write `registry.ts`**

```ts
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Registry, RegistryEntry } from "./types.ts";

const TICKET_PATTERN = /^[A-Za-z0-9_-]+$/;

export function depotRegistryDir(): string {
  return process.env.DIGISMITH_TOKEN_REGISTRY_DIR ?? join(homedir(), ".digismith-depot", "token-registry");
}

function assertTicket(ticket: string): void {
  if (!TICKET_PATTERN.test(ticket)) throw new Error(`invalid ticket key: ${ticket}`);
}

// Interim default: one append-only JSONL file per ticket in the depot. DGS-220 owns the
// final location and may replace this implementation; callers only use Registry.
export function createDepotRegistry(dir: string = depotRegistryDir()): Registry {
  return {
    append(entry: RegistryEntry): void {
      assertTicket(entry.ticket);
      mkdirSync(dir, { recursive: true });
      appendFileSync(join(dir, `${entry.ticket}.jsonl`), `${JSON.stringify(entry)}\n`);
    },
    read(ticket: string): RegistryEntry[] {
      assertTicket(ticket);
      const file = join(dir, `${ticket}.jsonl`);
      if (!existsSync(file)) return [];
      const out: RegistryEntry[] = [];
      for (const raw of readFileSync(file, "utf-8").split("\n")) {
        if (!raw) continue;
        try {
          out.push(JSON.parse(raw) as RegistryEntry);
        } catch {
          // a torn or hand-edited line never breaks a count
        }
      }
      return out;
    },
  };
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm --filter @digismith/cli exec vitest run src/tokens/registry.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/tokens/registry.ts packages/cli/src/tokens/registry.test.ts
git commit -m "feat(tokens): add registry interface with depot default"
```

---

### Task 3: Finding sessions: transcript lookup and fallback tagging

**Files:**
- Create: `packages/cli/src/tokens/attribution.ts`
- Test: `packages/cli/src/tokens/attribution.test.ts`

**Interfaces:**
- Produces:
  - `findTranscript(sessionId: string, projectsDir?: string): string | null` (searches every project folder for `<sessionId>.jsonl`; this is the "search under projects" step of `skills/telemetry/SKILL.md` Step 2).
  - `inferSessionsForTicket(ticket: string, projectsDir?: string): string[]` returns session ids whose `custom-title.json` title, or first `gitBranch`, or `cwd` names the ticket.
  - `claudeProjectsDir(): string` (`~/.claude/projects`, env `DIGISMITH_CLAUDE_PROJECTS_DIR` overrides for tests).

Matching rules (case-insensitive, because DigiSmith's own branches and worktrees are lowercase like `dgs-169` and `dgs-223`, while Emma's are `EMKT-756__slug`): a session matches ticket `DGS-214` if (a) `customTitle` contains the key not preceded and not followed by a letter or digit (so `DGS-214 ⚚ Token counter` matches, `DGS-2140` does not), (b) the first line carrying `gitBranch` has the key at its start followed by `__`, `-` or the end of the string, or (c) the first line carrying `cwd` has a path segment that starts with the key followed by `__`, `-` or the end of the segment. Examples that must match: `dgs-214`, `dgs-214-slug`, `DGS-214__slug`. Examples that must not match: `dgs-2140`, `dgs-2140-x`, `DGS-21`. Only the first 200 lines of a transcript are read for (b) and (c).

- [ ] **Step 1: Write the failing test**

```ts
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findTranscript, inferSessionsForTicket } from "./attribution.ts";

function project(root: string, name: string) {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function session(dir: string, sid: string, opts: { title?: string; branch?: string; cwd?: string }) {
  writeFileSync(
    join(dir, `${sid}.jsonl`),
    JSON.stringify({ type: "user", sessionId: sid, gitBranch: opts.branch ?? "main", cwd: opts.cwd ?? "/x" }) + "\n",
  );
  if (opts.title) {
    mkdirSync(join(dir, sid), { recursive: true });
    writeFileSync(join(dir, sid, "custom-title.json"), JSON.stringify({ customTitle: opts.title }));
  }
}

describe("attribution", () => {
  it("finds a transcript by session id in any project folder", () => {
    const root = mkdtempSync(join(tmpdir(), "proj-"));
    session(project(root, "-a"), "s-1", {});
    session(project(root, "-b"), "s-2", {});
    expect(findTranscript("s-2", root)).toBe(join(root, "-b", "s-2.jsonl"));
    expect(findTranscript("nope", root)).toBeNull();
  });

  it("infers a ticket's sessions from title, branch and cwd", () => {
    const root = mkdtempSync(join(tmpdir(), "proj-"));
    const p = project(root, "-a");
    session(p, "by-title", { title: "DGS-214 ⚚ Token counter" });
    session(p, "by-branch", { branch: "DGS-214__count-tokens" });
    session(p, "by-lower-branch", { branch: "dgs-214" });
    session(p, "by-lower-slug-branch", { branch: "dgs-214-count-tokens" });
    session(p, "by-cwd", { cwd: "/w/.worktrees/DGS-214__count-tokens" });
    session(p, "by-lower-cwd", { cwd: "/w/.worktrees/dgs-214" });
    session(p, "other-ticket", { title: "DGS-2140 ⚚ Other", branch: "DGS-2140__x" });
    session(p, "other-lower", { branch: "dgs-2140-x", cwd: "/w/.worktrees/dgs-2140" });
    session(p, "shorter-key", { branch: "DGS-21__x" });
    session(p, "unrelated", {});
    expect(inferSessionsForTicket("DGS-214", root).sort()).toEqual([
      "by-branch", "by-cwd", "by-lower-branch", "by-lower-cwd", "by-lower-slug-branch", "by-title",
    ]);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @digismith/cli exec vitest run src/tokens/attribution.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write `attribution.ts`**

```ts
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function claudeProjectsDir(): string {
  return process.env.DIGISMITH_CLAUDE_PROJECTS_DIR ?? join(homedir(), ".claude", "projects");
}

function projectDirs(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .map((n) => join(root, n))
    .filter((p) => statSync(p).isDirectory());
}

export function findTranscript(sessionId: string, root: string = claudeProjectsDir()): string | null {
  for (const dir of projectDirs(root)) {
    const file = join(dir, `${sessionId}.jsonl`);
    if (existsSync(file)) return file;
  }
  return null;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// In a title: the key as a whole token, any case.
function titleRegex(ticket: string): RegExp {
  return new RegExp(`(^|[^A-Za-z0-9])${escapeRegex(ticket)}(?![A-Za-z0-9])`, "i");
}

// In a branch name or a path segment: the key at the start, then "__", "-" or the end.
function nameRegex(ticket: string): RegExp {
  return new RegExp(`^${escapeRegex(ticket)}(__|-|$)`, "i");
}

function readHead(file: string, maxLines: number): string[] {
  return readFileSync(file, "utf-8").split("\n", maxLines);
}

export function inferSessionsForTicket(ticket: string, root: string = claudeProjectsDir()): string[] {
  const titleRe = titleRegex(ticket);
  const nameRe = nameRegex(ticket);
  const found: string[] = [];
  for (const dir of projectDirs(root)) {
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".jsonl")) continue;
      const sid = name.slice(0, -".jsonl".length);
      let hit = false;
      const titleFile = join(dir, sid, "custom-title.json");
      if (existsSync(titleFile)) {
        try {
          const title = (JSON.parse(readFileSync(titleFile, "utf-8")) as { customTitle?: string }).customTitle ?? "";
          hit = titleRe.test(title);
        } catch {
          // unreadable title: fall through to branch and cwd
        }
      }
      if (!hit) {
        for (const raw of readHead(join(dir, name), 200)) {
          if (!raw) continue;
          try {
            const o = JSON.parse(raw) as { gitBranch?: string; cwd?: string };
            if (o.gitBranch && nameRe.test(o.gitBranch)) hit = true;
            if (o.cwd?.split("/").some((seg) => nameRe.test(seg))) hit = true;
          } catch {
            continue;
          }
          if (hit) break;
        }
      }
      if (hit) found.push(sid);
    }
  }
  return found;
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm --filter @digismith/cli exec vitest run src/tokens/attribution.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/tokens/attribution.ts packages/cli/src/tokens/attribution.test.ts
git commit -m "feat(tokens): add transcript lookup and fallback session tagging"
```

---

### Task 4: Grouping into steps and the snapshot

**Files:**
- Create: `packages/cli/src/tokens/snapshot.ts`
- Test: `packages/cli/src/tokens/snapshot.test.ts`

**Interfaces:**
- Consumes: `UsageRecord`, `RegistryEntry`, `Snapshot`, `Counts`, `emptyCounts`, `addCounts`, `Step`.
- Produces: `stepForRecord(record: UsageRecord, entries: RegistryEntry[]): Step` and `buildSnapshot(input: { ticket: string; generatedAt: string; records: UsageRecord[]; entries: RegistryEntry[]; inferredSessions: string[]; taskAgents?: Record<string, string[]> }): Snapshot`.

Rules (design sections 5, 6, 7):
- A record belongs to the step whose window (same `session_id`) contains its `ts`. A window opens at a `step_start` and closes at the next `step_end` or the next `step_start` of the same session. A record outside every window is step `other`. Subagent records use their parent `session_id`, so they follow the parent's windows.
- A session is `registry` if the registry has a `session` entry for it, else `inferred`. Records of a session in neither list are `unattributed`.
- `taskAgents` maps a task id to agent ids. A record whose `agent_id` is in a task's list counts under that task (and still under its step).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { buildSnapshot, stepForRecord } from "./snapshot.ts";
import type { RegistryEntry, UsageRecord } from "./types.ts";

function rec(over: Partial<UsageRecord>): UsageRecord {
  return {
    source: "claude-code", session_id: "s1", agent_id: null, response_id: Math.random().toString(),
    model: "claude-opus-5-5", ts: "2026-10-10T01:00:00Z", input: 1, output: 10, cache_read: 100,
    cache_write_5m: 5, cache_write_1h: 7, write_split: "known", ...over,
  };
}

const entries: RegistryEntry[] = [
  { kind: "session", ticket: "T-1", session_id: "s1", source: "claude-code", role: "worker", ts: "2026-10-10T00:59:00Z" },
  { kind: "step_start", ticket: "T-1", step: "brainstorming", session_id: "s1", ts: "2026-10-10T01:00:00Z" },
  { kind: "step_end", ticket: "T-1", step: "brainstorming", session_id: "s1", ts: "2026-10-10T02:00:00Z" },
  { kind: "step_start", ticket: "T-1", step: "implementation", session_id: "s1", ts: "2026-10-10T03:00:00Z" },
];

describe("stepForRecord", () => {
  it("uses the open window of the record's session", () => {
    expect(stepForRecord(rec({ ts: "2026-10-10T01:30:00Z" }), entries)).toBe("brainstorming");
    expect(stepForRecord(rec({ ts: "2026-10-10T04:00:00Z" }), entries)).toBe("implementation");
  });
  it("returns other between windows, before the first window and for another session", () => {
    expect(stepForRecord(rec({ ts: "2026-10-10T02:30:00Z" }), entries)).toBe("other");
    expect(stepForRecord(rec({ ts: "2026-10-10T00:30:00Z" }), entries)).toBe("other");
    expect(stepForRecord(rec({ session_id: "s9", ts: "2026-10-10T01:30:00Z" }), entries)).toBe("other");
  });
});

describe("buildSnapshot", () => {
  it("sums counts per step and model, with task rows from agent ids", () => {
    const snap = buildSnapshot({
      ticket: "T-1", generatedAt: "2026-10-10T05:00:00Z", entries, inferredSessions: [],
      taskAgents: { "task-1": ["a1"] },
      records: [
        rec({ ts: "2026-10-10T01:10:00Z" }),
        rec({ ts: "2026-10-10T03:10:00Z", agent_id: "a1", output: 20 }),
        rec({ ts: "2026-10-10T03:20:00Z", agent_id: "a2", output: 30 }),
      ],
    });
    expect(snap.steps.brainstorming["claude-opus-5-5"]).toMatchObject({ output: 10, responses: 1 });
    expect(snap.steps.implementation["claude-opus-5-5"]).toMatchObject({ output: 50, responses: 2 });
    expect(snap.tasks["task-1"]["claude-opus-5-5"]).toMatchObject({ output: 20, responses: 1 });
    expect(snap.schema_version).toBe(1);
    expect(snap.sessions).toEqual([{ session_id: "s1", role: "worker", attribution: "registry" }]);
  });

  it("marks inferred sessions and puts unknown sessions under unattributed", () => {
    const snap = buildSnapshot({
      ticket: "T-1", generatedAt: "t", entries: [], inferredSessions: ["s2"],
      records: [rec({ session_id: "s2" }), rec({ session_id: "s3", output: 4 })],
    });
    expect(snap.sessions).toEqual([{ session_id: "s2", role: "unknown", attribution: "inferred" }]);
    expect(snap.steps.other["claude-opus-5-5"].responses).toBe(1);
    expect(snap.unattributed["claude-opus-5-5"]).toMatchObject({ output: 4, responses: 1 });
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @digismith/cli exec vitest run src/tokens/snapshot.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write `snapshot.ts`**

```ts
import { addCounts, emptyCounts, type Counts, type RegistryEntry, type Role, type Snapshot, type Step, type UsageRecord } from "./types.ts";

export function stepForRecord(record: UsageRecord, entries: RegistryEntry[]): Step {
  const own = entries
    .filter((e): e is Extract<RegistryEntry, { step: Step }> => (e.kind === "step_start" || e.kind === "step_end") && e.session_id === record.session_id)
    .filter((e) => e.ts <= record.ts)
    .sort((a, b) => a.ts.localeCompare(b.ts));
  const last = own[own.length - 1];
  return last && last.kind === "step_start" ? last.step : "other";
}

function countsOf(record: UsageRecord): Counts {
  return {
    input: record.input,
    output: record.output,
    cache_read: record.cache_read,
    cache_write_5m: record.cache_write_5m,
    cache_write_1h: record.cache_write_1h,
    responses: 1,
  };
}

function addModel(models: Record<string, Counts>, record: UsageRecord): void {
  models[record.model] = addCounts(models[record.model] ?? emptyCounts(), countsOf(record));
}

function bump(table: Record<string, Record<string, Counts>>, key: string, record: UsageRecord): void {
  addModel((table[key] ??= {}), record);
}

export interface SnapshotInput {
  ticket: string;
  generatedAt: string;
  records: UsageRecord[];
  entries: RegistryEntry[];
  inferredSessions: string[];
  taskAgents?: Record<string, string[]>;
}

export function buildSnapshot(input: SnapshotInput): Snapshot {
  const registered = new Map<string, Role>();
  for (const e of input.entries) if (e.kind === "session") registered.set(e.session_id, e.role);
  const inferred = new Set(input.inferredSessions.filter((s) => !registered.has(s)));

  const steps: Snapshot["steps"] = {};
  const tasks: Snapshot["tasks"] = {};
  const unattributed: Snapshot["unattributed"] = {};

  for (const record of input.records) {
    if (!registered.has(record.session_id) && !inferred.has(record.session_id)) {
      addModel(unattributed, record);
      continue;
    }
    bump(steps, stepForRecord(record, input.entries), record);
    for (const [task, agents] of Object.entries(input.taskAgents ?? {})) {
      if (record.agent_id && agents.includes(record.agent_id)) bump(tasks, task, record);
    }
  }

  const sessions: Snapshot["sessions"] = [
    ...[...registered].map(([session_id, role]) => ({ session_id, role, attribution: "registry" as const })),
    ...[...inferred].map((session_id) => ({ session_id, role: "unknown" as const, attribution: "inferred" as const })),
  ];

  return {
    schema_version: 1,
    ticket: input.ticket,
    generated_at: input.generatedAt,
    reader_versions: { "claude-code": "1" },
    steps,
    tasks,
    sessions,
    unattributed,
  };
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm --filter @digismith/cli exec vitest run src/tokens/snapshot.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/tokens/snapshot.ts packages/cli/src/tokens/snapshot.test.ts
git commit -m "feat(tokens): group usage into steps and build the snapshot"
```

---

### Task 5: `dg tokens <ticket>`

**Files:**
- Create: `packages/cli/src/tokens/count.ts` (the shared count function both front ends call)
- Create: `packages/cli/src/tokens/index.ts` (yargs command)
- Modify: `packages/cli/src/index.ts` (register the command; add `import tokensCommand from "./tokens/index.ts";` and `.command(tokensCommand)` after `.command(shopeeCommand)`)
- Test: `packages/cli/src/tokens/count.test.ts`, and add `tokens` to the command-list expectations in `packages/cli/src/index.test.ts` if it asserts the list (read the file first)

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces:
  - `countTicket(opts: { ticket: string; registry: Registry; projectsDir?: string; now?: () => string; taskAgents?: Record<string, string[]> }): Snapshot`
  - `renderTable(snapshot: Snapshot): string`
  - `resolveSnapshotPath(cwd: string, ticket: string): string` (board folder for DigiSmith's own repo, else depot; see Open items, review note 1)

`countTicket` steps: read the registry; session ids = registry sessions plus `inferSessionsForTicket`; for each id, `findTranscript` then `readClaudeCodeSession`; skip ids with no transcript and list them in a `missing` note on stderr (the snapshot itself stays schema-stable); call `buildSnapshot`.

- [ ] **Step 1: Write the failing test** (`count.test.ts`)

```ts
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { countTicket, renderTable, resolveSnapshotPath } from "./count.ts";
import { createDepotRegistry } from "./registry.ts";

function fixture() {
  const projects = mkdtempSync(join(tmpdir(), "proj-"));
  const dir = join(projects, "-a");
  mkdirSync(dir, { recursive: true });
  const sid = "sess-1";
  writeFileSync(
    join(dir, `${sid}.jsonl`),
    [
      JSON.stringify({ type: "user", sessionId: sid, gitBranch: "T-1__x", cwd: "/w" }),
      JSON.stringify({
        type: "assistant", sessionId: sid, requestId: "r1", timestamp: "2026-10-10T01:00:00Z",
        message: { id: "m1", model: "claude-opus-5-5", usage: { input_tokens: 2, output_tokens: 10, cache_read_input_tokens: 100, cache_creation_input_tokens: 30, cache_creation: { ephemeral_5m_input_tokens: 10, ephemeral_1h_input_tokens: 20 } } },
      }),
    ].join("\n"),
  );
  return { projects, sid };
}

describe("countTicket", () => {
  it("counts a session found only by fallback tagging", () => {
    const { projects } = fixture();
    const reg = createDepotRegistry(mkdtempSync(join(tmpdir(), "reg-")));
    const snap = countTicket({ ticket: "T-1", registry: reg, projectsDir: projects, now: () => "2026-10-10T05:00:00Z" });
    expect(snap.sessions[0]).toMatchObject({ session_id: "sess-1", attribution: "inferred" });
    expect(snap.steps.other["claude-opus-5-5"]).toMatchObject({ input: 2, output: 10, responses: 1 });
  });

  it("prefers the registry entry and its step windows", () => {
    const { projects, sid } = fixture();
    const reg = createDepotRegistry(mkdtempSync(join(tmpdir(), "reg-")));
    reg.append({ kind: "session", ticket: "T-1", session_id: sid, source: "claude-code", role: "worker", ts: "2026-10-10T00:00:00Z" });
    reg.append({ kind: "step_start", ticket: "T-1", step: "brainstorming", session_id: sid, ts: "2026-10-10T00:30:00Z" });
    const snap = countTicket({ ticket: "T-1", registry: reg, projectsDir: projects, now: () => "t" });
    expect(snap.sessions).toEqual([{ session_id: sid, role: "worker", attribution: "registry" }]);
    expect(snap.steps.brainstorming["claude-opus-5-5"].responses).toBe(1);
  });
});

describe("renderTable", () => {
  it("prints one row per step and model with the five token classes", () => {
    const { projects } = fixture();
    const reg = createDepotRegistry(mkdtempSync(join(tmpdir(), "reg-")));
    const text = renderTable(countTicket({ ticket: "T-1", registry: reg, projectsDir: projects, now: () => "t" }));
    expect(text).toContain("other");
    expect(text).toContain("claude-opus-5-5");
    expect(text).toMatch(/input\s+output\s+cache_read\s+cache_w5m\s+cache_w1h/);
  });
});

describe("resolveSnapshotPath", () => {
  it("uses the board folder in DigiSmith's own repo", () => {
    const repo = mkdtempSync(join(tmpdir(), "repo-"));
    mkdirSync(join(repo, ".claude-plugin"), { recursive: true });
    writeFileSync(join(repo, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "digismith" }));
    mkdirSync(join(repo, ".digismith", "board", "DGS-214—count-tokens"), { recursive: true });
    expect(resolveSnapshotPath(repo, "DGS-214")).toBe(join(repo, ".digismith", "board", "DGS-214—count-tokens", "tokens.json"));
  });

  it("uses the depot in any other repo, never the repo's git", () => {
    const repo = mkdtempSync(join(tmpdir(), "client-"));
    const depot = mkdtempSync(join(tmpdir(), "depot-"));
    process.env.DIGISMITH_TOKEN_REGISTRY_DIR = depot;
    try {
      expect(resolveSnapshotPath(repo, "EMKT-9")).toBe(join(depot, "EMKT-9.tokens.json"));
    } finally {
      delete process.env.DIGISMITH_TOKEN_REGISTRY_DIR;
    }
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @digismith/cli exec vitest run src/tokens/count.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write `count.ts`**

```ts
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { claudeProjectsDir, findTranscript, inferSessionsForTicket } from "./attribution.ts";
import { readClaudeCodeSession } from "./claude-code-reader.ts";
import { depotRegistryDir } from "./registry.ts";
import { buildSnapshot } from "./snapshot.ts";
import type { Counts, Registry, Snapshot, UsageRecord } from "./types.ts";

export interface CountOptions {
  ticket: string;
  registry: Registry;
  projectsDir?: string;
  now?: () => string;
  taskAgents?: Record<string, string[]>;
}

export function countTicket(opts: CountOptions): Snapshot {
  const root = opts.projectsDir ?? claudeProjectsDir();
  const entries = opts.registry.read(opts.ticket);
  const registered = entries.flatMap((e) => (e.kind === "session" ? [e.session_id] : []));
  const inferred = inferSessionsForTicket(opts.ticket, root).filter((s) => !registered.includes(s));
  const records: UsageRecord[] = [];
  for (const sid of [...new Set([...registered, ...inferred])]) {
    const file = findTranscript(sid, root);
    if (!file) {
      console.error(`tokens: no transcript found for session ${sid}`);
      continue;
    }
    records.push(...readClaudeCodeSession(file));
  }
  return buildSnapshot({
    ticket: opts.ticket,
    generatedAt: (opts.now ?? (() => new Date().toISOString()))(),
    records,
    entries,
    inferredSessions: inferred,
    taskAgents: opts.taskAgents,
  });
}

function row(label: string, model: string, c: Counts): string {
  const n = (v: number) => String(v).padStart(12);
  return `${label.padEnd(15)}${model.padEnd(28)}${n(c.input)}${n(c.output)}${n(c.cache_read)}${n(c.cache_write_5m)}${n(c.cache_write_1h)}${n(c.responses)}`;
}

export function renderTable(snapshot: Snapshot): string {
  const head =
    "step".padEnd(15) + "model".padEnd(28) +
    ["input", "output", "cache_read", "cache_w5m", "cache_w1h", "responses"].map((h) => h.padStart(12)).join("");
  const lines = [`ticket ${snapshot.ticket}`, head];
  for (const [step, models] of Object.entries(snapshot.steps)) {
    for (const [model, c] of Object.entries(models)) lines.push(row(step, model, c));
  }
  for (const [task, models] of Object.entries(snapshot.tasks)) {
    for (const [model, c] of Object.entries(models)) lines.push(row(`task ${task}`, model, c));
  }
  for (const [model, c] of Object.entries(snapshot.unattributed)) lines.push(row("unattributed", model, c));
  lines.push("", `sessions: ${snapshot.sessions.map((s) => `${s.session_id} (${s.attribution})`).join(", ") || "none"}`);
  return lines.join("\n");
}

function isDigiSmithRepo(cwd: string): boolean {
  try {
    const manifest = JSON.parse(readFileSync(join(cwd, ".claude-plugin", "plugin.json"), "utf-8")) as { name?: string };
    return manifest.name === "digismith";
  } catch {
    return false;
  }
}

export function resolveSnapshotPath(cwd: string, ticket: string): string {
  if (isDigiSmithRepo(cwd)) {
    const board = join(cwd, ".digismith", "board");
    if (existsSync(board)) {
      const folder = readdirSync(board).find((n) => n.startsWith(`${ticket}—`));
      if (folder) return join(board, folder, "tokens.json");
    }
  }
  return join(depotRegistryDir(), `${ticket}.tokens.json`);
}
```

- [ ] **Step 4: Write `index.ts` (yargs command)**

```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { CommandModule } from "yargs";
import { countTicket, renderTable, resolveSnapshotPath } from "./count.ts";
import { createDepotRegistry } from "./registry.ts";

interface Args {
  ticket: string;
  json: boolean;
  write: boolean;
}

const tokensCommand: CommandModule<object, Args> = {
  command: "tokens <ticket>",
  describe: "count the tokens of a ticket from Claude Code transcripts (counts only, no prices)",
  builder: (y) =>
    y
      .positional("ticket", { type: "string", demandOption: true, describe: "ticket key, e.g. DGS-214" })
      .option("json", { type: "boolean", default: false, describe: "print the snapshot as JSON" })
      .option("write", { type: "boolean", default: false, describe: "save tokens.json (board folder in DigiSmith's repo, depot elsewhere)" }),
  handler: (args) => {
    const snapshot = countTicket({ ticket: args.ticket, registry: createDepotRegistry() });
    console.log(args.json ? JSON.stringify(snapshot, null, 2) : renderTable(snapshot));
    if (args.write) {
      const out = resolveSnapshotPath(process.cwd(), args.ticket);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, `${JSON.stringify(snapshot, null, 2)}\n`);
      console.error(`tokens: wrote ${out}`);
    }
  },
};

export default tokensCommand;
```

- [ ] **Step 5: Register the command.** In `packages/cli/src/index.ts` add `import tokensCommand from "./tokens/index.ts";` under the other command imports and `.command(tokensCommand)` after `.command(shopeeCommand)`. Read `packages/cli/src/index.test.ts` and `packages/cli/src/lib/brand-help.ts`; if either lists the commands, add `tokens` the same way the others appear.

- [ ] **Step 6: Run the tests**

Run: `pnpm --filter @digismith/cli exec vitest run src/tokens src/index.test.ts`
Expected: PASS. Then `pnpm --filter @digismith/cli build` must succeed (type check through `tsc`).

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/tokens packages/cli/src/index.ts packages/cli/src/index.test.ts packages/cli/src/lib/brand-help.ts
git commit -m "feat(cli): add dg tokens command"
```

---

### Task 6: Slice 1 real-data verification and cross-check

**Files:**
- Create: `packages/cli/src/tokens/README.md` (one page: what the reader counts, the registry interface, the DGS-220 boundary, how to cross-check)
- No code change unless a check below fails; a failure is fixed in the file that owns it, with a test added first.

- [ ] **Step 1: Count a real ticket.** Run `node --experimental-strip-types packages/cli/src/index.ts tokens DGS-198` (a finished ticket with a worker transcript). Expected: a table with at least one step row, the session listed as `inferred`.
- [ ] **Step 2: Cross-check against ccusage.** Run `pnpm dlx ccusage@20.0.28 session --json` (read-only; version pinned 2026-10-10, checked with `pnpm view ccusage version`; bump the pin in the README if a later run uses another version), pick the same session id, and compare input, output, cache read and cache write totals with the table's sums. Expected: equal, or a difference explained in the README (for example ccusage dedupe rules). An unexplained difference blocks slice 1.
- [ ] **Step 3: Review note 4, real transcripts.** Search the local corpus (`~/.claude/projects`) for lines whose `usage.iterations` has more than one entry, for compaction summaries, and for resumed sessions. Read only `usage`, ids and timestamps. For each case found, add a fixture test to `claude-code-reader.test.ts` that pins the chosen rule, and fix the reader if the sum is wrong. If no multi-iteration line exists, record "none found in corpus on <date>" in the README and leave the rule as top-level counts.
- [ ] **Step 4: Run the full suite.** `pnpm test` from the repo root. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/tokens
git commit -m "docs(tokens): add counter README and real-data checks"
```

**Slice 1 ends here.** It ships and merges on its own: `dg tokens <ticket>` works over fallback tagging, and the registry read path works with an empty registry.

---

## Slice 2: registry writes in the skills and the SDD ledger

> **RESOLVED at checkpoint A (2026-10-10): the live session id comes from `CLAUDE_CODE_SESSION_ID`.** The earlier blocker (the "newest transcript in the cwd folder" rule fails because maestros and workers all start in the repo root) is closed by `session-id-source.md` in this folder. Claude Code sets `CLAUDE_CODE_SESSION_ID` in every Bash command and hook subprocess (documented on the environment variables page). It is the id of the transcript file the session writes to, it updates on `/clear`, and a subagent's Bash reports its parent session's id. No hook and no herdr call is needed. Tasks 7 to 10 use it as written below. `--session-id` stays the explicit override. The "newest transcript" rule is not used anywhere.

### Task 7: The plain-Node entry for skills

**Files:**
- Create: `packages/cli/src/tokens/ledger.ts`
- Create: `packages/cli/src/tokens/entry.ts`
- Test: `packages/cli/src/tokens/ledger.test.ts`, `packages/cli/src/tokens/entry.test.ts`

**Interfaces:**
- Produces (`ledger.ts`): `parseTaskAgents(ledgerText: string): Record<string, string[]>`. It reads lines of the form `Task <N>: dispatch <role> agent=<id>` and returns `{ "<N>": ["<id>", ...] }`.
- Produces (`entry.ts`), run as `node --experimental-strip-types <depot>/packages/cli/src/tokens/entry.ts <subcommand> [--flag value ...]`:
  - `session --ticket K --role worker|maestro|reviewer|other [--session-id S] [--source claude-code]` appends a `session` entry. Id resolution order: the `--session-id` flag, then the environment variable `CLAUDE_CODE_SESSION_ID`. Both must match `^[A-Za-z0-9_-]+$`. Nothing else is tried: no newest-transcript guess. When neither gives a usable id, the subcommand prints a one-line warning on stderr, writes nothing and exits 0. When the id is usable but `findTranscript(id)` finds no transcript, it still writes the entry and adds a warning on stderr.
  - `step-start --ticket K --step S` and `step-end --ticket K --step S` append entries for the live session.
  - `snapshot --ticket K [--ledger PATH] [--write]` runs `countTicket` (with `taskAgents` from the ledger when given), prints the table, and with `--write` saves `tokens.json` at `resolveSnapshotPath(cwd, K)`.
  - `task-tokens --ticket K --task N --ledger PATH` prints the one-line token total of task N, formatted `Task N: tokens in=<n> out=<n> cr=<n> cw5=<n> cw1=<n>`, for the controller to append to the ledger.
  - Every subcommand prints errors to stderr and exits 1. `session`, `step-start` and `step-end` exit 0 and print a one-line warning (never fail the ticket flow) if the live session cannot be resolved.

- [ ] **Step 1: Write the failing tests.** `ledger.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseTaskAgents } from "./ledger.ts";

describe("parseTaskAgents", () => {
  it("collects the agent ids of each task from dispatch lines", () => {
    const text = [
      "# SDD ledger — plan: plan.md",
      "Task 1: dispatch implementer agent=a111",
      "Task 1: dispatch task-reviewer agent=a222",
      "Task 1: complete (commits a..b, review clean)",
      "Task 2: dispatch implementer agent=a333",
    ].join("\n");
    expect(parseTaskAgents(text)).toEqual({ "1": ["a111", "a222"], "2": ["a333"] });
  });
  it("returns an empty map for a ledger with no dispatch lines", () => {
    expect(parseTaskAgents("# SDD ledger — plan: plan.md\nTask 1: complete")).toEqual({});
  });
});
```

`entry.test.ts` runs `entry.ts` through `child_process.spawnSync("node", ["--experimental-strip-types", entryPath, ...])` with `DIGISMITH_TOKEN_REGISTRY_DIR` and `DIGISMITH_CLAUDE_PROJECTS_DIR` set to temp dirs, and checks: (a) `session --ticket T-1 --role worker --session-id s1` creates `T-1.jsonl` with one `session` line; (b) `step-start --ticket T-1 --step brainstorming --session-id s1` appends a `step_start` line; (c) with no `--session-id` and `CLAUDE_CODE_SESSION_ID` removed from the child environment it exits 0, prints a warning on stderr and writes nothing; (c2) with no flag and `CLAUDE_CODE_SESSION_ID=s9` in the child environment it records session `s9`; (c3) with both, the `--session-id` flag wins; (c4) an env value that does not match `^[A-Za-z0-9_-]+$` (for example one containing `/`) is refused with a warning and nothing is written; (d) `step-start --step bogus` exits 1; (e) `snapshot --ticket T-1` prints a table containing `ticket T-1`. Use the transcript fixture builder from Task 5 (copy the small `fixture()` function into this test file; tests do not share helpers across files in this repo).

- [ ] **Step 2: Run them to confirm they fail.** `pnpm --filter @digismith/cli exec vitest run src/tokens/ledger.test.ts src/tokens/entry.test.ts` — Expected: FAIL, modules not found.
- [ ] **Step 3: Write `ledger.ts`.**

```ts
export function parseTaskAgents(ledgerText: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const line of ledgerText.split("\n")) {
    const m = /^Task (\S+): dispatch \S+ agent=(\S+)\s*$/.exec(line.trim());
    if (m) (out[m[1]] ??= []).push(m[2]);
  }
  return out;
}
```

- [ ] **Step 4: Write `entry.ts`** following the subcommand list above. Reuse `countTicket`, `renderTable`, `resolveSnapshotPath`, `createDepotRegistry`, `STEPS` and `parseTaskAgents`. Parse flags with a 10-line local `parseArgs` identical in behavior to `packages/jira-client/src/cli.ts` (`--name value` pairs; the library files may not import from another package). Validate `--step` against `STEPS` and `--role` against the `Role` values; an invalid value is an error (exit 1).
- [ ] **Step 5: Run the tests to confirm they pass**, then `pnpm --filter @digismith/cli build`.
- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/tokens/ledger.ts packages/cli/src/tokens/ledger.test.ts packages/cli/src/tokens/entry.ts packages/cli/src/tokens/entry.test.ts
git commit -m "feat(tokens): add plain-Node entry and ledger parser for skills"
```

---

### Task 8: `digismith:init` writes the session and the first step

**Files (skills, Markdown; follow `digismith:writing-skills`):**
- Modify: `skills/bootstrap/SKILL.md` (new Step 1.6 after Step 1.5)
- Modify: `skills/adopt/SKILL.md` (the equivalent step, next to its telemetry-marker step)
- Modify: `skills/init/SKILL.md` (Step 0 item 2, "Already initialized": add the resume write)

**What each edit says (exact behavior):**
- bootstrap Step 1.6 "Register the ticket's session for token counting": runs on every ticket start, **not gated on `logging`** (it records counts and ids only, no transcript text). Run these two commands from inside the worktree Step 2 produced, after Step 2.7 and before Step 3 hands off to `brainstorming`:

```bash
node --experimental-strip-types ~/.digismith-depot/repo/packages/cli/src/tokens/entry.ts session --ticket <Key> --role worker
node --experimental-strip-types ~/.digismith-depot/repo/packages/cli/src/tokens/entry.ts step-start --ticket <Key> --step brainstorming
```

  `<Key>` is the resolved tracker key. With no tracker key (a `ticket: false` profile and no key evident) the step is skipped silently. A non-zero exit or a warning never blocks the ticket flow (same disposition as Step 1.5's missing transcript).
- adopt: the same `session` call, then `step-start --step <step the adopted work is at>` (`implementation` when a plan exists, else `brainstorming`).
- init Step 0 item 2: before it reports "Already initialized", run the `session` command once so a resumed session (a `/clear` gives a new session id and a new transcript file; `--resume` and `--continue` keep the same id, verified at checkpoint A) is added to the ticket's registry. The `session` subcommand skips the append when the live session id is already registered for this ticket (add this check in `entry.ts` `session`, with a test in `entry.test.ts`: appending the same session twice leaves one line).

- [ ] **Step 1: Add the idempotence test to `entry.test.ts`**, run it, see it fail.
- [ ] **Step 2: Implement the idempotence check in `entry.ts`**; run, see it pass.
- [ ] **Step 3: Edit the three skills** as described. Show each edit's diff to the controller; read each skill file once more after editing and check that no step number is duplicated or skipped and that the Quick Reference table in each skill has a row for the new step.
- [ ] **Step 4: Verify in a scratch checkout.** In a throwaway repo directory with `DIGISMITH_TOKEN_REGISTRY_DIR` set to a temp directory, run the two commands above and check that the registry file has one `session` line and one `step_start` line. No live ticket is started.
- [ ] **Step 5: Commit**

```bash
git add skills/bootstrap/SKILL.md skills/adopt/SKILL.md skills/init/SKILL.md packages/cli/src/tokens/entry.ts packages/cli/src/tokens/entry.test.ts
git commit -m "feat(init): register the ticket session for token counting"
```

---

### Task 9: Step skills mark their boundaries

**Files (skills, Markdown; follow `digismith:writing-skills`):**
- Modify: `skills/brainstorming/SKILL.md` (end: `step-end --step brainstorming`, right before invoking `digismith:writing-plans`)
- Modify: `skills/writing-plans/SKILL.md` (start: `step-start --step writing-plans`; end, before the Execution Handoff: `step-end --step writing-plans`)
- Modify: `skills/executing-plans/SKILL.md` and `skills/subagent-driven-development/SKILL.md` (start: `step-start --step implementation`; end: `step-end --step implementation`)
- Modify: `skills/finishing-a-development-branch/SKILL.md` (start: `step-start --step finishing`; at the end of the integration decision: `step-end --step finishing`)

Each edit is one short block with the command (same `entry.ts` path as Task 8) and the same non-blocking rule: the ticket key comes from the board folder name or from the branch or worktree name. Branches follow `<Key>__<slug>` (Emma's `EMKT-756__slug`), and DigiSmith's own branches and worktrees are lowercase (`dgs-169`, `dgs-223-slug`). Extract it with `^([A-Za-z]+-[0-9]+)(__|-|$)` and uppercase the first group; `dgs-2140` gives `DGS-2140`, never `DGS-214`. With no key, skip silently.

- [ ] **Step 1: Edit the five skills.** Place each block at the exact step named above. Do not change any other wording.
- [ ] **Step 2: Read-through check.** For each file, confirm the block appears once, uses the same flag names as `entry.ts` (`--ticket`, `--step`), and the step name is one of `brainstorming`, `writing-plans`, `implementation`, `finishing`.
- [ ] **Step 3: Verify the chain in a scratch registry.** Run the ten commands in order against a temp `DIGISMITH_TOKEN_REGISTRY_DIR`, once with `--session-id s1` and once with only `CLAUDE_CODE_SESSION_ID=s1` set in the environment, then `dg tokens`-equivalent `entry.ts snapshot --ticket <Key>` over a synthetic transcript whose timestamps fall inside each window. Expected: counts land in the matching steps.
- [ ] **Step 4: Commit**

```bash
git add skills/brainstorming/SKILL.md skills/writing-plans/SKILL.md skills/executing-plans/SKILL.md skills/subagent-driven-development/SKILL.md skills/finishing-a-development-branch/SKILL.md
git commit -m "feat(skills): mark step boundaries for token counting"
```

---

### Task 10: SDD ledger rows and the snapshot at finish

**Files (skills, Markdown; follow `digismith:writing-skills`):**
- Modify: `skills/subagent-driven-development/SKILL.md` (ledger lines; dispatch rule)
- Modify: `skills/finishing-a-development-branch/SKILL.md` (run the snapshot in the four end blocks)
- Modify: `packages/cli/src/tokens/entry.ts` and `entry.test.ts` (carry `tasks` over on `snapshot --write` without `--ledger`)

**Edits:**
- SDD: wherever the skill appends to the ledger after a dispatch, the controller appends `Task <N>: dispatch <role> agent=<agentId>` using the `agentId` the Agent tool result returns (roles: `implementer`, `task-reviewer`, `re-review`, `fix`, `final-reviewer`). When it appends `Task <N>: complete (...)`, it first runs `entry.ts task-tokens --ticket <Key> --task <N> --ledger <workspace>/progress.md` and appends the printed `Task N: tokens ...` line. The final-review dispatch uses task id `final`.
- SDD Finish (found during slice 2: SDD's Finish step deletes the workspace, and with it the ledger, BEFORE `finishing` runs, so `finishing` can never read the ledger): right before the `rm -rf <workspace>` line, run `entry.ts snapshot --ticket <Key> --ledger <workspace>/progress.md --write`. That writes `tokens.json` with the task rows while the ledger still exists. Place it after `digismith:report-implementation` and before the deletion.
- finishing: in each of the four `step-end finishing` blocks (Options 1, 2, 3 and discard), add a second command after the `step-end` line: `entry.ts snapshot --ticket <Key> --write` (no `--ledger`). In DigiSmith's own repo this writes `tokens.json` into the board folder (committing it stays with the finishing flow's own rules). In any other repo it writes to the depot, never into the client repo. To keep the task rows SDD's Finish already wrote, `snapshot --write` without `--ledger` carries the `tasks` section over from an existing `tokens.json` for the same ticket (schema_version 1). A new test in `entry.test.ts` pins this: write a `tokens.json` with a `tasks` entry, run `snapshot --write` with no `--ledger`, expect the `tasks` entry to survive and the steps to be recomputed.

- [ ] **Step 1: Add a test to `entry.test.ts`** for `task-tokens`: a registered session with a `subagents/agent-a111.jsonl` transcript, a ledger with `Task 1: dispatch implementer agent=a111`, expect the output `Task 1: tokens in=<n> out=<n> cr=<n> cw5=<n> cw1=<n>` with the fixture's numbers. Run it, see it fail.
- [ ] **Step 2: Implement `task-tokens` in `entry.ts`**; run, see it pass.
- [ ] **Step 3: Edit the two skills.** Read each once more; check the ledger grammar in SDD matches `parseTaskAgents` exactly (`Task <N>: dispatch <role> agent=<id>`).
- [ ] **Step 4: End-to-end check on a scratch ticket.** In a throwaway directory, run the Task 8 and Task 9 commands, add two dispatch lines to a scratch ledger, run `task-tokens` and `snapshot --write`. Expected: the snapshot has a `tasks` entry, and in a non-DigiSmith directory the file is in the depot, not the working directory.
- [ ] **Step 5: Run the full suite and build.** `pnpm test` and `pnpm --filter @digismith/cli build`. Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add skills/subagent-driven-development/SKILL.md skills/finishing-a-development-branch/SKILL.md packages/cli/src/tokens/entry.ts packages/cli/src/tokens/entry.test.ts
git commit -m "feat(skills): record SDD agent ids and write the token snapshot at finish"
```

---

## Self-review

**Spec coverage.** Counts only (all tasks, Global Constraints). `UsageRecord` and reader (Task 1). Dedupe, cache split, subagents (Task 1). Registry interface and interim default (Task 2). Fallback tagging and transcript lookup (Task 3). Steps, tasks, sessions, unattributed, `tokens.json` schema (Task 4). `dg tokens`, `--json`, `--write`, board-vs-depot path (Task 5). Cross-check, README, review note 4 (Task 6). Writers at init, step skills, SDD, finish (Tasks 7-10). Levels 1 and 2 in phase 1 (Tasks 4, 10); levels 3 and 4, phase 2 readers and the footprint measure are out of this plan (design sections 7, 10). Open items: all resolved in the table above.

**Placeholders.** None. Every code step has code. Skill edits (Tasks 8-10) name the exact command, flags and insertion point; the skill text itself is Markdown prose written at execution time under `digismith:writing-skills`.

**Type consistency.** `UsageRecord`, `Counts`, `Registry`, `RegistryEntry`, `Snapshot`, `Step`, `Role` defined in Task 1 and used unchanged. `countTicket`, `renderTable`, `resolveSnapshotPath` (Task 5) are the ones `entry.ts` (Task 7) calls. `parseTaskAgents` (Task 7) matches the ledger grammar in Task 10. 
**Risks to carry.** (1) The live session id comes from `CLAUDE_CODE_SESSION_ID` (resolved at checkpoint A, see `session-id-source.md`). Remaining risk: the variable is documented but Claude Code may change it; the `--session-id` override and the transcript-exists warning are the safety net, and the fallback tagging still counts a session the registry missed. (2) `iterations` semantics are unverified until Task 6. (3) The depot clone must be on a commit that contains `entry.ts` before the skills call it; the skills run `digismith:depot ensure` already at ticket start, and a plugin bump ships the skills and the depot update together.
