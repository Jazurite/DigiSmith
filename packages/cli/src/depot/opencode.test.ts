import { describe, it, expect, vi, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { run } from "./opencode.ts";

describe("run", () => {
  afterEach(() => {
    process.exitCode = 0;
  });

  it("prints usage and sets exit 1 for an unknown verb", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    run(["bogus"]);
    expect(errorSpy).toHaveBeenCalledWith("usage: digismith depot opencode <ensure|stop>");
    expect(process.exitCode).toBe(1);
    errorSpy.mockRestore();
  });

  it("prints usage and sets exit 1 when no verb is given", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    run([]);
    expect(errorSpy).toHaveBeenCalledWith("usage: digismith depot opencode <ensure|stop>");
    expect(process.exitCode).toBe(1);
    errorSpy.mockRestore();
  });

  it("reports nothing to stop when no server is tracked", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-opencode-run-"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    run(["stop"], path.join(tmpDir, "tracking.json"), path.join(tmpDir, "server.log"));
    expect(logSpy).toHaveBeenCalledWith("depot opencode: nothing to stop");
    expect(process.exitCode).toBe(0);
    logSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
