import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../../", import.meta.url));

function walk(dir: string, ext: RegExp, out: string[] = []): string[] {
  expect(existsSync(dir), `${dir} must exist: a missing folder must not pass with zero files scanned`).toBe(true);
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".worktrees") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, ext, out);
    else if (ext.test(name) && !/\.test(-util)?\.ts$/.test(name) && !/\.test-util\.ts$/.test(name)) out.push(p);
  }
  return out;
}

// The only files that may write a ticket status, with the exact number of write calls each holds (spec 2, 2.1).
// A second call inside an allowed file fails the test. W1/W2: scan.ts (the claim and its rollback). W6: schedule-release.ts.
// steward/event.ts is the Steward itself, the one status writer (confirmed by the conductor).
// The rest is the plumbing the factory's tick runs through (the lazy tracker, the writer deps, the act step).
const ALLOWED: Record<string, number> = {
  "packages/cli/src/steward/event.ts": 1,
  "packages/cli/src/autonomous/scan.ts": 2,
  "packages/cli/src/autonomous/schedule-release.ts": 1,
  "packages/cli/src/autonomous/tracker-clickup.ts": 1,
  "packages/cli/src/autonomous/index.ts": 2,
  "packages/cli/src/autonomous/observers-real.ts": 1,
  "packages/cli/src/autonomous/act.ts": 1,
};
const CODE_WRITE = /\.setStatus\(|updateTask\([^)]*\bstatus\b/g;
const TEXT_WRITE = /update-task\b[^\n]*--status/;

const writes = (text: string) => text.match(CODE_WRITE)?.length ?? 0;

describe("one status path", () => {
  it("every file that writes a ticket status is in the table, with exactly its number of calls", () => {
    const files = walk(join(root, "packages/cli/src"), /\.ts$/).map((f) => relative(root, f)).filter((f) => !f.startsWith("packages/cli/src/clickup/"));
    expect(files.length).toBeGreaterThan(50);
    const found: Record<string, number> = {};
    for (const f of files) {
      const n = writes(readFileSync(join(root, f), "utf-8"));
      if (n > 0) found[f] = n;
    }
    expect(found).toEqual(ALLOWED);
  });
  it("no skill, hook or order text tells anyone to set a status with update-task", () => {
    const skills = walk(join(root, "skills"), /\.md$/);
    const hooks = walk(join(root, ".digismith/hooks"), /\.md$/);
    expect(skills.length).toBeGreaterThan(0);
    expect(hooks.length).toBeGreaterThan(0);
    const files = [...skills, ...hooks, join(root, "packages/cli/src/autonomous/order.ts")];
    const bad = files.map((f) => relative(root, f)).filter((f) => TEXT_WRITE.test(readFileSync(join(root, f), "utf-8")));
    expect(bad).toEqual([]);
  });
});
