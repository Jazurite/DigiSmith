# DGS-567 Anthropic Price Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `computeTokenCost("anthropic", <current model id>, usage)` return a real cost, including cache-write tokens, using Anthropic's official prices.

**Architecture:** Three small tasks, one commit each. Task 1 adds the cache-write and long-prompt fields to the types and the cost function (tested with literal pricing entries, no table needed). Task 2 replaces the Anthropic table and makes `resolvePricing` strip a date suffix. Task 3 adds one end-to-end cost test per model id through `computeTokenCost`.

**Tech Stack:** TypeScript (ESM, `.ts` import extensions), Vitest, pnpm. No new dependencies.

## Global Constraints

- Spec: `.digismith/board/DGS-567—price-table/spec.md` (approved at checkpoint 1, 2026-10-18). Source of prices: https://platform.claude.com/docs/en/about-claude/pricing, table "Model pricing", fetched 2026-10-18. USD per million tokens.
- Relative imports inside `scripts/token-counter/` use an explicit `.ts` extension. `strict: true`; no `any`.
- Tests are co-located `*.test.ts`, run with `pnpm test` (`vitest run`). pnpm only, never npm.
- Cache read price is the listed price, never a multiplier of input. Cache read is 0.05x on Opus 5.5 and Sonnet 5.5, 0.025x on Fable 5.1, and these are stored as the listed dollars.
- Model-id match: exact key first, then strip a trailing `-YYYYMMDD`, then stop. No loose prefix match (`claude-opus-5-5` must never resolve to `claude-opus-5`). Unknown id: `undefined`, cost `null`.
- Haiku 5.5 long tier: when input + cache-read + cache-write tokens of one record are over 100,000, use the long rates. One record is one request.
- Out of scope: fast mode, batch, US-only 1.1x, cloud-platform prices, other providers' tables, any `dg` cost command (DGS-545 / DGS-546), the DGS-563 spike numbers.
- Commit messages: conventional, title only, no AI attribution. One commit per task.
- Do not review your own work. This build runs in role mode (see "Build mode" below).

## Build mode: role mode

The build runs with `DIGISMITH_REVIEW_MODE=role` (Workbox runbook, "Start of a Reviewer"). The Builder never starts or runs a review. A conductor starts each Reviewer.

- Each task below is one commit, so each task review gets a small diff file.
- After each task the Builder runs `scripts/review-package`, then `dg reviewer pack --type task --ticket DGS-567 --task <N> ...`, appends `Task <N>: review requested` to the ledger, reports `STOP: task-review-ready <pack folder>` and waits. The Reviewer reads the ticket key from the `ticket:` line of `pack.md`; the Builder passes `DGS-567` in every pack.
- After Task 3: `dg reviewer pack --type ticket --ticket DGS-567 ...`, then `STOP: ticket-review-ready <pack folder>`.
- The global `dg reviewer pack --help` already lists `--ticket` (checked 2026-10-18), so the Builder uses the global `dg`; no worktree CLI is needed.
- For the ticket pack: `--spec` is `spec.md` (this ticket has no `design.html`). `--ticket-file` is the build ticket's `ticket.md` in this board folder (the Refiner output of checkpoint 3 names it).
- **First use after the merge:** the change is a library. No `dg` command calls it, so the global `dg` needs no rebuild. First use: on the main checkout, run `pnpm vitest run scripts/token-counter` after the merge and check it passes. The next work that uses the table is DGS-545 / DGS-546.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `scripts/token-counter/types.ts` | `TokenUsage` and `PricingEntry` fields | 1 |
| `scripts/token-counter/compute.ts` | `costFromPricing` (exported), notes for unpriced cache read/write | 1 |
| `scripts/token-counter/anthropic-pricing.ts` | The seven Anthropic rows and their source comment | 2 |
| `scripts/token-counter/registry.ts` | `resolvePricing` with date-suffix strip for `anthropic` | 2 |
| `scripts/token-counter/registry.test.ts` | Resolve tests | 2 |
| `scripts/token-counter/compute.test.ts` | Cost tests | 1, 3 |

