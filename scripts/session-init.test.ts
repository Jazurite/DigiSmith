import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import {
  VOICE_INIT_FILENAME,
  readProfile,
  loadVoiceSummary,
  buildLineagePointer,
  formatBanner,
  buildBanner,
  main,
  isDigismithRepoRoot,
} from "./session-init.ts";
import { resolveMainRoot } from "./lineage-handoff.ts";
import { ConfigError } from "./config-parse.ts";

describe("constants", () => {
  it("locks the documented voice-init filename", () => {
    expect(VOICE_INIT_FILENAME).toBe("voice-init.ts");
  });
});

describe("readProfile", () => {
  let tmpDir: string;
  let dir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-session-init-test-"));
    dir = path.join(tmpDir, ".digismith");
    fs.mkdirSync(dir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns undefined when no profile is set", () => {
    expect(readProfile(dir)).toBeUndefined();
  });

  it("reads profile from config.yml", () => {
    fs.writeFileSync(path.join(dir, "config.yml"), "profile: emma\n");
    expect(readProfile(dir)).toBe("emma");
  });

  it("falls back to the trimmed content of .digismith/profile", () => {
    fs.writeFileSync(path.join(dir, "profile"), "emma\n");
    expect(readProfile(dir)).toBe("emma");
  });

  it("returns undefined for a whitespace-only old profile file", () => {
    fs.writeFileSync(path.join(dir, "profile"), "   \n");
    expect(readProfile(dir)).toBeUndefined();
  });

  it("throws a ConfigError for an old profile file that is not UTF-8", () => {
    fs.writeFileSync(path.join(dir, "profile"), Buffer.from([0xff, 0xfe]));
    expect(() => readProfile(dir)).toThrow(ConfigError);
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

function writeNote(root: string, relPath: string): void {
  const full = path.join(root, ...relPath.split("/"));
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, "# Note\n");
}

function initRepo(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  spawnSync("git", ["init", "-q"], { cwd: dir });
  spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "Test"], { cwd: dir });
  fs.writeFileSync(path.join(dir, "README.md"), "base\n");
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-q", "-m", "base commit"], { cwd: dir });
}

describe("buildLineagePointer", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-session-init-test-"));
    process.env.GIT_CEILING_DIRECTORIES = fs.realpathSync.native(path.dirname(tmpDir));
  });

  afterEach(() => {
    delete process.env.GIT_CEILING_DIRECTORIES;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns undefined when there are no notes", () => {
    expect(buildLineagePointer(tmpDir)).toBeUndefined();
  });

  it("names every note in one line", () => {
    writeNote(tmpDir, ".digismith/docs/A/A.1/handoff.md");
    writeNote(tmpDir, ".digismith/docs/K/handoff.md");
    expect(buildLineagePointer(tmpDir)).toBe(
      `DigiSmith: lineage handoff notes in ${path.join(tmpDir, ".digismith", "docs")}: A/A.1, K — read the one matching your session title (get_session self), or say "resume"`,
    );
  });

  it("names a current-convention session note on its own, once no fallback notes exist", () => {
    // The scenario the fallback-only reading would have missed: once Part 6 of DGS-159 moves
    // the six live handoff.md fallback notes away, listNotes(mainRoot) returns [] — a fresh
    // maestro must still get pointed at its own sessions/<name>/note.md.
    writeNote(tmpDir, ".digismith/sessions/DigiSmith/note.md");
    expect(buildLineagePointer(tmpDir)).toBe(
      `DigiSmith: session notes in ${path.join(tmpDir, ".digismith", "sessions")}: DigiSmith — read the one matching your session title (get_session self), or say "resume"`,
    );
  });

  it("combines fallback notes and current-convention session notes in one line", () => {
    writeNote(tmpDir, ".digismith/docs/A/A.1/handoff.md");
    writeNote(tmpDir, ".digismith/sessions/DigiSmith/note.md");
    expect(buildLineagePointer(tmpDir)).toBe(
      `DigiSmith: lineage handoff notes in ${path.join(tmpDir, ".digismith", "docs")}: A/A.1; ` +
        `session notes in ${path.join(tmpDir, ".digismith", "sessions")}: DigiSmith — read the one matching your session title (get_session self), or say "resume"`,
    );
  });

  it("excludes a worker's brief-only session folder from the session-notes clause", () => {
    writeNote(tmpDir, ".digismith/sessions/DigiSmith/note.md");
    fs.mkdirSync(path.join(tmpDir, ".digismith", "sessions", "dgs-161"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, ".digismith", "sessions", "dgs-161", "brief.md"), "# Brief\n");
    expect(buildLineagePointer(tmpDir)).toBe(
      `DigiSmith: session notes in ${path.join(tmpDir, ".digismith", "sessions")}: DigiSmith — read the one matching your session title (get_session self), or say "resume"`,
    );
  });

  it("reads the main checkout's notes when resolved from a worktree", () => {
    const main = path.join(tmpDir, "main");
    initRepo(main);
    const wt = path.join(tmpDir, "wt");
    spawnSync("git", ["worktree", "add", "-q", "-b", "wt", wt], { cwd: main });
    writeNote(main, ".digismith/docs/A/A.1/handoff.md");
    writeNote(wt, ".digismith/docs/K/handoff.md");
    const mainRoot = resolveMainRoot(wt);

    expect(buildLineagePointer(mainRoot)).toBe(
      `DigiSmith: lineage handoff notes in ${path.join(mainRoot, ".digismith", "docs")}: A/A.1 — read the one matching your session title (get_session self), or say "resume"`,
    );
  });
});

