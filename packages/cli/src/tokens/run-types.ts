import type { FileCursor } from "./claude-code-reader.ts";

export const RUN_TOKENS_SCHEMA = "oculus-tokens/v1";
export const RUN_TOKENS_STATE_SCHEMA = "oculus-tokens-state/v1";

export interface ModelTotals {
  input: number;
  output: number;
  cache_read: number;
  cache_write_5m: number;
  cache_write_1h: number;
  responses: number;
  tokens: number;
  cost_usd: number | null;
}

export interface Bucket {
  start: string;
  tokens: number;
  cost_usd: number | null;
}

export interface RunTokens {
  schema: typeof RUN_TOKENS_SCHEMA;
  run: string;
  generated_at: string;
  final: boolean;
  price_table: { source: "anthropic"; version: string };
  models: Record<string, ModelTotals>;
  total: { tokens: number; responses: number; cost_usd: number | null };
  unpriced_models: string[];
  sessions: number;
  buckets: Bucket[];
}

export interface Counted {
  model: string;
  ts: string;
  output: number;
  tokens: number;
  input: number;
  cache_read: number;
  cache_write_5m: number;
  cache_write_1h: number;
  cost_usd: number | null;
}

export interface RunTokensState {
  schema: typeof RUN_TOKENS_STATE_SCHEMA;
  run: string;
  files: Record<string, FileCursor>;
  responses: Record<string, Counted>;
}
