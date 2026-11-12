import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../../", import.meta.url));

function walk(dir: string, ext: RegExp, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".worktrees") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, ext, out);
    else if (ext.test(name) && !/\.test(-util)?\.ts$/.test(name) && !/\.test-util\.ts$/.test(name)) out.push(p);
  }
  return out;
}

// The only files that may write a ticket status outside the Steward (spec 2, 2.1):
// W1/W2 the scan claim and its rollback, W6 schedule-release, plus the plumbing they run through.
// steward/event.ts is the Steward itself, the one status writer (the plan's list missed it; the Builder reports it in the STOP).
const ALLOWED = new Set([
  "packages/cli/src/steward/event.ts",
  "packages/cli/src/autonomous/scan.ts",
  "packages/cli/src/autonomous/schedule-release.ts",
  "packages/cli/src/autonomous/tracker-clickup.ts",
  "packages/cli/src/autonomous/index.ts",
  "packages/cli/src/autonomous/observers-real.ts",
  "packages/cli/src/autonomous/act.ts",
  "packages/cli/src/steward/clickup-tracker.ts",
]);
const CODE_WRITE = /\.setStatus\(|updateTask\([^)]*\bstatus\b/;
const TEXT_WRITE = /update-task\b[^\n]*--status/;

describe("one status path", () => {
  it("no code outside the allowlist writes a ticket status", () => {
    const bad = walk(join(root, "packages/cli/src"), /\.ts$/)
      .map((f) => relative(root, f))
      .filter((f) => !f.startsWith("packages/cli/src/clickup/") && !ALLOWED.has(f))
      .filter((f) => CODE_WRITE.test(readFileSync(join(root, f), "utf-8")));
    expect(bad).toEqual([]);
  });
  it("no skill, hook or order text tells anyone to set a status with update-task", () => {
    const files = [...walk(join(root, "skills"), /\.md$/), ...walk(join(root, ".digismith/hooks"), /\.md$/), join(root, "packages/cli/src/autonomous/order.ts")];
    const bad = files.map((f) => relative(root, f)).filter((f) => TEXT_WRITE.test(readFileSync(join(root, f), "utf-8")));
    expect(bad).toEqual([]);
  });
  it("the scan still owns exactly the claim and its rollback", () => {
    const scan = readFileSync(join(root, "packages/cli/src/autonomous/scan.ts"), "utf-8");
    expect(scan.match(/\.setStatus\(/g)?.length).toBe(2);
  });
});
