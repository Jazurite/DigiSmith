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
      inputPricePerMillion: 0.2,
      outputPricePerMillion: 1.2,
      cacheReadPricePerMillion: 0.02,
    });
  });

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

  it("returns undefined for an unknown provider", () => {
    expect(resolvePricing("openai", "gpt-4")).toBeUndefined();
  });

  it("returns undefined for a known provider with an unknown model", () => {
    expect(resolvePricing("chutes", "does-not-exist")).toBeUndefined();
  });
});
