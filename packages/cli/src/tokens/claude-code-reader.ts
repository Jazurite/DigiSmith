import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { UsageRecord } from "./types.ts";

interface Line {
  type?: string;
  timestamp?: string;
  sessionId?: string;
  requestId?: string;
  agentId?: string;
  uuid?: string;
  message?: {
    id?: string;
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number };
    };
  };
}

function isObject(v: unknown): v is Record<string, any> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// An absent count is 0; a present one must be a finite, non-negative number.
function validCount(v: unknown): boolean {
  return v === undefined || (typeof v === "number" && Number.isFinite(v) && v >= 0);
}

const FLAG_KEYS = ["service_tier", "speed", "iterations", "fallback_credit"];

// Copied as found, never interpreted; only the keys present in usage (no message text).
function rawFlags(usage: Record<string, unknown>): Record<string, unknown> {
  const flags: Record<string, unknown> = {};
  for (const k of FLAG_KEYS) if (k in usage) flags[k] = usage[k];
  return flags;
}

export function parseUsageLine(raw: string, sessionFallback: string, fileAgentId: string | null, fallbackId: string): UsageRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(parsed)) return null;
  const o = parsed as Line;
  const m = o.message;
  if (o.type !== "assistant" || !isObject(m) || !isObject(m.usage) || typeof m.model !== "string" || !m.model || m.model === "<synthetic>") return null;
  const u = m.usage;
  const split = isObject(u.cache_creation) ? u.cache_creation : undefined;
  // A usage object with any invalid consumed count (not a finite, non-negative number) is skipped whole.
  const counts = [u.input_tokens, u.output_tokens, u.cache_read_input_tokens, u.cache_creation_input_tokens, split?.ephemeral_5m_input_tokens, split?.ephemeral_1h_input_tokens];
  if (!counts.every(validCount)) return null;
  const total = u.cache_creation_input_tokens ?? 0;
  return {
    source: "claude-code",
    session_id: typeof o.sessionId === "string" ? o.sessionId : sessionFallback,
    agent_id: typeof o.agentId === "string" && o.agentId ? o.agentId : fileAgentId,
    response_id: typeof m.id === "string" && m.id && typeof o.requestId === "string" && o.requestId ? `${m.id}|${o.requestId}` : fallbackId,
    model: m.model,
    ts: typeof o.timestamp === "string" ? o.timestamp : "",
    input: u.input_tokens ?? 0,
    output: u.output_tokens ?? 0,
    cache_read: u.cache_read_input_tokens ?? 0,
    cache_write_5m: split ? (split.ephemeral_5m_input_tokens ?? 0) : total,
    cache_write_1h: split ? (split.ephemeral_1h_input_tokens ?? 0) : 0,
    write_split: split ? "known" : "unknown",
    raw_flags: rawFlags(u),
  };
}

function parseFile(path: string, sessionFallback: string, into: Map<string, UsageRecord>, fileAgentId: string | null = null): void {
  const lines = readFileSync(path, "utf-8").split("\n");
  for (let index = 0; index < lines.length; index++) {
    const record = lines[index] ? parseUsageLine(lines[index], sessionFallback, fileAgentId, `line|${path}|${index}`) : null;
    if (!record) continue;
    const prior = into.get(record.response_id);
    if (!prior || record.output >= prior.output) into.set(record.response_id, record);
  }
}

export interface FileCursor { offset: number; size: number; ino: number }

const CHUNK = 64 * 1024;
const MAX_LINE = 1024 * 1024;

// Reads the full lines after the cursor. A half-written last line waits for the next call.
export function readUsageFrom(path: string, prior: FileCursor | null, sessionFallback: string, fileAgentId: string | null): { records: UsageRecord[]; cursor: FileCursor; restarted: boolean } {
  const st = statSync(path);
  const restarted = prior === null || prior.ino !== st.ino || st.size < prior.offset;
  const start = prior === null || restarted ? 0 : prior.offset;
  let offset = start;
  const name = basename(path);
  const records: UsageRecord[] = [];
  const fd = openSync(path, "r");
  try {
    let pending: Buffer[] = [];
    let pendingLen = 0;
    let lineStart = offset;
    let skipping = false;
    const buf = Buffer.alloc(CHUNK);
    let pos = offset;
    for (;;) {
      const n = readSync(fd, buf, 0, CHUNK, pos);
      if (n === 0) break;
      let from = 0;
      for (let i = 0; i < n; i++) {
        if (buf[i] !== 0x0a) continue;
        if (!skipping) {
          const raw = Buffer.concat([...pending, buf.subarray(from, i)]).toString("utf-8");
          const r = raw ? parseUsageLine(raw, sessionFallback, fileAgentId, `line|${name}|${lineStart}`) : null;
          if (r) records.push(r);
        }
        pending = [];
        pendingLen = 0;
        skipping = false;
        from = i + 1;
        lineStart = pos + i + 1;
        offset = lineStart;
      }
      if (!skipping && from < n) {
        pending.push(Buffer.from(buf.subarray(from, n)));
        pendingLen += n - from;
        if (pendingLen > MAX_LINE) {
          skipping = true;
          pending = [];
          pendingLen = 0;
        }
      }
      pos += n;
    }
  } finally {
    closeSync(fd);
  }
  return { records, cursor: { offset, size: st.size, ino: st.ino }, restarted };
}

export function readClaudeCodeSession(transcriptPath: string): UsageRecord[] {
  const sessionId = basename(transcriptPath, ".jsonl");
  const byId = new Map<string, UsageRecord>();
  parseFile(transcriptPath, sessionId, byId);
  const subDir = join(dirname(transcriptPath), sessionId, "subagents");
  if (existsSync(subDir)) {
    for (const name of readdirSync(subDir)) {
      if (name.startsWith("agent-") && name.endsWith(".jsonl")) parseFile(join(subDir, name), sessionId, byId, name.slice("agent-".length, -".jsonl".length));
    }
  }
  return [...byId.values()].sort((a, b) => a.ts.localeCompare(b.ts));
}
