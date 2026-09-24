import { describe, it, expect } from "vitest";
import { describeSshFailure } from "./run-command.ts";

describe("describeSshFailure", () => {
  it("reports ssh's own stderr for a connection-level failure (exit 255)", () => {
    expect(describeSshFailure({ status: 255, stdout: "", stderr: "ssh: connect to host x port 22: Connection refused\n" })).toBe(
      "ssh: connect to host x port 22: Connection refused"
    );
  });

  it("falls back to a generic message for exit 255 with no stderr", () => {
    expect(describeSshFailure({ status: 255, stdout: "", stderr: "" })).toBe("ssh connection failed");
  });

  it("prefers the remote command's stdout over a non-fatal ssh warning for other failures", () => {
    const herdrError = '{"error":{"code":"agent_not_found"}}';
    expect(
      describeSshFailure({ status: 1, stdout: `${herdrError}\n`, stderr: "Warning: Permanently added 'x' to known hosts.\n" })
    ).toBe(herdrError);
  });

  it("falls back to stderr, then a generic message, when stdout is empty", () => {
    expect(describeSshFailure({ status: 1, stdout: "", stderr: "herdr: command not found\n" })).toBe(
      "herdr: command not found"
    );
    expect(describeSshFailure({ status: 1, stdout: "  ", stderr: "" })).toBe("unknown error");
  });
});