describe("buildBanner", () => {
  let tmpDir: string;
  let dir: string;
  let voiceInitPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-session-init-test-"));
    dir = path.join(tmpDir, ".digismith");
    fs.mkdirSync(dir);
    voiceInitPath = path.join(tmpDir, "voice-init.ts");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns null when there's no profile", async () => {
    expect(await buildBanner(dir, voiceInitPath)).toBeNull();
  });

  it("returns the profile-only banner when voice-init.ts doesn't exist", async () => {
    fs.writeFileSync(path.join(dir, "config.yml"), "profile: emma\n");
    expect(await buildBanner(dir, voiceInitPath)).toBe("DigiSmith: profile=emma");
  });

  it("includes the voice summary when voice-init.ts resolves one", async () => {
    fs.writeFileSync(path.join(dir, "config.yml"), "profile: emma\n");
    fs.writeFileSync(
      voiceInitPath,
      "export default async function (): Promise<string | null> { return 'conversational'; }\n",
    );
    expect(await buildBanner(dir, voiceInitPath)).toBe("DigiSmith: profile=emma, voices=conversational");
  });
});

describe("main (CLI)", () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-session-init-test-"));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
    process.env.GIT_CEILING_DIRECTORIES = fs.realpathSync.native(path.dirname(tmpDir));
  });

  afterEach(() => {
    delete process.env.GIT_CEILING_DIRECTORIES;
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

  it("prints the banner from config.yml", async () => {
    fs.mkdirSync(path.join(tmpDir, ".digismith"));
    fs.writeFileSync(path.join(tmpDir, ".digismith", "config.yml"), "profile: emma\n");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await main();

    expect(logSpy).toHaveBeenCalledWith("DigiSmith: profile=emma, voices=technical+conversation");
  });

  it("prints one warning line and exits 0 on a config.yml parse error", async () => {
    fs.mkdirSync(path.join(tmpDir, ".digismith"));
    fs.writeFileSync(path.join(tmpDir, ".digismith", "config.yml"), "profile digismith\n");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await main();

    expect(logSpy).toHaveBeenCalledWith(
      "DigiSmith: warning: .digismith/config.yml line 1: expected 'key: value'",
    );
    expect(logSpy.mock.calls.flat().some((line) => String(line).startsWith("DigiSmith: profile="))).toBe(false);
    expect(process.exitCode).not.toBe(1);
  });

  it("keeps a stderr failure and exit code 1 for an error that is not a config error", async () => {
    fs.mkdirSync(path.join(tmpDir, ".digismith", "config.yml"), { recursive: true });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await main();

    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("session-init: failed"));
  });

  it("still prints the attribution reminder and the lineage pointer on a config error", async () => {
    fs.mkdirSync(path.join(tmpDir, ".claude-plugin"));
    fs.writeFileSync(
      path.join(tmpDir, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "digismith", version: "1.0.0" }),
    );
    writeNote(tmpDir, ".digismith/docs/A/A.1/handoff.md");
    fs.writeFileSync(path.join(tmpDir, ".digismith", "profile"), Buffer.from([0xff, 0xfe]));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await main();

    expect(logSpy).toHaveBeenCalledWith("DigiSmith: no AI attribution in commits or PRs — no exceptions");
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("DigiSmith: lineage handoff notes in"));
    expect(logSpy).toHaveBeenCalledWith("DigiSmith: warning: .digismith/profile: not valid UTF-8");
    expect(process.exitCode).not.toBe(1);
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

  it("prints the lineage pointer even with no .digismith/profile", async () => {
    writeNote(tmpDir, ".digismith/docs/A/A.1/handoff.md");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await main();

    expect(logSpy).toHaveBeenCalledWith(
      `DigiSmith: lineage handoff notes in ${path.join(process.cwd(), ".digismith", "docs")}: A/A.1 — read the one matching your session title (get_session self), or say "resume"`,
    );
  });

  it("ignores the retired sessions folder", async () => {
    fs.mkdirSync(path.join(tmpDir, ".digismith", "sessions"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, ".digismith", "sessions", "abc123.md"), "# Old handoff\n");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await main();

    expect(logSpy).not.toHaveBeenCalled();
  });
});
