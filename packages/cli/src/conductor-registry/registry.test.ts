import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { findByKind, floorWorkspaces, putEntry, readRegistry, readRegistryChecked, readRegistryFile, registryPath, registryProblems, removeEntry, resolveConductor, scopeFor } from "./registry.ts";

let depot: string;
let env: NodeJS.ProcessEnv;
const write = (o: unknown) => fs.writeFileSync(path.join(depot, "conductors.json"), JSON.stringify(o));
beforeEach(() => { depot = fs.mkdtempSync(path.join(os.tmpdir(), "reg-")); env = { DIGISMITH_DEPOT_DIR: depot }; });
afterEach(() => fs.rmSync(depot, { recursive: true, force: true }));

describe("registry path", () => {
  it("agrees with scripts/depot-dir.ts for DIGISMITH_DEPOT_DIR set and unset", async () => {
    const { depotDir } = await import("../../../../scripts/depot-dir.ts");
    for (const e of [{ DIGISMITH_DEPOT_DIR: "/x/d" }, { DIGISMITH_DEPOT_DIR: "" }, {}] as NodeJS.ProcessEnv[]) {
      expect(registryPath(e)).toBe(path.join(depotDir(e), "conductors.json"));
    }
  });
  it("honours DIGISMITH_DEPOT_DIR and defaults to the home depot", () => {
    expect(registryPath({ DIGISMITH_DEPOT_DIR: "/x/depot" })).toBe("/x/depot/conductors.json");
    expect(registryPath({ DIGISMITH_DEPOT_DIR: "" })).toBe(path.join(os.homedir(), ".digismith-depot", "conductors.json"));
    expect(registryPath({})).toBe(path.join(os.homedir(), ".digismith-depot", "conductors.json"));
  });
});

