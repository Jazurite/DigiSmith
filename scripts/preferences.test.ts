import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { HEADER } from "./config-write.ts";
import { DEFAULT_DIR, clearPreference, getPreference, main, setPreference } from "./preferences.ts";

let tmpDir: string;
let dir: string;
let configPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-prefs-test-"));
  dir = path.join(tmpDir, ".digismith");
  configPath = path.join(dir, "config.yml");
  process.env.GIT_CEILING_DIRECTORIES = fs.realpathSync.native(path.dirname(tmpDir));
});

afterEach(() => {
  delete process.env.GIT_CEILING_DIRECTORIES;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function write(name: string, content: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), content);
}

describe("DEFAULT_DIR", () => {
  it("locks the documented default folder", () => {
    expect(DEFAULT_DIR).toBe(".digismith");
  });
});

describe("getPreference", () => {
  it("returns undefined when nothing is set", () => {
    expect(getPreference("finish_option", dir)).toBeUndefined();
  });

  it("reads preferences.<key> from config.yml", () => {
    write("config.yml", "preferences:\n  finish_option: merge_locally\n");
    expect(getPreference("finish_option", dir)).toBe("merge_locally");
  });

  it("falls back to the flat key in the old preferences.yml", () => {
    write("preferences.yml", "finish_option: pr\n");
    expect(getPreference("finish_option", dir)).toBe("pr");
  });

  it("ignores a top-level key of the same name in config.yml", () => {
    write("config.yml", "finish_option: pr\n");
    expect(getPreference("finish_option", dir)).toBeUndefined();
  });
});

describe("setPreference / clearPreference", () => {
  it("writes the key under the preferences heading", () => {
    setPreference("finish_option", "merge_locally", dir);
    expect(fs.readFileSync(configPath, "utf8")).toBe(`${HEADER}\n\npreferences:\n  finish_option: merge_locally\n`);
  });

  it("updates in place and keeps other keys", () => {
    setPreference("finish_option", "merge_locally", dir);
    setPreference("ssh_key", "/k", dir);
    setPreference("finish_option", "pr", dir);
    expect(getPreference("finish_option", dir)).toBe("pr");
    expect(getPreference("ssh_key", dir)).toBe("/k");
  });

  it("clears a key and leaves the others", () => {
    setPreference("finish_option", "pr", dir);
    setPreference("ssh_key", "/k", dir);
    clearPreference("finish_option", dir);
    expect(getPreference("finish_option", dir)).toBeUndefined();
    expect(getPreference("ssh_key", dir)).toBe("/k");
  });

  it("clear is a no-op when no file exists", () => {
    clearPreference("finish_option", dir);
    expect(fs.existsSync(configPath)).toBe(false);
  });

  it("migrates an untracked old preferences.yml before it writes", () => {
    write("preferences.yml", "ssh_key: /k\n");
    const result = setPreference("finish_option", "pr", dir);
    expect(result.migration?.moved).toEqual(["preferences.yml"]);
    expect(getPreference("ssh_key", dir)).toBe("/k");
    expect(fs.existsSync(path.join(dir, "preferences.yml.migrated"))).toBe(true);
  });
});

describe("main (CLI)", () => {
  let originalArgv: string[];

  beforeEach(() => {
    originalArgv = process.argv;
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  function run(...args: string[]): void {
    process.argv = ["node", "preferences.ts", ...args, "--dir", dir];
    main();
  }

  it('prints "unset" for a get on a key that was never set', () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    run("--key", "finish_option", "--action", "get");
    expect(logSpy).toHaveBeenCalledWith("unset");
  });

  it("writes the value and prints a confirmation for set", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    run("--key", "finish_option", "--action", "set", "--value", "merge_locally");
    expect(logSpy).toHaveBeenCalledWith("preferences: set finish_option=merge_locally");
    expect(getPreference("finish_option", dir)).toBe("merge_locally");
  });

  it("prints the set value back on a subsequent get", () => {
    setPreference("finish_option", "pr", dir);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    run("--key", "finish_option", "--action", "get");
    expect(logSpy).toHaveBeenCalledWith("pr");
  });

  it("clears a key and prints a confirmation", () => {
    setPreference("finish_option", "pr", dir);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    run("--key", "finish_option", "--action", "clear");
    expect(logSpy).toHaveBeenCalledWith("preferences: cleared finish_option");
    expect(getPreference("finish_option", dir)).toBeUndefined();
  });

  it("runs migrate without --key", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    run("--action", "migrate");
    expect(logSpy).toHaveBeenCalledWith("config: nothing to migrate");
  });

  it("fails clearly when --value is missing for a set action", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    run("--key", "finish_option", "--action", "set");
    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith("preferences: failed (missing required flag: --value)");
  });

  it("fails clearly when a required flag is missing", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    run("--action", "get");
    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith("preferences: failed (missing required flag: --key)");
  });

  it("fails clearly on an unknown action", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    run("--key", "finish_option", "--action", "list");
    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith("preferences: failed (unknown action: list)");
  });

  it("fails clearly on a config.yml parse error", () => {
    write("config.yml", "oops\n");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    run("--key", "finish_option", "--action", "get");
    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(`preferences: failed (${configPath} line 1: expected 'key: value')`);
  });
});
