// Builds and parses `.digismith/sessions/<session-name>/{note,brief}.md` paths.
// Spec: .digismith/docs/E/E.3/worker-maestro-conventions/design.html, sections 3 and 9.

import * as fs from "node:fs";
import * as path from "node:path";
import { depotDir } from "./depot-dir.ts";
import { isSafeName } from "./conductor/safe-name.ts";

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
// i.e. conductor and Maestro sessions. A worker's brief-only folder (dgs-161: brief.md, no note.md) and a
// non-session folder with no note.md directly inside it (workbox-archive: a dated subfolder,
// not a note) are both excluded by the same `hasFile` check, with no special-casing needed.
export function listNoteSessionNames(mainRoot: string): string[] {
  const dir = path.join(mainRoot, ...SESSIONS_DIR_PATH.split("/"));
  return subdirs(dir)
    .filter((name) => isSafeSessionName(name) && hasFile(path.join(dir, name), NOTE_FILENAME))
    .sort();
}

// DGS-443: the live notes live in the depot, `<depot>/sessions/<project>/`. The repo's
// `.digismith/sessions/` copies stay as the old location (read-only fallback, never rewritten).
export const MAESTROS_DIR_NAME = "maestros";
export const ORDERS_DIR_NAME = "orders";

export function projectName(mainRoot: string): string {
  return path.basename(mainRoot);
}

function safeName(label: string, value: string): string {
  if (!isSafeName(value)) throw new Error(`${label}: not a safe folder or file name`);
  return value;
}

export function sessionsRoot(project: string, env: NodeJS.ProcessEnv = process.env): string {
  return path.join(depotDir(env), "sessions", safeName("project", project));
}

function safeTitle(title: string): string {
  if (!isSafeSessionName(title)) throw new Error(`unsafe session title: ${JSON.stringify(title)}`);
  return title;
}

export function maestroNotePath(project: string, title: string, env: NodeJS.ProcessEnv = process.env): string {
  return path.join(sessionsRoot(project, env), MAESTROS_DIR_NAME, safeTitle(title), NOTE_FILENAME);
}

export function conductorNotePath(project: string, conductor: string, env: NodeJS.ProcessEnv = process.env): string {
  return path.join(sessionsRoot(project, env), safeName("conductor", conductor), NOTE_FILENAME);
}

export function ordersDir(project: string, env: NodeJS.ProcessEnv = process.env): string {
  return path.join(sessionsRoot(project, env), ORDERS_DIR_NAME);
}

// DGS-443 answer A: the DigiSmith Maestro and the conductor share one note, held at the conductor's
// path. The split is a later ticket (DGS-447); delete this entry then.
export const SHARED_NOTES: Readonly<Record<string, string>> = { DigiSmith: "digismith-conductor" };

// Where the note of the session with this title lives in the depot.
export function noteLocation(project: string, title: string, env: NodeJS.ProcessEnv = process.env): string {
  const conductor = Object.hasOwn(SHARED_NOTES, title) ? SHARED_NOTES[title] : undefined;
  return conductor ? conductorNotePath(project, conductor, env) : maestroNotePath(project, title, env);
}

export function listDepotNoteNames(project: string, env: NodeJS.ProcessEnv = process.env): string[] {
  const dir = path.join(sessionsRoot(project, env), MAESTROS_DIR_NAME);
  const names = subdirs(dir).filter((name) => isSafeSessionName(name) && hasFile(path.join(dir, name), NOTE_FILENAME));
  for (const title of Object.keys(SHARED_NOTES)) {
    if (hasFile(path.dirname(noteLocation(project, title, env)), NOTE_FILENAME) && !names.includes(title)) names.push(title);
  }
  return names.sort();
}

// Old-location notes whose depot copy does not exist yet: still readable by "resume".
export function listUnmovedNoteNames(mainRoot: string, env: NodeJS.ProcessEnv = process.env): string[] {
  const moved = new Set(listDepotNoteNames(projectName(mainRoot), env));
  return listNoteSessionNames(mainRoot).filter((name) => !moved.has(name));
}
