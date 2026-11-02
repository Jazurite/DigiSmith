import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readGuardrails } from "../guardrails.ts";
import { DEFAULT_PROTECTED } from "../protected-paths.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");

describe(".digismith/config.yml protected_paths", () => {
  const g = readGuardrails(readFileSync(join(ROOT, ".digismith/config.yml"), "utf8"));
  it("lists skills/director/ and still lists every other entry of DEFAULT_PROTECTED (the config list overrides the default)", () => {
    expect(g.protectedPaths).not.toBeNull();
    expect(g.protectedPaths).toContain("skills/director/");
    for (const p of DEFAULT_PROTECTED) expect(g.protectedPaths).toContain(p);
    for (const p of ["hooks/hooks.json", ".digismith/mandate.yml", ".digismith/profiles/"]) expect(g.protectedPaths).toContain(p);
  });
  it("reads without problems in the protected-paths part", () => {
    expect(g.problems).toEqual([]);
  });
});
