import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { ConfigError } from "./config-parse.ts";
import { HEADER } from "./config-write.ts";
import {
  DEFAULT_DIR,
  MIGRATE_COMMIT_MESSAGE,
  checkWrite,
  clearKey,
  commitCommands,
  formatMigrateReport,
  main,
  migrate,
  migrateCommand,
  readConfig,
  readLegacyPreferences,
  readLegacyProfile,
  resolve,
  setKey,
} from "./config.ts";

let tmpDir: string;
let dir: string;

function write(name: string, content: string | Buffer): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), content);
}

function setUpTmp(): void {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-config-test-"));
  dir = path.join(tmpDir, ".digismith");
  process.env.GIT_CEILING_DIRECTORIES = fs.realpathSync.native(path.dirname(tmpDir));
}

function tearDownTmp(): void {
  delete process.env.GIT_CEILING_DIRECTORIES;
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

describe("constants", () => {
  it("locks the default folder and the migration commit message", () => {
    expect(DEFAULT_DIR).toBe(".digismith");
    expect(MIGRATE_COMMIT_MESSAGE).toBe("chore(config): migrate to .digismith/config.yml");
  });
});

describe("readConfig", () => {
  beforeEach(setUpTmp);
  afterEach(tearDownTmp);

  it("returns an empty map when config.yml is missing", () => {
    expect(readConfig(dir)).toEqual(new Map());
  });

  it("parses config.yml", () => {
    write("config.yml", "profile: emma\npreferences:\n  ssh_key: /k\n");
    expect(readConfig(dir)).toEqual(
      new Map([
        ["profile", "emma"],
        ["preferences.ssh_key", "/k"],
      ]),
    );
  });

  it("labels a parse error with the file path", () => {
    write("config.yml", "oops\n");
    expect(() => readConfig(dir)).toThrow(`${path.join(dir, "config.yml")} line 1: expected 'key: value'`);
  });

  it("reports invalid UTF-8 as a ConfigError", () => {
    write("config.yml", Buffer.from([0x61, 0x3a, 0x20, 0xff]));
    expect(() => readConfig(dir)).toThrow(ConfigError);
    expect(() => readConfig(dir)).toThrow(`${path.join(dir, "config.yml")}: not valid UTF-8`);
  });
});

describe("readLegacyProfile", () => {
  beforeEach(setUpTmp);
  afterEach(tearDownTmp);

  it("returns undefined for a missing file", () => {
    expect(readLegacyProfile(dir)).toBeUndefined();
  });

  it("returns the trimmed content", () => {
    write("profile", "emma\n");
    expect(readLegacyProfile(dir)).toBe("emma");
  });

  it("treats a whitespace-only file as unset", () => {
    write("profile", "   \n");
    expect(readLegacyProfile(dir)).toBeUndefined();
  });

  it("reports invalid UTF-8 as a ConfigError", () => {
    write("profile", Buffer.from([0xff, 0xfe]));
    expect(() => readLegacyProfile(dir)).toThrow(`${path.join(dir, "profile")}: not valid UTF-8`);
  });
});

describe("readLegacyPreferences", () => {
  beforeEach(setUpTmp);
  afterEach(tearDownTmp);

  it("maps each flat key to preferences.<key>", () => {
    write("preferences.yml", "# old header\nfinish_option: merge_locally\nssh_key: /k\n");
    expect(readLegacyPreferences(dir)).toEqual(
      new Map([
        ["preferences.finish_option", "merge_locally"],
        ["preferences.ssh_key", "/k"],
      ]),
    );
  });

  it("rejects a heading in the old file", () => {
    write("preferences.yml", "s:\n  a: 1\n");
    expect(() => readLegacyPreferences(dir)).toThrow("expected flat 'key: value' lines only");
  });
});

describe("resolve", () => {
  beforeEach(setUpTmp);
  afterEach(tearDownTmp);

  it("returns undefined when no layer has the key", () => {
    expect(resolve("profile", dir)).toBeUndefined();
  });

  it("prefers config.yml over the old files and names the source", () => {
    write("config.yml", "profile: emma\n");
    write("profile", "digismith\n");
    expect(resolve("profile", dir)).toEqual({ value: "emma", source: path.join(dir, "config.yml") });
  });

  it("falls back to .digismith/profile for profile", () => {
    write("profile", "digismith\n");
    expect(resolve("profile", dir)).toEqual({ value: "digismith", source: path.join(dir, "profile") });
  });

  it("falls back per key: profile from config.yml, a preference from preferences.yml", () => {
    write("config.yml", "profile: emma\n");
    write("preferences.yml", "finish_option: pr\n");
    expect(resolve("preferences.finish_option", dir)).toEqual({
      value: "pr",
      source: path.join(dir, "preferences.yml"),
    });
  });

  it("does not read an old preference as a top-level key", () => {
    write("preferences.yml", "finish_option: pr\n");
    expect(resolve("finish_option", dir)).toBeUndefined();
  });

  it("has no old source for role", () => {
    write("profile", "digismith\n");
    expect(resolve("role", dir)).toBeUndefined();
  });

  it("reads profile without touching a broken preferences.yml", () => {
    write("profile", "digismith\n");
    write("preferences.yml", Buffer.from([0xff]));
    expect(resolve("profile", dir)?.value).toBe("digismith");
  });
});

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout;
}

