import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promptConductor, type Exec } from "./conductor.ts";

function fixture(obj: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "cond-"));
  const p = join(dir, "conductors.json");
  writeFileSync(p, JSON.stringify(obj));
  return p;
}
const good = { "DigiSmith/digismith-conductor": { note: "/n" }, "Emma/emma-conductor": { note: "/m" } };

describe("promptConductor", () => {
  it("runs herdr-ws with an argv, one argument for the message", async () => {
    const calls: Array<[string, string[]]> = [];
    const exec: Exec = async (f, a) => { calls.push([f, a]); return { code: 0, stderr: "" }; };
    const msg = `build it; rm -rf "x" 'y'`;
    await promptConductor(exec, fixture(good), msg);
    expect(calls).toHaveLength(1);
    expect(calls[0][0].endsWith("/.digismith-depot/bin/herdr-ws")).toBe(true);
    expect(calls[0][1]).toEqual(["agent", "prompt", "digismith-conductor", msg]);
  });
  it("throws with stderr on a non-zero exit", async () => {
    const exec: Exec = async () => ({ code: 2, stderr: "no such agent" });
    await expect(promptConductor(exec, fixture(good), "m")).rejects.toThrow("no such agent");
  });
  it("throws when the entry is missing", async () => {
    const exec: Exec = async () => ({ code: 0, stderr: "" });
    await expect(promptConductor(exec, fixture({ "Emma/emma-conductor": { note: "/m" } }), "m")).rejects.toThrow(/digismith-conductor/);
  });
  it("throws when the file is missing", async () => {
    const exec: Exec = async () => ({ code: 0, stderr: "" });
    await expect(promptConductor(exec, "/nonexistent/conductors.json", "m")).rejects.toThrow();
  });
});
