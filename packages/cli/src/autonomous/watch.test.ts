import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRun } from "../run/record.ts";
import { findRunDir } from "../run/paths.ts";
import { readOpen } from "./attention.ts";
import { runWatch, type WatchDeps } from "./watch.ts";

const NOW = Date.parse("2026-10-22T10:00:00Z");
const ago = (min: number): string => new Date(NOW - min * 60_000).toISOString();

let tmp: string;
let dir: string;
let cwd: string;
let env: NodeJS.ProcessEnv;
let calls: string[][];
let present: Set<string> | null;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "nw-watch-"));
  dir = join(tmp, "autonomous");
  cwd = join(tmp, "repo");
  mkdirSync(cwd, { recursive: true });
  env = { DIGISMITH_DEPOT_DIR: join(tmp, "depot"), AUTONOMOUS_DIR: dir };
  calls = [];
  present = new Set();
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

function mk(ticket: string, role: string, createdMin: number, evs: [number, string][], opts: { workspace?: string | null; pane?: string } = {}): string {
  const rec = createRun({ ticket, role, order: "/o.md", workspace: opts.workspace === null ? undefined : (opts.workspace ?? "w2"), pane: opts.pane ?? `w2:${ticket}` }, env, new Date(NOW - createdMin * 60_000));
  const rd = findRunDir(rec.run, env)!;
  const lines = evs.map(([m, type], i) => JSON.stringify({ schema: "nightwatch-event/v1", seq: i + 1, ts: ago(m), run: rec.run, type, data: {} }));
  if (lines.length) writeFileSync(join(rd, "events.jsonl"), lines.join("\n") + "\n");
  return rec.run;
}
const addEvent = (run: string, m: number, type: string, seq: number): void => {
  const rd = findRunDir(run, env)!;
  writeFileSync(join(rd, "events.jsonl"), JSON.stringify({ schema: "nightwatch-event/v1", seq, ts: ago(m), run, type, data: {} }) + "\n", { flag: "a" });
};

const deps = (over: Partial<WatchDeps> = {}): WatchDeps => ({
  env, dir, cwd, now: () => NOW,
  panes: async () => present,
  runDg: async (args) => { calls.push(args); return { ok: true }; },
  dryRun: false,
  ...over,
});

function fiveRuns(): void {
  present = new Set(["w2:DGS-1", "w2:DGS-2", "w2:DGS-3", "w2:DGS-5"]);
  mk("DGS-1", "builder", 12, [[10, "started"], [1, "tool"]]);
  mk("DGS-2", "builder", 22, [[20, "started"], [5, "blocked"]]);
  mk("DGS-3", "builder", 52, [[50, "started"], [1, "tool"]]);
  mk("DGS-4", "builder", 12, [[10, "started"], [1, "tool"]]); // pane w2:DGS-4 absent
  mk("DGS-5", "builder", 22, [[20, "started"], [15, "ended"]]);
}

