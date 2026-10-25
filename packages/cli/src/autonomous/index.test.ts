import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import yargs from "yargs";
import { buildCli } from "../index.ts";
import { readAway } from "./away.ts";
import { FakeTracker } from "./fake-tracker.test-util.ts";
import { MAIN_CHECKOUT } from "./observers-real.ts";
import { createAutonomousCommand, type AutonomousDeps } from "./index.ts";
import { appendEvent } from "./state.ts";
import { plan, readJournal, resultsOf, settle } from "./journal.ts";

const DAY = new Date("2026-10-21T03:00:00.000Z"); // 10:00 UTC+7

let root: string;
let dir: string;
let ordersDir: string;
let tracker: FakeTracker;
let fetchCalls: string[];
let execCalls: string[][];

const deps = (): AutonomousDeps => ({
  tracker: () => tracker,
  dir,
  ordersDir,
  conductorsJson: join(root, "conductors.json"),
  now: () => DAY,
  scanId: () => "scan-1",
  exec: async (file, args) => { execCalls.push([file, ...args]); return { code: 0, stderr: "" }; },
  fileExists: () => false,
  git: (_cwd, args) => "" /* clean config, nothing on main, no branches */,
  nexus: {
    baseUrl: "http://fake",
    tokenFile: join(root, "token"),
    fetch: (async (url: string) => { fetchCalls.push(url); return new Response("{}", { status: 202 }); }) as unknown as typeof fetch,
  },
});

const parse = (args: string[]) =>
  yargs(args).exitProcess(false).command(createAutonomousCommand(deps)).strict().parseAsync();

function viaBuildCli(argv: string[]): Promise<{ err: unknown; output: string }> {
  return new Promise((resolve) => {
    buildCli(argv).exitProcess(false).parse(argv, {}, (err, _a, output) => resolve({ err, output }));
  });
}

let log: ReturnType<typeof vi.spyOn>;
let errLog: ReturnType<typeof vi.spyOn>;
const out = () => log.mock.calls.flat().join("\n");

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "auto-idx-"));
  dir = join(root, "autonomous");
  ordersDir = join(root, "orders");
  writeFileSync(join(root, "token"), "tok\n");
  writeFileSync(join(root, "conductors.json"), JSON.stringify({ "DigiSmith/digismith-conductor": { tab: 1, workspace: "w2" } }));
  tracker = new FakeTracker();
  fetchCalls = [];
  execCalls = [];
  log = vi.spyOn(console, "log").mockImplementation(() => {});
  errLog = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = 0;
  rmSync(root, { recursive: true, force: true });
});

describe("dg autonomous: argument checks", () => {
  it("scan --help lists --dry-run and --repo", async () => {
    const r = await viaBuildCli(["autonomous", "scan", "--help"]);
    expect(r.output).toContain("--dry-run");
    expect(r.output).toContain("--repo");
  });
  it("scan without --repo fails with a message", async () => {
    const r = await viaBuildCli(["autonomous", "scan"]);
    expect(r.err).toBeTruthy();
    expect(r.output).toMatch(/repo/);
  });
  it("release --result bogus is refused by the choices", async () => {
    const r = await viaBuildCli(["autonomous", "release", "--ticket", "DGS-1", "--result", "bogus"]);
    expect(r.err).toBeTruthy();
    expect(r.output).toMatch(/bogus/);
  });
});

