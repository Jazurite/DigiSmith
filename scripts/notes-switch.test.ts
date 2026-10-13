import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { switchNote, repointState, readSwitches, switchesFile } from "./notes-switch.ts";

let tmp: string, main: string, env: NodeJS.ProcessEnv, depot: string;
const put = (f: string, t: string) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
const old = (t: string) => path.join(main, ".digismith/sessions", t, "note.md");
const copy = (t: string) => path.join(depot, "sessions/Proj/maestros", t, "note.md");
const NOW = new Date("2026-10-13T09:30:00.000Z");

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dgs443-switch-"));
  main = path.join(tmp, "Proj");
  depot = path.join(tmp, "depot");
  env = { DIGISMITH_DEPOT_DIR: depot };
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("switchNote", () => {
  it("copies, verifies, records the time, and leaves the old file untouched", () => {
    put(old("Scheduling"), "line 1\n");
    const before = fs.statSync(old("Scheduling")).mtimeMs;
    const r = switchNote(main, "Scheduling", { env, now: () => NOW });
    expect(r.copy).toBe(copy("Scheduling"));
    expect(fs.readFileSync(copy("Scheduling"), "utf8")).toBe("line 1\n");
    expect(fs.readFileSync(old("Scheduling"), "utf8")).toBe("line 1\n");
    expect(fs.statSync(old("Scheduling")).mtimeMs).toBe(before);
    expect(readSwitches("Proj", env)["Scheduling"]).toMatchObject({ old: old("Scheduling"), copy: copy("Scheduling"), at: "2026-10-13T09:30:00.000Z", bytes: 7 });
  });

  it("maps the shared DigiSmith note to the conductor path and a runbook to the project folder", () => {
    put(old("DigiSmith"), "x");
    put(path.join(main, ".digismith/sessions/workbox.md"), "rb");
    expect(switchNote(main, "DigiSmith", { env, now: () => NOW }).copy).toBe(path.join(depot, "sessions/Proj/digismith-conductor/note.md"));
    expect(switchNote(main, "workbox.md", { env, now: () => NOW }).copy).toBe(path.join(depot, "sessions/Proj/workbox.md"));
  });

  it("refuses to overwrite an existing depot copy and to switch twice", () => {
    put(old("Nexus"), "a");
    put(copy("Nexus"), "other");
    expect(() => switchNote(main, "Nexus", { env, now: () => NOW })).toThrow(/already exists/);
    expect(fs.readFileSync(copy("Nexus"), "utf8")).toBe("other");
  });

  it("refuses a second switch of a recorded note", () => {
    put(old("Nexus"), "a");
    switchNote(main, "Nexus", { env, now: () => NOW });
    expect(() => switchNote(main, "Nexus", { env, now: () => NOW })).toThrow(/already switched/);
  });

  it("fails and records nothing when the old note changes during the copy", () => {
    put(old("Nexus"), "a");
    expect(() => switchNote(main, "Nexus", { env, now: () => NOW, afterCopy: () => fs.appendFileSync(old("Nexus"), "late") })).toThrow(/changed during the copy/);
    expect(readSwitches("Proj", env)["Nexus"]).toBeUndefined();
  });

  it("refuses an unsafe title and a missing old note", () => {
    expect(() => switchNote(main, "../x", { env, now: () => NOW })).toThrow();
    expect(() => switchNote(main, "Ghost", { env, now: () => NOW })).toThrow(/no old note/);
  });
});

describe("repointState", () => {
  const card = (name: string, state: string, status = "open") => {
    const f = path.join(depot, "sessions/Proj/cards", name);
    put(f, `name: Scheduling Maestro\nrole: maestro\nid: m\nsession: s\ndomain: Proj\nstate: ${state}\nstatus: ${status}\n`);
    return f;
  };

  it("rewrites only the state: line of open cards that point at the old path", () => {
    put(old("Scheduling"), "a");
    switchNote(main, "Scheduling", { env, now: () => NOW });
    const hit = card("m--s.yml", old("Scheduling"));
    const other = card("m--t.yml", "/elsewhere/note.md");
    const r = repointState(main, "Scheduling", { env });
    expect(r.cards).toEqual([hit]);
    expect(fs.readFileSync(hit, "utf8")).toBe(`name: Scheduling Maestro\nrole: maestro\nid: m\nsession: s\ndomain: Proj\nstate: ${copy("Scheduling")}\nstatus: open\n`);
    expect(fs.readFileSync(other, "utf8")).toContain("/elsewhere/note.md");
  });

  it("does not touch archived cards and refuses before the switch is recorded", () => {
    put(old("Scheduling"), "a");
    expect(() => repointState(main, "Scheduling", { env })).toThrow(/not switched/);
    switchNote(main, "Scheduling", { env, now: () => NOW });
    const archived = path.join(depot, "sessions/Proj/archive/m--z.yml");
    put(archived, `state: ${old("Scheduling")}\nstatus: closed\n`);
    repointState(main, "Scheduling", { env });
    expect(fs.readFileSync(archived, "utf8")).toContain(old("Scheduling"));
  });

  it("matches a card whose state is relative to the main checkout", () => {
    put(old("Scheduling"), "a");
    switchNote(main, "Scheduling", { env, now: () => NOW });
    const f = card("m--r.yml", ".digismith/sessions/Scheduling/note.md");
    expect(repointState(main, "Scheduling", { env }).cards).toEqual([f]);
  });

  it("repoints the identity record only when asked for it", () => {
    put(old("DigiSmith"), "a");
    switchNote(main, "DigiSmith", { env, now: () => NOW });
    const idf = path.join(depot, "identities/digismith-maestro.yml");
    put(idf, `id: digismith-maestro\nstate: ${old("DigiSmith")}\ncreated: x\n`);
    expect(repointState(main, "DigiSmith", { env }).identities).toEqual([]);
    expect(repointState(main, "DigiSmith", { env, identities: true }).identities).toEqual([idf]);
    expect(fs.readFileSync(idf, "utf8")).toContain(`state: ${path.join(depot, "sessions/Proj/digismith-conductor/note.md")}`);
  });

  it("is repeatable: a second run changes nothing", () => {
    put(old("Scheduling"), "a");
    switchNote(main, "Scheduling", { env, now: () => NOW });
    card("m--s.yml", old("Scheduling"));
    repointState(main, "Scheduling", { env });
    expect(repointState(main, "Scheduling", { env }).cards).toEqual([]);
    expect(fs.existsSync(switchesFile("Proj", env))).toBe(true);
  });
});
