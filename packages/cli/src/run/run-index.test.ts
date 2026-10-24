import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { indexDir, readPidIndex, readSessionIndex, writePidIndex, writeSessionIndex } from "./run-index.ts";

let tmp: string;
let env: NodeJS.ProcessEnv;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nw-index-"));
  env = { DIGISMITH_DEPOT_DIR: tmp };
  fs.mkdirSync(path.join(tmp, "runs", "DigiSmith", "s-a1"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "runs", "DigiSmith", "s-a1", "run.json"), "{}");
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("run index", () => {
  it("maps a session to its run dir", () => {
    writeSessionIndex(env, "a1", "DigiSmith/s-a1");
    expect(readSessionIndex(env, "a1")).toBe(path.join(tmp, "runs", "DigiSmith", "s-a1"));
    expect(indexDir(env)).toBe(path.join(tmp, "runs", ".index"));
  });
  it("maps a claude pid to its run dir and last session", () => {
    writePidIndex(env, "4242", "DigiSmith/s-a1", "a1");
    expect(readPidIndex(env, "4242")).toEqual({ dir: path.join(tmp, "runs", "DigiSmith", "s-a1"), session: "a1" });
  });
  it("returns null for a missing entry, a run dir without run.json, or an unsafe value", () => {
    expect(readSessionIndex(env, "nope")).toBeNull();
    writeSessionIndex(env, "b2", "DigiSmith/s-gone");
    expect(readSessionIndex(env, "b2")).toBeNull();
    expect(readSessionIndex(env, "../x")).toBeNull();
    fs.mkdirSync(path.join(indexDir(env), "sessions"), { recursive: true });
    fs.writeFileSync(path.join(indexDir(env), "sessions", "c3"), "../../etc/passwd\n");
    expect(readSessionIndex(env, "c3")).toBeNull();
    expect(readPidIndex(env, "abc")).toBeNull();
  });
});