---

### Task 1: Cache-write and long-prompt cost

**Files:**
- Modify: `scripts/token-counter/types.ts`
- Modify: `scripts/token-counter/compute.ts`
- Test: `scripts/token-counter/compute.test.ts`

**Interfaces:**
- Produces (types):
  - `TokenUsage` gains `cacheWrite5mTokens?: number` and `cacheWrite1hTokens?: number`.
  - `PricingEntry` gains `cacheWrite5mPricePerMillion?: number`, `cacheWrite1hPricePerMillion?: number` and `longPrompt?: LongPromptTier`.
  - `export interface LongPromptTier { thresholdTokens: number; rates: Omit<PricingEntry, "longPrompt"> }`.
- Produces (compute): `export function costFromPricing(pricing: PricingEntry, usage: TokenUsage): number` and `export function unpricedNotes(pricing: PricingEntry, usage: TokenUsage): string[]`. Task 3 relies on `computeTokenCost` using them.
- Rule: "no price" is `undefined`. A price of `0` is a real price of zero (a free tier). No check anywhere uses truthiness on a price.

- [ ] **Step 1: Write the failing tests**

In `scripts/token-counter/compute.test.ts`, change the import line to
`import { computeTokenCost, costFromPricing, unpricedNotes } from "./compute.ts";`
and add this block at the end of the file:

```ts
describe("costFromPricing: cache writes and long prompt", () => {
  const withWrites = {
    inputPricePerMillion: 4,
    outputPricePerMillion: 20,
    cacheReadPricePerMillion: 0.2,
    cacheWrite5mPricePerMillion: 5,
    cacheWrite1hPricePerMillion: 8,
  };

  it("adds 5m and 1h cache-write cost", () => {
    const cost = costFromPricing(withWrites, {
      inputTokens: 0,
      outputTokens: 0,
      cacheWrite5mTokens: 1_000_000,
      cacheWrite1hTokens: 500_000,
    });

    expect(cost).toBeCloseTo(5 + 4, 10); // 1M @ $5/M + 0.5M @ $8/M
  });

  it("adds nothing for cache-write tokens that are absent or zero", () => {
    const cost = costFromPricing(withWrites, {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheWrite5mTokens: 0,
    });

    expect(cost).toBeCloseTo(4, 10);
  });

  const tiered = {
    inputPricePerMillion: 0.1,
    outputPricePerMillion: 0.5,
    cacheWrite5mPricePerMillion: 0.125,
    longPrompt: {
      thresholdTokens: 100_000,
      rates: {
        inputPricePerMillion: 0.5,
        outputPricePerMillion: 2.5,
        cacheWrite5mPricePerMillion: 0.625,
      },
    },
  };

  it("uses the base rates when the prompt is exactly at the threshold", () => {
    const cost = costFromPricing(tiered, { inputTokens: 100_000, outputTokens: 1_000_000 });

    expect(cost).toBeCloseTo(0.01 + 0.5, 10);
  });

  it("uses the long-prompt rates when the prompt is one token over the threshold", () => {
    const cost = costFromPricing(tiered, { inputTokens: 100_001, outputTokens: 1_000_000 });

    expect(cost).toBeCloseTo(0.0500005 + 2.5, 10);
  });

  it("counts cache-read and cache-write tokens toward the prompt length", () => {
    const cost = costFromPricing(tiered, {
      inputTokens: 40_000,
      outputTokens: 0,
      cacheReadTokens: 30_000,
      cacheWrite5mTokens: 40_000,
    });

    // prompt = 110,000 > 100,000, so long rates. Long tier has no cache-read price: 0.
    expect(cost).toBeCloseTo(0.02 + 0.025, 10);
  });
});

describe("a price of 0 is a real price", () => {
  const free = {
    inputPricePerMillion: 1,
    outputPricePerMillion: 0,
    cacheReadPricePerMillion: 0,
    cacheWrite5mPricePerMillion: 0,
  };
  const usage = {
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
    cacheReadTokens: 1_000_000,
    cacheWrite5mTokens: 1_000_000,
  };

  it("costs zero for a token kind priced at 0", () => {
    expect(costFromPricing(free, usage)).toBeCloseTo(1, 10); // only the input is paid
  });

  it("does not report a 0 price as unpriced, but does report a missing price", () => {
    expect(unpricedNotes(free, usage)).toEqual([]);

    const missing = { inputPricePerMillion: 1, outputPricePerMillion: 0 };
    expect(unpricedNotes(missing, usage)).toHaveLength(2); // cache read and cache write
  });
});

describe("computeTokenCost: unpriced cache writes", () => {
  it("sets a note when cache-write tokens are used but the entry has no write price", () => {
    const record = computeTokenCost("tokenreply", "kimi-k2.7", {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheWrite5mTokens: 100,
    });

    expect(record.costUsd).toBeCloseTo(0.95, 10);
    expect(record.note).toMatch(/cache-write/i);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run scripts/token-counter/compute.test.ts`
