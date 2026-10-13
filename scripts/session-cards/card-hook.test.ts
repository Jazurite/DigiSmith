import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { endHook, readStarterEnv, startHook, touchHook } from "./card-hook.ts";
import { findCardBySession, listCards } from "./cards.ts";
import { writeIdentity } from "../identity.ts";
import { main } from "./hook-cli.ts";

let depot: string;
let env: NodeJS.ProcessEnv;
const T0 = new Date("2026-10-13T07:00:00Z"); // 14:00 UTC+7

beforeEach(() => {
  depot = fs.mkdtempSync(path.join(os.tmpdir(), "dgs418-"));
  env = {
    DIGISMITH_DEPOT_DIR: depot,
    DIGISMITH_ROLE: "worker",
    DIGISMITH_ID: "dgs-418",
    DIGISMITH_NAME: "dgs-418",
    DIGISMITH_UNDER: "dsm-conductor-01",
    DIGISMITH_PROJECT: "DigiSmith",
    DIGISMITH_MANDATE: "orders/x.md",
    DIGISMITH_CREATED_BY: "dsm-conductor-01",
    HERDR_PANE_ID: "w2:p3Z",
    SECRET_TOKEN: "sk-abcdefghijklmnopqrstuvwxyz0123456789",
  };
});
afterEach(() => fs.rmSync(depot, { recursive: true, force: true }));

const ev = (session_id = "s1", extra = {}) => ({ session_id, cwd: depot, ...extra });

describe("readStarterEnv", () => {
  it("returns undefined without a valid role or project", () => {
    expect(readStarterEnv({})).toBeUndefined();
    expect(readStarterEnv({ ...env, DIGISMITH_ROLE: "boss" })).toBeUndefined();
    expect(readStarterEnv({ ...env, DIGISMITH_PROJECT: undefined })).toBeUndefined();
  });
});

describe("startHook", () => {
  it("writes an open card from env and event", () => {
    const r = startHook(ev(), env, { now: T0 });
    expect(r.wrote).toBe(true);
    const [{ card }] = listCards("DigiSmith", { env });
    expect(card).toMatchObject({
      role: "worker", id: "dgs-418", session: "s1", under: "dsm-conductor-01", domain: "DigiSmith",
      runs_on: "herdr w2:p3Z", status: "open", started: "2026-10-13T14:00+07:00", last_seen: "2026-10-13T14:00+07:00",
    });
  });
  it("never writes a secret env var into the card", () => {
    startHook(ev(), env, { now: T0 });
    const text = fs.readFileSync(listCards("DigiSmith", { env })[0].path, "utf8");
    expect(text).not.toContain("sk-");
  });
  it("writes no card without a role (fail safe) and says why", () => {
    delete env.DIGISMITH_ROLE;
    const r = startHook(ev(), env, { now: T0 });
    expect(r).toMatchObject({ wrote: false });
    expect(r.reason).toMatch(/DIGISMITH_ROLE/);
    expect(listCards("DigiSmith", { env })).toEqual([]);
  });
  it("writes no card when an env value holds a newline (field injection)", () => {
    env.DIGISMITH_MANDATE = "x\nstatus: closed";
    expect(startHook(ev(), env, { now: T0 }).wrote).toBe(false);
  });
  it("writes no card when the card would be invalid", () => {
    delete env.DIGISMITH_CREATED_BY;
    expect(startHook(ev(), env, { now: T0 }).wrote).toBe(false);
  });
  it("does not overwrite an open card of the same session (resume)", () => {
    startHook(ev(), env, { now: T0 });
    const r = startHook(ev("s1", { source: "resume" }), env, { now: new Date(T0.getTime() + 3600_000) });
    expect(r.wrote).toBe(false);
    expect(listCards("DigiSmith", { env })[0].card.started).toBe("2026-10-13T14:00+07:00");
  });
  it("uses a placeholder runs_on outside herdr", () => {
    delete env.HERDR_PANE_ID;
    startHook(ev(), env, { now: T0 });
    expect(listCards("DigiSmith", { env })[0].card.runs_on).toBe("workbox");
  });
});

