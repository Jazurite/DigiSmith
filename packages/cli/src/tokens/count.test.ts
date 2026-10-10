import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
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
});
