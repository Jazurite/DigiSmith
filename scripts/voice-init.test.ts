import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { setVoice } from "./voice.ts";
import voiceInit from "./voice-init.ts";

describe("voiceInit", () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-voice-init-test-"));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns both axis names joined when no preferences file exists (both default on)", async () => {
    await expect(voiceInit()).resolves.toBe("technical+conversation");
  });

  it("returns only the on axis when one is turned off", async () => {
    setVoice("technical", "off", ".digismith/preferences.yml");
    await expect(voiceInit()).resolves.toBe("conversation");
  });

  it("returns null when both axes are off", async () => {
    setVoice("technical", "off", ".digismith/preferences.yml");
    setVoice("conversation", "off", ".digismith/preferences.yml");
    await expect(voiceInit()).resolves.toBeNull();
  });
});
