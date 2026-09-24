import { describe, it, expect, vi, afterEach } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCheckCredentialsCommand } from "./check-credentials.ts";

describe("createCheckCredentialsCommand", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("prints ok when credentials are present and complete", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "dg-clickup-check-creds-"));
    const envPath = join(tmpDir, ".env");
    writeFileSync(envPath, "CLICKUP_API_TOKEN=tok_123\nCLICKUP_TEAM_ID=5738747\n");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const command = createCheckCredentialsCommand(envPath);

    (command.handler as () => void)();

    expect(logSpy).toHaveBeenCalledWith("clickup check-credentials: ok");
    expect(process.exitCode).toBe(0);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("errors and sets exitCode 1 when credentials are missing", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "dg-clickup-check-creds-missing-"));
    const envPath = join(tmpDir, "missing.env");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const command = createCheckCredentialsCommand(envPath);

    (command.handler as () => void)();

    expect(errorSpy).toHaveBeenCalledWith(
      `clickup check-credentials: no credentials file found at ${envPath}`
    );
    expect(process.exitCode).toBe(1);
    rmSync(tmpDir, { recursive: true, force: true });
  });
});
