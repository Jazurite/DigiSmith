import { describe, it, expect, vi, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import yargs from "yargs";
import { createEnsureCommand } from "./ensure.ts";

describe("createEnsureCommand", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("errors when it can't resolve a DigiSmith repo and no --repo was given", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-bridge-ensure-"));
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const command = createEnsureCommand(
      path.join(tmpDir, "tracking.json"),
      path.join(tmpDir, "server.log")
    );

    (command.handler as (argv: { repo?: string }) => void)({ repo: undefined });

    expect(errorSpy).toHaveBeenCalledWith(
      "depot bridge: not inside a DigiSmith checkout and no --repo <path> given"
    );
    expect(process.exitCode).toBe(1);
    cwdSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("rejects --repo with no value via yargs' own requiresArg parsing constraint", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-bridge-ensure-requiresarg-"));
    const command = createEnsureCommand(
      path.join(tmpDir, "tracking.json"),
      path.join(tmpDir, "server.log")
    );
    const argv = ["ensure", "--repo"];

    // requiresArg is a yargs-level parsing constraint, not something the handler
    // itself checks — it must be exercised through the real yargs builder, not by
    // calling command.handler directly, or a valueless --repo would silently
    // resolve as `argv.repo = ""` instead of being rejected before the handler runs.
    let sawError: unknown;
    yargs(argv).command(command).parse(argv, {}, (err) => {
      sawError = err;
    });

    expect(sawError).toBeTruthy();
    expect((sawError as Error).message).toMatch(/not enough arguments/i);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
