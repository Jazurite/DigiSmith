import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { observeAll } from "./observe.ts";
import { PromptError } from "./act.ts";
import { writeLock } from "./fakes.test-util.ts";
import {
  makeObservers, makeWriters, parseAgentList, realExecOut, realStores, realRunEvent,
  type ExecOut, type ObserverDeps, type RunRecord,
} from "./observers-real.ts";
import { runTick } from "./tick.ts";

const BIN = "/depot/bin/herdr-ws";
const AGENTS = JSON.stringify({ id: "cli:agent:list", result: { agents: [
  { name: "digismith-conductor", agent_status: "working", pane_id: "w2:p1" },
  { name: "dgs-1", agent_status: "idle", pane_id: "w2:p5" },
] } });
const here = (f: string) => readFileSync(join(import.meta.dirname, "fixtures", f), "utf8");

type Call = { file: string; args: string[]; env?: NodeJS.ProcessEnv };
function fakeExec(handler: (file: string, args: string[]) => string | Error = () => "") {
  const calls: Call[] = [];
  const exec: ExecOut = async (file, args, opts) => {
    calls.push({ file, args, env: opts?.env });
    const r = handler(file, args);
    if (r instanceof Error) throw r;
    return { stdout: r };
  };
  return { exec, calls, argv: () => calls.map((c) => [c.file, ...c.args]) };
}
const codeErr = (code: number | string) => Object.assign(new Error(`exit ${String(code)}`), { code });

const run = (o: Partial<RunRecord> = {}): RunRecord => ({
  id: "builder-1", role: "builder", created_at: "2026-10-21T00:01:00.000Z", worktree: "/wt", base_sha: "bbbbbbb1",
  herdrPane: "w2:p5", events: [{ type: "started" }], ...o,
});

function deps(exec: ExecOut, records: RunRecord[] = [run()], over: Partial<ObserverDeps> = {}): ObserverDeps {
  return {
    exec, mainRepo: "/main", ticket: "DGS-1", claimedAt: "2026-10-21T00:00:00.000Z",
    builderRunId: () => "builder-1", conductorName: "digismith-conductor",
    runs: { runsOf: async () => records },
    reviewerData: { packs: async () => [], verdicts: async () => [] },
    tracker: { getStatus: async () => "in progress" }, herdrBin: BIN, herdrWs: "w2", ...over,
  };
}

describe("parseAgentList", () => {
  it("reads the real shape", () => {
    expect(parseAgentList(AGENTS)).toEqual([
      { name: "digismith-conductor", status: "working", pane: "w2:p1" },
      { name: "dgs-1", status: "idle", pane: "w2:p5" },
    ]);
  });
  it("throws on a bare array", () => { expect(() => parseAgentList("[]")).toThrow(); });
});

describe("git observer", () => {
  const gitHandler = (mb: string | Error) => (_f: string, a: string[]) => (a.includes("rev-parse") ? "abc123\n" : a.includes("merge-base") ? (mb as string) : "");
  it("runs fetch, rev-parse, merge-base in order and reports onOriginMain", async () => {
    const f = fakeExec(gitHandler(""));
    const g = await makeObservers(deps(f.exec)).git();
    expect(f.argv()).toEqual([
      ["git", "-C", "/main", "fetch", "origin", "main"],
      ["git", "-C", "/wt", "rev-parse", "HEAD"],
      ["git", "-C", "/main", "merge-base", "--is-ancestor", "abc123", "origin/main"],
    ]);
    expect(g).toEqual({ head: "abc123", base: "bbbbbbb1", onOriginMain: true });
  });
  it("exit 1 is false", async () => {
    const g = await makeObservers(deps(fakeExec(gitHandler(codeErr(1))).exec)).git();
    expect(g.onOriginMain).toBe(false);
  });
  it("exit 128 throws", async () => {
    await expect(makeObservers(deps(fakeExec(gitHandler(codeErr(128))).exec)).git()).rejects.toThrow();
  });
  it("no worktree throws", async () => {
    await expect(makeObservers(deps(fakeExec().exec, [run({ worktree: null })])).git()).rejects.toThrow("no worktree");
  });
  it("no builder run id throws", async () => {
    await expect(makeObservers(deps(fakeExec().exec, [run()], { builderRunId: () => null })).git()).rejects.toThrow("no worktree");
  });
});

