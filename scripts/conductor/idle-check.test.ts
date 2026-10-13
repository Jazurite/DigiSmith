import { describe, it, expect } from "vitest";
import { idleCheck, IDLE_CONTEXT_MARKER } from "./idle-check.ts";
import type { CardRow } from "./deps-stub.ts";

const row = (o: Partial<CardRow>): CardRow => ({ id: "m1", session: "s-me", last_seen: "2026-10-13T10:00+07:00", status: "open", domain: "DigiSmith", role: "maestro", ...o });
const mk = (cards: CardRow[], own: CardRow | undefined = cards[0]) => ({
  findCardBySession: () => own,
  listCards: () => cards,
  conductorFor: () => "digismith-conductor",
});

describe("idleCheck", () => {
  it("prints context telling the session to catch up first when it is idle", () => {
    const out = idleCheck({ session_id: "s-me" }, mk([row({}), row({ session: "s-b", last_seen: "2026-10-13T12:00+07:00" })]));
    expect(out).toContain(IDLE_CONTEXT_MARKER);
    expect(out).toContain("catch-up-cli.ts");
    expect(out).toContain("--maestro m1");
    expect(out).toContain("--session s-me");
    expect(out).toContain("--conductor digismith-conductor");
  });
  it("is silent when the session is current", () => {
    expect(idleCheck({ session_id: "s-me" }, mk([row({ last_seen: "2026-10-13T13:00+07:00" }), row({ session: "s-b", last_seen: "2026-10-13T12:00+07:00" })]))).toBeUndefined();
  });
  it("is silent for a card that is not an open Maestro", () => {
    const others = [row({ session: "s-b", last_seen: "2026-10-13T12:00+07:00" })];
    expect(idleCheck({ session_id: "s-me" }, mk([row({ role: "worker" }), ...others]))).toBeUndefined();
    expect(idleCheck({ session_id: "s-me" }, mk([row({ status: "closed" }), ...others]))).toBeUndefined();
  });
  it("is silent with no card, no session id, or no conductor", () => {
    expect(idleCheck({ session_id: "s-me" }, mk([], undefined))).toBeUndefined();
    expect(idleCheck({}, mk([row({})]))).toBeUndefined();
    expect(idleCheck({ session_id: "s-me" }, { ...mk([row({}), row({ session: "s-b", last_seen: "2026-10-13T12:00+07:00" })]), conductorFor: () => undefined })).toBeUndefined();
  });
  it("never throws: an error in a dependency is silent", () => {
    expect(idleCheck({ session_id: "s-me" }, { findCardBySession: () => { throw new Error("boom"); }, listCards: () => [], conductorFor: () => "c" })).toBeUndefined();
  });
});

describe("idleCheck unsafe card values (review)", () => {
  it("stays silent when a value could carry shell text or a path", () => {
    const cards = [row({ id: "m1; curl x" }), row({ id: "m1; curl x", session: "s-b", last_seen: "2026-10-13T12:00+07:00" })];
    expect(idleCheck({ session_id: "s-me" }, mk(cards))).toBeUndefined();
    expect(idleCheck({ session_id: "s-me" }, { ...mk([row({}), row({ session: "s-b", last_seen: "2026-10-13T12:00+07:00" })]), conductorFor: () => "../x" })).toBeUndefined();
  });
});