function initRepo(root: string): void {
  fs.mkdirSync(root, { recursive: true });
  git(root, "init", "-q");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "Test");
  fs.writeFileSync(path.join(root, "README.md"), "base\n");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "base");
}

const OLD_PREFS = "# DigiSmith-managed. Settings decided through live interaction, not hand-authored.\nfinish_option: merge_locally\nclear_context: no\n";

describe("migrate", () => {
  beforeEach(setUpTmp);
  afterEach(tearDownTmp);

  it("reports nothing to migrate when no old file exists", () => {
    const report = migrate(dir);
    expect(report).toEqual({ moved: [], added: [], conflicts: [], commit: null });
    expect(formatMigrateReport(report, dir)).toEqual(["config: nothing to migrate"]);
  });

  it("merges both untracked old files into config.yml and moves them aside", () => {
    write("profile", "digismith\n");
    write("preferences.yml", OLD_PREFS);

    const report = migrate(dir);

    expect(fs.readFileSync(path.join(dir, "config.yml"), "utf8")).toBe(
      `${HEADER}\nprofile: digismith\n\npreferences:\n  finish_option: merge_locally\n  clear_context: no\n`,
    );
    expect(fs.existsSync(path.join(dir, "profile"))).toBe(false);
    expect(fs.readFileSync(path.join(dir, "profile.migrated"), "utf8")).toBe("digismith\n");
    expect(fs.readFileSync(path.join(dir, "preferences.yml.migrated"), "utf8")).toBe(OLD_PREFS);
    expect(report).toEqual({
      moved: ["profile", "preferences.yml"],
      added: ["profile", "preferences.finish_option", "preferences.clear_context"],
      conflicts: [],
      commit: null,
    });
  });

  it("keeps a config.yml value on conflict and reports it", () => {
    write("config.yml", "profile: emma\n");
    write("profile", "digismith\n");

    const report = migrate(dir);

    expect(fs.readFileSync(path.join(dir, "config.yml"), "utf8")).toBe("profile: emma\n");
    expect(report.conflicts).toEqual([{ key: "profile", kept: "emma", old: "digismith", file: "profile" }]);
    expect(fs.existsSync(path.join(dir, "profile.migrated"))).toBe(true);
  });

  it("reports no conflict and writes nothing when the values are equal", () => {
    write("config.yml", "profile: digismith\n");
    write("profile", "digismith\n");

    const report = migrate(dir);

    expect(report.conflicts).toEqual([]);
    expect(report.added).toEqual([]);
    expect(fs.readFileSync(path.join(dir, "config.yml"), "utf8")).toBe("profile: digismith\n");
  });

  it("skips a file that is already moved aside and migrates the other one", () => {
    write("profile.migrated", "digismith\n");
    write("preferences.yml", "finish_option: pr\n");

    const report = migrate(dir);

    expect(report.moved).toEqual(["preferences.yml"]);
    expect(fs.readFileSync(path.join(dir, "config.yml"), "utf8")).toBe(`${HEADER}\n\npreferences:\n  finish_option: pr\n`);
  });

  it("finishes a run that stopped between the two renames", () => {
    write("profile", "digismith\n");
    write("preferences.yml", OLD_PREFS);
    migrate(dir);
    fs.renameSync(path.join(dir, "preferences.yml.migrated"), path.join(dir, "preferences.yml"));

    const report = migrate(dir);

    expect(report.moved).toEqual(["preferences.yml"]);
    expect(report.conflicts).toEqual([]);
    expect(fs.existsSync(path.join(dir, "preferences.yml.migrated"))).toBe(true);
  });

  it("stops and changes nothing when an original and its .migrated copy both exist", () => {
    write("profile", "digismith\n");
    write("profile.migrated", "old\n");

    expect(() => migrate(dir)).toThrow("both exist");
    expect(fs.existsSync(path.join(dir, "config.yml"))).toBe(false);
    expect(fs.readFileSync(path.join(dir, "profile"), "utf8")).toBe("digismith\n");
  });

  it("stops and changes nothing when an old file is not valid UTF-8", () => {
    write("profile", "digismith\n");
    write("preferences.yml", Buffer.from([0xff]));

    expect(() => migrate(dir)).toThrow("not valid UTF-8");
    expect(fs.existsSync(path.join(dir, "config.yml"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "profile"))).toBe(true);
  });

  it("prints commit commands for both moved files when git tracks them", () => {
    const repo = path.join(tmpDir, "repo");
    initRepo(repo);
    dir = path.join(repo, ".digismith");
    write("profile", "digismith\n");
    write("preferences.yml", OLD_PREFS);
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "old files");

    const report = migrate(dir);

    expect(report.commit).toEqual([
      "git add '.digismith/config.yml' '.digismith/profile' '.digismith/profile.migrated' '.digismith/preferences.yml' '.digismith/preferences.yml.migrated'",
      "git commit -m 'chore(config): migrate to .digismith/config.yml'",
    ]);
  });

  it("prints commit commands for only the moved file", () => {
    const repo = path.join(tmpDir, "repo");
    initRepo(repo);
    dir = path.join(repo, ".digismith");
    write("profile", "digismith\n");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "old profile");

    expect(migrate(dir).commit).toEqual([
      "git add '.digismith/config.yml' '.digismith/profile' '.digismith/profile.migrated'",
      "git commit -m 'chore(config): migrate to .digismith/config.yml'",
    ]);
  });

  it("stops in a linked worktree and names the main checkout", () => {
    const repo = path.join(tmpDir, "repo");
    initRepo(repo);
    fs.mkdirSync(path.join(repo, ".digismith"));
    fs.writeFileSync(path.join(repo, ".digismith", "profile"), "digismith\n");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "old profile");
    const wt = path.join(tmpDir, "wt");
    git(repo, "worktree", "add", "-q", "-b", "wt", wt);
    dir = path.join(wt, ".digismith");

    expect(() => migrate(dir)).toThrow(
      `this worktree still has .digismith/profile or preferences.yml. Run migrate in the main checkout ${fs.realpathSync(repo)}, then remove or recreate this worktree`,
    );
    expect(fs.existsSync(path.join(dir, "profile"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "config.yml"))).toBe(false);
  });

  it("formats a full report with a conflict and commit commands", () => {
    const lines = formatMigrateReport(
      {
        moved: ["profile", "preferences.yml"],
        added: ["preferences.finish_option"],
        conflicts: [{ key: "profile", kept: "emma", old: "digismith", file: "profile" }],
        commit: ["git add a", 'git commit -m "m"'],
      },
      ".digismith",
    );
    expect(lines).toEqual([
      "config: migrated .digismith/profile, .digismith/preferences.yml into .digismith/config.yml",
      "config: added preferences.finish_option",
      'config: conflict on profile: kept "emma" from config.yml, the old value "digismith" stays in profile.migrated',
      "config: moved aside profile -> profile.migrated, preferences.yml -> preferences.yml.migrated",
      "config: if a branch from before this migration changes an old file, apply that change again with set",
      "config: commit needed:",
      "  git add a",
      '  git commit -m "m"',
    ]);
  });

  it("creates a header-only config.yml when migrating a whitespace-only profile with no values", () => {
    write("profile", "   \n");
    const report = migrate(dir);
    expect(report.added).toEqual([]);
    expect(fs.readFileSync(path.join(dir, "config.yml"), "utf8")).toBe(`${HEADER}\n`);
  });

  it("creates a header-only config.yml when migrating a comment-only preferences file", () => {
    write("preferences.yml", "# just a comment\n");
    const report = migrate(dir);
    expect(report.added).toEqual([]);
    expect(fs.readFileSync(path.join(dir, "config.yml"), "utf8")).toBe(`${HEADER}\n`);
  });

  it("creates a header-only config.yml for a whitespace-only profile in a tracked checkout, so the printed git add succeeds", () => {
    const repo = path.join(tmpDir, "repo");
    initRepo(repo);
    dir = path.join(repo, ".digismith");
    write("profile", "   \n");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "empty profile");

    const report = migrate(dir);

    expect(fs.existsSync(path.join(dir, "config.yml"))).toBe(true);
    expect(report.commit).not.toBeNull();
  });
});

