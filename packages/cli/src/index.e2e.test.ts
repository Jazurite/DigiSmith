import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

// Real subprocess test against the compiled entry point — mirrors the pattern in
// packages/jira-client/src/cli.test.ts, which spawns the real CLI and asserts on
// its actual output rather than re-implementing the wiring inline. This is the one
// test that exercises the real `if (isDirectRun()) { ... .parse(argv, {}, callback) }`
// branch of src/index.ts, which index.test.ts's other tests never touch (they call
// buildCli().parse(...) directly). Three real bugs lived in exactly this seam across
// this migration's three design attempts (see plan.md's "Correction" sections), so
// nothing short of running the built artifact catches a regression here.
//
// Requires packages/cli/dist/index.js to exist — run `pnpm --filter @digismith/cli build`
// first. A `pretest` script on this package does that automatically for `pnpm test`/
// `pnpm --filter @digismith/cli test`; unlike jira-client's entry-point test (which spawns
// its .ts source directly via Node's native TS support and has no build step at all), this
// package's real entry point is the published dist/index.js binary, so there's no
// build-free equivalent to fall back to.
const DIST_ENTRY = fileURLToPath(new URL("../dist/index.js", import.meta.url));

const ownPackageJson = new URL("../package.json", import.meta.url);
const ownVersion = (JSON.parse(readFileSync(ownPackageJson, "utf-8")) as { version: string }).version;

function run(args: string[]) {
  return spawnSync("node", [DIST_ENTRY, ...args], { encoding: "utf-8" });
}

describe("dist/index.js (real entry point, subprocess)", () => {
  it("--help exits 0 with a single Usage line and a properly-closed colorized Domains header", () => {
    const result = run(["--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout.match(/^Usage: digismith/gm)).toHaveLength(1);

    // Guard against the exact mangled-ANSI bug the plan's two "Correction" sections
    // document: assert both the color-open AND the matching color-close appear around
    // "Domains:", not just that some escape code exists somewhere in the output.
    const openThenClose = /\x1b\[1m\x1b\[35mDomains:\x1b\[39m\x1b\[22m/;
    expect(result.stdout).toMatch(openThenClose);
  });

  it("--version prints exactly the real package version and nothing else", () => {
    const result = run(["--version"]);

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(ownVersion);
  });

  it("depot clone bogus exits non-zero", () => {
    const result = run(["depot", "clone", "bogus"]);

    expect(result.status).not.toBe(0);
  });
});
