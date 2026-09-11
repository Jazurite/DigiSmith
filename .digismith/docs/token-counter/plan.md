# Token Counter (K.4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a generic, local, hardcoded-pricing token/cost calculator (`scripts/token-counter/`) that works for any provider — including native Claude Code — with a fire-and-forget webhook hook point for a future (not-yet-built) consumer.

**Architecture:** Mirrors `scripts/providers/`'s existing shape: one pricing-data file per provider (`chutes`, `tokenreply`, `anthropic`), a shared `types.ts`, a `registry.ts` doing a plain object lookup, and a pure `compute.ts` that turns real token usage into a `CostRecord`. A separate `webhook.ts` handles the optional fire-and-forget POST as a side effect of computing.

**Tech Stack:** TypeScript (ESM, `NodeNext`), Vitest (zero-config, co-located `*.test.ts`), pnpm, Node's built-in `fetch`/`AbortController` — no new dependencies.

## Global Constraints

- Every relative import inside `scripts/token-counter/` uses an explicit `.ts` extension (e.g. `from "./types.ts"`) — required by the repo's `tsconfig.json` (`module`/`moduleResolution: NodeNext`, `allowImportingTsExtensions: true`), same pattern as `scripts/providers/`.
- `strict: true` is on repo-wide — no `any`, no implicit any-typed parameters.
- Tests are co-located `*.test.ts` files next to their source, run via `pnpm test` (`vitest run`, zero-config, no `vitest.config.*` in this repo).
- Fetch is mocked with `vi.stubGlobal("fetch", vi.fn()...)` — this repo has no `msw`/`nock`, don't add one.
- Field/env-var naming is final per the approved design's explicit corrections: the cost field is `costUsd` (not `gatewayCostUsd`), the webhook env var is `DIGISMITH_TOKEN_COUNTER_WEBHOOK_URL` (not anything with "analytics" or "gateway" in it).
- Out of scope for every task below (do not add code for these): K.4.2 (native-vs-gateway comparison logic), any analytics/consumer service, cumulative/running totals, live-fetched pricing, wiring this module into `offload-implementer` or any other specific caller.
- Pricing data is hardcoded. Where a figure is carried from an existing but explicitly-flagged-stale source (see Task 1), keep the citation comment — it documents a real, known limitation, not a placeholder.

---

### Task 1: Types & pricing registry

**Files:**
- Create: `scripts/token-counter/types.ts`
- Create: `scripts/token-counter/chutes-pricing.ts`
- Create: `scripts/token-counter/tokenreply-pricing.ts`
- Create: `scripts/token-counter/anthropic-pricing.ts`
- Create: `scripts/token-counter/registry.ts`
- Test: `scripts/token-counter/registry.test.ts`

**Interfaces:**
- Produces: `TokenUsage { inputTokens: number; outputTokens: number; cacheReadTokens?: number }`, `PricingEntry { inputPricePerMillion: number; outputPricePerMillion: number; cacheReadPricePerMillion?: number }`, `CostRecord { provider: string; model: string; usage: TokenUsage; costUsd: number | null; note?: string }` (all in `types.ts`); `resolvePricing(provider: string, model: string): PricingEntry | undefined` (in `registry.ts`).
- Consumes: nothing (first task, no dependencies).

- [ ] **Step 1: Write the failing test**

```typescript
// scripts/token-counter/registry.test.ts
import { describe, expect, it } from "vitest";
import { resolvePricing } from "./registry.ts";

describe("resolvePricing", () => {
  it("resolves Chutes' Kimi-K3-TEE pricing", () => {
    expect(resolvePricing("chutes", "moonshotai/Kimi-K3-TEE")).toEqual({
      inputPricePerMillion: 3,
      outputPricePerMillion: 15,
    });
  });

  it("resolves TokenReply's kimi-k2.7 pricing", () => {
    expect(resolvePricing("tokenreply", "kimi-k2.7")).toEqual({
      inputPricePerMillion: 0.95,
      outputPricePerMillion: 4.0,
      cacheReadPricePerMillion: 0.19,
    });
  });

  it("resolves TokenReply's gpt-5.6-luna pricing", () => {
    expect(resolvePricing("tokenreply", "gpt-5.6-luna")).toEqual({
      inputPricePerMillion: 0.02,
      outputPricePerMillion: 0.12,
    });
  });

  it("resolves Anthropic's claude-sonnet-5 pricing", () => {
    expect(resolvePricing("anthropic", "claude-sonnet-5")).toEqual({
      inputPricePerMillion: 3,
      outputPricePerMillion: 15,
      cacheReadPricePerMillion: 0.3,
    });
  });

  it("returns undefined for an unknown provider", () => {
    expect(resolvePricing("openai", "gpt-4")).toBeUndefined();
  });

  it("returns undefined for a known provider with an unknown model", () => {
    expect(resolvePricing("chutes", "does-not-exist")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run scripts/token-counter/registry.test.ts`
