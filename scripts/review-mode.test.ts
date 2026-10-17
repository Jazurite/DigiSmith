import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "skills", "subagent-driven-development", "scripts", "review-mode");

function mode(value: string | undefined): string {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.DIGISMITH_REVIEW_MODE;
  if (value !== undefined) env.DIGISMITH_REVIEW_MODE = value;
  const r = spawnSync("bash", [SCRIPT], { encoding: "utf8", env });
  expect(r.status).toBe(0);
  return r.stdout.trim();
}

describe("review-mode", () => {
  it("is role only for the exact value role", () => {
    expect(mode("role")).toBe("role");
  });
  it("is hand when unset, empty or anything else", () => {
    for (const v of [undefined, "", "Role", "ROLE", "1", "role ", " role", "hand", "true"]) {
      expect(mode(v)).toBe("hand");
    }
  });
});
