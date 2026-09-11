import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchWebhook } from "./webhook.ts";
import type { CostRecord } from "./types.ts";

const SAMPLE_RECORD: CostRecord = {
  provider: "tokenreply",
  model: "gpt-5.6-luna",
  usage: { inputTokens: 100, outputTokens: 50 },
  costUsd: 0.000008,
};

beforeEach(() => {
  delete process.env.DIGISMITH_TOKEN_COUNTER_WEBHOOK_URL;
});

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

  it("logs but does not throw when the webhook responds with an HTTP error status", async () => {
    process.env.DIGISMITH_TOKEN_COUNTER_WEBHOOK_URL = "https://example.com/hook";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(dispatchWebhook(SAMPLE_RECORD)).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("500"));
  });
});