describe("registry", () => {
  it("an old entry means session default, kind project, floor = workspace", () => {
    write({ "DigiSmith/digismith-conductor": { note: "/n", workspace: "w2" } });
    expect(resolveConductor("DigiSmith/digismith-conductor", env)).toEqual({
      key: "DigiSmith/digismith-conductor", project: "DigiSmith", name: "digismith-conductor", note: "/n",
      session: "default", workspace: "w2", floor: "w2", kinds: ["project"], status: "open",
    });
  });
  it("reads the new fields and a kind array", () => {
    write({ "DigiSmith/digismith-conductor": { workspace: "w7", session: "Suite", floor: "w2", kind: ["project", "factory"] } });
    const e = resolveConductor("DigiSmith/digismith-conductor", env)!;
    expect(e.session).toBe("Suite"); expect(e.kinds).toEqual(["project", "factory"]);
    expect(findByKind("factory", env).map((x) => x.key)).toEqual(["DigiSmith/digismith-conductor"]);
  });
  it("findByKind skips a closed entry", () => {
    write({ "DigiSmith/tc-dgs-9": { kind: "ticket", ticket: "DGS-9", status: "closed", session: "Suite", workspace: "w7", floor: "w2" } });
    expect(findByKind("ticket", env)).toEqual([]);
  });
  it("floorWorkspaces is the sorted union of floors and default workspaces", () => {
    write({ "A/a": { workspace: "w3" }, "B/b": { session: "Suite", workspace: "w8", floor: "w2" }, "C/c": { session: "Suite", workspace: "w9", floor: "w3" } });
    expect(floorWorkspaces(env)).toEqual(["w2", "w3"]);
  });
  it("scopeFor: default entry = today's rule; Suite entry = own Suite workspace + every floor", () => {
    write({ "A/a": { workspace: "w3" }, "B/b": { session: "Suite", workspace: "w8", floor: "w2" } });
    expect(scopeFor(resolveConductor("A/a", env)!, env)).toBe("default:w3");
    expect(scopeFor(resolveConductor("B/b", env)!, env)).toBe("Suite:w8,default:w2,default:w3");
  });
  it("missing file is empty; broken JSON throws; bad values throw", () => {
    expect(readRegistry(env)).toEqual({});
    fs.writeFileSync(path.join(depot, "conductors.json"), "{nope");
    expect(() => readRegistry(env)).toThrow(/not valid JSON/);
    write({ "A/a": { workspace: "two" } });
    expect(() => readRegistry(env)).toThrow(/workspace/);
    write({ "A/a": { kind: "boss" } });
    expect(() => readRegistry(env)).toThrow(/kind/);
  });
  it("one invalid entry does not break the lookups of the valid ones", () => {
    write({ "A/a": { kind: "boss" }, "B/b": { session: "Suite", workspace: "w8", floor: "w2", kind: "factory" }, "C/c": { workspace: "w3" } });
    expect(resolveConductor("B/b", env)?.session).toBe("Suite");
    expect(() => resolveConductor("A/a", env)).toThrow(/A\/a.*kind/);
    expect(resolveConductor("Z/z", env)).toBeUndefined();
    expect(findByKind("factory", env).map((x) => x.key)).toEqual(["B/b"]);
    expect(floorWorkspaces(env)).toEqual(["w2", "w3"]);
    const r = readRegistryChecked(env);
    expect(Object.keys(r.entries).sort()).toEqual(["B/b", "C/c"]);
    expect(r.problems.map((p) => p.key)).toEqual(["A/a"]);
    expect(registryProblems(env).map((p) => p.key)).toEqual(["A/a"]);
  });
  it("a problem names its failing field and the raw kinds", () => {
    write({ "A/a": { kind: ["project", "factory"], workspace: "two" }, "B/b": null, "C/c": { kind: "boss" } });
    const by = Object.fromEntries(readRegistryChecked(env).problems.map((p) => [p.key, p]));
    expect(by["A/a"]).toMatchObject({ field: "workspace", rawKinds: ["project", "factory"], rawClosed: false });
    expect(by["B/b"]).toMatchObject({ field: undefined, rawKinds: [] });
    expect(by["C/c"].field).toBe("kind");
  });
  it("readRegistryFile reads an explicit path, with the same per-entry rule", () => {
    write({ "A/a": { kind: "boss" }, "B/b": { workspace: "w3" } });
    const r = readRegistryFile(path.join(depot, "conductors.json"));
    expect(Object.keys(r.entries)).toEqual(["B/b"]);
    expect(r.problems[0].key).toBe("A/a");
  });
  it("putEntry and removeEntry keep the other keys", () => {
    write({ "A/a": { workspace: "w3", note: "/x" } });
    putEntry("B/b", { session: "Suite", workspace: "w8", floor: "w2" }, env);
    expect(Object.keys(JSON.parse(fs.readFileSync(path.join(depot, "conductors.json"), "utf8")))).toEqual(["A/a", "B/b"]);
    expect(removeEntry("A/a", env)).toBe(true);
    expect(removeEntry("A/a", env)).toBe(false);
    expect(fs.readdirSync(depot)).toEqual(["conductors.json"]);
  });
  it("floorWorkspaces sorts numerically (w2 before w10)", () => {
    write({ "A/a": { workspace: "w10" }, "B/b": { workspace: "w2" } });
    expect(floorWorkspaces(env)).toEqual(["w2", "w10"]);
  });
  it("an unknown status throws, naming the field", () => {
    write({ "A/a": { workspace: "w3", status: "paused" } });
    expect(() => readRegistry(env)).toThrow(/status/);
  });
  it("a bad floor throws, naming the field", () => {
    write({ "A/a": { workspace: "w3", floor: "two" } });
    expect(() => readRegistry(env)).toThrow(/floor/);
  });
  it("a key with no slash throws", () => {
    write({ "Aonly": { workspace: "w3" } });
    expect(() => readRegistry(env)).toThrow(/must be Project\/name/);
  });
  it("an empty kind array throws, naming the entry key", () => {
    write({ "A/a": { workspace: "w3", kind: [] } });
    expect(() => readRegistry(env)).toThrow(/A\/a.*kind/);
  });
  it("scopeFor throws when the entry has no workspace", () => {
    write({ "A/a": { note: "/x" }, "B/b": { session: "Suite" } });
    expect(() => scopeFor(resolveConductor("A/a", env)!, env)).toThrow(/workspace/);
    expect(() => scopeFor(resolveConductor("B/b", env)!, env)).toThrow(/workspace/);
  });
});
