import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import yargs from "yargs";
import { makeConductorCommand, realLive } from "./index.ts";
import { buildCli } from "../index.ts";
import { claimDriver, readDriver } from "./drivers.ts";
import type { ExecOut } from "./start-ticket.ts";

let depot: string; let repo: string; let env: NodeJS.ProcessEnv;
let calls: string[][];
const exec: ExecOut = async (_f, args) => {
  calls.push(args);
  return { code: 0, stderr: "", stdout: args[3] === "create" ? JSON.stringify({ result: { root_pane: { pane_id: "w7:p9" }, tab: { tab_id: "w7:t4" } } }) : "" };
};
const T = (n: number) => ({ kind: "ticket", ticket: `DGS-${n}`, session: "Castle", workspace: "w7", floor: "w2", status: "open" });

beforeEach(() => {
  depot = fs.mkdtempSync(path.join(os.tmpdir(), "ci-depot-"));
  repo = fs.mkdtempSync(path.join(os.tmpdir(), "ci-repo-"));
  env = { DIGISMITH_DEPOT_DIR: depot };
  calls = []; process.exitCode = undefined;
  fs.writeFileSync(path.join(depot, "conductors.json"), JSON.stringify({
    "DigiSmith/digismith-conductor": { session: "Castle", workspace: "w7", floor: "w2" },
    "DigiSmith/tc-dgs-8": T(8),
    "Emma/emma-conductor": { session: "Castle", workspace: "w8", floor: "w3" },
  }));
});
afterEach(() => {
  vi.restoreAllMocks(); process.exitCode = undefined;
  fs.rmSync(depot, { recursive: true, force: true }); fs.rmSync(repo, { recursive: true, force: true });
});

async function dgc(args: string[], over: Parameters<typeof makeConductorCommand>[0] = {}) {
  const out: string[] = []; const err: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => { out.push(a.join(" ")); });
  vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => { err.push(a.join(" ")); });
  process.exitCode = undefined;
  const cmd = makeConductorCommand({ exec, env, repo, live: () => [], ...over });
  try {
    await yargs(["conductor", ...args]).scriptName("dg").command(cmd).demandCommand(1, "").strict().exitProcess(false).fail((m, e) => { throw e ?? new Error(m); }).parseAsync();
  } catch (e) {
    err.push(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  }
  const status = Number(process.exitCode ?? 0);
  process.exitCode = undefined; vi.restoreAllMocks();
  return { status, stdout: out.join("\n"), stderr: err.join("\n") };
}

describe("dg conductor", () => {
  it("start-ticket prints the key and pane", async () => {
    const r = await dgc(["start-ticket", "--ticket", "DGS-9", "--under", "digismith-conductor"]);
    expect(r).toMatchObject({ status: 0, stdout: "DigiSmith/tc-dgs-9 w7:p9" });
    expect(readDriver("DGS-9", env)?.driver).toBe("tc-dgs-9");
  });
  it("start-ticket takes the project from --project", async () => {
    expect((await dgc(["start-ticket", "--ticket", "DGS-9", "--under", "emma-conductor", "--project", "Emma"])).stdout).toBe("Emma/tc-dgs-9 w7:p9");
  });
  it("start-ticket takes the project from DIGISMITH_PROJECT when --project is absent", async () => {
    env.DIGISMITH_PROJECT = "Emma";
    expect((await dgc(["start-ticket", "--ticket", "DGS-10", "--under", "emma-conductor"])).stdout).toBe("Emma/tc-dgs-10 w7:p9");
  });
  it("start-ticket without its arguments exits 1 with a usage error and starts nothing", async () => {
    const r = await dgc(["start-ticket", "--ticket", "DGS-9"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/under/);
    expect(calls).toEqual([]);
  });
  it("a thrown error gives exit 1 and one stderr line", async () => {
    claimDriver({ ticket: "DGS-9", driver: "factory", mode: "factory" }, env);
    const r = await dgc(["start-ticket", "--ticket", "DGS-9", "--under", "digismith-conductor"]);
    expect(r.status).toBe(1);
    expect(r.stderr.split("\n")).toEqual(["DGS-9 already has a driver: factory"]);
  });
  it("close --self uses DIGISMITH_NAME and HERDR_TAB_ID", async () => {
    await dgc(["start-ticket", "--ticket", "DGS-9", "--under", "digismith-conductor"]);
    calls = [];
    env.DIGISMITH_NAME = "tc-dgs-9"; env.HERDR_TAB_ID = "w7:t4";
    const r = await dgc(["close", "--self"]);
    expect(r.status).toBe(0);
    expect(calls).toEqual([["--session", "Castle", "tab", "close", "w7:t4"]]);
    expect(readDriver("DGS-9", env)).toBeNull();
  });
  it("close without --self, or without DIGISMITH_NAME, exits 1", async () => {
    expect((await dgc(["close"])).status).toBe(1);
    const r = await dgc(["close", "--self"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/DIGISMITH_NAME/);
  });
  it("handover changes the driver", async () => {
    claimDriver({ ticket: "DGS-9", driver: "factory", mode: "factory" }, env);
    const r = await dgc(["handover", "--ticket", "DGS-9", "--from", "factory", "--to", "tc-dgs-9"]);
    expect(r).toMatchObject({ status: 0, stdout: "DGS-9 tc-dgs-9" });
    expect((await dgc(["handover", "--ticket", "DGS-9", "--from", "factory", "--to", "x"])).status).toBe(1);
    expect((await dgc(["handover", "--ticket", "DGS-9", "--from", "tc-dgs-9"])).status).toBe(1);
  });
  it("sweep prints one line per ticket conductor", async () => {
    const r = await dgc(["sweep"], { live: (s) => (s === "Castle" ? [] : ["x"]) });
    expect(r).toMatchObject({ status: 0, stdout: "DigiSmith/tc-dgs-8 DGS-8 gone" });
  });
  it("a bare `dg conductor` is a usage error", async () => {
    expect((await dgc([])).status).toBe(1);
  });
});

describe("registration", () => {
  it("the root CLI knows `conductor`", async () => {
    const help = await buildCli(["--help"]).exitProcess(false).getHelp();
    expect(help).toMatch(/conductor/);
  });
});

describe("realLive", () => {
  it("returns the agent names and asks herdr-ws for the given session", () => {
    let asked: string[] = [];
    const names = realLive("Castle", (_f, a) => { asked = a; return JSON.stringify({ result: { agents: [{ name: "tc-dgs-9" }, { name: 3 }, {}] } }); });
    expect(names).toEqual(["tc-dgs-9"]);
    expect(asked).toEqual(["--session", "Castle", "agent", "list"]);
  });
  it("throws when the answer has no result.agents array", () => {
    expect(() => realLive("Castle", () => "{}")).toThrow(/no result.agents array/);
    expect(() => realLive("Castle", () => JSON.stringify({ result: {} }))).toThrow(/no result.agents array/);
  });
  it("lets a failing herdr-ws call and bad JSON throw", () => {
    expect(() => realLive("Castle", () => { throw new Error("exit 1"); })).toThrow(/exit 1/);
    expect(() => realLive("Castle", () => "not json")).toThrow();
  });
  it("an empty list is a real answer: nothing runs", () => {
    expect(realLive("Castle", () => JSON.stringify({ result: { agents: [] } }))).toEqual([]);
  });
});
