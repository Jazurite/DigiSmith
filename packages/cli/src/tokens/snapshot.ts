import { addCounts, emptyCounts, type Counts, type RegistryEntry, type Role, type Snapshot, type Step, type UsageRecord } from "./types.ts";

export function stepForRecord(record: UsageRecord, entries: RegistryEntry[]): Step {
  const own = entries
    .filter((e): e is Extract<RegistryEntry, { step: Step }> => (e.kind === "step_start" || e.kind === "step_end") && e.session_id === record.session_id)
    .filter((e) => e.ts <= record.ts)
    .sort((a, b) => a.ts.localeCompare(b.ts));
  const last = own[own.length - 1];
  return last && last.kind === "step_start" ? last.step : "other";
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
    for (const [task, agents] of Object.entries(input.taskAgents ?? {})) {
      if (record.agent_id && agents.includes(record.agent_id)) bump(tasks, task, record);
    }
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
