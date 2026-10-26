import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRun, readRun, rewriteRun } from "../run/record.ts";
import { findRunDir } from "../run/paths.ts";
import { appendOpen, appendResolved, readOpen } from "./attention.ts";
import { runWatch, type WatchDeps } from "./watch.ts";

const NOW = Date.parse("2026-10-22T10:00:00Z");
const ago = (min: number): string => new Date(NOW - min * 60_000).toISOString();

let tmp: string;
let dir: string;
let cwd: string;
let env: NodeJS.ProcessEnv;
let calls: string[][];
let present: Set<string> | null;
let status: Map<string, string>; // pane -> herdr agent_status; a pane not listed reads "unknown", which keeps a prompt blocked

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "nw-watch-"));
  dir = join(tmp, "autonomous");
  cwd = join(tmp, "repo");
  mkdirSync(cwd, { recursive: true });
  env = { DIGISMITH_DEPOT_DIR: join(tmp, "depot"), AUTONOMOUS_DIR: dir };
  calls = [];
  present = new Set();
  status = new Map();
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

function mk(ticket: string, role: string, createdMin: number, evs: [number, string][], opts: { workspace?: string | null; pane?: string } = {}): string {
  const rec = createRun({ ticket, role, order: "/o.md", workspace: opts.workspace === null ? undefined : (opts.workspace ?? "w2"), pane: opts.pane ?? `w2:${ticket}` }, env, new Date(NOW - createdMin * 60_000));
  const rd = findRunDir(rec.run, env)!;
  const lines = evs.map(([m, type], i) => JSON.stringify({ schema: "nightwatch-event/v1", seq: i + 1, ts: ago(m), run: rec.run, type, data: type === "blocked" ? { kind: "permission_prompt" } : {} }));
  if (lines.length) writeFileSync(join(rd, "events.jsonl"), lines.join("\n") + "\n");
  return rec.run;
}
const addEvent = (run: string, m: number, type: string, seq: number): void => {
  const rd = findRunDir(run, env)!;
  writeFileSync(join(rd, "events.jsonl"), JSON.stringify({ schema: "nightwatch-event/v1", seq, ts: ago(m), run, type, data: type === "blocked" ? { kind: "permission_prompt" } : {} }) + "\n", { flag: "a" });
};

const deps = (over: Partial<WatchDeps> = {}): WatchDeps => ({
  env, dir, cwd, now: () => NOW,
  panes: async () => (present ? new Map([...present].map((p) => [p, status.get(p) ?? "unknown"] as [string, string])) : null),
  runDg: async (args) => { calls.push(args); return { ok: true }; },
  dryRun: false,
  ...over,
});

function fiveRuns(): void {
  present = new Set(["w2:DGS-1", "w2:DGS-2", "w2:DGS-3", "w2:DGS-5"]);
  mk("DGS-1", "builder", 12, [[10, "started"], [1, "tool"]]);
  mk("DGS-2", "builder", 22, [[20, "started"], [5, "blocked"]]);
  mk("DGS-3", "builder", 192, [[190, "started"], [1, "tool"]]);
  mk("DGS-4", "builder", 12, [[10, "started"], [1, "tool"]]); // pane w2:DGS-4 absent
  mk("DGS-5", "builder", 22, [[20, "started"], [15, "ended"]]);
}

