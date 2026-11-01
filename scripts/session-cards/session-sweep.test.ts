import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sweep, liveSessionsFromAgentList, readLiveSessions } from "./session-sweep.ts";
import { listCards, writeCard, type SessionCard } from "./cards.ts";

let depot: string;
let env: NodeJS.ProcessEnv;
const NOW = new Date("2026-10-13T08:00:00Z"); // 15:00 UTC+7
beforeEach(() => {
  depot = fs.mkdtempSync(path.join(os.tmpdir(), "dgs418sw-"));
  env = { DIGISMITH_DEPOT_DIR: depot };
});
afterEach(() => fs.rmSync(depot, { recursive: true, force: true }));

const card = (id: string, o: Partial<SessionCard> = {}): SessionCard => ({
  name: id, role: "worker", id, session: `sess-${id}`, under: "c", domain: "P", mandate: "m", runs_on: "herdr w2:p1",
  created_by: "c", started: "2026-10-13T10:00+07:00", last_seen: "2026-10-13T10:00+07:00", status: "open", ...o,
});
const alive = (...sessions: string[]) => ({ ok: true as const, sessions: new Set(sessions) });

describe("sweep", () => {
  it("marks stale + engine gone as lost and archives it", () => {
    writeCard(card("a"), env);
    const r = sweep({ project: "P", now: NOW, env, apply: true, live: alive() });
    expect(r.find((x) => x.id === "a")?.verdict).toBe("lost");
    expect(listCards("P", { env, scope: "open" })).toEqual([]);
    expect(listCards("P", { env, scope: "archive" })[0].card.status).toBe("lost");
  });
  it("keeps stale + engine alive", () => {
    writeCard(card("a"), env);
    expect(sweep({ project: "P", now: NOW, env, apply: true, live: alive("sess-a") })[0].verdict).toBe("kept");
    expect(listCards("P", { env, scope: "open" })).toHaveLength(1);
  });
  it("keeps fresh + engine gone", () => {
    writeCard(card("a", { last_seen: "2026-10-13T14:50+07:00" }), env);
    expect(sweep({ project: "P", now: NOW, env, apply: true, live: alive() })[0].verdict).toBe("kept");
  });
  it("reports non-herdr cards as unverifiable and never marks them", () => {
    writeCard(card("m", { role: "maestro", under: undefined, runs_on: "workbox", machine: "mac", state: "n.md", mandate: undefined }), env);
    expect(sweep({ project: "P", now: NOW, env, apply: true, live: alive() })[0].verdict).toBe("unverifiable");
    expect(listCards("P", { env, scope: "open" })).toHaveLength(1);
  });
  it("marks nothing when the herdr read failed", () => {
    writeCard(card("a"), env);
    const r = sweep({ project: "P", now: NOW, env, apply: true, live: { ok: false, error: "no server" } });
    expect(r[0].verdict).toBe("unverifiable");
    expect(listCards("P", { env, scope: "open" })).toHaveLength(1);
  });
  it("dry run writes nothing but still says lost", () => {
    writeCard(card("a"), env);
    expect(sweep({ project: "P", now: NOW, env, apply: false, live: alive() })[0].verdict).toBe("lost");
    expect(listCards("P", { env, scope: "open" })).toHaveLength(1);
  });
  it("respects a custom stale threshold and leaves closed cards and other projects alone", () => {
    writeCard(card("a", { last_seen: "2026-10-13T14:50+07:00" }), env);
    writeCard(card("o", { domain: "Other" }), env);
    expect(sweep({ project: "P", now: NOW, env, apply: true, staleMin: 5, live: alive() })[0].verdict).toBe("lost");
    expect(listCards("Other", { env, scope: "open" })).toHaveLength(1);
  });
});

describe("sweep guards (review fixes)", () => {
  it("a NaN stale threshold or unparseable last_seen marks nothing", () => {
    writeCard(card("a"), env);
    expect(() => sweep({ project: "P", now: NOW, env, staleMin: Number("abc"), live: alive() })).toThrow(/stale/);
    // the real card API refuses an unparseable last_seen, so such a file never reaches the sweep
    expect(() => writeCard(card("b", { last_seen: "garbage" }), env)).toThrow();
  });
  it("an empty herdr list or an agent without agent_session is unverifiable, not 'gone'", () => {
    expect(liveSessionsFromAgentList(JSON.stringify({ result: { agents: [] } })).ok).toBe(false);
    expect(liveSessionsFromAgentList(JSON.stringify({ result: { agents: [{ name: "x" }] } })).ok).toBe(false);
  });
});

