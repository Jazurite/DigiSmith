import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import yargs from "yargs";
import runCommand from "./index.ts";
import { buildCli } from "../index.ts";
import { findRunDir } from "./paths.ts";

let tmp: string;
let savedDepot: string | undefined;
let savedRunId: string | undefined;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nw-dg-"));
  savedDepot = process.env.DIGISMITH_DEPOT_DIR;
  savedRunId = process.env.DIGISMITH_RUN_ID;
  process.env.DIGISMITH_DEPOT_DIR = tmp;
  delete process.env.DIGISMITH_RUN_ID;
  process.exitCode = undefined;
});
afterEach(() => {
  vi.restoreAllMocks();
  if (savedDepot === undefined) delete process.env.DIGISMITH_DEPOT_DIR; else process.env.DIGISMITH_DEPOT_DIR = savedDepot;
  if (savedRunId === undefined) delete process.env.DIGISMITH_RUN_ID; else process.env.DIGISMITH_RUN_ID = savedRunId;
  process.exitCode = undefined;
  fs.rmSync(tmp, { recursive: true, force: true });
});

// Runs `dg run <args>` in process. Async: later tests must `await dg(...)`.
async function capture(parse: (args: string[]) => Promise<unknown>, args: string[]): Promise<{ status: number; stdout: string; stderr: string }> {
  const out: string[] = [];
  const err: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => { out.push(a.join(" ")); });
  vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => { err.push(a.join(" ")); });
  process.exitCode = undefined;
  try {
    await parse(args);
  } catch (e) {
    err.push(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  }
  const status = Number(process.exitCode ?? 0);
  process.exitCode = undefined;
  vi.restoreAllMocks();
  return { status, stdout: out.join("\n"), stderr: err.join("\n") };
}

const dg = (...args: string[]) =>
  capture(
    (a) => yargs(a).scriptName("dg").command(runCommand).demandCommand(1, "").strict().exitProcess(false).fail((msg, e) => { throw e ?? new Error(msg); }).parseAsync(a),
    ["run", ...args],
  );

