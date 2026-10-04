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
