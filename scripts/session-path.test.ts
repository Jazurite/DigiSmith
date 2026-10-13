import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  SESSIONS_DIR_PATH,
  NOTE_FILENAME,
  BRIEF_FILENAME,
  isSafeSessionName,
  noteRelPath,
  briefRelPath,
  listNoteSessionNames,
  projectName,
  sessionsRoot,
  maestroNotePath,
  conductorNotePath,
  ordersDir,
  listDepotNoteNames,
  listUnmovedNoteNames,
  noteLocation,
  resolveNote,
} from "./session-path.ts";

describe("isSafeSessionName", () => {
  it("accepts a plain name", () => {
    expect(isSafeSessionName("DigiSmith")).toBe(true);
  });

  it("accepts a name with spaces and a non-ASCII glyph (a worker's full title)", () => {
    expect(isSafeSessionName("DGS-159 ⚚ Ticket-based naming code")).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(isSafeSessionName("")).toBe(false);
  });

  it("rejects '.' and '..'", () => {
    expect(isSafeSessionName(".")).toBe(false);
    expect(isSafeSessionName("..")).toBe(false);
  });

  it("rejects a name containing a path separator", () => {
    expect(isSafeSessionName("a/b")).toBe(false);
    expect(isSafeSessionName("a\\b")).toBe(false);
  });

  it("rejects a dotfile-style name", () => {
    expect(isSafeSessionName(".old")).toBe(false);
  });

  it("rejects a lineage-key title with a sub-number and description", () => {
    expect(isSafeSessionName("A.1: Primitives")).toBe(false);
  });

  it("rejects a bare clan-letter lineage-key title", () => {
    expect(isSafeSessionName("K: Maestro")).toBe(false);
  });

  it("still accepts a worker's full ⚚ title — it only looks like a lineage key if it starts with a single letter, dot/colon, then nothing else", () => {
    expect(isSafeSessionName("DGS-159 ⚚ Ticket-based naming code")).toBe(true);
  });
});

describe("noteRelPath / briefRelPath", () => {
  it("builds the note path for a plain session name", () => {
    expect(noteRelPath("DigiSmith")).toBe(`${SESSIONS_DIR_PATH}/DigiSmith/${NOTE_FILENAME}`);
  });

  it("builds the brief path for a worker's agent name", () => {
    expect(briefRelPath("dgs-159")).toBe(`${SESSIONS_DIR_PATH}/dgs-159/${BRIEF_FILENAME}`);
  });

  it("builds the same path shape for a title containing spaces and ⚚ — no special-casing needed", () => {
    // Only the plain agent name is ever used as <session-name> in practice (section 4); this
    // just confirms the builder itself doesn't need to understand ⚚ to do its job.
    const name = "DGS-159 ⚚ Ticket-based naming code";
    expect(noteRelPath(name)).toBe(`${SESSIONS_DIR_PATH}/${name}/${NOTE_FILENAME}`);
  });
});

describe("listNoteSessionNames", () => {
  let tmpDir: string;

  function writeFile(root: string, relPath: string, content = "x"): void {
    const full = path.join(root, ...relPath.split("/"));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-session-path-test-"));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns an empty list when .digismith/sessions/ doesn't exist", () => {
    expect(listNoteSessionNames(tmpDir)).toEqual([]);
  });

  it("lists a session folder that holds a note.md (a maestro)", () => {
    writeFile(tmpDir, `${SESSIONS_DIR_PATH}/DigiSmith/note.md`);
    expect(listNoteSessionNames(tmpDir)).toEqual(["DigiSmith"]);
  });

  it("excludes a brief-only folder (a worker)", () => {
    writeFile(tmpDir, `${SESSIONS_DIR_PATH}/DigiSmith/note.md`);
    writeFile(tmpDir, `${SESSIONS_DIR_PATH}/dgs-161/brief.md`);
    expect(listNoteSessionNames(tmpDir)).toEqual(["DigiSmith"]);
  });

  it("excludes workbox-archive (a dated subfolder, not a note, directly inside it)", () => {
    writeFile(tmpDir, `${SESSIONS_DIR_PATH}/DigiSmith/note.md`);
    writeFile(tmpDir, `${SESSIONS_DIR_PATH}/workbox-archive/2026-09-26-v8-sol-review/progress.md`);
    expect(listNoteSessionNames(tmpDir)).toEqual(["DigiSmith"]);
  });

  it("excludes a dotfile housekeeping folder (.old)", () => {
    writeFile(tmpDir, `${SESSIONS_DIR_PATH}/DigiSmith/note.md`);
    writeFile(tmpDir, `${SESSIONS_DIR_PATH}/.old/workbox.md.before-flux-2026-10-03`);
    expect(listNoteSessionNames(tmpDir)).toEqual(["DigiSmith"]);
  });

  it("ignores workbox.md, a flat file directly under sessions/", () => {
    writeFile(tmpDir, `${SESSIONS_DIR_PATH}/workbox.md`);
    expect(listNoteSessionNames(tmpDir)).toEqual([]);
  });

  it("sorts multiple session names", () => {
    writeFile(tmpDir, `${SESSIONS_DIR_PATH}/Soveron/note.md`);
    writeFile(tmpDir, `${SESSIONS_DIR_PATH}/DigiSmith/note.md`);
    writeFile(tmpDir, `${SESSIONS_DIR_PATH}/Emma/note.md`);
    expect(listNoteSessionNames(tmpDir)).toEqual(["DigiSmith", "Emma", "Soveron"]);
  });
});

