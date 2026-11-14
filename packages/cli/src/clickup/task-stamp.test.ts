import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { chmodSync, mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createDepotRegistry } from "../tokens/registry.ts";
import { readStamps } from "../tokens/stamps-store.ts";
import { writeTranscript, writeSubagent } from "../tokens/fixtures.test-util.ts";
import { createTaskStampCommand, parseTaskStampArgv } from "./task-stamp.ts";
import { handlerOf } from "./handler-of.test-util.ts";

type Argv = Record<string, unknown>;
const KEY = "DGS-546";
let dir: string, projects: string, ledger: string, findings: string;
const saved = { reg: process.env.DIGISMITH_TOKEN_REGISTRY_DIR, proj: process.env.DIGISMITH_CLAUDE_PROJECTS_DIR };
const out = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.flat().join("\n");

interface Fake { client: ClickUpClient; post: ReturnType<typeof vi.fn>; getTaskByRef: ReturnType<typeof vi.fn>; all: ReturnType<typeof vi.fn>; back: ReturnType<typeof vi.fn> }
function fake(opts: { existing?: { id: string; comment_text: string }[]; postFails?: boolean; backMisses?: boolean; backFails?: boolean } = {}): Fake {
  const posted: { id: string; comment_text: string }[] = [];
  const getTaskByRef = vi.fn().mockResolvedValue({ id: "tid1", custom_id: KEY, name: "n" });
  const post = vi.fn(async (_id: string, text: string) => {
    if (opts.postFails) throw new Error("status code 500");
    posted.push({ id: "c77", comment_text: text });
    return { id: 77 };
  });
  const all = vi.fn(async () => [...(opts.existing ?? []), ...posted]);
  const back = vi.fn(async () => {
    if (opts.backFails) throw new Error("status code 429");
    return opts.backMisses ? [{ id: "1" }] : [...posted.map((p) => ({ id: "77", comment_text: p.comment_text }))];
  });
  const client = { getTaskByRef, addTaskComment: post, getAllTaskComments: all, getTaskComments: back } as unknown as ClickUpClient;
  return { client, post, getTaskByRef, all, back };
}
const run = (f: Fake, argv: Argv) => handlerOf<Argv>(createTaskStampCommand(() => f.client))({ task: KEY, planTask: "1", ledger, ...argv });

function seed(opts: { sessions?: string[]; end1?: boolean; extra?: (reg: ReturnType<typeof createDepotRegistry>) => void; ticket?: string } = {}) {
  const ticket = opts.ticket ?? KEY;
  const reg = createDepotRegistry(dir);
  for (const s of opts.sessions ?? ["s1"]) reg.append({ kind: "session", ticket, session_id: s, source: "t", role: "worker", ts: "2026-11-02T09:00:00Z" });
  reg.append({ kind: "task_start", ticket, task: "1", session_id: "s1", ts: "2026-11-02T10:00:00Z" });
  if (opts.end1 !== false) reg.append({ kind: "task_end", ticket, task: "1", session_id: "s1", ts: "2026-11-02T10:05:00Z" });
  opts.extra?.(reg);
  writeTranscript(projects, "s1", [{ id: "m1", req: "r1", ts: "2026-11-02T10:01:00Z", input: 1000, output: 500 }]);
}
const stampsFile = () => join(dir, `${KEY}.stamps.jsonl`);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "dgs546-t6-"));
  projects = join(dir, "projects");
  ledger = join(dir, "progress.md");
  findings = join(dir, "findings.md");
  process.env.DIGISMITH_TOKEN_REGISTRY_DIR = dir;
  process.env.DIGISMITH_CLAUDE_PROJECTS_DIR = projects;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = 0;
  rmSync(dir, { recursive: true, force: true });
  for (const [k, v] of [["DIGISMITH_TOKEN_REGISTRY_DIR", saved.reg], ["DIGISMITH_CLAUDE_PROJECTS_DIR", saved.proj]] as const) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

