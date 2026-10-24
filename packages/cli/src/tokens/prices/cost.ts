import { anthropicPricing } from "./anthropic.ts";
import type { PricingEntry, TokenUsage } from "./types.ts";

export const UNPRICED_CACHE_READ_NOTE =
  "cache-read tokens present but not priced for this provider/model — cache-read cost excluded";
export const UNPRICED_CACHE_WRITE_NOTE =
  "cache-write tokens present but not priced for this provider/model — cache-write cost excluded";

function positive(tokens: number | undefined): tokens is number {
  return typeof tokens === "number" && tokens > 0;
}

function promptTokens(usage: TokenUsage): number {
  return (
    usage.inputTokens +
    (usage.cacheReadTokens ?? 0) +
    (usage.cacheWrite5mTokens ?? 0) +
    (usage.cacheWrite1hTokens ?? 0)
  );
}

/** The rates a request is charged at: the long-prompt tier when its prompt is over the threshold. */
function effectiveRates(pricing: PricingEntry, usage: TokenUsage): Omit<PricingEntry, "longPrompt"> {
  const tier = pricing.longPrompt;
  return tier && promptTokens(usage) > tier.thresholdTokens ? tier.rates : pricing;
}

export function unpricedNotes(pricing: PricingEntry, usage: TokenUsage): string[] {
  const rates = effectiveRates(pricing, usage);
  const notes: string[] = [];
  if (positive(usage.cacheReadTokens) && rates.cacheReadPricePerMillion === undefined) {
    notes.push(UNPRICED_CACHE_READ_NOTE);
  }
  const unpricedWrite =
    (positive(usage.cacheWrite5mTokens) && rates.cacheWrite5mPricePerMillion === undefined) ||
    (positive(usage.cacheWrite1hTokens) && rates.cacheWrite1hPricePerMillion === undefined);
  if (unpricedWrite) {
    notes.push(UNPRICED_CACHE_WRITE_NOTE);
  }
  return notes;
}

export function costFromPricing(pricing: PricingEntry, usage: TokenUsage): number {
  const rates = effectiveRates(pricing, usage);

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

// Anthropic ids can carry a date suffix (claude-haiku-4-5-20251001). Strip it once and look
// again. Never match by prefix: claude-opus-5-5 must not fall back to claude-opus-5.
const DATE_SUFFIX = /-\d{8}$/;

export function resolveAnthropicPrice(model: string): PricingEntry | undefined {
  for (const key of [model, model.replace(DATE_SUFFIX, "")]) {
    if (Object.hasOwn(anthropicPricing, key)) return anthropicPricing[key];
  }
  return undefined;
}