describe("dg autonomous: away and back", () => {
  it("away --until 7pm exits non-zero and writes no file", async () => {
    await parse(["autonomous", "away", "--until", "7pm"]);
    expect(process.exitCode).not.toBe(0);
    expect(errLog.mock.calls.flat().join("\n")).toMatch(/HH:MM/);
    expect(existsSync(join(dir, "away.json"))).toBe(false);
    expect(fetchCalls).toEqual([]);
  });
  it("away --until 18:00 prints the resolved time and writes away.json", async () => {
    await parse(["autonomous", "away", "--until", "18:00"]);
    expect(process.exitCode ?? 0).toBe(0);
    expect(out()).toContain("2026-10-21 18:00:00");
    expect(out()).toMatch(/run-now: ok/);
    expect(readAway(dir)).toMatchObject({ away: true, until: "2026-10-21T11:00:00.000Z" });
    expect(fetchCalls).toEqual(["http://fake/api/v1/jobs/autonomous-scan/run"]);
  });
  it("back leaves away.json with away false", async () => {
    await parse(["autonomous", "away"]);
    await parse(["autonomous", "back"]);
    expect(readAway(dir)?.away).toBe(false);
    expect(out()).toMatch(/run-now: ok/);
  });
});

describe("dg autonomous status", () => {
  it("on an empty dir prints away off, lock none, last scan none, exit 0", async () => {
    await parse(["autonomous", "status"]);
    expect(process.exitCode ?? 0).toBe(0);
    expect(out()).toContain("away: off");
    expect(out()).toContain("lock: none");
    expect(out()).toContain("last scan: none");
  });
  it("after away prints away: on until", async () => {
    await parse(["autonomous", "away", "--until", "18:00"]);
    log.mockClear();
    await parse(["autonomous", "status"]);
    expect(out()).toContain("away: on until 2026-10-21 18:00:00");
  });
  it("shows the newest scan event, the lock and the newest report", async () => {
    appendEvent(dir, new Date("2026-10-20T17:00:00.000Z"), "scan");
    appendEvent(dir, new Date("2026-10-20T18:00:00.000Z"), "off");
    appendEvent(dir, new Date("2026-10-20T19:00:00.000Z"), "skip");
    writeFileSync(join(dir, "lock.json"), JSON.stringify({ ticket: "DGS-9", taskId: "t9", claimedAt: "2026-10-20T17:00:00.000Z", claimedAtUtc7: "2026-10-21 00:00:00", order: "", scanId: "" }));
    mkdirSync(join(dir, "reports"));
    writeFileSync(join(dir, "reports", "2026-10-21-0600.md"), "# Report line 1\nline 2\n");
    await parse(["autonomous", "status"]);
    expect(out()).toContain("lock: DGS-9 since 2026-10-21 00:00:00");
    expect(out()).toContain("last scan: 2026-10-21 01:00:00 off");
    expect(out()).toContain(join(dir, "reports", "2026-10-21-0600.md"));
    expect(out()).toContain("# Report line 1");
  });
});

