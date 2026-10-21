import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, it, expect } from "vitest";

const run = promisify(execFile);
const entry = new URL("./index.ts", import.meta.url).pathname;

// Autonomous jobs once ran the source under type stripping; vitest hides syntax that stripping refuses.
describe("source CLI under --experimental-strip-types", () => {
  for (const args of [["--help"], ["autonomous", "--help"]]) {
    it(`dg ${args.join(" ")} runs`, async () => {
      const { stdout } = await run(process.execPath, ["--experimental-strip-types", entry, ...args]);
      expect(stdout).toMatch(/autonomous|scan|report/i);
    }, 30_000);
  }
});
