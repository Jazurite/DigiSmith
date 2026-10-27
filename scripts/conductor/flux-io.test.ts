import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createFluxHerdr, fluxRunner, HERDR_WS_BIN } from "./flux-herdr.ts";
import { resolveTarget, loadTargets } from "./flux-targets.ts";
import { fluxMain, FLUX_USAGE } from "./flux-cli.ts";
import type { Runner } from "./runner.ts";
import type { FluxHerdr, FluxResult } from "./flux.ts";

const ok = (stdout = "") => ({ code: 0, stdout, stderr: "" });

describe("fluxRunner guard (the real herdr is touched only through herdr-ws, with a closed verb set)", () => {
  const rec = () => {
    const calls: string[][] = [];
    const inner: Runner = async (cmd, args) => (calls.push([cmd, ...args]), ok("{}"));
    return { calls, inner };
  };
  it("allows exactly agent list, agent get, pane read --format ansi, and (when allowed) agent prompt", async () => {
    const { calls, inner } = rec();
    const run = fluxRunner(inner, { allowPrompt: true });
    await run(HERDR_WS_BIN, ["agent", "list"]);
    await run(HERDR_WS_BIN, ["agent", "get", "tec"]);
    await run(HERDR_WS_BIN, ["pane", "read", "w2:pK", "--source", "visible", "--format", "ansi"]);
    await run(HERDR_WS_BIN, ["agent", "prompt", "tec", "/clear"]);
    await run(HERDR_WS_BIN, ["agent", "prompt", "tec", "hello", "--wait", "--until", "idle", "--until", "done", "--timeout", "180000"]);
    expect(calls).toHaveLength(5);
  });
  it.each([
    [["tab", "close", "w2:tK"]],
    [["pane", "close", "w2:pK"]],
    [["agent", "close", "tec"]],
    [["agent", "send-keys", "tec", "x"]],
    [["agent", "start", "tec"]],
    [["workspace", "close", "w2"]],
    [["pane", "read", "w2:pK", "--format", "ansi", "--evil"]],
    [["agent", "prompt", "tec", "--help"]],
    [["agent", "prompt", "bad name", "x"]],
  ])("refuses %j", async (args) => {
    const { calls, inner } = rec();
    await expect(fluxRunner(inner, { allowPrompt: true })(HERDR_WS_BIN, args)).rejects.toThrow(/refused/);
    expect(calls).toEqual([]);
  });
  it("refuses any other command", async () => {
    const { inner } = rec();
    await expect(fluxRunner(inner, { allowPrompt: true })("herdr", ["agent", "list"])).rejects.toThrow(/refused/);
    await expect(fluxRunner(inner, { allowPrompt: true })("rm", ["-rf", "x"])).rejects.toThrow(/refused/);
  });
  it("a dry-run runner has no prompt at all", async () => {
    const { calls, inner } = rec();
    await expect(fluxRunner(inner, { allowPrompt: false })(HERDR_WS_BIN, ["agent", "prompt", "tec", "/clear"])).rejects.toThrow(/refused/);
    expect(calls).toEqual([]);
  });
});

describe("createFluxHerdr", () => {
  const agentJson = (name: string, status = "done") => ({ agent_session: { value: "sess-1" }, agent_status: status, name, pane_id: "w2:pK" });
  it("maps list and get, and reads the input box as ansi", async () => {
    const calls: string[][] = [];
    const inner: Runner = async (_c, args) => {
      calls.push(args);
      if (args[1] === "list") return ok(JSON.stringify({ result: { agents: [agentJson("tec"), agentJson("x", "working")] } }));
      if (args[1] === "get") return args[2] === "tec" ? ok(JSON.stringify({ result: { agent: agentJson("tec") } })) : { code: 1, stdout: "", stderr: "not found" };
      return ok("\x1b[2mbox\x1b[0m");
    };
    const h = createFluxHerdr(fluxRunner(inner, { allowPrompt: false }));
    expect(await h.list()).toEqual([
      { name: "tec", pane_id: "w2:pK", agent_status: "done", session: "sess-1" },
      { name: "x", pane_id: "w2:pK", agent_status: "working", session: "sess-1" },
    ]);
    expect((await h.get("tec"))?.session).toBe("sess-1");
    expect(await h.get("ghost")).toBeUndefined();
    const bad = createFluxHerdr(fluxRunner(async () => ok("not json"), { allowPrompt: false }));
    expect(await bad.get("tec")).toBeUndefined();
    expect(await h.readInput("w2:pK")).toContain("box");
    expect(calls[3]).toEqual(["pane", "read", "w2:pK", "--source", "visible", "--format", "ansi"]);
  });
  it("sendPrompt passes --wait/--until/--timeout, and reads the error code of a stalled send", async () => {
    const calls: string[][] = [];
    const inner: Runner = async (_c, args) => {
      calls.push(args);
      return args[3] === "/clear" ? { code: 1, stdout: JSON.stringify({ error: { code: "agent_prompt_stalled" } }), stderr: "" } : ok("{}");
    };
    const h = createFluxHerdr(fluxRunner(inner, { allowPrompt: true }));
    expect(await h.sendPrompt("tec", "/clear")).toEqual({ ok: false, code: "agent_prompt_stalled" });
    expect(calls[0]).toEqual(["agent", "prompt", "tec", "/clear"]);
    expect(await h.sendPrompt("tec", "wake", { wait: true, until: ["idle", "done"], timeoutMs: 1000 })).toEqual({ ok: true });
    expect(calls[1]).toEqual(["agent", "prompt", "tec", "wake", "--wait", "--until", "idle", "--until", "done", "--timeout", "1000"]);
  });
});

