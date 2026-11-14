# DGS-178 Merge Progress Comment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finishing (Option 1) posts one fixed-shape ClickUp progress comment per merge through a new `dg clickup merge-comment` command.

**Architecture:** A pure renderer builds the comment from facts (range, commits, version, time, report pointer) plus four short agent-supplied fields. A thin command gathers the git facts, skips a head already posted (depot record), posts through a shared `postComment` helper extracted from `add-comment`, and never blocks. The finishing skill calls it after `attach-record`, in the hook style `|| true`.

**Tech Stack:** TypeScript (node `--experimental-strip-types`), yargs, vitest, `@digismith/clickup-client`. pnpm only. Package: `packages/cli`.

## Global Constraints

- Comment shape is exactly spec D4 (Jack approved). Plain text, no markdown syntax.
- Times: UTC+7 first, UTC in brackets: `2026-11-13 14:20 UTC+7 [07:20Z]`.
- No AI attribution in the comment or in commits. Title-only conventional commits. Never commit with the scope `dgs-178`; use scope `merge-comment` (the factory scan reads a key scope as merged).
- `notify_all: false` (reuse `addTaskComment`; no new client method).
- ClickUp key rule: `^DGS-\d+$`; any other key prints `not a ClickUp key, skipped`, exit 0.
- Never block: failure prints a line starting `warn:` on stderr, exit code 1; the skill line ends `|| true`.
- Limits: 8 commit lines then `+N more`; each free-text field 300 chars then `...`; at most 3 decision items.
- Tests use mocks and temp dirs only. No live ClickUp call in any test. No token value is read or printed.
- Run tests from `packages/cli`: `pnpm vitest run <file>`.

---

### Task 1: Extract `postComment` from add-comment

**Files:**
- Modify: `packages/cli/src/clickup/add-comment.ts` (the `else` branch of the handler, lines ~70-84)
- Test: `packages/cli/src/clickup/add-comment.test.ts`

**Interfaces:**
- Produces: `export async function postComment(client: ClickUpClient, taskId: string, text: string): Promise<{ id: string }>` — posts, reads back, throws the same two messages `add-comment` throws today (`sent (comment <id>), but the read-back failed: ...; do not send again, check it in ClickUp` and `sent (comment <id>), but read-back of <taskId> does not show it; check it in ClickUp`).

- [ ] **Step 1: Write the failing test** (append to `add-comment.test.ts`; add `postComment` to the import from `./add-comment.ts`)

```ts
describe("postComment", () => {
  it("posts, reads back and returns the created comment", async () => {
    const client = {
      addTaskComment: vi.fn().mockResolvedValue({ id: 77 }),
      getTaskComments: vi.fn().mockResolvedValue([{ id: "77" }]),
    } as unknown as ClickUpClient;
    await expect(postComment(client, "t1", "hello")).resolves.toEqual({ id: 77 });
    expect(client.addTaskComment).toHaveBeenCalledWith("t1", "hello");
  });
  it("throws when the read-back does not show the comment", async () => {
    const client = {
      addTaskComment: vi.fn().mockResolvedValue({ id: 77 }),
      getTaskComments: vi.fn().mockResolvedValue([{ id: "1" }]),
    } as unknown as ClickUpClient;
    await expect(postComment(client, "t1", "x")).rejects.toThrow("read-back of t1 does not show it");
  });
  it("throws a do-not-send-again message when the read-back call fails", async () => {
    const client = {
      addTaskComment: vi.fn().mockResolvedValue({ id: 77 }),
      getTaskComments: vi.fn().mockRejectedValue(new Error("boom")),
    } as unknown as ClickUpClient;
    await expect(postComment(client, "t1", "x")).rejects.toThrow("do not send again");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/clickup/add-comment.test.ts`
Expected: FAIL, `postComment` is not exported.

- [ ] **Step 3: Implement.** In `add-comment.ts` add above `createAddCommentCommand`:

```ts
/** Posts a comment, then reads the task's comments back to confirm it. Throws (never re-sends) when the read-back fails or misses. */
export async function postComment(client: ClickUpClient, taskId: string, text: string): Promise<{ id: string }> {
  const created = await client.addTaskComment(taskId, text);
  let rows;
  try {
    rows = await client.getTaskComments(taskId);
  } catch (err) {
    throw new Error(`sent (comment ${created.id}), but the read-back failed: ${(err as Error).message}; do not send again, check it in ClickUp`);
  }
  if (!rows.some((r) => String(r.id) === String(created.id))) {
    throw new Error(`sent (comment ${created.id}), but read-back of ${taskId} does not show it; check it in ClickUp`);
  }
  return created;
}
```

Then replace the handler's `else` body with:

```ts
        } else {
          const created = await postComment(client, t.id, req.text);
          console.log(`added comment ${created.id} on ${label(t)}; read back OK`);
        }
```

