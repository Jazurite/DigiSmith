import { mkdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeDepot, type Depot } from "./fixture.test-util.ts";
import { roleOf } from "../run/role.ts";
import { HERDR_CALLS, liveView, projectOf, realHerdr, type HerdrCall } from "./live.ts";
import { runOculusAsync } from "./index.ts";

const NOW = new Date("2026-10-24T08:00:00.000Z");
const HOME = "/Users/jack";
const SECRET_TITLE = "TOP-SECRET-TITLE-do-not-show";
const agent = (o: Record<string, unknown>) => ({
  agent: "claude", agent_session: { value: "sess-1" }, agent_status: "idle", cwd: `${HOME}/Workspace/Jazurite/DigiSmith`, focused: false,
  foreground_cwd: `${HOME}/Workspace/Jazurite/DigiSmith`, pane_id: "w2:p1", tab_id: "w2:t1", terminal_title: SECRET_TITLE, terminal_title_stripped: SECRET_TITLE, workspace_id: "w2", ...o,
});
const listOf = (agents: object[]) => Promise.resolve({ ok: true as const, stdout: JSON.stringify({ id: "1", result: { type: "agent_list", agents } }) });
// the list answers the default session; the Suite answers an empty list (the tests that count rows)
const herdrOf = (agents: object[], suite: object[] = []): HerdrCall => (argv) => listOf(argv.includes("Suite") ? suite : agents);

let d: Depot;
beforeEach(() => { d = makeDepot(); });
afterEach(() => d.cleanup());

describe("the herdr role rule (DGS-598 roleOf, inside herdr)", () => {
  const herdrRole = (name: string | null) => roleOf({ inHerdr: true, looked: true, agentName: name, maestroIdentity: false }).role;
  it.each([
    ["digismith-maestro", "other"], ["digismith-conductor", "conductor"], ["dgs-599", "builder"], ["EMKT-12", "other"],
    ["dgs-599-rev1", "reviewer"], ["rev-dgs-599", "other"], ["dgs-599-scout", "scout"], ["probe-408", "scout"], ["shell", "other"], [null, "other"],
  ] as const)("%s -> %s", (name, role) => expect(herdrRole(name)).toBe(role));
  it("liveView uses it: a pane named like a maestro is other (even with a maestro identity card), a conductor is conductor", async () => {
    mkdirSync(join(d.dir, "identities"));
    writeFileSync(join(d.dir, "identities", "a.yml"), "id: digismith-maestro\nrole: maestro\n");
    const v = await liveView(d.env, NOW, herdrOf([agent({ name: "digismith-maestro", pane_id: "w2:p1" }), agent({ name: "emma-conductor", pane_id: "w2:p2" })]), HOME);
    expect(v.agents.map((a) => [a.name, a.role])).toEqual([["digismith-maestro", "other"], ["emma-conductor", "conductor"]]);
  });
});

describe("projectOf", () => {
  it("takes the project folder under ~/Workspace/<org>/", () => {
    expect(projectOf(`${HOME}/Workspace/Jazurite/DigiSmith`, HOME)).toBe("DigiSmith");
    expect(projectOf(`${HOME}/Workspace/Jazurite/DigiSmith/.worktrees/dgs-599/scripts`, HOME)).toBe("DigiSmith");
    expect(projectOf(`${HOME}/Workspace/Jazurite/shoppable-video`, HOME)).toBe("shoppable-video");
  });
  it("gives null outside it, for a bare org folder, or for a value that is not a string", () => {
    expect(projectOf(`${HOME}/Downloads`, HOME)).toBeNull();
    expect(projectOf(`${HOME}/Workspace/Jazurite`, HOME)).toBeNull();
    expect(projectOf("/tmp/x", HOME)).toBeNull();
    expect(projectOf(42, HOME)).toBeNull();
  });
});

