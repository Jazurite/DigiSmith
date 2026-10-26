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

const bash = (command: string, cwd?: string) => ({ session_id: "s1", tool_name: "Bash", tool_input: { command }, tool_response: {}, ...(cwd ? { cwd } : {}) });
// A fake repo: .git folder with HEAD. A fake worktree: .git file -> <main>/.git/worktrees/<name>, which has a commondir file.
const repo = (name: string): string => {
  const dir = path.join(tmp, name);
  fs.mkdirSync(path.join(dir, ".git", "refs"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".git", "HEAD"), "ref: refs/heads/main\n");
  return dir;
};
const worktreeOf = (main: string, name: string): string => {
  const wt = path.join(tmp, name);
  const gitdir = path.join(main, ".git", "worktrees", name);
  fs.mkdirSync(gitdir, { recursive: true });
  fs.mkdirSync(wt, { recursive: true });
  fs.writeFileSync(path.join(gitdir, "commondir"), "../..\n");
  fs.writeFileSync(path.join(wt, ".git"), `gitdir: ${gitdir}\n`);
  return wt;
};
const pin = (main: string, branch: string): void => {
  const f = path.join(main, ".git", "refs", "digismith", "post-finish", branch, "head");
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, "abc\n");
};
const mkIn = (ticket: string, at: string, worktree: string) => createRun({ ticket, role: "builder", order: "/o.md", worktree }, env, new Date(at)).run;
const SKILL_BLOCK = [
  "git checkout main", "git pull", "PRE_MERGE=$(git rev-parse HEAD)", "git merge DGS-9__x-y",
  'if [ "$(git rev-parse HEAD)" != "$PRE_MERGE" ]; then',
  '  git update-ref refs/digismith/post-finish/DGS-9__x-y/base "$PRE_MERGE"',
  "  git update-ref refs/digismith/post-finish/DGS-9__x-y/head HEAD", "fi", "pnpm test",
].join("\n");
const types = (id: string) => readEvents(findRunDir(id, env)!).map((e) => e.type);
const mk = (ticket: string, role: string, at: string) => createRun({ ticket, role, order: "/o.md" }, env, new Date(at)).run;

