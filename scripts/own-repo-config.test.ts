import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { HEADER } from "./config-write.ts";
import { CONFIG_FILE, MIGRATED_SUFFIX, migrate, readConfig, resolve } from "./config.ts";

// DGS-142: DigiSmith's own repo moved from .digismith/profile and .digismith/preferences.yml to
// .digismith/config.yml. The ticket that drops the A.4 fallback also deletes this file and the
// *.migrated copies it reads.
const REPO_DIR = fileURLToPath(new URL("../.digismith", import.meta.url));
const OLD_FILES = ["profile", "preferences.yml"];
const KEYS = ["profile", "preferences.finish_option", "preferences.clear_context", "preferences.ssh_key"];

let tmpDir: string;
let scratch: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-own-repo-config-test-"));
  scratch = path.join(tmpDir, ".digismith");
  fs.mkdirSync(scratch);
  process.env.GIT_CEILING_DIRECTORIES = fs.realpathSync.native(path.dirname(tmpDir));
});

afterEach(() => {
  delete process.env.GIT_CEILING_DIRECTORIES;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function migrateFrozenCopies(): void {
  for (const file of OLD_FILES) {
    fs.copyFileSync(path.join(REPO_DIR, file + MIGRATED_SUFFIX), path.join(scratch, file));
  }
  migrate(scratch);
}

describe("DigiSmith's own repo config (DGS-142)", () => {
  it("keeps the old files only as .migrated copies", () => {
    for (const file of OLD_FILES) {
      expect(fs.existsSync(path.join(REPO_DIR, file)), `${file} is still in place`).toBe(false);
      expect(fs.existsSync(path.join(REPO_DIR, file + MIGRATED_SUFFIX)), `${file}${MIGRATED_SUFFIX} is missing`).toBe(true);
    }
  });

  it("migrate turns the .migrated copies into the expected config.yml", () => {
    migrateFrozenCopies();
    expect(fs.readFileSync(path.join(scratch, CONFIG_FILE), "utf8")).toBe(
      `${HEADER}\nprofile: digismith\n\npreferences:\n  finish_option: merge_locally\n  clear_context: no\n  ssh_key: /root/.ssh/jazurite_github\n`,
    );
  });

  // Values are not compared: digismith:preferences may change them later with a legitimate set.
  it("config.yml still carries every key the migration produced", () => {
    migrateFrozenCopies();
    const live = readConfig(REPO_DIR);
    for (const key of readConfig(scratch).keys()) {
      expect(live.has(key), `${key} is missing from .digismith/config.yml`).toBe(true);
    }
  });

  it("resolves the profile and the preferences from config.yml, not the fallback", () => {
    for (const key of KEYS) {
      expect(resolve(key, REPO_DIR)?.source, key).toBe(path.join(REPO_DIR, CONFIG_FILE));
    }
  });
});
