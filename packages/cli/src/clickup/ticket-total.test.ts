import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createDepotRegistry } from "../tokens/registry.ts";
import { appendStamp, type StampLine } from "../tokens/stamps-store.ts";
import { START, END } from "../tokens/hallmark-block.ts";
import { writeTranscript } from "../tokens/fixtures.test-util.ts";
import { createTicketTotalCommand } from "./ticket-total.ts";
import { handlerOf } from "./handler-of.test-util.ts";

type Argv = Record<string, unknown>;
const KEY = "DGS-546";
let dir: string, projects: string;
const saved = { reg: process.env.DIGISMITH_TOKEN_REGISTRY_DIR, proj: process.env.DIGISMITH_CLAUDE_PROJECTS_DIR };
const out = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.flat().join("\n");

interface Desc { description?: string; markdown_description?: string }
function fake(initial: Desc, opts: { updateFails?: boolean; readBack?: (written: string) => Desc; getFails?: boolean } = {}) {
  let current: Desc = initial;
  const getTaskByRef = vi.fn(async () => {
    if (opts.getFails) throw new Error("status code 500");
    return { id: "tid1", custom_id: KEY, name: "n", ...current };
  });
  const updateTask = vi.fn(async (_id: string, body: { markdown_description?: string }) => {
    if (opts.updateFails) throw new Error("status code 500");
    const w = body.markdown_description as string;
    current = opts.readBack ? opts.readBack(w) : { description: w, markdown_description: w };
    return {};
  });
  return { client: { getTaskByRef, updateTask } as unknown as ClickUpClient, getTaskByRef, updateTask };
}
type Fake = ReturnType<typeof fake>;
const run = (f: Fake, argv: Argv = {}) => handlerOf<Argv>(createTicketTotalCommand(() => f.client))({ task: KEY, ...argv });

function stamp(task: string, cost: number, seconds: number, findings: number, fixRounds: number): StampLine {
  return {
    task, comment_id: "c", window_start: "2026-11-02T10:00:00Z", window_end: "2026-11-02T10:05:00Z", agent_seconds: seconds,
    models: { "claude-opus-5-5": { input: 1, output: 1, cache_read: 0, cache_write_5m: 0, cache_write_1h: 0, responses: 1, cost_usd: cost } },
    reviews: { rounds: 1, findings, fixed: findings, parked: 0, rejected: 0, open: 0, fix_rounds: fixRounds, source: "ledger" },
    partial: false, stamped_at: "2026-11-02T10:06:00Z",
  };
}

function seed(extra?: (reg: ReturnType<typeof createDepotRegistry>) => void) {
  const reg = createDepotRegistry(dir);
  reg.append({ kind: "session", ticket: KEY, session_id: "s1", source: "t", role: "worker", ts: "2026-11-02T09:00:00Z" });
  reg.append({ kind: "task_start", ticket: KEY, task: "1", session_id: "s1", ts: "2026-11-02T10:00:00Z" });
  reg.append({ kind: "task_end", ticket: KEY, task: "1", session_id: "s1", ts: "2026-11-02T10:05:00Z" });
  extra?.(reg);
  writeTranscript(projects, "s1", [
    { id: "m1", req: "r1", ts: "2026-11-02T10:01:00Z", input: 1000, output: 500 },
    { id: "m2", req: "r2", ts: "2026-11-02T12:00:00Z", input: 2000, output: 100 }, // outside any task window
  ]);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "dgs546-t7-"));
  projects = join(dir, "projects");
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

const warns = () => out(console.error as never).split("\n").filter((l) => l.startsWith("warn:"));

