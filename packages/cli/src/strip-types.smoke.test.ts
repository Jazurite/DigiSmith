import { execFile } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, it, expect } from "vitest";

const run = promisify(execFile);
const entry = new URL("./index.ts", import.meta.url).pathname;

// Autonomous jobs once ran the source under type stripping; vitest hides syntax that stripping refuses.
describe("source CLI under --experimental-strip-types", () => {
  for (const args of [["--help"], ["autonomous", "--help"], ["nightwatch", "--help"]]) {
    it(`dg ${args.join(" ")} runs`, async () => {
      const { stdout } = await run(process.execPath, ["--experimental-strip-types", entry, ...args]);
      expect(stdout).toMatch(/autonomous|scan|report|nightwatch|view/i);
    }, 30_000);
  }
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
