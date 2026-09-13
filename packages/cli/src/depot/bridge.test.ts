import { describe, it, expect, vi, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { findDigismithRepoMarker, resolveDigismithRepo, run } from "./bridge.ts";

function makeDigismithCheckout(root: string): void {
  const dir = path.join(root, ".claude-plugin");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "plugin.json"), JSON.stringify({ name: "digismith" }));
}

describe("findDigismithRepoMarker", () => {
  let tmpDir: string;
  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("finds the marker in the starting directory itself", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-bridge-"));
    makeDigismithCheckout(tmpDir);
    expect(findDigismithRepoMarker(tmpDir)).toBe(tmpDir);
  });

  it("walks up parent directories to find the marker", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-bridge-"));
    makeDigismithCheckout(tmpDir);
    const nested = path.join(tmpDir, "a", "b", "c");
    fs.mkdirSync(nested, { recursive: true });
    expect(findDigismithRepoMarker(nested)).toBe(tmpDir);
  });

  it("returns null when no ancestor has the marker", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-bridge-"));
    const nested = path.join(tmpDir, "a", "b");
    fs.mkdirSync(nested, { recursive: true });
    expect(findDigismithRepoMarker(nested)).toBeNull();
  });

  it("ignores a plugin.json whose name isn't digismith", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-bridge-"));
    const dir = path.join(tmpDir, ".claude-plugin");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "plugin.json"), JSON.stringify({ name: "something-else" }));
    expect(findDigismithRepoMarker(tmpDir)).toBeNull();
  });
});

describe("resolveDigismithRepo", () => {
  let tmpDir: string;
  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("uses cwd when it's a DigiSmith checkout", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-bridge-"));
    makeDigismithCheckout(tmpDir);
    expect(resolveDigismithRepo(undefined, tmpDir)).toBe(tmpDir);
  });

  it("uses an explicit --repo path when valid, regardless of cwd", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-bridge-"));
    makeDigismithCheckout(tmpDir);
    const elsewhereCwd = fs.mkdtempSync(path.join(os.tmpdir(), "depot-bridge-elsewhere-"));
    try {
      expect(resolveDigismithRepo(tmpDir, elsewhereCwd)).toBe(tmpDir);
    } finally {
      fs.rmSync(elsewhereCwd, { recursive: true, force: true });
    }
  });

  it("throws when --repo doesn't look like a DigiSmith checkout", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-bridge-"));
    expect(() => resolveDigismithRepo(tmpDir, tmpDir)).toThrow(/does not look like a DigiSmith checkout/);
  });

  it("throws when neither cwd nor --repo resolves", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-bridge-"));
    expect(() => resolveDigismithRepo(undefined, tmpDir)).toThrow(/not inside a DigiSmith checkout/);
  });
});

describe("run", () => {
  afterEach(() => {
    process.exitCode = 0;
  });

  it("prints usage and sets exit 1 for an unknown verb", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    run(["bogus"]);
    expect(errorSpy).toHaveBeenCalledWith("usage: digismith depot bridge <ensure|stop> [--repo <path>]");
    expect(process.exitCode).toBe(1);
    errorSpy.mockRestore();
  });

  it("reports nothing to stop when no bridge is tracked", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-bridge-run-"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    run(["stop"], path.join(tmpDir, "tracking.json"), path.join(tmpDir, "server.log"));
    expect(logSpy).toHaveBeenCalledWith("depot bridge: nothing to stop");
    expect(process.exitCode).toBe(0);
    logSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("errors when ensure can't resolve a DigiSmith repo", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-bridge-run-"));
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    run(["ensure"], path.join(tmpDir, "tracking.json"), path.join(tmpDir, "server.log"));
    expect(errorSpy).toHaveBeenCalledWith("depot bridge: not inside a DigiSmith checkout and no --repo <path> given");
    expect(process.exitCode).toBe(1);
    cwdSpy.mockRestore();
    errorSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
