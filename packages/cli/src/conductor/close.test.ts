import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { closeTicketConductor, handover } from "./close.ts";
import { sweepTickets } from "./sweep.ts";
import { claimDriver, readDriver } from "./drivers.ts";
import { readRegistry } from "../conductor-registry/registry.ts";
import type { ExecOut } from "./start-ticket.ts";

let depot: string; let env: NodeJS.ProcessEnv;
let calls: { file: string; args: string[]; env?: Record<string, string> }[];
let code: number;
const exec: ExecOut = async (file, args, e) => { calls.push({ file, args, env: e }); return { code, stderr: code ? "nope" : "", stdout: "" }; };
const T = (n: number, status = "open") => ({ kind: "ticket", ticket: `DGS-${n}`, session: "Castle", workspace: "w7", floor: "w2", status });
const A = { name: "tc-dgs-9", project: "DigiSmith" };

beforeEach(() => {
  depot = fs.mkdtempSync(path.join(os.tmpdir(), "cl-"));
  env = { DIGISMITH_DEPOT_DIR: depot, HERDR_TAB_ID: "w7:t4" };
  calls = []; code = 0;
  fs.writeFileSync(path.join(depot, "conductors.json"), JSON.stringify({
    "DigiSmith/digismith-conductor": { session: "Castle", workspace: "w7", floor: "w2" },
    "DigiSmith/tc-dgs-9": T(9), "DigiSmith/tc-dgs-8": T(8),
  }));
  claimDriver({ ticket: "DGS-9", driver: "tc-dgs-9", mode: "attended" }, env);
});
afterEach(() => fs.rmSync(depot, { recursive: true, force: true }));

describe("closeTicketConductor", () => {
  it("releases the driver, removes the entry and then closes the env tab", async () => {
    await closeTicketConductor(A, { exec, env });
    expect(readDriver("DGS-9", env)).toBeNull();
    expect(readRegistry(env)["DigiSmith/tc-dgs-9"]).toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual(["--session", "Castle", "tab", "close", "w7:t4"]);
    expect(calls[0].file).toMatch(/herdr-ws$/);
    expect(calls[0].env?.HERDR_SCOPE).toBe("Castle:w7,default:w2");
  });
  it("refuses an entry that is not a ticket conductor", async () => {
    await expect(closeTicketConductor({ name: "digismith-conductor", project: "DigiSmith" }, { exec, env })).rejects.toThrow(/not a ticket conductor/);
    expect(calls).toEqual([]);
  });
  it("refuses a closed entry even when a driver file exists", async () => {
    const f = JSON.parse(fs.readFileSync(path.join(depot, "conductors.json"), "utf8"));
    f["DigiSmith/tc-dgs-9"].status = "closed";
    fs.writeFileSync(path.join(depot, "conductors.json"), JSON.stringify(f));
    await expect(closeTicketConductor(A, { exec, env })).rejects.toThrow(/not open/);
    expect(readDriver("DGS-9", env)).not.toBeNull();
    expect(calls).toEqual([]);
  });
  it("refuses an unknown entry", async () => {
    await expect(closeTicketConductor({ name: "tc-dgs-5", project: "DigiSmith" }, { exec, env })).rejects.toThrow(/no conductor/);
  });
  it("refuses without HERDR_TAB_ID and changes nothing", async () => {
    delete env.HERDR_TAB_ID;
    await expect(closeTicketConductor(A, { exec, env })).rejects.toThrow(/HERDR_TAB_ID/);
    expect(readDriver("DGS-9", env)).not.toBeNull();
    expect(readRegistry(env)["DigiSmith/tc-dgs-9"]).toBeDefined();
  });
  it("a name that is not the driver releases nothing and throws", async () => {
    claimDriver({ ticket: "DGS-8", driver: "factory", mode: "factory" }, env);
    await expect(closeTicketConductor({ name: "tc-dgs-8", project: "DigiSmith" }, { exec, env })).rejects.toThrow(/not the driver/);
    expect(readDriver("DGS-8", env)?.driver).toBe("factory");
    expect(readRegistry(env)["DigiSmith/tc-dgs-8"]).toBeDefined();
    expect(calls).toEqual([]);
  });
  it("a failed tab close throws but leaves a clean registry", async () => {
    code = 1;
    await expect(closeTicketConductor(A, { exec, env })).rejects.toThrow(/tab close failed/);
    expect(readDriver("DGS-9", env)).toBeNull();
    expect(readRegistry(env)["DigiSmith/tc-dgs-9"]).toBeUndefined();
  });
});

describe("handover", () => {
  it("delegates to handoverDriver", () => {
    expect(handover({ ticket: "DGS-9", from: "tc-dgs-9", to: "factory" }, env).driver).toBe("factory");
    expect(() => handover({ ticket: "DGS-9", from: "tc-dgs-9", to: "x" }, env)).toThrow(/driver is factory/);
  });
});

describe("sweepTickets", () => {
  it("marks a vanished ticket conductor gone and a live one running, ignoring closed entries", () => {
    const f = JSON.parse(fs.readFileSync(path.join(depot, "conductors.json"), "utf8"));
    f["DigiSmith/tc-dgs-7"] = T(7, "closed");
    fs.writeFileSync(path.join(depot, "conductors.json"), JSON.stringify(f));
    const asked: string[] = [];
    const r = sweepTickets(env, (s) => { asked.push(s); return ["tc-dgs-9"]; });
    expect(asked).toEqual(["Castle"]);
    expect(r).toEqual([
      { key: "DigiSmith/tc-dgs-9", ticket: "DGS-9", verdict: "running" },
      { key: "DigiSmith/tc-dgs-8", ticket: "DGS-8", verdict: "gone" },
    ]);
  });
});
