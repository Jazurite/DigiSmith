import { existsSync, readdirSync, readFileSync } from "node:fs";
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

function parseFile(path: string, sessionFallback: string, into: Map<string, UsageRecord>, fileAgentId: string | null = null): void {
  const lines = readFileSync(path, "utf-8").split("\n");
  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index];
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!isObject(parsed)) continue;
    const o = parsed as Line;
    const m = o.message;
    if (o.type !== "assistant" || !isObject(m) || !isObject(m.usage) || typeof m.model !== "string" || !m.model || m.model === "<synthetic>") continue;
    const u = m.usage;
    const split = isObject(u.cache_creation) ? u.cache_creation : undefined;
    // A usage object with any invalid consumed count (not a finite, non-negative number) is skipped whole.
    const counts = [u.input_tokens, u.output_tokens, u.cache_read_input_tokens, u.cache_creation_input_tokens, split?.ephemeral_5m_input_tokens, split?.ephemeral_1h_input_tokens];
    if (!counts.every(validCount)) continue;
    const total = u.cache_creation_input_tokens ?? 0;
    const record: UsageRecord = {
      source: "claude-code",
      session_id: typeof o.sessionId === "string" ? o.sessionId : sessionFallback,
      agent_id: typeof o.agentId === "string" && o.agentId ? o.agentId : fileAgentId,
      response_id: typeof m.id === "string" && m.id && typeof o.requestId === "string" && o.requestId ? `${m.id}|${o.requestId}` : `line|${path}|${index}`,
      model: m.model,
      ts: typeof o.timestamp === "string" ? o.timestamp : "",
      input: u.input_tokens ?? 0,
      output: u.output_tokens ?? 0,
      cache_read: u.cache_read_input_tokens ?? 0,
      cache_write_5m: split ? (split.ephemeral_5m_input_tokens ?? 0) : total,
      cache_write_1h: split ? (split.ephemeral_1h_input_tokens ?? 0) : 0,
      write_split: split ? "known" : "unknown",
    };
    const prior = into.get(record.response_id);
    if (!prior || record.output >= prior.output) into.set(record.response_id, record);
  }
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
