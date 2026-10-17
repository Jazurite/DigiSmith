import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { readStewardProfile } from "./profile.ts";

let root: string;
const put = (rel: string, text: string) => {
  const f = path.join(root, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
};
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "stprofile-")); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });
const env = () => ({ DIGISMITH_PROFILES_DIR: path.join(root, "profiles") });

describe("readStewardProfile", () => {
  it("reads tracker and release_stage from the profile the config names", () => {
    put("cwd/.digismith/config.yml", "profile: digismith\n");
    put("profiles/digismith.yml", "name: digismith\ntracker: clickup\nrelease_stage: true\n");
    expect(readStewardProfile(path.join(root, "cwd"), env())).toEqual({ tracker: "clickup", releaseStage: true });
  });
  it("defaults to none and false when the profile has neither field", () => {
    put("cwd/.digismith/config.yml", "profile: emma\n");
    put("profiles/emma.yml", "name: emma\n");
    expect(readStewardProfile(path.join(root, "cwd"), env())).toEqual({ tracker: "none", releaseStage: false });
  });
  it("defaults to none when there is no config, no profile file, or an unknown tracker", () => {
    expect(readStewardProfile(path.join(root, "nothing"), env())).toEqual({ tracker: "none", releaseStage: false });
    put("cwd/.digismith/config.yml", "profile: x\n");
    expect(readStewardProfile(path.join(root, "cwd"), env()).tracker).toBe("none");
    put("profiles/x.yml", "tracker: trello\n");
    expect(readStewardProfile(path.join(root, "cwd"), env()).tracker).toBe("none");
  });
  it("prefers the profiles folder inside the working directory", () => {
    put("cwd/.digismith/config.yml", "profile: digismith\n");
    put("cwd/profiles/digismith.yml", "tracker: clickup\n");
    expect(readStewardProfile(path.join(root, "cwd"), { DIGISMITH_PROFILES_DIR: path.join(root, "none") }).tracker).toBe("clickup");
  });
});
