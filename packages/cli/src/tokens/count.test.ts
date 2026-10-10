import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { countTicket, renderTable, resolveSnapshotPath } from "./count.ts";
import { createDepotRegistry } from "./registry.ts";

function fixture() {
  const projects = mkdtempSync(join(tmpdir(), "proj-"));
  const dir = join(projects, "-a");
  mkdirSync(dir, { recursive: true });
  const sid = "sess-1";
  writeFileSync(
    join(dir, `${sid}.jsonl`),
    [
      JSON.stringify({ type: "user", sessionId: sid, gitBranch: "T-1__x", cwd: "/w" }),
      JSON.stringify({
        type: "assistant", sessionId: sid, requestId: "r1", timestamp: "2026-10-10T01:00:00Z",
        message: { id: "m1", model: "claude-opus-5-5", usage: { input_tokens: 2, output_tokens: 10, cache_read_input_tokens: 100, cache_creation_input_tokens: 30, cache_creation: { ephemeral_5m_input_tokens: 10, ephemeral_1h_input_tokens: 20 } } },
      }),
    ].join("\n"),
  );
  return { projects, sid };
}

describe("countTicket", () => {
  it("counts a session found only by fallback tagging", () => {
    const { projects } = fixture();
    const reg = createDepotRegistry(mkdtempSync(join(tmpdir(), "reg-")));
    const snap = countTicket({ ticket: "T-1", registry: reg, projectsDir: projects, now: () => "2026-10-10T05:00:00Z" });
    expect(snap.sessions[0]).toMatchObject({ session_id: "sess-1", attribution: "inferred" });
    expect(snap.steps.other["claude-opus-5-5"]).toMatchObject({ input: 2, output: 10, responses: 1 });
  });

  it("counts a replayed response once when a resumed transcript repeats an earlier session", () => {
    const { projects, sid } = fixture();
    const dir = join(projects, "-a");
    const resumed = "sess-2";
    // The resumed file replays the earlier response under the old session id, then adds one of its own.
    writeFileSync(
      join(dir, `${resumed}.jsonl`),
      [
        JSON.stringify({ type: "user", sessionId: sid, gitBranch: "T-1__x", cwd: "/w" }),
        JSON.stringify({
          type: "assistant", sessionId: sid, requestId: "r1", timestamp: "2026-10-10T01:00:00Z",
          message: { id: "m1", model: "claude-opus-5-5", usage: { input_tokens: 2, output_tokens: 10, cache_read_input_tokens: 100, cache_creation_input_tokens: 30, cache_creation: { ephemeral_5m_input_tokens: 10, ephemeral_1h_input_tokens: 20 } } },
        }),
        JSON.stringify({
          type: "assistant", sessionId: resumed, requestId: "r2", timestamp: "2026-10-10T02:00:00Z",
          message: { id: "m2", model: "claude-opus-5-5", usage: { input_tokens: 1, output_tokens: 7, cache_read_input_tokens: 5, cache_creation_input_tokens: 0 } },
        }),
      ].join("\n"),
    );
    const reg = createDepotRegistry(mkdtempSync(join(tmpdir(), "reg-")));
    const snap = countTicket({ ticket: "T-1", registry: reg, projectsDir: projects, now: () => "t" });
    expect(snap.steps.other["claude-opus-5-5"]).toMatchObject({ input: 3, output: 17, responses: 2 });
    expect(snap.unattributed).toEqual({});
  });

  it("credits replayed responses to their own session whatever the read order", () => {
    const projects = mkdtempSync(join(tmpdir(), "proj-"));
    const dir = join(projects, "-a");
    mkdirSync(dir, { recursive: true });
    const mk = (sid: string, req: string, out: number, ts: string) =>
      JSON.stringify({
        type: "assistant", sessionId: sid, requestId: req, timestamp: ts,
        message: { id: `m-${req}`, model: "claude-opus-5-5", usage: { input_tokens: 1, output_tokens: out, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
      });
    const head = (sid: string) => JSON.stringify({ type: "user", sessionId: sid, gitBranch: "T-1__x", cwd: "/w" });
    // A (original) sorts after B (resumed) so B is read first.
    writeFileSync(join(dir, "zzz-A.jsonl"), [head("zzz-A"), mk("zzz-A", "r1", 10, "2026-10-10T01:00:00Z")].join("\n"));
    writeFileSync(join(dir, "aaa-B.jsonl"), [head("aaa-B"), mk("zzz-A", "r1", 10, "2026-10-10T01:00:00Z"), mk("aaa-B", "r2", 7, "2026-10-10T02:00:00Z")].join("\n"));
    const reg = createDepotRegistry(mkdtempSync(join(tmpdir(), "reg-")));
    reg.append({ kind: "session", ticket: "T-1", session_id: "aaa-B", source: "claude-code", role: "worker", ts: "2026-10-10T00:00:00Z" });
    reg.append({ kind: "session", ticket: "T-1", session_id: "zzz-A", source: "claude-code", role: "worker", ts: "2026-10-10T00:00:00Z" });
    reg.append({ kind: "step_start", ticket: "T-1", step: "brainstorming", session_id: "zzz-A", ts: "2026-10-10T00:30:00Z" });
    const snap = countTicket({ ticket: "T-1", registry: reg, projectsDir: projects, now: () => "t" });
    expect(snap.steps.brainstorming["claude-opus-5-5"]).toMatchObject({ output: 10, responses: 1 });
    expect(snap.steps.other["claude-opus-5-5"]).toMatchObject({ output: 7, responses: 1 });
    expect(snap.unattributed).toEqual({});
  });

  it.each([["A first", ["zzz-A", "aaa-B"]], ["B first", ["aaa-B", "zzz-A"]]])("keeps the larger copy of a replayed response and its owning session (%s)", (_label, order) => {
    const projects = mkdtempSync(join(tmpdir(), "proj-"));
    const dir = join(projects, "-a");
    mkdirSync(dir, { recursive: true });
    const mk = (sid: string, req: string, out: number, ts: string) =>
      JSON.stringify({
        type: "assistant", sessionId: sid, requestId: req, timestamp: ts,
        message: { id: `m-${req}`, model: "claude-opus-5-5", usage: { input_tokens: 1, output_tokens: out, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
      });
    const head = (sid: string) => JSON.stringify({ type: "user", sessionId: sid, gitBranch: "T-1__x", cwd: "/w" });
    writeFileSync(join(dir, "zzz-A.jsonl"), [head("zzz-A"), mk("zzz-A", "r1", 5, "2026-10-10T01:00:00Z")].join("\n"));
    writeFileSync(join(dir, "aaa-B.jsonl"), [head("aaa-B"), mk("zzz-A", "r1", 20, "2026-10-10T01:00:00Z")].join("\n"));
    const reg = createDepotRegistry(mkdtempSync(join(tmpdir(), "reg-")));
    for (const sid of order) reg.append({ kind: "session", ticket: "T-1", session_id: sid, source: "claude-code", role: "worker", ts: "2026-10-10T00:00:00Z" });
    reg.append({ kind: "step_start", ticket: "T-1", step: "brainstorming", session_id: "zzz-A", ts: "2026-10-10T00:30:00Z" });
    const snap = countTicket({ ticket: "T-1", registry: reg, projectsDir: projects, now: () => "t" });
    expect(snap.steps.brainstorming["claude-opus-5-5"]).toMatchObject({ output: 20, responses: 1 });
    expect(snap.unattributed).toEqual({});
  });

  it("prefers the registry entry and its step windows", () => {
    const { projects, sid } = fixture();
    const reg = createDepotRegistry(mkdtempSync(join(tmpdir(), "reg-")));
    reg.append({ kind: "session", ticket: "T-1", session_id: sid, source: "claude-code", role: "worker", ts: "2026-10-10T00:00:00Z" });
    reg.append({ kind: "step_start", ticket: "T-1", step: "brainstorming", session_id: sid, ts: "2026-10-10T00:30:00Z" });
    const snap = countTicket({ ticket: "T-1", registry: reg, projectsDir: projects, now: () => "t" });
    expect(snap.sessions).toEqual([{ session_id: sid, role: "worker", attribution: "registry" }]);
    expect(snap.steps.brainstorming["claude-opus-5-5"].responses).toBe(1);
  });
});

describe("renderTable", () => {
  it("prints one row per step and model with the five token classes", () => {
    const { projects } = fixture();
    const reg = createDepotRegistry(mkdtempSync(join(tmpdir(), "reg-")));
    const text = renderTable(countTicket({ ticket: "T-1", registry: reg, projectsDir: projects, now: () => "t" }));
    expect(text).toContain("other");
    expect(text).toContain("claude-opus-5-5");
    expect(text).toMatch(/input\s+output\s+cache_read\s+cache_w5m\s+cache_w1h/);
  });
});

describe("resolveSnapshotPath", () => {
  it("uses the board folder in DigiSmith's own repo", () => {
    const repo = mkdtempSync(join(tmpdir(), "repo-"));
    mkdirSync(join(repo, ".claude-plugin"), { recursive: true });
    writeFileSync(join(repo, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "digismith" }));
    mkdirSync(join(repo, ".digismith", "board", "DGS-214—count-tokens"), { recursive: true });
    expect(resolveSnapshotPath(repo, "DGS-214")).toBe(join(repo, ".digismith", "board", "DGS-214—count-tokens", "tokens.json"));
  });

  it("uses the depot in any other repo, never the repo's git", () => {
    const repo = mkdtempSync(join(tmpdir(), "client-"));
    const depot = mkdtempSync(join(tmpdir(), "depot-"));
    process.env.DIGISMITH_TOKEN_REGISTRY_DIR = depot;
    try {
      expect(resolveSnapshotPath(repo, "EMKT-9")).toBe(join(depot, "EMKT-9.tokens.json"));
    } finally {
      delete process.env.DIGISMITH_TOKEN_REGISTRY_DIR;
    }
  });

  describe("with real git repos", () => {
    const git = (cwd: string, ...args: string[]) => {
      const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf-8" });
      if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
    };
    function makeRepo(name: string) {
      const repo = realpathSync(mkdtempSync(join(tmpdir(), "gitrepo-")));
      git(repo, "init", "-q", "-b", "main");
      mkdirSync(join(repo, ".claude-plugin"), { recursive: true });
      writeFileSync(join(repo, ".claude-plugin", "plugin.json"), JSON.stringify({ name }));
      mkdirSync(join(repo, "packages", "cli"), { recursive: true });
      writeFileSync(join(repo, "packages", "cli", "x.txt"), "x");
      git(repo, "add", "-A");
      git(repo, "commit", "-q", "-m", "init");
      return repo;
    }
    function withDepot<T>(fn: (depot: string) => T): T {
      const depot = mkdtempSync(join(tmpdir(), "depot-"));
      process.env.DIGISMITH_TOKEN_REGISTRY_DIR = depot;
      try {
        return fn(depot);
      } finally {
        delete process.env.DIGISMITH_TOKEN_REGISTRY_DIR;
      }
    }

    it("finds the board folder from a nested directory of the checkout", () => {
      const repo = makeRepo("digismith");
      mkdirSync(join(repo, ".digismith", "board", "DGS-214—count-tokens"), { recursive: true });
      withDepot(() => {
        expect(resolveSnapshotPath(join(repo, "packages", "cli"), "DGS-214")).toBe(
          join(repo, ".digismith", "board", "DGS-214—count-tokens", "tokens.json"),
        );
      });
    });

    it("uses the main checkout's board folder from a linked worktree", () => {
      const repo = makeRepo("digismith");
      mkdirSync(join(repo, ".digismith", "board", "DGS-214—count-tokens"), { recursive: true });
      const wt = join(repo, ".worktrees", "dgs-214");
      git(repo, "worktree", "add", "-q", "-b", "dgs-214", wt);
      withDepot(() => {
        const want = join(repo, ".digismith", "board", "DGS-214—count-tokens", "tokens.json");
        expect(resolveSnapshotPath(wt, "DGS-214")).toBe(want);
        expect(resolveSnapshotPath(join(wt, "packages", "cli"), "DGS-214")).toBe(want);
      });
    });

    it("uses the depot for a DigiSmith repo with no board folder for the ticket", () => {
      const repo = makeRepo("digismith");
      withDepot((depot) => {
        expect(resolveSnapshotPath(repo, "DGS-999")).toBe(join(depot, "DGS-999.tokens.json"));
      });
    });

    it("uses the depot in a non-DigiSmith repo, never the repo", () => {
      const repo = makeRepo("client");
      mkdirSync(join(repo, ".digismith", "board", "EMKT-9—x"), { recursive: true });
      withDepot((depot) => {
        expect(resolveSnapshotPath(join(repo, "packages", "cli"), "EMKT-9")).toBe(join(depot, "EMKT-9.tokens.json"));
      });
    });

    it("uses the depot outside any git repo", () => {
      const dir = mkdtempSync(join(tmpdir(), "nogit-"));
      withDepot((depot) => {
        expect(resolveSnapshotPath(dir, "DGS-214")).toBe(join(depot, "DGS-214.tokens.json"));
      });
    });
  });
});