Expected: FAIL (`costFromPricing` is not exported; type errors on the new fields).

- [ ] **Step 3: Write the implementation**

`scripts/token-counter/types.ts`: add the two token fields to `TokenUsage`, after `cacheReadTokens?: number;`:

```ts
  /**
   * Tokens written to the 5-minute prompt cache. Billed at the cache-write rate,
   * not at the input rate: keep them out of `inputTokens`.
   */
  cacheWrite5mTokens?: number;
  /** Tokens written to the 1-hour prompt cache. Same rule as `cacheWrite5mTokens`. */
  cacheWrite1hTokens?: number;
```

Replace `PricingEntry` with:

```ts
export interface PricingEntry {
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  cacheReadPricePerMillion?: number;
  cacheWrite5mPricePerMillion?: number;
  cacheWrite1hPricePerMillion?: number;
  /**
   * A higher price set for one request whose prompt is longer than
   * `thresholdTokens`. Prompt length is input + cache-read + cache-write tokens.
   * One `TokenUsage` must be one request, or the tier is wrong.
   */
  longPrompt?: LongPromptTier;
}

export interface LongPromptTier {
  thresholdTokens: number;
  rates: Omit<PricingEntry, "longPrompt">;
}
```

`scripts/token-counter/compute.ts`: add a constant next to the existing notes:

```ts
const UNPRICED_CACHE_WRITE_NOTE =
  "cache-write tokens present but not priced for this provider/model — cache-write cost excluded";
```

Replace the `hasUnpricedCacheRead` block and the `record = ...` assignment in `computeTokenCost` with:

```ts
    const notes = unpricedNotes(pricing, usage);
    record = notes.length > 0
      ? { provider, model, usage, costUsd, note: notes.join("; ") }
      : { provider, model, usage, costUsd };
```

Replace `costFromPricing` with the exported version and add the helpers:

```ts
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
```

