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

function parseFile(path: string, sessionFallback: string, into: Map<string, UsageRecord>): void {
  for (const raw of readFileSync(path, "utf-8").split("\n")) {
    if (!raw) continue;
    let o: Line;
    try {
      o = JSON.parse(raw) as Line;
    } catch {
      continue;
    }
    const m = o.message;
    if (o.type !== "assistant" || !m?.usage || !m.model || m.model === "<synthetic>") continue;
    const u = m.usage;
    const split = u.cache_creation;
    const total = u.cache_creation_input_tokens ?? 0;
    const record: UsageRecord = {
      source: "claude-code",
      session_id: o.sessionId ?? sessionFallback,
      agent_id: o.agentId ?? null,
      response_id: m.id && o.requestId ? `${m.id}|${o.requestId}` : `uuid|${o.uuid ?? raw.length}`,
      model: m.model,
      ts: o.timestamp ?? "",
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
      if (name.startsWith("agent-") && name.endsWith(".jsonl")) parseFile(join(subDir, name), sessionId, byId);
    }
  }
  return [...byId.values()].sort((a, b) => a.ts.localeCompare(b.ts));
}