describe("dg autonomous scan", () => {
  it("--dry-run prints the verdict rows at any hour and writes nothing", async () => {
    tracker.add({ id: "t1", status: "ready", key: "DGS-1" });
    tracker.add({ id: "t2", status: "ready", key: "DGS-2", attachments: [] });
    await parse(["autonomous", "scan", "--dry-run", "--repo", "/repo"]);
    expect(process.exitCode ?? 0).toBe(0);
    expect(out()).toMatch(/DGS-1\s+ready/);
    expect(out()).toMatch(/DGS-2\s+\S/);
    expect(out()).not.toMatch(/DGS-2\s+ready/);
    expect(tracker.writeCalls()).toEqual([]);
    expect(existsSync(dir)).toBe(false);
    expect(existsSync(ordersDir)).toBe(false);
    expect(execCalls).toEqual([]);
  });
  it("in the day and not away prints the off outcome and exits 0", async () => {
    await parse(["autonomous", "scan", "--repo", "/repo"]);
    expect(process.exitCode ?? 0).toBe(0);
    expect(out()).toMatch(/scan: off/);
  });
  it("in the day and not away makes no tracker call and never builds the tracker", async () => {
    let built = 0;
    const lazy = (): AutonomousDeps => ({ ...deps(), tracker: () => { built++; throw new Error("createClient called"); } });
    await yargs(["autonomous", "scan", "--repo", "/repo"]).exitProcess(false).command(createAutonomousCommand(lazy)).strict().parseAsync();
    expect(process.exitCode ?? 0).toBe(0);
    expect(out()).toMatch(/scan: off/);
    expect(built).toBe(0);
  });
  it("an unexpected throw exits 1", async () => {
    tracker.hasStatus = async () => { throw new Error("network down"); };
    await parse(["autonomous", "scan", "--dry-run", "--repo", "/repo"]);
    expect(process.exitCode).toBe(1);
    expect(errLog.mock.calls.flat().join("\n")).toMatch(/network down/);
  });
  it("a git that cannot read main stops the scan: guardrail-config, no claim", async () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "away.json"), JSON.stringify({ away: true, since: DAY.toISOString(), until: null, endedAt: null }));
    tracker.add({ id: "t1", status: "ready", key: "DGS-1" });
    const broken = (): AutonomousDeps => ({ ...deps(), git: () => { throw new Error("no repo"); } });
    await yargs(["autonomous", "scan", "--repo", "/repo"]).exitProcess(false).command(createAutonomousCommand(broken)).strict().parseAsync();
    expect(out()).toMatch(/scan: guardrail-config/);
    expect(tracker.writeCalls()).toEqual([]);
  });
  it("--orders overrides the orders dir", async () => {
    const other = join(root, "other-orders");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "away.json"), JSON.stringify({ away: true, since: DAY.toISOString(), until: null, endedAt: null }));
    tracker.add({ id: "t1", status: "ready", key: "DGS-1" });
    await parse(["autonomous", "scan", "--repo", "/repo", "--orders", other]);
    expect(out()).toMatch(/scan: claimed DGS-1/);
    expect(readdirSync(other)).toHaveLength(1);
    expect(existsSync(ordersDir)).toBe(false);
  });
});

describe("dg autonomous release and report", () => {
  it("release with no lock prints the result and kicks the scan", async () => {
    await parse(["autonomous", "release", "--ticket", "DGS-1", "--result", "merged", "--commit", "abc"]);
    expect(process.exitCode ?? 0).toBe(0);
    expect(out()).toMatch(/lock cleared: no/);
    expect(fetchCalls).toEqual(["http://fake/api/v1/jobs/autonomous-scan/run"]);
  });
  it("report writes a report file and prints its path", async () => {
    await parse(["autonomous", "report"]);
    expect(process.exitCode ?? 0).toBe(0);
    expect(readdirSync(join(dir, "reports"))).toHaveLength(1);
    expect(out()).toContain(join(dir, "reports"));
  });
});

