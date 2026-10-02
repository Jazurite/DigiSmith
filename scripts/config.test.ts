import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ConfigError } from "./config-parse.ts";
import {
  DEFAULT_DIR,
  MIGRATE_COMMIT_MESSAGE,
  readConfig,
  readLegacyPreferences,
  readLegacyProfile,
  resolve,
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
