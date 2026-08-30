import { readFileSync } from "node:fs";
import type { GatewayProvider, OffloadRole } from "../providers/types.ts";
import type { ParsedResult, Runner } from "./types.ts";

const KNOWN_STATUSES = new Set(["success", "error", "interrupted"]);

interface ClaudeResultEvent {
  type: string;
  subtype?: string;
  result?: string | null;
  session_id?: string;
  total_cost_usd?: number;
  cost?: { total_cost_usd?: number };
}

function parseResult(eventsFile: string): ParsedResult {
  const lines = readFileSync(eventsFile, "utf-8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as ClaudeResultEvent);

  const last = [...lines].reverse().find((e) => e.type === "result");
  if (!last) {
    return { status: "error", resultText: null, sessionId: null };
  }

  const status: ParsedResult["status"] =
    last.subtype && KNOWN_STATUSES.has(last.subtype) ? (last.subtype as ParsedResult["status"]) : "error";

  return {
    status,
    resultText: last.result ?? null,
    sessionId: last.session_id ?? null,
    costUsd: last.total_cost_usd ?? last.cost?.total_cost_usd,
  };
}

export const claudeCode: Runner = {
  name: "claude-code",
  buildConfig(provider: GatewayProvider, role: OffloadRole) {
    return { baseUrl: provider.baseUrl, credentialEnv: provider.credentialEnv, model: provider.model(role) };
  },
  parseResult,
};
