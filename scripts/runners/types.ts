import type { GatewayProvider, OffloadRole } from "../providers/types.ts";

export type RunnerName = "opencode" | "claude-code";

export interface ParsedResult {
  status: "success" | "error" | "interrupted";
  resultText: string | null;
  sessionId: string | null;
  costUsd?: number;
}

export interface Runner {
  name: RunnerName;
  buildConfig(provider: GatewayProvider, role: OffloadRole): Record<string, unknown>;
  parseResult(eventsFile: string): ParsedResult;
}
