import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  DOCS_DIR_PATH,
  NOTE_FILENAME,
  UNLETTERED_KEY,
  EXCLUDE_PATTERN,
  parseLineageKey,
  noteRelPath,
  resolveMainRoot,
  listNotes,
  ensureExcluded,
} from "./lineage-handoff.ts";

const SCRIPT_PATH = fileURLToPath(new URL("./lineage-handoff.ts", import.meta.url));

function real(p: string): string {
  return fs.realpathSync.native(p);
}

function git(cwd: string, ...args: string[]) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

function initRepo(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "Test");
  fs.writeFileSync(path.join(dir, "README.md"), "base\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "base commit");
}

function writeNote(root: string, relPath: string, content = "# Note\n"): void {
  const full = path.join(root, ...relPath.split("/"));
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function runCli(cwd: string, ...args: string[]) {
  return spawnSync("node", ["--experimental-strip-types", SCRIPT_PATH, ...args], { cwd, encoding: "utf8" });
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-lineage-handoff-test-"));
  process.env.GIT_CEILING_DIRECTORIES = real(path.dirname(tmpDir));
});

afterEach(() => {
  delete process.env.GIT_CEILING_DIRECTORIES;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("constants", () => {
  it("locks the documented paths and pattern", () => {
    expect(DOCS_DIR_PATH).toBe(".digismith/docs");
    expect(NOTE_FILENAME).toBe("handoff.md");
    expect(UNLETTERED_KEY).toBe("_unlettered");
    expect(EXCLUDE_PATTERN).toBe(".digismith/docs/**/handoff.md");
  });
});

describe("parseLineageKey", () => {
  it.each([
    ["A.0: Primitives", { clan: "A", lineage: "A.0" }],
    ["A.1: Life  Cycle Hook", { clan: "A", lineage: "A.1" }],
    ["  D.3 : ClickUp Channel", { clan: "D", lineage: "D.3" }],
    ["A.12: Two digits", { clan: "A", lineage: "A.12" }],
    ["K: Maestro", { clan: "K" }],
    ["D", { clan: "D" }],
    ["A.1", { clan: "A", lineage: "A.1" }],
  ])("parses %j", (title, expected) => {
    expect(parseLineageKey(title)).toEqual(expected);
  });

  it.each([
    "General",
    "a.0: lowercase letter",
    "W.4.1: nested number",
    "EMKT-756: consumer ticket",
    "AB: two letters",
    "A.0 no colon",
    "",
  ])("returns null for %j", (title) => {
    expect(parseLineageKey(title)).toBeNull();
  });
});

describe("noteRelPath", () => {
  it("nests a lineage under its clan", () => {
    expect(noteRelPath({ clan: "A", lineage: "A.0" })).toBe(".digismith/docs/A/A.0/handoff.md");
  });

  it("puts a clan-level note directly in the clan folder", () => {
    expect(noteRelPath({ clan: "K" })).toBe(".digismith/docs/K/handoff.md");
  });

  it("uses the unlettered folder for no key", () => {
    expect(noteRelPath(null)).toBe(".digismith/docs/_unlettered/handoff.md");
  });
});

describe("resolveMainRoot", () => {
  it("returns the repo root from the root", () => {
    const main = path.join(tmpDir, "main");
    initRepo(main);
    expect(real(resolveMainRoot(main))).toBe(real(main));
  });

  it("returns the repo root from a subdirectory", () => {
    const main = path.join(tmpDir, "main");
    initRepo(main);
    const sub = path.join(main, "sub");
    fs.mkdirSync(sub);
    expect(real(resolveMainRoot(sub))).toBe(real(main));
  });

  it("returns the main checkout from a linked worktree", () => {
    const main = path.join(tmpDir, "main");
    initRepo(main);
    const wt = path.join(tmpDir, "wt");
    git(main, "worktree", "add", "-q", "-b", "wt", wt);
    expect(real(resolveMainRoot(wt))).toBe(real(main));
  });

  it("returns cwd unchanged outside git", () => {
    const plain = path.join(tmpDir, "plain");
    fs.mkdirSync(plain);
    expect(resolveMainRoot(plain)).toBe(plain);
  });
});

describe("listNotes", () => {
  it("returns an empty array when there is no docs folder", () => {
    const main = path.join(tmpDir, "main");
    initRepo(main);
    expect(listNotes(main)).toEqual([]);
  });

  it("lists clan-level, lineage-level, and unlettered notes, sorted", () => {
    const main = path.join(tmpDir, "main");
    initRepo(main);
    writeNote(main, ".digismith/docs/K/handoff.md");
    writeNote(main, ".digismith/docs/A/A.0/handoff.md");
    writeNote(main, ".digismith/docs/_unlettered/handoff.md");
    expect(listNotes(main)).toEqual(["A/A.0", "K", "_unlettered"]);
  });

  it("ignores handoff.md deeper than the lineage level and other files", () => {
    const main = path.join(tmpDir, "main");
    initRepo(main);
    writeNote(main, ".digismith/docs/A/A.0/lineage-handoff/handoff.md");
    writeNote(main, ".digismith/docs/A/A.0/design.html", "<html></html>");
    expect(listNotes(main)).toEqual([]);
  });

  it("skips a note that git tracks", () => {
    const main = path.join(tmpDir, "main");
    initRepo(main);
    writeNote(main, ".digismith/docs/K/handoff.md");
    git(main, "add", "-A");
    git(main, "commit", "-q", "-m", "commit a note");
    writeNote(main, ".digismith/docs/A/A.0/handoff.md");
    expect(listNotes(main)).toEqual(["A/A.0"]);
  });

  it("lists notes outside git without filtering", () => {
    const plain = path.join(tmpDir, "plain");
    writeNote(plain, ".digismith/docs/K/handoff.md");
    expect(listNotes(plain)).toEqual(["K"]);
  });

  it("does not treat an upper-case HANDOFF.md as a note", () => {
    const main = path.join(tmpDir, "main");
    initRepo(main);
    writeNote(main, ".digismith/docs/call-site-cutover/HANDOFF.md");
    expect(listNotes(main)).toEqual([]);
  });

  it("skips a tracked upper-case HANDOFF.md", () => {
    const main = path.join(tmpDir, "main");
    initRepo(main);
    writeNote(main, ".digismith/docs/call-site-cutover/HANDOFF.md");
    git(main, "add", "-A");
    git(main, "commit", "-q", "-m", "commit legacy note");
    expect(listNotes(main)).toEqual([]);
  });

  it("skips tracked notes in folders with a non-ASCII or glob-special name", () => {
    const main = path.join(tmpDir, "main");
    initRepo(main);
    writeNote(main, ".digismith/docs/café/handoff.md");
    writeNote(main, ".digismith/docs/a[b]/handoff.md");
    git(main, "add", "-A");
    git(main, "commit", "-q", "-m", "commit odd-named notes");
    expect(listNotes(main)).toEqual([]);
  });
});

describe("ensureExcluded", () => {
  it("adds the pattern once, then reports it as already ignored", () => {
    const main = path.join(tmpDir, "main");
    initRepo(main);
    const excludePath = path.join(main, ".git", "info", "exclude");

    expect(ensureExcluded(main, ".digismith/docs/A/A.0/handoff.md")).toBe("added");
    expect(ensureExcluded(main, ".digismith/docs/A/A.0/handoff.md")).toBe("already-ignored");

    const lines = fs.readFileSync(excludePath, "utf8").split("\n");
    expect(lines.filter((line) => line === EXCLUDE_PATTERN)).toHaveLength(1);
    expect(git(main, "check-ignore", "-q", ".digismith/docs/K/handoff.md").status).toBe(0);
  });

  it("starts the pattern on a new line when the exclude file has no trailing newline", () => {
    const main = path.join(tmpDir, "main");
    initRepo(main);
    const excludePath = path.join(main, ".git", "info", "exclude");
    fs.mkdirSync(path.dirname(excludePath), { recursive: true });
    fs.writeFileSync(excludePath, "foo");

    ensureExcluded(main, ".digismith/docs/K/handoff.md");

    expect(fs.readFileSync(excludePath, "utf8")).toBe(`foo\n${EXCLUDE_PATTERN}\n`);
  });

  it("reports not-a-repo outside git", () => {
    const plain = path.join(tmpDir, "plain");
    fs.mkdirSync(plain);
    expect(ensureExcluded(plain, ".digismith/docs/K/handoff.md")).toBe("not-a-repo");
  });

  it("is idempotent when the note is tracked by git", () => {
    const main = path.join(tmpDir, "main");
    initRepo(main);
    const relPath = ".digismith/docs/A/A.0/handoff.md";
    writeNote(main, relPath);
    git(main, "add", "-A");
    git(main, "commit", "-q", "-m", "commit note");
    const excludePath = path.join(main, ".git", "info", "exclude");

    expect(ensureExcluded(main, relPath)).toBe("added");
    expect(ensureExcluded(main, relPath)).toBe("already-ignored");

    const lines = fs.readFileSync(excludePath, "utf8").split("\n");
    expect(lines.filter((line) => line === EXCLUDE_PATTERN)).toHaveLength(1);
  });
});

describe("CLI", () => {
  it("--action path prints the main checkout's note path from a worktree", () => {
    const main = path.join(tmpDir, "main");
    initRepo(main);
    const wt = path.join(tmpDir, "wt");
    git(main, "worktree", "add", "-q", "-b", "wt", wt);
    const suffix = path.join(".digismith", "docs", "A", "A.0", "handoff.md");

    const result = runCli(wt, "--action", "path", "--title", "A.0: Primitives");

    expect(result.status).toBe(0);
    const printed = result.stdout.trim();
    expect(printed.endsWith(suffix)).toBe(true);
    expect(real(printed.slice(0, -suffix.length))).toBe(real(main));
  });

  it("--action list prints one key per line", () => {
    const main = path.join(tmpDir, "main");
    initRepo(main);
    writeNote(main, ".digismith/docs/A/A.0/handoff.md");
    writeNote(main, ".digismith/docs/K/handoff.md");

    const result = runCli(main, "--action", "list");

    expect(result.status).toBe(0);
    expect(result.stdout.trim().split(/\r?\n/)).toEqual(["A/A.0", "K"]);
  });

  it("--action ensure-excluded prints the result", () => {
    const main = path.join(tmpDir, "main");
    initRepo(main);

    const result = runCli(main, "--action", "ensure-excluded", "--title", "K: Maestro");

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("lineage-handoff: added");
  });

  it("fails when --title is missing for --action path", () => {
    const result = runCli(tmpDir, "--action", "path");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing required flag: --title");
  });

  it("fails on an unknown action", () => {
    const result = runCli(tmpDir, "--action", "bogus");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('unknown --action "bogus"');
  });
});
