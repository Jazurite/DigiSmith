import { addCounts, emptyCounts, type Counts, type RegistryEntry, type Role, type Snapshot, type Step, type UsageRecord } from "./types.ts";

// Windows compare parsed instants, never strings, so mixed precision ("...:00Z" vs "...:00.500Z")
// orders correctly. An entry or record with an unparseable ts is ignored for windows.
export function stepForRecord(record: UsageRecord, entries: RegistryEntry[]): Step {
  const at = Date.parse(record.ts);
  if (Number.isNaN(at)) return "other";
  const own = entries
    .filter((e): e is Extract<RegistryEntry, { step: Step }> => (e.kind === "step_start" || e.kind === "step_end") && e.session_id === record.session_id)
    .map((e, order) => ({ e, t: Date.parse(e.ts), order }))
    .filter((x) => !Number.isNaN(x.t) && x.t <= at)
    // at the same instant a step_end sorts before a step_start; otherwise file order is kept
    .sort((a, b) => a.t - b.t || Number(b.e.kind === "step_end") - Number(a.e.kind === "step_end") || a.order - b.order);
  const last = own[own.length - 1]?.e;
  return last && last.kind === "step_start" ? last.step : "other";
}

// A task window opens at task_start and closes at task_end, the next task_start, or the end of the
// implementation step. Same rules as stepForRecord: own session only, parsed instants, an end sorts
// before a start at the same instant.
export function taskForRecord(record: UsageRecord, entries: RegistryEntry[]): string | null {
  const at = Date.parse(record.ts);
  if (Number.isNaN(at)) return null;
  const own = entries
    .filter((e) => e.session_id === record.session_id && (e.kind === "task_start" || e.kind === "task_end" || (e.kind === "step_end" && e.step === "implementation")))
    .map((e, order) => ({ e, t: Date.parse(e.ts), order }))
    .filter((x) => !Number.isNaN(x.t) && x.t <= at)
    .sort((a, b) => a.t - b.t || Number(b.e.kind !== "task_start") - Number(a.e.kind !== "task_start") || a.order - b.order);
  const last = own[own.length - 1]?.e;
  return last && last.kind === "task_start" ? last.task : null;
}

function ledgerTask(record: UsageRecord, taskAgents: Record<string, string[]> | undefined): string | null {
  if (!record.agent_id) return null;
  for (const [task, agents] of Object.entries(taskAgents ?? {})) if (agents.includes(record.agent_id)) return task;
  return null;
}

function countsOf(record: UsageRecord): Counts {
  return {
    input: record.input,
    output: record.output,
    cache_read: record.cache_read,
    cache_write_5m: record.cache_write_5m,
    cache_write_1h: record.cache_write_1h,
    responses: 1,
  };
}

function addModel(models: Record<string, Counts>, record: UsageRecord): void {
  models[record.model] = addCounts(models[record.model] ?? emptyCounts(), countsOf(record));
}

function bump(table: Record<string, Record<string, Counts>>, key: string, record: UsageRecord): void {
  addModel((table[key] ??= {}), record);
}

export interface SnapshotInput {
  ticket: string;
  generatedAt: string;
  records: UsageRecord[];
  entries: RegistryEntry[];
  inferredSessions: string[];
  taskAgents?: Record<string, string[]>;
}

export function buildSnapshot(input: SnapshotInput): Snapshot {
  const registered = new Map<string, Role>();
  for (const e of input.entries) if (e.kind === "session") registered.set(e.session_id, e.role);
  const inferred = new Set(input.inferredSessions.filter((s) => !registered.has(s)));

  const steps: Snapshot["steps"] = {};
  const tasks: Snapshot["tasks"] = {};
  const unattributed: Snapshot["unattributed"] = {};

  for (const record of input.records) {
    if (!registered.has(record.session_id) && !inferred.has(record.session_id)) {
      addModel(unattributed, record);
      continue;
    }
    bump(steps, stepForRecord(record, input.entries), record);
    const task = ledgerTask(record, input.taskAgents) ?? taskForRecord(record, input.entries);
    if (task) bump(tasks, task, record);
  }

  const sessions: Snapshot["sessions"] = [
    ...[...registered].map(([session_id, role]) => ({ session_id, role, attribution: "registry" as const })),
    ...[...inferred].map((session_id) => ({ session_id, role: "unknown" as const, attribution: "inferred" as const })),
  ];

  return {
    schema_version: 1,
    ticket: input.ticket,
    generated_at: input.generatedAt,
    reader_versions: { "claude-code": "1" },
    steps,
    tasks,
    sessions,
    unattributed,
  };
}
