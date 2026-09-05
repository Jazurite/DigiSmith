import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { cloneUpstreamSkillsDir, readGitBlob, readFileIfExists, listBaselineFiles, diffContent } from "./check_vendored_skills.ts";

function initFixtureRepo(dir: string, withSkillsFolder: boolean): void {
  fs.mkdirSync(dir, { recursive: true });
  spawnSync("git", ["init", "-q"], { cwd: dir });
  spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "Test"], { cwd: dir });
  if (withSkillsFolder) {
    fs.mkdirSync(path.join(dir, "skills", "some-skill"), { recursive: true });
    fs.writeFileSync(path.join(dir, "skills", "some-skill", "SKILL.md"), "fixture content\n");
  } else {
    fs.writeFileSync(path.join(dir, "README.md"), "no skills here\n");
  }
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-q", "-m", "fixture commit"], { cwd: dir });
}

describe("cloneUpstreamSkillsDir", () => {
  it("clones the repository and returns its skills/ directory", () => {
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-vendor-test-"));
    let result: string | undefined;
    try {
      const fixtureRepo = path.join(tmpBase, "fixture-repo");
      initFixtureRepo(fixtureRepo, true);

      result = cloneUpstreamSkillsDir(fixtureRepo);

      expect(path.basename(result)).toBe("skills");
      expect(fs.existsSync(result)).toBe(true);
      const cloned = fs.readFileSync(path.join(result, "some-skill", "SKILL.md"), "utf8");
      expect(cloned).toBe("fixture content\n");
    } finally {
      if (result !== undefined) {
        fs.rmSync(path.dirname(result), { recursive: true, force: true });
      }
      fs.rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  it("throws a clear error when the clone fails", () => {
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-vendor-test-noclone-"));
    try {
      const doesNotExist = path.join(tmpBase, "does-not-exist");
      expect(() => cloneUpstreamSkillsDir(doesNotExist)).toThrow("Cannot clone upstream repository");
    } finally {
      fs.rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  it("throws a clear error naming the expected path when the clone has no skills/ subfolder", () => {
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-vendor-test-noskills-"));
    try {
      const fixtureRepo = path.join(tmpBase, "fixture-repo");
      initFixtureRepo(fixtureRepo, false);
      expect(() => cloneUpstreamSkillsDir(fixtureRepo)).toThrow("Expected upstream skills directory not found");
    } finally {
      fs.rmSync(tmpBase, { recursive: true, force: true });
    }
  });
});

const BASELINE_SHA = "a6418858b5374c2506d1ff799b2dcb418bff53d1";

describe("readGitBlob", () => {
  it("returns file content for a path that existed at the given revision", () => {
    const content = readGitBlob(BASELINE_SHA, "skills/vendored-brainstorming/SKILL.md");
    expect(content).toContain("name: brainstorming");
  });

  it("returns null for a path that did not exist at the given revision", () => {
    const content = readGitBlob(BASELINE_SHA, "skills/vendored-brainstorming/NOPE.md");
    expect(content).toBeNull();
  });
});

describe("readFileIfExists", () => {
  it("returns null for a nonexistent absolute path", () => {
    expect(readFileIfExists(path.join(os.tmpdir(), "digismith-definitely-not-here.txt"))).toBeNull();
  });

  it("returns file content for an existing file", () => {
    const tmpFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "digismith-readfile-")), "x.txt");
    fs.writeFileSync(tmpFile, "hello");
    expect(readFileIfExists(tmpFile)).toBe("hello");
  });
});

describe("listBaselineFiles", () => {
  it("lists files under a skill dir at the baseline commit, stripped of the skill-dir prefix", () => {
    const files = listBaselineFiles(BASELINE_SHA, "skills/vendored-brainstorming");
    expect(files).toContain("SKILL.md");
    expect(files.every((f) => !f.startsWith("skills/"))).toBe(true);
  });
});

describe("diffContent", () => {
  it("returns an empty string for identical content", () => {
    expect(diffContent("same\n", "same\n")).toBe("");
  });

  it("returns a unified diff for differing content", () => {
    const diff = diffContent("line one\nline two\n", "line one\nline TWO changed\n");
    expect(diff).toContain("-line two");
    expect(diff).toContain("+line TWO changed");
  });
});

import { compareFile, formatSkillReport } from "./check_vendored_skills.ts";
import type { FileComparison } from "./check_vendored_skills.ts";

describe("compareFile", () => {
  it("reports no-drift when upstream and local both match baseline", () => {
    const result = compareFile("SKILL.md", "same\n", "same\n", "same\n");
    expect(result.status).toBe("no-drift");
    expect(result.upstreamDiff).toBe("");
    expect(result.localDiff).toBe("");
  });

  it("reports upstream-changed when only upstream differs from baseline", () => {
    const result = compareFile("SKILL.md", "old\n", "new\n", "old\n");
    expect(result.status).toBe("upstream-changed");
    expect(result.upstreamDiff).not.toBe("");
    expect(result.localDiff).toBe("");
  });

  it("reports local divergence separately from upstream drift when both differ from baseline", () => {
    const result = compareFile("SKILL.md", "base\n", "upstream-edit\n", "local-edit\n");
    expect(result.status).toBe("upstream-changed");
    expect(result.upstreamDiff).toContain("upstream-edit");
    expect(result.localDiff).toContain("local-edit");
    expect(result.upstreamDiff).not.toContain("local-edit");
    expect(result.localDiff).not.toContain("upstream-edit");
  });

  it("reports removed-upstream when the file no longer exists upstream", () => {
    const result = compareFile("SKILL.md", "base\n", null, "base\n");
    expect(result.status).toBe("removed-upstream");
    expect(result.upstreamDiff).toContain("no longer exists upstream");
  });

  it("notes a locally-missing file without crashing", () => {
    const result = compareFile("SKILL.md", "base\n", "base\n", null);
    expect(result.status).toBe("no-drift");
    expect(result.localDiff).toContain("missing locally");
  });

  it("reports removed-upstream with local divergence separately", () => {
    const result = compareFile("SKILL.md", "base\n", null, "local-edit\n");
    expect(result.status).toBe("removed-upstream");
    expect(result.upstreamDiff).toContain("no longer exists upstream");
    expect(result.localDiff).not.toBe("");
    expect(result.localDiff).toContain("local-edit");
  });
});

describe("formatSkillReport", () => {
  it("summarizes a skill with no drift", () => {
    const files: FileComparison[] = [
      { relPath: "SKILL.md", status: "no-drift", upstreamDiff: "", localDiff: "" },
    ];
    const text = formatSkillReport({ skillName: "brainstorming", files });
    expect(text).toContain("brainstorming: no drift (1 files checked)");
  });

  it("summarizes and details a skill with upstream drift", () => {
    const files: FileComparison[] = [
      { relPath: "SKILL.md", status: "upstream-changed", upstreamDiff: "+new line\n", localDiff: "" },
    ];
    const text = formatSkillReport({ skillName: "writing-plans", files });
    expect(text).toContain("writing-plans: 1 file(s) changed upstream, 0 locally diverged");
    expect(text).toContain("SKILL.md");
    expect(text).toContain("upstream diff:");
    expect(text).toContain("+new line");
  });

  it("details a skill with only local divergence", () => {
    const files: FileComparison[] = [
      { relPath: "SKILL.md", status: "no-drift", upstreamDiff: "", localDiff: "+local edit\n" },
    ];
    const text = formatSkillReport({ skillName: "testing-skills", files });
    expect(text).toContain("testing-skills: 0 file(s) changed upstream, 1 locally diverged");
    expect(text).toContain("SKILL.md");
    expect(text).toContain("local divergence:");
    expect(text).toContain("+local edit");
  });

  it("details a skill with both upstream and local divergence in the same file", () => {
    const files: FileComparison[] = [
      {
        relPath: "SKILL.md",
        status: "upstream-changed",
        upstreamDiff: "+upstream change\n",
        localDiff: "+local change\n",
      },
    ];
    const text = formatSkillReport({ skillName: "mixed-drift", files });
    expect(text).toContain("mixed-drift: 1 file(s) changed upstream, 1 locally diverged");
    expect(text).toContain("SKILL.md");
    expect(text).toContain("upstream diff:");
    expect(text).toContain("+upstream change");
    expect(text).toContain("local divergence:");
    expect(text).toContain("+local change");
    // Verify they don't bleed together: check the upstream change appears before the local label
    const upstreamIndex = text.indexOf("+upstream change");
    const localLabelIndex = text.indexOf("local divergence:");
    expect(upstreamIndex).toBeGreaterThan(-1);
    expect(localLabelIndex).toBeGreaterThan(-1);
    expect(upstreamIndex).toBeLessThan(localLabelIndex);
  });
});
