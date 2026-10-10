import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findTranscript, inferSessionsForTicket } from "./attribution.ts";

function project(root: string, name: string) {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function session(dir: string, sid: string, opts: { title?: string; branch?: string; cwd?: string }) {
  writeFileSync(
    join(dir, `${sid}.jsonl`),
    JSON.stringify({ type: "user", sessionId: sid, gitBranch: opts.branch ?? "main", cwd: opts.cwd ?? "/x" }) + "\n",
  );
  if (opts.title) {
    mkdirSync(join(dir, sid), { recursive: true });
    writeFileSync(join(dir, sid, "custom-title.json"), JSON.stringify({ customTitle: opts.title }));
  }
}

describe("attribution", () => {
  it("finds a transcript by session id in any project folder", () => {
    const root = mkdtempSync(join(tmpdir(), "proj-"));
    session(project(root, "-a"), "s-1", {});
    session(project(root, "-b"), "s-2", {});
    expect(findTranscript("s-2", root)).toBe(join(root, "-b", "s-2.jsonl"));
    expect(findTranscript("nope", root)).toBeNull();
  });

  it("infers a ticket's sessions from title, branch and cwd", () => {
    const root = mkdtempSync(join(tmpdir(), "proj-"));
    const p = project(root, "-a");
    session(p, "by-title", { title: "DGS-214 ⚚ Token counter" });
    session(p, "by-branch", { branch: "DGS-214__count-tokens" });
    session(p, "by-lower-branch", { branch: "dgs-214" });
    session(p, "by-lower-slug-branch", { branch: "dgs-214-count-tokens" });
    session(p, "by-cwd", { cwd: "/w/.worktrees/DGS-214__count-tokens" });
    session(p, "by-lower-cwd", { cwd: "/w/.worktrees/dgs-214" });
    session(p, "other-ticket", { title: "DGS-2140 ⚚ Other", branch: "DGS-2140__x" });
    session(p, "other-lower", { branch: "dgs-2140-x", cwd: "/w/.worktrees/dgs-2140" });
    session(p, "shorter-key", { branch: "DGS-21__x" });
    session(p, "unrelated", {});
    expect(inferSessionsForTicket("DGS-214", root).sort()).toEqual([
      "by-branch", "by-cwd", "by-lower-branch", "by-lower-cwd", "by-lower-slug-branch", "by-title",
    ]);
  });

  it("only the first gitBranch and first cwd line decide the match", () => {
    const root = mkdtempSync(join(tmpdir(), "proj-"));
    const p = project(root, "-a");
    const lines = [
      { type: "user", gitBranch: "main", cwd: "/w/other" },
      { type: "user", gitBranch: "DGS-214__later", cwd: "/w/.worktrees/dgs-214" },
    ];
    writeFileSync(join(p, "late-branch.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
    expect(inferSessionsForTicket("DGS-214", root)).toEqual([]);
  });
});
