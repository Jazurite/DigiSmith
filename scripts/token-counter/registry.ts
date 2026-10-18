import type { PricingEntry } from "./types.ts";
import { chutesPricing } from "./chutes-pricing.ts";
import { tokenreplyPricing } from "./tokenreply-pricing.ts";
import { anthropicPricing } from "./anthropic-pricing.ts";

const pricingTables: Record<string, Record<string, PricingEntry>> = {
  chutes: chutesPricing,
  tokenreply: tokenreplyPricing,
  anthropic: anthropicPricing,
};

// Anthropic ids can carry a date suffix (claude-haiku-4-5-20251001). Strip it once and look
// again. Never match by prefix: claude-opus-5-5 must not fall back to claude-opus-5.
const DATE_SUFFIX = /-\d{8}$/;

export function resolvePricing(provider: string, model: string): PricingEntry | undefined {
  const table = pricingTables[provider];
  const exact = table?.[model];
  if (exact || provider !== "anthropic") {
    return exact;
  }
  return table?.[model.replace(DATE_SUFFIX, "")];
}
