import { describe, it, expect } from "vitest";
import { idleCheck, IDLE_CONTEXT_MARKER, IDLE_MIN } from "./idle-check.ts";
import type { IdleDeps, IdleStamp } from "./idle-check.ts";
import type { CardRow } from "./catch-up-window.ts";

const T0 = Date.parse("2026-10-13T10:00:00+07:00");
const min = (n: number) => new Date(T0 + n * 60_000);
const row = (o: Partial<CardRow>): CardRow => ({ id: "m1", session: "s-me", last_seen: "2026-10-13T10:00+07:00", status: "open", domain: "DigiSmith", role: "maestro", ...o });

// A fake world: the stamp store, the repo head and the conductor note's Updated: value.
function world(o: { stamp?: IdleStamp; head?: string; updated?: string; at?: number; own?: CardRow | undefined; conductor?: string | undefined } = {}) {
  const w = {
    stamp: o.stamp as IdleStamp | undefined,
    head: o.head as string | undefined,
    updated: o.updated as string | undefined,
    at: o.at ?? 0,
    writes: [] as IdleStamp[],
  };
  const own = "own" in o ? o.own : row({});
  const deps: IdleDeps = {
    findCardBySession: () => own,
    conductorFor: () => ("conductor" in o ? o.conductor : "digismith-conductor"),
    now: () => min(w.at),
    readStamp: () => w.stamp,
    writeStamp: (_card, st) => { w.writes.push(st); w.stamp = st; },
    readHead: () => w.head,
    readUpdated: () => w.updated,
  };
  return { w, deps };
}
const stamp = (o: Partial<IdleStamp> = {}): IdleStamp => ({ last_prompt: min(0).toISOString(), caught_up_head: "h1", caught_up_updated: "u1", ...o });

describe("idleCheck: Jack's own idleness (DGS-438 d)", () => {
  it("IDLE_MIN is 30 minutes", () => expect(IDLE_MIN).toBe(30));

  it("fires after IDLE_MIN idle when the repo head moved, and stores both values", () => {
    const { w, deps } = world({ stamp: stamp(), head: "h2", updated: "u1", at: 40 });
    const out = idleCheck({ session_id: "s-me", prompt: "hello" }, deps);
    expect(out).toContain(IDLE_CONTEXT_MARKER);
    expect(out).toContain("--maestro 'm1' --session 's-me' --conductor 'digismith-conductor' --project 'DigiSmith'");
    expect(w.writes.at(-1)).toMatchObject({ last_prompt: min(40).toISOString(), caught_up_head: "h2", caught_up_updated: "u1", caught_up_at: min(40).toISOString() });
  });
  it("fires when only the conductor's Updated: stamp changed", () => {
    const { deps } = world({ stamp: stamp(), head: "h1", updated: "u2", at: 31 });
    expect(idleCheck({ session_id: "s-me", prompt: "hi" }, deps)).toContain(IDLE_CONTEXT_MARKER);
  });
  it("is silent just under IDLE_MIN, and still refreshes last_prompt", () => {
    const { w, deps } = world({ stamp: stamp(), head: "h2", updated: "u2", at: 29 });
    expect(idleCheck({ session_id: "s-me", prompt: "hi" }, deps)).toBeUndefined();
    expect(w.writes.at(-1)).toMatchObject({ last_prompt: min(29).toISOString(), caught_up_head: "h1", caught_up_updated: "u1" });
  });
  it("never repeats an unchanged catch-up: idle but head and Updated: equal the stored ones", () => {
    const { w, deps } = world({ stamp: stamp(), head: "h1", updated: "u1", at: 120 });
    expect(idleCheck({ session_id: "s-me", prompt: "hi" }, deps)).toBeUndefined();
    expect(w.writes.at(-1)!.caught_up_head).toBe("h1");
  });
  it("does not repeat after firing: the next idle period with nothing new is silent", () => {
    const { w, deps } = world({ stamp: stamp(), head: "h2", updated: "u1", at: 40 });
    expect(idleCheck({ session_id: "s-me", prompt: "a" }, deps)).toContain(IDLE_CONTEXT_MARKER);
    w.at = 100;
    expect(idleCheck({ session_id: "s-me", prompt: "b" }, deps)).toBeUndefined();
  });
  it("other sessions' activity is not read: Jack active here and a moved head is silent", () => {
    const { deps } = world({ stamp: stamp({ last_prompt: min(8).toISOString() }), head: "h2", updated: "u2", at: 10 });
    expect(idleCheck({ session_id: "s-me", prompt: "hi" }, deps)).toBeUndefined();
  });
  it("no stamp: silent on the first prompt, and the stamp is written", () => {
    const { w, deps } = world({ head: "h2", updated: "u2", at: 5 });
    expect(idleCheck({ session_id: "s-me", prompt: "hi" }, deps)).toBeUndefined();
    expect(w.writes).toHaveLength(1);
    expect(w.writes[0].last_prompt).toBe(min(5).toISOString());
  });
  it("a stamp that never caught up fires on the first idle prompt when a head or Updated: is known", () => {
    const { deps } = world({ stamp: { last_prompt: min(0).toISOString() }, head: "h2", at: 40 });
    expect(idleCheck({ session_id: "s-me", prompt: "hi" }, deps)).toContain(IDLE_CONTEXT_MARKER);
  });
  it("unknown head and Updated: (git or note unreadable) = nothing known to have changed: silent", () => {
    const { deps } = world({ stamp: stamp(), at: 90 });
    expect(idleCheck({ session_id: "s-me", prompt: "hi" }, deps)).toBeUndefined();
  });
  it("a harness notice neither fires nor refreshes last_prompt", () => {
    const { w, deps } = world({ stamp: stamp(), head: "h2", updated: "u2", at: 90 });
    expect(idleCheck({ session_id: "s-me", prompt: "[SYSTEM NOTIFICATION - NOT USER INPUT]\nx" }, deps)).toBeUndefined();
    expect(idleCheck({ session_id: "s-me", prompt: "<task-notification>x" }, deps)).toBeUndefined();
    expect(w.writes).toHaveLength(0);
    // the real prompt right after still sees the full idle time
    expect(idleCheck({ session_id: "s-me", prompt: "real" }, deps)).toContain(IDLE_CONTEXT_MARKER);
  });
  it("a missing prompt field is treated as a real prompt", () => {
    const { deps } = world({ stamp: stamp(), head: "h2", at: 90 });
    expect(idleCheck({ session_id: "s-me" }, deps)).toContain(IDLE_CONTEXT_MARKER);
  });
  it("a stamp in the future (clock change) is silent, never negative idle", () => {
    const { deps } = world({ stamp: stamp({ last_prompt: min(500).toISOString() }), head: "h2", at: 10 });
    expect(idleCheck({ session_id: "s-me", prompt: "hi" }, deps)).toBeUndefined();
  });
  it("a damaged stamp time counts as no stamp", () => {
    const { deps } = world({ stamp: stamp({ last_prompt: "garbage" }), head: "h2", at: 90 });
    expect(idleCheck({ session_id: "s-me", prompt: "hi" }, deps)).toBeUndefined();
  });
});

