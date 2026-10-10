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

function session(dir: string, sid: string, opts: { title?: string; agent?: string; branch?: string; cwd?: string }) {
  const lines: object[] = [{ type: "user", sessionId: sid, gitBranch: opts.branch ?? "main", cwd: opts.cwd ?? "/x" }];
  if (opts.title) lines.splice(0, 0, { type: "custom-title", customTitle: opts.title, sessionId: sid });
  if (opts.agent) lines.splice(0, 0, { type: "agent-name", agentName: opts.agent, sessionId: sid });
  writeFileSync(join(dir, `${sid}.jsonl`), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
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

  it("matches a title line that is not the first and a title repeated later", () => {
    const root = mkdtempSync(join(tmpdir(), "proj-"));
    const p = project(root, "-a");
    const lines = [
      { type: "user", gitBranch: "main", cwd: "/x" },
      { type: "custom-title", customTitle: "placeholder" },
      { type: "user", gitBranch: "main", cwd: "/x" },
      { type: "custom-title", customTitle: "DGS-214 placeholder" },
    ];
    writeFileSync(join(p, "late-title.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
    expect(inferSessionsForTicket("DGS-214", root)).toEqual(["late-title"]);
  });

  it("matches an agent-name line by key and rejects other keys", () => {
    const root = mkdtempSync(join(tmpdir(), "proj-"));
    const p = project(root, "-a");
    session(p, "agent-ok", { agent: "dgs-214" });
    session(p, "agent-other", { agent: "dgs-2140" });
    expect(inferSessionsForTicket("DGS-214", root)).toEqual(["agent-ok"]);
  });

  it("matches a later gitBranch or cwd line (start on main in the repo root, move to the worktree)", () => {
    const root = mkdtempSync(join(tmpdir(), "proj-"));
    const p = project(root, "-a");
    const move = [
      { type: "user", gitBranch: "main", cwd: "/w" },
      { type: "user", gitBranch: "main", cwd: "/w/.worktrees/dgs-214" },
    ];
    const branch = [
      { type: "user", gitBranch: "main", cwd: "/w" },
      { type: "user", gitBranch: "dgs-214", cwd: "/w" },
    ];
    writeFileSync(join(p, "moved-cwd.jsonl"), move.map((l) => JSON.stringify(l)).join("\n") + "\n");
    writeFileSync(join(p, "moved-branch.jsonl"), branch.map((l) => JSON.stringify(l)).join("\n") + "\n");
    expect(inferSessionsForTicket("DGS-214", root).sort()).toEqual(["moved-branch", "moved-cwd"]);
  });
});
