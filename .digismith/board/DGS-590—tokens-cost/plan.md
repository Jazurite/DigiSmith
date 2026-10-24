# DGS-590 Tokens and Cost in Oculus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A 5-min Nexus job writes a token and cost snapshot per run, a burn file and a seat file; Oculus shows Tokens and Cost per run, a per-model card, burn per hour and the seat windows.

**Architecture:** The counting lives in `packages/cli/src/tokens/` (DGS-214 parser, read from a byte offset, per-run state). `dg tokens runs` runs every 5 min as a job of the existing Nexus API scheduler and writes `runs/<folder>/<run>/tokens.json`, `runs/.tokens/burn.json` and `usage-probe/seats.json`. The Oculus views (DGS-599 names) only read these files and apply the freshness rules; the web shows them.

**Tech Stack:** Node 24, TypeScript under `--experimental-strip-types`, yargs, vitest; Nexus API (node:http, zod in `scripts/nexus-shared/`); Nuxt 4 + Storybook + Playwright + axe in `scripts/nexus-web/`. pnpm only.

**Spec:** `.digismith/board/DGS-590—tokens-cost/design.html` (approved 2026-10-24 by the Maestro for Jack, Sign-off Auto, section 15 kept).

## Global Constraints

- No new LaunchAgent. No sudo, no Caddy/DNS/Tailscale change, no settings file change. Never touch or restart the running API (4300).
- No Claude session is started by any job or command in this ticket.
- Privacy: transcripts are read only for the usage fields. Written files, views and pages hold counts, money, ids and file names only: no message text, prompt, tool input or output, terminal title, or folder path.
- Never a false number: no partial cost sum, no value from a stale live file, no window past its reset.
- "-" when a file is missing or older than 15 min (a `final` run snapshot never goes stale; seat readings follow spec section 7).
- Tests use fakes only: `DIGISMITH_DEPOT_DIR` and `DIGISMITH_CLAUDE_PROJECTS_DIR` in temp folders. No real depot, transcripts, herdr, ClickUp or live API.
- Code in `packages/cli/src/` must run under `node --experimental-strip-types`: no parameter properties, enums or namespaces. `.ts` extensions in relative imports.
- Files written by the job go through a temp file and one `renameSync` (atomic).
- Price table version: `ANTHROPIC_PRICES_VERSION = "2026-10-18"`.
- Commits: title only, conventional, no AI attribution. pnpm only; never `pnpm install` in the depot clone.
- Times in text: UTC+7 first, UTC in brackets. File times: ISO UTC.

## Order of work and dependencies

| Task | Depends on | Start |
|---|---|---|
| 1 Price table in the CLI | none | now |
| 2 Reader from an offset | none | now |
| 3 Run counter | 1, 2 | now |
| 4 Seat file | none | now |
| 5 `dg tokens runs`, burn file, scheduler job, README | 3, 4 | now |
| 6 Oculus views and shared schema | 5, **DGS-599 merged** (rebase on `main` first) | after the conductor's word |
| 7 Oculus web: columns, card, top bar | 6 | after 6 |
| 8 DGS-598-shaped run test | 3, **DGS-598 merged** (rebase on `main` first) | after the conductor's word |

Tasks 1–5 work on today's `dg run start` runs: hook events already carry `data.session_id`. They read `run.json` `session_id` when present, so DGS-598 runs work without a code change. Task 0 below is setup, no commit.

**Task 0 (setup, no commit):** in the worktree run `pnpm install --frozen-lockfile` (worktree only, never the depot clone). Baseline: `pnpm exec vitest run packages/cli/src/tokens scripts/token-counter scripts/nexus-api/src/scheduler` passes.

---

### Task 1: The Anthropic price table moves into the CLI, with a version

**Files:**
- Create: `packages/cli/src/tokens/prices/types.ts`
- Create: `packages/cli/src/tokens/prices/anthropic.ts`
- Create: `packages/cli/src/tokens/prices/cost.ts`
- Test: `packages/cli/src/tokens/prices/cost.test.ts`
- Modify: `scripts/token-counter/types.ts` (re-export `TokenUsage`, `PricingEntry`, `LongPromptTier` from the CLI file; keep `CostRecord`)
- Modify: `scripts/token-counter/anthropic-pricing.ts` (re-export the table)
- Modify: `scripts/token-counter/compute.ts` (import `costFromPricing`, `unpricedNotes` from the CLI file; keep `computeTokenCost` and the webhook)
- Modify: `scripts/token-counter/registry.ts` (Anthropic lookup through `resolveAnthropicPrice`)

**Interfaces:**
- Produces:
  - `prices/types.ts`: `TokenUsage`, `PricingEntry`, `LongPromptTier` (same shapes as `scripts/token-counter/types.ts` today, moved with their comments).
  - `prices/anthropic.ts`: `export const ANTHROPIC_PRICES_VERSION = "2026-10-18"`; `export const anthropicPricing: Record<string, PricingEntry>` (the table, moved unchanged with its header comment).
  - `prices/cost.ts`: `costFromPricing(pricing: PricingEntry, usage: TokenUsage): number`; `unpricedNotes(pricing, usage): string[]` (moved unchanged); `resolveAnthropicPrice(model: string): PricingEntry | undefined` (exact key, then one date-suffix strip, never a prefix match).

- [ ] **Step 1: Write the failing test** `packages/cli/src/tokens/prices/cost.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { ANTHROPIC_PRICES_VERSION, anthropicPricing } from "./anthropic.ts";
import { costFromPricing, resolveAnthropicPrice } from "./cost.ts";

const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 1_000_000, cacheWrite5mTokens: 1_000_000, cacheWrite1hTokens: 1_000_000 };

describe("anthropic prices in the CLI", () => {
  it("carries the fetch date as its version", () => {
    expect(ANTHROPIC_PRICES_VERSION).toBe("2026-10-18");
  });
  it("prices every current model id", () => {
    expect(costFromPricing(resolveAnthropicPrice("claude-fable-5-1")!, usage)).toBeCloseTo(10 + 50 + 0.25 + 12.5 + 20, 9);
    expect(costFromPricing(resolveAnthropicPrice("claude-opus-5-5")!, usage)).toBeCloseTo(4 + 20 + 0.2 + 5 + 8, 9);
    expect(costFromPricing(resolveAnthropicPrice("claude-sonnet-5-5")!, usage)).toBeCloseTo(2 + 10 + 0.1 + 2.5 + 4, 9);
  });
  it("uses the Haiku 5.5 long tier per request", () => {
    const short = { inputTokens: 50_000, outputTokens: 0 };
    const long = { inputTokens: 150_000, outputTokens: 0 };
    expect(costFromPricing(resolveAnthropicPrice("claude-haiku-5-5")!, short)).toBeCloseTo(0.005, 9);
    expect(costFromPricing(resolveAnthropicPrice("claude-haiku-5-5")!, long)).toBeCloseTo(0.075, 9);
  });
  it("strips a date suffix once and never matches by prefix", () => {
    expect(resolveAnthropicPrice("claude-haiku-4-5-20251001")).toBe(anthropicPricing["claude-haiku-4-5"]);
    expect(resolveAnthropicPrice("claude-opus-5-9")).toBeUndefined();
    expect(resolveAnthropicPrice("<synthetic>")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm exec vitest run packages/cli/src/tokens/prices/cost.test.ts`
Expected: FAIL, cannot resolve `./anthropic.ts`.

- [ ] **Step 3: Move the code**

`git mv scripts/token-counter/anthropic-pricing.ts packages/cli/src/tokens/prices/anthropic.ts`, change its import to `import type { PricingEntry } from "./types.ts";` and add under the header comment:

```ts
// The fetch date of this table. Bump it with every price change: tokens.json records it.
export const ANTHROPIC_PRICES_VERSION = "2026-10-18";
```

Create `packages/cli/src/tokens/prices/types.ts` by moving `TokenUsage`, `PricingEntry` and `LongPromptTier` (with their doc comments) out of `scripts/token-counter/types.ts`. In `scripts/token-counter/types.ts` replace them with:

```ts
export type { LongPromptTier, PricingEntry, TokenUsage } from "../../packages/cli/src/tokens/prices/types.ts";
import type { TokenUsage } from "../../packages/cli/src/tokens/prices/types.ts";
```

(keep `CostRecord`, which uses `TokenUsage`).

Create `packages/cli/src/tokens/prices/cost.ts`: move `positive`, `promptTokens`, `effectiveRates`, `unpricedNotes`, `costFromPricing` and the two `UNPRICED_*` notes from `scripts/token-counter/compute.ts` (export `UNPRICED_CACHE_READ_NOTE`, `UNPRICED_CACHE_WRITE_NOTE`), plus:

```ts
import { anthropicPricing } from "./anthropic.ts";

// Anthropic ids can carry a date suffix (claude-haiku-4-5-20251001). Strip it once and look
// again. Never match by prefix: claude-opus-5-5 must not fall back to claude-opus-5.
const DATE_SUFFIX = /-\d{8}$/;

export function resolveAnthropicPrice(model: string): PricingEntry | undefined {
  return anthropicPricing[model] ?? anthropicPricing[model.replace(DATE_SUFFIX, "")];
}
```

Create a new `scripts/token-counter/anthropic-pricing.ts`:

```ts
// The table lives in the CLI so the built `dg` can price runs (DGS-590). One table, re-exported here.
export { ANTHROPIC_PRICES_VERSION, anthropicPricing } from "../../packages/cli/src/tokens/prices/anthropic.ts";
```

In `scripts/token-counter/compute.ts` import `costFromPricing`, `unpricedNotes` from `../../packages/cli/src/tokens/prices/cost.ts` and re-export them (`export { costFromPricing, unpricedNotes }`) so its tests and callers keep working. In `registry.ts` the Anthropic branch becomes `if (provider === "anthropic") return resolveAnthropicPrice(model);` before the generic lookup; the `DATE_SUFFIX` constant moves out.

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run packages/cli/src/tokens/prices scripts/token-counter packages/cli/src/strip-types.smoke.test.ts`
Expected: PASS (the existing `scripts/token-counter` tests pass unchanged).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/tokens/prices scripts/token-counter
git commit -m "refactor(dgs-590): move the Anthropic price table into the CLI with a version"
```

---

### Task 2: Read a transcript from a byte offset

**Files:**
- Modify: `packages/cli/src/tokens/claude-code-reader.ts`
- Test: `packages/cli/src/tokens/claude-code-reader.offset.test.ts`

