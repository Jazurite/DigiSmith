import { describe, expect, it } from "vitest";
import { buildSnapshot, stepForRecord } from "./snapshot.ts";
import type { RegistryEntry, UsageRecord } from "./types.ts";

function rec(over: Partial<UsageRecord>): UsageRecord {
  return {
    source: "claude-code", session_id: "s1", agent_id: null, response_id: Math.random().toString(),
    model: "claude-opus-5-5", ts: "2026-10-10T01:00:00Z", input: 1, output: 10, cache_read: 100,
    cache_write_5m: 5, cache_write_1h: 7, write_split: "known", raw_flags: {}, ...over,
  };
}

const entries: RegistryEntry[] = [
  { kind: "session", ticket: "T-1", session_id: "s1", source: "claude-code", role: "worker", ts: "2026-10-10T00:59:00Z" },
  { kind: "step_start", ticket: "T-1", step: "brainstorming", session_id: "s1", ts: "2026-10-10T01:00:00Z" },
  { kind: "step_end", ticket: "T-1", step: "brainstorming", session_id: "s1", ts: "2026-10-10T02:00:00Z" },
  { kind: "step_start", ticket: "T-1", step: "implementation", session_id: "s1", ts: "2026-10-10T03:00:00Z" },
];

describe("stepForRecord", () => {
  it("uses the open window of the record's session", () => {
    expect(stepForRecord(rec({ ts: "2026-10-10T01:30:00Z" }), entries)).toBe("brainstorming");
    expect(stepForRecord(rec({ ts: "2026-10-10T04:00:00Z" }), entries)).toBe("implementation");
  });
  it("returns other between windows, before the first window and for another session", () => {
    expect(stepForRecord(rec({ ts: "2026-10-10T02:30:00Z" }), entries)).toBe("other");
    expect(stepForRecord(rec({ ts: "2026-10-10T00:30:00Z" }), entries)).toBe("other");
    expect(stepForRecord(rec({ session_id: "s9", ts: "2026-10-10T01:30:00Z" }), entries)).toBe("other");
  });
});

describe("stepForRecord instants", () => {
  const e = (kind: "step_start" | "step_end", step: "brainstorming" | "implementation", ts: string): RegistryEntry => ({ kind, ticket: "T-1", step, session_id: "s1", ts });
  it("compares parsed instants across mixed precision", () => {
    const start = [e("step_start", "brainstorming", "2026-10-10T01:00:00Z")];
    expect(stepForRecord(rec({ ts: "2026-10-10T01:00:00.500Z" }), start)).toBe("brainstorming");
    const closed = [...start, e("step_end", "brainstorming", "2026-10-10T01:00:01.250Z")];
    expect(stepForRecord(rec({ ts: "2026-10-10T01:00:01Z" }), closed)).toBe("brainstorming");
    expect(stepForRecord(rec({ ts: "2026-10-10T01:00:01.500Z" }), closed)).toBe("other");
  });
  it("ignores entries with an invalid ts and sends a record with an invalid ts to other", () => {
    const list = [e("step_start", "brainstorming", "2026-10-10T01:00:00Z"), e("step_end", "brainstorming", "garbage")];
    expect(stepForRecord(rec({ ts: "2026-10-10T01:30:00Z" }), list)).toBe("brainstorming");
    expect(stepForRecord(rec({ ts: "" }), list)).toBe("other");
    expect(stepForRecord(rec({ ts: "nope" }), list)).toBe("other");
  });
  it("sorts a step_end before a step_start at the same instant", () => {
    const t = "2026-10-10T01:00:00Z";
    const list = [e("step_start", "implementation", t), e("step_end", "brainstorming", t), e("step_start", "brainstorming", "2026-10-10T00:00:00Z")];
    expect(stepForRecord(rec({ ts: "2026-10-10T01:00:00.000Z" }), list)).toBe("implementation");
  });
});

describe("buildSnapshot", () => {
  it("sums counts per step and model, with task rows from agent ids", () => {
    const snap = buildSnapshot({
      ticket: "T-1", generatedAt: "2026-10-10T05:00:00Z", entries, inferredSessions: [],
      taskAgents: { "task-1": ["a1"] },
      records: [
        rec({ ts: "2026-10-10T01:10:00Z" }),
        rec({ ts: "2026-10-10T03:10:00Z", agent_id: "a1", output: 20 }),
        rec({ ts: "2026-10-10T03:20:00Z", agent_id: "a2", output: 30 }),
      ],
    });
    expect(snap.steps.brainstorming["claude-opus-5-5"]).toMatchObject({ output: 10, responses: 1 });
    expect(snap.steps.implementation["claude-opus-5-5"]).toMatchObject({ output: 50, responses: 2 });
    expect(snap.tasks["task-1"]["claude-opus-5-5"]).toMatchObject({ output: 20, responses: 1 });
    expect(snap.schema_version).toBe(1);
    expect(snap.sessions).toEqual([{ session_id: "s1", role: "worker", attribution: "registry" }]);
  });

  it("marks inferred sessions and puts unknown sessions under unattributed", () => {
    const snap = buildSnapshot({
      ticket: "T-1", generatedAt: "t", entries: [], inferredSessions: ["s2"],
      records: [rec({ session_id: "s2" }), rec({ session_id: "s3", output: 4 })],
    });
    expect(snap.sessions).toEqual([{ session_id: "s2", role: "unknown", attribution: "inferred" }]);
    expect(snap.steps.other["claude-opus-5-5"].responses).toBe(1);
    expect(snap.unattributed["claude-opus-5-5"]).toMatchObject({ output: 4, responses: 1 });
  });
});
