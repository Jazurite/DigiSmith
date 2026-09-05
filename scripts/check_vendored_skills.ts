import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

export function cloneUpstreamSkillsDir(
  repoUrl: string = "https://github.com/obra/superpowers.git"
): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-vendor-upstream-"));
  const result = spawnSync("git", ["clone", "--depth", "1", repoUrl, tmpDir], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`Cannot clone upstream repository ${repoUrl}: ${result.stderr}`);
  }
  const skillsDir = path.join(tmpDir, "skills");
  if (!fs.existsSync(skillsDir)) {
    throw new Error(`Expected upstream skills directory not found at ${skillsDir}`);
  }
  return skillsDir;
}

export function readGitBlob(sha: string, relPath: string): string | null {
  const result = spawnSync("git", ["show", `${sha}:${relPath}`], { encoding: "utf8" });
  if (result.status === 0) {
    return result.stdout;
  }
  if (result.status === 128 && result.stderr.includes("does not exist in")) {
    return null;
  }
  throw new Error(`git show failed for ${sha}:${relPath}: ${result.stderr}`);
}

export function readFileIfExists(absPath: string): string | null {
  if (!fs.existsSync(absPath)) {
    return null;
  }
  return fs.readFileSync(absPath, "utf8");
}

export function listBaselineFiles(sha: string, skillRelDir: string): string[] {
  const result = spawnSync("git", ["ls-tree", "-r", "--name-only", sha, "--", skillRelDir], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`git ls-tree failed for ${sha} ${skillRelDir}: ${result.stderr}`);
  }
  const prefix = `${skillRelDir}/`;
  return result.stdout
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => (line.startsWith(prefix) ? line.slice(prefix.length) : line));
}

