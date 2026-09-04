import type { GatewayProvider } from "./types.ts";

// Base URL confirmed against TokenReply's own docs (tokenreply.com, Quick Start
// section): "set the API URL to https://api.tokenreply.com/v1".
export const tokenreply: GatewayProvider = {
  name: "tokenreply",
  displayName: "TokenReply",
  baseUrl: "https://api.tokenreply.com/v1",
  credentialEnv: "TOKENREPLY_API_KEY",
  contextWindow: 200_000,
  model() {
    return "kimi-k3";
  },
  supportsRunner: ["opencode", "claude-code"],
};
