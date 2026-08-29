// scripts/model_offload.test.ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCredential, main, offload, readProfileProvider } from "./model_offload.ts";
import { chutes } from "./providers/chutes.ts";

const VALID_HTML = '<!doctype html>\n<html lang="en"><body>ok</body>\n</html>';

function fakeJsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("readProfileProvider", () => {
  let tempRepoDir: string;
  let profileYml: string;
  let pointerFile: string;
  let originalCwd: string;

  beforeEach(() => {
    tempRepoDir = mkdtempSync(join(tmpdir(), "digismith-test-"));
    mkdirSync(join(tempRepoDir, ".claude-plugin"), { recursive: true });
    writeFileSync(join(tempRepoDir, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "digismith" }));

    mkdirSync(join(tempRepoDir, "profiles"), { recursive: true });
    profileYml = join(tempRepoDir, "profiles", "digismith.yml");
    writeFileSync(profileYml, "name: digismith\nmodel_offload_provider: chutes\n");

    pointerFile = join(tempRepoDir, "profile-pointer");
    writeFileSync(pointerFile, "digismith");

    originalCwd = process.cwd();
    process.chdir(tempRepoDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempRepoDir, { recursive: true, force: true });
  });

  it("returns null for a missing pointer file", () => {
    expect(readProfileProvider("/nonexistent/path/profile")).toBeNull();
  });

  it("returns the field value when present", () => {
    expect(readProfileProvider(pointerFile)).toBe("chutes");
  });

  it("returns null when the field is absent", () => {
    writeFileSync(profileYml, "name: digismith\n");
    expect(readProfileProvider(pointerFile)).toBeNull();
  });

  it("strips an inline comment", () => {
    writeFileSync(profileYml, "name: digismith\nmodel_offload_provider: chutes   # optional; absent = feature off\n");
    expect(readProfileProvider(pointerFile)).toBe("chutes");
  });

  it("unwraps a quoted value", () => {
    writeFileSync(profileYml, 'name: digismith\nmodel_offload_provider: "chutes"\n');
    expect(readProfileProvider(pointerFile)).toBe("chutes");
  });

  it("handles an indented, quoted value with a trailing comment", () => {
    writeFileSync(profileYml, "name: digismith\n  model_offload_provider: 'chutes' # on\n");
    expect(readProfileProvider(pointerFile)).toBe("chutes");
  });

  it("returns null for a non-UTF-8 profiles yml", () => {
    writeFileSync(profileYml, Buffer.from([0x6e, 0x61, 0x6d, 0x65, 0xff, 0xfe]));
    expect(readProfileProvider(pointerFile)).toBeNull();
  });

  it("returns null for a non-UTF-8 plugin.json", () => {
    writeFileSync(join(tempRepoDir, ".claude-plugin", "plugin.json"), Buffer.from([0x7b, 0xff, 0xfe]));
    expect(readProfileProvider(pointerFile)).toBeNull();
  });

  it("returns null outside DigiSmith's own repo", () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "digismith-empty-"));
    process.chdir(emptyDir);
    try {
      expect(readProfileProvider(pointerFile)).toBeNull();
    } finally {
      process.chdir(tempRepoDir);
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});

