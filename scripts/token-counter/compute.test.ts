import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeTokenCost } from "./compute.ts";

beforeEach(() => {
  delete process.env.DIGISMITH_TOKEN_COUNTER_WEBHOOK_URL;
});

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

  it("computes input+output cost and sets a note when cache-read tokens are used but unpriced", () => {
    const record = computeTokenCost("chutes", "moonshotai/Kimi-K3-TEE", {
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      cacheReadTokens: 200_000,
    });

    expect(record.costUsd).toBeCloseTo(3 + 7.5, 10); // 1M input @ $3/M + 0.5M output @ $15/M, no cache rate
    expect(record.note).toMatch(/cache-read/i);
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
