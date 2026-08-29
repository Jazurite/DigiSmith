import type { GatewayProvider } from "./types.ts";

export const chutes: GatewayProvider = {
  name: "chutes",
  displayName: "Chutes",
  baseUrl: "https://llm.chutes.ai/v1",
  credentialEnv: "CHUTES_API_KEY",
  contextWindow: 1_048_576,
  model(role) {
    return role === "task" ? "moonshotai/Kimi-K3-TEE" : "google/gemma-4-31B-turbo-TEE";
  },
};
