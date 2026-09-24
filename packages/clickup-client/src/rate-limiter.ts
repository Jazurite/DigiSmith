export type Clock = () => number;
export type Sleep = (ms: number) => Promise<void>;

const realSleep: Sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * In-process token bucket. Capacity tokens, refilled at refillPerSec.
 * `now` and `sleep` are injectable so tests run without real time.
 */
export class RateLimiter {
  private tokens: number;
  private last: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
    private readonly now: Clock = Date.now,
    private readonly sleep: Sleep = realSleep,
  ) {
    this.tokens = capacity;
    this.last = now();
  }

  private refill(): void {
    const t = this.now();
    const elapsedSec = (t - this.last) / 1000;
    this.tokens = Math.min(
      this.capacity,
      this.tokens + elapsedSec * this.refillPerSec,
    );
    this.last = t;
  }

  msUntilAvailable(): number {
    this.refill();
    if (this.tokens >= 1) return 0;
    return Math.ceil(((1 - this.tokens) / this.refillPerSec) * 1000);
  }

  async acquire(): Promise<void> {
    const wait = this.msUntilAvailable();
    if (wait > 0) {
      await this.sleep(wait);
      this.refill();
    }
    this.tokens -= 1;
  }
}
