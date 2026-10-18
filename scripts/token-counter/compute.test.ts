import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeTokenCost, costFromPricing, unpricedNotes } from "./compute.ts";

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
      costUsd: 0.8, // 1M input @ $0.20/M ($0.20) + 0.5M output @ $1.20/M ($0.60)
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

describe("unpriced cache writes", () => {
  const noWritePrice = { inputPricePerMillion: 0.95, outputPricePerMillion: 4 };

  it("sets a note when cache-write tokens are used but the entry has no write price", () => {
    const usage = { inputTokens: 1_000_000, outputTokens: 0, cacheWrite5mTokens: 100 };

    expect(costFromPricing(noWritePrice, usage)).toBeCloseTo(0.95, 10);
    const notes = unpricedNotes(noWritePrice, usage);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/cache-write/i);
  });

  it("sets the cache-write note for 1h tokens when the entry has no 1h write price", () => {
    const fiveMinOnly = {
      inputPricePerMillion: 0.95,
      outputPricePerMillion: 4,
      cacheWrite5mPricePerMillion: 1.19,
    };
    const notes = unpricedNotes(fiveMinOnly, { inputTokens: 0, outputTokens: 0, cacheWrite1hTokens: 100 });

    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/cache-write/i);
  });

  it("counts 1h cache-write tokens toward the long-prompt threshold", () => {
    const tieredWrites = {
      inputPricePerMillion: 1,
      outputPricePerMillion: 0,
      cacheWrite1hPricePerMillion: 10,
      longPrompt: {
        thresholdTokens: 100_000,
        rates: {
          inputPricePerMillion: 2,
          outputPricePerMillion: 0,
          cacheWrite1hPricePerMillion: 20,
        },
      },
    };

    // prompt = 50,000 input + 60,000 1h write = 110,000 > 100,000, so long rates
    const cost = costFromPricing(tieredWrites, {
      inputTokens: 50_000,
      outputTokens: 0,
      cacheWrite1hTokens: 60_000,
    });

    expect(cost).toBeCloseTo(0.1 + 1.2, 10); // 50k @ $2/M + 60k @ $20/M
  });
});

describe("unpricedNotes: checks the rates actually charged", () => {
  const cachedTiered = {
    inputPricePerMillion: 1,
    outputPricePerMillion: 1,
    cacheReadPricePerMillion: 0.1,
    longPrompt: {
      thresholdTokens: 100_000,
      rates: {
        inputPricePerMillion: 2,
        outputPricePerMillion: 2,
        // no cacheReadPricePerMillion in the long tier
      },
    },
  };

  it("sets the cache-read note when the long tier has no cache-read price", () => {
    const notes = unpricedNotes(cachedTiered, {
      inputTokens: 100_000,
      outputTokens: 0,
      cacheReadTokens: 50_000,
    });

    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/cache-read/i);
  });

  it("sets no note under the threshold, where the base cache-read price applies", () => {
    const notes = unpricedNotes(cachedTiered, {
      inputTokens: 50_000,
      outputTokens: 0,
      cacheReadTokens: 10_000,
    });

    expect(notes).toEqual([]);
  });
});
