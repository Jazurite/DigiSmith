import { describe, expect, it } from "vitest";
import { buildSnapshot, inferredStep, stepForRecord, taskForRecord } from "./snapshot.ts";
import type { RegistryEntry, Role, UsageRecord } from "./types.ts";

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

describe("taskForRecord", () => {
  const t = (kind: "task_start" | "task_end", task: string, ts: string, session_id = "s1"): RegistryEntry => ({ kind, ticket: "T-1", task, session_id, ts });
  const impl = (kind: "step_start" | "step_end", ts: string): RegistryEntry => ({ kind, ticket: "T-1", step: "implementation", session_id: "s1", ts });
  const list = [t("task_start", "1", "2026-10-10T01:00:00Z"), t("task_end", "1", "2026-10-10T02:00:00Z"), t("task_start", "2", "2026-10-10T03:00:00Z")];

  it("returns the task whose window holds the record", () => {
    expect(taskForRecord(rec({ ts: "2026-10-10T01:30:00Z" }), list)).toBe("1");
    expect(taskForRecord(rec({ ts: "2026-10-10T04:00:00Z" }), list)).toBe("2");
  });
  it("returns null before the first window, between windows and for another session", () => {
    expect(taskForRecord(rec({ ts: "2026-10-10T00:30:00Z" }), list)).toBeNull();
    expect(taskForRecord(rec({ ts: "2026-10-10T02:30:00Z" }), list)).toBeNull();
    expect(taskForRecord(rec({ session_id: "s9", ts: "2026-10-10T01:30:00Z" }), list)).toBeNull();
  });
  it("closes a window at the next task_start, at step_end implementation and at the same instant", () => {
    const next = [t("task_start", "1", "2026-10-10T01:00:00Z"), t("task_start", "2", "2026-10-10T02:00:00Z")];
    expect(taskForRecord(rec({ ts: "2026-10-10T02:30:00Z" }), next)).toBe("2");
    const stepEnd = [t("task_start", "final", "2026-10-10T01:00:00Z"), impl("step_end", "2026-10-10T02:00:00Z")];
    expect(taskForRecord(rec({ ts: "2026-10-10T01:30:00Z" }), stepEnd)).toBe("final");
    expect(taskForRecord(rec({ ts: "2026-10-10T02:30:00Z" }), stepEnd)).toBeNull();
    const same = [t("task_start", "2", "2026-10-10T02:00:00Z"), t("task_end", "1", "2026-10-10T02:00:00Z"), t("task_start", "1", "2026-10-10T01:00:00Z")];
    expect(taskForRecord(rec({ ts: "2026-10-10T02:00:00.500Z" }), same)).toBe("2");
  });
  it("keeps a window open when a task_end names another task", () => {
    const stray = [t("task_start", "2", "2026-10-10T01:00:00Z"), t("task_end", "1", "2026-10-10T02:00:00Z")];
    expect(taskForRecord(rec({ ts: "2026-10-10T03:00:00Z" }), stray)).toBe("2");
    const own = [t("task_start", "2", "2026-10-10T01:00:00Z"), t("task_end", "2", "2026-10-10T02:00:00Z")];
    expect(taskForRecord(rec({ ts: "2026-10-10T03:00:00Z" }), own)).toBeNull();
  });
  it("ignores an entry with a bad ts and gives null for a record with a bad ts", () => {
    const bad = [t("task_start", "1", "2026-10-10T01:00:00Z"), t("task_end", "1", "garbage")];
    expect(taskForRecord(rec({ ts: "2026-10-10T01:30:00Z" }), bad)).toBe("1");
    expect(taskForRecord(rec({ ts: "" }), bad)).toBeNull();
  });
  it("does not treat step_start of implementation as a window mark", () => {
    expect(taskForRecord(rec({ ts: "2026-10-10T01:30:00Z" }), [impl("step_start", "2026-10-10T01:00:00Z")])).toBeNull();
  });
});

