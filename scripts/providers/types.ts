import type { RunnerName } from "../runners/types.ts";

export type OffloadRole = "mechanical" | "task";

export interface GatewayProvider {
  name: string;
  displayName: string;
  baseUrl: string;
  credentialEnv: string;
  contextWindow: number;
  model(role: OffloadRole): string;
  supportsRunner: RunnerName[];
}