describe("flux targets", () => {
  let tmp: string;
  let env: NodeJS.ProcessEnv;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dgs435t-"));
    env = { DIGISMITH_DEPOT_DIR: tmp };
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const repo = "/repo";
  it("reads flux-targets.json, resolving relative paths against the repo root", () => {
    fs.writeFileSync(path.join(tmp, "flux-targets.json"), JSON.stringify({
      "token-economics-conductor": { project: "DigiSmith", brief: ".digismith/sessions/b3-maestro/brief.md", note: ".digismith/sessions/b3-maestro/note.md", wake: "read Current first" },
    }));
    const t = resolveTarget("token-economics-conductor", {}, env, repo);
    expect(t).toEqual({
      agent: "token-economics-conductor", project: "DigiSmith", brief: "/repo/.digismith/sessions/b3-maestro/brief.md",
      note: "/repo/.digismith/sessions/b3-maestro/note.md", wake: "read Current first", workers: undefined,
    });
    expect(loadTargets(env, repo).map((x) => x.agent)).toEqual(["token-economics-conductor"]);
  });
  it("flags override the file for one run", () => {
    fs.writeFileSync(path.join(tmp, "flux-targets.json"), JSON.stringify({ a: { brief: "b.md", note: "n.md" } }));
    const t = resolveTarget("a", { brief: "/x/brief.md", note: "/x/note.md", wake: "w" }, env, repo);
    expect(t).toMatchObject({ brief: "/x/brief.md", note: "/x/note.md", wake: "w" });
  });
  it("falls back to conductors.json for the note and the default brief path", () => {
    fs.writeFileSync(path.join(tmp, "conductors.json"), JSON.stringify({ "DigiSmith/zed-conductor": { note: "/n/zed.md" } }));
    expect(resolveTarget("zed-conductor", {}, env, repo)).toMatchObject({ note: "/n/zed.md", brief: "/repo/.digismith/sessions/zed-conductor/brief.md", project: "DigiSmith" });
  });
  it("a target with no source at all is undefined; unsafe names are refused", () => {
    expect(resolveTarget("nobody", {}, env, repo)).toBeUndefined();
    expect(() => resolveTarget("../evil", {}, env, repo)).toThrow(/refused/);
  });
  it("a broken targets file throws a clear error", () => {
    fs.writeFileSync(path.join(tmp, "flux-targets.json"), "{nope");
    expect(() => loadTargets(env, repo)).toThrow(/flux-targets.json/);
  });
});

