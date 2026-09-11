import type { CostRecord, PricingEntry, TokenUsage } from "./types.ts";
import { resolvePricing } from "./registry.ts";
import { dispatchWebhook } from "./webhook.ts";

const UNKNOWN_PRICING_NOTE = "no pricing data for provider/model";

export function computeTokenCost(provider: string, model: string, usage: TokenUsage): CostRecord {
  const pricing = resolvePricing(provider, model);

  const record: CostRecord = pricing
    ? { provider, model, usage, costUsd: costFromPricing(pricing, usage) }
    : { provider, model, usage, costUsd: null, note: UNKNOWN_PRICING_NOTE };

  void dispatchWebhook(record);

  return record;
}

function costFromPricing(pricing: PricingEntry, usage: TokenUsage): number {
  const inputCost = (usage.inputTokens / 1_000_000) * pricing.inputPricePerMillion;
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.outputPricePerMillion;
  const cacheCost =
    usage.cacheReadTokens && pricing.cacheReadPricePerMillion
      ? (usage.cacheReadTokens / 1_000_000) * pricing.cacheReadPricePerMillion
      : 0;
  return inputCost + outputCost + cacheCost;
}
