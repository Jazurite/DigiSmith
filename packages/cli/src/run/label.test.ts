import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { labelRun, parseAgentList, defaultListAgents } from "./label.ts";
import { startAuto } from "./auto.ts";
import { readRun } from "./record.ts";

const LIST = JSON.stringify({ id: "cli:agent:list", result: { agents: [
  { agent: "claude", name: "digismith-conductor", pane_id: "w2:p1", tab_id: "w2:t1", workspace_id: "w2", cwd: "/SECRET", terminal_title: "SECRET" },
  { agent: "claude", name: "dgs-598", pane_id: "w2:p8W", tab_id: "w2:t8W", workspace_id: "w2" },
] } });

let tmp: string;
let env: NodeJS.ProcessEnv;
let dir: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nw-label-"));
  env = { DIGISMITH_DEPOT_DIR: tmp, HERDR_PANE_ID: "w2:p8W", HERDR_WORKSPACE_ID: "w2" };
  dir = startAuto({ session_id: "sid-1", source: "startup", cwd: "/nowhere/DigiSmith" }, env)!.dir;
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("parseAgentList", () => {
  it("keeps four fields of each agent", () => {
    expect(parseAgentList(LIST)).toEqual([
      { name: "digismith-conductor", pane_id: "w2:p1", tab_id: "w2:t1", workspace_id: "w2" },
      { name: "dgs-598", pane_id: "w2:p8W", tab_id: "w2:t8W", workspace_id: "w2" },
    ]);
    expect(parseAgentList("not json")).toEqual([]);
  });
});

describe("labelRun", () => {
  it("sets the role and the ticket from this pane's agent name", () => {
    labelRun(dir, env, (ws) => { expect(ws).toBe("w2"); return LIST; });
    expect(readRun(dir)).toMatchObject({ role: "builder", role_from: "herdr", ticket: "DGS-598" });
    expect(fs.readFileSync(path.join(dir, "run.json"), "utf8")).not.toMatch(/SECRET/);
  });
  it("a pane named usage-probe gets project usage-probe and role scout", () => {
    const probe = JSON.stringify({ result: { agents: [{ name: "usage-probe", pane_id: "w2:p8W", tab_id: "w2:t8W", workspace_id: "w2" }] } });
    labelRun(dir, env, () => probe);
    expect(readRun(dir)).toMatchObject({ role: "scout", project: "usage-probe" });
  });
  it("a pane named dgs-598 keeps its project", () => {
    labelRun(dir, env, () => LIST);
    expect(readRun(dir).project).toBe("DigiSmith");
  });
  it("gives other, none when the pane is not listed", () => {
    labelRun(dir, env, () => JSON.stringify({ result: { agents: [] } }));
    expect(readRun(dir)).toMatchObject({ role: "other", role_from: "none", ticket: null });
  });
  it("on a failure: role_from none and one log line", () => {
    labelRun(dir, env, () => { throw new Error("timeout"); });
    expect(readRun(dir)).toMatchObject({ role: "other", role_from: "none" });
    expect(fs.readFileSync(path.join(tmp, "runs", "hook-errors.log"), "utf8")).toMatch(/label .*timeout/);
  });
  it("leaves a run alone when it is not pending", () => {
    labelRun(dir, env, () => LIST);
    labelRun(dir, env, () => { throw new Error("must not be called"); });
    expect(readRun(dir).role).toBe("builder");
  });
  it("runs the fake herdr-ws given by NIGHTWATCH_HERDR_WS, with HERDR_WS set", () => {
    const fake = path.join(tmp, "herdr-ws");
    fs.writeFileSync(fake, `#!/bin/sh\n[ "$HERDR_WS" = w2 ] && [ "$1 $2" = "agent list" ] && cat <<'EOF'\n${LIST}\nEOF\n`, { mode: 0o755 });
    expect(parseAgentList(defaultListAgents({ ...env, NIGHTWATCH_HERDR_WS: fake })("w2"))).toHaveLength(2);
  });
});
