import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkRewriteGuards, rewriteHistoryLinks } from "./rewrite-history-links.ts";

const BLOB = "https://github.com/Jazurite/DigiSmith/blob/abc123";

function repoWith(files: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rewrite-links-"));
  spawnSync("git", ["init", "-q"], { cwd: dir });
  spawnSync("git", ["config", "user.email", "t@e.x"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "T"], { cwd: dir });
  for (const f of files) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), "x");
  }
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-q", "-m", "c"], { cwd: dir });
  return dir;
}

describe("rewriteHistoryLinks", () => {
  it("turns docs, board and ../backlog hrefs into encoded permalinks and leaves the rest alone", () => {
    const dir = repoWith([
      ".digismith/docs/a/plan.md",
      ".digismith/board/DGS-1—x/report.html",
      "backlog/b.md",
    ]);
    try {
      const html = [
        '<a href="docs/a/plan.md">p</a>',
        '<a href="board/DGS-1%E2%80%94x/report.html#s">r</a>',
        '<a href="../backlog/b.md">b</a>',
        '<a href="#top">t</a>',
        '<a href="https://example.test/">e</a>',
      ].join("\n");

      const out = rewriteHistoryLinks(html, { blobBase: BLOB, cwd: dir, sha: "HEAD", renames: [] });

      expect(out.html).toBe(
        [
          `<a href="${BLOB}/.digismith/docs/a/plan.md">p</a>`,
          `<a href="${BLOB}/.digismith/board/DGS-1%E2%80%94x/report.html#s">r</a>`,
          `<a href="${BLOB}/backlog/b.md">b</a>`,
          '<a href="#top">t</a>',
          '<a href="https://example.test/">e</a>',
        ].join("\n"),
      );
      expect(out.fixed).toEqual([]);
      expect(out.dead).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fixes a dead href through a rename and lists it; reports one that stays dead", () => {
    const dir = repoWith([".digismith/docs/A/A.1/lh/plan.md"]);
    try {
      const html = '<a href="docs/A/A.0/lh/plan.md">p</a><a href="docs/gone/plan.md">g</a>';

      const out = rewriteHistoryLinks(html, {
        blobBase: BLOB,
        cwd: dir,
        sha: "HEAD",
        renames: [["docs/A/A.0/", "docs/A/A.1/"]],
      });

      expect(out.html).toContain(`href="${BLOB}/.digismith/docs/A/A.1/lh/plan.md"`);
      expect(out.fixed).toEqual([{ old: "docs/A/A.0/lh/plan.md", new: `${BLOB}/.digismith/docs/A/A.1/lh/plan.md` }]);
      expect(out.dead).toEqual(["docs/gone/plan.md"]);
      expect(out.html).toContain('href="docs/gone/plan.md"');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("rewriteHistoryLinks, raw em dash", () => {
  it("rewrites an old href that carries a raw em dash", () => {
    const dir = repoWith([".digismith/board/DGS-1—x/plan.md"]);
    try {
      const out = rewriteHistoryLinks('<a href="board/DGS-1—x/plan.md">p</a>', {
        blobBase: BLOB,
        cwd: dir,
        sha: "HEAD",
        renames: [],
      });

      expect(out.html).toBe(
        '<a href="https://github.com/Jazurite/DigiSmith/blob/abc123/.digismith/board/DGS-1%E2%80%94x/plan.md">p</a>',
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

function pushedRepo(files: string[]): { dir: string; bare: string; sha: string } {
  const dir = repoWith(files);
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), "rewrite-origin-"));
  spawnSync("git", ["init", "-q", "--bare"], { cwd: bare });
  spawnSync("git", ["remote", "add", "origin", bare], { cwd: dir });
  spawnSync("git", ["push", "-q", "origin", "HEAD:refs/heads/main"], { cwd: dir });
  const sha = spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).stdout.trim();
  return { dir, bare, sha };
}

describe("checkRewriteGuards", () => {
  it("refuses a page inside the current git worktree", () => {
    const { dir, bare, sha } = pushedRepo([".digismith/history.html"]);
    try {
      expect(() => checkRewriteGuards(path.join(dir, ".digismith", "history.html"), sha, dir)).toThrow(
        "inside the git worktree",
      );
    } finally {
      for (const d of [dir, bare]) fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it("refuses a sha that is not pushed to origin", () => {
    const { dir, bare } = pushedRepo(["a.txt"]);
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "rewrite-page-"));
    try {
      fs.writeFileSync(path.join(dir, "b.txt"), "b");
      spawnSync("git", ["add", "-A"], { cwd: dir });
      spawnSync("git", ["commit", "-q", "-m", "local only"], { cwd: dir });
      const local = spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).stdout.trim();

      expect(() => checkRewriteGuards(path.join(outside, "history.html"), local, dir)).toThrow("not pushed");
    } finally {
      for (const d of [dir, bare, outside]) fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it("passes for a page outside the worktree and a pushed sha", () => {
    const { dir, bare, sha } = pushedRepo(["a.txt"]);
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "rewrite-page-"));
    try {
      expect(() => checkRewriteGuards(path.join(outside, "history.html"), sha, dir)).not.toThrow();
    } finally {
      for (const d of [dir, bare, outside]) fs.rmSync(d, { recursive: true, force: true });
    }
  });
});

describe("rewrite-history-links CLI", () => {
  it("exits non-zero and names every link that stays relative", () => {
    const { dir, bare, sha } = pushedRepo([".digismith/docs/a/plan.md"]);
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "rewrite-page-"));
    try {
      const page = path.join(outside, "history.html");
      fs.writeFileSync(page, '<a href="docs/a/plan.md">p</a><a href="docs/missing/plan.md">m</a>');
      const script = fileURLToPath(new URL("./rewrite-history-links.ts", import.meta.url));

      const result = spawnSync(
        "node",
        ["--experimental-strip-types", script, "--page", page, "--sha", sha, "--blob-base", BLOB],
        { cwd: dir, encoding: "utf8" },
      );

      expect(result.status).not.toBe(0);
      expect(result.stdout).toContain("DEAD docs/missing/plan.md");
      expect(fs.readFileSync(page, "utf8")).toContain(`href="${BLOB}/.digismith/docs/a/plan.md"`);
    } finally {
      for (const d of [dir, bare, outside]) fs.rmSync(d, { recursive: true, force: true });
    }
  });
});
