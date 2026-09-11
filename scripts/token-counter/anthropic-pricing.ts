import type { PricingEntry } from "./types.ts";

// Rates mirror Anthropic's published per-tier structure as of 2026-09-11 (Opus / Sonnet /
// Haiku tiers, cache-read priced at 10% of the input rate per Anthropic's standard
// convention). Hardcoded like the gateway tables above — re-confirm against Anthropic's
// current pricing page before relying on this for real invoicing decisions.
export const anthropicPricing: Record<string, PricingEntry> = {
  "claude-opus-5": {
    inputPricePerMillion: 15,
    outputPricePerMillion: 75,
    cacheReadPricePerMillion: 1.5,
  },
  "claude-sonnet-5": {
    inputPricePerMillion: 3,
    outputPricePerMillion: 15,
    cacheReadPricePerMillion: 0.3,
  },
  "claude-haiku-4-5-20251001": {
    inputPricePerMillion: 1,
    outputPricePerMillion: 5,
    cacheReadPricePerMillion: 0.1,
  },
};