describe("lifecycleOf", () => {
  it("reads review_ready from a ticket pack command", () => {
    expect(lifecycleOf(bash("dg reviewer pack --type ticket --ticket DGS-9 --workspace /w --base abc --head def"))).toEqual({ type: "review_ready", ticket: "DGS-9", data: { scope: "ticket", round: 1 } });
    expect(lifecycleOf(bash("dg reviewer pack --type ticket --ticket DGS-9 --round 2 --workspace /w"))).toEqual({ type: "review_ready", ticket: "DGS-9", data: { scope: "ticket", round: 2 } });
  });
  it("accepts a quoted ticket key", () => {
    expect(lifecycleOf(bash('dg reviewer pack --type ticket --ticket "DGS-9" --workspace /w'))).toMatchObject({ ticket: "DGS-9" });
    expect(lifecycleOf(bash("dg reviewer pack --type ticket --ticket='DGS-9' --workspace /w"))).toMatchObject({ ticket: "DGS-9" });
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

describe("writeLifecycle repo checks", () => {
  it("the full skill block with no ref present gives no merged event", () => {
    const main = repo("main");
    const b = mkIn("DGS-9", "2026-10-21T01:00:00Z", worktreeOf(main, "wt9"));
    writeLifecycle(bash(SKILL_BLOCK, main), env);
    expect(types(b)).toEqual([]);
  });
  it("merged is written when the loose ref exists, from the main checkout or a worktree", () => {
    const main = repo("main");
    const b = mkIn("DGS-9", "2026-10-21T01:00:00Z", worktreeOf(main, "wt9"));
    pin(main, "DGS-9__x-y");
    writeLifecycle(bash(SKILL_BLOCK, path.join(main)), env);
    expect(types(b)).toEqual(["merged"]);
  });
  it("merged is written when the ref sits in packed-refs, and from a subfolder of a worktree", () => {
    const main = repo("main");
    const wt = worktreeOf(main, "wt9");
    fs.mkdirSync(path.join(wt, "sub"));
    const b = mkIn("DGS-9", "2026-10-21T01:00:00Z", wt);
    fs.writeFileSync(path.join(main, ".git", "packed-refs"), "# pack-refs\nabc refs/digismith/post-finish/DGS-9__x-y/head\n");
    writeLifecycle(bash(SKILL_BLOCK, path.join(wt, "sub")), env);
    expect(types(b)).toEqual(["merged"]);
  });
  it("merged is not written without a cwd or outside a repo", () => {
    const b = mk("DGS-9", "builder", "2026-10-21T01:00:00Z");
    writeLifecycle(bash(SKILL_BLOCK), env);
    writeLifecycle(bash(SKILL_BLOCK, tmp), env);
    expect(types(b)).toEqual([]);
  });
  it("a push in another repo does nothing", () => {
    const a = repo("a");
    const other = repo("other");
    const ra = mkIn("DGS-9", "2026-10-25T01:00:00Z", worktreeOf(a, "wta"));
    pin(a, "DGS-9__x");
    const now = new Date("2026-10-26T00:00:00Z");
    writeLifecycle(bash("git update-ref refs/digismith/post-finish/DGS-9__x/head HEAD", a), env, now);
    writeLifecycle(bash("git push origin main", other), env, now);
    expect(types(ra)).toEqual(["merged"]);
    writeLifecycle(bash("git push origin main", a), env, now);
    expect(types(ra)).toEqual(["merged", "pushed"]);
  });
  it("a failed tool writes nothing", () => {
    const main = repo("main");
    const b = mkIn("DGS-9", "2026-10-21T01:00:00Z", worktreeOf(main, "wt9"));
    writeLifecycle({ ...bash("dg reviewer pack --type ticket --ticket DGS-9 --workspace /w", main), tool_response: { is_error: true } }, env);
    writeLifecycle({ ...bash("dg reviewer pack --type ticket --ticket DGS-9 --workspace /w", main), tool_response: { success: false } }, env);
    expect(types(b)).toEqual([]);
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
    writeLifecycle(bash("git update-ref refs/digismith/post-finish/DGS-8__x/head HEAD", repo("m8")), env);
    expect(types(rev)).toEqual([]);
    expect(fs.existsSync(path.join(tmp, "runs", "DGS-8"))).toBe(false);
  });
  it("merged is written once per run", () => {
    const main = repo("main");
    pin(main, "DGS-9__x-y");
    const b = mk("DGS-9", "builder", "2026-10-21T01:00:00Z");
    const merged = bash("git update-ref refs/digismith/post-finish/DGS-9__x-y/head HEAD", main);
    writeLifecycle(merged, env);
    writeLifecycle(merged, env);
    expect(types(b)).toEqual(["merged"]);
  });
  it("pushed goes to builder runs of this repo with merged and no pushed, from the last 7 days only", () => {
    const now = new Date("2026-10-26T00:00:00Z");
    const main = repo("main");
    const wt = (n: string) => worktreeOf(main, n);
    const fresh = mkIn("DGS-9", "2026-10-25T01:00:00Z", wt("w9"));
    const done = mkIn("DGS-10", "2026-10-25T02:00:00Z", wt("w10"));
    const old = mkIn("DGS-11", "2026-10-01T01:00:00Z", wt("w11"));
    const unmerged = mkIn("DGS-12", "2026-10-25T03:00:00Z", wt("w12"));
    const rev = createRun({ ticket: "DGS-13", role: "reviewer", order: "/o.md", worktree: wt("w13") }, env, new Date("2026-10-25T03:00:00Z")).run;
    for (const t of ["DGS-9", "DGS-10", "DGS-11", "DGS-13"]) {
      pin(main, `${t}__x`);
      writeLifecycle(bash(`git update-ref refs/digismith/post-finish/${t}__x/head HEAD`, main), env, now);
    }
    writeLifecycle(bash("git push origin main", main), env, now);
    expect(types(fresh)).toEqual(["merged", "pushed"]);
    expect(types(done)).toEqual(["merged", "pushed"]);
    expect(types(old)).toEqual(["merged"]);
    expect(types(unmerged)).toEqual([]);
    expect(types(rev)).toEqual([]);
    writeLifecycle(bash("git push origin main", main), env, now);
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