**Interfaces:**
- Produces:
  - `parseUsageLine(raw: string, sessionFallback: string, fileAgentId: string | null, fallbackId: string): UsageRecord | null` (the body of today's loop; `parseFile` uses it with `fallbackId = \`line|${path}|${index}\``, so `readClaudeCodeSession` is unchanged).
  - `export interface FileCursor { offset: number; size: number; ino: number }`
  - `readUsageFrom(path: string, prior: FileCursor | null, sessionFallback: string, fileAgentId: string | null): { records: UsageRecord[]; cursor: FileCursor; restarted: boolean }`. Reads from `prior.offset` in 64 KB chunks to the last `\n`. Starts at 0 (`restarted: true`) when `prior` is null, the inode differs, or the size is below `prior.offset`. A line over 1 MB is skipped. The fallback id is `line|<file base name>|<byte offset of the line>` (no folder path). Records are not deduped here; the caller dedupes.

- [ ] **Step 1: Write the failing test** `claude-code-reader.offset.test.ts`

```ts
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readClaudeCodeSession, readUsageFrom } from "./claude-code-reader.ts";

const line = (id: string, req: string, output: number, model = "claude-opus-5-5", ts = "2026-10-24T08:00:00.000Z") =>
  JSON.stringify({ type: "assistant", timestamp: ts, sessionId: "s1", requestId: req, message: { id, model, content: [{ type: "text", text: "SECRET MESSAGE" }], usage: { input_tokens: 1, output_tokens: output, cache_read_input_tokens: 10, cache_creation_input_tokens: 5, cache_creation: { ephemeral_5m_input_tokens: 3, ephemeral_1h_input_tokens: 2 } } } }) + "\n";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "offset-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("readUsageFrom", () => {
  it("reads only full lines and resumes at the offset", () => {
    const f = join(dir, "s1.jsonl");
    const second = line("m2", "r2", 7);
    writeFileSync(f, line("m1", "r1", 5) + second.slice(0, 20));
    const a = readUsageFrom(f, null, "s1", null);
    expect(a.records.map((r) => r.response_id)).toEqual(["m1|r1"]);
    expect(a.restarted).toBe(true);
    appendFileSync(f, second.slice(20) + line("m2", "r2", 9));
    const b = readUsageFrom(f, a.cursor, "s1", null);
    expect(b.restarted).toBe(false);
    expect(b.records.map((r) => [r.response_id, r.output])).toEqual([["m2|r2", 7], ["m2|r2", 9]]);
  });
  it("starts again from 0 when the file shrank or was replaced", () => {
    const f = join(dir, "s1.jsonl");
    writeFileSync(f, line("m1", "r1", 5) + line("m2", "r2", 6));
    const a = readUsageFrom(f, null, "s1", null);
    writeFileSync(f, line("m3", "r3", 1));
    const b = readUsageFrom(f, a.cursor, "s1", null);
    expect(b.restarted).toBe(true);
    expect(b.records.map((r) => r.response_id)).toEqual(["m3|r3"]);
  });
  it("skips a line over 1 MB and keeps going", () => {
    const f = join(dir, "s1.jsonl");
    writeFileSync(f, "x".repeat(1_100_000) + "\n" + line("m1", "r1", 5));
    expect(readUsageFrom(f, null, "s1", null).records).toHaveLength(1);
  });
  it("gives the same records as the whole-file reader, in several appends", () => {
    const f = join(dir, "s1.jsonl");
    const all = [line("m1", "r1", 5), line("m1", "r1", 8), line("m2", "r2", 3, "claude-haiku-5-5"), JSON.stringify({ type: "user" }) + "\n"].join("");
    let cursor = null;
    const seen = new Map<string, number>();
    for (let cut = 0; cut < all.length; cut += 97) {
      appendFileSync(f, all.slice(cut, cut + 97));
      const r = readUsageFrom(f, cursor, "s1", null);
      cursor = r.cursor;
      for (const rec of r.records) seen.set(rec.response_id, Math.max(seen.get(rec.response_id) ?? 0, rec.output));
    }
    const whole = readClaudeCodeSession(f);
    expect([...seen.entries()].sort()).toEqual(whole.map((r) => [r.response_id, r.output] as [string, number]).sort());
  });
  it("keeps no message text in a record", () => {
    const f = join(dir, "s1.jsonl");
    writeFileSync(f, line("m1", "r1", 5));
    expect(JSON.stringify(readUsageFrom(f, null, "s1", null))).not.toContain("SECRET");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm exec vitest run packages/cli/src/tokens/claude-code-reader.offset.test.ts`
Expected: FAIL, `readUsageFrom` is not exported.

- [ ] **Step 3: Implement**

In `claude-code-reader.ts`, extract the loop body of `parseFile` into `parseUsageLine` (returns the `UsageRecord` or `null`; `response_id` falls back to the given `fallbackId`). `parseFile` becomes:

```ts
function parseFile(path: string, sessionFallback: string, into: Map<string, UsageRecord>, fileAgentId: string | null = null): void {
  const lines = readFileSync(path, "utf-8").split("\n");
  for (let index = 0; index < lines.length; index++) {
    const record = lines[index] ? parseUsageLine(lines[index], sessionFallback, fileAgentId, `line|${path}|${index}`) : null;
    if (!record) continue;
    const prior = into.get(record.response_id);
    if (!prior || record.output >= prior.output) into.set(record.response_id, record);
  }
}
```

Add (imports: `closeSync`, `openSync`, `readSync`, `statSync` from `node:fs`):

```ts
export interface FileCursor { offset: number; size: number; ino: number }

const CHUNK = 64 * 1024;
const MAX_LINE = 1024 * 1024;

// Reads the full lines after the cursor. A half-written last line waits for the next call.
export function readUsageFrom(path: string, prior: FileCursor | null, sessionFallback: string, fileAgentId: string | null): { records: UsageRecord[]; cursor: FileCursor; restarted: boolean } {
  const st = statSync(path);
  const restarted = prior === null || prior.ino !== st.ino || st.size < prior.offset;
  let offset = restarted || prior === null ? 0 : prior.offset;
  const name = basename(path);
  const records: UsageRecord[] = [];
  const fd = openSync(path, "r");
  try {
    let pending: Buffer[] = [];
    let pendingLen = 0;
    let lineStart = offset;
    let skipping = false;
    const buf = Buffer.alloc(CHUNK);
    let pos = offset;
    for (;;) {
      const n = readSync(fd, buf, 0, CHUNK, pos);
      if (n === 0) break;
      let from = 0;
      for (let i = 0; i < n; i++) {
        if (buf[i] !== 0x0a) continue;
        if (!skipping) {
          const raw = Buffer.concat([...pending, buf.subarray(from, i)]).toString("utf-8");
          const r = raw ? parseUsageLine(raw, sessionFallback, fileAgentId, `line|${name}|${lineStart}`) : null;
          if (r) records.push(r);
        }
        pending = []; pendingLen = 0; skipping = false;
        from = i + 1;
        lineStart = pos + i + 1;
        offset = lineStart;
      }
      if (!skipping && from < n) {
        pending.push(Buffer.from(buf.subarray(from, n)));
        pendingLen += n - from;
        if (pendingLen > MAX_LINE) { skipping = true; pending = []; pendingLen = 0; }
      }
      pos += n;
    }
  } finally {
    closeSync(fd);
  }
  return { records, cursor: { offset, size: st.size, ino: st.ino }, restarted };
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run packages/cli/src/tokens packages/cli/src/strip-types.smoke.test.ts`
Expected: PASS (old reader tests unchanged).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/tokens/claude-code-reader.ts packages/cli/src/tokens/claude-code-reader.offset.test.ts
git commit -m "feat(dgs-590): read a transcript from a byte offset"
```

---

### Task 3: Count one run (state, cost, buckets, tokens.json)

**Files:**
- Create: `packages/cli/src/tokens/run-count.ts`
- Create: `packages/cli/src/tokens/run-types.ts`
- Test: `packages/cli/src/tokens/run-count.test.ts`
- Create: `packages/cli/src/tokens/fixtures.test-util.ts` (fixture transcript writer and fake run writer, shared with Tasks 5 and 8)

**Interfaces:**
- Consumes: `readUsageFrom`, `FileCursor` (Task 2); `resolveAnthropicPrice`, `costFromPricing`, `ANTHROPIC_PRICES_VERSION` (Task 1); `readRun`, `RunRecord` (`run/record.ts`); `readEvents` (`run/events.ts`); `summarize` (`run/read.ts`); `claudeProjectsDir` (`tokens/attribution.ts`).
- Produces (`run-types.ts`):

```ts
export const RUN_TOKENS_SCHEMA = "oculus-tokens/v1";
export const RUN_TOKENS_STATE_SCHEMA = "oculus-tokens-state/v1";
export interface ModelTotals { input: number; output: number; cache_read: number; cache_write_5m: number; cache_write_1h: number; responses: number; tokens: number; cost_usd: number | null }
export interface Bucket { start: string; tokens: number; cost_usd: number | null }
export interface RunTokens {
  schema: typeof RUN_TOKENS_SCHEMA; run: string; generated_at: string; final: boolean;
  price_table: { source: "anthropic"; version: string };
  models: Record<string, ModelTotals>;
  total: { tokens: number; responses: number; cost_usd: number | null };
  unpriced_models: string[]; sessions: number; buckets: Bucket[];
}
export interface Counted { model: string; ts: string; output: number; tokens: number; input: number; cache_read: number; cache_write_5m: number; cache_write_1h: number; cost_usd: number | null }
export interface RunTokensState { schema: typeof RUN_TOKENS_STATE_SCHEMA; run: string; files: Record<string, FileCursor>; responses: Record<string, Counted> }
```

- Produces (`run-count.ts`):
  - `sessionsOfRun(record: RunRecord & { session_id?: string | null }, events: EventLine[]): string[]` — `record.session_id` when a string, then each `started` event's `data.session_id` string, unique, in order.
  - `transcriptIndex(root: string): Map<string, string>` — session id → main transcript path, from one `readdirSync` per project folder.
  - `countRun(runDir: string, opts: { now: Date; index: Map<string, string> }): RunTokens | null` — reads `tokens.state.json` (missing or bad → empty state), reads each file of each session from its cursor, keeps responses with `ts >= created_at`, dedupes by response id (higher `output` wins, ties replace), recomputes totals, writes `tokens.json` and `tokens.state.json` atomically, returns the snapshot. `null` (and no file) when the run has no session id.
  - `bucketStart(ts: string): string` — the 5-min UTC bucket (`YYYY-MM-DDTHH:MM:00.000Z`).
  - `writeJsonAtomic(path: string, value: unknown): void` (temp name `.<base>.<pid>.tmp`, then `renameSync`).
- State file keys: `files` key = `<session>/main` or `<session>/agent-<id>.jsonl`; no folder path anywhere in either file.

- [ ] **Step 1: Write the fixture helper** `fixtures.test-util.ts`

```ts
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";

export interface FakeResponse { id: string; req: string; model?: string; ts: string; input?: number; output?: number; cache_read?: number; w5m?: number; w1h?: number }

export function responseLine(sessionId: string, r: FakeResponse): string {
  return JSON.stringify({
    type: "assistant", timestamp: r.ts, sessionId, requestId: r.req, cwd: "/Users/fake/Workspace/SECRET-PATH",
    message: { id: r.id, model: r.model ?? "claude-opus-5-5", content: [{ type: "text", text: "SECRET MESSAGE TEXT" }],
      usage: { input_tokens: r.input ?? 0, output_tokens: r.output ?? 0, cache_read_input_tokens: r.cache_read ?? 0,
        cache_creation_input_tokens: (r.w5m ?? 0) + (r.w1h ?? 0), cache_creation: { ephemeral_5m_input_tokens: r.w5m ?? 0, ephemeral_1h_input_tokens: r.w1h ?? 0 } } },
  }) + "\n";
}

export function writeTranscript(projects: string, sessionId: string, responses: FakeResponse[], append = false): string {
  const dir = join(projects, "-Users-fake-Workspace-SECRET-PATH");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${sessionId}.jsonl`);
  const text = responses.map((r) => responseLine(sessionId, r)).join("");
  if (append) appendFileSync(file, text); else writeFileSync(file, text);
  return file;
}

export function writeSubagent(projects: string, sessionId: string, agentId: string, responses: FakeResponse[]): void {
  const dir = join(projects, "-Users-fake-Workspace-SECRET-PATH", sessionId, "subagents");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `agent-${agentId}.jsonl`), responses.map((r) => responseLine(sessionId, r)).join(""));
}

export function writeRun(depot: string, folder: string, run: string, opts: { created: string; sessionId?: string | null; started?: { ts: string; session: string }[]; ended?: string }): string {
  const dir = join(depot, "runs", folder, run);
  mkdirSync(dir, { recursive: true });
  const record: Record<string, unknown> = { schema: "nightwatch-run/v1", run, ticket: folder, role: "builder", order: null, seat: null, model: null, plugin_version: null, base_sha: null, branch: null, worktree: null, herdr: { workspace: null, tab: null, pane: null }, budget: null, created_at: opts.created };
  if (opts.sessionId !== undefined) record.session_id = opts.sessionId;
  writeFileSync(join(dir, "run.json"), JSON.stringify(record));
  let seq = 0;
  const lines = (opts.started ?? []).map((s) => JSON.stringify({ schema: "nightwatch-event/v1", seq: ++seq, ts: s.ts, run, type: "started", data: { source: "startup", session_id: s.session } }));
  if (opts.ended) lines.push(JSON.stringify({ schema: "nightwatch-event/v1", seq: ++seq, ts: opts.ended, run, type: "ended", data: { reason: "exit" } }));
  writeFileSync(join(dir, "events.jsonl"), lines.map((l) => l + "\n").join(""));
  return dir;
}
```

- [ ] **Step 2: Write the failing tests** `run-count.test.ts`

```ts
import { mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bucketStart, countRun, sessionsOfRun, transcriptIndex } from "./run-count.ts";
import { writeRun, writeSubagent, writeTranscript } from "./fixtures.test-util.ts";

let depot: string, projects: string;
const now = new Date("2026-10-24T09:00:00.000Z");
beforeEach(() => { depot = mkdtempSync(join(tmpdir(), "rc-depot-")); projects = mkdtempSync(join(tmpdir(), "rc-proj-")); });
afterEach(() => { rmSync(depot, { recursive: true, force: true }); rmSync(projects, { recursive: true, force: true }); });

const run = (dir: string) => countRun(dir, { now, index: transcriptIndex(projects) });

describe("sessionsOfRun", () => {
  it("takes run.json session_id, then started events, unique", () => {
    const events = [
      { schema: "x", seq: 1, ts: "t", run: "r", type: "started", data: { session_id: "a" } },
      { schema: "x", seq: 2, ts: "t", run: "r", type: "tool", data: { session_id: "z" } },
      { schema: "x", seq: 3, ts: "t", run: "r", type: "started", data: { session_id: "b" } },
    ];
    expect(sessionsOfRun({ session_id: "a" } as never, events)).toEqual(["a", "b"]);
    expect(sessionsOfRun({} as never, [])).toEqual([]);
  });
});

describe("countRun", () => {
  it("counts five classes per model with cost and the price version", () => {
    writeTranscript(projects, "s1", [
      { id: "m1", req: "r1", ts: "2026-10-24T08:10:00.000Z", input: 1_000_000, output: 1_000_000, cache_read: 1_000_000, w5m: 1_000_000, w1h: 1_000_000 },
    ]);
    const dir = writeRun(depot, "DGS-1", "builder-1", { created: "2026-10-24T08:00:00.000Z", started: [{ ts: "2026-10-24T08:00:01.000Z", session: "s1" }] });
    const t = run(dir)!;
    expect(t.models["claude-opus-5-5"]).toMatchObject({ input: 1_000_000, output: 1_000_000, cache_read: 1_000_000, cache_write_5m: 1_000_000, cache_write_1h: 1_000_000, responses: 1, tokens: 5_000_000 });
    expect(t.models["claude-opus-5-5"].cost_usd).toBeCloseTo(4 + 20 + 0.2 + 5 + 8, 9);
    expect(t.total).toMatchObject({ tokens: 5_000_000, responses: 1 });
    expect(t.price_table).toEqual({ source: "anthropic", version: "2026-10-18" });
    expect(JSON.parse(readFileSync(join(dir, "tokens.json"), "utf8")).schema).toBe("oculus-tokens/v1");
  });
  it("leaves out responses before created_at, dedupes a replay and a grown stream, reads subagents", () => {
    writeTranscript(projects, "s1", [
      { id: "old", req: "r0", ts: "2026-10-24T07:00:00.000Z", output: 999 },
      { id: "m1", req: "r1", ts: "2026-10-24T08:10:00.000Z", output: 5 },
      { id: "m1", req: "r1", ts: "2026-10-24T08:10:00.000Z", output: 8 },
    ]);
    writeTranscript(projects, "s2", [{ id: "m1", req: "r1", ts: "2026-10-24T08:10:00.000Z", output: 8 }, { id: "m2", req: "r2", ts: "2026-10-24T08:20:00.000Z", output: 2 }]);
    writeSubagent(projects, "s1", "ag1", [{ id: "m3", req: "r3", ts: "2026-10-24T08:30:00.000Z", output: 4, model: "claude-haiku-5-5" }]);
    const dir = writeRun(depot, "DGS-1", "builder-1", { created: "2026-10-24T08:00:00.000Z", started: [{ ts: "2026-10-24T08:00:01.000Z", session: "s1" }, { ts: "2026-10-24T08:15:00.000Z", session: "s2" }] });
    const t = run(dir)!;
    expect(t.total.responses).toBe(3);
    expect(t.models["claude-opus-5-5"].output).toBe(10);
    expect(t.models["claude-haiku-5-5"].output).toBe(4);
    expect(t.sessions).toBe(2);
  });
  it("counts incrementally to the same totals as a fresh count", () => {
    writeTranscript(projects, "s1", [{ id: "m1", req: "r1", ts: "2026-10-24T08:10:00.000Z", output: 5 }]);
    const dir = writeRun(depot, "DGS-1", "builder-1", { created: "2026-10-24T08:00:00.000Z", started: [{ ts: "2026-10-24T08:00:01.000Z", session: "s1" }] });
    run(dir);
    writeTranscript(projects, "s1", [{ id: "m1", req: "r1", ts: "2026-10-24T08:10:00.000Z", output: 9 }, { id: "m2", req: "r2", ts: "2026-10-24T08:40:00.000Z", output: 3 }], true);
    const incremental = run(dir)!;
    unlinkSync(join(dir, "tokens.state.json"));
    const fresh = run(dir)!;
    expect(incremental.models).toEqual(fresh.models);
    expect(incremental.total).toEqual(fresh.total);
  });
  it("gives null cost for an unpriced model and names it", () => {
    writeTranscript(projects, "s1", [{ id: "m1", req: "r1", ts: "2026-10-24T08:10:00.000Z", output: 5, model: "claude-mystery-9" }, { id: "m2", req: "r2", ts: "2026-10-24T08:11:00.000Z", output: 5 }]);
    const dir = writeRun(depot, "DGS-1", "builder-1", { created: "2026-10-24T08:00:00.000Z", started: [{ ts: "2026-10-24T08:00:01.000Z", session: "s1" }] });
    const t = run(dir)!;
    expect(t.models["claude-mystery-9"].cost_usd).toBeNull();
    expect(t.total.cost_usd).toBeNull();
    expect(t.unpriced_models).toEqual(["claude-mystery-9"]);
  });
  it("writes 5-min buckets of the last 24 hours", () => {
    expect(bucketStart("2026-10-24T08:14:59.999Z")).toBe("2026-10-24T08:10:00.000Z");
    writeTranscript(projects, "s1", [
      { id: "m0", req: "r0", ts: "2026-10-23T08:00:00.000Z", output: 1 },
      { id: "m1", req: "r1", ts: "2026-10-24T08:11:00.000Z", output: 2 },
      { id: "m2", req: "r2", ts: "2026-10-24T08:14:00.000Z", output: 3 },
    ]);
    const dir = writeRun(depot, "DGS-1", "builder-1", { created: "2026-10-23T07:00:00.000Z", started: [{ ts: "2026-10-23T07:00:01.000Z", session: "s1" }] });
    expect(run(dir)!.buckets.map((b) => [b.start, b.tokens])).toEqual([["2026-10-24T08:10:00.000Z", 5]]);
  });
  it("marks the snapshot final once the run has ended", () => {
    writeTranscript(projects, "s1", [{ id: "m1", req: "r1", ts: "2026-10-24T08:10:00.000Z", output: 5 }]);
    const dir = writeRun(depot, "DGS-1", "builder-1", { created: "2026-10-24T08:00:00.000Z", started: [{ ts: "2026-10-24T08:00:01.000Z", session: "s1" }], ended: "2026-10-24T08:50:00.000Z" });
    expect(run(dir)!.final).toBe(true);
  });
  it("writes nothing for a run with no session id, and retries a session with no file yet", () => {
    const none = writeRun(depot, "DGS-1", "builder-1", { created: "2026-10-24T08:00:00.000Z" });
    expect(run(none)).toBeNull();
    expect(readdirSync(none)).not.toContain("tokens.json");
    const later = writeRun(depot, "DGS-1", "builder-2", { created: "2026-10-24T08:00:00.000Z", started: [{ ts: "2026-10-24T08:00:01.000Z", session: "s9" }] });
    expect(run(later)!.total.responses).toBe(0);
  });
  it("writes no message text and no folder path", () => {
    writeTranscript(projects, "s1", [{ id: "m1", req: "r1", ts: "2026-10-24T08:10:00.000Z", output: 5 }]);
    const dir = writeRun(depot, "DGS-1", "builder-1", { created: "2026-10-24T08:00:00.000Z", started: [{ ts: "2026-10-24T08:00:01.000Z", session: "s1" }] });
    run(dir);
    for (const f of ["tokens.json", "tokens.state.json"]) {
      const text = readFileSync(join(dir, f), "utf8");
      expect(text).not.toContain("SECRET");
      expect(text).not.toContain(projects);
    }
  });
  it("counts again from 0 when the state file is broken", () => {
    writeTranscript(projects, "s1", [{ id: "m1", req: "r1", ts: "2026-10-24T08:10:00.000Z", output: 5 }]);
    const dir = writeRun(depot, "DGS-1", "builder-1", { created: "2026-10-24T08:00:00.000Z", started: [{ ts: "2026-10-24T08:00:01.000Z", session: "s1" }] });
    run(dir);
    writeFileSync(join(dir, "tokens.state.json"), "{broken");
    expect(run(dir)!.total.responses).toBe(1);
  });
});
```

- [ ] **Step 3: Run them and see them fail**

Run: `pnpm exec vitest run packages/cli/src/tokens/run-count.test.ts`
Expected: FAIL, `./run-count.ts` not found.

- [ ] **Step 4: Implement** `run-types.ts` (the types in Interfaces, importing `FileCursor` from `./claude-code-reader.ts`) and `run-count.ts`:

```ts
import { existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { readEvents, type EventLine } from "../run/events.ts";
import { summarize } from "../run/read.ts";
import { readRun, type RunRecord } from "../run/record.ts";
import { readUsageFrom } from "./claude-code-reader.ts";
import { ANTHROPIC_PRICES_VERSION } from "./prices/anthropic.ts";
import { costFromPricing, resolveAnthropicPrice } from "./prices/cost.ts";
import { RUN_TOKENS_SCHEMA, RUN_TOKENS_STATE_SCHEMA, type Bucket, type Counted, type ModelTotals, type RunTokens, type RunTokensState } from "./run-types.ts";
import type { UsageRecord } from "./types.ts";

const BUCKET_MS = 5 * 60_000;
const KEEP_MS = 24 * 3600_000;

export function writeJsonAtomic(path: string, value: unknown): void {
  const tmp = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`);
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, path);
}