describe("idleCheck guards", () => {
  it("is silent for a card that is not an open Maestro, writes no stamp", () => {
    for (const own of [row({ role: "worker" }), row({ status: "closed" })]) {
      const { w, deps } = world({ stamp: stamp(), head: "h2", at: 90, own });
      expect(idleCheck({ session_id: "s-me", prompt: "hi" }, deps)).toBeUndefined();
      expect(w.writes).toHaveLength(0);
    }
  });
  it("is silent with no card, no session id, or no conductor", () => {
    expect(idleCheck({ session_id: "s-me", prompt: "hi" }, world({ stamp: stamp(), head: "h2", at: 90, own: undefined }).deps)).toBeUndefined();
    expect(idleCheck({ prompt: "hi" }, world({ stamp: stamp(), head: "h2", at: 90 }).deps)).toBeUndefined();
    expect(idleCheck({ session_id: "s-me", prompt: "hi" }, world({ stamp: stamp(), head: "h2", at: 90, conductor: undefined }).deps)).toBeUndefined();
  });
  it("never throws: an error in a dependency is silent", () => {
    const { deps } = world({ stamp: stamp(), head: "h2", at: 90 });
    expect(idleCheck({ session_id: "s-me", prompt: "hi" }, { ...deps, readStamp: () => { throw new Error("boom"); } })).toBeUndefined();
    expect(idleCheck({ session_id: "s-me", prompt: "hi" }, { ...deps, writeStamp: () => { throw new Error("disk"); } })).toBeUndefined();
  });
  it("stays silent when a value could carry shell text or a path", () => {
    expect(idleCheck({ session_id: "s-me", prompt: "hi" }, world({ stamp: stamp(), head: "h2", at: 90, own: row({ id: "m1; curl x" }) }).deps)).toBeUndefined();
    expect(idleCheck({ session_id: "s-me", prompt: "hi" }, world({ stamp: stamp(), head: "h2", at: 90, conductor: "../x" }).deps)).toBeUndefined();
  });
});

import { defaultConductorFor } from "./idle-check.ts";
describe("defaultConductorFor (422 convention)", () => {
  it("is '<domain lowercased>-conductor', or the env override, else undefined", () => {
    expect(defaultConductorFor(row({ domain: "DigiSmith" }), {})).toBe("digismith-conductor");
    expect(defaultConductorFor(row({}), { DIGISMITH_CONDUCTOR: "other-conductor" })).toBe("other-conductor");
    expect(defaultConductorFor(row({ domain: "" }), {})).toBeUndefined();
  });
});
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { writeIdentity } from "../identity.ts";
describe("defaultConductorFor with an identity record (DGS-411)", () => {
  it("uses the record's first conductor; env still wins", () => {
    const depot = fs.mkdtempSync(path.join(os.tmpdir(), "dgs411-idle-"));
    try {
      const env = { DIGISMITH_DEPOT_DIR: depot };
      writeIdentity({ id: "digismith-maestro", name: "DigiSmith Maestro", owner: "jack", project: "DigiSmith", folder: "/x", conductors: ["ds-boss"], role: "maestro", machine: "m", state: "/x/n.md", created: "2026-10-13T15:00+07:00" }, env);
      expect(defaultConductorFor(row({ id: "digismith-maestro", domain: "DigiSmith" }), env)).toBe("ds-boss");
      expect(defaultConductorFor(row({ id: "digismith-maestro", domain: "DigiSmith" }), { ...env, DIGISMITH_CONDUCTOR: "other" })).toBe("other");
      expect(defaultConductorFor(row({ id: "no-record", domain: "DigiSmith" }), env)).toBe("digismith-conductor");
    } finally {
      fs.rmSync(depot, { recursive: true, force: true });
    }
  });
});