describe("runs observer", () => {
  it("maps events to a RunView", async () => {
    const r = run({ events: [{ type: "started" }, { type: "phase", data: { phase: "review" } }, { type: "phase", data: { phase: "merge" } }, { type: "merged" }, { type: "pushed" }, { type: "ended" }] });
    const [v] = await makeObservers(deps(fakeExec().exec, [r])).runs();
    expect(v).toEqual({ id: "builder-1", role: "builder", createdAt: r.created_at, started: true, ended: true, merged: true, pushed: true, phaseEvent: "merge" });
  });
  it("phaseEvent is null without a phase event", async () => {
    const [v] = await makeObservers(deps(fakeExec().exec)).runs();
    expect(v.phaseEvent).toBeNull();
    expect(v.merged).toBe(false);
  });
});

describe("herdr observer", () => {
  const h = (box: string | Error) => (_f: string, a: string[]) => (a[0] === "list" || a[1] === "list" ? AGENTS : box);
  it("reads the list, then the conductor pane with ansi, and sets HERDR_WS", async () => {
    const f = fakeExec(h(here("input-box-empty.ansi")));
    const v = await makeObservers(deps(f.exec)).herdr();
    expect(f.argv()).toEqual([[BIN, "agent", "list"], [BIN, "pane", "read", "w2:p1", "--format", "ansi"]]);
    expect(f.calls.every((c) => c.env?.HERDR_WS === "w2")).toBe(true);
    expect(v).toEqual({ conductorPresent: true, conductorWorking: true, input: "empty", builderPanePresent: true });
  });
  it("a typed box is typed, a suggestion is suggestion", async () => {
    expect((await makeObservers(deps(fakeExec(h(here("input-box-typed.ansi"))).exec)).herdr()).input).toBe("typed");
    expect((await makeObservers(deps(fakeExec(h(here("input-box-suggestion.ansi"))).exec)).herdr()).input).toBe("suggestion");
  });
  it("an unreadable pane is unknown", async () => {
    expect((await makeObservers(deps(fakeExec(h(codeErr(1))).exec)).herdr()).input).toBe("unknown");
  });
  it("a missing conductor and builder pane are reported", async () => {
    const f = fakeExec(() => JSON.stringify({ result: { agents: [] } }));
    const v = await makeObservers(deps(f.exec)).herdr();
    expect(v).toEqual({ conductorPresent: false, conductorWorking: false, input: "unknown", builderPanePresent: false });
  });
  it("HERDR_WS follows the dep", async () => {
    const f = fakeExec(h(""));
    await makeObservers(deps(f.exec, [run()], { herdrWs: "w9" })).herdr();
    expect(f.calls[0].env?.HERDR_WS).toBe("w9");
  });
});

describe("tracker observer", () => {
  it("returns the status", async () => {
    expect(await makeObservers(deps(fakeExec().exec)).tracker()).toEqual({ status: "in progress" });
  });
});

describe("writers", () => {
  const mk = (exec: ExecOut) => {
    const events: unknown[][] = []; const statuses: string[] = [];
    const w = makeWriters({ exec, herdrBin: BIN, herdrWs: "w2", conductorName: "digismith-conductor",
      tracker: { setStatus: async (s) => { statuses.push(s); } }, runEvent: async (...a) => { events.push(a); } });
    return { w, events, statuses };
  };
  it("prompt runs herdr-ws agent prompt with HERDR_WS", async () => {
    const f = fakeExec();
    await mk(f.exec).w.prompt("DGS-1: merge");
    expect(f.argv()).toEqual([[BIN, "agent", "prompt", "digismith-conductor", "DGS-1: merge"]]);
    expect(f.calls[0].env?.HERDR_WS).toBe("w2");
  });
  it("a non-zero exit is PromptError no", async () => {
    const e = await mk(fakeExec(() => codeErr(2)).exec).w.prompt("x").catch((x) => x);
    expect(e).toBeInstanceOf(PromptError);
    expect(e.delivered).toBe("no");
  });
  it("a timeout is PromptError maybe", async () => {
    const e = await mk(fakeExec(() => codeErr("ETIMEDOUT")).exec).w.prompt("x").catch((x) => x);
    expect(e).toBeInstanceOf(PromptError);
    expect(e.delivered).toBe("maybe");
  });
  it("writeMarker writes a phase event", async () => {
    const m = mk(fakeExec().exec);
    await m.w.writeMarker("builder-1", "review");
    expect(m.events).toEqual([["builder-1", "phase", { phase: "review" }]]);
  });
  it("setStatus calls only the tracker", async () => {
    const f = fakeExec(); const m = mk(f.exec);
    await m.w.setStatus("in progress");
    expect(m.statuses).toEqual(["in progress"]);
    expect(f.calls).toEqual([]);
  });
});

