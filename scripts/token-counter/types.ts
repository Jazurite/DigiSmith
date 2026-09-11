export interface TokenUsage {
  /**
   * Full input token count, EXCLUDING any cache-read tokens. `cacheReadTokens`
   * is billed separately and must not be double-counted into this field.
   * OpenAI-compatible responses often report a `prompt_tokens` figure that's
   * inclusive of cached tokens — subtract cache-read tokens from it before
   * assigning to `inputTokens`.
   */
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
  /**
   * This module's own locally-computed cost — real token counts multiplied
   * against a hardcoded pricing table. Distinct from `ParsedResult.costUsd`
   * (defined in `scripts/runners/types.ts`), which is the Claude Agent SDK's
   * self-reported dollar figure and unreliable for non-Anthropic models —
   * this field exists to replace that one. Do not confuse the two when both
   * are in scope for the same dispatch.
   */
  costUsd: number | null;
  note?: string;
}
