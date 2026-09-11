import type { PricingEntry } from "./types.ts";
import { chutesPricing } from "./chutes-pricing.ts";
import { tokenreplyPricing } from "./tokenreply-pricing.ts";
import { anthropicPricing } from "./anthropic-pricing.ts";

const pricingTables: Record<string, Record<string, PricingEntry>> = {
  chutes: chutesPricing,
  tokenreply: tokenreplyPricing,
  anthropic: anthropicPricing,
};

export function resolvePricing(provider: string, model: string): PricingEntry | undefined {
  return pricingTables[provider]?.[model];
}