describe("liveView", () => {
  it("lists every agent of every workspace with only the allowed fields", async () => {
    const v = await liveView(d.env, NOW, herdrOf([
      agent({ name: "dgs-599", agent_status: "working", pane_id: "w2:p5", tab_id: "w2:t5" }),
      agent({ name: "emma-conductor", workspace_id: "w3", pane_id: "w3:p1", tab_id: "w3:t1", cwd: `${HOME}/Workspace/Jazurite/Emma` }),
      agent({ name: undefined, workspace_id: "w4", pane_id: "w4:p2", tab_id: "w4:t1", agent_status: "blocked" }),
      agent({ name: "dgs-571", agent_status: "done", pane_id: "w2:p9" }),
      agent({ name: "weird", agent_status: "sleeping", pane_id: "w2:p8" }),
    ]), HOME);
    expect(v.herdr).toBe("ok");
    expect(v.readAt).toBe(NOW.toISOString());
    expect(v.agents.map((a) => [a.name, a.status, a.workspace])).toEqual([
      [null, "blocked", "w4"], ["dgs-599", "working", "w2"], ["emma-conductor", "idle", "w3"], ["weird", "unknown", "w2"], ["dgs-571", "done", "w2"],
    ]);
    expect(v.agents[2]).toEqual({ session: "default", name: "emma-conductor", pane: "w3:p1", tab: "w3:t1", workspace: "w3", role: "conductor", project: "Emma", status: "idle", run: null });
    const out = JSON.stringify(v);
    expect(out).not.toContain(SECRET_TITLE);
    expect(out).not.toContain(HOME);
    expect(out).not.toContain("sess-1");
  });
  it("drops an agent without a pane id and caps a long name", async () => {
    const v = await liveView(d.env, NOW, herdrOf([agent({ name: "x", pane_id: undefined }), agent({ name: "n".repeat(200), pane_id: "w2:p3" })]), HOME);
    expect(v.agents).toHaveLength(1);
    expect(v.agents[0].name).toHaveLength(64);
  });
  it("joins the newest open run on the same herdr pane", async () => {
    // a run is listed only with an events file; "ended" after the last "started" closes it (run/read.ts summarize)
    const open = (run: string, at: string, ended = false) => {
      const f = join(d.writeRun({ ticket: "DGS-599", run, role: "builder", created_at: at }), "run.json");
      const r = JSON.parse(readFileSync(f, "utf8")); r.herdr.pane = "w2:p5"; writeFileSync(f, JSON.stringify(r));
      d.writeEvents("DGS-599", run, [{ type: "started", ts: at }, ...(ended ? [{ type: "ended", ts: "2026-10-24T07:40:00.000Z" }] : [])]);
    };
    open("builder-old", "2026-10-24T06:00:00.000Z");
    open("builder-new", "2026-10-24T07:00:00.000Z");
    open("builder-ended", "2026-10-24T07:30:00.000Z", true);
    const v = await liveView(d.env, NOW, herdrOf([agent({ name: "dgs-599", pane_id: "w2:p5" }), agent({ name: "dgs-600", pane_id: "w2:p6" })]), HOME);
    expect(v.agents.find((a) => a.name === "dgs-599")?.run).toBe("builder-new");
    expect(v.agents.find((a) => a.name === "dgs-600")?.run).toBeNull();
  });
  it("joins an open run by the Claude session id when no run has the pane; the pane match wins when both exist", async () => {
    const open = (run: string, at: string, o: { pane?: string; session?: string }) => {
      const f = join(d.writeRun({ ticket: "DGS-599", run, role: "builder", created_at: at }), "run.json");
      const r = JSON.parse(readFileSync(f, "utf8"));
      if (o.pane) r.herdr.pane = o.pane;
      if (o.session) r.session_id = o.session;
      writeFileSync(f, JSON.stringify(r));
      d.writeEvents("DGS-599", run, [{ type: "started", ts: at }]);
    };
    open("by-session", "2026-10-24T07:00:00.000Z", { session: "sess-9" });
    open("by-pane", "2026-10-24T06:00:00.000Z", { pane: "w2:p7" });
    open("other-session", "2026-10-24T07:10:00.000Z", { session: "sess-8" });
    const v = await liveView(d.env, NOW, herdrOf([
      agent({ name: "dgs-599", pane_id: "w2:p5", agent_session: { value: "sess-9" } }),
      agent({ name: "dgs-600", pane_id: "w2:p7", agent_session: { value: "sess-8" } }),
      agent({ name: "dgs-601", pane_id: "w2:p8", agent_session: { value: "sess-0" } }),
      agent({ name: "dgs-602", pane_id: "w2:p9", agent_session: undefined }),
    ]), HOME);
    const runOf = (n: string) => v.agents.find((a) => a.name === n)?.run;
    expect(runOf("dgs-599")).toBe("by-session");
    expect(runOf("dgs-600")).toBe("by-pane");
    expect(runOf("dgs-601")).toBeNull();
    expect(runOf("dgs-602")).toBeNull();
    expect(JSON.stringify(v)).not.toMatch(/sess-\d/);
  });
  it("ignores a pane match whose run belongs to another Claude session (a reused pane id)", async () => {
    const open = (run: string, at: string, o: { pane?: string; session?: string }) => {
      const f = join(d.writeRun({ ticket: "DGS-599", run, role: "builder", created_at: at }), "run.json");
      const r = JSON.parse(readFileSync(f, "utf8"));
      if (o.pane) r.herdr.pane = o.pane;
      if (o.session) r.session_id = o.session;
      writeFileSync(f, JSON.stringify(r));
      d.writeEvents("DGS-599", run, [{ type: "started", ts: at }]);
    };
    open("stale-pane", "2026-10-24T05:00:00.000Z", { pane: "w2:p10", session: "sess-old" });
    open("fresh", "2026-10-24T07:00:00.000Z", { session: "sess-new" });
    open("stale-pane-2", "2026-10-24T05:00:00.000Z", { pane: "w2:p11", session: "sess-old2" });
    open("pane-no-session", "2026-10-24T05:00:00.000Z", { pane: "w2:p12" });
    const v = await liveView(d.env, NOW, herdrOf([
      agent({ name: "dgs-603", pane_id: "w2:p10", agent_session: { value: "sess-new" } }),
      agent({ name: "dgs-604", pane_id: "w2:p11", agent_session: { value: "sess-other" } }),
      agent({ name: "dgs-605", pane_id: "w2:p12", agent_session: { value: "sess-any" } }),
    ]), HOME);
    const runOf = (n: string) => v.agents.find((a) => a.name === n)?.run;
    expect(runOf("dgs-603")).toBe("fresh");
    expect(runOf("dgs-604")).toBeNull();
    expect(runOf("dgs-605")).toBe("pane-no-session");
  });
  it("skips an old never-ended run on a reused pane id (the 7-day window of the other views)", async () => {
    const f = join(d.writeRun({ ticket: "DGS-599", run: "ancient", role: "builder", created_at: "2026-10-01T05:00:00.000Z" }), "run.json");
    const r = JSON.parse(readFileSync(f, "utf8"));
    r.herdr.pane = "w2:p1";
    writeFileSync(f, JSON.stringify(r));
    d.writeEvents("DGS-599", "ancient", [{ type: "started", ts: "2026-10-01T05:00:00.000Z" }]);
    const old = new Date("2026-10-01T05:00:00.000Z");
    for (const n of ["run.json", "events.jsonl"]) utimesSync(join(dirname(f), n), old, old);
    const v = await liveView(d.env, NOW, herdrOf([agent({ name: "dgs-606", pane_id: "w2:p1", agent_session: undefined })]), HOME);
    expect(v.agents.find((a) => a.name === "dgs-606")?.run).toBeNull();
  });
  it("two agents with the same pane id, one per session, each join their own run", async () => {
    const open = (run: string, session: string) => {
      const f = join(d.writeRun({ ticket: "DGS-599", run, role: "builder", created_at: "2026-10-24T07:00:00.000Z", herdr: { session, workspace: "w2", tab: null, pane: "w2:p1" } }), "run.json");
      expect(JSON.parse(readFileSync(f, "utf8")).herdr.session).toBe(session);
      d.writeEvents("DGS-599", run, [{ type: "started", ts: "2026-10-24T07:00:00.000Z" }]);
    };
    open("floor-run", "default");
    open("suite-run", "Suite");
    const v = await liveView(d.env, NOW, herdrOf([agent({ name: "dgs-599", pane_id: "w2:p1", agent_session: undefined })], [agent({ name: "digismith-conductor", pane_id: "w2:p1", agent_session: undefined })]), HOME);
    expect(v.suite).toBe("ok");
    expect(v.agents.map((a) => [a.session, a.name, a.run])).toEqual([["default", "dgs-599", "floor-run"], ["Suite", "digismith-conductor", "suite-run"]]);
  });
  it("an old run record without a session joins the default session only", async () => {
    const f = join(d.writeRun({ ticket: "DGS-599", run: "old-run", role: "builder", created_at: "2026-10-24T07:00:00.000Z", herdr: { workspace: "w2", tab: null, pane: "w2:p1" } }), "run.json");
    const r = JSON.parse(readFileSync(f, "utf8")); delete r.herdr.session; writeFileSync(f, JSON.stringify(r));
    d.writeEvents("DGS-599", "old-run", [{ type: "started", ts: "2026-10-24T07:00:00.000Z" }]);
    const v = await liveView(d.env, NOW, herdrOf([agent({ name: "a", pane_id: "w2:p1", agent_session: undefined })], [agent({ name: "b", pane_id: "w2:p1", agent_session: undefined })]), HOME);
    expect(v.agents.map((a) => [a.session, a.run])).toEqual([["default", "old-run"], ["Suite", null]]);
  });
  it("a Suite call that fails leaves the default rows and marks the view", async () => {
    const h: HerdrCall = async (argv) => (argv.includes("Suite") ? { ok: false } : listOf([agent({ name: "dgs-599", pane_id: "w2:p5" })]));
    const v = await liveView(d.env, NOW, h, HOME);
    expect(v.herdr).toBe("ok");
    expect(v.suite).toBe("unavailable");
    expect(v.agents.map((a) => a.name)).toEqual(["dgs-599"]);
  });
  it("starts both calls before either answers, and a slow Suite does not hold up the Floor read", async () => {
    const started: string[] = [];
    let releaseSuite!: () => void;
    const suiteGate = new Promise<void>((r) => { releaseSuite = r; });
    const h: HerdrCall = async (argv) => {
      started.push(argv[1]);
      if (argv[1] === "Suite") { await suiteGate; return { ok: false }; }
      return listOf([agent({ name: "dgs-599", pane_id: "w2:p5" })]);
    };
    const pending = liveView(d.env, NOW, h, HOME);
    await Promise.resolve();
    expect(started).toEqual(["default", "Suite"]);   // both in flight at once
    releaseSuite();
    const v = await pending;
    expect(v.suite).toBe("unavailable");
    expect(v.agents).toHaveLength(1);
  });
  it("a call that throws counts as a failed call", async () => {
    const h: HerdrCall = async (argv) => { if (argv[1] === "Suite") throw new Error("boom"); return listOf([agent({ name: "a" })]); };
    expect((await liveView(d.env, NOW, h, HOME)).suite).toBe("unavailable");
  });
  it("a default call that fails is unreachable even when the Suite answers", async () => {
    const h: HerdrCall = async (argv) => (argv.includes("Suite") ? listOf([agent({ name: "x" })]) : { ok: false });
    expect(await liveView(d.env, NOW, h, HOME)).toEqual({ readAt: NOW.toISOString(), herdr: "unreachable", agents: [] });
  });
  it("says unreachable, with no agents, when herdr fails or answers something else", async () => {
    for (const h of [() => ({ ok: false as const }), async () => ({ ok: true as const, stdout: "not json" }), () => ({ ok: true as const, stdout: "{\"result\":{}}" })]) {
      expect(await liveView(d.env, NOW, h, HOME)).toEqual({ readAt: NOW.toISOString(), herdr: "unreachable", agents: [] });
    }
  });
});

