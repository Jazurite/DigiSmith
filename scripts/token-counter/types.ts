export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
}

export interface PricingEntry {
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  cacheReadPricePerMillion?: number;
}

export interface CostRecord {
  provider: string;
  model: string;
  usage: TokenUsage;
  costUsd: number | null;
  note?: string;
}
