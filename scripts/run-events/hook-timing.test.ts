// scripts/run-events/hook-timing.test.ts
// DGS-598 cost rule: the target is under 100 ms per hook on an idle machine. This test measures the hook's OWN cost.
// It takes 7 rounds of a bare `node -e 0` start, a real SessionStart and a real PostToolUse (through the hooks.json
// command, same sh -c spawn, same env), interleaved so load that changes during the test hits all three alike.
// The overhead is the minimum hook time minus the minimum bare node time. By default the test only prints the numbers,
// because a parallel test run still inflates the overhead (90-130 ms seen). NIGHTWATCH_TIMING=assert (run alone, on an
// idle machine) fails it above 40 ms.
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
  // an allowlist, so an ambient DIGISMITH_*, HERDR_* or NODE_COMPILE_CACHE cannot leak in
  const ambient: NodeJS.ProcessEnv = {};
  for (const k of ["PATH", "HOME", "TMPDIR"]) if (process.env[k] !== undefined) ambient[k] = process.env[k];
  env = { ...ambient, DIGISMITH_DEPOT_DIR: path.join(tmp, "depot"), CLAUDE_PLUGIN_ROOT: ROOT, CLAUDE_PID: "1",
    HERDR_PANE_ID: "w9:p1", HERDR_WORKSPACE_ID: "w9", NIGHTWATCH_HERDR_WS: fake };
  delete env.DIGISMITH_RUN_ID;
  fs.mkdirSync(env.DIGISMITH_DEPOT_DIR!);
});
afterAll(async () => {
  await new Promise((r) => setTimeout(r, 1500)); // let the detached labellers (fake herdr sleeps 1 s) finish
  fs.rmSync(tmp, { recursive: true, force: true });
});

const MAX_OVERHEAD_MS = 40;
function time(command: string, payload: object): number {
  const t0 = performance.now();
  const r = spawnSync("sh", ["-c", command], { input: JSON.stringify(payload), env, encoding: "utf8" });
  const t = performance.now() - t0;
  expect(r.status).toBe(0);
  return t;
}
const ms = (event: string, payload: object) => time(cmd(event), payload);
const min = (xs: number[]) => Math.min(...xs);

describe("run-event hook timing", () => {
  it("SessionStart (new run, labeller spawned) and PostToolUse report their cost above a bare node start; NIGHTWATCH_TIMING=assert holds it to 40 ms (minimum of 7 interleaved rounds)", () => {
    ms("SessionStart", { session_id: "warm", source: "startup", cwd: tmp }); // fills the compile cache
    time("node -e 0", {}); // warms the bare node start
    const base: number[] = [];
    const start: number[] = [];
    const tool: number[] = [];
    for (let i = 0; i < 7; i++) {
      base.push(time("node -e 0", {}));
      start.push(ms("SessionStart", { session_id: `t${i}`, source: "startup", cwd: tmp }));
      tool.push(ms("PostToolUse", { session_id: `t${i}`, tool_name: "Bash", tool_response: {} }));
    }
    const b = min(base);
    const oStart = min(start) - b;
    const oTool = min(tool) - b;
    console.log(`hook timing: SessionStart min ${min(start).toFixed(0)} ms, PostToolUse min ${min(tool).toFixed(0)} ms, bare node min ${b.toFixed(0)} ms; overhead SessionStart ${oStart.toFixed(0)} ms, PostToolUse ${oTool.toFixed(0)} ms`);
    if (process.env.NIGHTWATCH_TIMING !== "assert") return;
    expect(oStart).toBeLessThanOrEqual(MAX_OVERHEAD_MS);
    expect(oTool).toBeLessThanOrEqual(MAX_OVERHEAD_MS);
  }, 60_000);
});
