import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { findDrift } from "./notes-drift.ts";
import { switchNote } from "./notes-switch.ts";

let tmp: string, main: string, env: NodeJS.ProcessEnv;
const put = (f: string, t: string) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
const old = (t: string) => path.join(main, ".digismith/sessions", t, "note.md");
const at = (t: string, iso: string) => { const d = new Date(iso); fs.utimesSync(old(t), d, d); };
const T0 = new Date("2026-10-13T10:00:00.000Z");

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dgs443-drift-"));
  main = path.join(tmp, "Proj");
  env = { DIGISMITH_DEPOT_DIR: path.join(tmp, "depot") };
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("findDrift", () => {
  it("lists an old note with no switch record as pending, not as drift", () => {
    put(old("Scheduling"), "a");
    expect(findDrift(main, env)).toEqual({ drift: [], pending: ["Scheduling"] });
  });

  it("reports nothing for a switched note whose old file is unchanged", () => {
    put(old("Nexus"), "a"); at("Nexus", "2026-10-13T09:00:00Z");
    switchNote(main, "Nexus", { env, now: () => T0 });
    expect(findDrift(main, env)).toEqual({ drift: [], pending: [] });
  });

  it("flags ANY old-path write after the recorded switch time, even with the same content", () => {
    put(old("Nexus"), "a"); at("Nexus", "2026-10-13T09:00:00Z");
    switchNote(main, "Nexus", { env, now: () => T0 });
    at("Nexus", "2026-10-13T10:05:00Z");
    expect(findDrift(main, env).drift).toMatchObject([{ key: "Nexus", problem: "old path written after the switch" }]);
  });

  it("still flags a stray old write when the depot copy was written later", () => {
    put(old("Nexus"), "a"); at("Nexus", "2026-10-13T09:00:00Z");
    const r = switchNote(main, "Nexus", { env, now: () => T0 });
    fs.appendFileSync(old("Nexus"), "stray"); at("Nexus", "2026-10-13T10:05:00Z");
    fs.appendFileSync(r.copy, "newer depot write");
    expect(findDrift(main, env).drift).toHaveLength(1);
  });

  it("flags a recorded switch whose depot copy is gone", () => {
    put(old("Nexus"), "a"); at("Nexus", "2026-10-13T09:00:00Z");
    const r = switchNote(main, "Nexus", { env, now: () => T0 });
    fs.rmSync(r.copy);
    expect(findDrift(main, env).drift).toMatchObject([{ key: "Nexus", problem: "depot copy missing" }]);
  });

  it("covers the runbooks", () => {
    put(path.join(main, ".digismith/sessions/workbox.md"), "a");
    expect(findDrift(main, env).pending).toEqual(["workbox.md"]);
  });
});