- [ ] **Step 4: Run to verify all add-comment tests pass**

Run: `pnpm vitest run src/clickup/add-comment.test.ts`
Expected: PASS (new and old tests).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/clickup/add-comment.ts packages/cli/src/clickup/add-comment.test.ts
git commit -m "refactor(merge-comment): share postComment with add-comment"
```

---

### Task 2: Pure renderer

**Files:**
- Create: `packages/cli/src/clickup/merge-comment-render.ts`
- Test: `packages/cli/src/clickup/merge-comment-render.test.ts`

**Interfaces:**
- Produces:
  - `export interface CommitLine { sha: string; subject: string }`
  - `export interface MergeCommentInput { key: string; now: Date; base: string; head: string; version?: string; commits: CommitLine[]; tests?: string; decisions?: string; next?: string; splitOff?: string; part?: string; reportAttached: boolean }`
  - `export function formatTime(d: Date): string`
  - `export function renderMergeComment(i: MergeCommentInput): string`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { formatTime, renderMergeComment, type MergeCommentInput } from "./merge-comment-render.ts";

const base: MergeCommentInput = {
  key: "DGS-178",
  now: new Date("2026-11-13T07:20:00Z"),
  base: "aaaaaaa1111",
  head: "bbbbbbb2222",
  version: "1.78.0",
  commits: [{ sha: "c0ffee1", subject: "feat(merge-comment): add the command" }],
  tests: "pnpm vitest run: 12 passed",
  decisions: "ClickUp key only\nOne comment per merge",
  next: "none",
  splitOff: "none",
  reportAttached: true,
};

describe("formatTime", () => {
  it("shows UTC+7 first and UTC in brackets", () => {
    expect(formatTime(new Date("2026-11-13T07:20:00Z"))).toBe("2026-11-13 14:20 UTC+7 [07:20Z]");
  });
  it("rolls the date over after 17:00 UTC", () => {
    expect(formatTime(new Date("2026-11-13T18:05:00Z"))).toBe("2026-11-14 01:05 UTC+7 [18:05Z]");
  });
});

describe("renderMergeComment", () => {
  it("renders the fixed shape", () => {
    expect(renderMergeComment(base)).toBe(
      [
        "DGS-178 merged, 2026-11-13 14:20 UTC+7 [07:20Z]: done.",
        "Merge aaaaaaa..bbbbbbb, plugin 1.78.0.",
        "- feat(merge-comment): add the command (c0ffee1)",
        "Tests: pnpm vitest run: 12 passed",
        "Decisions:",
        "- ClickUp key only",
        "- One comment per merge",
        "Next: none",
        "Split off: none",
        "Report: report.html is attached to this ticket.",
      ].join("\n"),
    );
  });
  it("puts a single decision on the label line", () => {
    expect(renderMergeComment({ ...base, decisions: "- only one" })).toContain("\nDecisions: only one\n");
  });
  it("keeps the lines when fields are missing", () => {
    const t = renderMergeComment({ ...base, tests: undefined, decisions: undefined, next: undefined, splitOff: undefined });
    expect(t).toContain("Tests: not reported");
    expect(t).toContain("Decisions: not reported");
    expect(t).toContain("Next: none");
    expect(t).toContain("Split off: none");
  });
  it("omits the plugin part and the report line when unknown", () => {
    const t = renderMergeComment({ ...base, version: undefined, reportAttached: false });
    expect(t).toContain("Merge aaaaaaa..bbbbbbb.\n");
    expect(t).not.toContain("plugin");
    expect(t).not.toContain("Report:");
  });
  it("caps commits at 8 and says how many more", () => {
    const commits = Array.from({ length: 11 }, (_, n) => ({ sha: `s${n}`, subject: `c${n}` }));
    const t = renderMergeComment({ ...base, commits });
    expect(t).toContain("- c7 (s7)");
    expect(t).not.toContain("- c8 (s8)");
    expect(t).toContain("+3 more");
  });
  it("caps decisions at 3 and truncates long fields at 300 characters", () => {
    const t = renderMergeComment({ ...base, decisions: "a\nb\nc\nd", tests: "x".repeat(400) });
    expect(t).not.toContain("- d");
    const line = t.split("\n").find((l) => l.startsWith("Tests: "))!;
    expect(line.length).toBe("Tests: ".length + 300);
    expect(line.endsWith("...")).toBe(true);
  });
  it("uses the part label in the headline", () => {
    expect(renderMergeComment({ ...base, part: "Part 2 of 3" }).split("\n")[0]).toBe(
      "DGS-178 part merged, 2026-11-13 14:20 UTC+7 [07:20Z]: Part 2 of 3.",
    );
  });
  it("collapses newlines inside a field", () => {
    expect(renderMergeComment({ ...base, tests: "a\n  b" })).toContain("Tests: a b");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/clickup/merge-comment-render.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
export interface CommitLine { sha: string; subject: string }

export interface MergeCommentInput {
  key: string;
  now: Date;
  base: string;
  head: string;
  version?: string;
  commits: CommitLine[];
  tests?: string;
  decisions?: string;
  next?: string;
  splitOff?: string;
  part?: string;
  reportAttached: boolean;
}

const MAX_COMMITS = 8;
const MAX_DECISIONS = 3;
const MAX_FIELD = 300;

const pad = (n: number) => String(n).padStart(2, "0");

/** `2026-11-13 14:20 UTC+7 [07:20Z]` */
export function formatTime(d: Date): string {
  const local = new Date(d.getTime() + 7 * 3600_000);
  const date = `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
  return `${date} ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())} UTC+7 [${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}Z]`;
}

