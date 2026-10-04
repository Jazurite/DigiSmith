import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs, requireArgs } from "./cli-args.ts";

// Builds and parses `.digismith/board/<KEY>—<slug>/` folder names (em dash, U+2014).
// Spec: .digismith/docs/E/E.3/worker-maestro-conventions/design.html, sections 2 and 9.

export const BOARD_DIR_PATH = ".digismith/board";
const EM_DASH = "—";
const KEY_PATTERN = /^[A-Z]+-\d+$/;
const FILLER_WORDS = new Set(["a", "an", "the", "on", "to", "of", "for", "in"]);

// jira-intake's own slug algorithm (SKILL.md Step 3.1), codified here for the first time — no
// prior code implemented it, only prose for an LLM to follow by hand. The prose lists "drop
// filler words" before "truncate to ~40 characters at a word boundary", but its own worked
// example ("Fix cart drawer padding on mobile checkout" -> "fix-cart-drawer-padding-mobile")
// only reproduces under the opposite order: the 40-character budget is spent on the original
// word sequence (fillers included), and filler words are dropped only from what survives that
// cut — "checkout" alone would still fit a filler-dropped budget, so budgeting on the
// filler-dropped words can't be what the example means. Order implemented here matches the
// example, not the prose's literal word order.
export function slugify(title: string): string {
  const words = title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 0);

  const kept: string[] = [];
  let length = 0;
  for (const word of words) {
    const next = kept.length === 0 ? word.length : length + 1 + word.length;
    if (next > 40) break;
    kept.push(word);
    length = next;
  }

  // Dropping fillers after truncation, from wherever they sit in `kept`, means none can ever
  // end up trailing in the joined result — no separate "trailing filler" check needed.
  return kept.filter((word) => !FILLER_WORDS.has(word)).join("-");
}

export function buildFolderName(key: string, title: string): string {
  const slug = slugify(title);
  if (slug === "") {
    // slugify keeps only ASCII letters/digits and drops fillers — a title with none of those
    // (all non-ASCII, or entirely filler words) produces an empty slug, which would otherwise
    // silently build "<KEY>—" with nothing after the dash.
    throw new Error(`cannot build a board folder name: title has no slug-able content: ${title}`);
  }
  // NFC is a no-op today (slugify only ever emits ASCII) — defensive per section 9, in case a
  // future slugify revision keeps more of the title's own characters.
  return `${key.toUpperCase()}${EM_DASH}${slug}`.normalize("NFC");
}

export function boardRelPath(key: string, title: string): string {
  return `${BOARD_DIR_PATH}/${buildFolderName(key, title)}`;
}

export type ParsedFolderName = { key: string; slug: string };

export function parseFolderName(name: string): ParsedFolderName {
  const dashIndex = name.indexOf(EM_DASH);
  if (dashIndex === -1) {
    throw new Error(`no em dash (U+2014) found in board folder name: ${name}`);
  }
  const rawKey = name.slice(0, dashIndex).toUpperCase();
  if (!KEY_PATTERN.test(rawKey)) {
    throw new Error(`board folder name's key part is not <PREFIX>-<number>: ${name}`);
  }
  // The slug can never itself contain U+2014 (slugify only emits ASCII hyphens), so splitting
  // at the first occurrence is always unambiguous — no need to find the last one.
  const slug = name.slice(dashIndex + EM_DASH.length);
  return { key: rawKey, slug };
}

// For a caller that already has a final key and slug in hand (init, resolving one from a
// branch name) rather than a raw title — skips slugify, which an already-final slug must never
// go through again (re-truncation/re-filler-dropping on it is not guaranteed idempotent).
export function boardRelPathForSlug(key: string, slug: string): string {
  return `${BOARD_DIR_PATH}/${key.toUpperCase()}${EM_DASH}${slug}`.normalize("NFC");
}

// Finds a keyed ticket's board folder by slug alone — a folder's own key does not have to match
// whatever key (if any) the branch name carries. DigiSmith's own repo already has this today:
// branch "plugin-update-after-merge" (no key) against folder "DGS-161—plugin-update-after-merge"
// (keyed). Reconstructing the folder name from the branch's own key would miss that folder.
// Entries are sorted before scanning: readdir's own order is not defined, so if two folders ever
// shared one slug, scanning raw readdir order would be nondeterministic — sorting first means it
// always resolves to the same one (the first match in sorted order), every time.
// `root` is the working tree to search — the CURRENT checkout, not necessarily the main one. A
// worker's own worktree holds its own board folder until the ticket merges; it does not exist in
// the main checkout before then. Searching the main checkout from inside a worktree would
// silently miss every folder that worktree itself just created.
export function findBoardFolderBySlug(slug: string, root: string): string | undefined {
  const dir = path.join(root, ...BOARD_DIR_PATH.split("/"));
  let entries: string[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
  for (const name of entries) {
    let parsed: ParsedFolderName;
    try {
      parsed = parseFolderName(name);
    } catch {
      continue; // not a board-shaped folder name — skip it, don't fail the whole scan
    }
    if (parsed.slug === slug) return name;
  }
  return undefined;
}

// `--root` lets a test (or an unusual caller) point this at an arbitrary directory, bypassing
// git entirely. Otherwise: the current working tree's own top level — never the main checkout
// (see findBoardFolderBySlug's own comment above) — falling back to the bare cwd if this
// directory isn't a git repo at all.
function resolveCurrentRoot(cwd: string): string {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : cwd;
}

export function main(): void {
  const args = parseArgs(process.argv.slice(2));
  try {
    requireArgs(args, ["action"]);
    switch (args.action) {
      case "path": {
        requireArgs(args, ["key"]);
        if (args.title !== undefined) {
          console.log(boardRelPath(args.key, args.title));
        } else {
          requireArgs(args, ["slug"]);
          console.log(boardRelPathForSlug(args.key, args.slug));
        }
        break;
      }
      case "find": {
        requireArgs(args, ["slug"]);
        const root = args.root ?? resolveCurrentRoot(process.cwd());
        const found = findBoardFolderBySlug(args.slug, root);
        if (found !== undefined) console.log(found);
        break;
      }
      case "parse": {
        requireArgs(args, ["name"]);
        const parsed = parseFolderName(args.name);
        console.log(parsed.key);
        console.log(parsed.slug);
        break;
      }
      default:
        throw new Error(`unknown --action "${args.action}" — expected path, find, or parse`);
    }
  } catch (err) {
    console.error(`board-path: ${(err as Error).message}`);
    process.exitCode = 1;
  }
}

if (import.meta.filename === process.argv[1]) {
  main();
}