describe("the herdr call", () => {
  it("uses exactly the read-only argvs, one per session", () => expect(HERDR_CALLS.map((c) => [...c])).toEqual([["--session", "default", "agent", "list"], ["--session", "Suite", "agent", "list"]]));
  it("realHerdr refuses any argv that is not one of them", () => expect(realHerdr()(["--session", "Suite", "agent", "close", "x"])).resolves.toEqual({ ok: false }));
  it("realHerdr only builds the call; the tests never run the real herdr", () => expect(typeof realHerdr()).toBe("function"));
});

describe("runOculus view live", () => {
  it("prints the live view, exit 0, also when herdr is unreachable", async () => {
    const ok = await runOculusAsync(["view", "live"], d.env, NOW, { herdr: herdrOf([agent({ name: "dgs-599" })]) });
    expect(ok.code).toBe(0);
    expect(JSON.parse(ok.out).agents).toHaveLength(1);
    const down = await runOculusAsync(["view", "live"], d.env, NOW, { herdr: async () => ({ ok: false }) });
    expect(down.code).toBe(0);
    expect(JSON.parse(down.out).herdr).toBe("unreachable");
  });
  it("takes no flag", async () => expect((await runOculusAsync(["view", "live", "--run", "x"], d.env, NOW, { herdr: async () => ({ ok: false }) })).code).toBe(1));
});