describe("offload", () => {
  let tempRepoDir: string;
  let profileYml: string;
  let profilePath: string;
  let originalCwd: string;
  // getCredential falls back to ~/.digismith/.env when the env var is
  // unset — point HOME/USERPROFILE at an empty temp dir for every test in
  // this block so that fallback can never pick up a real developer's
  // actual ~/.digismith/.env and turn a "no credentials" test flaky.
  let tempHomeDir: string;
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;

  beforeEach(() => {
    tempRepoDir = mkdtempSync(join(tmpdir(), "digismith-test-"));
    mkdirSync(join(tempRepoDir, ".claude-plugin"), { recursive: true });
    writeFileSync(join(tempRepoDir, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "digismith" }));
    mkdirSync(join(tempRepoDir, "profiles"), { recursive: true });
    profileYml = join(tempRepoDir, "profiles", "digismith.yml");
    writeFileSync(profileYml, "name: digismith\nmodel_offload_provider: chutes\n");
    profilePath = join(tempRepoDir, "profile-pointer");
    writeFileSync(profilePath, "digismith");
    originalCwd = process.cwd();
    process.chdir(tempRepoDir);

    tempHomeDir = mkdtempSync(join(tmpdir(), "digismith-home-"));
    originalHome = process.env.HOME;
    originalUserProfile = process.env.USERPROFILE;
    process.env.HOME = tempHomeDir;
    process.env.USERPROFILE = tempHomeDir;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempRepoDir, { recursive: true, force: true });
    rmSync(tempHomeDir, { recursive: true, force: true });
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = originalUserProfile;
    delete process.env.CHUTES_API_KEY;
    delete process.env.TOKENREPLY_API_KEY;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("skips when the provider isn't registered", async () => {
    writeFileSync(profileYml, "name: digismith\nmodel_offload_provider: openai\n");
    const [content, status] = await offload("hello", profilePath);
    expect(content).toBeNull();
    expect(status).toContain("skipped");
  });

  it("skips when there are no credentials", async () => {
    delete process.env.CHUTES_API_KEY;
    const [content, status] = await offload("hello", profilePath);
    expect(content).toBeNull();
    expect(status).toContain("no CHUTES_API_KEY credentials");
  });

  it("skips outside DigiSmith's own repo", async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "digismith-empty-"));
    process.chdir(emptyDir);
    try {
      const [content, status] = await offload("hello", profilePath);
      expect(content).toBeNull();
      expect(status).toContain("not DigiSmith's own repo");
    } finally {
      process.chdir(tempRepoDir);
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it("succeeds end to end against a mocked fetch", async () => {
    process.env.CHUTES_API_KEY = "cpk_fake";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(fakeJsonResponse(200, { choices: [{ message: { content: VALID_HTML } }] })),
    );
    const [content, status] = await offload("hello", profilePath);
    expect(content).toBe(VALID_HTML);
    expect(status).toContain("success");
  });

  it("succeeds against a second registered provider (tokenreply)", async () => {
    writeFileSync(profileYml, "name: digismith\nmodel_offload_provider: tokenreply\n");
    process.env.TOKENREPLY_API_KEY = "tr_fake";
    const fetchMock = vi
      .fn()
      .mockResolvedValue(fakeJsonResponse(200, { choices: [{ message: { content: VALID_HTML } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const [content, status] = await offload("hello", profilePath);
    expect(content).toBe(VALID_HTML);
    expect(status).toContain("success");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.tokenreply.com/v1/chat/completions",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("fails on an HTTP error", async () => {
    process.env.CHUTES_API_KEY = "cpk_fake";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeJsonResponse(429, {})));
    const [content, status] = await offload("hello", profilePath);
    expect(content).toBeNull();
    expect(status).toContain("failed");
  });

  it("fails on a network/timeout error", async () => {
    process.env.CHUTES_API_KEY = "cpk_fake";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("The read operation timed out")));
    const [content, status] = await offload("hello", profilePath);
    expect(content).toBeNull();
    expect(status).toContain("failed");
  });

  it("fails on an empty response", async () => {
    process.env.CHUTES_API_KEY = "cpk_fake";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(fakeJsonResponse(200, { choices: [{ message: { content: "   " } }] })),
    );
    const [content, status] = await offload("hello", profilePath);
    expect(content).toBeNull();
    expect(status).toContain("empty");
  });

  it("fails on an array response body", async () => {
    process.env.CHUTES_API_KEY = "cpk_fake";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeJsonResponse(200, [])));
    const [content, status] = await offload("hello", profilePath);
    expect(content).toBeNull();
    expect(status).toContain("failed");
  });

  it("fails when content is a list instead of a string", async () => {
    process.env.CHUTES_API_KEY = "cpk_fake";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeJsonResponse(200, {
          choices: [{ message: { content: [{ type: "text", text: "<!doctype html>" }] } }],
        }),
      ),
    );
    const [content, status] = await offload("hello", profilePath);
    expect(content).toBeNull();
    expect(status).toContain("failed");
  });

  it("rejects content missing the doctype", async () => {
    process.env.CHUTES_API_KEY = "cpk_fake";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeJsonResponse(200, { choices: [{ message: { content: "Here is your document:\n<html></html>" } }] }),
      ),
    );
    const [content, status] = await offload("hello", profilePath);
    expect(content).toBeNull();
    expect(status).toContain("malformed HTML shape");
  });

  it("rejects content not ending in </html>", async () => {
    process.env.CHUTES_API_KEY = "cpk_fake";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeJsonResponse(200, { choices: [{ message: { content: "<!doctype html>\n<html><body>truncated" } }] }),
      ),
    );
    const [content, status] = await offload("hello", profilePath);
    expect(content).toBeNull();
    expect(status).toContain("malformed HTML shape");
  });

  it("rejects content with an unsubstituted placeholder", async () => {
    process.env.CHUTES_API_KEY = "cpk_fake";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeJsonResponse(200, {
          choices: [{ message: { content: "<!doctype html>\n<html><body>{{BODY_SECTIONS}}</body></html>" } }],
        }),
      ),
    );
    const [content, status] = await offload("hello", profilePath);
    expect(content).toBeNull();
    expect(status).toContain("malformed HTML shape");
  });

  it("rejects content wrapped in a markdown code fence", async () => {
    process.env.CHUTES_API_KEY = "cpk_fake";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeJsonResponse(200, {
          choices: [{ message: { content: "```html\n<!doctype html>\n<html><body>ok</body></html>\n```" } }],
        }),
      ),
    );
    const [content, status] = await offload("hello", profilePath);
    expect(content).toBeNull();
    expect(status).toContain("malformed HTML shape");
  });

  it("accepts an uppercase doctype and trailing whitespace", async () => {
    process.env.CHUTES_API_KEY = "cpk_fake";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeJsonResponse(200, { choices: [{ message: { content: "<!DOCTYPE html>\n<html><body>ok</body></html>\n\n" } }] }),
      ),
    );
    const [content, status] = await offload("hello", profilePath);
    expect(content).not.toBeNull();
    expect(status).toContain("success");
  });
});

