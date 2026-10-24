import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runTokensPass } from "./runs.ts";
import { writeTranscript } from "./fixtures.test-util.ts";

let depot: string, projects: string;
const now = new Date("2026-10-24T09:02:00.000Z");
beforeEach(() => { depot = mkdtempSync(join(tmpdir(), "auto-depot-")); projects = mkdtempSync(join(tmpdir(), "auto-proj-")); });
afterEach(() => { rmSync(depot, { recursive: true, force: true }); rmSync(projects, { recursive: true, force: true }); });

describe("an automatic run (DGS-598)", () => {
  it("counts both sessions of a run that went through /clear, and ignores .index", () => {
    const run = "s-aaaa1111-0000-4000-8000-000000000001";
    const dir = join(depot, "runs", "DigiSmith", run);
    mkdirSync(dir, { recursive: true });
    mkdirSync(join(depot, "runs", ".index", "sessions"), { recursive: true });
    writeFileSync(join(depot, "runs", ".index", "sessions", "aaaa1111-0000-4000-8000-000000000001"), `DigiSmith/${run}\n`);
    writeFileSync(join(dir, "run.json"), JSON.stringify({ schema: "nightwatch-run/v1", run, ticket: null, role: "maestro", source: "auto", project: "DigiSmith", session_id: "aaaa1111-0000-4000-8000-000000000001", role_from: "identity", order: null, seat: null, model: null, plugin_version: null, base_sha: null, branch: null, worktree: null, herdr: { workspace: null, tab: null, pane: null }, budget: null, created_at: "2026-10-24T08:00:00.000Z" }));
    const ev = (seq: number, ts: string, type: string, data: object) => JSON.stringify({ schema: "nightwatch-event/v1", seq, ts, run, type, data }) + "\n";
    writeFileSync(join(dir, "events.jsonl"),
      ev(1, "2026-10-24T08:00:00.000Z", "started", { source: "startup", session_id: "aaaa1111-0000-4000-8000-000000000001" }) +
      ev(2, "2026-10-24T08:20:00.000Z", "ended", { reason: "clear", session_id: "aaaa1111-0000-4000-8000-000000000001" }) +
      ev(3, "2026-10-24T08:20:01.000Z", "started", { source: "clear", session_id: "bbbb2222-0000-4000-8000-000000000002" }));
    writeTranscript(projects, "aaaa1111-0000-4000-8000-000000000001", [{ id: "m1", req: "r1", ts: "2026-10-24T08:10:00.000Z", output: 5 }]);
    writeTranscript(projects, "bbbb2222-0000-4000-8000-000000000002", [{ id: "m2", req: "r2", ts: "2026-10-24T08:30:00.000Z", output: 7 }]);
    const r = runTokensPass({ env: { DIGISMITH_DEPOT_DIR: depot }, now, projectsDir: projects });
    expect(r).toMatchObject({ updated: 1, failed: 0 });
    const t = JSON.parse(readFileSync(join(dir, "tokens.json"), "utf8"));
    expect(t).toMatchObject({ sessions: 2, final: false, total: { responses: 2 } });
    expect(t.models["claude-opus-5-5"].output).toBe(12); // 5 + 7 across both sessions
    expect(t.total.tokens).toBe(12);
  });
});
