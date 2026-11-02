import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import yargs from "yargs";
import { buildCli } from "../../index.ts";
import { appendAttention } from "../attention-write.ts";
import { readOpen } from "../attention.ts";
import { FakeTracker } from "../fake-tracker.test-util.ts";
import { createDirectorCommand, type DirectorDeps } from "./command.ts";
import { readDecisions } from "./record.ts";
import { acquireRefineLock, readRefineLock } from "./refine.ts";

const NOW = new Date("2026-11-03T03:00:00.000Z");
let root: string;
let dir: string;
let tracker: FakeTracker;
let calls: string[];
let log: ReturnType<typeof vi.spyOn>;
let errLog: ReturnType<typeof vi.spyOn>;
const out = () => log.mock.calls.flat().join("\n");

const deps = (): DirectorDeps => ({
  dir, now: () => NOW, tracker: () => tracker,
  effects: {
    promptDriver: async (t, x) => { calls.push(`driver ${t} ${x}`); }, releaseBuild: async (t) => { calls.push(`release ${t}`); },
    refineRelease: async () => ({ code: 0, text: "ok" }), startRefine: async () => {}, promptSelf: async () => {},
  },
  roleOf: () => "builder",
  boardDir: () => null,
  checkReadyCtx: { repo: "/r", fileExists: () => false },
  readDescription: async () => "",
  taskIdOf: async (k) => [...tracker.tasks.values()].find((t) => t.key === k)!.id,
});
const run = (args: string[]) => yargs(args).exitProcess(false).command(createDirectorCommand(deps)).strict().parseAsync();

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "director-cmd-"));
  dir = join(root, "autonomous");
  mkdirSync(dir, { recursive: true });
  tracker = new FakeTracker();
  tracker.statuses.add("concept"); tracker.statuses.add("refinement");
  tracker.add({ id: "t1", key: "DGS-1", status: "refinement" });
  calls = [];
  log = vi.spyOn(console, "log").mockImplementation(() => {});
  errLog = vi.spyOn(console, "error").mockImplementation(() => {});
  process.exitCode = 0;
});
afterEach(() => { vi.restoreAllMocks(); process.exitCode = 0; rmSync(root, { recursive: true, force: true }); });

