// scripts/run-events/hook-timing.test.ts
// DGS-598 cost rule: each run-event hook stays under 100 ms (median of 7 real calls through the hooks.json command).
// NIGHTWATCH_TIMING=report prints the numbers without failing (for a loaded machine).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.join(import.meta.dirname, "..", "..");
const hooks = JSON.parse(fs.readFileSync(path.join(ROOT, "hooks", "hooks.json"), "utf8")).hooks as Record<string, { hooks: { command: string }[] }[]>;
const cmd = (event: string) => hooks[event].flatMap((g) => g.hooks.map((h) => h.command)).find((c) => c.includes("run-events/hook-cli.ts"))!;

let tmp: string;
let env: NodeJS.ProcessEnv;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nw-timing-"));
  // a slow fake herdr-ws: the hook must not wait for the labeller
  const fake = path.join(tmp, "herdr-ws");
  fs.writeFileSync(fake, "#!/bin/sh\nsleep 1\necho '{\"result\":{\"agents\":[]}}'\n", { mode: 0o755 });
  env = { ...process.env, DIGISMITH_DEPOT_DIR: path.join(tmp, "depot"), CLAUDE_PLUGIN_ROOT: ROOT, CLAUDE_PID: "1",
    HERDR_PANE_ID: "w9:p1", HERDR_WORKSPACE_ID: "w9", NIGHTWATCH_HERDR_WS: fake };
  delete env.DIGISMITH_RUN_ID;
  fs.mkdirSync(env.DIGISMITH_DEPOT_DIR!);
});
afterAll(async () => {
  await new Promise((r) => setTimeout(r, 1500)); // let the detached labellers (fake herdr sleeps 1 s) finish
  fs.rmSync(tmp, { recursive: true, force: true });
});

function ms(event: string, payload: object): number {
  const t0 = performance.now();
  const r = spawnSync("sh", ["-c", cmd(event)], { input: JSON.stringify(payload), env, encoding: "utf8" });
  const t = performance.now() - t0;
  expect(r.status).toBe(0);
  return t;
}
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

describe("run-event hook timing", () => {
  it("SessionStart (new run, labeller spawned) and PostToolUse stay under 100 ms (median of 7)", () => {
    ms("SessionStart", { session_id: "warm", source: "startup", cwd: tmp }); // fills the compile cache
    const start = Array.from({ length: 7 }, (_, i) => ms("SessionStart", { session_id: `t${i}`, source: "startup", cwd: tmp }));
    const tool = Array.from({ length: 7 }, () => ms("PostToolUse", { session_id: "t0", tool_name: "Bash", tool_response: {} }));
    console.log(`hook timing: SessionStart median ${median(start).toFixed(0)} ms, PostToolUse median ${median(tool).toFixed(0)} ms`);
    if (process.env.NIGHTWATCH_TIMING === "report") return;
    expect(median(start)).toBeLessThan(100);
    expect(median(tool)).toBeLessThan(100);
  }, 60_000);
});
