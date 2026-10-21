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
    const runs = [{ id: "r1", role: "builder", createdAt: "t1", started: true, ended: false, merged: false, pushed: false, phaseEvent: null }];
    const verdicts = [{ scope: "task" as const, result: "clean" as const, head: "h-verdict" }];
    const git = { head: "h-git", base: "b-git", onOriginMain: true };
    const tracker = { status: "tracker-status-marker" };
    const herdr = { conductorPresent: true, conductorWorking: false, input: "typed" as const, builderPane: "gone" };
    const o: Observers = {
      runs: async () => runs, packs: async () => { throw new Error("no workspace"); }, verdicts: async () => verdicts,
      git: async () => git, tracker: async () => tracker, herdr: async () => herdr,
    };
    const r = await observeAll(o, 100);
    expect(r).toEqual({
      runs: { ok: true, value: runs },
      packs: { ok: false, error: "no workspace" },
      verdicts: { ok: true, value: verdicts },
      git: { ok: true, value: git },
      tracker: { ok: true, value: tracker },
      herdr: { ok: true, value: herdr },
    });
  });
});