describe("dg director", () => {
  it("is registered in the CLI", async () => {
    const r: { output: string } = await new Promise((resolve) => { buildCli(["director", "--help"]).exitProcess(false).parse(["director", "--help"], {}, (_e, _a, output) => resolve({ output })); });
    for (const c of ["plan", "do", "decide", "escalate", "refine-round", "refine-release", "seat"]) expect(r.output).toContain(c);
  });

  it("plan with no items prints 'no moves'", async () => {
    await run(["director", "plan"]);
    expect(out()).toContain("no moves");
    expect(out()).toContain("2026-11-03 10:00:00 UTC+7");
    expect(process.exitCode).toBe(0);
  });

  it("plan prints the shown moves with their ids; --json prints the plan; a list-only row is shown", async () => {
    writeFileSync(join(dir, "lock.json"), JSON.stringify({ ticket: "DGS-1", taskId: "t1", claimedAt: "", claimedAtUtc7: "", order: "", scanId: "s" }));
    appendAttention(dir, new Date(NOW.getTime() - 3 * 3600_000), { ticket: "DGS-1", run: "r1", kind: "stalled", cause: "silent-working-180-min" });
    appendAttention(dir, NOW, { ticket: "DGS-9", run: "r9", kind: "lost", cause: "pane-gone" });
    await run(["director", "plan"]);
    expect(out()).toMatch(/m-[0-9a-f]{8}  reprompt DGS-1 run r1 via driver/);
    expect(out()).toMatch(/list-only/);
    log.mockClear();
    await run(["director", "plan", "--json"]);
    const j = JSON.parse(out());
    expect(j.wake).toBe(true);
    expect(j.moves).toHaveLength(1);
  });

  it("do with an unknown id exits 4; do runs a move and a repeat says already done", async () => {
    await run(["director", "do", "m-deadbeef"]);
    expect(process.exitCode).toBe(4);
    log.mockClear();
    writeFileSync(join(dir, "lock.json"), JSON.stringify({ ticket: "DGS-1", taskId: "t1", claimedAt: "", claimedAtUtc7: "", order: "", scanId: "s" }));
    appendAttention(dir, new Date(NOW.getTime() - 3 * 3600_000), { ticket: "DGS-1", run: "r1", kind: "stalled", cause: "silent-working-180-min" });
    await run(["director", "plan", "--json"]);
    const id = JSON.parse(out()).moves[0].id as string;
    log.mockClear();
    await run(["director", "do", id]);
    expect(process.exitCode).toBe(0);
    expect(calls).toHaveLength(1);
    await run(["director", "do", id]);
    expect(out()).toContain("already done");
    expect(calls).toHaveLength(1);
  });

  it("decide refuses a Jack id with exit 3, an unknown id with exit 4, and records a within id", async () => {
    await run(["director", "decide", "--id", "delete-data", "--ticket", "DGS-1", "--what", "w", "--why", "y"]);
    expect(process.exitCode).toBe(3);
    expect(out()).toContain("outside the Director's authority: use dg director escalate");
    process.exitCode = 0;
    await run(["director", "decide", "--id", "make-coffee", "--ticket", "DGS-1", "--what", "w", "--why", "y"]);
    expect(process.exitCode).toBe(4);
    process.exitCode = 0;
    await run(["director", "decide", "--id", "pick-seat", "--ticket", "DGS-1", "--run", "r1", "--what", "seat dev0", "--why", "soonest reset"]);
    expect(process.exitCode).toBe(0);
    expect(readDecisions(dir)).toMatchObject([{ ticket: "DGS-1", id: "pick-seat", run: "r1", what: "seat dev0" }]);
  });

  it("escalate twice prints already asked and opens the attention item", async () => {
    const a = ["director", "escalate", "--ticket", "DGS-1", "--question", "Which name?"];
    await run(a);
    expect(process.exitCode).toBe(0);
    expect(tracker.tasks.get("t1")?.status).toBe("concept");
    log.mockClear();
    await run(a);
    expect(out()).toContain("already asked");
    expect(process.exitCode).toBe(1);
    expect(readOpen(dir).filter((i) => i.cause === "question-already-asked")).toHaveLength(1);
    expect(tracker.comments).toHaveLength(1);
  });

  it("refine-release ready without --report exits 2", async () => {
    acquireRefineLock(dir, { ticket: "DGS-1", taskId: "t1", claimedAt: NOW.toISOString(), claimedAtUtc7: "", order: "o", scanId: "s", attempt: 1, round: 1 });
    await run(["director", "refine-release", "--ticket", "DGS-1", "--result", "ready"]);
    expect(process.exitCode).toBe(2);
    expect(out()).toContain("--report");
  });

  it("refine-round sets round 2; without a lock it fails", async () => {
    await run(["director", "refine-round", "--ticket", "DGS-1"]);
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
    acquireRefineLock(dir, { ticket: "DGS-1", taskId: "t1", claimedAt: NOW.toISOString(), claimedAtUtc7: "", order: "o", scanId: "s", attempt: 1, round: 1 });
    await run(["director", "refine-round", "--ticket", "DGS-1"]);
    expect(process.exitCode).toBe(0);
    expect(readRefineLock(dir)).toMatchObject({ round: 2 });
  });

  it("seat prints the ranking", async () => {
    const f = join(root, "readings.json");
    const H = 3600_000;
    writeFileSync(f, JSON.stringify([
      { seat: "jack", fiveHourUsed: 30, weeklyUsed: 80, weeklyResetsAt: NOW.getTime() + 100 * H, workers: 1 },
      { seat: "dev0", fiveHourUsed: 20, weeklyUsed: 40, weeklyResetsAt: NOW.getTime() + 100 * H, workers: 0 },
      { seat: "dead", exhaustedUntil: NOW.getTime() + H },
    ]));
    await run(["director", "seat", "--readings", f]);
    expect(out()).toContain("seats, best first: dev0, jack");
    writeFileSync(f, "{nope");
    await run(["director", "seat", "--readings", f]);
    expect(process.exitCode).toBe(2);
  });
});
