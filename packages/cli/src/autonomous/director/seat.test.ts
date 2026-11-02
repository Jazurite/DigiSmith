import { describe, expect, it } from "vitest";
import { rankSeats, SOONEST_RESET_MAX_FIVE_HOUR_USED, type SeatReading } from "./seat.ts";

const NOW = Date.parse("2026-11-03T03:00:00.000Z");
const H = 3600_000;
const r = (seat: string, over: Partial<SeatReading> = {}): SeatReading => ({
  seat, fiveHourUsed: 20, weeklyUsed: 50, weeklyResetsAt: NOW + 72 * H, exhaustedUntil: null, workers: 0, lastAssigned: null, carriesMaestro: false, ...over,
});
const rank = (rs: SeatReading[], heavy = false) => rankSeats(rs, NOW, { heavy }).ranked;

describe("rankSeats", () => {
  it("an exhausted seat is dropped", () => {
    expect(rank([r("a", { exhaustedUntil: NOW + H }), r("b")])).toEqual(["b"]);
    expect(rank([r("a", { exhaustedUntil: NOW - H }), r("b")])).toEqual(["a", "b"]);
  });
  it("a seat whose weekly window resets within 24 hours sorts first, soonest reset first", () => {
    expect(rank([r("a", { weeklyUsed: 10 }), r("b", { weeklyResetsAt: NOW + 20 * H }), r("c", { weeklyResetsAt: NOW + 5 * H })])).toEqual(["c", "b", "a"]);
  });
  it("then more weekly headroom", () => {
    expect(rank([r("a", { weeklyUsed: 60 }), r("b", { weeklyUsed: 30 })])).toEqual(["b", "a"]);
  });
  it("then more 5h headroom", () => {
    expect(rank([r("a", { fiveHourUsed: 50 }), r("b", { fiveHourUsed: 10 })])).toEqual(["b", "a"]);
  });
  it("then fewest workers", () => {
    expect(rank([r("a", { workers: 3 }), r("b", { workers: 1 })])).toEqual(["b", "a"]);
  });
  it("then least recently assigned (never assigned first)", () => {
    expect(rank([r("a", { lastAssigned: NOW - H }), r("b", { lastAssigned: NOW - 5 * H })])).toEqual(["b", "a"]);
    expect(rank([r("a", { lastAssigned: NOW - H }), r("b")])).toEqual(["b", "a"]);
  });
  it("a seat that carries the Maestro with 5h used above 40 percent goes last for a heavy worker, not for a light one", () => {
    const rs = [r("m", { carriesMaestro: true, fiveHourUsed: 45, weeklyUsed: 10 }), r("x", { weeklyUsed: 80 })];
    expect(rank(rs, true)).toEqual(["x", "m"]);
    expect(rank(rs, false)).toEqual(["m", "x"]);
    expect(rank([r("m", { carriesMaestro: true, fiveHourUsed: 40, weeklyUsed: 10 }), r("x", { weeklyUsed: 80 })], true)).toEqual(["m", "x"]);
  });
  it("guard: a seat that resets in 20 hours is first only while 5h used is below 70", () => {
    expect(SOONEST_RESET_MAX_FIVE_HOUR_USED).toBe(70);
    const other = r("o", { weeklyUsed: 10 });
    const at = (u: number) => rank([other, r("s", { weeklyResetsAt: NOW + 20 * H, fiveHourUsed: u, weeklyUsed: 90 })]);
    expect(at(95)).toEqual(["o", "s"]);
    expect(at(50)).toEqual(["s", "o"]);
    expect(at(70)).toEqual(["o", "s"]);
    expect(at(69)).toEqual(["s", "o"]);
  });
  it("unknown readings (null): headroom steps are skipped for that seat and the worker count decides", () => {
    const unknown = (seat: string, workers: number) => r(seat, { fiveHourUsed: null, weeklyUsed: null, weeklyResetsAt: null, workers });
    expect(rank([unknown("u1", 2), unknown("u2", 0)])).toEqual(["u2", "u1"]);
    // a null reading gives no headroom advantage: ordering by workers when the other has equal worker count falls to headroom only between known seats
    expect(rank([unknown("u", 0), r("k", { workers: 1, weeklyUsed: 99 })])).toEqual(["u", "k"]);
  });
  it("no seat left returns an empty list and the reason 'all seats exhausted'", () => {
    const out = rankSeats([r("a", { exhaustedUntil: NOW + H })], NOW, { heavy: false });
    expect(out.ranked).toEqual([]);
    expect(out.why).toContain("all seats exhausted");
    expect(rankSeats([], NOW, { heavy: false }).why).toContain("all seats exhausted");
  });
  it("why explains each ranked seat; ranking is pure (input not mutated)", () => {
    const rs = [r("a"), r("b", { weeklyUsed: 10 })];
    const copy = JSON.stringify(rs);
    const out = rankSeats(rs, NOW, { heavy: false });
    expect(out.why.length).toBeGreaterThan(0);
    expect(JSON.stringify(rs)).toBe(copy);
  });
});
