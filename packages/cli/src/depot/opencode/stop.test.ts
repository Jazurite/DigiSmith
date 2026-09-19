import { describe, it, expect, vi, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createStopCommand } from "./stop.ts";

describe("createStopCommand", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("reports nothing to stop when no server is tracked", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-opencode-stop-"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const command = createStopCommand(path.join(tmpDir, "tracking.json"));

    (command.handler as (argv: never) => void)({} as never);

    expect(logSpy).toHaveBeenCalledWith("depot opencode: nothing to stop");
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