Expected: FAIL — `./registry.ts` does not exist (`Cannot find module`).

- [ ] **Step 3: Write the shared types**

```typescript
// scripts/token-counter/types.ts
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
}

export interface PricingEntry {
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  cacheReadPricePerMillion?: number;
}

export interface CostRecord {
  provider: string;
  model: string;
  usage: TokenUsage;
  costUsd: number | null;
  note?: string;
}
```

- [ ] **Step 4: Write the three pricing-data files**

```typescript
// scripts/token-counter/chutes-pricing.ts
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
```

```typescript
// scripts/token-counter/tokenreply-pricing.ts
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
```

```typescript
// scripts/token-counter/anthropic-pricing.ts
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
```

- [ ] **Step 5: Write the registry**

```typescript
// scripts/token-counter/registry.ts
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
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm exec vitest run scripts/token-counter/registry.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 7: Commit**

```bash
git add scripts/token-counter/types.ts scripts/token-counter/chutes-pricing.ts scripts/token-counter/tokenreply-pricing.ts scripts/token-counter/anthropic-pricing.ts scripts/token-counter/registry.ts scripts/token-counter/registry.test.ts
git commit -m "feat(token-counter): add pricing types and provider registry"
```

---

### Task 2: Webhook dispatch

**Files:**
- Create: `scripts/token-counter/webhook.ts`
- Test: `scripts/token-counter/webhook.test.ts`

**Interfaces:**
- Consumes: `CostRecord` from `scripts/token-counter/types.ts` (Task 1).
- Produces: `dispatchWebhook(record: CostRecord): Promise<void>` — reads `process.env.DIGISMITH_TOKEN_COUNTER_WEBHOOK_URL`; no-op (resolves immediately, no `fetch` call) when unset; otherwise POSTs the record as JSON with a 3-second timeout, logging via `console.error` and never throwing/rejecting on failure.

- [ ] **Step 1: Write the failing test**

```typescript
// scripts/token-counter/webhook.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchWebhook } from "./webhook.ts";
import type { CostRecord } from "./types.ts";

const SAMPLE_RECORD: CostRecord = {
  provider: "tokenreply",
  model: "gpt-5.6-luna",
  usage: { inputTokens: 100, outputTokens: 50 },
  costUsd: 0.000008,
};

