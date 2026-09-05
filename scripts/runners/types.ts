import type { GatewayProvider, OffloadRole } from "../providers/types.ts";

export type RunnerName = "opencode" | "claude-code";

export interface ParsedResult {
  status: "success" | "error" | "interrupted";
  resultText: string | null;
  sessionId: string | null;
  costUsd?: number;
  /** True when resultText contains TokenReply/kimi-k3's leaked raw XTML tool-call
   * format instead of a real tool call — see backlog/tokenreply-kimi-k3-tool-calling-failure.md.
   * offload-implementer's controller checks this to run the recovery step. */
  xtmlLeakDetected?: boolean;
}

export interface Runner {
  name: RunnerName;
  buildConfig(provider: GatewayProvider, role: OffloadRole): Record<string, unknown>;
  parseResult(eventsFile: string): ParsedResult;
}
