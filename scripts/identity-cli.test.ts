import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { run } from "./identity-cli.ts";

let depot: string;
let env: NodeJS.ProcessEnv;
let lines: string[];
const out = (s: string) => lines.push(s);
const W = ["write", "--id", "digismith-maestro", "--name", "DigiSmith Maestro", "--owner", "jack", "--project", "DigiSmith", "--folder", "/work/DigiSmith", "--conductors", "digismith-conductor"];
beforeEach(() => {
  depot = fs.mkdtempSync(path.join(os.tmpdir(), "dgs411-cli-"));
  env = { DIGISMITH_DEPOT_DIR: depot };
  lines = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { fs.rmSync(depot, { recursive: true, force: true }); vi.restoreAllMocks(); });

describe("identity-cli", () => {
  it("write, list, show", () => {
    expect(run(W, env, out)).toBe(0);
    expect(fs.existsSync(path.join(depot, "identities", "digismith-maestro.yml"))).toBe(true);
    lines = [];
    run(["list"], env, out);
    expect(lines[0]).toContain("digismith-maestro\tDigiSmith Maestro\tDigiSmith\t/work/DigiSmith\tdigismith-conductor");
    lines = [];
    expect(run(["show", "digismith-maestro"], env, out)).toBe(0);
    expect(lines.join("\n")).toContain("conductors: [digismith-conductor]");
  });
  it("never overwrites; missing flags and bad values fail", () => {
    run(W, env, out);
    expect(run(W, env, out)).toBe(1);
    expect(run(["write", "--id", "x"], env, out)).toBe(1);
    expect(run(W.map((x) => (x === "/work/DigiSmith" ? "rel" : x)).map((x) => (x === "digismith-maestro" ? "other-maestro" : x)), env, out)).toBe(1);
  });
  it("resolve by folder", () => {
    const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "dgs411-r-")));
    try {
      run(W.map((x) => (x === "/work/DigiSmith" ? repo : x)), env, out);
      lines = [];
      expect(run(["resolve", "--cwd", repo], env, out)).toBe(0);
      expect(lines).toEqual(["digismith-maestro"]);
      expect(run(["resolve", "--cwd", depot], env, out)).toBe(1);
    } finally { fs.rmSync(repo, { recursive: true, force: true }); }
  });
  it("unknown command prints usage and fails", () => expect(run(["nope"], env, out)).toBe(1));
});