export function bucketStart(ts: string): string {
  const t = Date.parse(ts);
  return new Date(t - (t % BUCKET_MS)).toISOString();
}

// The sessions of a run: run.json session_id (DGS-598), then every started event's session_id (DGS-581 hooks).
export function sessionsOfRun(record: RunRecord & { session_id?: string | null }, events: EventLine[]): string[] {
  const out: string[] = [];
  if (typeof record.session_id === "string" && record.session_id) out.push(record.session_id);
  for (const e of events) {
    const sid = e.type === "started" ? e.data?.session_id : undefined;
    if (typeof sid === "string" && sid && !out.includes(sid)) out.push(sid);
  }
  return out;
}

export function transcriptIndex(root: string): Map<string, string> {
  const index = new Map<string, string>();
  let dirs: string[] = [];
  try { dirs = readdirSync(root); } catch { return index; }
  for (const d of dirs) {
    let names: string[] = [];
    try { names = readdirSync(join(root, d)); } catch { continue; }
    for (const n of names) if (n.endsWith(".jsonl") && !index.has(n.slice(0, -6))) index.set(n.slice(0, -6), join(root, d, n));
  }
  return index;
}

function readState(path: string, run: string): RunTokensState {
  try {
    const s = JSON.parse(readFileSync(path, "utf8")) as RunTokensState;
    if (s.schema === RUN_TOKENS_STATE_SCHEMA && s.run === run && s.files && s.responses) return s;
  } catch { /* missing or broken: count again from 0 */ }
  return { schema: RUN_TOKENS_STATE_SCHEMA, run, files: {}, responses: {} };
}

function filesOf(sid: string, main: string): { key: string; path: string; agent: string | null }[] {
  const out = [{ key: `${sid}/main`, path: main, agent: null as string | null }];
  const sub = join(dirname(main), sid, "subagents");
  if (existsSync(sub)) {
    for (const n of readdirSync(sub)) if (n.startsWith("agent-") && n.endsWith(".jsonl")) out.push({ key: `${sid}/${n}`, path: join(sub, n), agent: n.slice(6, -6) });
  }
  return out;
}

function countedOf(r: UsageRecord): Counted {
  const pricing = resolveAnthropicPrice(r.model);
  const cost = pricing ? costFromPricing(pricing, { inputTokens: r.input, outputTokens: r.output, cacheReadTokens: r.cache_read, cacheWrite5mTokens: r.cache_write_5m, cacheWrite1hTokens: r.cache_write_1h }) : null;
  return { model: r.model, ts: r.ts, output: r.output, input: r.input, cache_read: r.cache_read, cache_write_5m: r.cache_write_5m, cache_write_1h: r.cache_write_1h, tokens: r.input + r.output + r.cache_read + r.cache_write_5m + r.cache_write_1h, cost_usd: cost };
}

const addCost = (a: number | null, b: number | null): number | null => (a === null || b === null ? null : a + b);

