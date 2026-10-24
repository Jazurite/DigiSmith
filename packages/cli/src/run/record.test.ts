import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import { execFileSync } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";
import { createRun, readRun, rewriteRun, ROLES } from "./record.ts";
import { findRunDir, runsDir } from "./paths.ts";

let tmp: string;
let repos: string[] = [];
let env: NodeJS.ProcessEnv;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nw-record-"));
  env = { DIGISMITH_DEPOT_DIR: tmp };
});
afterEach(() => {
  for (const d of [tmp, ...repos]) fs.rmSync(d, { recursive: true, force: true });
  repos = [];
});

describe("createRun", () => {
  it("writes run.json with every field and null for unknown ones", () => {
    const r = createRun({ ticket: "DGS-581", role: "builder", order: "/o/order.md", seat: "dev0" }, env, new Date("2026-10-21T13:30:05Z"));
    expect(r.run).toMatch(/^builder-20261021T133005-[0-9a-f]{6}$/);
    const dir = findRunDir(r.run, env)!;
    expect(dir).toBe(path.join(runsDir(env), "DGS-581", r.run));
    const onDisk = readRun(dir);
    expect(onDisk).toEqual(r);
    expect(onDisk.schema).toBe("nightwatch-run/v1");
    expect(onDisk.seat).toBe("dev0");
    expect(onDisk.model).toBeNull();
    expect(onDisk.herdr).toEqual({ workspace: null, tab: null, pane: null });
    expect(onDisk.budget).toBeNull();
    expect(onDisk.created_at).toBe("2026-10-21T13:30:05.000Z");
  });
  it("reads plugin_version from the plugin manifest", () => {
    const r = createRun({ ticket: "DGS-581", role: "scout", order: "/o.md" }, env);
    expect(r.plugin_version).toMatch(/^\d+\.\d+\.\d+/);
  });
  function tempRepo(): { dir: string; sha: string } {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nw-repo-"));
    repos.push(dir);
    const g = (...a: string[]) => execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...a], { cwd: dir, encoding: "utf8" }).trim();
    g("init", "-b", "main");
    g("commit", "--allow-empty", "-m", "init");
    return { dir, sha: g("rev-parse", "HEAD") };
  }
  it("takes branch, base sha and worktree from git when a worktree is given", () => {
    const { dir, sha } = tempRepo();
    const r = createRun({ ticket: "DGS-581", role: "builder", order: "/o.md", worktree: dir }, env);
    expect(r.worktree).toBe(dir);
    expect(r.base_sha).toBe(sha);
    expect(r.base_sha).toMatch(/^[0-9a-f]{40}$/);
    expect(r.branch).toBe("main");
  });
  it("a relative --worktree gets the project of the resolved path", () => {
    const { dir } = tempRepo();
    const r = createRun({ ticket: "DGS-581", role: "builder", order: "/o.md", worktree: path.relative(process.cwd(), dir) }, env);
    expect(r.project).not.toBe("unknown");
    expect(r.project).toBe(createRun({ ticket: "DGS-581", role: "builder", order: "/o.md", worktree: dir }, env).project);
  });
  it("stores a null branch on a detached head", () => {
    const { dir, sha } = tempRepo();
    execFileSync("git", ["checkout", "--detach"], { cwd: dir, stdio: "ignore" });
    const r = createRun({ ticket: "DGS-581", role: "builder", order: "/o.md", worktree: dir }, env);
    expect(r.branch).toBeNull();
    expect(r.base_sha).toBe(sha);
  });
  it("flags win over git, and budget must be a JSON object", () => {
    const r = createRun({ ticket: "DGS-581", role: "reviewer", order: "/o.md", branch: "b", baseSha: "abc", budget: '{"turns":50}', workspace: "w2", tab: "T", pane: "p1" }, env);
    expect(r.branch).toBe("b");
    expect(r.base_sha).toBe("abc");
    expect(r.budget).toEqual({ turns: 50 });
    expect(r.herdr).toEqual({ workspace: "w2", tab: "T", pane: "p1" });
    expect(() => createRun({ ticket: "DGS-581", role: "builder", order: "/o.md", budget: "[1]" }, env)).toThrow(/budget/);
  });
  it("gives a new id for every start, even in the same second", () => {
    const now = new Date("2026-10-21T13:30:05Z");
    const ids = new Set(Array.from({ length: 20 }, () => createRun({ ticket: "DGS-581", role: "builder", order: "/o.md" }, env, now).run));
    expect(ids.size).toBe(20);
  });
  it("refuses a bad key or role", () => {
    expect(() => createRun({ ticket: "../x", role: "builder", order: "/o.md" }, env)).toThrow(/ticket/);
    expect(() => createRun({ ticket: "DGS-1", role: "boss", order: "/o.md" }, env)).toThrow(/role/);
    expect(fs.existsSync(runsDir(env))).toBe(false);
  });
});

describe("findRunDir", () => {
  it("returns null for an unknown or unsafe id", () => {
    expect(findRunDir("builder-x-000000", env)).toBeNull();
    expect(findRunDir("../etc", env)).toBeNull();
  });
});

describe("DGS-598 fields", () => {
  it("dg run start writes source start, role_from start, session_id null and the project", () => {
    const r = createRun({ ticket: "DGS-598", role: "conductor", order: "/o.md" }, env);
    expect(r).toMatchObject({ source: "start", role_from: "start", session_id: null, role: "conductor" });
    expect(typeof r.project).toBe("string");
  });
  it("accepts maestro and conductor", () => {
    expect(ROLES).toEqual(["builder", "reviewer", "scout", "maestro", "conductor", "other"]);
    expect(createRun({ ticket: "DGS-598", role: "maestro", order: "/o.md" }, env).role).toBe("maestro");
  });
  it("readRun fills the new fields of an old record", () => {
    const dir = path.join(tmp, "runs", "DGS-1", "builder-old");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "run.json"), JSON.stringify({ schema: "nightwatch-run/v1", run: "builder-old", ticket: "DGS-1", role: "builder", order: null, seat: null, model: null, plugin_version: null, base_sha: null, branch: null, worktree: null, herdr: { workspace: null, tab: null, pane: null }, budget: null, created_at: "2026-10-20T00:00:00.000Z" }));
    expect(readRun(dir)).toMatchObject({ source: "start", project: null, session_id: null, role_from: null, ticket: "DGS-1" });
  });
  it("rewriteRun replaces run.json in one rename and leaves no temp file", () => {
    const r = createRun({ ticket: "DGS-598", role: "other", order: "/o.md" }, env);
    const dir = path.join(tmp, "runs", "DGS-598", r.run);
    rewriteRun(dir, { ...r, role: "builder" });
    expect(readRun(dir).role).toBe("builder");
    expect(fs.readdirSync(dir).filter((f) => f.startsWith("run.json."))).toEqual([]);
  });
});

describe("rewriteRun failure", () => {
  it("throws and leaves no temp file when the rename fails", () => {
    const r = createRun({ ticket: "DGS-598", role: "other", order: "/o.md" }, env);
    const dir = path.join(tmp, "runs", "DGS-598", r.run);
    fs.rmSync(path.join(dir, "run.json"));
    fs.mkdirSync(path.join(dir, "run.json"));
    fs.writeFileSync(path.join(dir, "run.json", "keep"), "x");
    expect(() => rewriteRun(dir, r)).toThrow();
    expect(fs.readdirSync(dir).filter((f) => f.startsWith("run.json.") && f.endsWith(".tmp"))).toEqual([]);
  });
});
