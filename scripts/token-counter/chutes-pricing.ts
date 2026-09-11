import type { PricingEntry } from "./types.ts";

// Figure carried from K.4's own design doc (.digismith/docs/token-counter/design.html);
// not yet independently confirmed against Chutes' own billing dashboard — re-verify
// before relying on it for real cost decisions, same caveat as TokenReply's kimi-k3
// entry below.
export const chutesPricing: Record<string, PricingEntry> = {
  "moonshotai/Kimi-K3-TEE": {
    inputPricePerMillion: 3,
    outputPricePerMillion: 15,
  },
};
