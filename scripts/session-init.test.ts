import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  DEFAULT_PROFILE_PATH,
  VOICE_INIT_FILENAME,
  SESSIONS_DIR_PATH,
  readProfile,
  loadVoiceSummary,
  listHandoffFiles,
  findNewestHandoff,
  readHandoffTitle,
  buildHandoffPointer,
  formatBanner,
  buildBanner,
  main,
  isDigismithRepoRoot,
} from "./session-init.ts";

describe("constants", () => {
  it("locks the documented default profile path", () => {
    expect(DEFAULT_PROFILE_PATH).toBe(".digismith/profile");
  });

  it("locks the documented voice-init filename", () => {
    expect(VOICE_INIT_FILENAME).toBe("voice-init.ts");
  });

  it("locks the documented sessions directory path", () => {
    expect(SESSIONS_DIR_PATH).toBe(".digismith/sessions");
  });
});

describe("readProfile", () => {
  let tmpDir: string;
  let profilePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-session-init-test-"));
    profilePath = path.join(tmpDir, "profile");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns undefined for a missing file", () => {
    expect(readProfile(profilePath)).toBeUndefined();
  });

  it("returns the trimmed content of an existing file", () => {
    fs.writeFileSync(profilePath, "emma\n");
    expect(readProfile(profilePath)).toBe("emma");
  });

  it("returns undefined for a whitespace-only file", () => {
    fs.writeFileSync(profilePath, "   \n");
    expect(readProfile(profilePath)).toBeUndefined();
  });

  it("throws on a genuine read error other than a missing file", () => {
    fs.writeFileSync(profilePath, Buffer.from([0xff, 0xfe]));
    expect(() => readProfile(profilePath)).toThrow();
  });
});

describe("loadVoiceSummary", () => {
  let tmpDir: string;
  let voiceInitPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-session-init-test-"));
    voiceInitPath = path.join(tmpDir, "voice-init.ts");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns null when voice-init.ts doesn't exist", async () => {
    expect(await loadVoiceSummary(voiceInitPath)).toBeNull();
  });

  it("returns the resolved string from a real voice-init.ts default export", async () => {
    fs.writeFileSync(
      voiceInitPath,
      "export default async function (): Promise<string | null> { return 'conversational'; }\n",
    );
    expect(await loadVoiceSummary(voiceInitPath)).toBe("conversational");
  });

  it("returns null when the default export itself resolves null", async () => {
    fs.writeFileSync(voiceInitPath, "export default async function (): Promise<string | null> { return null; }\n");
    expect(await loadVoiceSummary(voiceInitPath)).toBeNull();
  });

  it("propagates an error when the default export throws", async () => {
    fs.writeFileSync(
      voiceInitPath,
      "export default async function (): Promise<string | null> { throw new Error('boom'); }\n",
    );
    await expect(loadVoiceSummary(voiceInitPath)).rejects.toThrow("boom");
  });
});

describe("formatBanner", () => {
  it("formats profile only when there's no voice summary", () => {
    expect(formatBanner("emma", null)).toBe("DigiSmith: profile=emma");
  });

  it("appends the voice summary when present", () => {
    expect(formatBanner("emma", "conversational")).toBe("DigiSmith: profile=emma, voices=conversational");
  });
});

describe("isDigismithRepoRoot", () => {
  let tmpDir: string;
  let pluginJsonPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-session-init-test-"));
    pluginJsonPath = path.join(tmpDir, "plugin.json");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns false when the file doesn't exist", () => {
    expect(isDigismithRepoRoot(pluginJsonPath)).toBe(false);
  });

  it("returns true when the file names the digismith plugin", () => {
    fs.writeFileSync(pluginJsonPath, JSON.stringify({ name: "digismith", version: "1.0.0" }));
    expect(isDigismithRepoRoot(pluginJsonPath)).toBe(true);
  });

  it("returns false when the file names a different plugin", () => {
    fs.writeFileSync(pluginJsonPath, JSON.stringify({ name: "some-other-plugin" }));
    expect(isDigismithRepoRoot(pluginJsonPath)).toBe(false);
  });

  it("returns false for malformed JSON rather than throwing", () => {
    fs.writeFileSync(pluginJsonPath, "{not valid json");
    expect(isDigismithRepoRoot(pluginJsonPath)).toBe(false);
  });
});

