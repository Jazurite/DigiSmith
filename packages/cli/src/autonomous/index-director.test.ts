import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readFileSync as read } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import yargs from "yargs";
import { FakeTracker } from "./fake-tracker.test-util.ts";
import { createAutonomousCommand, type AutonomousDeps } from "./index.ts";
import { readDecisions } from "./director/record.ts";
import { directorWiring } from "./director/wiring.ts";
import { readRefineLock } from "./director/refine.ts";
import { PromptError } from "./act.ts";
import type { Exec } from "./conductor.ts";

const DAY = new Date("2026-10-21T03:00:00.000Z"); // 10:00 UTC+7
const EMPTY = read(join(__dirname, "fixtures", "input-box-empty.ansi"), "utf8");
let root: string;
let dir: string;
let ordersDir: string;
let tracker: FakeTracker;
let execCalls: { file: string; args: string[]; env?: Record<string, string> }[];
let outCalls: string[][];
let execCode: number;
let log: ReturnType<typeof vi.spyOn>;

const withDirector = (): void => {
  writeFileSync(join(root, "conductors.json"), JSON.stringify({
    "DigiSmith/digismith-conductor": { workspace: "w2" },
    "DigiSmith/director": { session: "Castle", workspace: "w1", kind: "factory" },
  }));
};
const withoutDirector = (): void => {
  writeFileSync(join(root, "conductors.json"), JSON.stringify({ "DigiSmith/digismith-conductor": { tab: 1, workspace: "w2" } }));
};
const exec: Exec = async (file, args, env) => { execCalls.push({ file, args, env }); return { code: execCode, stderr: execCode === 0 ? "" : "boom" }; };
const deps = (): AutonomousDeps => ({
  tracker: () => tracker, dir, ordersDir, conductorsJson: join(root, "conductors.json"), now: () => DAY, scanId: () => "scan-1",
  exec, fileExists: () => false, git: () => "",
  execOut: async (_f, args) => {
    outCalls.push(args);
    if (args.includes("list")) return { stdout: JSON.stringify({ result: { agents: [{ name: "director", agent_status: "idle", pane_id: "p1" }] } }) };
    if (args.includes("read")) return { stdout: EMPTY };
    return { stdout: "" };
  },
  mainRepo: join(root, "repo"),
  nexus: { baseUrl: "http://fake", tokenFile: join(root, "token"), fetch: (async () => new Response("{}", { status: 202 })) as unknown as typeof fetch },
});
const scan = () => yargs(["autonomous", "scan", "--repo", "/repo"]).exitProcess(false).command(createAutonomousCommand(deps)).strict().parseAsync();
const prompted = (): string[] => execCalls.filter((c) => c.args.includes("prompt")).map((c) => c.args[c.args.length - 1]);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "auto-idx-dir-"));
  dir = join(root, "autonomous");
  ordersDir = join(root, "orders");
  mkdirSync(join(root, "repo"), { recursive: true });
  writeFileSync(join(root, "token"), "tok\n");
  tracker = new FakeTracker();
  tracker.statuses.add("concept"); tracker.statuses.add("refinement");
  execCalls = []; outCalls = []; execCode = 0;
  log = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); process.exitCode = 0; rmSync(root, { recursive: true, force: true }); });

