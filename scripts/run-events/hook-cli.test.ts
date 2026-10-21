// scripts/run-events/hook-cli.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { createRun } from "../../packages/cli/src/run/record.ts";
import { findRunDir } from "../../packages/cli/src/run/paths.ts";
import { readEvents } from "../../packages/cli/src/run/events.ts";

const SCRIPT = path.join(import.meta.dirname, "hook-cli.ts");
let tmp: string;
let env: NodeJS.ProcessEnv;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nw-cli-"));
  env = { ...process.env, DIGISMITH_DEPOT_DIR: tmp };
  delete env.DIGISMITH_RUN_ID;
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const call = (kind: string, input: string, e: NodeJS.ProcessEnv) =>
  spawnSync(process.execPath, ["--experimental-strip-types", SCRIPT, kind], { input, env: e, encoding: "utf8" });

describe("hook-cli", () => {
  it("writes one event, prints nothing and exits 0", () => {
    const run = createRun({ ticket: "DGS-581", role: "builder" }, env).run;
    const r = call("tool", JSON.stringify({ tool_name: "Bash", tool_input: { command: "SECRET" }, tool_response: { stdout: "SECRET" } }), { ...env, DIGISMITH_RUN_ID: run });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
    const dir = findRunDir(run, env)!;
    expect(readEvents(dir)).toHaveLength(1);
    expect(fs.readFileSync(path.join(dir, "events.jsonl"), "utf8")).not.toMatch(/SECRET/);
  });
  it("exits 0 and writes nothing without DIGISMITH_RUN_ID, and for a bad kind", () => {
    expect(call("started", "{}", env).status).toBe(0);
    expect(fs.existsSync(path.join(tmp, "runs"))).toBe(false);
    expect(call("bogus", "{}", env).status).toBe(0);
  });
  it("finishes fast (one call, recorded)", () => {
    const run = createRun({ ticket: "DGS-581", role: "builder" }, env).run;
    call("started", "{}", { ...env, DIGISMITH_RUN_ID: run }); // warm the file cache
    const t0 = performance.now();
    call("tool", "{}", { ...env, DIGISMITH_RUN_ID: run });
    const ms = performance.now() - t0;
    console.log(`run-events hook call: ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(1000); // target is 100 ms; the ceiling is loose so a slow machine does not fail
  });
});
