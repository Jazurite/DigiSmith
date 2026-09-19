import { describe, it, expect, vi, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createEnsureCommand } from "./ensure.ts";

describe("createEnsureCommand", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("reports an error and exits 1 when the underlying process fails to start", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-opencode-ensure-"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const command = createEnsureCommand(
      path.join(tmpDir, "tracking.json"),
      path.join(tmpDir, "server.log")
    );

    // No real "opencode" binary or CHUTES_API_KEY on a test machine — ensureProcess()
    // (via fetchChutesApiKey or the spawn itself) is expected to throw.
    (command.handler as (argv: never) => void)({} as never);

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("depot opencode:"));
    expect(process.exitCode).toBe(1);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