function oneLine(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > MAX_FIELD ? `${t.slice(0, MAX_FIELD - 3)}...` : t;
}

function field(s: string | undefined, fallback: string): string {
  const t = s === undefined ? "" : oneLine(s);
  return t === "" ? fallback : t;
}

export function renderMergeComment(i: MergeCommentInput): string {
  const when = formatTime(i.now);
  const lines: string[] = [];
  lines.push(i.part ? `${i.key} part merged, ${when}: ${oneLine(i.part)}.` : `${i.key} merged, ${when}: done.`);
  lines.push(`Merge ${i.base.slice(0, 7)}..${i.head.slice(0, 7)}${i.version ? `, plugin ${i.version}` : ""}.`);
  for (const c of i.commits.slice(0, MAX_COMMITS)) lines.push(`- ${oneLine(c.subject)} (${c.sha.slice(0, 7)})`);
  if (i.commits.length > MAX_COMMITS) lines.push(`+${i.commits.length - MAX_COMMITS} more`);
  lines.push(`Tests: ${field(i.tests, "not reported")}`);
  const items = (i.decisions ?? "")
    .split("\n")
    .map((l) => oneLine(l.replace(/^\s*[-*]\s+/, "")))
    .filter((l) => l !== "")
    .slice(0, MAX_DECISIONS);
  if (items.length === 0) lines.push("Decisions: not reported");
  else if (items.length === 1) lines.push(`Decisions: ${items[0]}`);
  else lines.push("Decisions:", ...items.map((d) => `- ${d}`));
  lines.push(`Next: ${field(i.next, "none")}`);
  lines.push(`Split off: ${field(i.splitOff, "none")}`);
  if (i.reportAttached) lines.push("Report: report.html is attached to this ticket.");
  return lines.join("\n");
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/clickup/merge-comment-render.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/clickup/merge-comment-render.ts packages/cli/src/clickup/merge-comment-render.test.ts
git commit -m "feat(merge-comment): render the fixed progress comment shape"
```

---

### Task 3: Depot record of posted comments

**Files:**
- Create: `packages/cli/src/tokens/comments-store.ts`
- Test: `packages/cli/src/tokens/comments-store.test.ts`

**Interfaces:**
- Consumes: `TICKET_PATTERN`, `depotRegistryDir` from `./registry.ts` (env `DIGISMITH_TOKEN_REGISTRY_DIR` moves the folder, used by tests).
- Produces: `export interface PostedComment { head: string; id: string; posted_at: string }`, `export function readPosted(ticket: string): PostedComment[]`, `export function recordPosted(ticket: string, rec: PostedComment): void` (file `<Key>.comments.json`; a same-head record is replaced; a missing, torn or non-array file reads as `[]`).

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPosted, recordPosted } from "./comments-store.ts";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "dg178-"));
  process.env.DIGISMITH_TOKEN_REGISTRY_DIR = dir;
});
afterEach(() => {
  delete process.env.DIGISMITH_TOKEN_REGISTRY_DIR;
  rmSync(dir, { recursive: true, force: true });
});

describe("comments-store", () => {
  it("reads [] when there is no file", () => {
    expect(readPosted("DGS-1")).toEqual([]);
  });
  it("records and reads back, replacing the same head", () => {
    recordPosted("DGS-1", { head: "aaa", id: "1", posted_at: "t1" });
    recordPosted("DGS-1", { head: "bbb", id: "2", posted_at: "t2" });
    recordPosted("DGS-1", { head: "aaa", id: "3", posted_at: "t3" });
    expect(readPosted("DGS-1").map((r) => [r.head, r.id])).toEqual([["bbb", "2"], ["aaa", "3"]]);
  });
  it("reads a torn file as []", () => {
    writeFileSync(join(dir, "DGS-1.comments.json"), "{not json");
    expect(readPosted("DGS-1")).toEqual([]);
  });
  it("refuses a bad ticket key", () => {
    expect(() => readPosted("../x")).toThrow("invalid ticket key");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/tokens/comments-store.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TICKET_PATTERN, depotRegistryDir } from "./registry.ts";

export interface PostedComment { head: string; id: string; posted_at: string }

function fileFor(ticket: string): string {
  if (!TICKET_PATTERN.test(ticket)) throw new Error(`invalid ticket key: ${ticket}`);
  return join(depotRegistryDir(), `${ticket}.comments.json`);
}

function isPosted(r: unknown): r is PostedComment {
  if (typeof r !== "object" || r === null) return false;
  const o = r as Record<string, unknown>;
  return ["head", "id", "posted_at"].every((k) => typeof o[k] === "string");
}

export function readPosted(ticket: string): PostedComment[] {
  const file = fileFor(ticket);
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return [];
    throw e;
  }
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter(isPosted) : [];
  } catch (e) {
    if (e instanceof SyntaxError) return [];
    throw e;
  }
}

export function recordPosted(ticket: string, rec: PostedComment): void {
  const file = fileFor(ticket);
  const next = [...readPosted(ticket).filter((r) => r.head !== rec.head), rec];
  mkdirSync(depotRegistryDir(), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(next, null, 2));
    renameSync(tmp, file);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/tokens/comments-store.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/tokens/comments-store.ts packages/cli/src/tokens/comments-store.test.ts
git commit -m "feat(merge-comment): record posted merge comments in the depot"
```

---

### Task 4: The `merge-comment` command, registered

**Files:**
- Create: `packages/cli/src/clickup/merge-comment.ts`
- Test: `packages/cli/src/clickup/merge-comment.test.ts`
- Modify: `packages/cli/src/clickup/index.ts` (import near line 33, `.command(mergeCommentCommand)` after `.command(addCommentCommand)` near line 81)
- Modify: `packages/cli/README.md` (one row/paragraph for `merge-comment`, next to `add-comment`)

**Interfaces:**
- Consumes: `renderMergeComment` (Task 2), `readPosted`/`recordPosted` (Task 3), `postComment` (Task 1), `readAttached` from `../tokens/attachments-store.ts`, `createClient` from `./lib.ts`.
- Produces:
  - `export function gatherGit(repo: string, base: string, head: string): { base: string; head: string; commits: CommitLine[]; version?: string }` — resolves both refs to full shas (`git rev-parse --verify`), lists `git log --no-merges --format=%h%x09%s base..head` (oldest first), reads `version` from `git show HEAD:.claude-plugin/plugin.json` (undefined when absent or unparseable).
  - `export function createMergeCommentCommand(clientFactory?: () => ClickUpClient, repo?: () => string): CommandModule`
  - `export const mergeCommentCommand: CommandModule`
  - Flags: `--task` (required), `--base`, `--head` (required), `--tests`, `--decisions`, `--next`, `--split-off`, `--part`, `--board-folder`, `--yes`.

- [ ] **Step 1: Write the failing test.** Use a real temp git repo for `gatherGit` and a mocked client for the handler.

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createMergeCommentCommand, gatherGit } from "./merge-comment.ts";
import { readPosted } from "../tokens/comments-store.ts";
import { recordAttached } from "../tokens/attachments-store.ts";