describe("a full tick is read-only for git and goes only through herdr-ws", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "obs-real-")); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  it("records no merge, push, commit, reset or checkout", async () => {
    writeLock(dir, { phase: "merge-ready", runs: { builder: "builder-1" } });
    const f = fakeExec((_file, a) => (a.includes("rev-parse") ? "abc123\n" : a[0] === "agent" && a[1] === "list" ? AGENTS : a[0] === "pane" ? here("input-box-empty.ansi") : ""));
    const d = deps(f.exec);
    const w = makeWriters({ exec: f.exec, herdrBin: BIN, herdrWs: "w2", conductorName: "digismith-conductor", tracker: { setStatus: async () => {} }, runEvent: async () => {} });
    await runTick({ dir, now: () => new Date("2026-10-21T01:00:00.000Z"), observers: makeObservers(d), dryRun: false, ...w });
    const all = f.argv();
    expect(all.length).toBeGreaterThan(0);
    for (const a of all) {
      if (a[0] === "git") expect(["fetch origin main", "rev-parse HEAD", "merge-base --is-ancestor"].some((ok) => a.slice(3).join(" ").startsWith(ok))).toBe(true);
      else expect(a[0]).toBe(BIN);
      expect(a.some((x) => ["merge", "push", "commit", "reset", "checkout"].includes(x))).toBe(false);
    }
  });
});

describe("realStores", () => {
  let root: string;
  const env = () => ({ DIGISMITH_DEPOT_DIR: join(root, "depot") }) as NodeJS.ProcessEnv;
  const report = (n: string) => "x\n```json findings\n" + n + "\n```\n";
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "obs-stores-"));
    const wt = join(root, "wt");
    const ws = join(wt, ".digismith", "board", "DGS-1—thing", ".sdd-workspace", "reviews");
    for (const [name, head, findings] of [["ticket-final-r1", "aaaaaaa1", '[{"id":"F1","path":"a.ts","line":1,"severity":"Minor","what":"w","scenario":"s"}]'], ["ticket-final-r2", "ccccccc2", "[]"]] as const) {
      mkdirSync(join(ws, name), { recursive: true });
      const round = name.slice(-1);
      writeFileSync(join(ws, name, "pack.md"), `# Review pack: ticket round ${round}\n\nticket: DGS-1\ntype: ticket\nid: final\nround: ${round}\nmodel: m\nbase: bbbbbbb1\nhead: ${head}\n`);
      writeFileSync(join(ws, name, "report.md"), report(findings));
    }
    const rd = join(root, "depot", "runs", "DGS-1", "builder-1");
    mkdirSync(rd, { recursive: true });
    writeFileSync(join(rd, "run.json"), JSON.stringify({ schema: "nightwatch-run/v1", run: "builder-1", ticket: "DGS-1", role: "builder", order: null, seat: null, model: null, plugin_version: null, base_sha: "bbbbbbb1", branch: null, worktree: wt, herdr: { workspace: null, tab: null, pane: "w2:p5" }, budget: null, created_at: "2026-10-21T00:01:00.000Z" }));
    writeFileSync(join(rd, "events.jsonl"), [{ type: "started", data: {} }, { type: "phase", data: { phase: "review" } }].map((e, i) => JSON.stringify({ schema: "nightwatch-event/v1", seq: i + 1, ts: "t", run: "builder-1", ...e })).join("\n") + "\n");
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("builds runs, packs and verdicts from the real folders", async () => {
    const s = realStores({ env: env(), ticket: "DGS-1", builderRunId: () => "builder-1" });
    const recs = await s.runs.runsOf("DGS-1", "2026-10-21T00:00:00.000Z");
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ id: "builder-1", worktree: join(root, "wt"), herdrPane: "w2:p5" });
    expect(recs[0].events.map((e) => e.type)).toEqual(["started", "phase"]);
    expect(await s.runs.runsOf("DGS-1", "2026-10-22T00:00:00.000Z")).toEqual([]);
    expect(await s.reviewerData.packs()).toEqual([{ round: 1, head: "aaaaaaa1", base: "bbbbbbb1" }, { round: 2, head: "ccccccc2", base: "bbbbbbb1" }]);
    expect(await s.reviewerData.verdicts()).toEqual([
      { scope: "ticket", result: "findings", head: "aaaaaaa1" },
      { scope: "ticket", result: "clean", head: "ccccccc2" },
    ]);
  });
  it("without a builder run there are no packs", async () => {
    const s = realStores({ env: env(), ticket: "DGS-1", builderRunId: () => null });
    expect(await s.reviewerData.packs()).toEqual([]);
  });
  it("realRunEvent appends a phase event, and throws for an unknown run", async () => {
    await realRunEvent(env())("builder-1", "phase", { phase: "merge" });
    const lines = readFileSync(join(root, "depot", "runs", "DGS-1", "builder-1", "events.jsonl"), "utf8").trim().split("\n");
    expect(JSON.parse(lines[lines.length - 1])).toMatchObject({ type: "phase", data: { phase: "merge" } });
    await expect(realRunEvent(env())("nope", "phase", { phase: "merge" })).rejects.toThrow();
  });
});

