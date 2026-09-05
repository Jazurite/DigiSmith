import { readFileSync } from "node:fs";
import type { GatewayProvider, OffloadRole } from "../providers/types.ts";
import type { ParsedResult, Runner } from "./types.ts";
import { hasXtmlToolCallChannel } from "./kimi-k3-xtml-parser.ts";

const KNOWN_STATUSES = new Set(["success", "error", "interrupted"]);

interface ClaudeResultEvent {
  type: string;
  subtype?: string;
  is_error?: boolean;
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

  // Confirmed live: a real auth failure can carry subtype:"success" alongside
  // is_error:true — subtype alone is not a reliable success signal.
  const status: ParsedResult["status"] = last.is_error
    ? "error"
    : last.subtype && KNOWN_STATUSES.has(last.subtype)
      ? (last.subtype as ParsedResult["status"])
      : "error";

  const resultText = last.result ?? null;
  return {
    status,
    resultText,
    sessionId: last.session_id ?? null,
    costUsd: last.total_cost_usd ?? last.cost?.total_cost_usd,
    ...(resultText && hasXtmlToolCallChannel(resultText) ? { xtmlLeakDetected: true } : {}),
  };
}

export const claudeCode: Runner = {
  name: "claude-code",
  buildConfig(provider: GatewayProvider, role: OffloadRole) {
    return { baseUrl: provider.baseUrl, credentialEnv: provider.credentialEnv, model: provider.model(role) };
  },
  parseResult,
};
