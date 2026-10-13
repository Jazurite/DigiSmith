import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { readStamp, writeStamp } from "./idle-stamp.ts";

let depot: string;
let env: NodeJS.ProcessEnv;
beforeEach(() => { depot = fs.mkdtempSync(path.join(os.tmpdir(), "dgs438stamp-")); env = { DIGISMITH_DEPOT_DIR: depot }; });
afterEach(() => fs.rmSync(depot, { recursive: true, force: true }));

describe("idle stamp", () => {
  it("round-trips in the depot, leaves no temp file", () => {
    writeStamp("DigiSmith", "s1", { last_prompt: "2026-10-13T03:00:00.000Z", caught_up_head: "abc", caught_up_updated: "2026-10-13T10:00+07:00" }, env);
    expect(readStamp("DigiSmith", "s1", env)).toMatchObject({ last_prompt: "2026-10-13T03:00:00.000Z", caught_up_head: "abc" });
    expect(fs.readdirSync(path.join(depot, "sessions", "DigiSmith", ".idle"))).toEqual(["s1.json"]);
  });
  it("missing, damaged or wrong-shape file = no stamp", () => {
    expect(readStamp("DigiSmith", "none", env)).toBeUndefined();
    const dir = path.join(depot, "sessions", "DigiSmith", ".idle");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "bad.json"), "{not json");
    fs.writeFileSync(path.join(dir, "odd.json"), JSON.stringify({ last_prompt: 5 }));
    expect(readStamp("DigiSmith", "bad", env)).toBeUndefined();
    expect(readStamp("DigiSmith", "odd", env)).toBeUndefined();
  });
  it("refuses names that could escape the folder", () => {
    expect(() => writeStamp("DigiSmith", "../x", { last_prompt: "t" }, env)).toThrow();
    expect(readStamp("../x", "s1", env)).toBeUndefined();
  });
});
