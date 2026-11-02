import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promptConductor, realExec, conductorCheck, type Exec } from "./conductor.ts";

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

describe("promptConductor in the Castle (DGS-683)", () => {
  const castle = { "DigiSmith/digismith-conductor": { kind: ["project", "factory"], session: "Castle", workspace: "w7", floor: "w2" }, "Emma/emma-conductor": { workspace: "w3" } };
  const run = async (obj: unknown) => {
    const calls: Array<[string[], Record<string, string> | undefined]> = [];
    const exec: Exec = async (_f, a, env) => { calls.push([a, env]); return { code: 0, stderr: "" }; };
    await promptConductor(exec, fixture(obj), "msg");
    return calls;
  };
  it("prompts in the session of the factory entry with the scope", async () => {
    const calls = await run(castle);
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toEqual(["--session", "Castle", "agent", "prompt", "digismith-conductor", "msg"]);
    expect(calls[0][1]).toMatchObject({ HERDR_SCOPE: "Castle:w7,default:w2,default:w3", HERDR_WS: "w2" });
  });
  it("chooses a factory entry over the DigiSmith key", async () => {
    const calls = await run({ ...good, "Factory/factory-conductor": { kind: "factory", session: "Castle", workspace: "w8", floor: "w2" } });
    expect(calls[0][0]).toEqual(["--session", "Castle", "agent", "prompt", "factory-conductor", "msg"]);
  });
  it("keeps today's argv and HERDR_WS for the old shape", async () => {
    const calls = await run(good);
    expect(calls[0][0]).toEqual(["agent", "prompt", "digismith-conductor", "msg"]);
    expect(calls[0][1]).toMatchObject({ HERDR_WS: "w2", HERDR_SCOPE: "default:w2" });
  });
  it("conductorCheck: a Castle entry with no workspace is workspace-missing", () => {
    const r = conductorCheck(fixture({ "DigiSmith/digismith-conductor": { session: "Castle" } }));
    expect(r?.cause).toBe("conductor-workspace-missing");
    expect(r?.text).toContain("Castle");
  });
  it("an invalid entry of the target gives a clear conductor-config message, another invalid entry does not", async () => {
    const bad = fixture({ "DigiSmith/digismith-conductor": { workspace: "w2", status: "weird" } });
    const r = conductorCheck(bad);
    expect(r?.cause).toBe("conductor-config-unreadable");
    expect(r?.text).toMatch(/^conductor-config: .*status/);
    expect(conductorCheck(fixture({ ...good, "X/x": { kind: "boss" } }))).toBeNull();
    const calls = await run({ ...good, "X/x": { kind: "boss" } });
    expect(calls).toHaveLength(1);
  });
});

describe("factory candidates in the raw file (DGS-683 T7 review)", () => {
  it("an invalid factory entry is reported and nothing is sent to the fallback", async () => {
    const calls: string[][] = [];
    const exec: Exec = async (_f, a) => { calls.push(a); return { code: 0, stderr: "" }; };
    const p = fixture({ ...good, "Factory/factory-conductor": { kind: "factory", session: "bad name" } });
    await expect(promptConductor(exec, p, "m")).rejects.toThrow(/conductor-config: .*Factory\/factory-conductor.*session/);
    expect(calls).toEqual([]);
    expect(conductorCheck(p)?.cause).toBe("conductor-config-unreadable");
  });
  it("an invalid factory entry with a bad workspace is workspace-missing", () => {
    const r = conductorCheck(fixture({ ...good, "Factory/f": { kind: "factory", workspace: "x" } }));
    expect(r?.cause).toBe("conductor-workspace-missing");
  });
  it("two factory entries are a conductor-config problem, never first-wins", async () => {
    const exec: Exec = async () => ({ code: 0, stderr: "" });
    const two = { ...good, "A/a": { kind: "factory", workspace: "w5" }, "B/b": { kind: "factory", workspace: "w6" } };
    await expect(promptConductor(exec, fixture(two), "m")).rejects.toThrow(/two factory conductors \(A\/a, B\/b\)/);
    const r = conductorCheck(fixture({ ...good, "A/a": { kind: "factory", workspace: "w5" }, "B/b": { kind: "factory", session: "bad name" } }));
    expect(r?.text).toMatch(/two factory conductors/);
  });
  it("a closed factory entry is not a candidate", async () => {
    const calls: string[][] = [];
    const exec: Exec = async (_f, a) => { calls.push(a); return { code: 0, stderr: "" }; };
    await promptConductor(exec, fixture({ ...good, "Old/f": { kind: "factory", workspace: "w5", status: "closed" } }), "m");
    expect(calls[0]).toContain("digismith-conductor");
  });
  it("a null or non-object entry for the target is conductor-config-unreadable", () => {
    for (const entry of [null, "w2", [1]]) {
      const r = conductorCheck(fixture({ "DigiSmith/digismith-conductor": entry }));
      expect(r?.cause).toBe("conductor-config-unreadable");
      expect(r?.text).toMatch(/^conductor-config: /);
    }
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

describe("conductorCheck", () => {
  it("is null for a valid file", () => {
    expect(conductorCheck(fixture(good))).toBeNull();
  });
  it("names a missing file", () => {
    const r = conductorCheck("/nonexistent/conductors.json");
    expect(r?.cause).toBe("conductor-config-unreadable");
    expect(r?.text).toContain("/nonexistent/conductors.json");
  });
  it("names a missing entry", () => {
    const r = conductorCheck(fixture({ "Emma/emma-conductor": { workspace: "w3" } }));
    expect(r?.cause).toBe("conductor-config-unreadable");
    expect(r?.text).toContain("digismith-conductor");
  });
  it("names a missing or bad workspace", () => {
    for (const entry of [{ note: "/n" }, { workspace: "x; rm" }]) {
      const r = conductorCheck(fixture({ "DigiSmith/digismith-conductor": entry }));
      expect(r?.cause).toBe("conductor-workspace-missing");
      expect(r?.text).toContain("no workspace for");
    }
  });
});
