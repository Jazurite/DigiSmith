// scripts/run-events/hooks-json.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { createRun } from "../../packages/cli/src/run/record.ts";
import { findRunDir } from "../../packages/cli/src/run/paths.ts";
import { readEvents } from "../../packages/cli/src/run/events.ts";

const ROOT = path.join(import.meta.dirname, "..", "..");
const hooks = JSON.parse(fs.readFileSync(path.join(ROOT, "hooks", "hooks.json"), "utf8")).hooks as Record<string, { matcher?: string; hooks: { type: string; command: string }[] }[]>;

const EXPECTED: Record<string, string> = { SessionStart: "started", Notification: "blocked", PostToolUse: "tool", Stop: "turn_end", SessionEnd: "ended" };

function commandFor(event: string): string {
  const all = hooks[event].flatMap((g) => g.hooks.map((h) => h.command));
  const hit = all.filter((c) => c.includes("run-events/hook-cli.ts"));
  expect(hit).toHaveLength(1);
  return hit[0];
}

let tmp: string;
let bin: string;
let shimLog: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nw-hooksjson-"));
  bin = path.join(tmp, "bin");
  shimLog = path.join(tmp, "node-calls.log");
  fs.mkdirSync(bin);
  // a node shim first in PATH: it records each call, then runs the real node
  fs.writeFileSync(path.join(bin, "node"), `#!/bin/sh\necho called >> "${shimLog}"\nexec "${process.execPath}" "$@"\n`, { mode: 0o755 });
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

function sh(command: string, extra: NodeJS.ProcessEnv, input = "{}") {
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${bin}:${process.env.PATH}`, CLAUDE_PLUGIN_ROOT: ROOT, DIGISMITH_DEPOT_DIR: path.join(tmp, "depot"), ...extra };
  delete env.DIGISMITH_RUN_ID;
  Object.assign(env, extra);
  return spawnSync("sh", ["-c", command], { input, env, encoding: "utf8" });
}

describe("hooks.json", () => {
  const GUARD = 'D="${DIGISMITH_DEPOT_DIR:-$HOME/.digismith-depot}"; [ -n "$DIGISMITH_RUN_ID" ] || [ -d "$D" ] || exit 0; NODE_COMPILE_CACHE="$D/runs/.index/node-cache" node --experimental-strip-types ';
  it("has the five run commands, each with the depot guard and the compile cache", () => {
    for (const [event, kind] of Object.entries(EXPECTED)) {
      const c = commandFor(event);
      expect(c.startsWith(GUARD)).toBe(true);
      expect(c.endsWith(`/scripts/run-events/hook-cli.ts" ${kind}`)).toBe(true);
    }
  });
  it("keeps the existing session-cards and session-init commands", () => {
    const all = Object.values(hooks).flatMap((gs) => gs.flatMap((g) => g.hooks.map((h) => h.command)));
    for (const needle of ["session-cards/hook-cli.ts\" start", "session-init.ts", "session-cards/hook-cli.ts\" prompt", "session-cards/hook-cli.ts\" end"]) {
      expect(all.some((c) => c.includes(needle))).toBe(true);
    }
  });
  it("starts no node process when DIGISMITH_RUN_ID is unset and there is no depot folder, and exits 0", () => {
    for (const event of Object.keys(EXPECTED)) {
      expect(sh(commandFor(event), {}).status).toBe(0);
      expect(sh(commandFor(event), { DIGISMITH_RUN_ID: "" }).status).toBe(0);
    }
    expect(fs.existsSync(shimLog)).toBe(false);
    expect(fs.existsSync(path.join(tmp, "depot"))).toBe(false);
  });
  it("records a session without DIGISMITH_RUN_ID when the depot exists", () => {
    const depot = path.join(tmp, "depot");
    fs.mkdirSync(depot);
    const r = sh(commandFor("SessionStart"), {}, JSON.stringify({ session_id: "auto-1", source: "startup", cwd: tmp }));
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
    const dir = findRunDir("s-auto-1", { DIGISMITH_DEPOT_DIR: depot })!;
    expect(readEvents(dir).map((e) => e.type)).toEqual(["started"]);
    expect(fs.existsSync(path.join(depot, "runs", ".index", "node-cache"))).toBe(true);
  });
  it("writes the event for each command when the run id is set", () => {
    const env = { DIGISMITH_DEPOT_DIR: path.join(tmp, "depot") };
    const run = createRun({ ticket: "DGS-581", role: "builder", order: "/o.md" }, env).run;
    const payloads: Record<string, object> = {
      SessionStart: { source: "startup", session_id: "s1" },
      Notification: { notification_type: "permission_prompt" },
      PostToolUse: { tool_name: "Bash", tool_response: {} },
      Stop: {},
      SessionEnd: { reason: "other" },
    };
    for (const event of Object.keys(EXPECTED)) {
      const r = sh(commandFor(event), { ...env, DIGISMITH_RUN_ID: run }, JSON.stringify(payloads[event]));
      expect(r.status).toBe(0);
      expect(r.stdout).toBe("");
    }
    expect(readEvents(findRunDir(run, env)!).map((e) => e.type)).toEqual(Object.values(EXPECTED));
  });
});
