import type { PricingEntry } from "./types.ts";

export const tokenreplyPricing: Record<string, PricingEntry> = {
  // Real figure observed against TokenReply's Trial tier — see
  // backlog/ai-gateway-vendors-k3.md. That file's own 2026-09-04 update flags this rate
  // as unverified specifically for kimi-k3 (TokenReply added kimi-k3 after this rate was
  // recorded against kimi-k2.7); re-confirm via TokenReply's dashboard before trusting
  // either entry below for real cost decisions.
  "kimi-k2.7": {
    inputPricePerMillion: 0.95,
    outputPricePerMillion: 4.0,
    cacheReadPricePerMillion: 0.19,
  },
  // Carried over from kimi-k2.7's rate as a stand-in — TokenReply's kimi-k3 rate has
  // never been independently confirmed (see the same staleness note above).
  "kimi-k3": {
    inputPricePerMillion: 0.95,
    outputPricePerMillion: 4.0,
    cacheReadPricePerMillion: 0.19,
  },
  // Confirmed via scripts/providers/tokenreply.ts's own comment, sourced from
  // TokenReply's live model catalog (2026-09-05).
  "gpt-5.6-luna": {
    inputPricePerMillion: 0.02,
    outputPricePerMillion: 0.12,
  },
};
