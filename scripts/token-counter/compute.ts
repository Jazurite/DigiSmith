import type { CostRecord, PricingEntry, TokenUsage } from "./types.ts";
import { resolvePricing } from "./registry.ts";
import { dispatchWebhook } from "./webhook.ts";

const UNKNOWN_PRICING_NOTE = "no pricing data for provider/model";
const UNPRICED_CACHE_READ_NOTE =
  "cache-read tokens present but not priced for this provider/model — cache-read cost excluded";

export function computeTokenCost(provider: string, model: string, usage: TokenUsage): CostRecord {
  const pricing = resolvePricing(provider, model);

  let record: CostRecord;
  if (!pricing) {
    record = { provider, model, usage, costUsd: null, note: UNKNOWN_PRICING_NOTE };
  } else {
    const costUsd = costFromPricing(pricing, usage);
    const hasUnpricedCacheRead =
      typeof usage.cacheReadTokens === "number" &&
      usage.cacheReadTokens > 0 &&
      pricing.cacheReadPricePerMillion === undefined;

    record = hasUnpricedCacheRead
      ? { provider, model, usage, costUsd, note: UNPRICED_CACHE_READ_NOTE }
      : { provider, model, usage, costUsd };
  }

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
