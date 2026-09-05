import type { GatewayProvider } from "./types.ts";

// Base URL confirmed against TokenReply's own docs (tokenreply.com, Quick Start
// section): "set the API URL to https://api.tokenreply.com/v1".
export const tokenreply: GatewayProvider = {
  name: "tokenreply",
  displayName: "TokenReply",
  baseUrl: "https://api.tokenreply.com/v1",
  credentialEnv: "TOKENREPLY_API_KEY",
  contextWindow: 200_000,
  // kimi-k3 is confirmed broken for tool-calling via this route (live-tested
  // 2026-09-04, 2/2 dispatches emitted garbled pseudo-tool-call text instead
  // of a real tool_use block — see
  // backlog/tokenreply-kimi-k3-tool-calling-failure.md). kimi-k2.7 confirmed
  // working (2/2) on the identical pipeline — reverted until root-caused on
  // TokenReply's or the model's side.
  model() {
    return "kimi-k2.7";
  },
  supportsRunner: ["opencode", "claude-code"],
};