describe("parseTaskStampArgv", () => {
  it("checks flags without network", () => {
    expect(parseTaskStampArgv({ task: "DGS-1", planTask: "2" })).toMatchObject({ task: "DGS-1", planTask: "2", all: false, yes: false });
    expect(parseTaskStampArgv({ task: "DGS-1", planTask: "final" }).planTask).toBe("final");
    expect(() => parseTaskStampArgv({ task: "", planTask: "1" })).toThrow("--task");
    expect(() => parseTaskStampArgv({ task: "DGS-1" })).toThrow("--plan-task");
    expect(() => parseTaskStampArgv({ task: "DGS-1", planTask: "a b" })).toThrow("--plan-task");
    expect(parseTaskStampArgv({ task: "DGS-1", all: true }).all).toBe(true);
  });
});

describe("task-stamp", () => {
  it("dry run prints the comment and the call and writes nothing", async () => {
    seed();
    const f = fake();
    await run(f, {});
    expect(out(console.log as never)).toContain("Hallmark task 1 of DGS-546");
    expect(out(console.log as never)).toContain("POST /task/tid1/comment");
    expect(f.post).not.toHaveBeenCalled();
    expect(existsSync(ledger)).toBe(false);
    expect(existsSync(stampsFile())).toBe(false);
    expect(process.exitCode).toBe(0);
  });

  it("--yes posts once, writes the ledger and stamps lines and reads back", async () => {
    seed();
    const f = fake();
    await run(f, { yes: true });
    expect(f.post).toHaveBeenCalledTimes(1);
    expect(String(f.post.mock.calls[0][1]).split("\n")[0]).toBe("Hallmark task 1 of DGS-546");
    expect(f.back).toHaveBeenCalled();
    expect(readFileSync(ledger, "utf8")).toContain("Task 1: stamped (comment 77)");
    const s = readStamps(KEY);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ task: "1", comment_id: "77", partial: false });
    expect(process.exitCode).toBe(0);
  });

  it("the stamps line keeps active time in agent_seconds and the wall window in window_seconds", async () => {
    seed();
    await run(fake(), { yes: true });
    const s = readStamps(KEY)[0];
    expect(s.window_seconds).toBe(300);
    // the seed has one response (10:01:00) in the window: no gap between two responses, so 0 active seconds
    expect(s.agent_seconds).toBe(0);
  });

  it("second run: ledger, then stamps file, then ticket comments (second page)", async () => {
    seed();
    await run(fake(), { yes: true });
    const f2 = fake();
    await run(f2, { yes: true });
    expect(out(console.log as never)).toContain("already stamped (ledger)");
    expect(f2.post).not.toHaveBeenCalled();

    writeFileSync(ledger, "");
    const f3 = fake();
    await run(f3, { yes: true });
    expect(out(console.log as never)).toContain("already stamped (stamps file)");
    expect(f3.post).not.toHaveBeenCalled();

    rmSync(stampsFile());
    const page1 = Array.from({ length: 25 }, (_, i) => ({ id: String(i), comment_text: `other ${i}` }));
    const f4 = fake({ existing: [...page1, { id: "99", comment_text: "Hallmark task 1 of DGS-546\nWindow: x" }] });
    await run(f4, { yes: true });
    expect(out(console.log as never)).toContain("already stamped (ticket comments)");
    expect(f4.post).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
  });

  it("a task 10 comment does not block task 1", async () => {
    seed();
    const f = fake({ existing: [{ id: "5", comment_text: "Hallmark task 10 of DGS-546\nx" }, { id: "6", comment_text: "see Hallmark task 1 of DGS-546 above" }] });
    await run(f, { yes: true });
    expect(f.post).toHaveBeenCalledTimes(1);
  });

  it("a task without task_end prints task not ended and posts nothing", async () => {
    seed({ end1: false });
    const f = fake();
    await run(f, { yes: true });
    expect(out(console.log as never)).toContain("task not ended");
    expect(f.post).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
  });

  it("a non-ClickUp key is skipped", async () => {
    const f = fake();
    await run(f, { task: "ABC-1", yes: true });
    expect(out(console.log as never)).toContain("not a ClickUp key, skipped");
    expect(f.getTaskByRef).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
  });

  it("accepts an OCL key", async () => {
    seed({ ticket: "OCL-105" });
    const f = fake();
    await run(f, { task: "OCL-105", yes: true });
    expect(out(console.log as never)).not.toContain("not a ClickUp key");
    expect(f.getTaskByRef).toHaveBeenCalledWith("OCL-105");
  });

  it("still skips an unknown prefix", async () => {
    const f = fake({});
    await run(f, { task: "ABC-1", yes: true });
    expect(out(console.log as never)).toContain("not a ClickUp key, skipped");
    expect(f.getTaskByRef).not.toHaveBeenCalled();
  });

  it("a client that throws on post gives one warn line, exit 1, no ledger line", async () => {
    seed();
    const f = fake({ postFails: true });
    await run(f, { yes: true });
    const lines = (console.error as never as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[0]));
    expect(lines.filter((l) => l.startsWith("warn:"))).toHaveLength(1);
    expect(process.exitCode).toBe(1);
    expect(existsSync(ledger)).toBe(false);
    expect(existsSync(stampsFile())).toBe(false);
  });

  it("a read-back mismatch says do not send again and still writes the stamps line", async () => {
    seed();
    const f = fake({ backMisses: true });
    await run(f, { yes: true });
    expect(out(console.error as never)).toContain("do not send again");
    expect(process.exitCode).toBe(1);
    expect(readStamps(KEY)).toHaveLength(1);
    expect(readFileSync(ledger, "utf8")).toContain("Task 1: stamped (comment 77)");
  });

  it("a failed read-back also says do not send again", async () => {
    seed();
    await run(fake({ backFails: true }), { yes: true });
    expect(out(console.error as never)).toContain("do not send again");
    expect(readStamps(KEY)).toHaveLength(1);
  });

  it("final posts the final review heading", async () => {
    seed({
      extra: (reg) => {
        reg.append({ kind: "task_start", ticket: KEY, task: "final", session_id: "s1", ts: "2026-11-02T11:00:00Z" });
        reg.append({ kind: "task_end", ticket: KEY, task: "final", session_id: "s1", ts: "2026-11-02T11:10:00Z" });
      },
    });
    const f = fake();
    await run(f, { planTask: "final", yes: true });
    expect(String(f.post.mock.calls[0][1]).split("\n")[0]).toBe("Hallmark final review of DGS-546");
    expect(readStamps(KEY)[0].task).toBe("final");
  });

  it("a bullet-prefixed stamped ledger line counts as stamped", async () => {
    seed();
    writeFileSync(ledger, "- Task 1: stamped (comment 5)\n");
    const f = fake();
    await run(f, { yes: true });
    expect(out(console.log as never)).toContain("already stamped (ledger)");
    expect(f.post).not.toHaveBeenCalled();
  });

  it("--all stamps every ended task plus final, skips stamped ones, one line per task", async () => {
    seed({
      extra: (reg) => {
        reg.append({ kind: "task_start", ticket: KEY, task: "2", session_id: "s1", ts: "2026-11-02T10:10:00Z" });
        reg.append({ kind: "task_end", ticket: KEY, task: "2", session_id: "s1", ts: "2026-11-02T10:15:00Z" });
        reg.append({ kind: "task_start", ticket: KEY, task: "3", session_id: "s1", ts: "2026-11-02T10:20:00Z" });
        reg.append({ kind: "task_start", ticket: KEY, task: "final", session_id: "s1", ts: "2026-11-02T11:00:00Z" });
        reg.append({ kind: "task_end", ticket: KEY, task: "final", session_id: "s1", ts: "2026-11-02T11:10:00Z" });
      },
    });
    writeFileSync(ledger, "Task 1: stamped (comment 5)\n");
    const f = fake();
    await run(f, { planTask: undefined, all: true, yes: true });
    expect(f.post).toHaveBeenCalledTimes(2);
    const log = out(console.log as never);
    expect(log).toContain("task 1: already stamped (ledger)");
    expect(log).toContain("task 2: stamped (comment 77)");
    expect(log).toContain("task final: stamped (comment 77)");
    expect(log).not.toContain("task 3");
    expect(process.exitCode).toBe(0);
  });

  it("review data comes from the ledger, then --findings, else not recorded", async () => {
    seed();
    writeFileSync(ledger, "Task 1: reviewed (2 findings)\nTask 1: parked\nTask 1: fix round 1/3\n");
    await run(fake(), {});
    expect(out(console.log as never)).toContain("Reviews: 1 round | Findings: 2");

    vi.mocked(console.log).mockClear();
    writeFileSync(ledger, "");
    writeFileSync(findings, "| Reviewer type | Round | A | B | C | D | Verdict |\n|---|---|---|---|---|---|---|\n| task 1 | 2 | x | y | f1 | z | fixed |\n");
    await run(fake(), { findings });
    expect(out(console.log as never)).toContain("Reviews: 2 rounds | Findings: 1 (1 fixed");

    vi.mocked(console.log).mockClear();
    await run(fake(), {});
    expect(out(console.log as never)).toContain("Reviews: not recorded | Findings: not recorded | Fix rounds: not recorded");
  });

  it("one session without a transcript gives the Partial line and partial: true", async () => {
    seed({ sessions: ["s1", "s2"] });
    const f = fake();
    await run(f, { yes: true });
    expect(String(f.post.mock.calls[0][1])).toContain("Partial: 1 session(s) without transcript");
    expect(readStamps(KEY)[0].partial).toBe(true);
  });

  it("no readable session at all refuses --yes", async () => {
    const reg = createDepotRegistry(dir);
    reg.append({ kind: "session", ticket: KEY, session_id: "gone", source: "t", role: "worker", ts: "2026-11-02T09:00:00Z" });
    reg.append({ kind: "task_start", ticket: KEY, task: "1", session_id: "gone", ts: "2026-11-02T10:00:00Z" });
    reg.append({ kind: "task_end", ticket: KEY, task: "1", session_id: "gone", ts: "2026-11-02T10:05:00Z" });
    const f = fake();
    await run(f, { yes: true });
    expect(f.post).not.toHaveBeenCalled();
    expect(out(console.error as never).split("\n").filter((l) => l.startsWith("warn:"))).toHaveLength(1);
    expect(process.exitCode).toBe(1);
  });

  it("a subagent response outside the window counts through a dispatch ledger line", async () => {
    seed();
    writeSubagent(projects, "s1", "ag1", [{ id: "sa1", req: "ra1", ts: "2026-11-02T12:00:00Z", input: 7000, output: 1 }]);
    writeFileSync(ledger, "Task 1: dispatch implementer agent=ag1\n");
    await run(fake(), {});
    expect(out(console.log as never)).toContain("(2 responses)");
  });

  it("a ledger append that fails after the post says the comment was posted and not to send again", async () => {
    seed();
    writeFileSync(ledger, "");
    chmodSync(ledger, 0o444); // readable, not writable: the append throws
    const f = fake();
    await run(f, { yes: true });
    expect(f.post).toHaveBeenCalledTimes(1);
    const lines = (console.error as never as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith("warn:"));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("comment 77");
    expect(lines[0]).toContain("do not send again");
    expect(readStamps(KEY)).toHaveLength(1);
    expect(process.exitCode).toBe(1);
  });

  it("--all skips an invalid registry task id with one warn line and goes on", async () => {
    seed({
      extra: (reg) => {
        reg.append({ kind: "task_start", ticket: KEY, task: "x-y", session_id: "s1", ts: "2026-11-02T10:10:00Z" });
        reg.append({ kind: "task_end", ticket: KEY, task: "x-y", session_id: "s1", ts: "2026-11-02T10:15:00Z" });
      },
    });
    const f = fake();
    await run(f, { planTask: undefined, all: true, yes: true });
    const warns = out(console.error as never).split("\n").filter((l) => l.startsWith("warn:"));
    expect(warns).toHaveLength(1);
    expect(warns[0]).toContain("x-y");
    expect(f.post).toHaveBeenCalledTimes(1);
    expect(out(console.log as never)).toContain("task 1: stamped (comment 77)");
  });
});
