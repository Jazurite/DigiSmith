import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { DriverTaken, claimDriver, handoverDriver, readDriver, releaseDriver } from "./drivers.ts";

let depot: string; let env: NodeJS.ProcessEnv;
beforeEach(() => { depot = fs.mkdtempSync(path.join(os.tmpdir(), "drv-")); env = { DIGISMITH_DEPOT_DIR: depot }; });
afterEach(() => fs.rmSync(depot, { recursive: true, force: true }));

describe("drivers", () => {
  it("the first claim wins, the second throws DriverTaken naming the driver", () => {
    claimDriver({ ticket: "DGS-9", driver: "digismith-conductor", mode: "attended" }, env);
    expect(() => claimDriver({ ticket: "DGS-9", driver: "factory", mode: "factory" }, env)).toThrow(DriverTaken);
    expect(readDriver("DGS-9", env)?.driver).toBe("digismith-conductor");
  });
  it("handover changes the driver only from the named one", () => {
    claimDriver({ ticket: "DGS-9", driver: "factory", mode: "factory" }, env);
    expect(() => handoverDriver("DGS-9", "other", "tc-dgs-9", env)).toThrow(/driver is factory/);
    expect(handoverDriver("DGS-9", "factory", "tc-dgs-9", env).driver).toBe("tc-dgs-9");
  });
  it("release removes the file only for the driver", () => {
    claimDriver({ ticket: "DGS-9", driver: "tc-dgs-9", mode: "factory" }, env);
    expect(releaseDriver("DGS-9", "someone", env)).toBe(false);
    expect(releaseDriver("DGS-9", "tc-dgs-9", env)).toBe(true);
    expect(readDriver("DGS-9", env)).toBeNull();
  });
  it("refuses a bad ticket key", () => {
    expect(() => claimDriver({ ticket: "../x", driver: "a", mode: "attended" }, env)).toThrow(/ticket/);
  });
  it("stores since in +07:00 and keeps a given since", () => {
    expect(claimDriver({ ticket: "DGS-9", driver: "a", mode: "attended" }, env).since).toMatch(/\+07:00$/);
    expect(claimDriver({ ticket: "DGS-10", driver: "a", mode: "attended", since: "2026-11-02T10:00:00+07:00" }, env).since).toBe("2026-11-02T10:00:00+07:00");
  });
  it("reads null for a missing ticket and refuses a bad key on read", () => {
    expect(readDriver("DGS-77", env)).toBeNull();
    expect(() => readDriver("../x", env)).toThrow(/ticket/);
  });
  it("handover of a ticket without a driver throws", () => {
    expect(() => handoverDriver("DGS-9", "a", "b", env)).toThrow(/no driver/);
  });
  it("a driver file with the wrong shape is unreadable, and still blocks a claim", () => {
    fs.mkdirSync(path.join(depot, "drivers"), { recursive: true });
    fs.writeFileSync(path.join(depot, "drivers", "DGS-9.json"), "{}");
    expect(() => readDriver("DGS-9", env)).toThrow(/unreadable/);
    expect(() => claimDriver({ ticket: "DGS-9", driver: "a", mode: "attended" }, env)).toThrow(DriverTaken);
    fs.writeFileSync(path.join(depot, "drivers", "DGS-9.json"), "not json");
    expect(() => readDriver("DGS-9", env)).toThrow(/not valid JSON/);
    expect(() => claimDriver({ ticket: "DGS-9", driver: "a", mode: "attended" }, env)).toThrow(/unreadable driver file/);
  });
  it("a record whose ticket differs from the file key is unreadable", () => {
    fs.mkdirSync(path.join(depot, "drivers"), { recursive: true });
    fs.writeFileSync(path.join(depot, "drivers", "DGS-9.json"), JSON.stringify({ ticket: "DGS-1", driver: "a", since: "x", mode: "attended" }));
    expect(() => readDriver("DGS-9", env)).toThrow(/unreadable/);
  });
});
