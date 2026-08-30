import { readFileSync } from "node:fs";
import type { GatewayProvider, OffloadRole } from "../providers/types.ts";
import { buildOpencodeProviderBlock } from "../providers/print-config.ts";
import type { ParsedResult, Runner } from "./types.ts";

interface OpencodeEvent {
  type: string;
  sessionID?: string;
  part?: { type: string; text?: string };
}

function parseResult(eventsFile: string): ParsedResult {
  const lines = readFileSync(eventsFile, "utf-8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as OpencodeEvent);

  const sessionId = lines.find((e) => e.sessionID)?.sessionID ?? null;
  const lastText = [...lines].reverse().find((e) => e.type === "text");

  if (!lastText || typeof lastText.part?.text !== "string") {
    return { status: "error", resultText: null, sessionId };
  }

  return { status: "success", resultText: lastText.part.text, sessionId };
}

export const opencode: Runner = {
  name: "opencode",
  buildConfig(provider: GatewayProvider, role: OffloadRole) {
    return buildOpencodeProviderBlock(provider, role);
  },
  parseResult,
};
