import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SCHEMA = "nightwatch-attention/v1";
interface Line { id?: string; run?: string; kind?: string; resolved?: boolean }

function readRaw(file: string): string {
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

function parseLines(raw: string): Line[] {
  const out: Line[] = [];
  for (const t of raw.split("\n")) {
    if (t === "") continue;
    try { out.push(JSON.parse(t) as Line); } catch { /* skipped */ }
  }
  return out;
}

export type AttentionKind = "blocked" | "stalled" | "lost" | "refused" | "failed" | "unknown";
export interface AttentionInput {
  ticket: string | null;
  run: string | null;
  kind: AttentionKind;
  cause: string;
  since?: string;
  causeClass?: "transient" | "durable" | "unknown";
  retryEligible?: boolean;
}

export function appendAttention(dir: string, now: Date, a: AttentionInput): "written" | "exists" {
  const file = join(dir, "attention.jsonl");
  const run = a.run ?? "-";
  const raw = readRaw(file);
  const lines = parseLines(raw);
  const prefix = `${run}.${a.kind}.`;
  const resolved = new Set(lines.filter((l) => l.resolved === true && typeof l.id === "string").map((l) => l.id as string));
  const opened = lines.filter((l) => l.resolved !== true && typeof l.id === "string" && l.id.startsWith(prefix)).map((l) => l.id as string);
  if (opened.some((id) => !resolved.has(id))) return "exists";
  const n = opened.length;
  mkdirSync(dir, { recursive: true });
  const ts = now.toISOString();
  // A torn last line (no trailing newline) must not swallow the new line.
  const sep = raw !== "" && !raw.endsWith("\n") ? "\n" : "";
  const line: Record<string, unknown> = { schema: SCHEMA, id: `${prefix}${n}`, ts, ticket: a.ticket, run, kind: a.kind, cause: a.cause, since: a.since ?? ts };
  if (a.causeClass !== undefined) line.causeClass = a.causeClass;
  if (a.retryEligible !== undefined) line.retryEligible = a.retryEligible;
  appendFileSync(file, `${sep}${JSON.stringify(line)}\n`);
  return "written";
}

/** Closes an open item. Returns false (and writes nothing) when the id is not open. */
export function appendResolved(dir: string, id: string, by: "watchdog" | "jack", ts: string, note = ""): boolean {
  const file = join(dir, "attention.jsonl");
  const raw = readRaw(file);
  const lines = parseLines(raw);
  const resolved = lines.some((l) => l.resolved === true && l.id === id);
  const opened = lines.some((l) => l.resolved !== true && l.id === id);
  if (!opened || resolved) return false;
  mkdirSync(dir, { recursive: true });
  const sep = raw !== "" && !raw.endsWith("\n") ? "\n" : "";
  appendFileSync(file, `${sep}${JSON.stringify({ schema: SCHEMA, id, ts, resolved: true, by, note })}\n`);
  return true;
}
