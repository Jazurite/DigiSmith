import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(new URL("./commit-msg", import.meta.url));

function runHook(dir: string, message: string) {
  const msgFile = path.join(dir, "COMMIT_EDITMSG");
  fs.writeFileSync(msgFile, message);
  return spawnSync("bash", [SCRIPT_PATH, msgFile], { cwd: dir, encoding: "utf8" });
}

describe("commit-msg hook", () => {
  it("blocks a message carrying a Co-Authored-By Claude trailer", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-commit-msg-"));
    try {
      const result = runHook(dir, "docs: fix a typo\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n");

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("AI attribution found in commit message");
      expect(result.stderr).toContain("This repo forbids AI/assistant attribution anywhere — no exceptions.");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blocks a message carrying the robot emoji alongside a matching phrase", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-commit-msg-"));
    try {
      const result = runHook(dir, "docs: fix a typo\n\n🤖 Generated with Claude Code\n");

      expect(result.status).toBe(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blocks a message carrying only the robot emoji, under the locale git hooks actually run with", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-commit-msg-"));
    try {
      const msgFile = path.join(dir, "COMMIT_EDITMSG");
      fs.writeFileSync(msgFile, "docs: fix a typo\n\n🤖\n");
      const result = spawnSync("bash", [SCRIPT_PATH, msgFile], {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, LC_ALL: "C.UTF-8" },
      });

      expect(result.status).toBe(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("allows a clean message through", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-commit-msg-"));
    try {
      const result = runHook(dir, "docs: fix a typo\n");

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("allows a descriptive mention of Claude Code with no attribution phrase", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-commit-msg-"));
    try {
      const result = runHook(dir, "docs: document the Claude Code CLI usage\n");

      expect(result.status).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blocks a message with attribution above a verbose-mode scissors line", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-commit-msg-"));
    try {
      const result = runHook(
        dir,
        "docs: fix a typo\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n" +
          "# ------------------------ >8 ------------------------\n" +
          "# Changes to be committed:\n#\tmodified:   f.txt\n",
      );

      expect(result.status).toBe(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("allows a clean message even when the verbose-mode diff below the scissors line contains attribution-looking text", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-commit-msg-"));
    try {
      const result = runHook(
        dir,
        "docs: fix a typo\n" +
          "# ------------------------ >8 ------------------------\n" +
          "diff --git a/MEMORY.md b/MEMORY.md\n" +
          "+Co-Authored-By: Claude <noreply@anthropic.com>\n",
      );

      expect(result.status).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
