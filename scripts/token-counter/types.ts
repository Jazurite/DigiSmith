export type { LongPromptTier, PricingEntry, TokenUsage } from "../../packages/cli/src/tokens/prices/types.ts";
import type { TokenUsage } from "../../packages/cli/src/tokens/prices/types.ts";

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