describe("ticket-total", () => {
  it("reads the description with include_markdown_description", async () => {
    seed(); appendStamp(KEY, stamp("1", 0.4635, 104, 0, 0));
    const f = fake({ description: "Intro", markdown_description: "Intro" });
    await run(f);
    expect(f.getTaskByRef).toHaveBeenCalledWith(KEY, { include_markdown_description: true });
  });

  it("dry run prints the new description and the call and writes nothing", async () => {
    seed(); appendStamp(KEY, stamp("1", 0.4635, 104, 0, 0));
    const f = fake({ description: "Intro", markdown_description: "Intro" });
    await run(f);
    const log = out(console.log as never);
    expect(log).toContain(START);
    expect(log).toContain("PUT /task/tid1");
    expect(log).toContain("| 1 | 1 min 44 s | $0.4635 | 0 | 0 |");
    expect(log).toContain("nothing sent");
    expect(f.updateTask).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
  });

  it("totals sum every response of the ticket's sessions, including outside any task window", async () => {
    seed(); appendStamp(KEY, stamp("1", 0.4635, 104, 0, 0));
    await run(fake({ description: "", markdown_description: "" }));
    expect(out(console.log as never)).toContain("Total: in 3000, out 600,");
  });

  it("does not add a replayed response from another session", async () => {
    seed();
    writeTranscript(projects, "other", [{ id: "m1", req: "r1", ts: "2026-11-02T10:01:00Z", input: 1000, output: 500 }, { id: "x1", req: "rx", ts: "2026-11-02T10:02:00Z", input: 9999, output: 9999 }]);
    appendStamp(KEY, stamp("1", 0.4635, 104, 0, 0));
    await run(fake({ description: "", markdown_description: "" }));
    expect(out(console.log as never)).toContain("Total: in 3000, out 600,");
  });

  it("a task with task_end and no stamp shows (not stamped) and not recorded", async () => {
    seed();
    await run(fake({ description: "", markdown_description: "" }));
    const log = out(console.log as never);
    expect(log).toContain("| 1 (not stamped) | 5 min |");
    expect(log).toContain("| not recorded | not recorded |");
  });

  it("--yes writes once with markdown_description and reads back", async () => {
    seed(); appendStamp(KEY, stamp("1", 0.4635, 104, 0, 0));
    const f = fake({ description: "Intro\n\nmore", markdown_description: "Intro\n\nmore" });
    await run(f, { yes: true });
    expect(f.updateTask).toHaveBeenCalledTimes(1);
    const [id, body] = f.updateTask.mock.calls[0] as unknown as [string, { markdown_description: string }];
    expect(id).toBe("tid1");
    expect(body.markdown_description.startsWith("Intro\n\nmore\n\n" + START)).toBe(true);
    expect(f.getTaskByRef).toHaveBeenCalledTimes(2);
    expect(process.exitCode).toBe(0);
  });

  it("a read-back that does not hold both sentinels once warns, exits 1, never writes twice", async () => {
    seed(); appendStamp(KEY, stamp("1", 0.4635, 104, 0, 0));
    const f = fake({ description: "Intro", markdown_description: "Intro" }, { readBack: (w) => ({ description: w.replace(START, "x"), markdown_description: w.replace(START, "x") }) });
    await run(f, { yes: true });
    expect(f.updateTask).toHaveBeenCalledTimes(1);
    expect(warns()).toHaveLength(1);
    expect(process.exitCode).toBe(1);

    const g = fake({ description: "Intro", markdown_description: "Intro" }, { readBack: (w) => ({ markdown_description: w + "\n" + END }) });
    await run(g, { yes: true });
    expect(g.updateTask).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(1);
  });

  it("replaces the escaped legacy block now on a ticket", async () => {
    seed(); appendStamp(KEY, stamp("1", 0.4635, 104, 0, 0));
    const old = "Intro\n\n\\--- Hallmark (dg clickup ticket-total) ---\n\nTotal: x\n\n\\--- end Hallmark ---\n\nTail";
    const f = fake({ description: old, markdown_description: old });
    await run(f, { yes: true });
    const w = (f.updateTask.mock.calls[0] as unknown as [string, { markdown_description: string }])[1].markdown_description;
    expect(w.startsWith("Intro\n\n" + START)).toBe(true);
    expect(w.endsWith(END + "\n\nTail")).toBe(true);
    expect(w).not.toContain("\\");
    expect(process.exitCode).toBe(0);
  });

  it("a read-back that still holds a legacy sentinel fails", async () => {
    seed(); appendStamp(KEY, stamp("1", 0.4635, 104, 0, 0));
    const f = fake({ description: "Intro", markdown_description: "Intro" }, { readBack: (w) => ({ markdown_description: w + "\n\\--- end Hallmark ---" }) });
    await run(f, { yes: true });
    expect(f.updateTask).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(1);
  });

  it("both forms present: warn, exit 1, no write", async () => {
    seed(); appendStamp(KEY, stamp("1", 0.4635, 104, 0, 0));
    const both = `${START}\nx\n${END}\n\n--- Hallmark (dg clickup ticket-total) ---\n--- end Hallmark ---`;
    const f = fake({ description: both, markdown_description: both });
    await run(f, { yes: true });
    expect(f.updateTask).not.toHaveBeenCalled();
    expect(warns()).toHaveLength(1);
    expect(process.exitCode).toBe(1);
  });

  it("refuses when markdown_description is missing or empty while description is not", async () => {
    seed(); appendStamp(KEY, stamp("1", 0.4635, 104, 0, 0));
    for (const d of [{ description: "Text" }, { description: "Text", markdown_description: "" }]) {
      process.exitCode = 0;
      const f = fake(d);
      await run(f, { yes: true });
      expect(f.updateTask).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    }
    expect(warns().length).toBeGreaterThanOrEqual(2);
  });

  it("refuses to write with no tasks and zero totals", async () => {
    const f = fake({ description: "Intro", markdown_description: "Intro" });
    await run(f, { yes: true });
    expect(f.updateTask).not.toHaveBeenCalled();
    expect(warns()).toHaveLength(1);
    expect(process.exitCode).toBe(1);
  });

  it("partial data adds the Partial line", async () => {
    seed((reg) => reg.append({ kind: "session", ticket: KEY, session_id: "gone", source: "t", role: "worker", ts: "2026-11-02T09:00:00Z" }));
    appendStamp(KEY, stamp("1", 0.4635, 104, 0, 0));
    await run(fake({ description: "", markdown_description: "" }));
    expect(out(console.log as never)).toContain("Partial: 1 session(s) without transcript");
  });

  it("a second run replaces the block in place", async () => {
    seed(); appendStamp(KEY, stamp("1", 0.4635, 104, 0, 0));
    const f = fake({ description: "Intro", markdown_description: "Intro" });
    await run(f, { yes: true });
    await run(f, { yes: true });
    const second = (f.updateTask.mock.calls[1] as unknown as [string, { markdown_description: string }])[1].markdown_description;
    expect(second.split(START)).toHaveLength(2);
    expect(second.startsWith("Intro\n\n")).toBe(true);
  });

  it("a client failure gives one warn line and exit 1", async () => {
    seed(); appendStamp(KEY, stamp("1", 0.4635, 104, 0, 0));
    await run(fake({}, { getFails: true }), { yes: true });
    expect(warns()).toHaveLength(1);
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
    const f = fake({ description: "Intro", markdown_description: "Intro" }, { updateFails: true });
    await run(f, { yes: true });
    expect(warns().length).toBeGreaterThanOrEqual(2);
    expect(process.exitCode).toBe(1);
  });

  it("a non-ClickUp key is skipped", async () => {
    const f = fake({});
    await run(f, { task: "ABC-1", yes: true });
    expect(out(console.log as never)).toContain("not a ClickUp key, skipped");
    expect(f.getTaskByRef).not.toHaveBeenCalled();
  });
});
