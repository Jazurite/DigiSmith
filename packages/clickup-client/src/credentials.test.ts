import { describe, it, expect, vi, afterEach } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkCredentials, CredentialsError } from "./credentials.ts";

describe("checkCredentials", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns credentials when the env file has both values", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "clickup-client-test-"));
    const envPath = join(tmpDir, ".env");
    writeFileSync(envPath, "CLICKUP_API_TOKEN=tok_123\nCLICKUP_TEAM_ID=5738747\n");

    const creds = checkCredentials(envPath);

    expect(creds).toEqual({ teamId: "5738747", apiToken: "tok_123" });
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("strips surrounding quotes from values", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "clickup-client-test-"));
    const envPath = join(tmpDir, ".env");
    writeFileSync(envPath, 'CLICKUP_API_TOKEN="tok_123"\nCLICKUP_TEAM_ID=\'5738747\'\n');

    const creds = checkCredentials(envPath);

    expect(creds).toEqual({ teamId: "5738747", apiToken: "tok_123" });
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws CredentialsError when the file doesn't exist", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "clickup-client-test-"));
    const envPath = join(tmpDir, "missing.env");

    expect(() => checkCredentials(envPath)).toThrow(CredentialsError);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws CredentialsError when CLICKUP_TEAM_ID is missing", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "clickup-client-test-"));
    const envPath = join(tmpDir, ".env");
    writeFileSync(envPath, "CLICKUP_API_TOKEN=tok_123\n");

    expect(() => checkCredentials(envPath)).toThrow(
      /need CLICKUP_API_TOKEN, CLICKUP_TEAM_ID/
    );
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws CredentialsError when CLICKUP_API_TOKEN is missing", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "clickup-client-test-"));
    const envPath = join(tmpDir, ".env");
    writeFileSync(envPath, "CLICKUP_TEAM_ID=5738747\n");

    expect(() => checkCredentials(envPath)).toThrow(CredentialsError);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("ignores blank lines and comments", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "clickup-client-test-"));
    const envPath = join(tmpDir, ".env");
    writeFileSync(
      envPath,
      "# ClickUp\n\nCLICKUP_API_TOKEN=tok_123\n\n# team\nCLICKUP_TEAM_ID=5738747\n"
    );

    const creds = checkCredentials(envPath);

    expect(creds).toEqual({ teamId: "5738747", apiToken: "tok_123" });
    rmSync(tmpDir, { recursive: true, force: true });
  });
});
