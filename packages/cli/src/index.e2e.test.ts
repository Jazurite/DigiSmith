import { describe, it, expect, beforeAll } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import * as path from "node:path";

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

function isDigismithCheckout(dir: string): boolean {
  const marker = path.join(dir, ".claude-plugin", "plugin.json");
  if (!existsSync(marker)) return false;
  try {
    const parsed = JSON.parse(readFileSync(marker, "utf-8")) as { name?: unknown };
    return parsed.name === "digismith";
  } catch {
    return false;
  }
}

function findRepoRoot(startDir: string): string {
  let dir = startDir;
  while (true) {
    if (isDigismithCheckout(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error("Could not find DigiSmith repo root");
    dir = parent;
  }
}

function run(args: string[]) {
  return spawnSync("node", [DIST_ENTRY, ...args], { encoding: "utf-8" });
}

beforeAll(() => {
  const testFileDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = findRepoRoot(testFileDir);
  const result = spawnSync("pnpm", ["--filter", "@digismith/cli", "build"], {
    cwd: repoRoot,
    stdio: "inherit",
    shell: true,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`Failed to build: ${result.error?.message || `exit code ${result.status}`}`);
  }
});

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
