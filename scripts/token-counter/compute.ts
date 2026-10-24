import type { CostRecord, TokenUsage } from "./types.ts";
import { costFromPricing, unpricedNotes } from "../../packages/cli/src/tokens/prices/cost.ts";
import { resolvePricing } from "./registry.ts";
import { dispatchWebhook } from "./webhook.ts";

export { costFromPricing, unpricedNotes };

const UNKNOWN_PRICING_NOTE = "no pricing data for provider/model";

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
