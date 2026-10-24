import type { PricingEntry } from "./types.ts";
import { chutesPricing } from "./chutes-pricing.ts";
import { tokenreplyPricing } from "./tokenreply-pricing.ts";
import { resolveAnthropicPrice } from "../../packages/cli/src/tokens/prices/cost.ts";

const pricingTables: Record<string, Record<string, PricingEntry>> = {
  chutes: chutesPricing,
  tokenreply: tokenreplyPricing,
};

export function resolvePricing(provider: string, model: string): PricingEntry | undefined {
  if (provider === "anthropic") return resolveAnthropicPrice(model);
  return pricingTables[provider]?.[model];
}