export function diffContent(contentA: string, contentB: string): string {
  if (contentA === contentB) {
    return "";
  }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-vendor-diff-"));
  const fileA = path.join(tmpDir, "a");
  const fileB = path.join(tmpDir, "b");
  try {
    fs.writeFileSync(fileA, contentA);
    fs.writeFileSync(fileB, contentB);
    const result = spawnSync("git", ["diff", "--no-color", "--no-index", "--", fileA, fileB], {
      encoding: "utf8",
    });
    if (result.status !== 0 && result.status !== 1) {
      throw new Error(`git diff --no-index failed: ${result.stderr}`);
    }
    return result.stdout;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export type FileDriftStatus = "no-drift" | "upstream-changed" | "removed-upstream";

export interface FileComparison {
  relPath: string;
  status: FileDriftStatus;
  upstreamDiff: string;
  localDiff: string;
}

export function compareFile(
  relPath: string,
  baselineContent: string,
  upstreamContent: string | null,
  localContent: string | null
): FileComparison {
  const localDiff =
    localContent === null
      ? "(file missing locally)"
      : localContent !== baselineContent
        ? diffContent(baselineContent, localContent)
        : "";

  if (upstreamContent === null) {
    return {
      relPath,
      status: "removed-upstream",
      upstreamDiff: "(file no longer exists upstream)",
      localDiff,
    };
  }

  const upstreamDiff =
    upstreamContent !== baselineContent ? diffContent(baselineContent, upstreamContent) : "";

  return {
    relPath,
    status: upstreamDiff !== "" ? "upstream-changed" : "no-drift",
    upstreamDiff,
    localDiff,
  };
}

export interface SkillReport {
  skillName: string;
  files: FileComparison[];
}

export function formatSkillReport(report: SkillReport): string {
  const upstreamCount = report.files.filter((f) => f.upstreamDiff !== "").length;
  const localCount = report.files.filter((f) => f.localDiff !== "").length;

  const lines: string[] = [];
  if (upstreamCount === 0 && localCount === 0) {
    lines.push(`${report.skillName}: no drift (${report.files.length} files checked)`);
  } else {
    lines.push(
      `${report.skillName}: ${upstreamCount} file(s) changed upstream, ${localCount} locally diverged`
    );
  }

  for (const file of report.files) {
    if (file.upstreamDiff === "" && file.localDiff === "") {
      continue;
    }
    lines.push(`  -- ${file.relPath} --`);
    if (file.upstreamDiff !== "") {
      lines.push("  upstream diff:");
      lines.push(file.upstreamDiff);
    }
    if (file.localDiff !== "") {
      lines.push("  local divergence:");
      lines.push(file.localDiff);
    }
  }

  return lines.join("\n");
}

export const BASELINE_SHA = "a6418858b5374c2506d1ff799b2dcb418bff53d1";

export const VENDORED_SKILLS: string[] = [
  "brainstorming",
  "dispatching-parallel-agents",
  "executing-plans",
  "finishing-a-development-branch",
  "receiving-code-review",
  "requesting-code-review",
  "subagent-driven-development",
  "systematic-debugging",
  "test-driven-development",
  "using-git-worktrees",
  "using-superpowers",
  "verification-before-completion",
  "writing-plans",
  "writing-skills",
];

export function checkSkill(name: string, upstreamSkillsDir: string): SkillReport {
  // The baseline lives at BASELINE_SHA, a frozen historical commit where every
  // vendored skill was still under the `vendored-<name>` folder name — renaming
  // the current working tree's folders (2026-09-04, dropping the prefix once
  // the clean frontmatter `name:` override was live-confirmed) does not rewrite
  // git history, so this path must stay `vendored-${name}` forever regardless
  // of where the skill lives today.
  const baselineRelDir = `skills/vendored-${name}`;
  // The local working tree, by contrast, reflects the current (renamed) layout.
  const localRelDir = `skills/${name}`;
  const relFiles = listBaselineFiles(BASELINE_SHA, baselineRelDir);
  const files = relFiles.map((relFile) => {
    const baselineContent = readGitBlob(BASELINE_SHA, `${baselineRelDir}/${relFile}`);
    if (baselineContent === null) {
      throw new Error(
        `internal error: ${baselineRelDir}/${relFile} was listed by listBaselineFiles but readGitBlob returned null`
      );
    }
    const upstreamContent = readFileIfExists(path.join(upstreamSkillsDir, name, relFile));
    const localContent = readFileIfExists(path.join(localRelDir, relFile));
    return compareFile(relFile, baselineContent, upstreamContent, localContent);
  });
  return { skillName: name, files };
}

export function main(): void {
  let upstreamSkillsDir: string;
  try {
    upstreamSkillsDir = cloneUpstreamSkillsDir();
  } catch (err) {
    console.error(`Cannot check for upstream drift: ${(err as Error).message}`);
    process.exit(1);
  }

  console.log(`Checking ${VENDORED_SKILLS.length} vendored skills against baseline ${BASELINE_SHA.slice(0, 7)}`);
  console.log(`Upstream: ${upstreamSkillsDir}\n`);

  try {
    let anyDrift = false;
    for (const name of VENDORED_SKILLS) {
      let report: SkillReport;
      try {
        report = checkSkill(name, upstreamSkillsDir);
      } catch (err) {
        console.error(
          `Cannot read baseline commit ${BASELINE_SHA} for "${name}": ${(err as Error).message}\n` +
            `This usually means DigiSmith's git history changed since this SHA was recorded. ` +
            `Fix the baseline SHA in vendored/PROVENANCE.md and BASELINE_SHA in this script.`
        );
        process.exit(1);
      }
      if (report.files.some((f) => f.upstreamDiff !== "")) {
        anyDrift = true;
      }
      console.log(formatSkillReport(report));
      console.log("");
    }

    if (!anyDrift) {
      console.log("No upstream drift detected across any vendored skill.");
    }
  } finally {
    fs.rmSync(path.dirname(upstreamSkillsDir), { recursive: true, force: true });
  }
}

// import.meta.filename (stable in Node >=21.2) is this file's own absolute
// path; process.argv[1] is the script Node was invoked with. Equal only
// when this file is run directly, not when imported (e.g. by the test file).
if (import.meta.filename === process.argv[1]) {
  main();
}