function totalsOf(responses: Record<string, Counted>, nowMs: number): Pick<RunTokens, "models" | "total" | "unpriced_models" | "buckets"> {
  const models: Record<string, ModelTotals> = {};
  const buckets = new Map<string, Bucket>();
  for (const c of Object.values(responses)) {
    const m = (models[c.model] ??= { input: 0, output: 0, cache_read: 0, cache_write_5m: 0, cache_write_1h: 0, responses: 0, tokens: 0, cost_usd: 0 });
    m.input += c.input; m.output += c.output; m.cache_read += c.cache_read; m.cache_write_5m += c.cache_write_5m; m.cache_write_1h += c.cache_write_1h;
    m.responses += 1; m.tokens += c.tokens; m.cost_usd = addCost(m.cost_usd, c.cost_usd);
    const t = Date.parse(c.ts);
    if (Number.isFinite(t) && t >= nowMs - KEEP_MS) {
      const start = bucketStart(c.ts);
      const b = buckets.get(start) ?? { start, tokens: 0, cost_usd: 0 };
      b.tokens += c.tokens; b.cost_usd = addCost(b.cost_usd, c.cost_usd);
      buckets.set(start, b);
    }
  }
  const all = Object.values(models);
  const unpriced = Object.entries(models).filter(([, m]) => m.cost_usd === null).map(([k]) => k).sort();
  return {
    models,
    total: { tokens: all.reduce((s, m) => s + m.tokens, 0), responses: all.reduce((s, m) => s + m.responses, 0), cost_usd: unpriced.length > 0 ? null : all.reduce((s, m) => s + (m.cost_usd ?? 0), 0) },
    unpriced_models: unpriced,
    buckets: [...buckets.values()].sort((a, b) => a.start.localeCompare(b.start)),
  };
}

export function countRun(runDir: string, opts: { now: Date; index: Map<string, string> }): RunTokens | null {
  const record = readRun(runDir) as RunRecord & { session_id?: string | null };
  const events = readEvents(runDir) as EventLine[];
  const sessions = sessionsOfRun(record, events);
  if (sessions.length === 0) return null;
  const statePath = join(runDir, "tokens.state.json");
  const state = readState(statePath, record.run);
  const created = Date.parse(record.created_at);
  for (const sid of sessions) {
    const main = opts.index.get(sid);
    if (!main) continue; // no file yet: the next pass tries again
    for (const f of filesOf(sid, main)) {
      let read;
      try { read = readUsageFrom(f.path, state.files[f.key] ?? null, sid, f.agent); } catch { continue; }
      state.files[f.key] = read.cursor;
      for (const r of read.records) {
        const t = Date.parse(r.ts);
        if (!Number.isFinite(t) || t < created) continue;
        const prior = state.responses[r.response_id];
        if (prior && r.output < prior.output) continue;
        state.responses[r.response_id] = countedOf(r);
      }
    }
  }
  const snapshot: RunTokens = {
    schema: RUN_TOKENS_SCHEMA, run: record.run, generated_at: opts.now.toISOString(),
    final: summarize(events).ended,
    price_table: { source: "anthropic", version: ANTHROPIC_PRICES_VERSION },
    sessions: sessions.length,
    ...totalsOf(state.responses, opts.now.getTime()),
  };
  writeJsonAtomic(statePath, state);
  writeJsonAtomic(join(runDir, "tokens.json"), snapshot);
  return snapshot;
}
```

The fallback response id from Task 2 holds only the file base name, so the state file holds no folder path. `statSync` and `existsSync` imports stay only if used; remove unused ones.

- [ ] **Step 5: Run the tests**

Run: `pnpm exec vitest run packages/cli/src/tokens packages/cli/src/strip-types.smoke.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/tokens/run-count.ts packages/cli/src/tokens/run-types.ts packages/cli/src/tokens/run-count.test.ts packages/cli/src/tokens/fixtures.test-util.ts
git commit -m "feat(dgs-590): count a run's tokens and cost into tokens.json"
```

---

### Task 4: The seat file from the probe readings

**Files:**
- Create: `packages/cli/src/tokens/seats.ts`
- Test: `packages/cli/src/tokens/seats.test.ts`

**Interfaces:**
- Consumes: `depotDir` (`run/paths.ts`), `writeJsonAtomic` (Task 3).
- Produces:

```ts
export const SEATS_SCHEMA = "oculus-seats/v1";
export interface SeatWindow { used_pct: number; resets_at: string }
export interface SeatReading { seat: string; read_at: string; five_hour: SeatWindow | null; weekly: SeatWindow | null }
export interface SeatsFile { schema: typeof SEATS_SCHEMA; generated_at: string; seats: SeatReading[] }
export function readProbeSeats(probeDir: string): SeatReading[];          // sorted by seat
export function writeSeats(probeDir: string, now: Date): SeatsFile;       // writes <probeDir>/seats.json
export function probeDir(env?: NodeJS.ProcessEnv): string;                // <depot>/usage-probe
```

- [ ] **Step 1: Write the failing test** `seats.test.ts`

```ts
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readProbeSeats, writeSeats } from "./seats.ts";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "seats-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const probe = { at: 1792829385, rate_limits: { five_hour: { used_percentage: 7, resets_at: 1792844400 }, seven_day: { used_percentage: 32, resets_at: 1793163600 } }, claude_version: "2.1.310", token: "MUST-NOT-COPY" };

