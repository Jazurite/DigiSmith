import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { rewriteHistoryLinks } from "./rewrite-history-links.ts";

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