describe("depot note paths (DGS-443)", () => {
  let tmp: string;
  let env: NodeJS.ProcessEnv;
  const write = (full: string) => {
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, "x");
  };

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-depot-path-test-"));
    env = { DIGISMITH_DEPOT_DIR: path.join(tmp, "depot") };
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("names the project after the main checkout's folder", () => {
    expect(projectName("/a/b/DigiSmith")).toBe("DigiSmith");
  });

  it("builds the DGS-443 layout under the depot", () => {
    const root = path.join(tmp, "depot", "sessions", "DigiSmith");
    expect(sessionsRoot("DigiSmith", env)).toBe(root);
    expect(maestroNotePath("DigiSmith", "Token Economics", env)).toBe(path.join(root, "maestros", "Token Economics", "note.md"));
    expect(conductorNotePath("DigiSmith", "digismith-conductor", env)).toBe(path.join(root, "digismith-conductor", "note.md"));
    expect(ordersDir("DigiSmith", env)).toBe(path.join(root, "orders"));
  });

  it("refuses an unsafe project, title or conductor name", () => {
    expect(() => maestroNotePath("DigiSmith", "../x", env)).toThrow();
    expect(() => maestroNotePath("DigiSmith", "A.1: Primitives", env)).toThrow();
    expect(() => conductorNotePath("DigiSmith", "a/b", env)).toThrow();
    expect(() => sessionsRoot("..", env)).toThrow();
  });

  it("lists the Maestros that hold a note in the depot, sorted", () => {
    write(maestroNotePath("P", "Scheduling", env));
    write(maestroNotePath("P", "Nexus", env));
    write(path.join(sessionsRoot("P", env), "maestros", "empty", "brief.md"));
    expect(listDepotNoteNames("P", env)).toEqual(["Nexus", "Scheduling"]);
    expect(listDepotNoteNames("Other", env)).toEqual([]);
  });

  it("lists old-location notes that have no depot copy yet", () => {
    const main = path.join(tmp, "P");
    write(path.join(main, SESSIONS_DIR_PATH, "Scheduling", "note.md"));
    write(path.join(main, SESSIONS_DIR_PATH, "Nexus", "note.md"));
    write(maestroNotePath("P", "Nexus", env));
    expect(listUnmovedNoteNames(main, env)).toEqual(["Scheduling"]);
  });

  it("a project folder with an unsafe name has no depot notes and does not throw", () => {
    const main = path.join(tmp, "my proj");
    write(path.join(main, SESSIONS_DIR_PATH, "Nexus", "note.md"));
    expect(listDepotNoteNames("my proj", env)).toEqual([]);
    expect(listUnmovedNoteNames(main, env)).toEqual(["Nexus"]);
  });

  it("the DigiSmith note is shared: it lives at the conductor path and counts as moved", () => {
    expect(noteLocation("P", "DigiSmith", env)).toBe(conductorNotePath("P", "digismith-conductor", env));
    expect(noteLocation("P", "Nexus", env)).toBe(maestroNotePath("P", "Nexus", env));
    const main = path.join(tmp, "P");
    write(path.join(main, SESSIONS_DIR_PATH, "DigiSmith", "note.md"));
    expect(listUnmovedNoteNames(main, env)).toEqual(["DigiSmith"]);
    write(conductorNotePath("P", "digismith-conductor", env));
    expect(listDepotNoteNames("P", env)).toEqual(["DigiSmith"]);
    expect(listUnmovedNoteNames(main, env)).toEqual([]);
  });

  it("resolveNote: depot if the note exists there, else the old copy, else none", () => {
    const main = path.join(tmp, "P");
    const depotPath = maestroNotePath("P", "Scheduling", env);
    const oldPath = path.join(main, SESSIONS_DIR_PATH, "Scheduling", "note.md");
    expect(resolveNote(main, "Scheduling", env)).toEqual({ source: "none", path: depotPath, writePath: depotPath });
    write(oldPath);
    expect(resolveNote(main, "Scheduling", env)).toEqual({ source: "old", path: oldPath, writePath: depotPath });
    write(depotPath);
    expect(resolveNote(main, "Scheduling", env)).toEqual({ source: "depot", path: depotPath, writePath: depotPath });
  });

  it("resolveNote follows the shared DigiSmith note and refuses an unsafe title", () => {
    const main = path.join(tmp, "P");
    write(conductorNotePath("P", "digismith-conductor", env));
    expect(resolveNote(main, "DigiSmith", env).source).toBe("depot");
    expect(() => resolveNote(main, "A.1: Primitives", env)).toThrow();
  });
});
