import { describe, it, expect } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClickUpClient } from "@digismith/clickup-client";
import { createClient } from "./lib.ts";

describe("createClient", () => {
  it("builds a ClickUpClient from a valid credentials file", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "dg-clickup-lib-test-"));
    const envPath = join(tmpDir, ".env");
    writeFileSync(envPath, "CLICKUP_API_TOKEN=tok_123\nCLICKUP_TEAM_ID=5738747\n");

    const client = createClient(envPath);

    expect(client).toBeInstanceOf(ClickUpClient);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("propagates CredentialsError when the file is missing", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "dg-clickup-lib-test-missing-"));
    const envPath = join(tmpDir, "missing.env");

    expect(() => createClient(envPath)).toThrow();
    rmSync(tmpDir, { recursive: true, force: true });
  });
});