const git = (cwd: string, ...a: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd, encoding: "utf8" }).trim();

let dir: string, repo: string, base: string, head: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "dg178-"));
  process.env.DIGISMITH_TOKEN_REGISTRY_DIR = join(dir, "registry");
  repo = join(dir, "repo");
  mkdirSync(join(repo, ".claude-plugin"), { recursive: true });
  git(repo, "init", "-q", "-b", "main");
  writeFileSync(join(repo, "a.txt"), "1");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "chore: first");
  base = git(repo, "rev-parse", "HEAD");
  writeFileSync(join(repo, "a.txt"), "2");
  git(repo, "commit", "-q", "-am", "feat: second");
  head = git(repo, "rev-parse", "HEAD");
  writeFileSync(join(repo, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "digismith", version: "9.9.9" }));
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "chore: bump plugin version");
});
afterEach(() => {
  delete process.env.DIGISMITH_TOKEN_REGISTRY_DIR;
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
  process.exitCode = 0;
});

const out = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.flat().join("\n");
const run = (c: { handler: unknown }, argv: Record<string, unknown>) => (c.handler as (a: Record<string, unknown>) => Promise<void>)(argv);
const mockClient = () =>
  ({
    getTaskByRef: vi.fn().mockResolvedValue({ id: "t1", custom_id: "DGS-5", name: "n" }),
    addTaskComment: vi.fn().mockResolvedValue({ id: 91 }),
    getTaskComments: vi.fn().mockResolvedValue([{ id: "91" }]),
  }) as unknown as ClickUpClient & { addTaskComment: ReturnType<typeof vi.fn> };

