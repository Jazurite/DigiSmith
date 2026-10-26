// packages/cli/src/run/lifecycle.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { lifecycleOf, writeLifecycle } from "./lifecycle.ts";
import { createRun } from "./record.ts";
import { findRunDir } from "./paths.ts";
import { readEvents } from "./events.ts";

let tmp: string;
let env: NodeJS.ProcessEnv;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nw-life-"));
  env = { DIGISMITH_DEPOT_DIR: tmp };
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const bash = (command: string) => ({ session_id: "s1", tool_name: "Bash", tool_input: { command }, tool_response: {} });
const types = (id: string) => readEvents(findRunDir(id, env)!).map((e) => e.type);
const mk = (ticket: string, role: string, at: string) => createRun({ ticket, role, order: "/o.md" }, env, new Date(at)).run;

describe("lifecycleOf", () => {
  it("reads review_ready from a ticket pack command", () => {
    expect(lifecycleOf(bash("dg reviewer pack --type ticket --ticket DGS-9 --workspace /w --base abc --head def"))).toEqual({ type: "review_ready", ticket: "DGS-9", data: { scope: "ticket", round: 1 } });
    expect(lifecycleOf(bash("dg reviewer pack --type ticket --ticket DGS-9 --round 2 --workspace /w"))).toEqual({ type: "review_ready", ticket: "DGS-9", data: { scope: "ticket", round: 2 } });
  });
  it("ignores a task pack", () => {
    expect(lifecycleOf(bash("dg reviewer pack --type task --task 1 --ticket DGS-9"))).toBeNull();
  });
  it("reads merged from the post-finish pin", () => {
    expect(lifecycleOf(bash("git update-ref refs/digismith/post-finish/DGS-9__x-y/head HEAD"))).toEqual({ type: "merged", ticket: "DGS-9", data: {} });
  });
  it("reads pushed from a push of the base branch only", () => {
    expect(lifecycleOf(bash("git push origin main"))).toEqual({ type: "pushed", ticket: null, data: {} });
    expect(lifecycleOf(bash("GIT_SSH_COMMAND=x git push origin master"))).toEqual({ type: "pushed", ticket: null, data: {} });
    expect(lifecycleOf(bash("git push -u origin DGS-9__x"))).toBeNull();
    expect(lifecycleOf(bash("git push -u origin main"))).toBeNull();
  });
  it("gives null for other commands and other tools", () => {
    expect(lifecycleOf(bash("git status"))).toBeNull();
    expect(lifecycleOf({ tool_name: "Edit", tool_input: { command: "git push origin main" } })).toBeNull();
    expect(lifecycleOf(null)).toBeNull();
  });
});

describe("writeLifecycle", () => {
  const pack = bash("dg reviewer pack --type ticket --ticket DGS-9 --workspace /w");
  it("writes review_ready to the newest builder run of the ticket", () => {
    const older = mk("DGS-9", "builder", "2026-10-20T01:00:00Z");
    const newer = mk("DGS-9", "builder", "2026-10-21T01:00:00Z");
    writeLifecycle(pack, env, new Date("2026-10-22T00:00:00Z"));
    expect(types(older)).toEqual([]);
    expect(types(newer)).toEqual(["review_ready"]);
    expect(readEvents(findRunDir(newer, env)!)[0].data).toEqual({ scope: "ticket", round: 1 });
  });
  it("ignores a reviewer run and writes nothing when the ticket has no builder run", () => {
    const rev = mk("DGS-9", "reviewer", "2026-10-21T01:00:00Z");
    writeLifecycle(pack, env);
    writeLifecycle(bash("git update-ref refs/digismith/post-finish/DGS-8__x/head HEAD"), env);
    expect(types(rev)).toEqual([]);
    expect(fs.existsSync(path.join(tmp, "runs", "DGS-8"))).toBe(false);
  });
  it("merged is written once per run", () => {
    const b = mk("DGS-9", "builder", "2026-10-21T01:00:00Z");
    const merged = bash("git update-ref refs/digismith/post-finish/DGS-9__x-y/head HEAD");
    writeLifecycle(merged, env);
    writeLifecycle(merged, env);
    expect(types(b)).toEqual(["merged"]);
  });
  it("pushed goes to builder runs with merged and no pushed, from the last 7 days only", () => {
    const now = new Date("2026-10-26T00:00:00Z");
    const fresh = mk("DGS-9", "builder", "2026-10-25T01:00:00Z");
    const done = mk("DGS-10", "builder", "2026-10-25T02:00:00Z");
    const old = mk("DGS-11", "builder", "2026-10-01T01:00:00Z");
    const unmerged = mk("DGS-12", "builder", "2026-10-25T03:00:00Z");
    const rev = mk("DGS-13", "reviewer", "2026-10-25T03:00:00Z");
    for (const t of ["DGS-9", "DGS-10", "DGS-11", "DGS-13"]) {
      writeLifecycle(bash(`git update-ref refs/digismith/post-finish/${t}__x/head HEAD`), env, now);
    }
    writeLifecycle(bash("git push origin main"), env, now);
    expect(types(fresh)).toEqual(["merged", "pushed"]);
    expect(types(done)).toEqual(["merged", "pushed"]);
    expect(types(old)).toEqual(["merged"]);
    expect(types(unmerged)).toEqual([]);
    expect(types(rev)).toEqual([]);
    writeLifecycle(bash("git push origin main"), env, now);
    expect(types(fresh)).toEqual(["merged", "pushed"]);
  });
  it("the event data holds no command text", () => {
    const b = mk("DGS-9", "builder", "2026-10-21T01:00:00Z");
    writeLifecycle(bash("dg reviewer pack --type ticket --ticket DGS-9 --workspace /SECRET-PATH"), env);
    expect(fs.readFileSync(path.join(findRunDir(b, env)!, "events.jsonl"), "utf8")).not.toMatch(/SECRET-PATH|reviewer pack/);
  });
  it("the finishing skill still contains the pin command", () => {
    const skill = path.join(import.meta.dirname, "..", "..", "..", "..", "skills", "finishing-a-development-branch", "SKILL.md");
    expect(fs.readFileSync(skill, "utf8")).toContain("git update-ref refs/digismith/post-finish/<feature-branch>/head");
  });
});
