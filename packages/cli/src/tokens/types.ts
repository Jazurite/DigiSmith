export const STEPS = ["brainstorming", "writing-plans", "implementation", "finishing", "other"] as const;
export type Step = (typeof STEPS)[number];

export interface Counts {
  input: number;
  output: number;
  cache_read: number;
  cache_write_5m: number;
  cache_write_1h: number;
  responses: number;
}

export function emptyCounts(): Counts {
  return { input: 0, output: 0, cache_read: 0, cache_write_5m: 0, cache_write_1h: 0, responses: 0 };
}

export function addCounts(a: Counts, b: Counts): Counts {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cache_read: a.cache_read + b.cache_read,
    cache_write_5m: a.cache_write_5m + b.cache_write_5m,
    cache_write_1h: a.cache_write_1h + b.cache_write_1h,
    responses: a.responses + b.responses,
  };
}

export interface UsageRecord {
  source: string; // reader name, phase 1: "claude-code"
  session_id: string;
  agent_id: string | null; // subagent id, null for the main thread
  response_id: string; // dedupe key
  model: string;
  ts: string; // ISO-8601 UTC
  input: number;
  output: number;
  cache_read: number;
  cache_write_5m: number;
  cache_write_1h: number;
  write_split: "known" | "unknown";
  raw_flags: Record<string, unknown>; // service_tier, speed, iterations, fallback_credit as found; uninterpreted
}

export type Role = "worker" | "maestro" | "reviewer" | "other";

export type RegistryEntry =
  | { kind: "session"; ticket: string; session_id: string; source: string; role: Role; ts: string }
  | { kind: "step_start"; ticket: string; step: Step; session_id: string; ts: string }
  | { kind: "step_end"; ticket: string; step: Step; session_id: string; ts: string };

export interface Registry {
  append(entry: RegistryEntry): void;
  read(ticket: string): RegistryEntry[];
}

export interface Snapshot {
  schema_version: 1;
  ticket: string;
  generated_at: string;
  reader_versions: Record<string, string>;
  steps: Record<string, Record<string, Counts>>; // step -> model -> counts
  tasks: Record<string, Record<string, Counts>>; // task id -> model -> counts
  sessions: { session_id: string; role: Role | "unknown"; attribution: "registry" | "inferred" }[];
  unattributed: Record<string, Counts>;
}
