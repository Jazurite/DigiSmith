import { describe, it, expect, vi } from "vitest";
import { readOnlyRunner, execRunner, sshStateArgs, type Runner } from "./runner.ts";

const ok = async () => ({ code: 0, stdout: "x", stderr: "" });

describe("readOnlyRunner", () => {
  const allowed: [string, string[]][] = [
    ["herdr", ["--session", "default", "status", "server"]],
    ["herdr", ["--session", "default", "agent", "list"]],
    ["herdr", ["--session", "default", "agent", "get", "w2:p1"]],
    ["herdr", ["--session", "default", "agent", "read", "w2:p1"]],
    ["herdr", ["--session", "default", "pane", "read", "w2:p1"]],
    ["herdr", ["--session", "default", "tab", "list", "--workspace", "w2"]],
    ["herdr", ["--machine", "workbox", "agent", "list"]],
    ["git", ["log", "origin/main", "--since=2026-10-13T00:00:00+07:00"]],
    ["git", ["rev-parse", "HEAD"]],
  ];
  for (const [cmd, args] of allowed) {
    it(`allows ${cmd} ${args.join(" ")}`, async () => {
      const inner = vi.fn(ok);
      await readOnlyRunner(inner)(cmd, args);
      expect(inner).toHaveBeenCalledOnce();
    });
  }

  const denied: [string, string[]][] = [
    ["herdr", ["--session", "default", "agent", "prompt", "w2:p1", "rm"]],
    ["herdr", ["--session", "default", "agent", "send-keys", "w2:p1", "x"]],
    ["herdr", ["--session", "default", "pane", "send-keys", "w2:p1", "x"]],
    ["herdr", ["--session", "default", "agent", "start", "claude", "--pane", "w2:p1"]],
    ["herdr", ["--session", "default", "tab", "close", "w2:t5"]],
    ["herdr", ["--session", "default", "pane", "close", "w2:p5"]],
    ["herdr", ["--session", "default", "workspace", "create"]],
    ["herdr", ["server", "stop"]],
    ["git", ["push"]],
    ["git", ["fetch"]],
    ["git", ["reset", "--hard"]],
    ["rm", ["-rf", "x"]],
    ["ssh", ["host", "rm", "-rf", "/"]],
    ["ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "-oProxyCommand=x", "node"]],
  ];
  for (const [cmd, args] of denied) {
    it(`refuses ${cmd} ${args.join(" ")} without calling the runner`, async () => {
      const inner = vi.fn(ok);
      await expect(readOnlyRunner(inner)(cmd, args)).rejects.toThrow(/refused/i);
      expect(inner).not.toHaveBeenCalled();
    });
  }

  it("allows exactly the fixed ssh state form", async () => {
    const inner = vi.fn(ok);
    const args = sshStateArgs({ target: "jack@workbox", repo: "$HOME/Workspace/Jazurite/DigiSmith", project: "DigiSmith", conductor: "digismith-conductor" });
    await readOnlyRunner(inner)("ssh", args);
    expect(inner).toHaveBeenCalledOnce();
  });
});

describe("sshStateArgs", () => {
  const base = { repo: "$HOME/Workspace/Jazurite/DigiSmith", project: "DigiSmith", conductor: "digismith-conductor" };
  it("builds the exact argv", () => {
    expect(sshStateArgs({ ...base, target: "workbox" })).toEqual([
      "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "workbox",
      "node", "--experimental-strip-types",
      "$HOME/Workspace/Jazurite/DigiSmith/scripts/conductor/cli.ts",
      "state", "--json", "--project", "DigiSmith", "--conductor", "digismith-conductor",
    ]);
  });
  it("adds --since when given", () => {
    expect(sshStateArgs({ ...base, target: "w", since: "2026-10-13T00:00:00+07:00" }).slice(-2)).toEqual([
      "--since", "2026-10-13T00:00:00+07:00",
    ]);
  });
  for (const bad of ["-oProxyCommand=x", "a b", "x;rm", "", "h$(id)", "h`id`"]) {
    it(`refuses target ${JSON.stringify(bad)}`, () => {
      expect(() => sshStateArgs({ ...base, target: bad })).toThrow(/refused/i);
    });
  }
  it("refuses unsafe repo, project, conductor, since", () => {
    expect(() => sshStateArgs({ ...base, target: "w", repo: "/a b" })).toThrow(/refused/i);
    expect(() => sshStateArgs({ ...base, target: "w", repo: "/a;rm" })).toThrow(/refused/i);
    expect(() => sshStateArgs({ ...base, target: "w", project: "x;y" })).toThrow(/refused/i);
    expect(() => sshStateArgs({ ...base, target: "w", conductor: "$(id)" })).toThrow(/refused/i);
    expect(() => sshStateArgs({ ...base, target: "w", since: "now; rm" })).toThrow(/refused/i);
  });
});

describe("execRunner", () => {
  it("runs a command without a shell and returns code and output", async () => {
    const r = await execRunner(process.execPath, ["-e", "process.stdout.write('hi $HOME; x')"]);
    expect(r).toMatchObject({ code: 0, stdout: "hi $HOME; x" });
  });
  it("returns the exit code of a failing command", async () => {
    const r = await execRunner(process.execPath, ["-e", "process.stderr.write('no');process.exit(3)"]);
    expect(r).toMatchObject({ code: 3, stderr: "no" });
  });
  it("returns code 127 for a missing command", async () => {
    const r = await execRunner("definitely-not-a-command-422", []);
    expect(r.code).toBe(127);
  });
  it("kills a command that runs past the timeout", async () => {
    const r = await execRunner(process.execPath, ["-e", "setTimeout(()=>{},10000)"], { timeoutMs: 200 });
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/timed out/i);
  });
});

export type { Runner };