Remove the old private `costFromPricing`. Keep the `PricingEntry` import (still used by the helpers).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run scripts/token-counter`
Expected: PASS, all files in `scripts/token-counter` (the existing cache-read note test keeps its exact behaviour).

- [ ] **Step 5: Commit**

```bash
git add scripts/token-counter/types.ts scripts/token-counter/compute.ts scripts/token-counter/compute.test.ts
git commit -m "feat(dgs-567): cost cache writes and long prompts in the token counter"
```

---

### Task 2: Anthropic price table and model-id resolve

**Files:**
- Modify: `scripts/token-counter/anthropic-pricing.ts` (replace the whole file)
- Modify: `scripts/token-counter/registry.ts`
- Test: `scripts/token-counter/registry.test.ts`

**Interfaces:**
- Consumes: Task 1's `PricingEntry` fields (`cacheWrite5mPricePerMillion`, `cacheWrite1hPricePerMillion`, `longPrompt`).
- Produces: `anthropicPricing` keys `claude-fable-5-1`, `claude-opus-5-5`, `claude-opus-5`, `claude-sonnet-5-5`, `claude-sonnet-5`, `claude-haiku-5-5`, `claude-haiku-4-5`. `resolvePricing(provider, model)` signature unchanged. Task 3 relies on these keys.

- [ ] **Step 1: Write the failing tests**

In `scripts/token-counter/registry.test.ts`, replace the test "resolves Anthropic's claude-sonnet-5 pricing" with:

```ts
  it("resolves Anthropic's claude-sonnet-5 pricing", () => {
    expect(resolvePricing("anthropic", "claude-sonnet-5")).toEqual({
      inputPricePerMillion: 2,
      outputPricePerMillion: 10,
      cacheReadPricePerMillion: 0.2,
      cacheWrite5mPricePerMillion: 2.5,
      cacheWrite1hPricePerMillion: 4,
    });
  });

  it("resolves Anthropic's current model ids with their own cache-read prices", () => {
    expect(resolvePricing("anthropic", "claude-opus-5-5")?.cacheReadPricePerMillion).toBe(0.2);
    expect(resolvePricing("anthropic", "claude-sonnet-5-5")?.cacheReadPricePerMillion).toBe(0.1);
    expect(resolvePricing("anthropic", "claude-fable-5-1")?.cacheReadPricePerMillion).toBe(0.25);
    expect(resolvePricing("anthropic", "claude-haiku-5-5")?.longPrompt?.thresholdTokens).toBe(100_000);
  });

  it("strips a date suffix from an Anthropic model id", () => {
    expect(resolvePricing("anthropic", "claude-haiku-4-5-20251001")).toEqual(
      resolvePricing("anthropic", "claude-haiku-4-5"),
    );
    expect(resolvePricing("anthropic", "claude-haiku-4-5")).toBeDefined();
  });

  it("never falls back to a shorter model id by prefix", () => {
    expect(resolvePricing("anthropic", "claude-opus-5-6")).toBeUndefined();
    expect(resolvePricing("anthropic", "claude-opus-5-5-preview")).toBeUndefined();
  });

  it("does not strip date suffixes for other providers", () => {
    expect(resolvePricing("tokenreply", "kimi-k2.7-20251001")).toBeUndefined();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run scripts/token-counter/registry.test.ts`
Expected: FAIL (old keys and prices).

- [ ] **Step 3: Write the implementation**

Replace `scripts/token-counter/anthropic-pricing.ts` with:

```ts
import type { PricingEntry } from "./types.ts";

// USD per million tokens, from Anthropic's official pricing page, table "Model pricing":
// https://platform.claude.com/docs/en/about-claude/pricing — fetched 2026-10-18 (DGS-567).
// Cache read is the listed price, not a multiplier: it is 0.05x input on Opus 5.5 and
// Sonnet 5.5, 0.025x on Fable 5.1, 0.1x on the older models.
// Not priced here: fast mode, batch, US-only (1.1x), cloud-platform prices.
// Re-confirm against the page before relying on this for invoicing decisions.
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
```

Replace `resolvePricing` in `scripts/token-counter/registry.ts` with:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run scripts/token-counter`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/token-counter/anthropic-pricing.ts scripts/token-counter/registry.ts scripts/token-counter/registry.test.ts
git commit -m "fix(dgs-567): price the current Claude model ids and resolve dated ids"
```

---

### Task 3: One cost test per model id

**Files:**
- Test: `scripts/token-counter/compute.test.ts`

**Interfaces:**
- Consumes: Task 2's table keys; Task 1's `computeTokenCost` with cache-write usage fields.
- Produces: nothing later tasks use.

- [ ] **Step 1: Write the tests**

Add at the end of `scripts/token-counter/compute.test.ts`:

```ts
describe("computeTokenCost: every Anthropic model id gets a cost", () => {
  // 1M tokens in each of input, output, cache read, cache write 5m and 1h:
  // the cost is the sum of the five listed prices.
  const million = {
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
    cacheReadTokens: 1_000_000,
    cacheWrite5mTokens: 1_000_000,
    cacheWrite1hTokens: 1_000_000,
  };

  it.each([
    ["claude-fable-5-1", 10 + 50 + 0.25 + 12.5 + 20],
    ["claude-opus-5-5", 4 + 20 + 0.2 + 5 + 8],
    ["claude-opus-5", 5 + 25 + 0.5 + 6.25 + 10],
    ["claude-sonnet-5-5", 2 + 10 + 0.1 + 2.5 + 4],
    ["claude-sonnet-5", 2 + 10 + 0.2 + 2.5 + 4],
    ["claude-haiku-4-5", 1 + 5 + 0.1 + 1.25 + 2],
    ["claude-haiku-4-5-20251001", 1 + 5 + 0.1 + 1.25 + 2],
    // The prompt here is 4M tokens, over 100,000: Haiku 5.5 long rates.
    ["claude-haiku-5-5", 0.5 + 2.5 + 0.05 + 0.625 + 1],
  ])("%s costs %d USD for 1M tokens of each kind", (model, expected) => {
    const record = computeTokenCost("anthropic", model, million);

    expect(record.costUsd).toBeCloseTo(expected, 10);
    expect(record.note).toBeUndefined();
  });

  it("prices a Haiku 5.5 request under 100,000 prompt tokens at the base rates", () => {
    const record = computeTokenCost("anthropic", "claude-haiku-5-5", {
      inputTokens: 10_000,
      outputTokens: 10_000,
      cacheReadTokens: 10_000,
      cacheWrite5mTokens: 10_000,
      cacheWrite1hTokens: 10_000,
    });

    expect(record.costUsd).toBeCloseTo((0.1 + 0.5 + 0.01 + 0.125 + 0.2) * 0.01, 10);
  });

  it("still returns null for an unknown Anthropic model id", () => {
    const record = computeTokenCost("anthropic", "claude-opus-9-9", million);

    expect(record.costUsd).toBeNull();
    expect(record.note).toBe("no pricing data for provider/model");
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `pnpm vitest run scripts/token-counter`
Expected: PASS at once (Tasks 1 and 2 hold the code; this task locks it in). To prove the tests bite, temporarily change `"claude-opus-5-5"` in `anthropic-pricing.ts` output price from 20 to 21, run again, see the Opus 5.5 case FAIL, then restore it with `git checkout -- scripts/token-counter/anthropic-pricing.ts` and run again to see PASS.

- [ ] **Step 3: Run the whole suite**

Run: `pnpm test`
Expected: PASS, no new failures against `main`.

- [ ] **Step 4: Commit**

```bash
git add scripts/token-counter/compute.test.ts
git commit -m "test(dgs-567): lock the cost of every current Anthropic model id"
```

---

## Self-Review

- **Spec coverage:** wrong keys and old models (Task 2); cache-write fields and cost (Task 1); date-suffix resolve with no prefix match (Task 2); Haiku long tier (Tasks 1, 2, 3); prices with source and date (Task 2 header); one test per current id, dated id, no-prefix, 5m and 1h writes, unpriced-write note, unknown id (Tasks 1 to 3). Out-of-scope list is in Global Constraints.
- **Placeholders:** none.
- **Types:** `LongPromptTier`, `cacheWrite5mPricePerMillion`, `cacheWrite1hPricePerMillion`, `cacheWrite5mTokens`, `cacheWrite1hTokens`, `costFromPricing` carry the same names in every task.
- **Zero price:** a price of `0` is a real price (Maestro ruling at checkpoint 2). `perMillion` and `unpricedNotes` test `undefined`, never truthiness. Task 1 has a test for it.
