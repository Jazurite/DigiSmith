import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createRun } from "./record.ts";
import { findRunDir } from "./paths.ts";
import { appendEvent } from "./events.ts";
import { listRuns, showRun, summarize, tailEvents } from "./read.ts";

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
    const a = createRun({ ticket: "DGS-1", role: "builder" }, env, new Date("2026-10-21T01:00:00Z"));
    const b = createRun({ ticket: "DGS-2", role: "reviewer" }, env, new Date("2026-10-21T02:00:00Z"));
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
    const a = createRun({ ticket: "DGS-1", role: "builder" }, env);
    add(a.run, "started", "tool");
    const s = showRun(a.run, env)!;
    expect(s.record.run).toBe(a.run);
    expect(s.summary.events).toBe(2);
    expect(s.summary.ended).toBe(false);
    expect(showRun("builder-x-000000", env)).toBeNull();
  });
  it("tails events after a seq", () => {
    const a = createRun({ ticket: "DGS-1", role: "builder" }, env);
    add(a.run, "started", "tool", "turn_end");
    expect(tailEvents(a.run, 0, env)!.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(tailEvents(a.run, 2, env)!.map((e) => e.seq)).toEqual([3]);
    expect(tailEvents(a.run, 3, env)).toEqual([]);
    expect(tailEvents("builder-x-000000", 0, env)).toBeNull();
  });
  it("summarize of no events is empty", () => {
    expect(summarize([])).toEqual({ events: 0, first_ts: null, last_ts: null, last_type: null, ended: false });
  });
});