describe("fluxMain (the CLI)", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dgs435c-"));
    fs.writeFileSync(path.join(tmp, "flux-targets.json"), JSON.stringify({
      "digismith-conductor": { brief: "/b", note: "/n" }, one: { brief: "/b1", note: "/n1" }, two: { brief: "/b2", note: "/n2" },
    }));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const result = (agent: string, over: Partial<FluxResult> = {}): FluxResult => ({
    v: 1, job: "conductor-flux", run_id: "r", ts: "t", ts_utc: "u", agent, dry_run: false, result: "skipped", reason: "status_working",
    needs_attention: false, tokens_before: null, tokens_after: null, session_old: null, session_new: null, checks: {}, duration_s: 0, ...over,
  });
  const run = async (argv: string[], over: { env?: NodeJS.ProcessEnv; results?: Record<string, FluxResult> } = {}) => {
    const seen: { agent: string; opts: object }[] = [];
    const out = { o: "", e: "" };
    const code = await fluxMain(argv, {
      stdout: (s) => void (out.o += s), stderr: (s) => void (out.e += s), now: () => new Date("2026-10-13T17:30:00Z"),
      env: { DIGISMITH_DEPOT_DIR: tmp, HERDR_WS: "w2", ...over.env },
      repoRoot: "/repo", transcriptDir: "/t",
      makeHerdr: () => ({}) as FluxHerdr,
      flux: async (t, opts) => (seen.push({ agent: t.agent, opts }), over.results?.[t.agent] ?? result(t.agent)),
    });
    return { code, seen, ...out };
  };
  it("a named run passes named and logs; exit 0 for a skip", async () => {
    const r = await run(["one"]);
    expect(r.code).toBe(0);
    expect(r.seen).toEqual([{ agent: "one", opts: { dryRun: false, log: true, named: true } }]);
    expect(r.o).toContain("one: skipped (status_working)");
  });
  it("--all prints the target list FIRST and never includes digismith-conductor", async () => {
    const r = await run(["--all", "--dry-run"]);
    expect(r.o.split("\n")[0]).toBe("Targets (2): one, two");
    expect(r.seen.map((s) => s.agent)).toEqual(["one", "two"]);
    expect(r.seen[0].opts).toMatchObject({ dryRun: true, log: false });
  });
  it("--dry-run logs only with --log", async () => {
    expect((await run(["one", "--dry-run", "--log"])).seen[0].opts).toMatchObject({ dryRun: true, log: true });
  });
  it("exit 2 when a conductor failed", async () => {
    const r = await run(["one"], { results: { one: result("one", { result: "failed", reason: "verify_failed", needs_attention: true }) } });
    expect(r.code).toBe(2);
    expect(r.o).toContain("NEEDS ATTENTION");
  });
  it("--json prints one JSON line per conductor", async () => {
    const r = await run(["--all", "--dry-run", "--json"]);
    const lines = r.o.trim().split("\n").map((l) => JSON.parse(l));
    expect(lines[0]).toEqual({ event: "targets", targets: ["one", "two"] });
    expect(lines[1].agent).toBe("one");
  });
  it("builds the herdr WITHOUT prompt for a dry run and with it for a real run", async () => {
    const asked: boolean[] = [];
    for (const argv of [["one", "--dry-run"], ["one"]]) {
      await fluxMain(argv, {
        stdout: () => {}, stderr: () => {}, now: () => new Date(), env: { DIGISMITH_DEPOT_DIR: tmp, HERDR_WS: "w2" },
        repoRoot: "/repo", transcriptDir: "/t", makeHerdr: (o) => (asked.push(o.dryRun), {} as FluxHerdr),
        flux: async (t) => result(t.agent),
      });
    }
    expect(asked).toEqual([true, false]);
  });
  it("no daytime override flag exists", async () => {
    for (const f of ["--force", "--day", "--now", "--override"]) {
      const r = await run(["one", f]);
      expect(r.code).toBe(1);
    }
  });
  it("--all refuses the per-agent flags", async () => {
    for (const f of [["--brief", "/b"], ["--note", "/n"], ["--wake", "x"], ["--project", "P"]]) expect((await run(["--all", ...f])).code).toBe(1);
  });
  it("needs an agent or --all, and HERDR_WS for a real herdr", async () => {
    expect((await run([])).code).toBe(1);
    expect((await run(["one", "--all"])).code).toBe(1);
    const r = await run(["one"], { env: { HERDR_WS: "" } });
    expect(r.code).toBe(1);
    expect(r.e).toContain("HERDR_WS");
  });
  it("an unknown agent with no target source is an error", async () => {
    const r = await run(["nobody"]);
    expect(r.code).toBe(1);
    expect(r.e).toContain("flux-targets.json");
  });
});

describe("usage text (DGS-664)", () => {
  it("states the idle rule and no night window or override", () => {
    expect(FLUX_USAGE).not.toMatch(/night|override/i);
    expect(FLUX_USAGE).toMatch(/idle or done/);
    expect(FLUX_USAGE).toMatch(/--dry-run runs every check and sends nothing/);
  });
});
