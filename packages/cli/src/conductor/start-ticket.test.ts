import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { startTicketConductor, type ExecOut } from "./start-ticket.ts";
import { readDriver, claimDriver } from "./drivers.ts";
import { readRegistry } from "../conductor-registry/registry.ts";

let depot: string; let repo: string; let env: NodeJS.ProcessEnv;
let calls: { file: string; args: string[]; env?: Record<string, string> }[];
let failOn: string | null;

const TAB_OUT = JSON.stringify({ result: { tab: { tab_id: "w7:t4" }, root_pane: { pane_id: "w7:p9" } } });
const exec: ExecOut = async (file, args, e) => {
  calls.push({ file, args, env: e });
  const verb = args.slice(2, 4).join(" ");
  if (failOn !== null && verb.startsWith(failOn)) return { code: 1, stderr: "boom", stdout: "" };
  return { code: 0, stderr: "", stdout: verb === "tab create" ? TAB_OUT : "" };
};

function seed(extra: Record<string, unknown> = {}, starter: Record<string, unknown> = {}): void {
  fs.writeFileSync(path.join(depot, "conductors.json"), JSON.stringify({
    "DigiSmith/digismith-conductor": { session: "Castle", workspace: "w7", floor: "w2", kind: ["project"], ...starter },
    ...extra,
  }));
}
const A = { ticket: "DGS-9", under: "digismith-conductor", project: "DigiSmith" };

beforeEach(() => {
  depot = fs.mkdtempSync(path.join(os.tmpdir(), "st-depot-"));
  repo = fs.mkdtempSync(path.join(os.tmpdir(), "st-repo-"));
  env = { DIGISMITH_DEPOT_DIR: depot };
  calls = []; failOn = null; seed();
});
afterEach(() => { fs.rmSync(depot, { recursive: true, force: true }); fs.rmSync(repo, { recursive: true, force: true }); });

describe("startTicketConductor", () => {
  it("writes driver, registry entry, brief and makes three Castle calls in order", async () => {
    const r = await startTicketConductor(A, { exec, env, repo });
    expect(r).toEqual({ key: "DigiSmith/tc-dgs-9", pane: "w7:p9", name: "tc-dgs-9" });
    expect(readDriver("DGS-9", env)).toMatchObject({ driver: "tc-dgs-9", mode: "attended" });
    const e = readRegistry(env)["DigiSmith/tc-dgs-9"];
    expect(e).toMatchObject({ session: "Castle", workspace: "w7", floor: "w2", kinds: ["ticket"], ticket: "DGS-9", under: "digismith-conductor", status: "open" });
    const brief = fs.readFileSync(path.join(repo, ".digismith/sessions/tc-dgs-9/brief.md"), "utf8");
    expect(brief).toContain("DGS-9");
    expect(brief).toContain("dg conductor close --self");
    expect(calls.map((c) => c.args.slice(0, 4))).toEqual([
      ["--session", "Castle", "tab", "create"],
      ["--session", "Castle", "agent", "start"],
      ["--session", "Castle", "agent", "prompt"],
    ]);
    expect(calls[0].args).toEqual(expect.arrayContaining(["--workspace", "w7", "--label", "tc-dgs-9", "--cwd", repo]));
    expect(calls[1].args).toEqual(expect.arrayContaining(["tc-dgs-9", "--pane", "w7:p9", "--"]));
    expect(calls[2].args).toContain("Read .digismith/sessions/tc-dgs-9/brief.md and follow it.");
    expect(calls[0].file).toMatch(/herdr-ws$/);
    expect(calls[0].env?.HERDR_WS).toBe("w7");
    expect(calls[0].env?.HERDR_SCOPE).toBe("Castle:w7,default:w2");
  });
  it("a factory starter makes a factory-mode driver", async () => {
    seed({}, { kind: ["project", "factory"] });
    await startTicketConductor(A, { exec, env, repo });
    expect(readDriver("DGS-9", env)?.mode).toBe("factory");
  });
  it("a second start for the same ticket names the driver and calls no herdr", async () => {
    claimDriver({ ticket: "DGS-9", driver: "factory", mode: "factory" }, env);
    await expect(startTicketConductor(A, { exec, env, repo })).rejects.toThrow(/DGS-9 already has a driver: factory/);
    expect(calls).toEqual([]);
  });
  it("a failed tab create removes the driver and the registry entry", async () => {
    failOn = "tab create";
    await expect(startTicketConductor(A, { exec, env, repo })).rejects.toThrow(/tab create/);
    expect(readDriver("DGS-9", env)).toBeNull();
    expect(readRegistry(env)["DigiSmith/tc-dgs-9"]).toBeUndefined();
  });
  it("a failed agent start also rolls back", async () => {
    failOn = "agent start";
    await expect(startTicketConductor(A, { exec, env, repo })).rejects.toThrow(/agent start/);
    expect(readDriver("DGS-9", env)).toBeNull();
    expect(readRegistry(env)["DigiSmith/tc-dgs-9"]).toBeUndefined();
  });
  it("refuses a third open ticket conductor", async () => {
    const t = (n: number) => ({ kind: "ticket", ticket: `DGS-${n}`, session: "Castle", workspace: "w7", floor: "w2", status: "open" });
    seed({ "DigiSmith/tc-dgs-1": t(1), "DigiSmith/tc-dgs-2": t(2) });
    await expect(startTicketConductor(A, { exec, env, repo })).rejects.toThrow(/limit/);
    expect(readDriver("DGS-9", env)).toBeNull();
    expect(calls).toEqual([]);
  });
  it("refuses a starter that is not in Castle", async () => {
    seed({}, { session: "default" });
    await expect(startTicketConductor(A, { exec, env, repo })).rejects.toThrow(/not in Castle/);
    expect(calls).toEqual([]);
  });
  it("refuses an unknown starter", async () => {
    await expect(startTicketConductor({ ...A, under: "nobody" }, { exec, env, repo })).rejects.toThrow(/nobody/);
  });
  it("rolls back when tab create prints no pane id", async () => {
    const bad: ExecOut = async (file, args, e) => { calls.push({ file, args, env: e }); return { code: 0, stderr: "", stdout: "{}" }; };
    await expect(startTicketConductor(A, { exec: bad, env, repo })).rejects.toThrow(/pane id/);
    expect(readDriver("DGS-9", env)).toBeNull();
  });
});
