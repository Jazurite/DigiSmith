import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { createRun } from "../../packages/cli/src/run/record.ts";
import { showRun, tailEvents } from "../../packages/cli/src/run/read.ts";
import { appendEvent } from "../../packages/cli/src/run/events.ts";
import { findRunDir } from "../../packages/cli/src/run/paths.ts";

const ROOT = path.join(import.meta.dirname, "..", "..");
const hooks = JSON.parse(fs.readFileSync(path.join(ROOT, "hooks", "hooks.json"), "utf8")).hooks as Record<string, { hooks: { command: string }[] }[]>;

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nw-e2e-"));
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

function base(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, DIGISMITH_DEPOT_DIR: tmp, CLAUDE_PLUGIN_ROOT: ROOT };
  delete env.DIGISMITH_RUN_ID;
  return env;
}
// The hook commands import no clickup code, so spawning them is safe while another test rebuilds dist.
function fire(event: string, env: NodeJS.ProcessEnv, payload: object) {
  const cmd = hooks[event].flatMap((g) => g.hooks.map((h) => h.command)).find((c) => c.includes("run-events/hook-cli.ts"))!;
  return spawnSync("sh", ["-c", cmd], { input: JSON.stringify(payload), env, encoding: "utf8" });
}

describe("a worker run, start to end", () => {
  it("writes run.json and the hook events in file order; the readers show them", () => {
    const e0 = base();
    const id = createRun({ ticket: "DGS-581", role: "builder", order: "/o.md", seat: "dev0" }, e0).run;
    const env = { ...e0, DIGISMITH_RUN_ID: id };
    fire("SessionStart", env, { source: "startup", session_id: "s1" });
    fire("PostToolUse", env, { tool_name: "Bash", tool_response: {} });
    appendEvent(findRunDir(id, e0)!, id, "phase", { phase: "review" }, 2000);
    fire("Notification", env, { notification_type: "permission_prompt" });
    fire("Stop", env, {});
    fire("SessionEnd", env, { reason: "other" });

    const show = showRun(id, e0)!;
    expect(show.summary).toMatchObject({ events: 6, last_type: "ended", ended: true });
    const lines = tailEvents(id, 0, e0)!;
    expect(lines.map((e) => [e.seq, e.type])).toEqual([[1, "started"], [2, "tool"], [3, "phase"], [4, "blocked"], [5, "turn_end"], [6, "ended"]]);
    expect(lines[2].data).toEqual({ phase: "review" });
    expect(lines[3].data).toEqual({ kind: "permission_prompt" });
  });

  it("a session without DIGISMITH_RUN_ID writes nothing", () => {
    const env = base();
    for (const e of ["SessionStart", "PostToolUse", "Notification", "Stop", "SessionEnd"]) expect(fire(e, env, { source: "startup" }).status).toBe(0);
    expect(fs.existsSync(path.join(tmp, "runs"))).toBe(false);
  });
});