afterEach(() => {
  delete process.env.DIGISMITH_TOKEN_COUNTER_WEBHOOK_URL;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("dispatchWebhook", () => {
  it("does nothing when DIGISMITH_TOKEN_COUNTER_WEBHOOK_URL is unset", async () => {
    delete process.env.DIGISMITH_TOKEN_COUNTER_WEBHOOK_URL;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await dispatchWebhook(SAMPLE_RECORD);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs the record as JSON when the webhook URL is configured", async () => {
    process.env.DIGISMITH_TOKEN_COUNTER_WEBHOOK_URL = "https://example.com/hook";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
    vi.stubGlobal("fetch", fetchMock);

    await dispatchWebhook(SAMPLE_RECORD);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/hook",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(SAMPLE_RECORD),
      }),
    );
  });

  it("logs but does not throw when the webhook POST fails", async () => {
    process.env.DIGISMITH_TOKEN_COUNTER_WEBHOOK_URL = "https://example.com/hook";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(dispatchWebhook(SAMPLE_RECORD)).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("network down"));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run scripts/token-counter/webhook.test.ts`
Expected: FAIL — `./webhook.ts` does not exist (`Cannot find module`).

- [ ] **Step 3: Write the implementation**

```typescript
// scripts/token-counter/webhook.ts
import type { CostRecord } from "./types.ts";

const WEBHOOK_TIMEOUT_MS = 3000;

export async function dispatchWebhook(record: CostRecord): Promise<void> {
  const url = process.env.DIGISMITH_TOKEN_COUNTER_WEBHOOK_URL;
  if (!url) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
      signal: controller.signal,
    });
  } catch (err) {
    console.error(`token-counter: webhook dispatch failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timeout);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run scripts/token-counter/webhook.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/token-counter/webhook.ts scripts/token-counter/webhook.test.ts
git commit -m "feat(token-counter): add fire-and-forget webhook dispatch"
```

---

### Task 3: Cost computation (public entry point)

**Files:**
- Create: `scripts/token-counter/compute.ts`
- Test: `scripts/token-counter/compute.test.ts`

**Interfaces:**
- Consumes: `resolvePricing(provider: string, model: string): PricingEntry | undefined` from `registry.ts` (Task 1); `dispatchWebhook(record: CostRecord): Promise<void>` from `webhook.ts` (Task 2); `TokenUsage`, `PricingEntry`, `CostRecord` from `types.ts` (Task 1).
- Produces: `computeTokenCost(provider: string, model: string, usage: TokenUsage): CostRecord` — the module's public entry point. Pure with respect to its return value (never throws on an unknown provider/model, returns `costUsd: null` plus `note: "no pricing data for provider/model"` instead); fires `dispatchWebhook` as a side effect after computing.

- [ ] **Step 1: Write the failing test**

```typescript
// scripts/token-counter/compute.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { computeTokenCost } from "./compute.ts";

afterEach(() => {
  delete process.env.DIGISMITH_TOKEN_COUNTER_WEBHOOK_URL;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("computeTokenCost", () => {
  it("computes correct cost for a known provider/model with input+output tokens", () => {
    const record = computeTokenCost("tokenreply", "gpt-5.6-luna", {
      inputTokens: 1_000_000,
      outputTokens: 500_000,
    });

    expect(record).toEqual({
      provider: "tokenreply",
      model: "gpt-5.6-luna",
      usage: { inputTokens: 1_000_000, outputTokens: 500_000 },
      costUsd: 0.08, // 1M input @ $0.02/M ($0.02) + 0.5M output @ $0.12/M ($0.06)
    });
  });

  it("includes cache-read cost when the pricing entry and usage both provide it", () => {
    const record = computeTokenCost("tokenreply", "kimi-k2.7", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadTokens: 1_000_000,
    });

    expect(record.costUsd).toBeCloseTo(0.95 + 4.0 + 0.19, 10);
  });

  it("returns costUsd null with a marker for an unknown provider/model", () => {
    const record = computeTokenCost("openai", "gpt-4", { inputTokens: 100, outputTokens: 50 });

    expect(record).toEqual({
      provider: "openai",
      model: "gpt-4",
      usage: { inputTokens: 100, outputTokens: 50 },
      costUsd: null,
      note: "no pricing data for provider/model",
    });
  });

  it("fires the webhook with the computed record when the URL is configured", async () => {
    process.env.DIGISMITH_TOKEN_COUNTER_WEBHOOK_URL = "https://example.com/hook";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
    vi.stubGlobal("fetch", fetchMock);

    computeTokenCost("tokenreply", "gpt-5.6-luna", { inputTokens: 100, outputTokens: 50 });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/hook",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("does not call fetch when the webhook URL is unset", () => {
    delete process.env.DIGISMITH_TOKEN_COUNTER_WEBHOOK_URL;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    computeTokenCost("tokenreply", "gpt-5.6-luna", { inputTokens: 100, outputTokens: 50 });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run scripts/token-counter/compute.test.ts`
Expected: FAIL — `./compute.ts` does not exist (`Cannot find module`).

- [ ] **Step 3: Write the implementation**

```typescript
// scripts/token-counter/compute.ts
import type { CostRecord, PricingEntry, TokenUsage } from "./types.ts";
import { resolvePricing } from "./registry.ts";
import { dispatchWebhook } from "./webhook.ts";

const UNKNOWN_PRICING_NOTE = "no pricing data for provider/model";

export function computeTokenCost(provider: string, model: string, usage: TokenUsage): CostRecord {
  const pricing = resolvePricing(provider, model);

  const record: CostRecord = pricing
    ? { provider, model, usage, costUsd: costFromPricing(pricing, usage) }
    : { provider, model, usage, costUsd: null, note: UNKNOWN_PRICING_NOTE };

  void dispatchWebhook(record);

  return record;
}

function costFromPricing(pricing: PricingEntry, usage: TokenUsage): number {
  const inputCost = (usage.inputTokens / 1_000_000) * pricing.inputPricePerMillion;
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.outputPricePerMillion;
  const cacheCost =
    usage.cacheReadTokens && pricing.cacheReadPricePerMillion
      ? (usage.cacheReadTokens / 1_000_000) * pricing.cacheReadPricePerMillion
      : 0;
  return inputCost + outputCost + cacheCost;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run scripts/token-counter/compute.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Run the full token-counter suite**

Run: `pnpm exec vitest run scripts/token-counter`
Expected: PASS (14 tests total across `registry.test.ts`, `webhook.test.ts`, `compute.test.ts`)

- [ ] **Step 6: Commit**

```bash
git add scripts/token-counter/compute.ts scripts/token-counter/compute.test.ts
git commit -m "feat(token-counter): add computeTokenCost, wire in webhook dispatch"
```
