import { execFile } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, it, expect } from "vitest";

const run = promisify(execFile);
const entry = new URL("./index.ts", import.meta.url).pathname;

// Autonomous jobs once ran the source under type stripping; vitest hides syntax that stripping refuses.
describe("source CLI under --experimental-strip-types", () => {
  for (const args of [["--help"], ["autonomous", "--help"], ["oculus", "--help"]]) {
    it(`dg ${args.join(" ")} runs`, async () => {
      const { stdout } = await run(process.execPath, ["--experimental-strip-types", entry, ...args]);
      expect(stdout).toMatch(/autonomous|scan|report|oculus|view/i);
    }, 30_000);
  }
});

// The view path loads modules that --help does not; run one view on an empty depot.
describe("oculus view under --experimental-strip-types", () => {
  it("dg oculus view overview --json on an empty depot", async () => {
    const depot = mkdtempSync(join(tmpdir(), "oc-smoke-"));
    try {
      const { stdout } = await run(process.execPath, ["--experimental-strip-types", entry, "oculus", "view", "overview", "--json"], { env: { ...process.env, DIGISMITH_DEPOT_DIR: depot } });
      expect(JSON.parse(stdout).workers).toEqual([]);
    } finally { rmSync(depot, { recursive: true, force: true }); }
  }, 30_000);

  it("dg nightwatch is not a command any more", async () => {
    const depot = mkdtempSync(join(tmpdir(), "oc-smoke-"));
    try {
      const r = await run(process.execPath, ["--experimental-strip-types", entry, "nightwatch", "view", "overview"], { env: { ...process.env, DIGISMITH_DEPOT_DIR: depot } }).catch((e: { code: number; stdout: string }) => e);
      expect((r as { code?: number }).code ?? 0).not.toBe(0);
    } finally { rmSync(depot, { recursive: true, force: true }); }
  }, 30_000);
});

describe("tokens runs under --experimental-strip-types", () => {
  it("dg tokens runs --dry-run on an empty depot", async () => {
    const depot = mkdtempSync(join(tmpdir(), "tok-smoke-"));
    try {
      const { stdout } = await run(process.execPath, ["--experimental-strip-types", entry, "tokens", "runs", "--dry-run"], { env: { ...process.env, DIGISMITH_DEPOT_DIR: depot, DIGISMITH_CLAUDE_PROJECTS_DIR: depot } });
      expect(stdout).toMatch(/updated 0/);
    } finally { rmSync(depot, { recursive: true, force: true }); }
  }, 30_000);
});

// The import graph of index.ts skips tests and test utils; strip every .ts file so none can bring back enums, namespaces or parameter properties.
describe("every .ts file under src strips cleanly", () => {
  const srcDir = new URL(".", import.meta.url).pathname;
  const files = (readdirSync(srcDir, { recursive: true }) as string[]).filter((f) => f.endsWith(".ts"));

  it("finds the source files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("strips every file", () => {
    const failures: string[] = [];
    for (const file of files) {
      try {
        stripTypeScriptTypes(readFileSync(join(srcDir, file), "utf8"));
      } catch (error) {
        failures.push(`${file}: ${(error as Error).message}`);
      }
    }
    expect(failures).toEqual([]);
  });
});
