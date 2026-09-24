import { describe, it, expect, vi } from "vitest";
import { RateLimiter } from "./rate-limiter.ts";

describe("RateLimiter", () => {
  it("starts full: a token is available immediately", () => {
    const limiter = new RateLimiter(100, 100 / 60, () => 0);
    expect(limiter.msUntilAvailable()).toBe(0);
  });

  it("reports a wait once the bucket is drained, then refills over time", async () => {
    let clock = 0;
    const sleep = vi.fn(async () => {});
    const limiter = new RateLimiter(2, 1, () => clock, sleep); // 1 token/sec

    await limiter.acquire(); // 2 -> 1
    await limiter.acquire(); // 1 -> 0
    expect(sleep).not.toHaveBeenCalled();
    expect(limiter.msUntilAvailable()).toBe(1000); // need 1 token at 1/sec

    clock = 1000; // one second passes -> +1 token
    expect(limiter.msUntilAvailable()).toBe(0);
  });

  it("acquire waits for the computed delay when empty", async () => {
    let clock = 0;
    const sleep = vi.fn((ms: number): Promise<void> => {
      clock += ms; // simulate time passing during the sleep
      return Promise.resolve();
    });
    const limiter = new RateLimiter(1, 1, () => clock, sleep);

    await limiter.acquire(); // consumes the only token, no wait
    await limiter.acquire(); // empty -> must wait ~1000ms
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(1000);
  });
});
