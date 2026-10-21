import { describe, expect, it } from "vitest";
import { DEFAULT_PROTECTED, touchedProtected } from "./protected-paths.ts";

describe("touchedProtected", () => {
  it("matches a folder pattern at any depth below it", () => {
    expect(touchedProtected(["hooks/x/y.sh", "docs/a.md"], ["hooks/"])).toEqual(["hooks/x/y.sh"]);
  });
  it("matches an exact file and nothing longer", () => {
    expect(touchedProtected([".digismith/config.yml", ".digismith/config.yml.bak"], [".digismith/config.yml"])).toEqual([".digismith/config.yml"]);
  });
  it("lets * stand for one path segment part", () => {
    expect(touchedProtected(["skills/finishing-a-development-branch/SKILL.md", "skills/finishing/x"], ["skills/finishing-*/"]))
      .toEqual(["skills/finishing-a-development-branch/SKILL.md"]);
  });
  it("does not match a folder name that only starts the same", () => {
    expect(touchedProtected(["hooks-extra/a"], ["hooks/"])).toEqual([]);
  });
  it("covers every default named in the spec", () => {
    const probe = ["hooks/hooks.json", ".digismith/config.yml", "skills/finishing-x/a", "skills/reviewer/a", "packages/cli/src/reviewer/a.ts",
      "packages/cli/src/autonomous/scan.ts", "scripts/nexus-api/src/scheduler/registry.ts", ".digismith/mandate.yml", ".digismith/profiles/a.yml"];
    expect(touchedProtected(probe, DEFAULT_PROTECTED)).toEqual(probe);
  });
});
