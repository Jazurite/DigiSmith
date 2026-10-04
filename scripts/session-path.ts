// Builds and parses `.digismith/sessions/<session-name>/{note,brief}.md` paths.
// Spec: .digismith/docs/E/E.3/worker-maestro-conventions/design.html, sections 3 and 9.

import * as fs from "node:fs";
import * as path from "node:path";

export const SESSIONS_DIR_PATH = ".digismith/sessions";
export const NOTE_FILENAME = "note.md";
export const BRIEF_FILENAME = "brief.md";

// skills/handoff/SKILL.md's prose (Resolve the Note, step 2) excludes a lineage-key title the
// same way lineage-handoff.ts's own parseLineageKey does. Duplicated here rather than imported —
// lineage-handoff.ts already imports from this module (listNoteSessionNames), and importing back
// from it would make the two modules circular, against the "independent siblings" split this
// file's own top comment describes.
const LINEAGE_KEY_PATTERN = /^\s*[A-Z](\.\d+)?\s*(:|$)/;

// The same "safe path segment" rule skills/handoff/SKILL.md's prose already applies by hand
// (Resolve the Note, step 2) — centralized here so a future script consumer doesn't re-derive
// it slightly differently. A leading "." also excludes `.old`-style housekeeping folders, which
// are never real session names. A lineage-key-looking name ("A.1: Primitives", "K: Maestro") is
// excluded too, same as the skill's own rule — in practice such a title never reaches
// .digismith/sessions/ at all (the skill redirects it to the old fallback path instead), but a
// stray folder with that shape should not be mistaken for a current-convention session either.
export function isSafeSessionName(name: string): boolean {
  return (
    name.length > 0 &&
    name !== ".." &&
    !name.startsWith(".") &&
    !name.includes("/") &&
    !name.includes("\\") &&
    !LINEAGE_KEY_PATTERN.test(name)
  );
}

export function noteRelPath(sessionName: string): string {
  return `${SESSIONS_DIR_PATH}/${sessionName}/${NOTE_FILENAME}`;
}

export function briefRelPath(sessionName: string): string {
  return `${SESSIONS_DIR_PATH}/${sessionName}/${BRIEF_FILENAME}`;
}

function subdirs(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

function hasFile(dir: string, filename: string): boolean {
  try {
    return fs.statSync(path.join(dir, filename)).isFile();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}

// Session names (herdr agent names, Desktop session titles) that currently hold a note.md —
// i.e. maestro sessions. A worker's brief-only folder (dgs-161: brief.md, no note.md) and a
// non-session folder with no note.md directly inside it (workbox-archive: a dated subfolder,
// not a note) are both excluded by the same `hasFile` check, with no special-casing needed.
export function listNoteSessionNames(mainRoot: string): string[] {
  const dir = path.join(mainRoot, ...SESSIONS_DIR_PATH.split("/"));
  return subdirs(dir)
    .filter((name) => isSafeSessionName(name) && hasFile(path.join(dir, name), NOTE_FILENAME))
    .sort();
}