describe("dg autonomous tick, journal and the Phase line", () => {
  const tickDeps = (): AutonomousDeps => ({ ...deps(), execOut: async () => { throw new Error("no real exec in tests"); } });
  const parseT = (args: string[]) => yargs(args).exitProcess(false).command(createAutonomousCommand(tickDeps)).strict().parseAsync();
  const lock = (extra: object = {}) => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "lock.json"), JSON.stringify({ ticket: "DGS-1", taskId: "t1", claimedAt: "2026-10-21T00:00:00.000Z", order: "", scanId: "", ...extra }));
  };
  const key = () => plan(dir, DAY, { ticket: "DGS-1", phase: "merge-ready", attempt: 1, action: "order-merge" });

  it("tick with no lock prints no lock", async () => {
    await parseT(["autonomous", "tick"]);
    expect(process.exitCode ?? 0).toBe(0);
    expect(out()).toContain("no lock");
  });
  it("tick without --repo fetches in the main checkout, with --repo in that repo", async () => {
    lock({ phase: "merge-ready", runs: { builder: "b-1" } });
    const calls: string[][] = [];
    const d = (): AutonomousDeps => ({ ...deps(), execOut: async (f, a) => { calls.push([f, ...a]); throw new Error("stop"); } });
    // the run folder of b-1 does not exist, so git is not reached; use a fake run store through DIGISMITH_DEPOT_DIR
    const depot = join(root, "depot");
    const rd = join(depot, "runs", "DGS-1", "b-1");
    mkdirSync(rd, { recursive: true });
    writeFileSync(join(rd, "run.json"), JSON.stringify({ schema: "nightwatch-run/v1", run: "b-1", ticket: "DGS-1", role: "builder", base_sha: null, worktree: "/wt", herdr: { pane: null }, created_at: "2026-10-21T00:01:00.000Z" }));
    const old = process.env.DIGISMITH_DEPOT_DIR;
    process.env.DIGISMITH_DEPOT_DIR = depot;
    try {
      await yargs(["autonomous", "tick"]).exitProcess(false).command(createAutonomousCommand(d)).strict().parseAsync();
      await yargs(["autonomous", "tick", "--repo", "/some/repo"]).exitProcess(false).command(createAutonomousCommand(d)).strict().parseAsync();
    } finally {
      if (old === undefined) delete process.env.DIGISMITH_DEPOT_DIR; else process.env.DIGISMITH_DEPOT_DIR = old;
    }
    const fetches = calls.filter((c) => c[0] === "git" && c.includes("fetch")).map((c) => c[2]);
    expect(fetches).toEqual([MAIN_CHECKOUT, "/some/repo"]);
  });
  it("tick --dry-run says nothing is written", async () => {
    await parseT(["autonomous", "tick", "--dry-run"]);
    expect(out()).toContain("dry run, nothing written");
  });
  it("journal settle on a succeeded key exits 1 and writes nothing", async () => {
    const k = key();
    settle(dir, DAY, k, "succeeded", "done");
    const before = readJournal(dir).length;
    await parseT(["autonomous", "journal", "settle", k, "--result", "retryable"]);
    expect(process.exitCode).toBe(1);
    expect(errLog.mock.calls.flat().join("\n")).toContain("succeeded");
    expect(readJournal(dir)).toHaveLength(before);
  });
  it("journal settle on an uncertain key appends one jack line and frees the key", async () => {
    const k = key();
    settle(dir, DAY, k, "uncertain", "maybe");
    const before = readJournal(dir).length;
    await parseT(["autonomous", "journal", "settle", k, "--result", "retryable", "--note", "checked"]);
    expect(process.exitCode ?? 0).toBe(0);
    const lines = readJournal(dir);
    expect(lines).toHaveLength(before + 1);
    expect(lines[lines.length - 1]).toMatchObject({ status: "settled", result: "retryable", by: "jack", note: "checked" });
    expect(resultsOf(dir)[k]).toBe("retryable");
    expect(() => plan(dir, DAY, { ticket: "DGS-1", phase: "merge-ready", attempt: 1, action: "order-merge" })).not.toThrow();
  });
  it("journal settle on an unknown key exits 1", async () => {
    await parseT(["autonomous", "journal", "settle", "DGS-1:x:1:y", "--result", "permanent"]);
    expect(process.exitCode).toBe(1);
  });
  it("journal lists keys, and --open only the open ones", async () => {
    const a = key();
    settle(dir, DAY, a, "succeeded", "done");
    const b = plan(dir, DAY, { ticket: "DGS-1", phase: "merge-ready", attempt: 1, action: "status-write" });
    await parseT(["autonomous", "journal"]);
    expect(out()).toMatch(/order-merge\s+succeeded/);
    expect(out()).toMatch(/status-write\s+open/);
    log.mockClear();
    await parseT(["autonomous", "journal", "--open"]);
    expect(out()).toContain(b);
    expect(out()).not.toContain(a);
  });
  it("status shows a Phase line when a lock exists", async () => {
    lock({ phase: "review", attempt: 2, phaseStartedAt: "2026-10-21T00:00:00.000Z", runs: { builder: "b-1" } });
    await parseT(["autonomous", "status"]);
    expect(out()).toContain("Phase: review (attempt 2, since 2026-10-21 07:00:00) builder run b-1");
  });
  it("status has no Phase line without a lock", async () => {
    await parseT(["autonomous", "status"]);
    expect(out()).not.toContain("Phase:");
  });
});