describe("dg run", () => {
  it("start prints the run id alone; event, list, show and tail read it back", async () => {
    const s = await dg("start", "--ticket", "DGS-581", "--role", "builder", "--order", "/o.md", "--seat", "dev0");
    expect(s.status).toBe(0);
    const id = s.stdout.trim();
    expect(id).toMatch(/^builder-\d{8}T\d{6}-[0-9a-f]{6}$/);

    expect((await dg("event", id, "review_ready", "--data", '{"pack":"p1"}')).status).toBe(0);
    expect((await dg("event", id, "merged")).status).toBe(0);

    const list = JSON.parse((await dg("list", "--json")).stdout);
    expect(list).toHaveLength(1);
    expect(list[0].record.run).toBe(id);
    expect(list[0].summary.events).toBe(2);
    expect((await dg("list", "--ticket", "DGS-9", "--json")).stdout.trim()).toBe("[]");
    expect((await dg("list")).stdout).toContain(id);

    const show = JSON.parse((await dg("show", id, "--json")).stdout);
    expect(show.record.seat).toBe("dev0");
    expect(show.summary.last_type).toBe("merged");
    expect((await dg("show", id)).stdout).toContain("DGS-581");

    const all = (await dg("tail", id)).stdout.trim().split("\n").map((l) => JSON.parse(l));
    expect(all.map((e) => [e.seq, e.type])).toEqual([[1, "review_ready"], [2, "merged"]]);
    expect(all[0].data).toEqual({ pack: "p1" });
    expect((await dg("tail", id, "--since", "1")).stdout.trim().split("\n").map((l) => JSON.parse(l).seq)).toEqual([2]);
  });
  it("exits 1 with a message for an unknown run, an unknown type, a bad --data and a bad role", async () => {
    const id = (await dg("start", "--ticket", "DGS-581", "--role", "scout", "--order", "/o.md")).stdout.trim();
    expect((await dg("event", "builder-x-000000", "merged")).status).toBe(1);
    expect((await dg("event", id, "started")).status).toBe(1); // a hook type, not a conductor type
    expect((await dg("event", id, "merged", "--data", "[1]")).status).toBe(1);
    expect((await dg("show", "builder-x-000000")).status).toBe(1);
    expect((await dg("tail", "builder-x-000000")).status).toBe(1);
    const bad = await dg("start", "--ticket", "DGS-581", "--role", "boss", "--order", "/o.md");
    expect(bad.status).toBe(1);
    expect(bad.stderr).toMatch(/role/);
  });
  it("start without --order exits 1, names order and writes nothing", async () => {
    const r = await dg("start", "--ticket", "DGS-1", "--role", "scout");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/order/);
    expect(r.stdout).toBe("");
    expect(fs.existsSync(path.join(tmp, "runs"))).toBe(false);
  });
  it("tail --help says the file position is the authority", async () => {
    const r = await dg("tail", "--help");
    expect((r.stdout + r.stderr).replace(/\s+/g, " ")).toContain("file position is the authority");
  });
  it("refuses a bad --since with exit 1 and prints nothing", async () => {
    const id = (await dg("start", "--ticket", "DGS-581", "--role", "scout", "--order", "/o.md")).stdout.trim();
    await dg("event", id, "merged");
    for (const v of ["abc", "-1"]) {
      const r = await dg("tail", id, `--since=${v}`);
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/--since/);
      expect(r.stdout).toBe("");
    }
  });
  it("a --data that is not JSON exits 1, names --data and appends nothing", async () => {
    const id = (await dg("start", "--ticket", "DGS-581", "--role", "scout", "--order", "/o.md")).stdout.trim();
    const r = await dg("event", id, "merged", "--data", "not json");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/--data/);
    expect((await dg("tail", id)).stdout).toBe("");
  });
  it("event phase takes building, review and merge and refuses anything else", async () => {
    const id = (await dg("start", "--ticket", "DGS-581", "--role", "builder", "--order", "/o.md")).stdout.trim();
    for (const p of ["building", "review", "merge"]) expect((await dg("event", id, "phase", "--data", JSON.stringify({ phase: p }))).status).toBe(0);
    for (const args of [["--data", '{"phase":"done"}'], ["--data", "{}"], []]) {
      const r = await dg("event", id, "phase", ...args);
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/phase/);
    }
    const tail = (await dg("tail", id)).stdout.trim().split("\n").map((l) => JSON.parse(l));
    expect(tail.map((e) => [e.seq, e.type, e.data.phase])).toEqual([[1, "phase", "building"], [2, "phase", "review"], [3, "phase", "merge"]]);
  });
  it("keeps file order and tolerates two lines that share a seq", async () => {
    const id = (await dg("start", "--ticket", "DGS-581", "--role", "builder", "--order", "/o.md")).stdout.trim();
    const dir = findRunDir(id)!;
    const line = (seq: number, type: string, ts: string) => JSON.stringify({ schema: "nightwatch-event/v1", seq, ts, run: id, type, data: {} });
    fs.writeFileSync(
      path.join(dir, "events.jsonl"),
      [line(1, "started", "2026-10-21T01:00:00Z"), line(2, "tool", "2026-10-21T01:00:01Z"), line(2, "blocked", "2026-10-21T01:00:02Z"), line(3, "turn_end", "2026-10-21T01:00:03Z")].join("\n") + "\n",
    );
    const tail = await dg("tail", id);
    expect(tail.status).toBe(0);
    expect(tail.stdout.trim().split("\n").map((l) => JSON.parse(l).type)).toEqual(["started", "tool", "blocked", "turn_end"]);
    const show = await dg("show", id, "--json");
    expect(show.status).toBe(0);
    expect(JSON.parse(show.stdout).summary.events).toBe(4);
    const list = await dg("list", "--json");
    expect(list.status).toBe(0);
    expect(JSON.parse(list.stdout)).toHaveLength(1);
  });
  it("the root CLI registers run", async () => {
    const r = await capture((a) => buildCli(a).exitProcess(false).parseAsync(a), ["run", "list", "--json"]);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe("[]");
  });
  it("list hides runs idle for more than 7 days unless --all or a wider --days", async () => {
    const fresh = (await dg("start", "--ticket", "DGS-1", "--role", "builder", "--order", "/o.md")).stdout.trim();
    const old = (await dg("start", "--ticket", "DGS-2", "--role", "builder", "--order", "/o.md")).stdout.trim();
    const t = (Date.now() - 9 * 86_400_000) / 1000;
    for (const f of ["run.json", "events.jsonl"]) {
      const p = path.join(findRunDir(old, process.env)!, f);
      if (fs.existsSync(p)) fs.utimesSync(p, t, t);
    }
    const ids = async (...a: string[]) => (JSON.parse((await dg("list", "--json", ...a)).stdout) as { record: { run: string } }[]).map((r) => r.record.run).sort();
    expect(await ids()).toEqual([fresh]);
    expect(await ids("--all")).toEqual([fresh, old].sort());
    expect(await ids("--days", "10")).toEqual([fresh, old].sort());
    const bad = await dg("list", "--days", "0");
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain("--days must be a whole number of 1 or more");
  });
});

