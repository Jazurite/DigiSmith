// packages/cli/src/run/hook.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildData, runHook, waitFor } from "./hook.ts";
import { createRun, readRun } from "./record.ts";
import { findRunDir, runsDir } from "./paths.ts";
import { readEvents } from "./events.ts";

let tmp: string;
let env: NodeJS.ProcessEnv;
let run: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nw-hook-"));
  env = { DIGISMITH_DEPOT_DIR: tmp };
  run = createRun({ ticket: "DGS-581", role: "builder", order: "/o.md" }, env).run;
  env.DIGISMITH_RUN_ID = run;
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const events = () => readEvents(findRunDir(run, env)!);

describe("buildData", () => {
  it("keeps only the listed fields", () => {
    expect(buildData("started", { source: "startup", session_id: "abc-123", prompt: "secret" })).toEqual({ source: "startup", session_id: "abc-123" });
    expect(buildData("blocked", { notification_type: "permission_prompt", message: "Claude needs your permission to run rm -rf" })).toEqual({ kind: "permission_prompt", session_id: null });
    expect(buildData("tool", { tool_name: "Bash", tool_input: { command: "echo secret" }, tool_response: { stdout: "secret" } })).toEqual({ tool: "Bash", ok: true, session_id: null });
    expect(buildData("tool", { tool_name: "Edit", tool_response: { is_error: true } })).toEqual({ tool: "Edit", ok: false, session_id: null });
    expect(buildData("tool", { tool_name: "Read", tool_response: { error: "nope" } })).toEqual({ tool: "Read", ok: false, session_id: null });
    expect(buildData("turn_end", { last_assistant_message: "secret" })).toEqual({ session_id: null });
    expect(buildData("ended", { reason: "logout", transcript_path: "/x" })).toEqual({ reason: "logout", session_id: null });
  });
  it("puts the session_id of the firing session into every kind", () => {
    const p = { session_id: "child-9", source: "clear", notification_type: "idle_prompt", tool_name: "Bash", reason: "other", prompt: "secret" };
    expect(buildData("started", p)).toEqual({ source: "clear", session_id: "child-9" });
    expect(buildData("blocked", p)).toEqual({ kind: "idle_prompt", session_id: "child-9" });
    expect(buildData("tool", p)).toEqual({ tool: "Bash", ok: true, session_id: "child-9" });
    expect(buildData("turn_end", p)).toEqual({ session_id: "child-9" });
    expect(buildData("ended", p)).toEqual({ reason: "other", session_id: "child-9" });
  });
  it("turns a value that is not a plain name into null", () => {
    expect(buildData("tool", { tool_name: "has a space and text", tool_response: {} })).toEqual({ tool: null, ok: true, session_id: null });
    expect(buildData("blocked", {})).toEqual({ kind: null, session_id: null });
    expect(buildData("ended", "not an object")).toEqual({ reason: null, session_id: null });
  });
});

