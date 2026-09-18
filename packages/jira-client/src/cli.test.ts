import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs, requireArgs } from "./cli.ts";

const SCRIPT_PATH = fileURLToPath(new URL("./cli.ts", import.meta.url));

describe("parseArgs", () => {
  it("parses --flag value pairs into an object", () => {
    expect(parseArgs(["--key", "EMKT-1", "--fields", "summary,description"])).toEqual({
      key: "EMKT-1",
      fields: "summary,description",
    });
  });

  it("leaves a trailing flag with no value as undefined", () => {
    expect(parseArgs(["--key", "EMKT-1", "--fields"])).toEqual({
      key: "EMKT-1",
      fields: undefined,
    });
  });

  it("returns an empty object for no args", () => {
    expect(parseArgs([])).toEqual({});
  });
});

describe("requireArgs", () => {
  it("does not throw when every required flag is present", () => {
    expect(() => requireArgs({ key: "EMKT-1", fields: "summary" }, ["key", "fields"])).not.toThrow();
  });

  it("throws naming a single missing flag", () => {
    expect(() => requireArgs({ key: "EMKT-1" }, ["key", "fields"])).toThrow(/--fields/);
  });

  it("throws naming all missing flags when several are absent", () => {
    expect(() => requireArgs({}, ["key", "fields"])).toThrow(/--key.*--fields/);
  });

  it("treats a trailing flag with no value (undefined) as missing", () => {
    expect(() => requireArgs({ key: "EMKT-1", fields: undefined as unknown as string }, ["key", "fields"])).toThrow(
      /--fields/
    );
  });
});

describe("check-credentials CLI (entry guard)", () => {
  it("actually runs main() and reports ok with valid credentials", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "jira-client-cli-"));
    const depotDir = join(tmpDir, ".digismith-depot");
    mkdirSync(depotDir);
    writeFileSync(
      join(depotDir, ".env"),
      "JIRA_EMAIL=jack@example.com\nJIRA_API_TOKEN=abc123\nJIRA_SITE=example.atlassian.net\n"
    );

    const result = spawnSync("node", [SCRIPT_PATH, "check-credentials"], {
      encoding: "utf-8",
      env: { ...process.env, HOME: tmpDir, USERPROFILE: tmpDir },
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toContain("check-credentials: ok");
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("actually runs main() and reports the real error with missing credentials", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "jira-client-cli-"));

    const result = spawnSync("node", [SCRIPT_PATH, "check-credentials"], {
      encoding: "utf-8",
      env: { ...process.env, HOME: tmpDir, USERPROFILE: tmpDir },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("no credentials: no credentials file found at");
    rmSync(tmpDir, { recursive: true, force: true });
  });
});
