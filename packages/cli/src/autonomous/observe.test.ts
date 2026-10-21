import { describe, it, expect, vi, afterEach } from "vitest";
import { safe, observeAll, type Observers } from "./observe.ts";

afterEach(() => {
  vi.useRealTimers();
});

describe("safe", () => {
  it("wraps a value", async () => expect(await safe(async () => 5, 100)).toEqual({ ok: true, value: 5 }));
  it("wraps a throw", async () => expect(await safe(async () => { throw new Error("x"); }, 100)).toEqual({ ok: false, error: "x" }));
  it("wraps a timeout", async () => {
    const r = await safe(() => new Promise<number>(() => {}), 20);
    expect(r).toEqual({ ok: false, error: "timeout after 20 ms" });
  });
  it("wraps a non-Error throw as a string message", async () => {
    const r = await safe(async () => { throw "boom"; }, 100);
    expect(r).toEqual({ ok: false, error: "boom" });
  });
  it("wraps a synchronously throwing fn", async () => {
    const r = await safe((): Promise<number> => { throw new Error("sync"); }, 100);
    expect(r).toEqual({ ok: false, error: "sync" });
  });
  it("clears the timer after a fast value", async () => {
    vi.useFakeTimers();
    const p = safe(async () => 7, 1000);
    const r = await p;
    expect(r).toEqual({ ok: true, value: 7 });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("observeAll", () => {
  it("one failing observer does not hide the others", async () => {
    const o: Observers = {
      runs: async () => [], packs: async () => { throw new Error("no workspace"); }, verdicts: async () => [],
      git: async () => ({ head: "a", base: "b", onOriginMain: false }), tracker: async () => ({ status: "in progress" }),
      herdr: async () => ({ conductorPresent: true, conductorWorking: false, input: "empty", builderPanePresent: true }),
    };
    const r = await observeAll(o, 100);
    expect(r.packs).toEqual({ ok: false, error: "no workspace" });
    expect(r.runs.ok && r.git.ok && r.tracker.ok && r.herdr.ok && r.verdicts.ok).toBe(true);
  });
});