describe("seats", () => {
  it("reads out-<seat>.json, skips out.json and unsafe names, drops extra fields", () => {
    writeFileSync(join(dir, "out-jack.json"), JSON.stringify(probe));
    writeFileSync(join(dir, "out-emma.json"), JSON.stringify({ at: 1792829000, rate_limits: null }));
    writeFileSync(join(dir, "out.json"), JSON.stringify(probe));
    writeFileSync(join(dir, "out-..json"), JSON.stringify(probe));
    writeFileSync(join(dir, "out-bad.json"), "{nope");
    expect(readProbeSeats(dir)).toEqual([
      { seat: "emma", read_at: new Date(1792829000_000).toISOString(), five_hour: null, weekly: null },
      { seat: "jack", read_at: new Date(1792829385_000).toISOString(), five_hour: { used_pct: 7, resets_at: new Date(1792844400_000).toISOString() }, weekly: { used_pct: 32, resets_at: new Date(1793163600_000).toISOString() } },
    ]);
  });
  it("writes seats.json atomically with no token or version", () => {
    writeFileSync(join(dir, "out-jack.json"), JSON.stringify(probe));
    const f = writeSeats(dir, new Date("2026-10-24T09:00:00.000Z"));
    const text = readFileSync(join(dir, "seats.json"), "utf8");
    expect(JSON.parse(text)).toEqual(f);
    expect(f.schema).toBe("oculus-seats/v1");
    expect(text).not.toContain("MUST-NOT-COPY");
    expect(text).not.toContain("claude_version");
  });
  it("gives a window null when its numbers are not valid", () => {
    writeFileSync(join(dir, "out-dev0.json"), JSON.stringify({ at: 1792829385, rate_limits: { five_hour: { used_percentage: "7", resets_at: 1 }, seven_day: { used_percentage: 120, resets_at: 1793163600 } } }));
    expect(readProbeSeats(dir)[0]).toMatchObject({ five_hour: null, weekly: null });
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm exec vitest run packages/cli/src/tokens/seats.test.ts`
Expected: FAIL, `./seats.ts` not found.

- [ ] **Step 3: Implement** `seats.ts`

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { depotDir, isSafe } from "../run/paths.ts";
import { writeJsonAtomic } from "./run-count.ts";

export const SEATS_SCHEMA = "oculus-seats/v1";
export interface SeatWindow { used_pct: number; resets_at: string }
export interface SeatReading { seat: string; read_at: string; five_hour: SeatWindow | null; weekly: SeatWindow | null }
export interface SeatsFile { schema: typeof SEATS_SCHEMA; generated_at: string; seats: SeatReading[] }

const OUT = /^out-(.+)\.json$/;

export function probeDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(depotDir(env), "usage-probe");
}

const secs = (v: unknown): string | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? new Date(v * 1000).toISOString() : null);

function windowOf(v: unknown): SeatWindow | null {
  if (typeof v !== "object" || v === null) return null;
  const w = v as Record<string, unknown>;
  const pct = w.used_percentage;
  const at = secs(w.resets_at);
  if (typeof pct !== "number" || !Number.isFinite(pct) || pct < 0 || pct > 100 || at === null) return null;
  return { used_pct: pct, resets_at: at };
}

// Only the seat name, the reading time and the two windows are copied. Nothing else leaves the probe file.
export function readProbeSeats(dir: string): SeatReading[] {
  let names: string[] = [];
  try { names = readdirSync(dir); } catch { return []; }
  const out: SeatReading[] = [];
  for (const n of names) {
    const seat = OUT.exec(n)?.[1];
    if (!seat || !isSafe(seat) || seat.startsWith(".")) continue;
    let raw: Record<string, unknown>;
    try { raw = JSON.parse(readFileSync(join(dir, n), "utf8")) as Record<string, unknown>; } catch { continue; }
    const readAt = secs(raw?.at);
    if (readAt === null) continue;
    const rl = (typeof raw.rate_limits === "object" && raw.rate_limits !== null ? raw.rate_limits : {}) as Record<string, unknown>;
    out.push({ seat, read_at: readAt, five_hour: windowOf(rl.five_hour), weekly: windowOf(rl.seven_day) });
  }
  return out.sort((a, b) => a.seat.localeCompare(b.seat));
}

export function writeSeats(dir: string, now: Date): SeatsFile {
  const file: SeatsFile = { schema: SEATS_SCHEMA, generated_at: now.toISOString(), seats: readProbeSeats(dir) };
  writeJsonAtomic(join(dir, "seats.json"), file);
  return file;
}
```

Note: `isSafe` (`^[A-Za-z0-9][A-Za-z0-9._-]*$`) already refuses `.`; the `startsWith` check is a second guard for readability. `out-..json` yields seat `.` and is skipped.

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run packages/cli/src/tokens/seats.test.ts packages/cli/src/strip-types.smoke.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/tokens/seats.ts packages/cli/src/tokens/seats.test.ts
git commit -m "feat(dgs-590): write the seat windows file from the probe readings"
```

---

### Task 5: `dg tokens runs`, the burn file, the scheduler job, the README

**Files:**
- Create: `packages/cli/src/tokens/runs.ts`
- Test: `packages/cli/src/tokens/runs.test.ts`
- Modify: `packages/cli/src/tokens/index.ts` (the `runs` word, `--run`, `--dry-run`)
- Modify: `packages/cli/src/tokens/README.md` (section "Run snapshots (DGS-590)")
- Modify: `packages/cli/src/run/README.md` (one line: `tokens.json` and `tokens.state.json` may sit beside `run.json`; `runs/.tokens/` holds the burn file)
- Modify: `scripts/nexus-api/src/scheduler/registry.ts` (job `oculus-tokens`)
- Modify: `scripts/nexus-api/src/scheduler/registry.test.ts`
- Modify: `packages/cli/src/strip-types.smoke.test.ts` (a `dg tokens runs --dry-run` run on an empty temp depot)

**Interfaces:**
- Consumes: `countRun`, `transcriptIndex`, `writeJsonAtomic` (Task 3), `writeSeats`, `probeDir` (Task 4), `RunTokens` (Task 3), `runsDir` (`run/paths.ts`), `claudeProjectsDir` (`tokens/attribution.ts`).
- Produces:

```ts
export const BURN_SCHEMA = "oculus-burn/v1";
export interface BurnFile { schema: typeof BURN_SCHEMA; generated_at: string; window_min: 60; tokens: number; cost_usd: number | null; runs: number; unpriced_models: string[] }
export interface RunsPassResult { updated: number; skipped: number; failed: number; burn: BurnFile; seats: number }
export function runsInScope(env: NodeJS.ProcessEnv, nowMs: number): string[];                 // run dirs
export function burnOf(snapshots: RunTokens[], now: Date): BurnFile;
export function runTokensPass(opts: { env: NodeJS.ProcessEnv; now: Date; projectsDir: string; run?: string; dryRun?: boolean; log?: (line: string) => void }): RunsPassResult;
```

- Scope rule (`runsInScope`): every `runs/<folder>/<run>/` with a `run.json`, folder and run names not starting with `.`. Skip when `tokens.json` says `final: true`. Keep when the mtime of `events.jsonl` (else `run.json`) is within 7 days, or when `tokens.json` exists and is older than `events.jsonl`.
- Burn rule (`burnOf`): the window is the 12 buckets with `start` in `[floor5(now) − 60 min, floor5(now))`. `tokens` sums them over all snapshots; `cost_usd` is null when any bucket in the window has a null cost; `runs` counts snapshots with a bucket in the window; `unpriced_models` is the sorted union of those snapshots' `unpriced_models`.
- The burn sums only the snapshots counted in this pass (every run active in the last hour is in scope). Snapshots of runs not in scope cannot have buckets in the window.

- [ ] **Step 1: Write the failing tests** `runs.test.ts`

```ts
import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { burnOf, runTokensPass, runsInScope } from "./runs.ts";
import { writeRun, writeTranscript } from "./fixtures.test-util.ts";
import type { RunTokens } from "./run-types.ts";

let depot: string, projects: string;
const now = new Date("2026-10-24T09:02:00.000Z");
const env = () => ({ DIGISMITH_DEPOT_DIR: depot });
beforeEach(() => { depot = mkdtempSync(join(tmpdir(), "rt-depot-")); projects = mkdtempSync(join(tmpdir(), "rt-proj-")); });
afterEach(() => { rmSync(depot, { recursive: true, force: true }); rmSync(projects, { recursive: true, force: true }); });

const snap = (buckets: RunTokens["buckets"], unpriced: string[] = []): RunTokens => ({ schema: "oculus-tokens/v1", run: "r", generated_at: now.toISOString(), final: false, price_table: { source: "anthropic", version: "2026-10-18" }, models: {}, total: { tokens: 0, responses: 0, cost_usd: 0 }, unpriced_models: unpriced, sessions: 1, buckets });

describe("burnOf", () => {
  it("sums the 12 full buckets before now across runs", () => {
    const b = burnOf([
      snap([{ start: "2026-10-24T07:55:00.000Z", tokens: 1000, cost_usd: 1 }, { start: "2026-10-24T08:00:00.000Z", tokens: 10, cost_usd: 0.5 }, { start: "2026-10-24T09:00:00.000Z", tokens: 7, cost_usd: 7 }]),
      snap([{ start: "2026-10-24T08:55:00.000Z", tokens: 5, cost_usd: 0.25 }]),
    ], now);
    expect(b).toMatchObject({ schema: "oculus-burn/v1", window_min: 60, tokens: 15, cost_usd: 0.75, runs: 2 });
  });
  it("gives a null cost when a bucket in the window is unpriced", () => {
    expect(burnOf([snap([{ start: "2026-10-24T08:30:00.000Z", tokens: 5, cost_usd: null }], ["x"])], now)).toMatchObject({ tokens: 5, cost_usd: null, unpriced_models: ["x"] });
  });
});

describe("runsInScope", () => {
  it("keeps active runs, skips final and dot folders and old untouched runs", () => {
    const active = writeRun(depot, "DGS-1", "builder-a", { created: "2026-10-24T08:00:00.000Z" });
    const final = writeRun(depot, "DGS-1", "builder-b", { created: "2026-10-24T08:00:00.000Z" });
    writeFileSync(join(final, "tokens.json"), JSON.stringify({ final: true }));
    const old = writeRun(depot, "DGS-2", "builder-c", { created: "2026-10-01T08:00:00.000Z" });
    const t = new Date("2026-10-01T09:00:00.000Z");
    utimesSync(join(old, "events.jsonl"), t, t); utimesSync(join(old, "run.json"), t, t);
    writeRun(depot, ".tokens", "x", { created: "2026-10-24T08:00:00.000Z" });
    expect(runsInScope(env(), now.getTime())).toEqual([active]);
  });
});

describe("runTokensPass", () => {
  it("writes tokens.json per run, the burn file and seats.json", () => {
    writeTranscript(projects, "s1", [{ id: "m1", req: "r1", ts: "2026-10-24T08:30:00.000Z", output: 5 }]);
    writeRun(depot, "DGS-1", "builder-a", { created: "2026-10-24T08:00:00.000Z", started: [{ ts: "2026-10-24T08:00:01.000Z", session: "s1" }] });
    const r = runTokensPass({ env: env(), now, projectsDir: projects });
    expect(r).toMatchObject({ updated: 1, failed: 0 });
    expect(JSON.parse(readFileSync(join(depot, "runs", ".tokens", "burn.json"), "utf8")).tokens).toBe(5);
    expect(existsSync(join(depot, "usage-probe", "seats.json"))).toBe(true);
  });
  it("writes nothing on a dry run", () => {
    writeTranscript(projects, "s1", [{ id: "m1", req: "r1", ts: "2026-10-24T08:30:00.000Z", output: 5 }]);
    const dir = writeRun(depot, "DGS-1", "builder-a", { created: "2026-10-24T08:00:00.000Z", started: [{ ts: "2026-10-24T08:00:01.000Z", session: "s1" }] });
    runTokensPass({ env: env(), now, projectsDir: projects, dryRun: true });
    expect(existsSync(join(dir, "tokens.json"))).toBe(false);
    expect(existsSync(join(depot, "runs", ".tokens"))).toBe(false);
    expect(existsSync(join(depot, "usage-probe", "seats.json"))).toBe(false);
  });
  it("keeps going when one run fails, and logs only the run id and a code", () => {
    writeTranscript(projects, "s1", [{ id: "m1", req: "r1", ts: "2026-10-24T08:30:00.000Z", output: 5 }]);
    writeRun(depot, "DGS-1", "builder-a", { created: "2026-10-24T08:00:00.000Z", started: [{ ts: "2026-10-24T08:00:01.000Z", session: "s1" }] });
    const bad = writeRun(depot, "DGS-1", "builder-b", { created: "2026-10-24T08:00:00.000Z" });
    writeFileSync(join(bad, "run.json"), "{broken");
    const logs: string[] = [];
    const r = runTokensPass({ env: env(), now, projectsDir: projects, log: (l) => logs.push(l) });
    expect(r).toMatchObject({ updated: 1, failed: 1 });
    expect(logs.join("\n")).toMatch(/builder-b/);
    expect(logs.join("\n")).not.toContain(depot);
  });
  it("gives an ended run one final pass, then skips it", () => {
    writeTranscript(projects, "s1", [{ id: "m1", req: "r1", ts: "2026-10-24T08:30:00.000Z", output: 5 }]);
    writeRun(depot, "DGS-1", "builder-a", { created: "2026-10-24T08:00:00.000Z", started: [{ ts: "2026-10-24T08:00:01.000Z", session: "s1" }], ended: "2026-10-24T08:40:00.000Z" });
    expect(runTokensPass({ env: env(), now, projectsDir: projects }).updated).toBe(1);
    expect(runTokensPass({ env: env(), now, projectsDir: projects }).updated).toBe(0);
  });
  it("updates one run with --run", () => {
    writeRun(depot, "DGS-1", "builder-a", { created: "2026-10-24T08:00:00.000Z", started: [{ ts: "2026-10-24T08:00:01.000Z", session: "s1" }] });
    writeRun(depot, "DGS-1", "builder-b", { created: "2026-10-24T08:00:00.000Z", started: [{ ts: "2026-10-24T08:00:01.000Z", session: "s2" }] });
    expect(runTokensPass({ env: env(), now, projectsDir: projects, run: "builder-b" }).updated).toBe(1);
  });
});
```

Add to `scripts/nexus-api/src/scheduler/registry.test.ts`: the expected `JOBS` names gain `'oculus-tokens'` at the end, and:

```ts
it('oculus-tokens runs dg tokens runs every 5 min and starts no model', () => {
  const job = JOBS.find((j) => j.name === 'oculus-tokens')!
  expect(job.schedule).toEqual({ atUtc7: '00:00', windowEndUtc7: '23:59', everyMinutes: 5 })
  expect(job.command.args.slice(-2)).toEqual(['tokens', 'runs'])
  expect(job.catchUp).toBe('skip')
  expect(job.timeoutMs).toBe(4 * 60 * 1000)
})
```

Add to `strip-types.smoke.test.ts`:

```ts
describe("tokens runs under --experimental-strip-types", () => {
  it("dg tokens runs --dry-run on an empty depot", async () => {
    const depot = mkdtempSync(join(tmpdir(), "tok-smoke-"));
    try {
      const { stdout } = await run(process.execPath, ["--experimental-strip-types", entry, "tokens", "runs", "--dry-run"], { env: { ...process.env, DIGISMITH_DEPOT_DIR: depot, DIGISMITH_CLAUDE_PROJECTS_DIR: depot } });
      expect(stdout).toMatch(/updated 0/);
    } finally { rmSync(depot, { recursive: true, force: true }); }
  }, 30_000);
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm exec vitest run packages/cli/src/tokens/runs.test.ts scripts/nexus-api/src/scheduler/registry.test.ts`
Expected: FAIL (`./runs.ts` not found; job missing).

- [ ] **Step 3: Implement** `runs.ts`

```ts
import { mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { runsDir } from "../run/paths.ts";
import { bucketStart, countRun, transcriptIndex, writeJsonAtomic } from "./run-count.ts";
import type { RunTokens } from "./run-types.ts";
import { probeDir, readProbeSeats, writeSeats } from "./seats.ts";

export const BURN_SCHEMA = "oculus-burn/v1";
export interface BurnFile { schema: typeof BURN_SCHEMA; generated_at: string; window_min: 60; tokens: number; cost_usd: number | null; runs: number; unpriced_models: string[] }
export interface RunsPassResult { updated: number; skipped: number; failed: number; burn: BurnFile; seats: number }

const WEEK_MS = 7 * 24 * 3600_000;
const HOUR_MS = 3600_000;

const mtime = (p: string): number | null => { try { return statSync(p).mtimeMs; } catch { return null; } };

function isFinal(dir: string): boolean {
  try { return (JSON.parse(readFileSync(join(dir, "tokens.json"), "utf8")) as { final?: unknown }).final === true; } catch { return false; }
}

export function runsInScope(env: NodeJS.ProcessEnv, nowMs: number): string[] {
  const root = runsDir(env);
  const out: string[] = [];
  let folders: string[] = [];
  try { folders = readdirSync(root); } catch { return out; }
  for (const folder of folders.filter((f) => !f.startsWith(".")).sort()) {
    let ids: string[] = [];
    try { ids = readdirSync(join(root, folder)); } catch { continue; } // hook-errors.log is a file
    for (const id of ids.filter((i) => !i.startsWith(".")).sort()) {
      const dir = join(root, folder, id);
      const runMs = mtime(join(dir, "run.json"));
      if (runMs === null || isFinal(dir)) continue;
      const activity = mtime(join(dir, "events.jsonl")) ?? runMs;
      const tokensMs = mtime(join(dir, "tokens.json"));
      if (nowMs - activity <= WEEK_MS || (tokensMs !== null && tokensMs < activity)) out.push(dir);
    }
  }
  return out;
}

export function burnOf(snapshots: RunTokens[], now: Date): BurnFile {
  const end = Date.parse(bucketStart(now.toISOString()));
  const from = end - HOUR_MS;
  let tokens = 0;
  let cost: number | null = 0;
  let runs = 0;
  const unpriced = new Set<string>();
  for (const s of snapshots) {
    const inWindow = s.buckets.filter((b) => { const t = Date.parse(b.start); return t >= from && t < end; });
    if (inWindow.length === 0) continue;
    runs += 1;
    for (const m of s.unpriced_models) unpriced.add(m);
    for (const b of inWindow) { tokens += b.tokens; cost = cost === null || b.cost_usd === null ? null : cost + b.cost_usd; }
  }
  return { schema: BURN_SCHEMA, generated_at: now.toISOString(), window_min: 60, tokens, cost_usd: cost, runs, unpriced_models: [...unpriced].sort() };
}

export function runTokensPass(opts: { env: NodeJS.ProcessEnv; now: Date; projectsDir: string; run?: string; dryRun?: boolean; log?: (line: string) => void }): RunsPassResult {
  const log = opts.log ?? ((l: string) => console.error(l));
  const dirs = runsInScope(opts.env, opts.now.getTime()).filter((d) => opts.run === undefined || d.endsWith(`/${opts.run}`));
  const index = transcriptIndex(opts.projectsDir);
  const snapshots: RunTokens[] = [];
  let updated = 0, skipped = 0, failed = 0;
  for (const dir of dirs) {
    const id = dir.slice(dir.lastIndexOf("/") + 1);
    if (opts.dryRun) { skipped += 1; continue; }
    try {
      const s = countRun(dir, { now: opts.now, index });
      if (s === null) skipped += 1; else { updated += 1; snapshots.push(s); }
    } catch (e) {
      failed += 1;
      log(`tokens runs: ${id} failed (${(e as NodeJS.ErrnoException).code ?? (e as Error).name})`);
    }
  }
  const burn = burnOf(snapshots, opts.now);
  let seats = readProbeSeats(probeDir(opts.env)).length;
  if (!opts.dryRun) {
    const tokensDir = join(runsDir(opts.env), ".tokens");
    mkdirSync(tokensDir, { recursive: true });
    writeJsonAtomic(join(tokensDir, "burn.json"), burn);
    mkdirSync(probeDir(opts.env), { recursive: true });
    seats = writeSeats(probeDir(opts.env), opts.now).seats.length;
  }
  return { updated, skipped, failed, burn, seats };
}
```

In the dry-run test the run is in scope but `countRun` is not called; the test expects no `tokens.json`. `--run` matches the run id exactly (the last path segment).

In `packages/cli/src/tokens/index.ts`: add options `run` (string) and `dry-run` (boolean, default false), described as "with the word runs: one run only" and "with the word runs: print, write nothing". At the top of the handler:

```ts
if (args.ticket === "runs") {
  // "runs" is not a ticket key (keys carry a number): it is the 5-min Oculus job (DGS-590).
  const r = runTokensPass({ env: process.env, now: new Date(), projectsDir: claudeProjectsDir(), run: args.run, dryRun: args.dryRun });
  console.log(`tokens runs: updated ${r.updated}, skipped ${r.skipped}, failed ${r.failed}, burn ${r.burn.tokens} tokens/h, seats ${r.seats}`);
  if (r.failed > 0 && r.updated === 0 && r.skipped === 0) process.exitCode = 1;
  return;
}
```

Also change the `describe` of the command to `count the tokens of a ticket, or "tokens runs": write the Oculus run snapshots`.

In `scripts/nexus-api/src/scheduler/registry.ts` append after `nightwatch-watchdog`:

```ts
  defineJob({
    name: 'oculus-tokens',
    description: 'Writes each run\'s tokens and cost, the burn per hour and the seat windows for Oculus (DGS-590). Reads transcripts for counts only. No model tokens.',
    schedule: { atUtc7: '00:00', windowEndUtc7: '23:59', everyMinutes: 5 },
    command: { file: process.execPath, args: [...DG, 'tokens', 'runs'] },
    timeoutMs: 4 * 60 * 1000, catchUp: 'skip', order: 70, notify: 'failures', manualOutsideWindow: 'allowed',
  }),
```

README section in `packages/cli/src/tokens/README.md`, "Run snapshots (DGS-590)": what `dg tokens runs` writes (the three files and their schemas from the spec section 6–7), the scope rule, the sessions rule (run.json `session_id` + `started` events; `ts >= created_at`), incremental state (`tokens.state.json`: cursors and per-response counts, no text, no folder path; delete it to recount), cost (per response, list price, `ANTHROPIC_PRICES_VERSION`, unpriced → null), the job `oculus-tokens` (Nexus API scheduler, every 5 min, loads at the next API restart), and that the usage probe stays manual (conductor, runbook "Reading usage", saves `out-<seat>.json`; a scheduled probe is a follow-up ticket filed by the Maestro).

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run packages/cli/src scripts/nexus-api/src/scheduler scripts/token-counter`
Expected: PASS.

- [ ] **Step 5: Typecheck and build**

Run: `pnpm --filter @digismith/cli build` (in the worktree). Expected: exit 0. Then `node packages/cli/dist/index.js tokens runs --dry-run` with `DIGISMITH_DEPOT_DIR` and `DIGISMITH_CLAUDE_PROJECTS_DIR` set to a temp folder prints `tokens runs: updated 0, …`.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/tokens packages/cli/src/run/README.md packages/cli/src/strip-types.smoke.test.ts scripts/nexus-api/src/scheduler/registry.ts scripts/nexus-api/src/scheduler/registry.test.ts
git commit -m "feat(dgs-590): add dg tokens runs and the oculus-tokens job"
```

**Data parts end here. STOP and wait for the conductor's word that DGS-599 has merged before Task 6.**

---

### Task 6: Oculus views and the shared schema (after DGS-599 merges)

**Before the task:** `git fetch` is not needed (local main). `git rebase main` in the worktree after the conductor says DGS-599 merged; run the full baseline (`pnpm exec vitest run packages/cli/src scripts/nexus-api`) green before the first edit. File names below are DGS-599's: `packages/cli/src/oculus/`, `scripts/nexus-shared/oculus.ts`, `scripts/nexus-api/src/oculus-*.ts`. If a name differs after the merge, use the merged name and say so in the task report.

**Files:**
- Create: `packages/cli/src/oculus/tokens.ts`
- Test: `packages/cli/src/oculus/tokens.test.ts`
- Modify: `packages/cli/src/oculus/types.ts` (`RunRowView` gets `tokens`, `tokensAsOf`)
- Modify: `packages/cli/src/oculus/derive.ts` or `views.ts` where the row is built (`runRowOf` callers): attach the row tokens
- Modify: `packages/cli/src/oculus/views.ts` (`overviewView` gets `burn`, `seats`; `runView` gets `tokens`)
- Modify: `packages/cli/src/oculus/views.test.ts`
- Modify: `scripts/nexus-shared/oculus.ts` (schemas)
- Modify: `scripts/nexus-api/src/oculus-contract.test.ts` (fixtures carry the new fields)
- Modify: `packages/cli/src/oculus/README.md` (the new fields and the freshness rules)

**Interfaces:**
- Consumes: the files from Tasks 3–5; `RunTokens`, `BurnFile`, `SeatsFile` types.
- Produces (view JSON, camelCase like the existing views):

```ts
export const STALE_MS = 15 * 60_000;
export interface RowTokens { total: number; costUsd: number | null; unpriced: string[] }
export interface RunTokensView {
  generatedAt: string; final: boolean; priceVersion: string;
  models: { model: string; input: number; output: number; cacheRead: number; cacheWrite5m: number; cacheWrite1h: number; responses: number; tokens: number; costUsd: number | null }[];
  total: { tokens: number; responses: number; costUsd: number | null }; unpriced: string[];
}
export interface BurnView { tokensPerH: number; usdPerH: number | null; asOf: string }
export interface SeatView { seat: string; readAt: string; stale: boolean; fiveHour: { usedPct: number; resetsAt: string } | null; weekly: { usedPct: number; resetsAt: string } | null }
export interface SeatsView { asOf: string; seats: SeatView[] }
// Each reader returns { value, asOf }: value null when missing or stale; asOf = the file's generated_at when it was read, else null.
export function readRunTokens(runDir: string, nowMs: number): { value: RunTokensView | null; asOf: string | null };
export function rowTokensOf(view: RunTokensView | null): RowTokens | null;
export function readBurn(env: NodeJS.ProcessEnv, nowMs: number): BurnView | null;
export function readSeatsView(env: NodeJS.ProcessEnv, nowMs: number): SeatsView | null;
```

- Field additions: `RunRowView.tokens: RowTokens | null`, `RunRowView.tokensAsOf: string | null`; run view `tokens: RunTokensView | null`, `tokensAsOf: string | null`; overview `burn: BurnView | null`, `seats: SeatsView | null`.
- Rules: run snapshot stale = `!final && now − generated_at > STALE_MS` → `value: null`, `asOf` kept (the UI title "stale since"). Wrong schema or unreadable → both null. Burn: missing, wrong schema or older than 15 min → null. Seats: file missing or older than 15 min → null; a window whose `resets_at <= now` → null; `stale = now − readAt > STALE_MS`.

- [ ] **Step 1: Write the failing test** `packages/cli/src/oculus/tokens.test.ts`

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readBurn, readRunTokens, readSeatsView, rowTokensOf } from "./tokens.ts";

let depot: string;
const now = Date.parse("2026-10-24T09:00:00.000Z");
beforeEach(() => { depot = mkdtempSync(join(tmpdir(), "oc-tok-")); });
afterEach(() => rmSync(depot, { recursive: true, force: true }));

const runTokens = (generated: string, final: boolean, unpriced: string[] = []) => ({
  schema: "oculus-tokens/v1", run: "r1", generated_at: generated, final, price_table: { source: "anthropic", version: "2026-10-18" },
  models: { "claude-opus-5-5": { input: 1, output: 2, cache_read: 3, cache_write_5m: 4, cache_write_1h: 5, responses: 1, tokens: 15, cost_usd: unpriced.length ? null : 0.5 } },
  total: { tokens: 15, responses: 1, cost_usd: unpriced.length ? null : 0.5 }, unpriced_models: unpriced, sessions: 1, buckets: [],
});
const put = (rel: string, v: unknown) => { const p = join(depot, rel); mkdirSync(join(p, ".."), { recursive: true }); writeFileSync(p, JSON.stringify(v)); };

describe("readRunTokens", () => {
  it("reads a fresh snapshot into camelCase", () => {
    put("runs/DGS-1/r1/tokens.json", runTokens("2026-10-24T08:55:00.000Z", false));
    const r = readRunTokens(join(depot, "runs/DGS-1/r1"), now);
    expect(r.value?.models[0]).toEqual({ model: "claude-opus-5-5", input: 1, output: 2, cacheRead: 3, cacheWrite5m: 4, cacheWrite1h: 5, responses: 1, tokens: 15, costUsd: 0.5 });
    expect(rowTokensOf(r.value)).toEqual({ total: 15, costUsd: 0.5, unpriced: [] });
  });
  it("gives null for a stale live snapshot but keeps a final one", () => {
    put("runs/DGS-1/r1/tokens.json", runTokens("2026-10-24T08:40:00.000Z", false));
    expect(readRunTokens(join(depot, "runs/DGS-1/r1"), now)).toEqual({ value: null, asOf: "2026-10-24T08:40:00.000Z" });
    put("runs/DGS-1/r1/tokens.json", runTokens("2026-10-20T08:40:00.000Z", true));
    expect(readRunTokens(join(depot, "runs/DGS-1/r1"), now).value?.final).toBe(true);
  });
  it("gives null for a missing or foreign file", () => {
    expect(readRunTokens(join(depot, "runs/DGS-1/none"), now)).toEqual({ value: null, asOf: null });
    put("runs/DGS-1/r2/tokens.json", { schema: "other" });
    expect(readRunTokens(join(depot, "runs/DGS-1/r2"), now)).toEqual({ value: null, asOf: null });
  });
});

describe("readBurn", () => {
  it("reads a fresh burn file and refuses a stale one", () => {
    put("runs/.tokens/burn.json", { schema: "oculus-burn/v1", generated_at: "2026-10-24T08:50:00.000Z", window_min: 60, tokens: 4_100_000, cost_usd: 12.3, runs: 2, unpriced_models: [] });
    expect(readBurn({ DIGISMITH_DEPOT_DIR: depot }, now)).toEqual({ tokensPerH: 4_100_000, usdPerH: 12.3, asOf: "2026-10-24T08:50:00.000Z" });
    expect(readBurn({ DIGISMITH_DEPOT_DIR: depot }, now + 20 * 60_000)).toBeNull();
  });
});

describe("readSeatsView", () => {
  it("marks old readings stale and drops a window past its reset", () => {
    put("usage-probe/seats.json", { schema: "oculus-seats/v1", generated_at: "2026-10-24T08:58:00.000Z", seats: [
      { seat: "jack", read_at: "2026-10-24T08:09:00.000Z", five_hour: { used_pct: 7, resets_at: "2026-10-24T08:30:00.000Z" }, weekly: { used_pct: 32, resets_at: "2026-10-28T05:00:00.000Z" } },
      { seat: "dev0", read_at: "2026-10-24T08:55:00.000Z", five_hour: { used_pct: 3, resets_at: "2026-10-24T12:00:00.000Z" }, weekly: null },
    ] });
    expect(readSeatsView({ DIGISMITH_DEPOT_DIR: depot }, now)).toEqual({ asOf: "2026-10-24T08:58:00.000Z", seats: [
      { seat: "jack", readAt: "2026-10-24T08:09:00.000Z", stale: true, fiveHour: null, weekly: { usedPct: 32, resetsAt: "2026-10-28T05:00:00.000Z" } },
      { seat: "dev0", readAt: "2026-10-24T08:55:00.000Z", stale: false, fiveHour: { usedPct: 3, resetsAt: "2026-10-24T12:00:00.000Z" }, weekly: null },
    ] });
    expect(readSeatsView({ DIGISMITH_DEPOT_DIR: depot }, now + 30 * 60_000)).toBeNull();
  });
});
```

Add to `views.test.ts` (the existing fixture builder of DGS-586/599): an overview on a depot with no token files has `burn: null` and `seats: null`; a runs row for a run with a fresh `tokens.json` has `tokens.total` set; a `run` view carries `tokens.models`. Add to `oculus-contract.test.ts`: the fixtures for overview, runs and run carry the new fields (one with values, one with nulls) and the strict schemas accept both and refuse an extra key inside `tokens`.

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm exec vitest run packages/cli/src/oculus scripts/nexus-api/src/oculus-contract.test.ts`
Expected: FAIL (`./tokens.ts` not found; schema refuses new keys).

- [ ] **Step 3: Implement** `packages/cli/src/oculus/tokens.ts`

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { depotDir, runsDir } from "../run/paths.ts";

export const STALE_MS = 15 * 60_000;
export interface RowTokens { total: number; costUsd: number | null; unpriced: string[] }
export interface RunTokensView {
  generatedAt: string; final: boolean; priceVersion: string;
  models: { model: string; input: number; output: number; cacheRead: number; cacheWrite5m: number; cacheWrite1h: number; responses: number; tokens: number; costUsd: number | null }[];
  total: { tokens: number; responses: number; costUsd: number | null }; unpriced: string[];
}
export interface BurnView { tokensPerH: number; usdPerH: number | null; asOf: string }
export interface SeatView { seat: string; readAt: string; stale: boolean; fiveHour: { usedPct: number; resetsAt: string } | null; weekly: { usedPct: number; resetsAt: string } | null }
export interface SeatsView { asOf: string; seats: SeatView[] }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readJson(path: string): any { try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; } }
const age = (iso: unknown, nowMs: number): number => (typeof iso === "string" ? nowMs - Date.parse(iso) : Number.POSITIVE_INFINITY);

export function readRunTokens(runDir: string, nowMs: number): { value: RunTokensView | null; asOf: string | null } {
  const f = readJson(join(runDir, "tokens.json"));
  if (!f || f.schema !== "oculus-tokens/v1" || typeof f.generated_at !== "string") return { value: null, asOf: null };
  if (f.final !== true && age(f.generated_at, nowMs) > STALE_MS) return { value: null, asOf: f.generated_at };
  const models = Object.entries(f.models ?? {}).map(([model, m]: [string, any]) => ({
    model, input: m.input, output: m.output, cacheRead: m.cache_read, cacheWrite5m: m.cache_write_5m, cacheWrite1h: m.cache_write_1h, responses: m.responses, tokens: m.tokens, costUsd: m.cost_usd,
  }));
  return {
    value: { generatedAt: f.generated_at, final: f.final === true, priceVersion: String(f.price_table?.version ?? ""), models, total: { tokens: f.total.tokens, responses: f.total.responses, costUsd: f.total.cost_usd }, unpriced: f.unpriced_models ?? [] },
    asOf: f.generated_at,
  };
}

export function rowTokensOf(v: RunTokensView | null): RowTokens | null {
  return v === null ? null : { total: v.total.tokens, costUsd: v.total.costUsd, unpriced: v.unpriced };
}

export function readBurn(env: NodeJS.ProcessEnv, nowMs: number): BurnView | null {
  const f = readJson(join(runsDir(env), ".tokens", "burn.json"));
  if (!f || f.schema !== "oculus-burn/v1" || age(f.generated_at, nowMs) > STALE_MS) return null;
  return { tokensPerH: f.tokens, usdPerH: f.cost_usd, asOf: f.generated_at };
}

function win(w: any, nowMs: number): { usedPct: number; resetsAt: string } | null {
  if (!w || typeof w.resets_at !== "string" || Date.parse(w.resets_at) <= nowMs) return null; // past its reset: known to be wrong
  return { usedPct: w.used_pct, resetsAt: w.resets_at };
}

export function readSeatsView(env: NodeJS.ProcessEnv, nowMs: number): SeatsView | null {
  const f = readJson(join(depotDir(env), "usage-probe", "seats.json"));
  if (!f || f.schema !== "oculus-seats/v1" || age(f.generated_at, nowMs) > STALE_MS || !Array.isArray(f.seats)) return null;
  return {
    asOf: f.generated_at,
    seats: f.seats.map((s: any) => ({ seat: s.seat, readAt: s.read_at, stale: age(s.read_at, nowMs) > STALE_MS, fiveHour: win(s.five_hour, nowMs), weekly: win(s.weekly, nowMs) })),
  };
}
```

Wire it in `views.ts`: the row builder (where `runRowOf` is called in `rowsOf`) needs the run dir; `loadAll` keeps `dir` in `Loaded` and `rowsOf` spreads `{ ...row, ...tokensFields(dir) }` with `tokensFields = (dir) => { const t = readRunTokens(dir, now.getTime()); return { tokens: rowTokensOf(t.value), tokensAsOf: t.asOf }; }`. `overviewView` returns `burn: readBurn(env, now.getTime()), seats: readSeatsView(env, now.getTime())`. `runView` returns `tokens` and `tokensAsOf` from `readRunTokens(dir, now.getTime())`.

In `scripts/nexus-shared/oculus.ts`:

```ts
const usd = z.number().min(0)
export const rowTokensSchema = z.strictObject({ total: count, costUsd: usd.nullable(), unpriced: z.array(z.string()) })
export const runTokensSchema = z.strictObject({
  generatedAt: iso, final: z.boolean(), priceVersion: z.string(),
  models: z.array(z.strictObject({ model: z.string(), input: count, output: count, cacheRead: count, cacheWrite5m: count, cacheWrite1h: count, responses: count, tokens: count, costUsd: usd.nullable() })),
  total: z.strictObject({ tokens: count, responses: count, costUsd: usd.nullable() }), unpriced: z.array(z.string()),
})
const seatWindow = z.strictObject({ usedPct: z.number().min(0).max(100), resetsAt: iso }).nullable()
export const burnSchema = z.strictObject({ tokensPerH: count, usdPerH: usd.nullable(), asOf: iso })
export const seatsSchema = z.strictObject({ asOf: iso, seats: z.array(z.strictObject({ seat: z.string(), readAt: iso, stale: z.boolean(), fiveHour: seatWindow, weekly: seatWindow })) })
```

`runRowSchema` gains `tokens: rowTokensSchema.nullable(), tokensAsOf: iso.nullable()`; `overviewViewSchema` gains `burn: burnSchema.nullable(), seats: seatsSchema.nullable()`; `runDetailSchema` gains `tokens: runTokensSchema.nullable(), tokensAsOf: iso.nullable()`. Update every fixture that builds a row, overview or run detail (`oculus-contract.test.ts`, `scripts/nexus-web/tests/oculus-fixtures.ts`, the web stories' fixtures) with null values so existing tests stay green; Task 7 adds value fixtures.

README (`packages/cli/src/oculus/README.md`): the new fields and the freshness rules (spec section 10).

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run packages/cli/src scripts/nexus-api scripts/nexus-shared` and `pnpm --dir scripts/nexus-web exec vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/oculus scripts/nexus-shared scripts/nexus-api/src scripts/nexus-web/tests/oculus-fixtures.ts scripts/nexus-web/app
git commit -m "feat(dgs-590): add tokens, burn and seats to the Oculus views"
```

---

### Task 7: Oculus web: Tokens and Cost columns, the tokens card, the top bar (after Task 6)

**Files (DGS-599 names; use the merged names if they differ):**
- Modify: `scripts/nexus-web/app/utils/oc-format.ts` (+ its test): `fmtTokens`, `fmtUsd`
- Modify: `scripts/nexus-web/app/components/oc/RunsTable.vue` (or `OcRunsTable.vue`), its stories and `runs.test.ts`
- Create: `scripts/nexus-web/app/components/oc/TokensCard.vue`, `TokensCard.stories.ts`, `tokens-card.test.ts`
- Modify: `scripts/nexus-web/app/pages/oculus/run.vue` (the card next to the budget card)
- Modify: `scripts/nexus-web/app/components/oc/OcTopBar.vue`, `OcTopBar.stories.ts`, `shell.test.ts`
- Modify: `scripts/nexus-web/tests/oculus-fixtures.ts` (value fixtures: fresh, stale, unpriced, final, seats with a stale reading and a past-reset window)
- Modify: `scripts/nexus-web/tests/e2e/oculus.spec.ts`, `tests/a11y/oculus-axe.spec.ts`, visual baselines (`tests/visual/__screenshots__/`, made again for the changed stories and pages)

**Interfaces:**
- Consumes: `RunRow.tokens`, `RunRow.tokensAsOf`, `RunDetail.tokens`, `RunDetail.tokensAsOf`, `Overview.burn`, `Overview.seats` (Task 6, from `#oculus-schema`).
- Produces:
  - `fmtTokens(n: number): string` — `950`, `12.3k`, `1.2M`, `3.40B` (one decimal under 100 of a unit, none above; `B` with two decimals).
  - `fmtUsd(n: number | null): string` — `-` for null, `$0.004` under one cent shows `<$0.01`, else `$3.41`, `$1,204.50`.
  - `TokensCard` props `{ tokens: RunDetail['tokens']; asOf: string | null }`.

Display rules (spec sections 9–10):
- Runs table: the existing Tokens cell shows `fmtTokens(r.tokens.total)` with `title` = the exact number; a new Cost column after it shows `fmtUsd(r.tokens.costUsd)`. When `r.tokens` is null: `-` with `title` "stale since HH:MM (UTC+7)" when `tokensAsOf` is set, else "no snapshot". When `costUsd` is null and `tokens` is set: `-` with `title` "unpriced model: <names>". Both cells right aligned (`num`). On a phone the row cards show "Tokens" and "Cost" labels (`data-label`).
- `TokensCard` (`OcCard` title "Tokens and cost", note "list price"): a table with one row per model (Model, Input, Output, Cache read, Cache write 5m, Cache write 1h, Tokens, Cost; numbers through `fmtTokens` with exact `title`), a Total row, and a footer "Anthropic price table <priceVersion> · as of <HH:MM> (UTC+7)" plus " · counting" when `final` is false. `tokens` null: the text "No token snapshot." or "Stale since HH:MM (UTC+7)." Table headers use `scope="col"`; the card table becomes row cards on a phone with the ARIA table roles kept (the DGS-586 lesson).
- Top bar: replace the two "not measured" spans with `Burn <b>{{ fmtTokens(burn.tokensPerH) }}/h · {{ fmtUsd(burn.usdPerH) }}/h</b>` (`-/h` when `burn` null, title "no burn reading in the last 15 min") and, per seat, `<span :class="{ warn: s.stale }">{{ s.seat }} 5h <b>{{ pct(s.fiveHour) }}</b> · wk <b>{{ pct(s.weekly) }}</b><span v-if="s.stale" class="muted"> as of {{ HH:MM }}</span></span>` where `pct(null)` is `-`. `seats` null: `Seats <b>-</b>`. A stale seat reading uses the warn color token, never green. Under 760 px the seat spans sit on their own line (the bar already wraps; add `flex-basis: 100%` to a `.seats` group).

- [ ] **Step 1: Write the failing tests**

`oc-format.test.ts` additions:

```ts
it('formats tokens compactly', () => {
  expect([950, 12_300, 1_234_567, 3_400_000_000].map(fmtTokens)).toEqual(['950', '12.3k', '1.2M', '3.40B'])
})
it('formats dollars, null as -', () => {
  expect([null, 0.004, 3.411, 1204.5].map(fmtUsd)).toEqual(['-', '<$0.01', '$3.41', '$1,204.50'])
})
```

`runs.test.ts` additions (mount `RunsTable` with fixtures): a fresh row shows `1.2M` and `$3.41`; a stale row shows `-` with title matching `/stale since/`; a row with an unpriced model shows `-` in Cost with title matching `/unpriced model: claude-mystery-9/`; a row with no snapshot shows `-` with title `no snapshot`.

`tokens-card.test.ts`: renders one row per model and a Total row; the footer has `2026-10-18` and `counting` when not final; null tokens shows `No token snapshot.`; a stale one shows `Stale since`.

`shell.test.ts` additions (`OcTopBar`): with `burn` it shows `4.1M/h · $12.30/h`; with `burn: null` it shows `-/h`; a stale seat has the `warn` class and `as of`; a null window prints `-`; no element in the seats group carries the `ok` tone.

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm --dir scripts/nexus-web exec vitest run`
Expected: FAIL on the new cases.

- [ ] **Step 3: Implement**

`oc-format.ts`:

```ts
export function fmtTokens(n: number): string {
  if (n < 1000) return String(n)
  const units: [number, string][] = [[1e9, 'B'], [1e6, 'M'], [1e3, 'k']]
  for (const [size, unit] of units) {
    if (n >= size) {
      const v = n / size
      return unit === 'B' ? `${v.toFixed(2)}B` : `${v < 100 ? v.toFixed(1) : Math.round(v)}${unit}`
    }
  }
  return String(n)
}

const usdFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
export function fmtUsd(n: number | null): string {
  if (n === null) return '-'
  if (n > 0 && n < 0.01) return '<$0.01'
  return usdFmt.format(n)
}
```

`RunsTable.vue`: add `<th scope="col" class="num">Cost</th>` after Tokens; replace the Tokens cell:

```vue
<td data-label="Tokens" class="num" :class="{ muted: !r.tokens }" :title="r.tokens ? String(r.tokens.total) : missingWhy(r)">{{ r.tokens ? fmtTokens(r.tokens.total) : '-' }}</td>
<td data-label="Cost" class="num" :class="{ muted: !r.tokens || r.tokens.costUsd === null }" :title="costTitle(r)">{{ r.tokens ? fmtUsd(r.tokens.costUsd) : '-' }}</td>
```

with

```ts
const missingWhy = (r: RunRow): string => (r.tokensAsOf ? `stale since ${fmtUtc7(r.tokensAsOf)}` : 'no snapshot')
const costTitle = (r: RunRow): string =>
  !r.tokens ? missingWhy(r) : r.tokens.costUsd === null ? `unpriced model: ${r.tokens.unpriced.join(', ')}` : `list price $${r.tokens.costUsd.toFixed(4)}`
```

`TokensCard.vue`:

```vue
<script setup lang="ts">
import type { RunDetail } from '#oculus-schema'
import { fmtTokens, fmtUsd, fmtUtc7 } from '../../utils/oc-format'

defineProps<{ tokens: RunDetail['tokens']; asOf: string | null }>()
const cols = ['input', 'output', 'cacheRead', 'cacheWrite5m', 'cacheWrite1h', 'tokens'] as const
const heads = ['Input', 'Output', 'Cache read', 'Cache write 5m', 'Cache write 1h', 'Tokens']
</script>

<template>
  <OcCard title="Tokens and cost" note="list price">
    <div class="body">
      <template v-if="tokens">
        <table class="tk">
          <thead><tr><th scope="col">Model</th><th v-for="h in heads" :key="h" scope="col" class="num">{{ h }}</th><th scope="col" class="num">Cost</th></tr></thead>
          <tbody>
            <tr v-for="m in tokens.models" :key="m.model">
              <th scope="row" class="mono">{{ m.model }}</th>
              <td v-for="(c, i) in cols" :key="c" class="num mono" :data-label="heads[i]" :title="String(m[c])">{{ fmtTokens(m[c]) }}</td>
              <td class="num mono" data-label="Cost" :class="{ muted: m.costUsd === null }" :title="m.costUsd === null ? 'unpriced model' : undefined">{{ fmtUsd(m.costUsd) }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr><th scope="row">Total</th><td :colspan="cols.length - 1" /><td class="num mono" data-label="Tokens" :title="String(tokens.total.tokens)">{{ fmtTokens(tokens.total.tokens) }}</td><td class="num mono" data-label="Cost">{{ fmtUsd(tokens.total.costUsd) }}</td></tr>
          </tfoot>
        </table>
        <div class="mono muted foot">Anthropic price table {{ tokens.priceVersion }} · as of {{ fmtUtc7(tokens.generatedAt) }}<template v-if="!tokens.final"> · counting</template></div>
      </template>
      <div v-else-if="asOf" class="mono muted">Stale since {{ fmtUtc7(asOf) }}.</div>
      <div v-else class="mono muted">No token snapshot.</div>
    </div>
  </OcCard>
</template>

<style scoped lang="scss">
.body { padding: 12px 14px; font-size: 11px; }
.mono { font-family: var(--oc-mono); }
.muted { color: var(--oc-text-3); }
.num { text-align: right; }
.tk { width: 100%; border-collapse: collapse; }
.tk th, .tk td { padding: 4px 6px; border-bottom: 1px solid var(--oc-border); }
.foot { margin-top: 8px; }
@media (max-width: 760px) {
  .tk thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .tk tr { display: block; padding: 6px 0; }
  .tk td, .tk th[scope='row'] { display: flex; justify-content: space-between; border: 0; }
  .tk td::before { content: attr(data-label); color: var(--oc-text-3); }
}
</style>
```

(`fmtUtc7` is the existing helper; it prints HH:MM with the UTC+7 label as the other cards do.) Mount it in `pages/oculus/run.vue` right after the budget card: `<OcTokensCard :tokens="run.tokens" :as-of="run.tokensAsOf" />` (import as the page imports `BudgetCard`).

`OcTopBar.vue`: the two spans become

```vue
<span :title="overview?.burn ? `as of ${fmtUtc7(overview.burn.asOf)}` : 'no burn reading in the last 15 min'">Burn <b>{{ overview?.burn ? `${fmtTokens(overview.burn.tokensPerH)}/h · ${fmtUsd(overview.burn.usdPerH)}/h` : '-/h' }}</b></span>
<span class="seats" role="group" aria-label="Seat windows">
  <template v-if="overview?.seats">
    <span v-for="s in overview.seats.seats" :key="s.seat" :class="{ warn: s.stale }">{{ s.seat }} 5h <b>{{ pct(s.fiveHour) }}</b> · wk <b>{{ pct(s.weekly) }}</b><span v-if="s.stale" class="muted"> as of {{ fmtUtc7(s.readAt) }}</span></span>
  </template>
  <span v-else title="no seat file in the last 15 min">Seats <b>-</b></span>
</span>
```

with `const pct = (w: { usedPct: number } | null): string => (w === null ? '-' : \`${Math.round(w.usedPct)}%\`)` and styles `.seats { display: inline-flex; gap: 6px 14px; flex-wrap: wrap; } .warn, .warn b { color: var(--oc-warn); } @media (max-width: 760px) { .seats { flex-basis: 100%; } }`. Burn and seats render when `overview` is null too (they show `-`), as today.

Stories: `TokensCard.stories.ts` (Fresh, Counting, Unpriced, Stale, None); `OcTopBar.stories.ts` (WithBurnAndSeats, StaleSeat, NoFiles); `RunsTable.stories.ts` (TokensStates: fresh, stale, unpriced, none in one table). Playwright `oculus.spec.ts`: the Runs page shows the Cost header and a `$` value for the fixture run; the run page shows "Tokens and cost"; the top bar shows `Burn` with `/h`. Axe runs on the same pages (no new rule). Make the baselines again for the changed stories and pages, desktop and mobile, with the clock fixed as the visual tests do today.

- [ ] **Step 4: Run every web gate**

Run in `scripts/nexus-web`: `pnpm exec vitest run`, `pnpm build-storybook` (or the repo's story test command used by DGS-599), `pnpm exec playwright test`.
Expected: PASS, with the new baselines committed.

- [ ] **Step 5: Privacy check**

Run: `grep -rn "SECRET" scripts/nexus-web/tests/oculus-fixtures.ts` must find nothing new; the e2e page text of the run page must not contain any transcript text (the fixtures carry none; the e2e asserts `page.getByText('SECRET')` has count 0).

- [ ] **Step 6: Commit**

```bash
git add scripts/nexus-web
git commit -m "feat(dgs-590): show tokens, cost, burn and seat windows in Oculus"
```

---

### Task 8: A DGS-598-shaped run (after DGS-598 merges)

**Before the task:** `git rebase main` after the conductor says DGS-598 merged; full baseline green.

**Files:**
- Test: `packages/cli/src/tokens/run-count.auto.test.ts`
- Modify (only if the test shows a gap): `packages/cli/src/tokens/run-count.ts`, `packages/cli/src/tokens/runs.ts`

**Interfaces:**
- Consumes: `countRun`, `runTokensPass` (Tasks 3, 5); DGS-598's automatic layout (`runs/<project or ticket>/s-<session_id>/`, `run.json` `session_id`, `/clear` writes `ended` reason `clear` then `started` with a new `session_id`; `runs/.index/` holds index files).

- [ ] **Step 1: Write the test**

```ts
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runTokensPass } from "./runs.ts";
import { writeTranscript } from "./fixtures.test-util.ts";

let depot: string, projects: string;
const now = new Date("2026-10-24T09:02:00.000Z");
beforeEach(() => { depot = mkdtempSync(join(tmpdir(), "auto-depot-")); projects = mkdtempSync(join(tmpdir(), "auto-proj-")); });
afterEach(() => { rmSync(depot, { recursive: true, force: true }); rmSync(projects, { recursive: true, force: true }); });

describe("an automatic run (DGS-598)", () => {
  it("counts both sessions of a run that went through /clear, and ignores .index", () => {
    const run = "s-aaaa1111-0000-4000-8000-000000000001";
    const dir = join(depot, "runs", "DigiSmith", run);
    mkdirSync(dir, { recursive: true });
    mkdirSync(join(depot, "runs", ".index", "sessions"), { recursive: true });
    writeFileSync(join(depot, "runs", ".index", "sessions", "aaaa1111-0000-4000-8000-000000000001"), `DigiSmith/${run}\n`);
    writeFileSync(join(dir, "run.json"), JSON.stringify({ schema: "nightwatch-run/v1", run, ticket: null, role: "maestro", source: "auto", project: "DigiSmith", session_id: "aaaa1111-0000-4000-8000-000000000001", role_from: "identity", order: null, seat: null, model: null, plugin_version: null, base_sha: null, branch: null, worktree: null, herdr: { workspace: null, tab: null, pane: null }, budget: null, created_at: "2026-10-24T08:00:00.000Z" }));
    const ev = (seq: number, ts: string, type: string, data: object) => JSON.stringify({ schema: "nightwatch-event/v1", seq, ts, run, type, data }) + "\n";
    writeFileSync(join(dir, "events.jsonl"),
      ev(1, "2026-10-24T08:00:00.000Z", "started", { source: "startup", session_id: "aaaa1111-0000-4000-8000-000000000001" }) +
      ev(2, "2026-10-24T08:20:00.000Z", "ended", { reason: "clear", session_id: "aaaa1111-0000-4000-8000-000000000001" }) +
      ev(3, "2026-10-24T08:20:01.000Z", "started", { source: "clear", session_id: "bbbb2222-0000-4000-8000-000000000002" }));
    writeTranscript(projects, "aaaa1111-0000-4000-8000-000000000001", [{ id: "m1", req: "r1", ts: "2026-10-24T08:10:00.000Z", output: 5 }]);
    writeTranscript(projects, "bbbb2222-0000-4000-8000-000000000002", [{ id: "m2", req: "r2", ts: "2026-10-24T08:30:00.000Z", output: 7 }]);
    const r = runTokensPass({ env: { DIGISMITH_DEPOT_DIR: depot }, now, projectsDir: projects });
    expect(r).toMatchObject({ updated: 1, failed: 0 });
    const t = JSON.parse(readFileSync(join(dir, "tokens.json"), "utf8"));
    expect(t).toMatchObject({ sessions: 2, final: false, total: { responses: 2 } });
  });
});
```

- [ ] **Step 2: Run it**

Run: `pnpm exec vitest run packages/cli/src/tokens/run-count.auto.test.ts`
Expected: PASS with no code change (the session rule and the dot-folder skip already cover it). If it fails, fix the gap in `run-count.ts` or `runs.ts`, run the whole `packages/cli/src/tokens` suite again, and name the gap in the task report.

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/tokens
git commit -m "test(dgs-590): count an automatic run across /clear"
```

---

## After the last task (Builder)

Ticket review (role mode), then `STOP: merge-ready`. Merge only on "go: merge". The live steps after the merge are the conductor's, on the Maestro's word (spec section 13): CLI build in the main checkout, the existing Nexus API restart (loads `oculus-tokens` and the view fields), `build-www.sh`, then the first-use checks. This ticket never restarts the API.
