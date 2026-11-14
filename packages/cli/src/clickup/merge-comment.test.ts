import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createMergeCommentCommand, gatherGit } from "./merge-comment.ts";
import { readPosted } from "../tokens/comments-store.ts";
import { recordAttached } from "../tokens/attachments-store.ts";

const git = (cwd: string, ...a: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd, encoding: "utf8" }).trim();

let dir: string, repo: string, base: string, head: string, prevRegistry: string | undefined;
beforeEach(() => {
  prevRegistry = process.env.DIGISMITH_TOKEN_REGISTRY_DIR;
  dir = mkdtempSync(join(tmpdir(), "dg178-"));
  process.env.DIGISMITH_TOKEN_REGISTRY_DIR = join(dir, "registry");
  repo = join(dir, "repo");
  mkdirSync(join(repo, ".claude-plugin"), { recursive: true });
  git(repo, "init", "-q", "-b", "main");
  writeFileSync(join(repo, "a.txt"), "1");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "chore: first");
  base = git(repo, "rev-parse", "HEAD");
  writeFileSync(join(repo, "a.txt"), "2");
  git(repo, "commit", "-q", "-am", "feat: second");
  head = git(repo, "rev-parse", "HEAD");
  writeFileSync(join(repo, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "digismith", version: "9.9.9" }));
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "chore: bump plugin version");
});
afterEach(() => {
  if (prevRegistry === undefined) delete process.env.DIGISMITH_TOKEN_REGISTRY_DIR;
  else process.env.DIGISMITH_TOKEN_REGISTRY_DIR = prevRegistry;
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
  process.exitCode = 0;
});

const out = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.flat().join("\n");
const run = (c: { handler: unknown }, argv: Record<string, unknown>) => (c.handler as (a: Record<string, unknown>) => Promise<void>)(argv);
const mockClient = () =>
  ({
    getTaskByRef: vi.fn().mockResolvedValue({ id: "t1", custom_id: "DGS-5", name: "n" }),
    addTaskComment: vi.fn().mockResolvedValue({ id: 91 }),
    getTaskComments: vi.fn().mockResolvedValue([{ id: "91" }]),
  }) as unknown as ClickUpClient & { addTaskComment: ReturnType<typeof vi.fn> };

describe("gatherGit", () => {
  it("lists commits in the range, resolves full shas and reads the plugin version at HEAD, not at --head, on purpose", () => {
    const g = gatherGit(repo, base.slice(0, 7), head.slice(0, 7));
    expect(g.base).toBe(base);
    expect(g.head).toBe(head);
    expect(g.commits.map((c) => c.subject)).toEqual(["feat: second"]);
    expect(g.version).toBe("9.9.9");
  });
  it("leaves the version undefined with no plugin.json at HEAD", () => {
    const solo = join(dir, "solo");
    mkdirSync(solo);
    git(solo, "init", "-q", "-b", "main");
    writeFileSync(join(solo, "f"), "x");
    git(solo, "add", "-A");
    git(solo, "commit", "-q", "-m", "x");
    const h = git(solo, "rev-parse", "HEAD");
    expect(gatherGit(solo, h, h).version).toBeUndefined();
  });
  it("accepts an uppercase sha and resolves the same full sha", () => {
    const g = gatherGit(repo, ` ${base.slice(0, 7).toUpperCase()} `, head.toUpperCase());
    expect(g.base).toBe(base);
    expect(g.head).toBe(head);
  });
  it("refuses a ref that is not a hex sha", () => {
    expect(() => gatherGit(repo, "main; rm", head)).toThrow("not a commit sha");
    expect(() => gatherGit(repo, " NOPE ", head)).toThrow('" NOPE " is not a commit sha');
  });
});

