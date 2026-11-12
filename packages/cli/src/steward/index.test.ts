import { describe, it, expect, vi, afterEach } from "vitest";
import { buildCli } from "../index.ts";
import { createStewardCommand, defaultDeps } from "./index.ts";
import type { EventDeps } from "./event.ts";
import { FakeTracker, snapshot } from "./fake-tracker.test-util.ts";
import * as os from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";
import yargs from "yargs";

afterEach(() => { vi.restoreAllMocks(); process.exitCode = 0; });

function cli(tracker: FakeTracker | null, runModel?: (p: string) => Promise<string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stidx-"));
  const deps = (): EventDeps => ({ tracker, dir, now: () => new Date("2026-10-18T05:00:00Z"), config: { releaseStage: false }, sessionIds: () => [] });
  return { dir, parse: (args: string[]) => yargs(args).exitProcess(false).command(createStewardCommand(deps, runModel)).strict().parseAsync() };
}

describe("dg steward", () => {
  it("is in the root help", async () => {
    const out: string[] = [];
    await new Promise<void>((resolve) => buildCli(["--help"]).parse(["--help"], {}, (_e, _a, o) => { out.push(o); resolve(); }));
    expect(out.join("")).toMatch(/steward/);
  });
  it("applies an event and prints the line", async () => {
    const t = new FakeTracker(snapshot("to do"));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await cli(t).parse(["steward", "event", "started", "--ticket", "DGS-1"]);
    expect(log.mock.calls.flat().join("\n")).toContain("to do -> in progress");
    expect(process.exitCode ?? 0).toBe(0);
  });
  it("--hook: a usage error prints one line and exits 0", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await cli(new FakeTracker(snapshot("refinement"))).parse(["steward", "event", "approved", "--ticket", "DGS-1", "--hook"]);
    expect(process.exitCode ?? 0).toBe(0);
    expect(err.mock.calls.flat().join("\n")).toMatch(/--quote/);
  });
  it("--hook: a refusal keeps its stderr line and exits 0", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await cli(new FakeTracker(snapshot("refinement"))).parse(["steward", "event", "started", "--ticket", "DGS-1", "--hook", "--by", "worker"]);
    expect(process.exitCode ?? 0).toBe(0);
    expect(err.mock.calls.flat().join("\n")).toMatch(/refused started/);
  });
  it("--hook with no tracker prints nothing", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await cli(null).parse(["steward", "event", "started", "--ticket", "DGS-1", "--hook"]);
    expect(log).not.toHaveBeenCalled();
    expect(err).not.toHaveBeenCalled();
  });
  it("--hook reaches the deps factory as quiet: true; without it quiet is false", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stq-"));
    const seen: unknown[] = [];
    const factory = (o?: { quiet?: boolean }): EventDeps => {
      seen.push(o);
      return { tracker: null, dir, now: () => new Date("2026-10-18T05:00:00Z"), config: { releaseStage: false }, sessionIds: () => [] };
    };
    const run = (extra: string[]) => yargs(["steward", "event", "started", "--ticket", "DGS-1", ...extra]).exitProcess(false).command(createStewardCommand(factory)).strict().parseAsync();
    await run(["--hook"]);
    await run([]);
    expect(seen).toEqual([{ quiet: true }, { quiet: false }]);
  });
  it("defaultDeps quiet: a jira profile prints nothing and has no tracker", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "stprof-"));
    fs.mkdirSync(path.join(cwd, ".digismith"));
    fs.mkdirSync(path.join(cwd, "profiles"));
    fs.writeFileSync(path.join(cwd, ".digismith", "config.yml"), "profile: jiraish\n");
    fs.writeFileSync(path.join(cwd, "profiles", "jiraish.yml"), "tracker: jira\n");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(defaultDeps({ quiet: true, cwd }).tracker).toBeNull();
    expect(err).not.toHaveBeenCalled();
    expect(defaultDeps({ cwd }).tracker).toBeNull();
    expect(err).toHaveBeenCalledTimes(1);
  });
  it("a gate event without a quote is a usage error (exit 2)", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await cli(new FakeTracker(snapshot("refinement"))).parse(["steward", "event", "approved", "--ticket", "DGS-1"]);
    expect(process.exitCode).toBe(2);
    expect(err.mock.calls.flat().join("\n")).toMatch(/--quote/);
  });
  it("warnings go to stderr, successes to stdout, exit 0", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await cli(new FakeTracker(snapshot("refinement"))).parse(["steward", "event", "started", "--ticket", "DGS-1"]);
    expect(log).not.toHaveBeenCalled();
    expect(err.mock.calls.flat().join("\n")).toMatch(/refused started/);
    expect(process.exitCode ?? 0).toBe(0);
  });
  it("a tracker failure prints one line and exits 0", async () => {
    const t = new FakeTracker(snapshot("to do"));
    t.getTicket = async () => { throw new Error("network down"); };
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await cli(t).parse(["steward", "event", "started", "--ticket", "DGS-1"]);
    expect(process.exitCode ?? 0).toBe(0);
    expect(err.mock.calls.flat().join("\n")).toMatch(/network down/);
  });
  it("approved --into scheduled prints a move to scheduled", async () => {
    const t = new FakeTracker(snapshot("refinement"));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await cli(t).parse(["steward", "event", "approved", "--ticket", "DGS-1", "--quote", "go", "--into", "scheduled", "--dry-run"]);
    expect(log.mock.calls.flat().join("\n")).toBe("steward: dry run: DGS-1: refinement -> scheduled");
    expect(process.exitCode ?? 0).toBe(0);
  });
  it("--into with another event is a usage error (exit 2)", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await cli(new FakeTracker(snapshot("to do"))).parse(["steward", "event", "started", "--ticket", "DGS-1", "--into", "scheduled"]);
    expect(process.exitCode).toBe(2);
    expect(err.mock.calls.flat().join("\n")).toMatch(/--into is valid only with approved/);
  });
  it("--dry-run writes nothing", async () => {
    const t = new FakeTracker(snapshot("to do"));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const c = cli(t);
    await c.parse(["steward", "event", "started", "--ticket", "DGS-1", "--dry-run"]);
    expect(log.mock.calls.flat().join("\n")).toMatch(/dry run/);
    expect(t.calls).toEqual([]);
  });
  it("with no tracker it is silent and exits 0", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await cli(null).parse(["steward", "event", "started", "--ticket", "DGS-1"]);
    expect(log).not.toHaveBeenCalled();
    expect(process.exitCode ?? 0).toBe(0);
  });
  it("an unknown event name is rejected", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(async () => cli(null).parse(["steward", "event", "bogus", "--ticket", "DGS-1"])).rejects.toThrow();
  });
  it("file prints the filed line using the injected model", async () => {
    const t = new FakeTracker(snapshot("backlog"));
    t.targets = [{ id: "L5", name: "B.5: Autonomous Engineering", folder: "B: Agentic", description: "" }];
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const reply = JSON.stringify({ duplicate_of: null, list: "L5", type: "Task", title: "x" });
    await cli(t, async () => reply).parse(["steward", "file", "x", "--type", "Bug"]);
    expect(log.mock.calls.flat().join("\n")).toMatch(/^steward: filed DGS-900/);
    expect(t.created[0].type).toBe("Bug");
  });
});