describe("run store is read once per tick", () => {
  it("one observeAll reads the run store once; a new makeObservers reads again", async () => {
    let n = 0;
    const f = fakeExec((_f, a) => (a.includes("rev-parse") ? "abc\n" : a[1] === "list" ? AGENTS : a[0] === "pane" ? here("input-box-empty.ansi") : ""));
    const d = deps(f.exec, [run()], { runs: { runsOf: async () => { n++; return [run()]; } } });
    await observeAll(makeObservers(d));
    expect(n).toBe(1);
    await observeAll(makeObservers(d));
    expect(n).toBe(2);
  });
});

describe("realExecOut names the cause", () => {
  const node = process.execPath;
  const code = (p: Promise<unknown>) => p.then(() => null, (e) => (e as { code?: unknown }).code);
  it("our timeout is ETIMEDOUT", async () => {
    expect(await code(realExecOut(node, ["-e", "setTimeout(()=>{},5000)"], { timeoutMs: 100 }))).toBe("ETIMEDOUT");
  });
  it("a buffer overflow keeps its code", async () => {
    expect(await code(realExecOut(node, ["-e", "process.stdout.write('x'.repeat(5000))"], { maxBuffer: 100 }))).toBe("ERR_CHILD_PROCESS_STDIO_MAXBUFFER");
  });
  it("an outside signal is SIGNAL:<name>", async () => {
    expect(await code(realExecOut(node, ["-e", "process.kill(process.pid,'SIGKILL')"]))).toBe("SIGNAL:SIGKILL");
  });
  it("a non-zero exit keeps the number", async () => {
    expect(await code(realExecOut(node, ["-e", "process.exit(3)"]))).toBe(3);
  });
});

describe("prompt delivery by cause", () => {
  const delivered = async (c: number | string) => {
    const w = makeWriters({ exec: fakeExec(() => codeErr(c)).exec, herdrBin: BIN, herdrWs: "w2", conductorName: "c", tracker: { setStatus: async () => {} }, runEvent: async () => {} });
    return ((await w.prompt("x").catch((e) => e)) as PromptError).delivered;
  };
  it.each([["ETIMEDOUT", "maybe"], ["SIGNAL:SIGKILL", "maybe"], ["ERR_CHILD_PROCESS_STDIO_MAXBUFFER", "maybe"], ["ENOENT", "no"], [2, "no"]] as const)("%s -> %s", async (c, want) => {
    expect(await delivered(c)).toBe(want);
  });
});