describe("merge-comment command", () => {
  const argv = () => ({ task: "DGS-5", base, head, tests: "12 passed", decisions: "one", next: "none", splitOff: "none" });

  it("skips a non-ClickUp key without a network call", async () => {
    const c = mockClient();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(createMergeCommentCommand(() => c, () => repo), { ...argv(), task: "EMKT-9", yes: true });
    expect(out(log)).toContain("not a ClickUp key, skipped");
    expect(c.addTaskComment).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
  });
  it("dry run prints the comment and sends nothing, with no client built", async () => {
    const factory = vi.fn();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(createMergeCommentCommand(factory as never, () => repo), argv());
    expect(factory).not.toHaveBeenCalled();
    expect(out(log)).toContain("DGS-5 merged,");
    expect(out(log)).toContain("plugin 9.9.9");
    expect(out(log)).toContain("nothing sent; add --yes to send");
  });
  it("posts once with --yes, records the head, and a second run skips", async () => {
    const c = mockClient();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const cmd = createMergeCommentCommand(() => c, () => repo);
    await run(cmd, { ...argv(), yes: true });
    expect(c.addTaskComment).toHaveBeenCalledTimes(1);
    expect(String(c.addTaskComment.mock.calls[0][1])).toContain("Tests: 12 passed");
    expect(readPosted("DGS-5")[0].head).toBe(head);
    await run(cmd, { ...argv(), yes: true });
    expect(c.addTaskComment).toHaveBeenCalledTimes(1);
    expect(out(log)).toContain("skipped: already posted");
  });
  it("adds the report line only when report.html is recorded as attached", async () => {
    const folder = join(dir, "board");
    mkdirSync(folder);
    writeFileSync(join(folder, "report.html"), "<p>r</p>");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(createMergeCommentCommand(() => mockClient(), () => repo), { ...argv(), boardFolder: folder });
    expect(out(log)).not.toContain("Report:");
    recordAttached("DGS-5", { name: "report.html", sha256: "x", id: "a1", attached_at: "t" });
    log.mockClear();
    await run(createMergeCommentCommand(() => mockClient(), () => repo), { ...argv(), boardFolder: folder });
    expect(out(log)).toContain("Report: report.html is attached to this ticket.");
  });
  it("a post failure prints a warn: line, exits 1 and records nothing", async () => {
    const c = mockClient();
    (c.addTaskComment as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("429"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(createMergeCommentCommand(() => c, () => repo), { ...argv(), yes: true });
    expect(out(err)).toMatch(/^warn: merge-comment: 429/m);
    expect(process.exitCode).toBe(1);
    expect(readPosted("DGS-5")).toEqual([]);
  });
  it("POST ok but read-back fails: records the head with the id, warn keeps its text, a rerun skips", async () => {
    const c = mockClient();
    (c.getTaskComments as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const cmd = createMergeCommentCommand(() => c, () => repo);
    await run(cmd, { ...argv(), yes: true });
    expect(out(err)).toMatch(/^warn: merge-comment: sent \(comment 91\), but the read-back failed: boom/m);
    expect(process.exitCode).toBe(1);
    expect(readPosted("DGS-5")).toEqual([expect.objectContaining({ head, id: "91" })]);
    process.exitCode = 0;
    await run(cmd, { ...argv(), yes: true });
    expect(out(log)).toContain("skipped: already posted");
    expect(c.addTaskComment).toHaveBeenCalledTimes(1);
  });
  it("POST ok but read-back misses the comment: records the head with the id", async () => {
    const c = mockClient();
    (c.getTaskComments as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await run(createMergeCommentCommand(() => c, () => repo), { ...argv(), yes: true });
    expect(process.exitCode).toBe(1);
    expect(readPosted("DGS-5")).toEqual([expect.objectContaining({ head, id: "91" })]);
  });
  it("a bad sha prints a warn: line and exits 1", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(createMergeCommentCommand(() => mockClient(), () => repo), { ...argv(), base: "nope" });
    expect(out(err)).toMatch(/^warn: merge-comment:/m);
    expect(process.exitCode).toBe(1);
  });
  it("passes --part to the headline", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(createMergeCommentCommand(() => mockClient(), () => repo), { ...argv(), part: "Part 2 of 3" });
    expect(out(log)).toContain("DGS-5 part merged,");
    expect(out(log)).toContain("Part 2 of 3.");
  });
  it("records a numeric client id as a string", async () => {
    const c = mockClient();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run(createMergeCommentCommand(() => c, () => repo), { ...argv(), yes: true });
    expect(readPosted("DGS-5")[0].id).toBe("91");
  });
  it("post ok but depot record fails: warn names the comment id, exits 1", async () => {
    const blocker = join(dir, "blocker");
    writeFileSync(blocker, "x");
    process.env.DIGISMITH_TOKEN_REGISTRY_DIR = join(blocker, "sub");
    const c = mockClient();
    vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(createMergeCommentCommand(() => c, () => repo), { ...argv(), yes: true });
    expect(c.addTaskComment).toHaveBeenCalledTimes(1);
    expect(out(err)).toMatch(/^warn: merge-comment: posted comment 91 .*a rerun posts a copy/m);
    expect(process.exitCode).toBe(1);
  });
});
