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

// A task window opens at task_start and closes at the task_end of the same task, the next task_start, or the end of the
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
  let open: string | null = null;
  for (const { e } of own) {
    if (e.kind === "task_start") open = e.task;
    else if (e.kind === "task_end") {
      if (e.task === open) open = null; // a stray end for another task leaves the window open
    } else open = null; // step_end implementation closes any window
  }
  return open;
}

// A worker that never opened a step but closed "finishing" skipped the build skills (DGS-561). Its
// records up to that mark are the build, so they count as implementation, not other.
export function inferredStep(record: UsageRecord, entries: RegistryEntry[], registered: Map<string, Role>): Step | null {
  if (registered.get(record.session_id) !== "worker") return null;
  const at = Date.parse(record.ts);
  if (Number.isNaN(at)) return null;
  const own = entries.filter((e) => e.session_id === record.session_id);
  if (own.some((e) => e.kind === "step_start")) return null;
  const ends = own.flatMap((e) => (e.kind === "step_end" && e.step === "finishing" ? [Date.parse(e.ts)] : [])).filter((t) => !Number.isNaN(t));
  if (ends.length === 0) return null;
  return at <= Math.min(...ends) ? "implementation" : null;
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
  const inferredSteps = new Set<Step>();
  const tasks: Snapshot["tasks"] = {};
  const unattributed: Snapshot["unattributed"] = {};

  for (const record of input.records) {
    if (!registered.has(record.session_id) && !inferred.has(record.session_id)) {
      addModel(unattributed, record);
      continue;
    }
    let step = stepForRecord(record, input.entries);
    if (step === "other") {
      const inferredFor = inferredStep(record, input.entries, registered);
      if (inferredFor) {
        step = inferredFor;
        inferredSteps.add(inferredFor);
      }
    }
    bump(steps, step, record);
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
    ...(inferredSteps.size > 0 ? { inferred_steps: [...inferredSteps] } : {}),
  };
}