describe("dg autonomous scan with and without a Director in the registry", () => {
  it("with no Director in the registry nothing changes: the claim prompts the factory conductor as before, no refine claim, no wake", async () => {
    withoutDirector();
    tracker.add({ id: "t1", key: "DGS-1" });
    tracker.add({ id: "t2", key: "DGS-2", status: "refinement", text: "Done when: ok" });
    await scan();
    expect(log.mock.calls.flat().join("\n")).toContain("scan: claimed DGS-1");
    expect(execCalls).toHaveLength(1);
    expect(execCalls[0].args).toEqual(["agent", "prompt", "digismith-conductor", expect.stringContaining("Autonomous order: build DGS-1")]);
    expect(readRefineLock(dir)).toBeNull();
    expect(outCalls).toEqual([]);
    expect(readDecisions(dir)).toEqual([]);
  });

  it("with a Director the refine lane is on: a refine claim prompts the Director in the Castle", async () => {
    withDirector();
    tracker.add({ id: "t2", key: "DGS-2", status: "refinement", text: "Done when: ok" });
    await scan();
    expect(readRefineLock(dir)).toMatchObject({ ticket: "DGS-2" });
    const p = execCalls.find((c) => c.args.includes("director"));
    expect(p?.args.slice(0, 5)).toEqual(["--session", "Castle", "agent", "prompt", "director"]);
    expect(p?.args[5]).toMatch(/^Director: refine DGS-2, read /);
    expect(p?.env?.HERDR_SCOPE).toContain("Castle:w1");
  });

  it("with a Director the wake runs: a refine lock older than 6 hours wakes it with the tick prompt", async () => {
    withDirector();
    tracker.add({ id: "t2", key: "DGS-2", status: "refinement", text: "Done when: ok" });
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "refine-lock.json"), JSON.stringify({ ticket: "DGS-2", taskId: "t2", claimedAt: new Date(DAY.getTime() - 7 * 3600_000).toISOString(), claimedAtUtc7: "", order: "o", scanId: "s", attempt: 1, round: 1 }));
    await scan();
    expect(outCalls.some((a) => a.includes("list"))).toBe(true);
    expect(outCalls.find((a) => a.includes("prompt"))).toEqual(["--session", "Castle", "agent", "prompt", "director", "Director tick: dg director plan"]);
  });

  it("a build claim goes to the driver, never to the Director", async () => {
    withDirector();
    tracker.add({ id: "t1", key: "DGS-1" });
    await scan();
    expect(log.mock.calls.flat().join("\n")).toContain("scan: claimed DGS-1");
    const orders = prompted().filter((m) => m.startsWith("Autonomous order"));
    expect(orders).toHaveLength(1);
    const call = execCalls.find((c) => c.args.includes("prompt") && c.args.some((a) => a.startsWith("Autonomous order")))!;
    expect(call.args).toEqual(["agent", "prompt", "digismith-conductor", expect.any(String)]);
    expect(call.args).not.toContain("director");
    expect(JSON.parse(readFileSync(join(root, "drivers", "DGS-1.json"), "utf8"))).toMatchObject({ driver: "digismith-conductor", mode: "factory" });
    expect(readDecisions(dir)).toMatchObject([{ ticket: "DGS-1", id: "claim-build" }]);
  });

  it("a driver named in drivers/<KEY>.json receives the claim's order text from promptDriver (another conductor in the registry)", async () => {
    writeFileSync(join(root, "conductors.json"), JSON.stringify({
      "DigiSmith/digismith-conductor": { workspace: "w2" }, "DigiSmith/director": { session: "Castle", workspace: "w1", kind: "factory" }, "Emma/emma-conductor": { workspace: "w3" },
    }));
    mkdirSync(join(root, "drivers"));
    writeFileSync(join(root, "drivers", "DGS-1.json"), JSON.stringify({ ticket: "DGS-1", driver: "emma-conductor", since: "x", mode: "factory" }));
    tracker.add({ id: "t1", key: "DGS-1" });
    await scan();   // DGS-1 is driven by another conductor: the scan skips it
    expect(log.mock.calls.flat().join("\n")).toContain("driven-by:emma-conductor");
    expect(prompted()).toEqual([]);
  });
});

describe("the tick order", () => {
  const input = () => ({ dir, now: () => DAY, conductorsJson: join(root, "conductors.json"), exec, execOut: deps().execOut, mainRepo: join(root, "repo"), limitEnv: { ...process.env, AUTONOMOUS_DIR: dir } });
  it("a tick order goes to the driver: promptDriver with the ticket, via the driver record", async () => {
    withDirector();
    mkdirSync(join(root, "drivers"));
    writeFileSync(join(root, "drivers", "DGS-1.json"), JSON.stringify({ ticket: "DGS-1", driver: "digismith-conductor", since: "x", mode: "factory" }));
    const w = directorWiring(input());
    expect(w).not.toBeNull();
    await w!.tickPrompt("DGS-1")("DGS-1: restart the builder");
    expect(execCalls[0].args).toEqual(["agent", "prompt", "digismith-conductor", "DGS-1: restart the builder"]);
  });
  it("a refused prompt is a PromptError that says nothing was delivered", async () => {
    withDirector();
    execCode = 1;
    await expect(directorWiring(input())!.tickPrompt("DGS-1")("x")).rejects.toMatchObject({ delivered: "no" });
    await expect(directorWiring(input())!.tickPrompt("DGS-1")("x")).rejects.toBeInstanceOf(PromptError);
  });
  it("with no Director there is no wiring", () => {
    withoutDirector();
    expect(directorWiring(input())).toBeNull();
  });
});
