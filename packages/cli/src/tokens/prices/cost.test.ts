import { describe, expect, it } from "vitest";
import { ANTHROPIC_PRICES_VERSION, anthropicPricing } from "./anthropic.ts";
import { costFromPricing, resolveAnthropicPrice } from "./cost.ts";

const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 1_000_000, cacheWrite5mTokens: 1_000_000, cacheWrite1hTokens: 1_000_000 };

describe("anthropic prices in the CLI", () => {
  it("carries the fetch date as its version", () => {
    expect(ANTHROPIC_PRICES_VERSION).toBe("2026-10-18");
  });
  it("prices every current model id", () => {
    expect(costFromPricing(resolveAnthropicPrice("claude-fable-5-1")!, usage)).toBeCloseTo(10 + 50 + 0.25 + 12.5 + 20, 9);
    expect(costFromPricing(resolveAnthropicPrice("claude-opus-5-5")!, usage)).toBeCloseTo(4 + 20 + 0.2 + 5 + 8, 9);
    expect(costFromPricing(resolveAnthropicPrice("claude-sonnet-5-5")!, usage)).toBeCloseTo(2 + 10 + 0.1 + 2.5 + 4, 9);
  });
  it("uses the Haiku 5.5 long tier per request", () => {
    const short = { inputTokens: 50_000, outputTokens: 0 };
    const long = { inputTokens: 150_000, outputTokens: 0 };
    expect(costFromPricing(resolveAnthropicPrice("claude-haiku-5-5")!, short)).toBeCloseTo(0.005, 9);
    expect(costFromPricing(resolveAnthropicPrice("claude-haiku-5-5")!, long)).toBeCloseTo(0.075, 9);
  });
  it("strips a date suffix once and never matches by prefix", () => {
    expect(resolveAnthropicPrice("claude-haiku-4-5-20251001")).toBe(anthropicPricing["claude-haiku-4-5"]);
    expect(resolveAnthropicPrice("claude-opus-5-9")).toBeUndefined();
    expect(resolveAnthropicPrice("<synthetic>")).toBeUndefined();
  });
  it("ignores inherited object keys", () => {
    expect(resolveAnthropicPrice("constructor")).toBeUndefined();
    expect(resolveAnthropicPrice("__proto__")).toBeUndefined();
    expect(resolveAnthropicPrice("toString")).toBeUndefined();
  });
});