describe("liveSessionsFromAgentList", () => {
  it("reads agent_session values from herdr-ws JSON", () => {
    const out = JSON.stringify({ result: { agents: [{ agent_session: { value: "x1" } }, { agent_session: { value: "x2" } }] } });
    expect(liveSessionsFromAgentList(out)).toEqual({ ok: true, sessions: new Set(["x1", "x2"]) });
  });
  it("fails on garbage", () => {
    expect(liveSessionsFromAgentList("nope").ok).toBe(false);
  });
});

describe("readLiveSessions across herdr sessions", () => {
  const list = (...v: string[]) => JSON.stringify({ result: { agents: v.map((x) => ({ agent_session: { value: x } })) } });
  const fake = (outs: Record<string, { status: number; stdout: string }>) => {
    const calls: string[][] = [];
    const spawn = ((_bin: string, args: string[]) => {
      calls.push(args);
      const key = args[0] === "--session" ? args[1] : "";
      return outs[key] ?? { status: 1, stdout: "" };
    }) as any;
    return { calls, spawn };
  };
  it("calls once per scoped session and unions the ids", () => {
    const { calls, spawn } = fake({ Suite: { status: 0, stdout: list("s1") }, default: { status: 0, stdout: list("d1") } });
    const r = readLiveSessions({ HERDR_SCOPE: "Suite:w7,default:w2,default:w3" }, spawn);
    expect(calls).toEqual([["--session", "Suite", "agent", "list"], ["--session", "default", "agent", "list"]]);
    expect(r).toEqual({ ok: true, sessions: new Set(["s1", "d1"]) });
  });
  it("is not ok when one call exits 1", () => {
    const { spawn } = fake({ Suite: { status: 0, stdout: list("s1") }, default: { status: 1, stdout: "" } });
    expect(readLiveSessions({ HERDR_SCOPE: "Suite:w7,default:w2" }, spawn).ok).toBe(false);
  });
  it("without HERDR_SCOPE makes the one plain call", () => {
    const { calls, spawn } = fake({ "": { status: 0, stdout: list("x") } });
    expect(readLiveSessions({}, spawn).ok).toBe(true);
    expect(calls).toEqual([["agent", "list"]]);
  });
  it("keeps a card whose runs_on carries the session, and an old-format card", () => {
    writeCard(card("n", { runs_on: "herdr Suite/w7:p1" }), env);
    writeCard(card("o", { runs_on: "herdr w2:p1" }), env);
    const r = sweep({ project: "P", now: NOW, env, apply: true, live: alive("sess-n", "sess-o") });
    expect(r.map((x) => x.verdict)).toEqual(["kept", "kept"]);
    const gone = sweep({ project: "P", now: NOW, env, live: alive() });
    expect(gone.map((x) => x.verdict)).toEqual(["lost", "lost"]);
  });
  it("an empty list from one scoped session is not ok and closes no card", () => {
    const { spawn } = fake({ Suite: { status: 0, stdout: list() }, default: { status: 0, stdout: list("d1") } });
    const live = readLiveSessions({ HERDR_SCOPE: "Suite:w7,default:w2" }, spawn);
    expect(live.ok).toBe(false);
    writeCard(card("a"), env);
    expect(sweep({ project: "P", now: NOW, env, apply: true, live })[0].verdict).toBe("unverifiable");
    expect(listCards("P", { env, scope: "open" })).toHaveLength(1);
  });
  it("reads two sessions into the verdicts: dead card closed, live ones kept", () => {
    const { spawn } = fake({ Suite: { status: 0, stdout: list("sess-s") }, default: { status: 0, stdout: list("sess-d") } });
    const live = readLiveSessions({ HERDR_SCOPE: "Suite:w7,default:w2" }, spawn);
    writeCard(card("s", { runs_on: "herdr Suite/w7:p1" }), env);
    writeCard(card("d", { runs_on: "herdr default/w2:p1" }), env);
    writeCard(card("x", { runs_on: "herdr Suite/w7:p2" }), env);
    const r = sweep({ project: "P", now: NOW, env, apply: true, live });
    const v = Object.fromEntries(r.map((x) => [x.id, x.verdict]));
    expect(v).toEqual({ s: "kept", d: "kept", x: "lost" });
    expect(listCards("P", { env, scope: "open" })).toHaveLength(2);
  });
  it.each(["-x:w1", ":w1"])("an invalid session name %s is a failed read with no spawn", (scope) => {
    const { calls, spawn } = fake({ default: { status: 0, stdout: list("d1") } });
    expect(readLiveSessions({ HERDR_SCOPE: `default:w2,${scope}` }, spawn).ok).toBe(false);
    expect(calls).toEqual([]);
  });
});