describe("listHandoffFiles", () => {
  let tmpDir: string;
  let sessionsDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-session-init-test-"));
    sessionsDir = path.join(tmpDir, "sessions");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns an empty array when the directory doesn't exist", () => {
    expect(listHandoffFiles(sessionsDir)).toEqual([]);
  });

  it("returns an empty array for an existing, empty directory", () => {
    fs.mkdirSync(sessionsDir);
    expect(listHandoffFiles(sessionsDir)).toEqual([]);
  });

  it("returns full paths of every file in the directory", () => {
    fs.mkdirSync(sessionsDir);
    fs.writeFileSync(path.join(sessionsDir, "abc.md"), "# Title\n");
    expect(listHandoffFiles(sessionsDir)).toEqual([path.join(sessionsDir, "abc.md")]);
  });

  it("ignores files that don't end in .md", () => {
    fs.mkdirSync(sessionsDir);
    fs.writeFileSync(path.join(sessionsDir, "abc.md"), "# Title\n");
    fs.writeFileSync(path.join(sessionsDir, "desktop.ini"), "junk");
    expect(listHandoffFiles(sessionsDir)).toEqual([path.join(sessionsDir, "abc.md")]);
  });

  it("throws on a genuine read error other than a missing directory", () => {
    fs.writeFileSync(sessionsDir, "not a directory");
    expect(() => listHandoffFiles(sessionsDir)).toThrow();
  });
});

describe("findNewestHandoff", () => {
  let tmpDir: string;
  let sessionsDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-session-init-test-"));
    sessionsDir = path.join(tmpDir, "sessions");
    fs.mkdirSync(sessionsDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns undefined when there are no files", () => {
    expect(findNewestHandoff(sessionsDir)).toBeUndefined();
  });

  it("returns the only file when there's exactly one", () => {
    const filePath = path.join(sessionsDir, "abc.md");
    fs.writeFileSync(filePath, "# Title\n");
    expect(findNewestHandoff(sessionsDir)).toBe(filePath);
  });

  it("returns the most recently modified file when there are several", () => {
    const oldPath = path.join(sessionsDir, "old.md");
    const newPath = path.join(sessionsDir, "new.md");
    fs.writeFileSync(oldPath, "# Old\n");
    const oldTime = new Date(Date.now() - 60_000);
    fs.utimesSync(oldPath, oldTime, oldTime);
    fs.writeFileSync(newPath, "# New\n");

    expect(findNewestHandoff(sessionsDir)).toBe(newPath);
  });
});

describe("readHandoffTitle", () => {
  let tmpDir: string;
  let filePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-session-init-test-"));
    filePath = path.join(tmpDir, "handoff.md");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns undefined for a missing file", () => {
    expect(readHandoffTitle(filePath)).toBeUndefined();
  });

  it("strips a leading '# ' and trims the first line", () => {
    fs.writeFileSync(filePath, "# Handoff: Foo  \nBody text...\n");
    expect(readHandoffTitle(filePath)).toBe("Handoff: Foo");
  });

  it("returns the first line as-is when there's no '#' prefix", () => {
    fs.writeFileSync(filePath, "Foo\nBar\n");
    expect(readHandoffTitle(filePath)).toBe("Foo");
  });

  it("returns undefined for an empty file", () => {
    fs.writeFileSync(filePath, "");
    expect(readHandoffTitle(filePath)).toBeUndefined();
  });
});

describe("buildHandoffPointer", () => {
  let tmpDir: string;
  let sessionsDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-session-init-test-"));
    sessionsDir = path.join(tmpDir, "sessions");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns undefined when the sessions directory is missing", () => {
    expect(buildHandoffPointer(sessionsDir)).toBeUndefined();
  });

  it("returns undefined when the sessions directory is empty", () => {
    fs.mkdirSync(sessionsDir);
    expect(buildHandoffPointer(sessionsDir)).toBeUndefined();
  });

  it("points to the single file's title when there's exactly one", () => {
    fs.mkdirSync(sessionsDir);
    fs.writeFileSync(path.join(sessionsDir, "abc.md"), "# Handoff: Foo\n");
    expect(buildHandoffPointer(sessionsDir)).toBe(
      'DigiSmith: handoff from prior session — "Handoff: Foo" — read .digismith/sessions/abc.md, then delete it once used',
    );
  });

  it("includes a pending count and the newest title when there's more than one", () => {
    fs.mkdirSync(sessionsDir);
    const oldPath = path.join(sessionsDir, "old.md");
    fs.writeFileSync(oldPath, "# Old One\n");
    const oldTime = new Date(Date.now() - 60_000);
    fs.utimesSync(oldPath, oldTime, oldTime);
    fs.writeFileSync(path.join(sessionsDir, "new.md"), "# New One\n");

    expect(buildHandoffPointer(sessionsDir)).toBe(
      'DigiSmith: handoff from prior session — "New One" — read .digismith/sessions/new.md, then delete it once used (2 pending)',
    );
  });

  it("falls back to (untitled) when the newest file has no readable title", () => {
    fs.mkdirSync(sessionsDir);
    fs.writeFileSync(path.join(sessionsDir, "empty.md"), "");
    expect(buildHandoffPointer(sessionsDir)).toBe(
      'DigiSmith: handoff from prior session — "(untitled)" — read .digismith/sessions/empty.md, then delete it once used',
    );
  });
});