describe("dg autonomous: attention, resume, watch", () => {
  const seed = async (n = 2) => {
    const { appendOpen } = await import("./attention.ts");
    for (let i = 1; i <= n; i++) appendOpen(dir, { ticket: `DGS-${i}`, run: `r${i}`, kind: "stalled", cause: "build-over-45-min", since: DAY.toISOString(), ts: DAY.toISOString() });
  };
  it("attention on an empty dir prints none", async () => {
    await parse(["autonomous", "attention"]);
    expect(process.exitCode ?? 0).toBe(0);
    expect(out()).toBe("none");
  });
  it("attention lists both items; --json prints the array", async () => {
    await seed();
    await parse(["autonomous", "attention"]);
    expect(out()).toContain("r1.stalled.0");
    expect(out()).toContain("r2.stalled.0");
    log.mockClear();
    await parse(["autonomous", "attention", "--json"]);
    const arr = JSON.parse(out());
    expect(arr.map((i: { id: string }) => i.id)).toEqual(["r1.stalled.0", "r2.stalled.0"]);
  });
  it("attention ages use the injected clock", async () => {
    const { appendOpen } = await import("./attention.ts");
    appendOpen(dir, { ticket: "DGS-1", run: "r1", kind: "stalled", cause: "x", since: new Date(DAY.getTime() - 90 * 60_000).toISOString(), ts: DAY.toISOString() });
    await parse(["autonomous", "attention"]);
    expect(out()).toContain("1h30m");
  });
  it("attention resolve appends a resolved line by jack", async () => {
    await seed(1);
    await parse(["autonomous", "attention", "resolve", "r1.stalled.0", "--note", "seen"]);
    expect(out()).toContain("resolved r1.stalled.0");
    const text = readFileSync(join(dir, "attention.jsonl"), "utf-8");
    expect(text).toContain('"resolved":true');
    expect(text).toContain('"by":"jack"');
  });
  it("attention resolve with an unknown id exits 1 and writes nothing", async () => {
    await seed(1);
    const before = readFileSync(join(dir, "attention.jsonl"), "utf-8");
    await parse(["autonomous", "attention", "resolve", "nope.0"]);
    expect(process.exitCode).toBe(1);
    expect(readFileSync(join(dir, "attention.jsonl"), "utf-8")).toBe(before);
  });
  it("resume closes an open breaker and its item; on a closed one says so", async () => {
    const { recordRelease, readBreaker } = await import("./breaker.ts");
    const { appendOpen, readOpen } = await import("./attention.ts");
    recordRelease(dir, { ticket: "DGS-1", result: "failed" }, DAY);
    recordRelease(dir, { ticket: "DGS-2", result: "failed" }, DAY);
    appendOpen(dir, { ticket: null, run: "breaker", kind: "failed", cause: "circuit-breaker-open", since: DAY.toISOString(), ts: DAY.toISOString() });
    await parse(["autonomous", "resume"]);
    expect(out()).toContain("breaker closed");
    expect(readBreaker(dir).open).toBe(false);
    expect(readFileSync(join(dir, "breaker.json"), "utf-8")).toContain('"open": false');
    expect(readOpen(dir)).toEqual([]);
    log.mockClear();
    await parse(["autonomous", "resume"]);
    expect(out()).toContain("breaker was not open");
    expect(process.exitCode ?? 0).toBe(0);
  });
  it("release --help lists --cause; autonomous --help lists watch, attention, resume", async () => {
    expect((await viaBuildCli(["autonomous", "release", "--help"])).output).toContain("--cause");
    const h = (await viaBuildCli(["autonomous", "--help"])).output;
    for (const w of ["watch", "attention", "resume"]) expect(h).toContain(w);
  });
  it("watch --dry-run prints the summary line and writes nothing, no journal", async () => {
    const old = process.env.DIGISMITH_DEPOT_DIR;
    process.env.DIGISMITH_DEPOT_DIR = root;
    try {
      await parse(["autonomous", "watch", "--dry-run"]);
    } finally {
      if (old === undefined) delete process.env.DIGISMITH_DEPOT_DIR; else process.env.DIGISMITH_DEPOT_DIR = old;
    }
    expect(process.exitCode ?? 0).toBe(0);
    expect(out()).toContain("watch (dry run, nothing written)");
    expect(existsSync(join(dir, "attention.jsonl"))).toBe(false);
    expect(existsSync(join(dir, "journal.jsonl"))).toBe(false);
  });
});

