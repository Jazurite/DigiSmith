import type { PricingEntry } from "./types.ts";

// USD per million tokens, from Anthropic's official pricing page, table "Model pricing":
// https://platform.claude.com/docs/en/about-claude/pricing — fetched 2026-10-18 (DGS-567).
// Cache read is the listed price, not a multiplier: it is 0.05x input on Opus 5.5 and
// Sonnet 5.5, 0.025x on Fable 5.1, 0.1x on the older models.
// Not priced here: fast mode, batch, US-only (1.1x), cloud-platform prices.
// Re-confirm against the page before relying on this for invoicing decisions.
// The fetch date of this table. Bump it with every price change: tokens.json records it.
export const ANTHROPIC_PRICES_VERSION = "2026-10-18";

export const anthropicPricing: Record<string, PricingEntry> = {
  "claude-fable-5-1": {
    inputPricePerMillion: 10,
    outputPricePerMillion: 50,
    cacheReadPricePerMillion: 0.25,
    cacheWrite5mPricePerMillion: 12.5,
    cacheWrite1hPricePerMillion: 20,
  },
  "claude-opus-5-5": {
    inputPricePerMillion: 4,
    outputPricePerMillion: 20,
    cacheReadPricePerMillion: 0.2,
    cacheWrite5mPricePerMillion: 5,
    cacheWrite1hPricePerMillion: 8,
  },
  "claude-opus-5": {
    inputPricePerMillion: 5,
    outputPricePerMillion: 25,
    cacheReadPricePerMillion: 0.5,
    cacheWrite5mPricePerMillion: 6.25,
    cacheWrite1hPricePerMillion: 10,
  },
  "claude-sonnet-5-5": {
    inputPricePerMillion: 2,
    outputPricePerMillion: 10,
    cacheReadPricePerMillion: 0.1,
    cacheWrite5mPricePerMillion: 2.5,
    cacheWrite1hPricePerMillion: 4,
  },
  "claude-sonnet-5": {
    inputPricePerMillion: 2,
    outputPricePerMillion: 10,
    cacheReadPricePerMillion: 0.2,
    cacheWrite5mPricePerMillion: 2.5,
    cacheWrite1hPricePerMillion: 4,
  },
  // Haiku 5.5 is priced per request by prompt length: over 100,000 tokens pays the long rates.
  "claude-haiku-5-5": {
    inputPricePerMillion: 0.1,
    outputPricePerMillion: 0.5,
    cacheReadPricePerMillion: 0.01,
    cacheWrite5mPricePerMillion: 0.125,
    cacheWrite1hPricePerMillion: 0.2,
    longPrompt: {
      thresholdTokens: 100_000,
      rates: {
        inputPricePerMillion: 0.5,
        outputPricePerMillion: 2.5,
        cacheReadPricePerMillion: 0.05,
        cacheWrite5mPricePerMillion: 0.625,
        cacheWrite1hPricePerMillion: 1,
      },
    },
  },
  "claude-haiku-4-5": {
    inputPricePerMillion: 1,
    outputPricePerMillion: 5,
    cacheReadPricePerMillion: 0.1,
    cacheWrite5mPricePerMillion: 1.25,
    cacheWrite1hPricePerMillion: 2,
  },
};