describe("runWatch", () => {
  it("skips a conductor run before its events are read and opens nothing for it", async () => {
    present = new Set();
    const id = mk("DGS-8", "conductor", 120, [[110, "started"]]);
    writeFileSync(join(findRunDir(id, env)!, "events.jsonl"), "{{{ not json\n");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await runWatch(deps());
    expect(r.opened).toBe(0);
    expect(r.lines.some((l) => l.includes(id))).toBe(false);
    expect(err).not.toHaveBeenCalled();
  });
  it("closes an open blocked item when its run is now a maestro run", async () => {
    present = new Set(["w2:DGS-9"]);
    const id = mk("DGS-9", "builder", 22, [[20, "started"], [5, "blocked"]]);
    expect((await runWatch(deps())).opened).toBe(1);
    const rd = findRunDir(id, env)!;
    rewriteRun(rd, { ...readRun(rd), role: "maestro" });
    const r2 = await runWatch(deps());
    expect(r2.resolved).toBe(1);
    expect(readOpen(dir)).toEqual([]);
    expect(readFileSync(join(dir, "attention.jsonl"), "utf-8")).toContain("role not watched");
  });
  it("closes only the items of unwatched runs when two runs change role and a watched run stays open", async () => {
    present = new Set(["w2:DGS-11", "w2:DGS-12", "w2:DGS-13"]);
    const a = mk("DGS-11", "builder", 22, [[20, "started"], [5, "blocked"]]);
    const b = mk("DGS-12", "builder", 22, [[20, "started"], [5, "blocked"]]);
    const c = mk("DGS-13", "builder", 22, [[20, "started"], [5, "blocked"]]);
    expect((await runWatch(deps())).opened).toBe(3);
    for (const [id, role] of [[a, "maestro"], [b, "other"]]) {
      const rd = findRunDir(id, env)!;
      rewriteRun(rd, { ...readRun(rd), role });
    }
    const r = await runWatch(deps());
    expect(r.resolved).toBe(2);
    expect(readOpen(dir).map((i) => i.run)).toEqual([c]);
  });
  it("makes no stderr line for runs/.index", async () => {
    mkdirSync(join(env.DIGISMITH_DEPOT_DIR!, "runs", ".index", "sessions"), { recursive: true });
    writeFileSync(join(env.DIGISMITH_DEPOT_DIR!, "runs", ".index", "sessions", "x"), "DGS-1/s-x\n");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await runWatch(deps());
    expect(err).not.toHaveBeenCalled();
  });
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
    const run = mk("DGS-1", "builder", 192, [[190, "started"], [5, "blocked"]]);
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
    const run = mk("DGS-1", "builder", 192, [[190, "started"], [1, "tool"]]);
    await runWatch(deps());
    expect(readOpen(dir).map((i) => i.kind)).toEqual(["stalled"]);
    addEvent(run, 0, "blocked", 3);
    const r = await runWatch(deps());
    expect(r.opened).toBe(1);
    expect(r.resolved).toBe(1);
    expect(readOpen(dir).map((i) => i.kind)).toEqual(["blocked"]);
  });

  describe("DGS-589: herdr status resolves a denied prompt", () => {
    // mk() puts the permission_prompt 5 minutes before NOW, past the 60 s grace
    const blockedRun = (): string => {
      present = new Set(["w2:DGS-1"]);
      return mk("DGS-1", "builder", 22, [[20, "started"], [5, "blocked"]]);
    };

    it("keeps the item open while herdr says blocked, resolves it once herdr says done", async () => {
      blockedRun();
      status.set("w2:DGS-1", "blocked");
      await runWatch(deps());
      expect(readOpen(dir).map((i) => i.kind)).toEqual(["blocked"]);
      const same = await runWatch(deps());
      expect(same.resolved).toBe(0);
      status.set("w2:DGS-1", "done");
      const r = await runWatch(deps());
      expect(r.resolved).toBe(1);
      expect(r.opened).toBe(0);
      expect(readOpen(dir)).toEqual([]);
    });

    it("opens a new item for a second permission_prompt after the first was resolved", async () => {
      const run = blockedRun();
      status.set("w2:DGS-1", "blocked");
      await runWatch(deps());
      status.set("w2:DGS-1", "done");
      await runWatch(deps());
      expect(readOpen(dir)).toEqual([]);
      addEvent(run, 0, "blocked", 3); // a new prompt at NOW, herdr shows blocked again
      status.set("w2:DGS-1", "blocked");
      const r = await runWatch(deps());
      expect(r.opened).toBe(1);
      expect(readOpen(dir).map((i) => i.kind)).toEqual(["blocked"]);
    });

    it("stays blocked when herdr does not answer (a null lookup)", async () => {
      blockedRun();
      status.set("w2:DGS-1", "blocked");
      await runWatch(deps());
      present = null; // herdr down: pane unknown, status unknown
      status.set("w2:DGS-1", "done");
      const r = await runWatch(deps());
      expect(r.resolved).toBe(0);
      expect(readOpen(dir).map((i) => i.kind)).toEqual(["blocked"]);
    });

    it("does not resolve while the pane is listed but its status is unknown", async () => {
      blockedRun();
      await runWatch(deps()); // no status set: reads "unknown"
      const r = await runWatch(deps());
      expect(r.resolved).toBe(0);
      expect(readOpen(dir).map((i) => i.kind)).toEqual(["blocked"]);
    });

    for (const later of ["null", "unknown", "blocked"]) {
      it(`F1: after the answer, a later ${later} herdr reading does not reopen the item`, async () => {
        blockedRun();
        status.set("w2:DGS-1", "blocked");
        await runWatch(deps());
        status.set("w2:DGS-1", "done");
        await runWatch(deps());
        expect(readOpen(dir)).toEqual([]);
        if (later === "null") present = null;
        else status.set("w2:DGS-1", later);
        const r = await runWatch(deps());
        expect(r.opened).toBe(0);
        expect(readOpen(dir)).toEqual([]);
      });
    }

    it("the DGS-583 guard holds: a resolved item is not reopened by the same prompt", async () => {
      blockedRun();
      status.set("w2:DGS-1", "blocked");
      await runWatch(deps());
      status.set("w2:DGS-1", "done");
      await runWatch(deps());
      const r = await runWatch(deps()); // a third pass with the same events
      expect(r.opened).toBe(0);
      expect(readOpen(dir)).toEqual([]);
    });
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

  const writeConfig = (text: string): void => {
    mkdirSync(join(cwd, ".digismith"), { recursive: true });
    writeFileSync(join(cwd, ".digismith", "config.yml"), text);
  };

  it("opens one failed bad-scan-interval-config item for a bad scan_every_minutes, once, and closes it when the value reads clean", async () => {
    writeConfig("nightwatch:\n  scan_every_minutes: 4\n");
    const r = await runWatch(deps());
    const items = readOpen(dir);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "failed", cause: "bad-scan-interval-config", run: "scan-interval", ticket: null });
    expect(r.opened).toBe(1);
    expect(r.lines.join("\n")).toMatch(/scan_every_minutes/);
    expect(calls).toHaveLength(0);
    const r2 = await runWatch(deps());
    expect(r2.opened).toBe(0);
    expect(readOpen(dir)).toHaveLength(1);
    writeConfig("nightwatch:\n  scan_every_minutes: 30\n");
    const r3 = await runWatch(deps());
    expect(r3.resolved).toBe(1);
    expect(readOpen(dir)).toHaveLength(0);
    writeConfig("nightwatch:\n  scan_every_minutes: x\n");
    expect((await runWatch(deps())).opened).toBe(1);
  });

  it("a missing scan_every_minutes, or no config file, opens nothing", async () => {
    expect((await runWatch(deps())).opened).toBe(0);
    writeConfig("nightwatch:\n  budgets:\n    review: 60\n");
    expect((await runWatch(deps())).opened).toBe(0);
    expect(readOpen(dir)).toHaveLength(0);
  });

  it("a bad scan interval and a bad budget are two separate items", async () => {
    writeConfig("nightwatch:\n  scan_every_minutes: 4\n  budgets:\n    building: abc\n");
    await runWatch(deps());
    expect(readOpen(dir).map((i) => i.cause).sort()).toEqual(["bad-budget-config", "bad-scan-interval-config"]);
  });

  it("a dry run writes no scan interval item", async () => {
    writeConfig("nightwatch:\n  scan_every_minutes: 4\n");
    const r = await runWatch({ ...deps(), dryRun: true });
    expect(r.opened).toBe(1);
    expect(readOpen(dir)).toHaveLength(0);
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

describe("runWatch: review fixes", () => {
  it("F1: a run that was cleared (ended, started) and then blocked is watched and gets its item", async () => {
    present = new Set(["w2:DGS-1"]);
    mk("DGS-1", "builder", 22, [[20, "started"], [15, "ended"], [14, "started"], [5, "blocked"]]);
    const r = await runWatch(deps());
    expect(readOpen(dir).map((i) => i.kind)).toEqual(["blocked"]);
    expect(r.opened).toBe(1);
  });

  it("F1: retention keeps a cleared old run (ended, started) out of the ended shortcut", async () => {
    present = new Set(["w2:DGS-1"]);
    mk("DGS-1", "builder", 8 * 24 * 60, [[8 * 24 * 60 - 1, "started"], [8 * 24 * 60 - 2, "ended"], [8 * 24 * 60 - 3, "started"]]);
    const r = await runWatch(deps());
    expect(r.opened).toBe(0);
  });

  it("F3a: a lost item Jack resolved stays closed while the run is still lost, with no comment", async () => {
    mk("DGS-1", "builder", 12, [[10, "started"], [1, "tool"]]); // pane absent: lost
    await runWatch(deps());
    const lost = readOpen(dir)[0];
    expect(lost.kind).toBe("lost");
    appendResolved(dir, lost.id, "jack", ago(0), "seen");
    const before = calls.length;
    const r = await runWatch(deps());
    expect(r.opened).toBe(0);
    expect(readOpen(dir)).toEqual([]);
    expect(calls).toHaveLength(before);
    const r3 = await runWatch(deps());
    expect(r3.opened).toBe(0);
  });

  it("F3b: resolved, seen healthy, then lost again opens n+1 with one comment", async () => {
    const run = mk("DGS-1", "builder", 12, [[10, "started"], [1, "tool"]]);
    await runWatch(deps());
    appendResolved(dir, readOpen(dir)[0].id, "jack", ago(0));
    present = new Set(["w2:DGS-1"]);
    addEvent(run, 0, "tool", 3);
    await runWatch(deps()); // healthy
    present = new Set();
    const before = calls.length;
    const r = await runWatch({ ...deps(), now: () => NOW + 2 * 3600_000 });
    expect(r.opened).toBe(1);
    expect(readOpen(dir).map((i) => i.id)).toEqual([`${run}.lost.1`]);
    expect(calls.length).toBe(before + 1);
  });

  it("F3c: a corrupt watch-state file does not crash the pass; a dry run writes no state", async () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "watch-state.json"), "{broken");
    mk("DGS-1", "builder", 12, [[10, "started"], [1, "tool"]]);
    const r = await runWatch(deps());
    expect(r.opened).toBe(1);
    rmSync(join(dir, "watch-state.json"));
    await runWatch(deps({ dryRun: true }));
    expect(existsSync(join(dir, "watch-state.json"))).toBe(false);
  });

  it("F4: old runs are skipped before their events are read and do not count", async () => {
    present = new Set(["w2:DGS-1"]);
    mk("DGS-1", "builder", 12, [[10, "started"], [1, "tool"]]);
    const old = mk("DGS-2", "builder", 9 * 24 * 60, [[9 * 24 * 60 - 1, "started"], [9 * 24 * 60 - 2, "ended"]]);
    // an unreadable events file would show up as a stderr line if it were read
    const rd = findRunDir(old, env)!;
    rmSync(join(rd, "events.jsonl"));
    mkdirSync(join(rd, "events.jsonl"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await runWatch(deps());
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
    expect(r.lines[r.lines.length - 1]).toContain("watch: 1 runs");
  });

  it("F5: a broken run directory gives one stderr line; an unreadable depot root rejects", async () => {
    mk("DGS-1", "builder", 12, [[10, "started"], [1, "tool"]]);
    const bad = join(env.DIGISMITH_DEPOT_DIR!, "runs", "DGS-9", "builder-bad");
    mkdirSync(bad, { recursive: true });
    writeFileSync(join(bad, "run.json"), "{not json");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await runWatch(deps());
    expect(err).toHaveBeenCalledTimes(1);
    expect(String(err.mock.calls[0][0])).toContain("builder-bad");
    err.mockRestore();
    const root = join(tmp, "other");
    writeFileSync(root, "i am a file");
    await expect(runWatch(deps({ env: { ...env, DIGISMITH_DEPOT_DIR: root } }))).rejects.toThrow();
  });

  it("F10a: after Jack resolves a blocked item, a new permission prompt with a later since opens n+1 with one comment", async () => {
    present = new Set(["w2:DGS-1"]);
    const run = mk("DGS-1", "builder", 22, [[20, "started"], [5, "blocked"]]);
    await runWatch(deps());
    appendResolved(dir, readOpen(dir)[0].id, "jack", ago(0));
    addEvent(run, -100, "blocked", 3);
    const before = calls.length;
    const r = await runWatch({ ...deps(), now: () => NOW + 2 * 3600_000 });
    expect(r.opened).toBe(1);
    expect(readOpen(dir).map((i) => i.id)).toEqual([`${run}.blocked.1`]);
    expect(calls.length).toBe(before + 1);
  });

  it("F10b: the same since stays closed with no comment; an old state file without a since behaves as before", async () => {
    present = new Set(["w2:DGS-1"]);
    const run = mk("DGS-1", "builder", 22, [[20, "started"], [5, "blocked"]]);
    await runWatch(deps());
    appendResolved(dir, readOpen(dir)[0].id, "jack", ago(0));
    const before = calls.length;
    expect((await runWatch(deps())).opened).toBe(0);
    writeFileSync(join(dir, "watch-state.json"), JSON.stringify({ opened: [`${run}|blocked`] }));
    expect((await runWatch(deps())).opened).toBe(0);
    expect(calls).toHaveLength(before);
  });

  it("F11: an old ended run still closes its open items", async () => {
    const { appendAttention } = await import("./attention-write.ts");
    const run = mk("DGS-1", "builder", 9 * 24 * 60, [[9 * 24 * 60 - 1, "started"], [9 * 24 * 60 - 2, "blocked"], [9 * 24 * 60 - 3, "ended"]]);
    appendAttention(dir, new Date(NOW), { ticket: "DGS-1", run, kind: "blocked", cause: "waiting-for-answer" });
    const r = await runWatch(deps());
    expect(r.resolved).toBe(1);
    expect(readOpen(dir)).toEqual([]);
  });

  describe("DGS-612 retry flag and closing", () => {
    it("lost silent-30-min (pane unknown) is not retry-eligible; lost pane-gone is", async () => {
      present = new Set();
      mk("DGS-20", "builder", 60, [[50, "started"], [40, "tool"]], { workspace: null });
      mk("DGS-21", "builder", 60, [[50, "started"], [40, "tool"]]);
      await runWatch(deps());
      const items = readOpen(dir);
      const silent = items.find((i) => i.ticket === "DGS-20")!;
      const gone = items.find((i) => i.ticket === "DGS-21")!;
      expect([silent.kind, silent.cause, silent.retryEligible]).toEqual(["lost", "silent-30-min", false]);
      expect([gone.kind, gone.cause, gone.retryEligible]).toEqual(["lost", "pane-gone", true]);
    });
    it("F1: a reviewer's or scout's lost pane-gone item is not retry-eligible, a builder's is", async () => {
      present = new Set();
      mk("DGS-30", "reviewer", 60, [[50, "started"], [40, "tool"]]);
      mk("DGS-31", "scout", 60, [[50, "started"], [40, "tool"]]);
      mk("DGS-32", "builder", 60, [[50, "started"], [40, "tool"]]);
      await runWatch(deps());
      const items = readOpen(dir);
      const f = (t: string) => items.find((i) => i.ticket === t)!;
      expect([f("DGS-30").cause, f("DGS-30").retryEligible]).toEqual(["pane-gone", false]);
      expect([f("DGS-31").cause, f("DGS-31").retryEligible]).toEqual(["pane-gone", false]);
      expect([f("DGS-32").cause, f("DGS-32").retryEligible]).toEqual(["pane-gone", true]);
    });
    it("C1: closes the older run's items when a newer run of the same ticket and role exists, opens nothing for it", async () => {
      present = new Set(["w2:DGS-22"]);
      const old = mk("DGS-22", "builder", 60, [[50, "started"], [5, "blocked"]]);
      expect((await runWatch(deps())).opened).toBe(1);
      const fresh = mk("DGS-22", "builder", 10, [[9, "started"], [1, "tool"]]);
      const r = await runWatch(deps());
      expect(r.resolved).toBe(1);
      expect(r.opened).toBe(0);
      expect(readOpen(dir)).toEqual([]);
      expect(readFileSync(join(dir, "attention.jsonl"), "utf-8")).toContain(`superseded by ${fresh}`);
      expect(r.lines.some((l) => l.includes(old))).toBe(false);
      expect((await runWatch(deps())).opened).toBe(0);
    });
    it("C1: a different role of the same ticket does not supersede", async () => {
      present = new Set(["w2:DGS-23"]);
      mk("DGS-23", "builder", 60, [[50, "started"], [5, "blocked"]]);
      mk("DGS-23", "reviewer", 10, [[9, "started"], [1, "tool"]]);
      await runWatch(deps());
      expect(readOpen(dir).map((i) => i.kind)).toEqual(["blocked"]);
    });
    it("C2: a run with a merged event is finished: item closed, nothing opened", async () => {
      present = new Set(["w2:DGS-24"]);
      const id = mk("DGS-24", "builder", 60, [[50, "started"], [5, "blocked"]]);
      await runWatch(deps());
      addEvent(id, 4, "merged", 3);
      const r = await runWatch(deps());
      expect(r.resolved).toBe(1);
      expect(readOpen(dir)).toEqual([]);
      expect(readFileSync(join(dir, "attention.jsonl"), "utf-8")).toContain("ticket done");
      expect((await runWatch(deps())).opened).toBe(0);
    });
    it("C2: a run whose worktree folder is removed is finished; one whose folder exists is not", async () => {
      present = new Set(["w2:DGS-25", "w2:DGS-26"]);
      const a = mk("DGS-25", "builder", 60, [[50, "started"], [5, "blocked"]]);
      const b = mk("DGS-26", "builder", 60, [[50, "started"], [5, "blocked"]]);
      const wtA = join(tmp, "wt-a");
      const wtB = join(tmp, "wt-b");
      mkdirSync(wtA); mkdirSync(wtB);
      for (const [id, wt] of [[a, wtA], [b, wtB]]) { const rd = findRunDir(id, env)!; rewriteRun(rd, { ...readRun(rd), worktree: wt }); }
      expect((await runWatch(deps())).opened).toBe(2);
      rmSync(wtA, { recursive: true });
      const r = await runWatch(deps());
      expect(r.resolved).toBe(1);
      expect(readOpen(dir).map((i) => i.run)).toEqual([b]);
      expect((await runWatch(deps())).opened).toBe(0);
    });
    it("C3: an auto item whose run record is gone is closed; act/config items stay; a live run's item stays", async () => {
      present = new Set(["w2:DGS-27"]);
      const live = mk("DGS-27", "builder", 60, [[50, "started"], [5, "blocked"]]);
      await runWatch(deps());
      const att = join(dir, "attention.jsonl");
      const mkItem = (id: string, run: string, kind: string, ticket: string | null) => JSON.stringify({ id, ts: ago(5), ticket, run, kind, cause: "x", since: ago(5) });
      writeFileSync(att, readFileSync(att, "utf-8") + [
        mkItem("g1", "builder-gone-1", "stalled", "DGS-99"),
        mkItem("g2", "builder-gone-1", "lost", "DGS-99"),
        mkItem("g3", "builder-gone-1", "failed", "DGS-99"),
        mkItem("g4", "breaker", "unknown", null),
      ].join("\n") + "\n");
      const r = await runWatch(deps());
      expect(r.resolved).toBe(2);
      expect(readOpen(dir).map((i) => i.id).filter((id) => ["g1", "g2", "g3", "g4"].includes(id)).sort()).toEqual(["g3", "g4"]);
      expect(readOpen(dir).some((i) => i.run === live && i.kind === "blocked")).toBe(true);
      expect(readFileSync(att, "utf-8")).toContain("run record gone");
    });
    it("C1: a run with ticket null is never superseded; its open item stays", async () => {
      present = new Set(["w2:t-old", "w2:t-new"]);
      const a = mk("DGS-29", "builder", 60, [[50, "started"], [5, "blocked"]], { pane: "w2:t-old" });
      const b = mk("DGS-30", "builder", 10, [[9, "started"], [1, "tool"]], { pane: "w2:t-new" });
      for (const id of [a, b]) { const rd = findRunDir(id, env)!; rewriteRun(rd, { ...readRun(rd), ticket: null } as never); }
      const r = await runWatch(deps());
      expect(r.opened).toBe(1);
      expect(readOpen(dir).map((i) => [i.run, i.kind])).toEqual([[a, "blocked"]]);
      expect((await runWatch(deps())).resolved).toBe(0);
      expect(readOpen(dir).map((i) => i.run)).toEqual([a]);
    });
    it("C3: a run skipped by the 7-day retention keeps its lost item open, as its record is readable", async () => {
      present = new Set();
      const old = mk("DGS-31", "builder", 8 * 24 * 60, [[8 * 24 * 60 - 1, "started"]]);
      const att = join(dir, "attention.jsonl");
      mkdirSync(dir, { recursive: true });
      writeFileSync(att, JSON.stringify({ id: "l1", ts: ago(5), ticket: "DGS-31", run: old, kind: "lost", cause: "pane-gone", since: ago(5) }) + "\n");
      const r = await runWatch(deps());
      expect(r.resolved).toBe(0);
      expect(readOpen(dir).map((i) => i.id)).toEqual(["l1"]);
      expect(readFileSync(att, "utf-8")).not.toContain("run record gone");
    });
    it("a failed item of a finished run is untouched", async () => {
      present = new Set(["w2:DGS-28"]);
      const id = mk("DGS-28", "builder", 60, [[50, "started"], [5, "merged"]]);
      const att = join(dir, "attention.jsonl");
      mkdirSync(dir, { recursive: true });
      writeFileSync(att, JSON.stringify({ id: "f1", ts: ago(5), ticket: "DGS-28", run: id, kind: "failed", cause: "x", since: ago(5) }) + "\n");
      const r = await runWatch(deps());
      expect(r.resolved).toBe(0);
      expect(readOpen(dir).map((i) => i.id)).toEqual(["f1"]);
    });
  });
});

describe("runWatch: guardrails.failed close (DGS-630 rule 4)", () => {
  const seed = (cause = "bad-guardrail-config", run = "guardrails"): void => {
    appendOpen(dir, { ticket: null, run, kind: "failed", cause, since: ago(60), ts: ago(60) });
  };
  it("closes guardrails.failed when the guardrail read is clean", async () => {
    seed();
    const r = await runWatch(deps({ guardrailProblems: () => [] }));
    expect(r.resolved).toBe(1);
    expect(readOpen(dir)).toHaveLength(0);
    const raw = readdirSync(dir).map((f) => readFileSync(join(dir, f), "utf-8")).join("\n");
    const rec = raw.split("\n").filter((l) => l.includes('"resolved":true')).map((l) => JSON.parse(l) as { by: string; note: string });
    expect(rec).toMatchObject([{ by: "watchdog", note: "guardrails read clean" }]);
  });
  it("does not read the guardrails when no such item is open", async () => {
    let calls = 0;
    await runWatch(deps({ guardrailProblems: () => { calls++; return []; } }));
    expect(calls).toBe(0);
  });
  it("keeps it open while the read has problems", async () => {
    seed();
    const r = await runWatch(deps({ guardrailProblems: () => ['nightwatch: unknown guardrail key "x"'] }));
    expect(r.resolved).toBe(0);
    expect(r.opened).toBe(0);
    expect(readOpen(dir)).toHaveLength(1);
  });
  it("keeps it open when the read throws", async () => {
    seed();
    const r = await runWatch(deps({ guardrailProblems: () => { throw new Error("boom"); } }));
    expect(r.resolved).toBe(0);
    expect(readOpen(dir)).toHaveLength(1);
  });
  it("no guardrailProblems dep: the item is untouched", async () => {
    seed();
    const r = await runWatch(deps());
    expect(r.resolved).toBe(0);
    expect(readOpen(dir)).toHaveLength(1);
  });
  it("a dry run closes nothing and says would resolve", async () => {
    seed();
    const r = await runWatch(deps({ guardrailProblems: () => [], dryRun: true }));
    expect(r.resolved).toBe(1);
    expect(r.lines.join("\n")).toMatch(/would resolve 1/);
    expect(readOpen(dir)).toHaveLength(1);
  });
  it('does not close other items of run "-"', async () => {
    seed("bad-budget-config", "-");
    const r = await runWatch(deps({ guardrailProblems: () => [] }));
    expect(r.resolved).toBe(0);
    expect(readOpen(dir).map((i) => i.cause)).toEqual(["bad-budget-config"]);
  });
});