describe("dg autonomous merge-gate", () => {
  const g = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8" });
  function tempRepo(): string {
    const r = join(root, "gate-repo");
    mkdirSync(r);
    g(r, "init", "-q", "-b", "main");
    g(r, "config", "user.email", "t@example.com");
    g(r, "config", "user.name", "T");
    mkdirSync(join(r, ".digismith"));
    writeFileSync(join(r, ".digismith/config.yml"), "profile: x\n");
    g(r, "add", "-A");
    g(r, "commit", "-q", "-m", "init");
    g(r, "checkout", "-q", "-b", "DGS-9__x");
    writeFileSync(join(r, "a.ts"), "x\n");
    g(r, "add", "-A");
    g(r, "commit", "-q", "-m", "a");
    return r;
  }
  it("prints go for a clean branch", async () => {
    const r = tempRepo();
    await parse(["autonomous", "merge-gate", "--ticket", "DGS-9", "--repo", r]);
    expect(process.exitCode ?? 0).toBe(0);
    expect(out()).toContain("go");
  });
  it("exits 1 with the reason on a refusal and writes one attention item", async () => {
    const r = tempRepo();
    mkdirSync(join(r, "hooks"));
    writeFileSync(join(r, "hooks/a"), "x\n");
    g(r, "add", "-A");
    g(r, "commit", "-q", "-m", "h");
    await parse(["autonomous", "merge-gate", "--ticket", "DGS-9", "--repo", r]);
    expect(process.exitCode).toBe(1);
    expect(errLog.mock.calls.flat().join("\n")).toMatch(/refused: protected path: hooks\/a/);
    expect(existsSync(join(dir, "attention.jsonl"))).toBe(true);
  });
});

describe("schedule-release", () => {
  it("moves a due ticket and prints one line for it", async () => {
    tracker.add({ id: "t1", status: "scheduled", scheduledAt: DAY.getTime() - 60_000, mode: "Manual" });
    await parse(["autonomous", "schedule-release"]);
    expect(tracker.tasks.get("t1")?.status).toBe("to do");
    expect(out()).toContain("schedule-release: 1 scheduled, 1 moved");
    expect(out()).toMatch(/T1\s+2026-10-21 09:59:00\s+Manual\s+moved -> to do/);
    expect(process.exitCode).toBe(0);
  });
  it("--dry-run writes nothing", async () => {
    tracker.add({ id: "t1", status: "scheduled", scheduledAt: DAY.getTime() - 60_000, mode: "Autonomous" });
    await parse(["autonomous", "schedule-release", "--dry-run"]);
    expect(tracker.tasks.get("t1")?.status).toBe("scheduled");
    expect(out()).toContain("schedule-release (dry run, nothing written): 1 scheduled");
    expect(out()).toMatch(/T1\s+.*would-move -> ready/);
  });
  it("--dry-run shows a Manual ticket as would-move -> to do", async () => {
    tracker.add({ id: "t2", status: "scheduled", scheduledAt: DAY.getTime() - 60_000, mode: "Manual" });
    await parse(["autonomous", "schedule-release", "--dry-run"]);
    expect(tracker.tasks.get("t2")?.status).toBe("scheduled");
    expect(out()).toMatch(/T2\s+.*would-move -> to do/);
  });
  it("a tracker that cannot list exits 1", async () => {
    tracker.listByStatus = async () => { throw new Error("401"); };
    await parse(["autonomous", "schedule-release"]);
    expect(errLog.mock.calls.flat().join("\n")).toContain("autonomous: 401");
    expect(process.exitCode).toBe(1);
  });
});