describe("runWatch", () => {
  it("opens blocked, stalled and lost, comments once each, and a second pass adds nothing", async () => {
    fiveRuns();
    const r = await runWatch(deps());
    expect(r.opened).toBe(3);
    expect(readOpen(dir).map((i) => i.kind).sort()).toEqual(["blocked", "lost", "stalled"]);
    expect(r.commented).toBe(3);
    expect(calls).toHaveLength(3);
    const r2 = await runWatch(deps());
    expect(r2.opened).toBe(0);
    expect(r2.commented).toBe(0);
    expect(calls).toHaveLength(3);
  });

  it("resolves a blocked item when the run moves on, but never a lost one", async () => {
    fiveRuns();
    await runWatch(deps());
    const blocked = readOpen(dir).find((i) => i.kind === "blocked")!;
    addEvent(blocked.run, 0, "tool", 3);
    present?.add("w2:DGS-4");
    const r = await runWatch(deps());
    expect(r.opened).toBe(0);
    expect(r.resolved).toBe(1);
    expect(readFileSync(join(dir, "attention.jsonl"), "utf-8")).toContain('"resolved":true');
    expect(readOpen(dir).map((i) => i.kind).sort()).toEqual(["lost", "stalled"].sort());
  });

  it("closes the blocked item and opens a stalled one when the run moves blocked -> stalled", async () => {
    present = new Set(["w2:DGS-1"]);
    const run = mk("DGS-1", "builder", 52, [[50, "started"], [5, "blocked"]]);
    await runWatch(deps());
    expect(readOpen(dir).map((i) => i.kind)).toEqual(["blocked"]);
    addEvent(run, 0, "tool", 3);
    const r = await runWatch(deps());
    expect(r.opened).toBe(1);
    expect(r.resolved).toBe(1);
    expect(readOpen(dir).map((i) => i.kind)).toEqual(["stalled"]);
    expect(readFileSync(join(dir, "attention.jsonl"), "utf-8")).toContain('"by":"watchdog"');
  });

  it("closes the stalled item and opens a blocked one when the run moves stalled -> blocked", async () => {
    present = new Set(["w2:DGS-1"]);
    const run = mk("DGS-1", "builder", 52, [[50, "started"], [1, "tool"]]);
    await runWatch(deps());
    expect(readOpen(dir).map((i) => i.kind)).toEqual(["stalled"]);
    addEvent(run, 0, "blocked", 3);
    const r = await runWatch(deps());
    expect(r.opened).toBe(1);
    expect(r.resolved).toBe(1);
    expect(readOpen(dir).map((i) => i.kind)).toEqual(["blocked"]);
  });

  it("a dry run says what it would do and resolves nothing", async () => {
    present = new Set(["w2:DGS-1"]);
    const run = mk("DGS-1", "builder", 22, [[20, "started"], [5, "blocked"]]);
    await runWatch(deps());
    addEvent(run, 0, "tool", 3);
    const before = readFileSync(join(dir, "attention.jsonl"), "utf-8");
    const r = await runWatch(deps({ dryRun: true }));
    expect(readFileSync(join(dir, "attention.jsonl"), "utf-8")).toBe(before);
    expect(readOpen(dir)).toHaveLength(1);
    expect(r.lines[r.lines.length - 1]).toContain("would resolve 1");
    expect(r.lines[r.lines.length - 1]).not.toMatch(/\d+ resolved/);
  });

  it("dry run prints the same lines, writes nothing and calls runDg never", async () => {
    fiveRuns();
    const wet = await runWatch(deps({ dryRun: true }));
    expect(existsSync(dir)).toBe(false);
    expect(calls).toHaveLength(0);
    expect(wet.opened).toBe(3);
    const real = await runWatch(deps());
    expect(wet.lines.slice(0, -1)).toEqual(real.lines.slice(0, -1));
  });

  it("skips a run older than 7 days with no ended, and a broken run.json", async () => {
    present = new Set(["w2:DGS-1"]);
    mk("DGS-1", "builder", 8 * 24 * 60, [[8 * 24 * 60 - 1, "started"]]);
    const bad = join(env.DIGISMITH_DEPOT_DIR!, "runs", "DGS-9", "builder-bad");
    mkdirSync(bad, { recursive: true });
    writeFileSync(join(bad, "run.json"), "{not json");
    const r = await runWatch(deps());
    expect(r.opened).toBe(0);
    expect(readOpen(dir)).toEqual([]);
  });

  it("treats a pane lookup that returns null as unknown, and a null workspace as unknown", async () => {
    mk("DGS-1", "builder", 12, [[10, "started"], [1, "tool"]]);
    mk("DGS-2", "builder", 12, [[10, "started"], [1, "tool"]], { workspace: null });
    present = null;
    const r = await runWatch(deps());
    expect(r.opened).toBe(0);
    expect(readOpen(dir)).toEqual([]);
  });

  it("asks herdr once per workspace", async () => {
    mk("DGS-1", "builder", 12, [[10, "started"], [1, "tool"]]);
    mk("DGS-2", "builder", 12, [[10, "started"], [1, "tool"]]);
    const asked: string[] = [];
    await runWatch(deps({ panes: async (w) => { asked.push(w); return null; } }));
    expect(asked).toEqual(["w2"]);
  });

  it("opens one failed item for a bad budget block, with no comment, once", async () => {
    mkdirSync(join(cwd, ".digismith"), { recursive: true });
    writeFileSync(join(cwd, ".digismith", "config.yml"), "nightwatch:\n  budgets:\n    building: abc\n");
    const r = await runWatch(deps());
    const items = readOpen(dir);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "failed", cause: "bad-budget-config", run: "-", ticket: null });
    expect(r.opened).toBe(1);
    expect(calls).toHaveLength(0);
    const r2 = await runWatch(deps());
    expect(r2.opened).toBe(0);
    expect(readOpen(dir)).toHaveLength(1);
  });

  it("marks only lost as retry eligible, starts no worker and touches no journal", async () => {
    fiveRuns();
    await runWatch(deps());
    const by = Object.fromEntries(readOpen(dir).map((i) => [i.kind, i]));
    expect(by.lost).toMatchObject({ retryEligible: true, causeClass: "unknown" });
    expect(by.blocked.retryEligible).toBe(false);
    expect(by.stalled.retryEligible).toBe(false);
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c.slice(0, 2)).toEqual(["clickup", "add-comment"]);
    expect(readdirSync(dir).filter((f) => f.includes("journal"))).toEqual([]);
  });

  it("never answers, sends keys, kills or deletes: the source has none of those verbs", () => {
    for (const f of ["watchdog.ts", "watch.ts", "pane.ts", "attention.ts", "notify.ts", "breaker.ts"]) {
      const src = readFileSync(join(import.meta.dirname, f), "utf-8");
      expect(src, f).not.toMatch(/\b(unlinkSync|rmSync|rmdirSync|process\.kill|\.kill\()/);
      expect(src, f).not.toMatch(/["'`](send|send-keys|keys|kill|close|answer|stop)["'`]/);
    }
    const pane = readFileSync(join(import.meta.dirname, "pane.ts"), "utf-8");
    expect(pane.match(/args: \[([^\]]*)\]/)?.[1]).toBe('"pane", "list"');
  });
});
