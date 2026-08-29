import { readFileSync } from "node:fs";
import type { GatewayProvider, OffloadRole } from "../providers/types.ts";
import type { ParsedResult, Runner } from "./types.ts";

interface ClaudeResultEvent {
  type: string;
  subtype?: "success" | "error" | "interrupted";
  result?: string | null;
  session_id?: string;
  cost?: { total_cost_usd?: number };
}

function parseResult(eventsFile: string): ParsedResult {
  const lines = readFileSync(eventsFile, "utf-8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as ClaudeResultEvent);

  const last = [...lines].reverse().find((e) => e.type === "result");
  if (!last || !last.subtype) {
    return { status: "error", resultText: null, sessionId: null };
  }

  return {
    status: last.subtype,
    resultText: last.result ?? null,
    sessionId: last.session_id ?? null,
    costUsd: last.cost?.total_cost_usd,
  };
}

export const claudeCode: Runner = {
  name: "claude-code",
  buildConfig(provider: GatewayProvider, _role: OffloadRole) {
    return { baseUrl: provider.baseUrl, credentialEnv: provider.credentialEnv };
  },
  parseResult,
};
