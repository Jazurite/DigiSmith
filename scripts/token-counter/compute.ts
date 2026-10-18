import type { CostRecord, PricingEntry, TokenUsage } from "./types.ts";
import { resolvePricing } from "./registry.ts";
import { dispatchWebhook } from "./webhook.ts";

const UNKNOWN_PRICING_NOTE = "no pricing data for provider/model";
const UNPRICED_CACHE_READ_NOTE =
  "cache-read tokens present but not priced for this provider/model — cache-read cost excluded";
const UNPRICED_CACHE_WRITE_NOTE =
  "cache-write tokens present but not priced for this provider/model — cache-write cost excluded";

export function computeTokenCost(provider: string, model: string, usage: TokenUsage): CostRecord {
  const pricing = resolvePricing(provider, model);

  let record: CostRecord;
  if (!pricing) {
    record = { provider, model, usage, costUsd: null, note: UNKNOWN_PRICING_NOTE };
  } else {
    const costUsd = costFromPricing(pricing, usage);
    const notes = unpricedNotes(pricing, usage);
    record = notes.length > 0
      ? { provider, model, usage, costUsd, note: notes.join("; ") }
      : { provider, model, usage, costUsd };
  }

  void dispatchWebhook(record);

  return record;
}

function positive(tokens: number | undefined): tokens is number {
  return typeof tokens === "number" && tokens > 0;
}

export function unpricedNotes(pricing: PricingEntry, usage: TokenUsage): string[] {
  const notes: string[] = [];
  if (positive(usage.cacheReadTokens) && pricing.cacheReadPricePerMillion === undefined) {
    notes.push(UNPRICED_CACHE_READ_NOTE);
  }
  const unpricedWrite =
    (positive(usage.cacheWrite5mTokens) && pricing.cacheWrite5mPricePerMillion === undefined) ||
    (positive(usage.cacheWrite1hTokens) && pricing.cacheWrite1hPricePerMillion === undefined);
  if (unpricedWrite) {
    notes.push(UNPRICED_CACHE_WRITE_NOTE);
  }
  return notes;
}

function promptTokens(usage: TokenUsage): number {
  return (
    usage.inputTokens +
    (usage.cacheReadTokens ?? 0) +
    (usage.cacheWrite5mTokens ?? 0) +
    (usage.cacheWrite1hTokens ?? 0)
  );
}

export function costFromPricing(pricing: PricingEntry, usage: TokenUsage): number {
  const tier = pricing.longPrompt;
  const rates: Omit<PricingEntry, "longPrompt"> =
    tier && promptTokens(usage) > tier.thresholdTokens ? tier.rates : pricing;

  const perMillion = (tokens: number | undefined, price: number | undefined): number =>
    tokens === undefined || price === undefined ? 0 : (tokens / 1_000_000) * price;

  return (
    perMillion(usage.inputTokens, rates.inputPricePerMillion) +
    perMillion(usage.outputTokens, rates.outputPricePerMillion) +
    perMillion(usage.cacheReadTokens, rates.cacheReadPricePerMillion) +
    perMillion(usage.cacheWrite5mTokens, rates.cacheWrite5mPricePerMillion) +
    perMillion(usage.cacheWrite1hTokens, rates.cacheWrite1hPricePerMillion)
  );
}
