import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createRun } from "./record.ts";
import { findRunDir } from "./paths.ts";
import { appendEvent } from "./events.ts";
import { formatList, formatShow, listRuns, showRun, summarize, tailEvents } from "./read.ts";

let tmp: string;
let env: NodeJS.ProcessEnv;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nw-read-"));
  env = { DIGISMITH_DEPOT_DIR: tmp };
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

function add(run: string, ...types: string[]) {
  for (const t of types) appendEvent(findRunDir(run, env)!, run, t, {}, 2000);
}

describe("readers", () => {
  it("lists runs newest first, filtered by ticket", () => {
    const a = createRun({ ticket: "DGS-1", role: "builder", order: "/o.md" }, env, new Date("2026-10-21T01:00:00Z"));
    const b = createRun({ ticket: "DGS-2", role: "reviewer", order: "/o.md" }, env, new Date("2026-10-21T02:00:00Z"));
    add(a.run, "started", "ended");
    expect(listRuns(env).map((r) => r.record.run)).toEqual([b.run, a.run]);
    expect(listRuns(env, "DGS-1").map((r) => r.record.run)).toEqual([a.run]);
    expect(listRuns(env, "DGS-9")).toEqual([]);
    expect(listRuns(env)[1].summary).toMatchObject({ events: 2, last_type: "ended", ended: true });
  });
  it("lists nothing when the depot has no runs, and skips a folder without run.json", () => {
    expect(listRuns(env)).toEqual([]);
    fs.mkdirSync(path.join(tmp, "runs", "DGS-1", "junk"), { recursive: true });
    expect(listRuns(env)).toEqual([]);
  });
  it("shows a run with its summary, and null for an unknown id", () => {
    const a = createRun({ ticket: "DGS-1", role: "builder", order: "/o.md" }, env);
    add(a.run, "started", "tool");
    const s = showRun(a.run, env)!;
    expect(s.record.run).toBe(a.run);
    expect(s.summary.events).toBe(2);
    expect(s.summary.ended).toBe(false);
    expect(showRun("builder-x-000000", env)).toBeNull();
  });
  it("tails events after a seq", () => {
    const a = createRun({ ticket: "DGS-1", role: "builder", order: "/o.md" }, env);
    add(a.run, "started", "tool", "turn_end");
    expect(tailEvents(a.run, 0, env)!.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(tailEvents(a.run, 2, env)!.map((e) => e.seq)).toEqual([3]);
    expect(tailEvents(a.run, 3, env)).toEqual([]);
    expect(tailEvents("builder-x-000000", 0, env)).toBeNull();
  });
  it("keeps file order and tolerates two lines that share a seq", () => {
    const a = createRun({ ticket: "DGS-1", role: "builder", order: "/o.md" }, env);
    const dir = findRunDir(a.run, env)!;
    const line = (seq: number, type: string, ts: string) => JSON.stringify({ schema: "nightwatch-event/v1", seq, ts, run: a.run, type, data: {} });
    // a hand-written file: seq 2 appears twice (the accepted residual of the stale-lock race)
    fs.writeFileSync(
      path.join(dir, "events.jsonl"),
      [line(1, "started", "2026-10-21T01:00:00Z"), line(2, "tool", "2026-10-21T01:00:01Z"), line(2, "blocked", "2026-10-21T01:00:02Z"), line(3, "turn_end", "2026-10-21T01:00:03Z")].join("\n") + "\n",
    );
    expect(tailEvents(a.run, 0, env)!.map((e) => e.type)).toEqual(["started", "tool", "blocked", "turn_end"]);
    expect(tailEvents(a.run, 2, env)!.map((e) => e.type)).toEqual(["turn_end"]);
    const shown = showRun(a.run, env)!;
    expect(shown.summary).toMatchObject({ events: 4, last_type: "turn_end", first_ts: "2026-10-21T01:00:00Z", last_ts: "2026-10-21T01:00:03Z", ended: false });
    expect(listRuns(env)[0].summary.events).toBe(4);
  });
  it("ended is true only when an ended comes after the last started", () => {
    const ev = (...types: string[]) => types.map((type, i) => ({ schema: "nightwatch-event/v1", seq: i + 1, ts: `2026-10-21T01:00:0${i}Z`, run: "r", type, data: {} }) as never);
    expect(summarize(ev("started", "tool", "ended", "started")).ended).toBe(false); // /clear
    expect(summarize(ev("started", "ended", "started", "ended")).ended).toBe(true);
    expect(summarize(ev("started", "tool", "ended")).ended).toBe(true);
    expect(summarize(ev("ended")).ended).toBe(true);
    expect(summarize(ev("started", "tool")).ended).toBe(false);
  });
  it("summarize of no events is empty", () => {
    expect(summarize([])).toEqual({ events: 0, first_ts: null, last_ts: null, last_type: null, ended: false });
  });
});

describe("a run with no ticket", () => {
  it("prints - in list and show, never the text null", () => {
    const a = createRun({ ticket: "DGS-1", role: "builder", order: "/o.md" }, env);
    const row = { record: { ...a, ticket: null }, summary: summarize([]) };
    expect(formatList([row])).not.toContain("null");
    expect(formatList([row]).split("  ")[1]).toBe("-");
    expect(formatShow(row)).toContain("ticket    -\n");
    expect(formatShow(row)).not.toContain("null");
  });
});

describe("DGS-598 readers", () => {
  const mk = (folder: string, id: string, rec: Partial<Record<string, unknown>>, ageDays: number) => {
    const dir = path.join(tmp, "runs", folder, id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "run.json"), JSON.stringify({ schema: "nightwatch-run/v1", run: id, ticket: null, role: "other", order: null, seat: null, model: null, plugin_version: null, base_sha: null, branch: null, worktree: null, herdr: { workspace: null, tab: null, pane: null }, budget: null, created_at: "2026-10-01T00:00:00.000Z", source: "auto", project: "DigiSmith", session_id: id, role_from: "none", ...rec }));
    fs.writeFileSync(path.join(dir, "events.jsonl"), "");
    const t = (Date.now() - ageDays * 86_400_000) / 1000;
    fs.utimesSync(path.join(dir, "events.jsonl"), t, t);
    fs.utimesSync(path.join(dir, "run.json"), t, t);
  };
  it("skips dot folders without a word", () => {
    fs.mkdirSync(path.join(tmp, "runs", ".index", "sessions"), { recursive: true });
    mk("DigiSmith", "s-a", {}, 0);
    expect(listRuns(env).map((r) => r.record.run)).toEqual(["s-a"]);
  });
  it("matches --ticket on the folder or the record", () => {
    mk("DigiSmith", "s-b", { ticket: "DGS-598" }, 0);
    mk("DGS-598", "s-c", { ticket: "DGS-598" }, 0);
    mk("DigiSmith", "s-d", {}, 0);
    expect(listRuns(env, "DGS-598").map((r) => r.record.run).sort()).toEqual(["s-b", "s-c"]);
  });
  it("keeps only runs active within the window, by file time", () => {
    mk("DigiSmith", "s-new", {}, 1);
    mk("DigiSmith", "s-old", {}, 9);
    expect(listRuns(env, undefined, { days: 7 }).map((r) => r.record.run)).toEqual(["s-new"]);
    expect(listRuns(env).map((r) => r.record.run).sort()).toEqual(["s-new", "s-old"]);
  });
  it("prints the project and a null ticket as -", () => {
    mk("DigiSmith", "s-e", {}, 0);
    const [row] = listRuns(env);
    expect(formatList([row])).toMatch(/^s-e {2}- {2}DigiSmith {2}other /);
    expect(formatShow(row)).toMatch(/ticket {4}-\nproject {3}DigiSmith\n/);
  });
});
