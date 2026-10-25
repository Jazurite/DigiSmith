import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promptConductor, realExec, conductorProblem, type Exec } from "./conductor.ts";

function fixture(obj: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "cond-"));
  const p = join(dir, "conductors.json");
  writeFileSync(p, JSON.stringify(obj));
  return p;
}
const good = { "DigiSmith/digismith-conductor": { note: "/n", workspace: "w2" }, "Emma/emma-conductor": { note: "/m", workspace: "w3" } };

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
  it("sets HERDR_WS from conductors.json when the ambient value is absent", async () => {
    const saved = process.env.HERDR_WS;
    delete process.env.HERDR_WS;
    try {
      const calls: Array<[string[], Record<string, string> | undefined]> = [];
      const exec: Exec = async (_f, a, env) => { calls.push([a, env]); return { code: 0, stderr: "" }; };
      await promptConductor(exec, fixture(good), "m");
      expect(calls[0][1]?.HERDR_WS).toBe("w2");
      expect(calls[0][0]).toEqual(["agent", "prompt", "digismith-conductor", "m"]);
    } finally {
      if (saved !== undefined) process.env.HERDR_WS = saved;
    }
  });
  it("overrides an ambient HERDR_WS", async () => {
    const saved = process.env.HERDR_WS;
    process.env.HERDR_WS = "w9";
    try {
      let env: Record<string, string> | undefined;
      const exec: Exec = async (_f, _a, e) => { env = e; return { code: 0, stderr: "" }; };
      await promptConductor(exec, fixture(good), "m");
      expect(env?.HERDR_WS).toBe("w2");
    } finally {
      if (saved === undefined) delete process.env.HERDR_WS; else process.env.HERDR_WS = saved;
    }
  });
  it("a message containing HERDR_WS=w9 does not change the env", async () => {
    let env: Record<string, string> | undefined;
    const exec: Exec = async (_f, _a, e) => { env = e; return { code: 0, stderr: "" }; };
    await promptConductor(exec, fixture(good), "HERDR_WS=w9 go");
    expect(env?.HERDR_WS).toBe("w2");
  });
  it("throws when the entry has no workspace", async () => {
    const exec: Exec = async () => ({ code: 0, stderr: "" });
    const p = fixture({ "DigiSmith/digismith-conductor": { note: "/n" } });
    await expect(promptConductor(exec, p, "m")).rejects.toThrow("no workspace for");
  });
  it("throws when the workspace is malformed", async () => {
    const exec: Exec = async () => ({ code: 0, stderr: "" });
    const p = fixture({ "DigiSmith/digismith-conductor": { note: "/n", workspace: "x; rm" } });
    await expect(promptConductor(exec, p, "m")).rejects.toThrow("no workspace for");
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

describe("realExec", () => {
  it("exit 0", async () => {
    expect(await realExec(process.execPath, ["-e", "process.exit(0)"])).toEqual({ code: 0, stderr: "" });
  });
  it("exit 3 keeps the code and stderr", async () => {
    const r = await realExec(process.execPath, ["-e", "console.error('boom');process.exit(3)"]);
    expect(r.code).toBe(3);
    expect(r.stderr).toContain("boom");
  });
  it("a child killed by a signal is non-zero", async () => {
    const r = await realExec(process.execPath, ["-e", "process.kill(process.pid,'SIGKILL')"]);
    expect(r.code).not.toBe(0);
  });
  it("passes env to the child", async () => {
    const r = await realExec(process.execPath, ["-e", "process.exit(process.env.HERDR_WS==='w2'?0:4)"], { HERDR_WS: "w2" });
    expect(r.code).toBe(0);
  });
  it("keeps the parent env without env", async () => {
    const saved = process.env.HERDR_WS;
    process.env.HERDR_WS = "w2";
    try {
      const r = await realExec(process.execPath, ["-e", "process.exit(process.env.HERDR_WS==='w2'?0:4)"]);
      expect(r.code).toBe(0);
    } finally {
      if (saved === undefined) delete process.env.HERDR_WS; else process.env.HERDR_WS = saved;
    }
  });
  it("a missing binary is non-zero with text", async () => {
    const r = await realExec("/nonexistent/binary-xyz", []);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain("ENOENT");
  });
});

describe("promptConductor bad json", () => {
  it("names the file path", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cond-"));
    const p = join(dir, "conductors.json");
    writeFileSync(p, "{ truncated");
    await expect(promptConductor(async () => ({ code: 0, stderr: "" }), p, "m")).rejects.toThrow(p);
  });
});

describe("conductorProblem", () => {
  it("is null for a valid file", () => {
    expect(conductorProblem(fixture(good))).toBeNull();
  });
  it("names a missing file", () => {
    expect(conductorProblem("/nonexistent/conductors.json")).toContain("/nonexistent/conductors.json");
  });
  it("names a missing entry", () => {
    expect(conductorProblem(fixture({ "Emma/emma-conductor": { workspace: "w3" } }))).toContain("digismith-conductor");
  });
  it("names a missing or bad workspace", () => {
    expect(conductorProblem(fixture({ "DigiSmith/digismith-conductor": { note: "/n" } }))).toContain("no workspace for");
    expect(conductorProblem(fixture({ "DigiSmith/digismith-conductor": { workspace: "x; rm" } }))).toContain("no workspace for");
  });
});
