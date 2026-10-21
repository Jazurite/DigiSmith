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

export function appendAttention(dir: string, now: Date, a: { ticket: string; run: string | null; kind: "unknown" | "failed"; cause: string }): "written" | "exists" {
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
  appendFileSync(file, `${sep}${JSON.stringify({ schema: SCHEMA, id: `${prefix}${n}`, ts, ticket: a.ticket, run, kind: a.kind, cause: a.cause, since: ts })}\n`);
  return "written";
}