describe("migrateCommand / commitCommands", () => {
  beforeEach(setUpTmp);
  afterEach(tearDownTmp);

  it("migrateCommand resolves a relative --dir to an absolute, quoted path", () => {
    const originalCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      const command = migrateCommand(".digismith");
      expect(command).toContain(`--dir '${path.join(fs.realpathSync(tmpDir), ".digismith")}'`);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("quotes a directory path that contains a space", () => {
    const spacedDir = path.join(tmpDir, "has space", ".digismith");
    fs.mkdirSync(spacedDir, { recursive: true });
    const command = migrateCommand(spacedDir);
    expect(command).toContain(`--dir '${spacedDir}'`);
  });

  it("shell-quotes every path in commitCommands", () => {
    const repo = path.join(tmpDir, "has space", "repo");
    fs.mkdirSync(path.join(repo, ".digismith"), { recursive: true });
    const commands = commitCommands(path.join(repo, ".digismith"), ["profile"]);
    expect(commands[0]).toBe(
      "git add '.digismith/config.yml' '.digismith/profile' '.digismith/profile.migrated'",
    );
    expect(commands[1]).toBe("git commit -m 'chore(config): migrate to .digismith/config.yml'");
  });
});

describe("setKey / clearKey", () => {
  beforeEach(setUpTmp);
  afterEach(tearDownTmp);

  it("writes config.yml when no old file exists", () => {
    expect(checkWrite(dir)).toEqual({ kind: "write" });
    const result = setKey("profile", "emma", dir);
    expect(result.migration).toBeNull();
    expect(fs.readFileSync(path.join(dir, "config.yml"), "utf8")).toBe(`${HEADER}\nprofile: emma\n`);
  });

  it("leaves no temporary file behind", () => {
    setKey("profile", "emma", dir);
    expect(fs.readdirSync(dir).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("migrates untracked old files first, then writes", () => {
    write("profile", "digismith\n");
    expect(checkWrite(dir)).toEqual({ kind: "migrate" });

    const result = setKey("preferences.finish_option", "pr", dir);

    expect(result.migration?.moved).toEqual(["profile"]);
    expect(fs.readFileSync(path.join(dir, "config.yml"), "utf8")).toBe(
      `${HEADER}\nprofile: digismith\n\npreferences:\n  finish_option: pr\n`,
    );
  });

  it("does not let a cleared key come back through the fallback", () => {
    write("preferences.yml", "finish_option: pr\n");

    clearKey("preferences.finish_option", dir);

    expect(resolve("preferences.finish_option", dir)).toBeUndefined();
    expect(fs.existsSync(path.join(dir, "preferences.yml.migrated"))).toBe(true);
  });

  it("validates the value before it migrates anything", () => {
    write("profile", "digismith\n");
    expect(() => setKey("role", `'a" #`, dir)).toThrow("contains both quote types");
    expect(fs.existsSync(path.join(dir, "profile"))).toBe(true);
  });

  it("stops in a main checkout where git tracks an old file, and changes nothing", () => {
    const repo = path.join(tmpDir, "repo");
    initRepo(repo);
    dir = path.join(repo, ".digismith");
    write("profile", "digismith\n");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "old profile");

    const check = checkWrite(dir);
    expect(check.kind).toBe("stop");
    expect(() => setKey("role", "worker", dir)).toThrow(ConfigError);
    try {
      setKey("role", "worker", dir);
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain(`git tracks ${path.join(dir, "profile")}`);
      expect(message).toContain("--action migrate --dir");
      expect(message).toContain("  git add '.digismith/config.yml' '.digismith/profile' '.digismith/profile.migrated'");
      expect(message).toContain("  git commit -m 'chore(config): migrate to .digismith/config.yml'");
    }
    expect(fs.existsSync(path.join(dir, "config.yml"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "profile"))).toBe(true);
  });

  it("stops in a linked worktree that still has an old file, and changes nothing", () => {
    const repo = path.join(tmpDir, "repo");
    initRepo(repo);
    fs.mkdirSync(path.join(repo, ".digismith"));
    fs.writeFileSync(path.join(repo, ".digismith", "profile"), "digismith\n");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "old profile");
    const wt = path.join(tmpDir, "wt");
    git(repo, "worktree", "add", "-q", "-b", "wt", wt);
    dir = path.join(wt, ".digismith");

    expect(() => clearKey("preferences.finish_option", dir)).toThrow("Run migrate in the main checkout");
    expect(fs.existsSync(path.join(dir, "config.yml"))).toBe(false);
  });

  it("writes in a linked worktree that has no old file", () => {
    const repo = path.join(tmpDir, "repo");
    initRepo(repo);
    const wt = path.join(tmpDir, "wt");
    git(repo, "worktree", "add", "-q", "-b", "wt", wt);
    dir = path.join(wt, ".digismith");

    setKey("preferences.finish_option", "pr", dir);

    expect(resolve("preferences.finish_option", dir)?.value).toBe("pr");
  });

  it("clear is a no-op when config.yml does not exist", () => {
    clearKey("profile", dir);
    expect(fs.existsSync(path.join(dir, "config.yml"))).toBe(false);
  });
});

describe("main (CLI)", () => {
  let originalArgv: string[];
  let logs: string[];
  let errors: string[];

  beforeEach(() => {
    setUpTmp();
    originalArgv = process.argv;
    logs = [];
    errors = [];
    vi.spyOn(console, "log").mockImplementation((msg: string) => void logs.push(msg));
    vi.spyOn(console, "error").mockImplementation((msg: string) => void errors.push(msg));
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.exitCode = 0;
    vi.restoreAllMocks();
    tearDownTmp();
  });

  function run(...args: string[]): void {
    process.argv = ["node", "config.ts", ...args, "--dir", dir];
    main();
  }

  it("prints unset for a missing key", () => {
    run("--action", "get", "--key", "profile");
    expect(logs).toEqual(["unset"]);
  });

  it("sets, gets and clears a key", () => {
    run("--action", "set", "--key", "profile", "--value", "emma");
    run("--action", "get", "--key", "profile");
    run("--action", "clear", "--key", "profile");
    expect(logs).toEqual(["config: set profile=emma", "emma", "config: cleared profile"]);
  });

  it("prints each array item on its own line", () => {
    write("config.yml", "urls:\n  - a\n  - b\n");
    run("--action", "get", "--key", "urls");
    expect(logs).toEqual(["a", "b"]);
  });

  it("prints the migration lines before the set confirmation", () => {
    write("profile", "digismith\n");
    run("--action", "set", "--key", "role", "--value", "worker");
    expect(logs[0]).toBe(`config: migrated ${path.join(dir, "profile")} into ${path.join(dir, "config.yml")}`);
    expect(logs[logs.length - 1]).toBe("config: set role=worker");
  });

  it("runs migrate", () => {
    run("--action", "migrate");
    expect(logs).toEqual(["config: nothing to migrate"]);
  });

  it("fails clearly on a missing action, a missing key, an unknown action and a parse error", () => {
    run();
    run("--action", "get");
    run("--action", "list");
    write("config.yml", "oops\n");
    run("--action", "get", "--key", "profile");
    expect(errors).toEqual([
      "config: failed (missing required flag: --action)",
      "config: failed (missing required flag: --key)",
      "config: failed (unknown action: list)",
      `config: failed (${path.join(dir, "config.yml")} line 1: expected 'key: value')`,
    ]);
    expect(process.exitCode).toBe(1);
  });
});