describe("touchHook", () => {
  it("does nothing without a card", () => {
    expect(touchHook(ev(), env, { now: T0 }).touched).toBe(false);
  });
  it("is throttled under 60 s, then refreshes last_seen only", () => {
    startHook(ev(), env, { now: T0 });
    expect(touchHook(ev(), env, { now: new Date(T0.getTime() + 30_000) }).touched).toBe(false);
    expect(touchHook(ev(), env, { now: new Date(T0.getTime() + 90_000) }).touched).toBe(true);
    const { card } = findCardBySession("s1", "DigiSmith", env)!;
    expect(card.last_seen).toBe("2026-10-13T14:01+07:00");
    expect(card.started).toBe("2026-10-13T14:00+07:00");
  });
});

describe("endHook", () => {
  it("closes the card with ended and result, and archives it", () => {
    startHook(ev(), env, { now: T0 });
    const r = endHook(ev("s1", { reason: "prompt_input_exit" }), env, { now: new Date(T0.getTime() + 600_000) });
    expect(r.closed).toBe(true);
    expect(findCardBySession("s1", "DigiSmith", env)).toBeUndefined();
    const [{ card, path: p }] = listCards("DigiSmith", { env, scope: "archive" });
    expect(p).toContain("archive");
    expect(card).toMatchObject({ status: "closed", ended: "2026-10-13T14:10+07:00", result: "ended (prompt_input_exit)" });
  });
  it("appends the handoff at the END of the state note", () => {
    const note = path.join(depot, "note.md");
    fs.writeFileSync(note, "# note\n<!-- digismith:conductor-state v1 -->\nx\n<!-- /digismith:conductor-state -->\n");
    env.DIGISMITH_STATE = note;
    startHook(ev(), env, { now: T0 });
    endHook(ev("s1", { reason: "other" }), env, { now: new Date(T0.getTime() + 600_000) });
    const text = fs.readFileSync(note, "utf8");
    expect(text.startsWith("# note\n<!-- digismith:conductor-state v1 -->\nx\n<!-- /digismith:conductor-state -->\n")).toBe(true);
    expect(text).toContain("## Session end dgs-418 (s1) 2026-10-13T14:10+07:00\nResult: ended (other)\nHandoff:");
    expect(text.split("\n").length).toBeLessThan(20);
  });
  it("closes the card even when the note's folder is missing", () => {
    env.DIGISMITH_STATE = path.join(depot, "nope", "note.md");
    startHook(ev(), env, { now: T0 });
    const r = endHook(ev("s1", { reason: "other" }), env, { now: T0 });
    expect(r.closed).toBe(true);
    expect(r.note).toBe("skipped");
  });
  it("is a no-op the second time and for an unknown session", () => {
    startHook(ev(), env, { now: T0 });
    endHook(ev(), env, { now: T0 });
    expect(endHook(ev(), env, { now: T0 }).closed).toBe(false);
    expect(endHook(ev("zzz"), env, { now: T0 }).closed).toBe(false);
  });
});

