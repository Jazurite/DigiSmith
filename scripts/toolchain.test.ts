import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  DEFAULT_TOOLCHAIN_PATH,
  readToolchain,
  setToolchainDefault,
  clearToolchainDefault,
  main,
} from "./toolchain.ts";

describe("DEFAULT_TOOLCHAIN_PATH", () => {
  it("locks the documented default path", () => {
    expect(DEFAULT_TOOLCHAIN_PATH).toBe("toolchain.yml");
  });
});

describe("readToolchain", () => {
  let tmpDir: string;
  let toolchainPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-toolchain-test-"));
    toolchainPath = path.join(tmpDir, "toolchain.yml");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns an empty map for a missing file", () => {
    expect(readToolchain(toolchainPath)).toEqual(new Map());
  });

  it("reads a flat domain/value pair, ignoring the header comment", () => {
    fs.writeFileSync(
      toolchainPath,
      "# DigiSmith-managed. Standing toolchain defaults, dictated by Jack.\ntest_runner: Vitest\n",
    );
    expect(readToolchain(toolchainPath).get("test_runner")).toBe("Vitest");
  });

  it("reads multiple entries", () => {
    fs.writeFileSync(toolchainPath, "test_runner: Vitest\nstyling: SCSS\n");
    const entries = readToolchain(toolchainPath);
    expect(entries.get("test_runner")).toBe("Vitest");
    expect(entries.get("styling")).toBe("SCSS");
    expect(entries.size).toBe(2);
  });

  it("strips an inline comment", () => {
    fs.writeFileSync(toolchainPath, "test_runner: Vitest   # confirmed 2026-08-27\n");
    expect(readToolchain(toolchainPath).get("test_runner")).toBe("Vitest");
  });

  it("unwraps a quoted value", () => {
    fs.writeFileSync(toolchainPath, 'test_runner: "Vitest"\n');
    expect(readToolchain(toolchainPath).get("test_runner")).toBe("Vitest");
  });

  it("returns undefined for a domain that was never set", () => {
    fs.writeFileSync(toolchainPath, "test_runner: Vitest\n");
    expect(readToolchain(toolchainPath).get("styling")).toBeUndefined();
  });

  it("treats a non-UTF-8 file as empty rather than throwing", () => {
    fs.writeFileSync(toolchainPath, Buffer.from([0x66, 0x3a, 0xff, 0xfe]));
    expect(() => readToolchain(toolchainPath)).not.toThrow();
    expect(readToolchain(toolchainPath)).toEqual(new Map());
  });

  it("skips a line with no colon", () => {
    fs.writeFileSync(toolchainPath, "not a valid line\ntest_runner: Vitest\n");
    expect(readToolchain(toolchainPath).get("test_runner")).toBe("Vitest");
  });

  it("preserves a value containing its own punctuation", () => {
    fs.writeFileSync(
      toolchainPath,
      "script_language: TypeScript (over Python, absent existing precedent to match)\n",
    );
    expect(readToolchain(toolchainPath).get("script_language")).toBe(
      "TypeScript (over Python, absent existing precedent to match)",
    );
  });
});

describe("setToolchainDefault", () => {
  let tmpDir: string;
  let toolchainPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-toolchain-test-"));
    toolchainPath = path.join(tmpDir, "nested", "toolchain.yml");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates the file (and parent directory) with the header comment when none existed", () => {
    setToolchainDefault("test_runner", "Vitest", toolchainPath);
    const content = fs.readFileSync(toolchainPath, "utf8");
    expect(content).toBe(
      "# DigiSmith-managed. Standing toolchain defaults, dictated by Jack.\ntest_runner: Vitest\n",
    );
  });

  it("updates an existing domain in place, preserving other domains", () => {
    setToolchainDefault("test_runner", "Vitest", toolchainPath);
    setToolchainDefault("styling", "SCSS", toolchainPath);
    setToolchainDefault("test_runner", "Jest", toolchainPath);

    const entries = readToolchain(toolchainPath);
    expect(entries.get("test_runner")).toBe("Jest");
    expect(entries.get("styling")).toBe("SCSS");
  });
});
