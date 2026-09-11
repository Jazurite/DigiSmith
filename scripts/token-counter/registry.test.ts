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