describe("runHook", () => {
  it("writes the five kinds in seq order", () => {
    runHook("started", JSON.stringify({ source: "startup", session_id: "s1" }), env);
    runHook("tool", JSON.stringify({ tool_name: "Bash", tool_response: {} }), env);
    runHook("blocked", JSON.stringify({ notification_type: "permission_prompt" }), env);
    runHook("turn_end", "{}", env);
    runHook("ended", JSON.stringify({ reason: "other" }), env);
    expect(events().map((e) => [e.seq, e.type])).toEqual([[1, "started"], [2, "tool"], [3, "blocked"], [4, "turn_end"], [5, "ended"]]);
  });
  it("records the session_id of a child session that inherits the run id", () => {
    runHook("started", JSON.stringify({ source: "startup", session_id: "parent" }), env);
    runHook("ended", JSON.stringify({ reason: "other", session_id: "child-claude-p" }), env);
    const ev = events();
    expect(ev[0].data).toMatchObject({ session_id: "parent" });
    expect(ev[1].data).toEqual({ reason: "other", session_id: "child-claude-p" });
  });
  it("writes nothing without DIGISMITH_RUN_ID when the payload has no session_id", () => {
    const before = fs.readdirSync(path.join(runsDir(env), "DGS-581", run));
    runHook("started", "{}", { DIGISMITH_DEPOT_DIR: tmp });
    runHook("started", "{}", { DIGISMITH_DEPOT_DIR: tmp, DIGISMITH_RUN_ID: "" });
    expect(fs.readdirSync(path.join(runsDir(env), "DGS-581", run))).toEqual(before);
    expect(fs.readdirSync(runsDir(env))).toEqual(["DGS-581"]);
    expect(fs.existsSync(path.join(runsDir(env), "hook-errors.log"))).toBe(false);
  });
  it("writes nothing for a run id that has no run.json, and creates no directory", () => {
    runHook("started", "{}", { ...env, DIGISMITH_RUN_ID: "builder-19990101T000000-ffffff" });
    runHook("started", "{}", { ...env, DIGISMITH_RUN_ID: "../../etc" });
    expect(fs.readdirSync(path.join(runsDir(env)))).toEqual(["DGS-581"]);
    expect(fs.readdirSync(path.join(runsDir(env), "DGS-581"))).toEqual([run]);
  });
  it("still writes the event when stdin is not JSON", () => {
    runHook("started", "not json", env);
    expect(events()).toHaveLength(1);
    expect(events()[0].data).toEqual({ source: null, session_id: null });
  });
  it("never throws and logs the message only when the lock is held", () => {
    const dir = findRunDir(run, env)!;
    fs.mkdirSync(path.join(dir, "lock"));
    expect(() => runHook("tool", JSON.stringify({ tool_name: "Bash", tool_input: { command: "SECRET-INPUT" } }), env)).not.toThrow();
    expect(events()).toHaveLength(0);
    const log = fs.readFileSync(path.join(runsDir(env), "hook-errors.log"), "utf8");
    expect(log).toMatch(/tool/);
    expect(log).toMatch(/lock timeout/);
    expect(log).not.toMatch(/SECRET-INPUT/);
  });
  it("lets blocked wait for a lock that frees within 2 s", async () => {
    const dir = findRunDir(run, env)!;
    fs.mkdirSync(path.join(dir, "lock"));
    setTimeout(() => fs.rmdirSync(path.join(dir, "lock")), 400);
    // runHook is synchronous and would block the timer above, so run blocked in a child process.
    const { spawn } = await import("node:child_process");
    const script = path.join(import.meta.dirname, "..", "..", "..", "..", "scripts", "run-events", "hook-cli.ts");
    const code = await new Promise<number | null>((resolve) => {
      const p = spawn(process.execPath, ["--experimental-strip-types", script, "blocked"], { env: { ...process.env, ...env } });
      p.stdin.end(JSON.stringify({ notification_type: "permission_prompt" }));
      p.on("exit", resolve);
    });
    expect(code).toBe(0);
    expect(events().map((e) => e.type)).toEqual(["blocked"]);
  });
  it("makes the tool hook give up on a held lock after about 150 ms", () => {
    const dir = findRunDir(run, env)!;
    fs.mkdirSync(path.join(dir, "lock"));
    const t0 = performance.now();
    runHook("tool", JSON.stringify({ tool_name: "Bash", tool_response: {} }), env);
    const ms = performance.now() - t0;
    expect(ms).toBeGreaterThanOrEqual(120);
    expect(ms).toBeLessThan(900);
    expect(events()).toHaveLength(0);
    expect(fs.readFileSync(path.join(runsDir(env), "hook-errors.log"), "utf8")).toMatch(/lock timeout/);
  });
  it("sets the wait to 150 ms for tool and 2000 ms for every other kind", () => {
    expect(waitFor("tool")).toBe(150);
    for (const k of ["started", "blocked", "turn_end", "ended"] as const) expect(waitFor(k)).toBe(2000);
  });
  it("ignores an unknown kind", () => {
    expect(() => runHook("bogus", "{}", env)).not.toThrow();
    expect(events()).toHaveLength(0);
  });
});

