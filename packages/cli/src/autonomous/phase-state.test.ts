import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPhaseState, writePhaseState } from "./phase-state.ts";

const fail = vi.hoisted(() => ({ write: false, rename: false }));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    writeFileSync: (...args: Parameters<typeof actual.writeFileSync>) => {
      if (fail.write) {
        actual.writeFileSync(...args);
        throw new Error("write boom");
      }
      return actual.writeFileSync(...args);
    },
    renameSync: (...args: Parameters<typeof actual.renameSync>) => {
      if (fail.rename) throw new Error("rename boom");
      return actual.renameSync(...args);
    },
  };
});

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
  it("present but invalid fields read as corrupt, not as defaults", () => {
    const cases: Record<string, unknown>[] = [
      { phase: "bogus" },
      { attempt: 0 },
      { attempt: 1.5 },
      { attempt: "2" },
      { phaseStartedAt: 5 },
      { runs: "x" },
      { runs: null },
      { runs: { builder: 5 } },
    ];
    for (const extra of cases) {
      const d = tmp();
      writeFileSync(join(d, "lock.json"), JSON.stringify({ ...base, ...extra }));
      expect(readPhaseState(d), JSON.stringify(extra)).toEqual({ kind: "corrupt" });
    }
  });
  it("absent runs.builder reads as null", () => {
    const d = tmp();
    writeFileSync(join(d, "lock.json"), JSON.stringify({ ...base, runs: {} }));
    expect(readPhaseState(d)).toMatchObject({ kind: "ok", state: { runs: { builder: null } } });
  });
  it("a failed rename leaves no temp file behind", () => {
    const d = tmp();
    writeFileSync(join(d, "lock.json"), JSON.stringify(base));
    fail.rename = true;
    try {
      expect(() => writePhaseState(d, { phase: "building" })).toThrow("rename boom");
    } finally {
      fail.rename = false;
    }
    expect(readdirSync(d)).toEqual(["lock.json"]);
    expect(readPhaseState(d)).toMatchObject({ kind: "ok", state: { phase: "claimed" } });
  });
  it("a failed write leaves no temp file behind", () => {
    const d = tmp();
    writeFileSync(join(d, "lock.json"), JSON.stringify(base));
    fail.write = true;
    try {
      expect(() => writePhaseState(d, { phase: "building" })).toThrow("write boom");
    } finally {
      fail.write = false;
    }
    expect(readdirSync(d)).toEqual(["lock.json"]);
  });
});
