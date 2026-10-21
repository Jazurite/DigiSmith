import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { realGit } from "../autonomous/gitx.ts";
import { salvage, type SalvageDeps } from "./salvage.ts";

const sh = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
let root: string, origin: string, repo: string, wt: string, depot: string;
const mk = (over: Partial<SalvageDeps> = {}): SalvageDeps => ({
  git: realGit, repo, depotDir: depot, now: () => new Date("2026-10-22T03:04:05Z"),
  statSize: (p) => statSync(p).size, ...over,
});
const bundles = () => (existsSync(join(depot, "salvage")) ? readdirSync(join(depot, "salvage")) : []);
const rescue = () => sh(origin, "branch", "--list", "rescue/*");

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "salvage-"));
  origin = join(root, "origin.git"); repo = join(root, "repo"); wt = join(root, "wt"); depot = join(root, "depot");
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", origin]);
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  for (const [k, v] of [["user.email", "t@t"], ["user.name", "t"]]) sh(repo, "config", k, v);
  writeFileSync(join(repo, "a.txt"), "a\n"); sh(repo, "add", "."); sh(repo, "commit", "-qm", "init");
  sh(repo, "remote", "add", "origin", origin); sh(repo, "push", "-q", "origin", "main");
  sh(repo, "worktree", "add", "-q", "-b", "DGS-9__x", wt, "main");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("salvage", () => {
  it("clean and merged: nothing to salvage, no bundle", () => {
    const r = salvage(mk(), { ticket: "DGS-9" });
    expect(r).toMatchObject({ ok: true, bundle: null });
    expect(bundles()).toEqual([]);
  });
  it("dirty tree: WIP commit, verified bundle, rescue branch on origin", () => {
    writeFileSync(join(wt, "new.ts"), "x\n");
    const r = salvage(mk(), { ticket: "DGS-9" });
    expect(r.ok).toBe(true);
    expect(sh(wt, "log", "-1", "--format=%s")).toBe("wip(dgs-9): salvage before teardown");
    expect(bundles()).toEqual(["DGS-9-20261022T030405Z.bundle"]);
    sh(repo, "bundle", "verify", join(depot, "salvage", bundles()[0]));
    expect(rescue()).toContain("rescue/DGS-9");
  });
  it("clean but unmerged: no WIP commit, bundle and push still happen", () => {
    writeFileSync(join(wt, "n.ts"), "x\n"); sh(wt, "add", "."); sh(wt, "commit", "-qm", "feat: n");
    const before = sh(wt, "rev-parse", "HEAD");
    expect(salvage(mk(), { ticket: "DGS-9" }).ok).toBe(true);
    expect(sh(wt, "rev-parse", "HEAD")).toBe(before);
    expect(rescue()).toContain("rescue/DGS-9");
  });
  it.each([".env", "cert.pem", "id.key", "my-secret.txt", "api-token.json"])("a secret file %s stops everything", (name) => {
    writeFileSync(join(wt, name), "s\n");
    const before = sh(wt, "rev-parse", "HEAD");
    const r = salvage(mk(), { ticket: "DGS-9" });
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.message).toBe(`not salvaged: ${name}`);
    expect(sh(wt, "rev-parse", "HEAD")).toBe(before);
    expect(bundles()).toEqual([]);
    expect(rescue()).toBe("");
  });
  it("a file over 5 MB stops everything", () => {
    writeFileSync(join(wt, "big.bin"), Buffer.alloc(5 * 1024 * 1024 + 1));
    const r = salvage(mk(), { ticket: "DGS-9" });
    expect(!r.ok && r.message).toBe("not salvaged: big.bin");
    expect(rescue()).toBe("");
  });
  it("a rejected push is a failure and leaves no rescue branch", () => {
    writeFileSync(join(wt, "n.ts"), "x\n");
    mkdirSync(join(origin, "hooks"), { recursive: true });
    writeFileSync(join(origin, "hooks", "pre-receive"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    const r = salvage(mk(), { ticket: "DGS-9" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toMatch(/push/);
    expect(rescue()).toBe("");
  });
  it("two worktrees for the key: stop", () => {
    sh(repo, "worktree", "add", "-q", "-b", "DGS-9__y", join(root, "wt2"), "main");
    const r = salvage(mk(), { ticket: "DGS-9" });
    expect(r.ok).toBe(false);
  });
  it("dry run changes nothing", () => {
    writeFileSync(join(wt, "new.ts"), "x\n");
    const before = sh(wt, "rev-parse", "HEAD");
    const r = salvage(mk(), { ticket: "DGS-9", dryRun: true });
    expect(r.ok && r.steps.every((s) => s.startsWith("would "))).toBe(true);
    expect(sh(wt, "rev-parse", "HEAD")).toBe(before);
    expect(bundles()).toEqual([]);
    expect(rescue()).toBe("");
  });
});