describe("startHook identity branch (DGS-411)", () => {
  let repo: string;
  const record = () => ({
    id: "digismith-maestro", name: "DigiSmith Maestro", owner: "jack", project: "DigiSmith", folder: repo,
    conductors: ["digismith-conductor"], role: "maestro", machine: "jack-desktop", state: path.join(repo, "note.md"), created: "2026-10-13T15:00+07:00",
  });
  const bare = () => ({ DIGISMITH_DEPOT_DIR: depot } as NodeJS.ProcessEnv);
  beforeEach(() => {
    repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "dgs411-repo-")));
    execFileSync("git", ["init", "-q", repo]);
    execFileSync("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "i"]);
  });
  afterEach(() => fs.rmSync(repo, { recursive: true, force: true }));

  it("writes the card from the record and returns the context line", () => {
    writeIdentity(record(), bare());
    const r = startHook({ session_id: "d1", cwd: repo }, bare(), { now: T0 });
    expect(r.wrote).toBe(true);
    expect(r.context).toContain("DigiSmith Maestro");
    expect(r.context).toContain("session d1");
    expect(r.context).toContain("conductor digismith-conductor");
    expect(r.context).toContain("No other open session");
    const c = findCardBySession("d1", "DigiSmith", bare())!.card;
    expect(c).toMatchObject({ role: "maestro", id: "digismith-maestro", domain: "DigiSmith", status: "open" });
  });
  it("a cwd inside a worktree maps to the main checkout's record", () => {
    writeIdentity(record(), bare());
    const wt = path.join(repo, ".worktrees", "w");
    execFileSync("git", ["-C", repo, "worktree", "add", "-q", "-b", "w", wt]);
    expect(startHook({ session_id: "d2", cwd: wt }, bare(), { now: T0 }).wrote).toBe(true);
  });
  it("a second session shows the first in the context line; a resume reprints without a second card", () => {
    writeIdentity(record(), bare());
    startHook({ session_id: "d1", cwd: repo }, bare(), { now: T0 });
    const second = startHook({ session_id: "d2", cwd: repo }, bare(), { now: T0 });
    expect(second.context).toContain("Other open sessions of this identity: d1");
    const again = startHook({ session_id: "d2", cwd: repo }, bare(), { now: T0 });
    expect(again.wrote).toBe(false);
    expect(again.context).toContain("session d2");
    expect(listCards("DigiSmith", { scope: "open", env: bare() })).toHaveLength(2);
  });
  it("two records naming the folder: no card, a note", () => {
    writeIdentity(record(), bare());
    writeIdentity({ ...record(), id: "second-maestro", name: "Second" }, bare());
    const r = startHook({ session_id: "d1", cwd: repo }, bare(), { now: T0 });
    expect(r.wrote).toBe(false);
    expect(r.context).toBeUndefined();
    expect(r.reason).toContain("digismith-maestro, second-maestro");
    expect(listCards("DigiSmith", { env: bare() })).toHaveLength(0);
  });
  it("inside herdr, or with DIGISMITH_ROLE set, the identity branch stays silent", () => {
    writeIdentity(record(), bare());
    expect(startHook({ session_id: "d1", cwd: repo }, { ...bare(), HERDR_PANE_ID: "w2:p1" }).context).toBeUndefined();
    expect(startHook({ session_id: "d1", cwd: repo }, { ...bare(), DIGISMITH_ROLE: "bogus" }).wrote).toBe(false);
  });
  it("env sessions are unchanged and print no context", () => {
    writeIdentity(record(), bare());
    const r = startHook(ev("w1", { cwd: repo }), env, { now: T0 });
    expect(r.wrote).toBe(true);
    expect(r.context).toBeUndefined();
    expect(findCardBySession("w1", "DigiSmith", env)!.card.role).toBe("worker");
  });
  it("no record, an unrelated folder, a broken record: no card, no throw", () => {
    expect(startHook({ session_id: "d1", cwd: repo }, bare()).wrote).toBe(false);
    fs.mkdirSync(path.join(depot, "identities"), { recursive: true });
    fs.writeFileSync(path.join(depot, "identities", "bad.yml"), "garbage\n");
    expect(startHook({ session_id: "d1", cwd: repo }, bare()).wrote).toBe(false);
    expect(startHook({ session_id: "d1", cwd: "/nonexistent/dir" }, bare()).wrote).toBe(false);
    expect(startHook({ session_id: "d1" }, bare()).wrote).toBe(false);
  });
  it("the hook CLI main prints the context and never throws", () => {
    writeIdentity(record(), bare());
    const out = main("start", JSON.stringify({ session_id: "d9", cwd: repo }), bare());
    expect(out).toContain("[digismith identity]");
    expect(main("start", JSON.stringify({ session_id: "d9", cwd: repo }), { DIGISMITH_DEPOT_DIR: "/dev/null/x" } as NodeJS.ProcessEnv)).toBe("");
  });
});
