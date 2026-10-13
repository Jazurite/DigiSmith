import { describe, it, expect } from "vitest";
import { computeWindow, isIdle, toUtc7 } from "./catch-up-window.ts";

const card = (id: string, session: string, last_seen: string, status = "open") => ({ id, session, last_seen, status });
const NOW = new Date("2026-10-13T08:00:00Z"); // 15:00 UTC+7

describe("toUtc7", () => {
  it("writes an instant with the +07:00 offset", () => {
    expect(toUtc7(new Date("2026-10-13T08:00:00Z"))).toBe("2026-10-13T15:00+07:00");
    expect(toUtc7(new Date("2026-10-13T18:00:00Z"))).toBe("2026-10-14T01:00+07:00");
  });
});

describe("computeWindow", () => {
  it("starts at the newest last_seen of the identity, open, closed or lost", () => {
    const w = computeWindow({
      identity: "m1", askingSession: "s-new", now: NOW,
      cards: [
        card("m1", "s-a", "2026-10-13T10:00+07:00", "closed"),
        card("m1", "s-b", "2026-10-13T12:30+07:00", "lost"),
        card("m1", "s-c", "2026-10-13T11:00+07:00", "open"),
      ],
    });
    expect(w.from).toBe("2026-10-13T12:30+07:00");
    expect(w.to).toBe("2026-10-13T15:00+07:00");
    expect(w.brandNew).toBe(false);
  });
  it("leaves out the asking session's own card", () => {
    const w = computeWindow({
      identity: "m1", askingSession: "s-me", now: NOW,
      cards: [card("m1", "s-me", "2026-10-13T14:59+07:00"), card("m1", "s-old", "2026-10-13T09:00+07:00", "closed")],
    });
    expect(w.from).toBe("2026-10-13T09:00+07:00");
  });
  it("ignores cards of other identities", () => {
    const w = computeWindow({
      identity: "m1", askingSession: "s", now: NOW,
      cards: [card("other", "x", "2026-10-13T14:00+07:00"), card("m1", "y", "2026-10-13T08:00+07:00")],
    });
    expect(w.from).toBe("2026-10-13T08:00+07:00");
  });
  it("gives a brand-new identity the last 24 hours", () => {
    const w = computeWindow({ identity: "m1", askingSession: "s", now: NOW, cards: [card("m1", "s", "2026-10-13T14:59+07:00")] });
    expect(w.brandNew).toBe(true);
    expect(w.from).toBe("2026-10-12T15:00+07:00");
  });
  it("compares instants, not strings, across offsets", () => {
    const w = computeWindow({
      identity: "m1", askingSession: "s", now: NOW,
      cards: [card("m1", "a", "2026-10-13T07:00Z"), card("m1", "b", "2026-10-13T13:00+07:00")],
    });
    expect(w.from).toBe("2026-10-13T14:00+07:00");
  });
  it("throws on an invalid last_seen rather than inventing a window", () => {
    expect(() => computeWindow({ identity: "m1", askingSession: "s", now: NOW, cards: [card("m1", "a", "garbage")] })).toThrow(/last_seen/);
  });
});

describe("isIdle", () => {
  const base = { identity: "m1", askingSession: "s-me" };
  it("is idle when the own last_seen is older than the newest of the other cards", () => {
    expect(isIdle({ ...base, cards: [card("m1", "s-me", "2026-10-13T10:00+07:00"), card("m1", "s-b", "2026-10-13T12:00+07:00")] })).toBe(true);
  });
  it("is not idle when the own card is the newest", () => {
    expect(isIdle({ ...base, cards: [card("m1", "s-me", "2026-10-13T13:00+07:00"), card("m1", "s-b", "2026-10-13T12:00+07:00")] })).toBe(false);
  });
  it("is not idle with no other card, or without an own card", () => {
    expect(isIdle({ ...base, cards: [card("m1", "s-me", "2026-10-13T10:00+07:00")] })).toBe(false);
    expect(isIdle({ ...base, cards: [card("m1", "s-b", "2026-10-13T12:00+07:00")] })).toBe(false);
  });
  it("counts closed and lost cards of the identity, not other identities", () => {
    expect(isIdle({ ...base, cards: [card("m1", "s-me", "2026-10-13T10:00+07:00"), card("m1", "s-c", "2026-10-13T11:00+07:00", "closed")] })).toBe(true);
    expect(isIdle({ ...base, cards: [card("m1", "s-me", "2026-10-13T10:00+07:00"), card("zz", "s-c", "2026-10-13T11:00+07:00")] })).toBe(false);
  });
});
