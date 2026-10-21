import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPhaseState, writePhaseState } from "./phase-state.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "nw-state-"));
const base = { ticket: "DGS-1", taskId: "t1", claimedAt: "2026-10-21T00:00:00.000Z", order: "o.md", scanId: "s1" };

describe("phase state", () => {
  it("no lock file reads as none", () => {
    expect(readPhaseState(tmp())).toEqual({ kind: "none" });
  });
  it("an old lock without phase fields reads as claimed, attempt 1", () => {
    const d = tmp();
    writeFileSync(join(d, "lock.json"), JSON.stringify(base));
    expect(readPhaseState(d)).toEqual({ kind: "ok", state: {
      ticket: "DGS-1", claimedAt: base.claimedAt, phase: "claimed", phaseStartedAt: base.claimedAt, attempt: 1, runs: { builder: null } } });
  });
  it("garbage, or a bad ticket key, reads as corrupt", () => {
    const d = tmp();
    writeFileSync(join(d, "lock.json"), "not json");
    expect(readPhaseState(d)).toEqual({ kind: "corrupt" });
    writeFileSync(join(d, "lock.json"), JSON.stringify({ ...base, ticket: "rm -rf" }));
    expect(readPhaseState(d)).toEqual({ kind: "corrupt" });
  });
  it("writePhaseState merges, keeps the DGS-486 fields and leaves no temp file", () => {
    const d = tmp();
    writeFileSync(join(d, "lock.json"), JSON.stringify(base));
    writePhaseState(d, { phase: "building", phaseStartedAt: "2026-10-21T01:00:00.000Z", runs: { builder: "builder-1" } });
    const raw = JSON.parse(readFileSync(join(d, "lock.json"), "utf8"));
    expect(raw.taskId).toBe("t1");
    expect(raw.phase).toBe("building");
    expect(readdirSync(d)).toEqual(["lock.json"]);
    const r = readPhaseState(d);
    expect(r.kind === "ok" && r.state.runs.builder).toBe("builder-1");
  });
});