describe("buildSnapshot task windows", () => {
  const worker: RegistryEntry = { kind: "session", ticket: "T-1", session_id: "s1", source: "claude-code", role: "worker", ts: "2026-10-10T00:59:00Z" };
  const marks: RegistryEntry[] = [
    worker,
    { kind: "task_start", ticket: "T-1", task: "1", session_id: "s1", ts: "2026-10-10T01:00:00Z" },
    { kind: "task_end", ticket: "T-1", task: "1", session_id: "s1", ts: "2026-10-10T02:00:00Z" },
  ];
  it("tags a main-thread record by window and a ledger agent by the ledger, each once", () => {
    const snap = buildSnapshot({
      ticket: "T-1", generatedAt: "t", entries: marks, inferredSessions: [],
      taskAgents: { "7": ["a1"] },
      records: [
        rec({ ts: "2026-10-10T01:10:00Z", output: 10 }),
        rec({ ts: "2026-10-10T01:20:00Z", agent_id: "a1", output: 20 }),
        rec({ ts: "2026-10-10T01:30:00Z", agent_id: "a2", output: 30 }),
        rec({ ts: "2026-10-10T02:30:00Z", output: 40 }),
      ],
    });
    expect(snap.tasks["1"]["claude-opus-5-5"]).toMatchObject({ output: 40, responses: 2 });
    expect(snap.tasks["7"]["claude-opus-5-5"]).toMatchObject({ output: 20, responses: 1 });
    expect(Object.keys(snap.tasks).sort()).toEqual(["1", "7"]);
  });
  it("leaves an unregistered session out of the tasks", () => {
    const snap = buildSnapshot({ ticket: "T-1", generatedAt: "t", entries: marks, inferredSessions: [], records: [rec({ session_id: "s9", ts: "2026-10-10T01:10:00Z" })] });
    expect(snap.tasks).toEqual({});
  });
});

describe("inferredStep", () => {
  const session = (role: Role): Map<string, Role> => new Map([["s1", role]]);
  const fin = (ts: string): RegistryEntry => ({ kind: "step_end", ticket: "T-1", step: "finishing", session_id: "s1", ts });
  const reg: RegistryEntry = { kind: "session", ticket: "T-1", session_id: "s1", source: "claude-code", role: "worker", ts: "2026-10-10T00:59:00Z" };

  it("calls the records before a lone finishing end of a worker the implementation", () => {
    const list = [reg, fin("2026-10-10T02:00:00Z")];
    expect(inferredStep(rec({ ts: "2026-10-10T01:00:00Z" }), list, session("worker"))).toBe("implementation");
    expect(inferredStep(rec({ ts: "2026-10-10T02:00:00Z" }), list, session("worker"))).toBe("implementation");
    expect(inferredStep(rec({ ts: "2026-10-10T02:00:01Z" }), list, session("worker"))).toBeNull();
  });
  it("uses the earliest finishing end when there are two", () => {
    const list = [reg, fin("2026-10-10T02:00:00Z"), fin("2026-10-10T04:00:00Z")];
    expect(inferredStep(rec({ ts: "2026-10-10T01:00:00Z" }), list, session("worker"))).toBe("implementation");
    expect(inferredStep(rec({ ts: "2026-10-10T03:00:00Z" }), list, session("worker"))).toBeNull();
  });
  it("infers nothing when the session has any step_start, no finishing end, another role or a bad ts", () => {
    const started: RegistryEntry = { kind: "step_start", ticket: "T-1", step: "brainstorming", session_id: "s1", ts: "2026-10-10T00:30:00Z" };
    expect(inferredStep(rec({ ts: "2026-10-10T01:00:00Z" }), [reg, started, fin("2026-10-10T02:00:00Z")], session("worker"))).toBeNull();
    expect(inferredStep(rec({ ts: "2026-10-10T01:00:00Z" }), [reg], session("worker"))).toBeNull();
    expect(inferredStep(rec({ ts: "2026-10-10T01:00:00Z" }), [reg, fin("2026-10-10T02:00:00Z")], session("reviewer"))).toBeNull();
    expect(inferredStep(rec({ ts: "" }), [reg, fin("2026-10-10T02:00:00Z")], session("worker"))).toBeNull();
    expect(inferredStep(rec({ ts: "2026-10-10T01:00:00Z" }), [reg, fin("garbage")], session("worker"))).toBeNull();
  });
});

describe("buildSnapshot inferred steps", () => {
  it("counts the DGS-561 shape as implementation and says so", () => {
    const entries: RegistryEntry[] = [
      { kind: "session", ticket: "T-1", session_id: "s1", source: "claude-code", role: "worker", ts: "2026-10-10T00:59:00Z" },
      { kind: "step_end", ticket: "T-1", step: "finishing", session_id: "s1", ts: "2026-10-10T02:00:00Z" },
    ];
    const snap = buildSnapshot({
      ticket: "T-1", generatedAt: "t", entries, inferredSessions: [],
      records: [rec({ ts: "2026-10-10T01:00:00Z", output: 10 }), rec({ ts: "2026-10-10T03:00:00Z", output: 5 })],
    });
    expect(snap.steps.implementation["claude-opus-5-5"]).toMatchObject({ output: 10, responses: 1 });
    expect(snap.steps.other["claude-opus-5-5"]).toMatchObject({ output: 5, responses: 1 });
    expect(snap.inferred_steps).toEqual(["implementation"]);
  });
  it("leaves inferred_steps out when no step was inferred", () => {
    const snap = buildSnapshot({ ticket: "T-1", generatedAt: "t", entries: [], inferredSessions: [], records: [] });
    expect("inferred_steps" in snap).toBe(false);
  });
});