describe("dg run limit (DGS-665)", () => {
  // The limits come from process.cwd()'s config: pin cwd to a temp dir so the repo's own config never leaks in.
  let cwdDir: string;
  const writeConfig = (text: string): void => {
    fs.mkdirSync(path.join(cwdDir, ".digismith"), { recursive: true });
    fs.writeFileSync(path.join(cwdDir, ".digismith", "config.yml"), text);
  };
  beforeEach(() => {
    cwdDir = fs.mkdtempSync(path.join(os.tmpdir(), "nw-cwd-"));
  });
  // capture() restores every mock after a call, so the cwd pin is set again before each one
  const dgc = (...args: string[]) => {
    vi.spyOn(process, "cwd").mockReturnValue(cwdDir);
    return dg(...args);
  };
  afterEach(() => {
    fs.rmSync(cwdDir, { recursive: true, force: true });
  });
  const runFolders = (): number => {
    const root = path.join(tmp, "runs");
    if (!fs.existsSync(root)) return 0;
    return fs.readdirSync(root).reduce((n, k) => n + fs.readdirSync(path.join(root, k)).length, 0);
  };
  const startTwoBuilders = async (): Promise<void> => {
    expect((await dgc("start", "--ticket", "DGS-1", "--role", "builder", "--order", "/o.md")).status).toBe(0);
    expect((await dgc("start", "--ticket", "DGS-2", "--role", "builder", "--order", "/o.md")).status).toBe(0);
  };
  it("refuses a third builder, names the open runs and writes no record", async () => {
    await startTwoBuilders();
    const before = runFolders();
    const r = await dgc("start", "--ticket", "DGS-3", "--role", "builder", "--order", "/o.md");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/^limit: builder 2 of 2 in use/);
    expect(runFolders()).toBe(before);
  });
  it("lets a reviewer, a maestro and a conductor start while builders are full", async () => {
    await startTwoBuilders();
    expect((await dgc("start", "--ticket", "DGS-3", "--role", "reviewer", "--order", "/o.md")).status).toBe(0);
    expect((await dgc("start", "--ticket", "DGS-3", "--role", "maestro", "--order", "/o.md")).status).toBe(0);
    expect((await dgc("start", "--ticket", "DGS-3", "--role", "conductor", "--order", "/o.md")).status).toBe(0);
  });
  it("limit prints the status line and one row per busy run, and exits 0", async () => {
    await startTwoBuilders();
    const r = await dgc("limit");
    expect(r.status).toBe(0);
    const lines = r.stdout.split("\n");
    expect(lines[0]).toBe("limits: builder 2/2, reviewer 0/1, role 0/1");
    expect(lines.filter((l) => l.startsWith("builder  "))).toHaveLength(2);
  });
  it("limit --json gives the count", async () => {
    const j = JSON.parse((await dgc("limit", "--json")).stdout);
    expect(j.limits).toEqual({ builder: 2, reviewer: 1, role: 1 });
    expect(j.problems).toEqual([]);
  });
  it("limit prints a problem line for a bad config value and uses the default", async () => {
    writeConfig("nightwatch:\n  limits:\n    builder: many\n");
    const r = await dgc("limit");
    expect(r.status).toBe(0);
    expect(r.stdout.split("\n")[0]).toBe("limits: builder 0/2, reviewer 0/1, role 0/1");
    expect(r.stdout).toMatch(/^problem: nightwatch\.limits\.builder: "many"/m);
  });
  it("limit follows a changed limit in the config", async () => {
    writeConfig("nightwatch:\n  limits:\n    builder: 1\n");
    await dgc("start", "--ticket", "DGS-1", "--role", "builder", "--order", "/o.md");
    const r = await dgc("start", "--ticket", "DGS-2", "--role", "builder", "--order", "/o.md");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/^limit: builder 1 of 1 in use/);
  });
  it("limit shows a stale run on a stale row and does not count it", async () => {
    const id = (await dgc("start", "--ticket", "DGS-1", "--role", "builder", "--order", "/o.md")).stdout.trim();
    const dir = findRunDir(id, process.env) as string;
    const old = new Date(Date.now() - 3 * 3600_000).toISOString();
    fs.writeFileSync(path.join(dir, "events.jsonl"), JSON.stringify({ schema: "nightwatch-event/v1", seq: 1, ts: old, run: id, type: "tool", data: {} }) + "\n");
    const r = await dgc("limit");
    expect(r.stdout.split("\n")[0]).toBe("limits: builder 0/2, reviewer 0/1, role 0/1");
    expect(r.stdout).toMatch(new RegExp(`^stale  builder  ${id} \\(DGS-1, \\d+ min\\): clear with dg run event ${id} lost$`, "m"));
  });
  it("the factory ticket's own builder starts beside one hand builder; another ticket is still refused", async () => {
    await dgc("start", "--ticket", "DGS-1", "--role", "builder", "--order", "/o.md");
    fs.mkdirSync(path.join(tmp, "autonomous"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "autonomous", "lock.json"), JSON.stringify({ ticket: "DGS-9" }));
    const other = await dgc("start", "--ticket", "DGS-2", "--role", "builder", "--order", "/o.md");
    expect(other.status).toBe(1);
    expect(other.stderr).toMatch(/^limit: builder 2 of 2 in use.*factory lock \(DGS-9\)/);
    const factory = await dgc("start", "--ticket", "DGS-9", "--role", "builder", "--order", "/o.md");
    expect(factory.status).toBe(0);
  });
});
