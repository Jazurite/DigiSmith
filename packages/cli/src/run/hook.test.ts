// packages/cli/src/run/hook.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildData, runHook, waitFor } from "./hook.ts";
import { createRun } from "./record.ts";
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
  it("writes nothing without DIGISMITH_RUN_ID", () => {
    const before = fs.readdirSync(path.join(runsDir(env), "DGS-581", run));
    runHook("started", "{}", { DIGISMITH_DEPOT_DIR: tmp });
    runHook("started", "{}", { DIGISMITH_DEPOT_DIR: tmp, DIGISMITH_RUN_ID: "" });
    expect(fs.readdirSync(path.join(runsDir(env), "DGS-581", run))).toEqual(before);
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