describe("automatic runs (no DIGISMITH_RUN_ID)", () => {
  const auto = (): NodeJS.ProcessEnv => ({ DIGISMITH_DEPOT_DIR: tmp, CLAUDE_PID: "777" });
  it("SessionStart makes the run; the other kinds find it by session_id", () => {
    const e = auto();
    runHook("started", JSON.stringify({ session_id: "sa", source: "startup", cwd: "/nowhere/Proj", prompt: "SECRET" }), e);
    runHook("tool", JSON.stringify({ session_id: "sa", tool_name: "Bash", tool_input: { command: "SECRET" } }), e);
    runHook("blocked", JSON.stringify({ session_id: "sa", notification_type: "permission_prompt", message: "SECRET" }), e);
    runHook("turn_end", JSON.stringify({ session_id: "sa" }), e);
    runHook("ended", JSON.stringify({ session_id: "sa", reason: "other" }), e);
    const dir = findRunDir("s-sa", e)!;
    expect(dir).toBe(path.join(tmp, "runs", "Proj", "s-sa"));
    expect(readEvents(dir).map((x) => x.type)).toEqual(["started", "tool", "blocked", "turn_end", "ended"]);
    for (const f of fs.readdirSync(dir)) if (f !== "lock") expect(fs.readFileSync(path.join(dir, f), "utf8")).not.toMatch(/SECRET/);
  });
  it("a resume appends a second started to the same run", () => {
    const e = auto();
    runHook("started", JSON.stringify({ session_id: "sb", source: "startup", cwd: "/nowhere/Proj" }), e);
    runHook("started", JSON.stringify({ session_id: "sb", source: "resume", cwd: "/nowhere/Proj" }), e);
    expect(readEvents(findRunDir("s-sb", e)!).map((x) => x.data.source)).toEqual(["startup", "resume"]);
  });
  it("a tool event with an unknown session_id writes nothing", () => {
    runHook("tool", JSON.stringify({ session_id: "zz", tool_name: "Bash" }), auto());
    expect(fs.readdirSync(runsDir(env))).toEqual(["DGS-581"]);
  });
  it("an explicit DIGISMITH_RUN_ID wins: no automatic run, no index", () => {
    runHook("started", JSON.stringify({ session_id: "sc", source: "startup", cwd: "/nowhere/Proj" }), { ...env, CLAUDE_PID: "777" });
    expect(events()).toHaveLength(1);
    expect(fs.readdirSync(runsDir(env))).toEqual(["DGS-581"]);
  });
  it("inside herdr it starts the labeller, which sets the role", async () => {
    const fake = path.join(tmp, "herdr-ws");
    const list = JSON.stringify({ result: { agents: [{ name: "main-conductor", pane_id: "w2:p5Q", tab_id: "w2:t5Q", workspace_id: "w2" }] } });
    fs.writeFileSync(fake, `#!/bin/sh\ncat <<'EOF'\n${list}\nEOF\n`, { mode: 0o755 });
    const e = { ...auto(), HERDR_PANE_ID: "w2:p5Q", HERDR_WORKSPACE_ID: "w2", NIGHTWATCH_HERDR_WS: fake };
    runHook("started", JSON.stringify({ session_id: "sd", source: "startup", cwd: "/nowhere/Proj" }), e);
    const dir = findRunDir("s-sd", e)!;
    const deadline = Date.now() + 10_000;
    while (readRun(dir).role_from === "pending" && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
    expect(readRun(dir)).toMatchObject({ role: "conductor", role_from: "herdr" });
  }, 15_000);
  it("a labeller that fails to start is logged and does not crash the hook", async () => {
    const e = { ...auto(), HERDR_PANE_ID: "w2:p9Z", HERDR_WORKSPACE_ID: "w2", NIGHTWATCH_LABEL_NODE: path.join(tmp, "no-such-node") };
    expect(() => runHook("started", JSON.stringify({ session_id: "se", source: "startup", cwd: "/nowhere/Proj" }), e)).not.toThrow();
    const log = path.join(tmp, "runs", "hook-errors.log");
    const deadline = Date.now() + 5_000;
    while (!fs.existsSync(log) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25));
    expect(fs.readFileSync(log, "utf8").trim().split("\n").filter((l) => / label /.test(l))).toHaveLength(1);
  });
});