describe("buildBanner", () => {
  let tmpDir: string;
  let profilePath: string;
  let voiceInitPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-session-init-test-"));
    profilePath = path.join(tmpDir, "profile");
    voiceInitPath = path.join(tmpDir, "voice-init.ts");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns null when there's no profile", async () => {
    expect(await buildBanner(profilePath, voiceInitPath)).toBeNull();
  });

  it("returns the profile-only banner when voice-init.ts doesn't exist", async () => {
    fs.writeFileSync(profilePath, "emma\n");
    expect(await buildBanner(profilePath, voiceInitPath)).toBe("DigiSmith: profile=emma");
  });

  it("includes the voice summary when voice-init.ts resolves one", async () => {
    fs.writeFileSync(profilePath, "emma\n");
    fs.writeFileSync(
      voiceInitPath,
      "export default async function (): Promise<string | null> { return 'conversational'; }\n",
    );
    expect(await buildBanner(profilePath, voiceInitPath)).toBe("DigiSmith: profile=emma, voices=conversational");
  });
});

describe("main (CLI)", () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-session-init-test-"));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.exitCode = 0;
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("prints nothing when there's no .digismith/profile", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await main();

    expect(logSpy).not.toHaveBeenCalled();
  });

  it("prints the banner with a voice summary when .digismith/profile exists and voice-init.ts is present", async () => {
    fs.mkdirSync(path.join(tmpDir, ".digismith"));
    fs.writeFileSync(path.join(tmpDir, ".digismith", "profile"), "emma\n");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await main();

    expect(logSpy).toHaveBeenCalledWith("DigiSmith: profile=emma, voices=technical+conversation");
  });

  it("surfaces a stderr warning and a non-zero exit code on an unexpected read error", async () => {
    fs.mkdirSync(path.join(tmpDir, ".digismith"));
    fs.writeFileSync(path.join(tmpDir, ".digismith", "profile"), Buffer.from([0xff, 0xfe]));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await main();

    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("session-init: failed"));
  });

  it("still prints the attribution reminder when buildBanner throws, in DigiSmith's own repo", async () => {
    fs.mkdirSync(path.join(tmpDir, ".claude-plugin"));
    fs.writeFileSync(
      path.join(tmpDir, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "digismith", version: "1.0.0" }),
    );
    fs.mkdirSync(path.join(tmpDir, ".digismith"));
    fs.writeFileSync(path.join(tmpDir, ".digismith", "profile"), Buffer.from([0xff, 0xfe]));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await main();

    expect(logSpy).toHaveBeenCalledWith("DigiSmith: no AI attribution in commits or PRs — no exceptions");
    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("session-init: failed"));
  });

  it("prints the attribution reminder in DigiSmith's own repo even with no profile", async () => {
    fs.mkdirSync(path.join(tmpDir, ".claude-plugin"));
    fs.writeFileSync(
      path.join(tmpDir, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "digismith", version: "1.0.0" }),
    );
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await main();

    expect(logSpy).toHaveBeenCalledWith("DigiSmith: no AI attribution in commits or PRs — no exceptions");
  });

  it("prints the handoff pointer even with no .digismith/profile", async () => {
    fs.mkdirSync(path.join(tmpDir, ".digismith", "sessions"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, ".digismith", "sessions", "abc123.md"), "# Handoff: Foo\n");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await main();

    expect(logSpy).toHaveBeenCalledWith(
      'DigiSmith: handoff from prior session — "Handoff: Foo" — read .digismith/sessions/abc123.md, then delete it once used',
    );
  });
});
