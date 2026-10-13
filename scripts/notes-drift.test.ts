import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { findDrift } from "./notes-drift.ts";

let tmp: string;
let main: string;
let env: NodeJS.ProcessEnv;
const put = (file: string, text: string, mtime?: Date) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  if (mtime) fs.utimesSync(file, mtime, mtime);
};
const oldNote = (title: string) => path.join(main, ".digismith/sessions", title, "note.md");
const newNote = (title: string) => path.join(tmp, "depot/sessions/Proj/maestros", title, "note.md");

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dgs443-drift-"));
  main = path.join(tmp, "Proj");
  env = { DIGISMITH_DEPOT_DIR: path.join(tmp, "depot") };
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("findDrift", () => {
  it("reports nothing when old and new are identical", () => {
    put(oldNote("Scheduling"), "a");
    put(newNote("Scheduling"), "a");
    expect(findDrift(main, env)).toEqual([]);
  });

  it("reports a missing depot copy", () => {
    put(oldNote("Scheduling"), "a");
    expect(findDrift(main, env)).toEqual([
      { title: "Scheduling", old: oldNote("Scheduling"), copy: newNote("Scheduling"), problem: "no depot copy" },
    ]);
  });

  it("reports an old file written after the copy (a lost write)", () => {
    put(newNote("Nexus"), "a", new Date("2026-10-13T10:00:00Z"));
    put(oldNote("Nexus"), "a plus a late line", new Date("2026-10-13T11:00:00Z"));
    const [d] = findDrift(main, env);
    expect(d.problem).toBe("old copy changed after the depot copy");
  });

  it("stays quiet when the old file differs but is older than the copy (the new note moved on)", () => {
    put(oldNote("Nexus"), "a", new Date("2026-10-13T10:00:00Z"));
    put(newNote("Nexus"), "a and more", new Date("2026-10-13T11:00:00Z"));
    expect(findDrift(main, env)).toEqual([]);
  });

  it("maps the shared DigiSmith note to the conductor path", () => {
    put(oldNote("DigiSmith"), "a");
    expect(findDrift(main, env)[0].copy).toBe(path.join(tmp, "depot/sessions/Proj/digismith-conductor/note.md"));
  });

  it("covers the runbooks", () => {
    put(path.join(main, ".digismith/sessions/workbox.md"), "a");
    expect(findDrift(main, env)[0].copy).toBe(path.join(tmp, "depot/sessions/Proj/workbox.md"));
  });
});