describe("getCredential", () => {
  let tempHomeDir: string;
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;

  beforeEach(() => {
    tempHomeDir = mkdtempSync(join(tmpdir(), "digismith-home-"));
    originalHome = process.env.HOME;
    originalUserProfile = process.env.USERPROFILE;
    process.env.HOME = tempHomeDir;
    process.env.USERPROFILE = tempHomeDir;
    delete process.env.CHUTES_API_KEY;
  });

  afterEach(() => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = originalUserProfile;
    delete process.env.CHUTES_API_KEY;
    rmSync(tempHomeDir, { recursive: true, force: true });
  });

  it("returns null when the env var is unset and no ~/.digismith/.env exists", () => {
    expect(getCredential(chutes)).toBeNull();
  });

  it("falls back to ~/.digismith/.env when the env var is unset", () => {
    mkdirSync(join(tempHomeDir, ".digismith"), { recursive: true });
    writeFileSync(join(tempHomeDir, ".digismith", ".env"), "CHUTES_API_KEY=cpk_from_file\n");
    expect(getCredential(chutes)).toBe("cpk_from_file");
  });

  it("prefers the environment variable over ~/.digismith/.env", () => {
    process.env.CHUTES_API_KEY = "cpk_from_env";
    mkdirSync(join(tempHomeDir, ".digismith"), { recursive: true });
    writeFileSync(join(tempHomeDir, ".digismith", ".env"), "CHUTES_API_KEY=cpk_from_file\n");
    expect(getCredential(chutes)).toBe("cpk_from_env");
  });

  it("returns null when the key isn't present in ~/.digismith/.env", () => {
    mkdirSync(join(tempHomeDir, ".digismith"), { recursive: true });
    writeFileSync(join(tempHomeDir, ".digismith", ".env"), "OTHER_KEY=something\n");
    expect(getCredential(chutes)).toBeNull();
  });
});

describe("main", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = 0;
  });

  it("reports a clear error when the prompt file is missing", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const originalArgv = process.argv;
    process.argv = ["node", "model_offload.ts", "--prompt-file", "/nonexistent/path/file.txt"];
    try {
      await main();
      expect(process.exitCode).toBe(1);
      const errOutput = errorSpy.mock.calls.map((call) => call.join(" ")).join("\n");
      expect(errOutput).toContain("offload: failed");
      expect(errOutput).toContain("cannot read prompt file");
    } finally {
      process.argv = originalArgv;
    }
  });
});