describe("gatherGit", () => {
  it("lists commits in the range, resolves full shas and reads the version at HEAD", () => {
    const g = gatherGit(repo, base.slice(0, 7), head.slice(0, 7));
    expect(g.base).toBe(base);
    expect(g.head).toBe(head);
    expect(g.commits.map((c) => c.subject)).toEqual(["feat: second"]);
    expect(g.version).toBe("9.9.9");
  });
  it("leaves the version undefined with no plugin.json at HEAD", () => {
    const solo = join(dir, "solo");
    mkdirSync(solo);
    git(solo, "init", "-q", "-b", "main");
    writeFileSync(join(solo, "f"), "x");
    git(solo, "add", "-A");
    git(solo, "commit", "-q", "-m", "x");
    const h = git(solo, "rev-parse", "HEAD");
    expect(gatherGit(solo, h, h).version).toBeUndefined();
  });
  it("refuses a ref that is not a hex sha", () => {
    expect(() => gatherGit(repo, "main; rm", head)).toThrow("not a commit sha");
  });
});

describe("merge-comment command", () => {
  const argv = () => ({ task: "DGS-5", base, head, tests: "12 passed", decisions: "one", next: "none", splitOff: "none" });

  it("skips a non-ClickUp key without a network call", async () => {
    const c = mockClient();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(createMergeCommentCommand(() => c, () => repo), { ...argv(), task: "EMKT-9", yes: true });
    expect(out(log)).toContain("not a ClickUp key, skipped");
    expect(c.addTaskComment).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
  });
  it("dry run prints the comment and sends nothing, with no client built", async () => {
    const factory = vi.fn();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(createMergeCommentCommand(factory as never, () => repo), argv());
    expect(factory).not.toHaveBeenCalled();
    expect(out(log)).toContain("DGS-5 merged,");
    expect(out(log)).toContain("plugin 9.9.9");
    expect(out(log)).toContain("nothing sent; add --yes to send");
  });
  it("posts once with --yes, records the head, and a second run skips", async () => {
    const c = mockClient();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const cmd = createMergeCommentCommand(() => c, () => repo);
    await run(cmd, { ...argv(), yes: true });
    expect(c.addTaskComment).toHaveBeenCalledTimes(1);
    expect(String(c.addTaskComment.mock.calls[0][1])).toContain("Tests: 12 passed");
    expect(readPosted("DGS-5")[0].head).toBe(head);
    await run(cmd, { ...argv(), yes: true });
    expect(c.addTaskComment).toHaveBeenCalledTimes(1);
    expect(out(log)).toContain("skipped: already posted");
  });
  it("adds the report line only when report.html is recorded as attached", async () => {
    const folder = join(dir, "board");
    mkdirSync(folder);
    writeFileSync(join(folder, "report.html"), "<p>r</p>");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(createMergeCommentCommand(() => mockClient(), () => repo), { ...argv(), boardFolder: folder });
    expect(out(log)).not.toContain("Report:");
    recordAttached("DGS-5", { name: "report.html", sha256: "x", id: "a1", attached_at: "t" });
    log.mockClear();
    await run(createMergeCommentCommand(() => mockClient(), () => repo), { ...argv(), boardFolder: folder });
    expect(out(log)).toContain("Report: report.html is attached to this ticket.");
  });
  it("a post failure prints a warn: line, exits 1 and records nothing", async () => {
    const c = mockClient();
    (c.addTaskComment as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("429"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(createMergeCommentCommand(() => c, () => repo), { ...argv(), yes: true });
    expect(out(err)).toMatch(/^warn: merge-comment: 429/m);
    expect(process.exitCode).toBe(1);
    expect(readPosted("DGS-5")).toEqual([]);
  });
  it("a bad sha prints a warn: line and exits 1", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(createMergeCommentCommand(() => mockClient(), () => repo), { ...argv(), base: "nope" });
    expect(out(err)).toMatch(/^warn: merge-comment:/m);
    expect(process.exitCode).toBe(1);
  });
  it("passes --part to the headline", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(createMergeCommentCommand(() => mockClient(), () => repo), { ...argv(), part: "Part 2 of 3" });
    expect(out(log)).toContain("DGS-5 part merged,");
    expect(out(log)).toContain("Part 2 of 3.");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/clickup/merge-comment.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `merge-comment.ts`**

```ts
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CommandModule } from "yargs";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createClient } from "./lib.ts";
import { postComment } from "./add-comment.ts";
import { renderMergeComment, type CommitLine } from "./merge-comment-render.ts";
import { readPosted, recordPosted } from "../tokens/comments-store.ts";
import { readAttached } from "../tokens/attachments-store.ts";
import { commentBody } from "@digismith/clickup-client";
import { printCall } from "./task-type-write.ts";

const CLICKUP_KEY = /^DGS-\d+$/;
const SHA = /^[0-9a-f]{7,40}$/;

function git(repo: string, args: string[]): string {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

export function gatherGit(repo: string, base: string, head: string) {
  for (const s of [base, head]) if (!SHA.test(s)) throw new Error(`"${s}" is not a commit sha (7 to 40 hex characters)`);
  const fullBase = git(repo, ["rev-parse", "--verify", `${base}^{commit}`]);
  const fullHead = git(repo, ["rev-parse", "--verify", `${head}^{commit}`]);
  const log = git(repo, ["log", "--no-merges", "--reverse", "--format=%h%x09%s", `${fullBase}..${fullHead}`]);
  const commits: CommitLine[] = log === "" ? [] : log.split("\n").map((l) => {
    const [sha, ...rest] = l.split("\t");
    return { sha, subject: rest.join("\t") };
  });
  let version: string | undefined;
  try {
    const v = (JSON.parse(git(repo, ["show", "HEAD:.claude-plugin/plugin.json"])) as { version?: unknown }).version;
    if (typeof v === "string" && v !== "") version = v;
  } catch {
    version = undefined;
  }
  return { base: fullBase, head: fullHead, commits, version };
}

export function createMergeCommentCommand(clientFactory: () => ClickUpClient = createClient, repo: () => string = () => process.cwd()): CommandModule {
  return {
    command: "merge-comment",
    describe: "post the one progress comment for a merge on a ClickUp ticket; a dry run unless --yes; skips a head already posted; never blocks (a failure prints a warn: line)",
    builder: (y) =>
      y
        .option("task", { type: "string", requiresArg: true, demandOption: true, describe: "ticket key (DGS-178)" })
        .option("base", { type: "string", requiresArg: true, demandOption: true, describe: "branch tip before the merge (pin base)" })
        .option("head", { type: "string", requiresArg: true, demandOption: true, describe: "the merge commit (pin head)" })
        .option("tests", { type: "string", requiresArg: true, describe: "one line: the test result" })
        .option("decisions", { type: "string", requiresArg: true, describe: "up to 3 one-line spec decisions, one per line" })
        .option("next", { type: "string", requiresArg: true, describe: "one line: what is next" })
        .option("split-off", { type: "string", requiresArg: true, describe: "one line: tickets split off" })
        .option("part", { type: "string", requiresArg: true, describe: "label for a part-done comment, e.g. 'Part 2 of 3'" })
        .option("board-folder", { type: "string", requiresArg: true, describe: "the ticket's board folder, to find report.html" })
        .option("yes", { type: "boolean", default: false, describe: "post the comment (without it, only print it)" }),
    handler: async (argv) => {
      process.exitCode = 0;
      try {
        const key = String(argv.task ?? "").trim();
        if (!CLICKUP_KEY.test(key)) { console.log("not a ClickUp key, skipped"); return; }
        const g = gatherGit(repo(), String(argv.base ?? ""), String(argv.head ?? ""));
        const done = readPosted(key).find((r) => r.head === g.head);
        if (done) { console.log(`skipped: already posted for ${g.head.slice(0, 7)} (comment ${done.id})`); return; }
        const folder = argv.boardFolder ? String(argv.boardFolder) : "";
        const reportAttached = folder !== "" && existsSync(join(folder, "report.html")) && readAttached(key).some((r) => r.name === "report.html");
        const text = renderMergeComment({
          key,
          now: new Date(),
          base: g.base,
          head: g.head,
          version: g.version,
          commits: g.commits,
          tests: argv.tests as string | undefined,
          decisions: argv.decisions as string | undefined,
          next: argv.next as string | undefined,
          splitOff: argv.splitOff as string | undefined,
          part: argv.part as string | undefined,
          reportAttached,
        });
        if (!argv.yes) {
          printCall("POST", `/task/${key}/comment`, commentBody(text));
          console.log(text);
          console.log("nothing sent; add --yes to send");
          return;
        }
        const client = clientFactory();
        const t = await client.getTaskByRef(key);
        const created = await postComment(client, t.id, text);
        console.log(`added comment ${created.id} on ${key}; read back OK`);
        try {
          recordPosted(key, { head: g.head, id: String(created.id), posted_at: new Date().toISOString() });
        } catch {
          console.error(`warn: merge-comment: posted comment ${created.id} but the depot record failed; a rerun posts a copy`);
          process.exitCode = 1;
        }
      } catch (err) {
        console.error(`warn: merge-comment: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const mergeCommentCommand: CommandModule = createMergeCommentCommand();
```

Register in `index.ts`: `import { mergeCommentCommand } from "./merge-comment.ts";` and `.command(mergeCommentCommand)` after `.command(addCommentCommand)`. In `packages/cli/README.md`, add a short entry next to `add-comment`: command, flags, "dry run unless --yes", "skips a head already posted", "a failure prints a warn: line".

- [ ] **Step 4: Run to verify it passes, then the whole CLI package**

Run: `pnpm vitest run src/clickup/merge-comment.test.ts`
Expected: PASS (10 tests).
Run: `pnpm vitest run` (in `packages/cli`)
Expected: only failures that were already failing on main (compare with a clean `git stash`-free baseline run before starting; record both counts).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/clickup/merge-comment.ts packages/cli/src/clickup/merge-comment.test.ts packages/cli/src/clickup/index.ts packages/cli/README.md
git commit -m "feat(merge-comment): add dg clickup merge-comment"
```

---

### Task 5: Finishing skill step and wiring guard

**Files:**
- Modify: `skills/finishing-a-development-branch/SKILL.md` (Option 1: the `merged` event block near line 270-279, and a new block after the `attach-record` lines near line 312-318, before the `documented` paragraph)
- Test: `packages/cli/src/clickup/merge-comment.wiring.test.ts`

**Interfaces:**
- Consumes: `dg clickup merge-comment` flags from Task 4.

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../../..");
const text = readFileSync(resolve(root, "skills", "finishing-a-development-branch", "SKILL.md"), "utf8");
const option1 = text.slice(text.indexOf("### Option 1"), text.indexOf("### Option 2"));
const option2 = text.slice(text.indexOf("### Option 2"), text.indexOf("### Option 3"));

describe("finishing merge-comment wiring", () => {
  it("Option 1 posts the merge comment, ending || true", () => {
    const line = option1.split("\n").find((l) => l.trimStart().startsWith("dg clickup merge-comment"));
    expect(line).toBeDefined();
    expect(line!.trimEnd()).toMatch(/\|\| true$/);
    expect(line).toContain("--task <Key>");
    expect(line).toContain("--base <pre-merge-sha>");
    expect(line).toContain("--head <merge-commit-sha>");
    expect(line).toContain("--board-folder <board folder>");
    expect(line).toContain("--yes");
  });
  it("sits after the report attach and before documented", () => {
    const at = option1.indexOf("dg clickup merge-comment");
    expect(at).toBeGreaterThan(option1.indexOf("attach-record --task <Key> --file <board folder>/report.html"));
    expect(at).toBeLessThan(option1.indexOf("dg steward event documented"));
  });
  it("only Option 1 posts it", () => {
    expect(option2).not.toContain("merge-comment");
    expect(text.split("dg clickup merge-comment").length - 1).toBe(1);
  });
  it("reads both pins in the merged event block, before cleanup", () => {
    const merged = option1.indexOf("dg steward event merged");
    const cleanup = option1.indexOf("run the post-merge cleanup (Step 6)");
    const base = option1.indexOf("refs/digismith/post-finish/<feature-branch>/base");
    expect(base).toBeGreaterThan(-1);
    expect(cleanup).toBeGreaterThan(-1);
    expect(option1.indexOf("<pre-merge-sha>")).toBeLessThan(cleanup);
    expect(merged).toBeGreaterThan(-1);
  });
  it("names the ledger line on a printed warn: and never blocks", () => {
    expect(option1).toContain("append `Merge comment: failed (<that line>)` to the ledger when one exists");
    expect(option1).toMatch(/never blocks finishing/);
  });
  it("keeps the four free-text fields and the no-go list in the text", () => {
    for (const w of ["--tests", "--decisions", "--next", "--split-off"]) expect(option1).toContain(w);
    expect(option1).toMatch(/No status change, no file, no token number/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/clickup/merge-comment.wiring.test.ts`
Expected: FAIL (no merge-comment text in the skill).

- [ ] **Step 3: Edit the skill.**

(a) In the `merged` event paragraph, replace the sentence `` `<merge-commit-sha>` is `git rev-parse refs/digismith/post-finish/<feature-branch>/head`. `` with:

```
`<merge-commit-sha>` is `git rev-parse refs/digismith/post-finish/<feature-branch>/head`. Read `<pre-merge-sha>` now too: `git rev-parse refs/digismith/post-finish/<feature-branch>/base`. Keep both values: the cleanup (Step 6) deletes the pins, and the merge comment below needs them.
```

(b) After the `Same key rule as above. When the command prints a line that starts with `warn:`, ... conductor attaches the file. Status moves follow SOP DGS-731.` paragraph of Option 1 (the first one, before the `documented` paragraph), insert:

````
Then post the merge comment (DGS-178): one short progress comment on the ClickUp ticket, in a fixed shape the command renders (what merged, tests, decisions, next, split off, a pointer to the attached `report.html`). Same key rule as above; a Jira key or no key: skip silently. Pass four short plain-text fields: `--tests` the one-line test result, `--decisions` up to 3 one-line decisions from the spec that a reader would not assume from the ticket title (one per line), `--next` what is next (`none` when nothing), `--split-off` the tickets split off (`none` when nothing). Add `--part "Part 2 of 3"` only when the plan says this ticket merges in parts.

```bash
dg clickup merge-comment --task <Key> --base <pre-merge-sha> --head <merge-commit-sha> --board-folder <board folder> --tests "<result>" --decisions "<decision lines>" --next "<next>" --split-off "<tickets or none>" --yes || true
```

The command skips a head it already posted, so a re-run adds nothing. It prints its own line on a refusal or an error; `|| true` keeps a non-zero exit from blocking. When the command prints a line that starts with `warn:`, append `Merge comment: failed (<that line>)` to the ledger when one exists, and go on. A failed post never blocks finishing. No status change, no file, no token number goes into this comment. If the classifier blocks the command, tell your conductor; the conductor posts it.
````

(c) Option 2 and Option 3 get no change.

- [ ] **Step 4: Run the wiring test and the existing wiring test**

Run: `pnpm vitest run src/clickup/merge-comment.wiring.test.ts src/clickup/attach-hooks.wiring.test.ts`
Expected: PASS (the old test counts the `Attach record` sentence only, which this task does not change).

- [ ] **Step 5: Commit**

```bash
git add skills/finishing-a-development-branch/SKILL.md packages/cli/src/clickup/merge-comment.wiring.test.ts
git commit -m "feat(merge-comment): finishing posts the merge comment"
```

---

## Self-Review

1. **Spec coverage:** D1 command (Task 4); D2 inputs (Task 4 flags, missing fields in Task 2); D3 computed facts (Task 4 `gatherGit`, Task 2 time, report pointer in Task 4); D4 shape (Task 2 test is the exact shape); D5 no duplicate (Tasks 3, 4); D6 `--part` (Tasks 2, 4, skill line); D7 `postComment` (Task 1); D8 never blocks (Task 4 `warn:`, Task 5 `|| true` and ledger line); D9 placement and pins (Task 5 a and b); D10 wiring guard (Task 5). Out-of-scope items have no task, as intended. Q1-Q3 answers are built in: D4 shape verbatim, decisions max 3 one-liners, `notify_all: false` through the unchanged client.
2. **Placeholders:** none; every code step has code.
3. **Type consistency:** `CommitLine`, `MergeCommentInput` (Task 2) are used unchanged in Task 4; `postComment(client, taskId, text)` (Task 1) is called with `t.id` in Task 4; `readPosted`/`recordPosted` field names (`head`, `id`, `posted_at`) match in Tasks 3 and 4; flag `--split-off` becomes `argv.splitOff` (yargs camel-cases, as `markdownFile` does in add-comment).

## Notes for the builder

- Plugin version comes from `HEAD` after the post-finish hooks, because hook 01's bump is a separate commit after the merge commit.
- No live ClickUp call in any test. First real use is the next merge; verify by reading that ticket's comments.
- Run order matters: Task 1 before Task 4. Tasks 2 and 3 are independent of each other.

---

## Definition of Ready (DGS-660)

Checked 2026-11-14 by `dgs-178-refine`, reads only. Nothing was moved or written.

| Item | State |
|---|---|
| Spec | Approved by the Maestro (Jack approved the comment shape). `spec.md` in this folder; the plugin-version and pin facts corrected and approved at checkpoint 2. |
| Plan | Approved at checkpoint 2. 5 test-first tasks, `plan.md` in this folder. |
| Build tickets | One: DGS-178 itself. No split. Tasks 1 to 4 are CLI code, Task 5 is one skill edit that needs Task 4's flags; a split would give two merges and two reviews for about 200 lines, and no parallel gain (Task 5 waits on Task 4). One worker, one merge, one comment of its own. |
| Blockers | None open. Dependencies on the ticket: none. Linked: DGS-470 (epic, in progress), DGS-547 (merged, status `documented`), DGS-549 (done). The code it reuses (`add-comment`, `attach-record`, the `merged` event block) is on main at plugin 1.77.0. DGS-732 (factory stuck) blocks only an autonomous claim, not this ticket (Mode Manual). |
| Mode | **Manual**, as the pitch says. Reason: the factory is stuck (DGS-732), and the build edits the finishing skill, which every build runs; hand-built with attended review. Back to Autonomous only after DGS-732 and a Maestro decision. |
| Sign-off | **Auto**, as the pitch says. Reason: internal tooling, the shape was set by the October model comments and Jack approved the shape at checkpoint 1. Done at merge + push. |
| Milestone | Pitch: Genesis. The ticket read shows no Milestone value; the conductor sets Genesis. For tracking only; it never blocks a claim. |
| Priority | high (set). |

Build notes for whoever picks it up:
- Commit scope `merge-comment`, never `dgs-178` (the factory scan reads a key scope as merged). Board files (spec, plan, report) commit with scope `board`.
- No live ClickUp call in any test. First real use: the next merge after this one lands. Verify by reading that ticket's comments, and by one dry run of `dg clickup merge-comment` without `--yes` before relying on it.
- Run the full `packages/cli` suite before and after; only the failures already on main may remain.
- Plugin update after the merge (hooks 01 to 03, `/reload-plugins`) so finishing reads the new step.
