import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  DEFAULT_PREFERENCES_PATH,
  readPreferences,
  getPreference,
  setPreference,
  clearPreference,
  main,
} from "./preferences.ts";

describe("readPreferences / getPreference", () => {
  let tmpDir: string;
  let prefsPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-prefs-test-"));
    prefsPath = path.join(tmpDir, "preferences.yml");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns an empty map for a missing file", () => {
    expect(readPreferences(prefsPath)).toEqual(new Map());
    expect(getPreference("finish_option", prefsPath)).toBeUndefined();
  });

  it("reads a flat key/value pair, ignoring the header comment", () => {
    fs.writeFileSync(
      prefsPath,
      "# DigiSmith-managed. Settings decided through live interaction, not hand-authored.\nfinish_option: merge_locally\n",
    );
    expect(getPreference("finish_option", prefsPath)).toBe("merge_locally");
  });

  it("strips an inline comment", () => {
    fs.writeFileSync(prefsPath, "finish_option: merge_locally   # set via first-run prompt\n");
    expect(getPreference("finish_option", prefsPath)).toBe("merge_locally");
  });

  it("unwraps a quoted value", () => {
    fs.writeFileSync(prefsPath, 'finish_option: "merge_locally"\n');
    expect(getPreference("finish_option", prefsPath)).toBe("merge_locally");
  });

  it("returns unset for a key that was never set", () => {
    fs.writeFileSync(prefsPath, "finish_option: merge_locally\n");
    expect(getPreference("some_other_key", prefsPath)).toBeUndefined();
  });

  it("treats a non-UTF-8 file as unset rather than throwing", () => {
    fs.writeFileSync(prefsPath, Buffer.from([0x66, 0x3a, 0xff, 0xfe]));
    expect(() => getPreference("finish_option", prefsPath)).not.toThrow();
    expect(getPreference("finish_option", prefsPath)).toBeUndefined();
  });

  it("skips a line with no colon", () => {
    fs.writeFileSync(prefsPath, "not a valid line\nfinish_option: merge_locally\n");
    expect(getPreference("finish_option", prefsPath)).toBe("merge_locally");
  });
});

describe("setPreference", () => {
  let tmpDir: string;
  let prefsPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-prefs-test-"));
    prefsPath = path.join(tmpDir, "nested", "preferences.yml");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates the file (and parent directory) with the header comment when none existed", () => {
    setPreference("finish_option", "merge_locally", prefsPath);
    const content = fs.readFileSync(prefsPath, "utf8");
    expect(content).toBe(
      "# DigiSmith-managed. Settings decided through live interaction, not hand-authored.\nfinish_option: merge_locally\n",
    );
  });

  it("updates an existing key in place, preserving other keys", () => {
    setPreference("finish_option", "merge_locally", prefsPath);
    setPreference("some_other_key", "abc", prefsPath);
    setPreference("finish_option", "pr", prefsPath);

    expect(getPreference("finish_option", prefsPath)).toBe("pr");
    expect(getPreference("some_other_key", prefsPath)).toBe("abc");
  });
});

describe("clearPreference", () => {
  let tmpDir: string;
  let prefsPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-prefs-test-"));
    prefsPath = path.join(tmpDir, "preferences.yml");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("removes a set key", () => {
    setPreference("finish_option", "merge_locally", prefsPath);
    clearPreference("finish_option", prefsPath);
    expect(getPreference("finish_option", prefsPath)).toBeUndefined();
  });

  it("leaves other keys untouched", () => {
    setPreference("finish_option", "merge_locally", prefsPath);
    setPreference("some_other_key", "abc", prefsPath);
    clearPreference("finish_option", prefsPath);
    expect(getPreference("some_other_key", prefsPath)).toBe("abc");
  });

  it("is a no-op when the key was never set", () => {
    setPreference("some_other_key", "abc", prefsPath);
    clearPreference("finish_option", prefsPath);
    expect(getPreference("some_other_key", prefsPath)).toBe("abc");
  });

  it("is a no-op when the file doesn't exist", () => {
    expect(() => clearPreference("finish_option", prefsPath)).not.toThrow();
    expect(fs.existsSync(prefsPath)).toBe(false);
  });
});

describe("main (CLI)", () => {
  let tmpDir: string;
  let prefsPath: string;
  let originalArgv: string[];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-prefs-test-"));
    prefsPath = path.join(tmpDir, "preferences.yml");
    originalArgv = process.argv;
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.exitCode = 0;
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('prints "unset" for a get on a key that was never set', () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    process.argv = ["node", "preferences.ts", "--key", "finish_option", "--action", "get", "--path", prefsPath];

    main();

    expect(logSpy).toHaveBeenCalledWith("unset");
  });

  it("writes the value and prints a confirmation for set", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    process.argv = [
      "node",
      "preferences.ts",
      "--key",
      "finish_option",
      "--action",
      "set",
      "--value",
      "merge_locally",
      "--path",
      prefsPath,
    ];

    main();

    expect(logSpy).toHaveBeenCalledWith("preferences: set finish_option=merge_locally");
    expect(getPreference("finish_option", prefsPath)).toBe("merge_locally");
  });

  it("prints the set value back on a subsequent get", () => {
    setPreference("finish_option", "pr", prefsPath);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    process.argv = ["node", "preferences.ts", "--key", "finish_option", "--action", "get", "--path", prefsPath];

    main();

    expect(logSpy).toHaveBeenCalledWith("pr");
  });

  it("clears a key and prints a confirmation", () => {
    setPreference("finish_option", "pr", prefsPath);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    process.argv = ["node", "preferences.ts", "--key", "finish_option", "--action", "clear", "--path", prefsPath];

    main();

    expect(logSpy).toHaveBeenCalledWith("preferences: cleared finish_option");
    expect(getPreference("finish_option", prefsPath)).toBeUndefined();
  });

  it("fails clearly when --value is missing for a set action", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.argv = ["node", "preferences.ts", "--key", "finish_option", "--action", "set", "--path", prefsPath];

    main();

    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith("preferences: failed (missing required flag: --value)");
  });

  it("fails clearly when a required flag is missing", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.argv = ["node", "preferences.ts", "--action", "get", "--path", prefsPath];

    main();

    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith("preferences: failed (missing required flag: --key)");
  });

  it("fails clearly on an unknown action", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.argv = ["node", "preferences.ts", "--key", "finish_option", "--action", "list", "--path", prefsPath];

    main();

    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith("preferences: failed (unknown action: list)");
  });
});
