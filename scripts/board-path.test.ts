import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  BOARD_DIR_PATH,
  slugify,
  buildFolderName,
  boardRelPath,
  parseFolderName,
  boardRelPathForSlug,
  findBoardFolderBySlug,
} from "./board-path.ts";

describe("slugify", () => {
  it("lowercases, drops filler words, and hyphenates", () => {
    expect(slugify("Fix Cart Drawer Padding")).toBe("fix-cart-drawer-padding");
  });

  it("drops filler words wherever they sit, including mid-title", () => {
    expect(slugify("Paidy tooltip on JP PDP")).toBe("paidy-tooltip-jp-pdp");
  });

  it("is deterministic across repeated calls", () => {
    const title = "Ticket-based naming: modify the code and move the files";
    expect(slugify(title)).toBe(slugify(title));
  });

  it("spends the ~40-character budget on the original word sequence, fillers included, then drops fillers from what survives", () => {
    // jira-intake's own worked example (skills/jira-intake/SKILL.md, Step 3.1). "checkout" alone
    // would still fit a filler-dropped budget (39 chars), so the budget must be spent before
    // fillers are dropped for this example to land where it does.
    expect(slugify("Fix cart drawer padding on mobile checkout")).toBe("fix-cart-drawer-padding-mobile");
  });

  it("never leaves a trailing filler word when one would otherwise land at the truncation boundary", () => {
    // "to" is the last word the 40-char budget admits (cumulative length 28); the next word
    // would push it to 44 and is excluded. Without dropping fillers *after* truncation, "to"
    // would be the trailing word in the output — it must not be.
    const title = "alpha bravo charlie delta to fourteenchars12";
    expect(slugify(title)).toBe("alpha-bravo-charlie-delta");
  });

  it("collapses non-alphanumeric runs to a single hyphen", () => {
    expect(slugify("Theme --- access_token!! setup")).toBe("theme-access-token-setup");
  });
});

describe("buildFolderName", () => {
  it("uppercases the key and joins with an em dash (U+2014)", () => {
    expect(buildFolderName("dgs-159", "Fix cart drawer padding")).toBe(
      "DGS-159—fix-cart-drawer-padding",
    );
  });

  it("round-trips through parseFolderName", () => {
    const name = buildFolderName("dgs-158", "Ticket-based naming architecture");
    expect(parseFolderName(name)).toEqual({ key: "DGS-158", slug: "ticket-based-naming-architecture" });
  });

  it("throws rather than building a trailing-dash folder name when the title has no slug-able content", () => {
    // Non-ASCII only: slugify drops every character (none are a-z0-9), leaving an empty slug.
    expect(() => buildFolderName("dgs-1", "モバイル")).toThrow(
      "cannot build a board folder name: title has no slug-able content",
    );
  });

  it("throws when the title is entirely filler words", () => {
    expect(() => buildFolderName("dgs-1", "To Of For")).toThrow(
      "cannot build a board folder name: title has no slug-able content",
    );
  });
});

describe("boardRelPath", () => {
  it("joins the board dir with the built folder name", () => {
    expect(boardRelPath("DGS-159", "Fix cart drawer padding")).toBe(
      `${BOARD_DIR_PATH}/DGS-159—fix-cart-drawer-padding`,
    );
  });
});

describe("parseFolderName", () => {
  it("splits at the em dash and uppercases the key", () => {
    expect(parseFolderName("dgs-159—ticket-based-naming")).toEqual({
      key: "DGS-159",
      slug: "ticket-based-naming",
    });
  });

  it("splits at the first em dash when more than one is present", () => {
    // slugify can never itself produce U+2014, but parse defends against it anyway — first
    // occurrence wins, matching the design's own "unambiguous" rationale.
    expect(parseFolderName("DGS-1—slug—with-another-dash")).toEqual({
      key: "DGS-1",
      slug: "slug—with-another-dash",
    });
  });

  it("fails loudly on a plain hyphen substituted for the em dash", () => {
    expect(() => parseFolderName("DGS-159-ticket-based-naming")).toThrow(
      "no em dash (U+2014) found",
    );
  });

  it("fails loudly on an en dash substituted for the em dash", () => {
    expect(() => parseFolderName("DGS-159–ticket-based-naming")).toThrow(
      "no em dash (U+2014) found",
    );
  });

  it("rejects a key that isn't <PREFIX>-<number>", () => {
    expect(() => parseFolderName("not-a-key—some-slug")).toThrow(
      "key part is not <PREFIX>-<number>",
    );
  });

  it("matches a key case-insensitively", () => {
    expect(parseFolderName("dgs-1—slug").key).toBe("DGS-1");
    expect(parseFolderName("DGS-1—slug").key).toBe("DGS-1");
  });
});

describe("boardRelPathForSlug", () => {
  it("joins a known key and slug without re-slugifying", () => {
    expect(boardRelPathForSlug("DGS-161", "plugin-update-after-merge")).toBe(
      `${BOARD_DIR_PATH}/DGS-161—plugin-update-after-merge`,
    );
  });

  it("uppercases the key, matching buildFolderName", () => {
    expect(boardRelPathForSlug("dgs-161", "plugin-update-after-merge")).toBe(
      `${BOARD_DIR_PATH}/DGS-161—plugin-update-after-merge`,
    );
  });
});

describe("findBoardFolderBySlug", () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-board-path-test-"));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeBoardFolder(name: string): void {
    fs.mkdirSync(path.join(tmpDir, ...BOARD_DIR_PATH.split("/"), name), { recursive: true });
  }

  it("finds a keyed folder by slug alone, regardless of the key", () => {
    // Matches DigiSmith's own repo today: branch "plugin-update-after-merge" (no key) against
    // folder "DGS-161—plugin-update-after-merge" (keyed) — the slug is the only shared value.
    makeBoardFolder("DGS-161—plugin-update-after-merge");
    expect(findBoardFolderBySlug("plugin-update-after-merge", tmpDir)).toBe(
      "DGS-161—plugin-update-after-merge",
    );
  });

  it("returns undefined when no folder matches the slug", () => {
    makeBoardFolder("DGS-161—plugin-update-after-merge");
    expect(findBoardFolderBySlug("some-other-slug", tmpDir)).toBeUndefined();
  });

  it("returns undefined when .digismith/board/ doesn't exist at all", () => {
    expect(findBoardFolderBySlug("anything", tmpDir)).toBeUndefined();
  });

  it("skips a non-board-shaped folder name instead of throwing", () => {
    makeBoardFolder("not-a-board-folder-at-all");
    makeBoardFolder("DGS-1—real-ticket");
    expect(findBoardFolderBySlug("real-ticket", tmpDir)).toBe("DGS-1—real-ticket");
  });

  it("returns the first match in sorted order when two folders share a slug", () => {
    // readdir's own order is not defined — sorting first makes this deterministic regardless.
    // Lexicographically, "DGS-10—..." sorts before "DGS-2—..." ('1' < '2' at the fifth byte).
    makeBoardFolder("DGS-2—shared-slug");
    makeBoardFolder("DGS-10—shared-slug");
    expect(findBoardFolderBySlug("shared-slug", tmpDir)).toBe("DGS-10—shared-slug");
  });
});

const SCRIPT_PATH = fileURLToPath(new URL("./board-path.ts", import.meta.url));

function real(p: string): string {
  return fs.realpathSync.native(p);
}

function git(cwd: string, ...args: string[]) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

function initRepo(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "Test");
  fs.writeFileSync(path.join(dir, "README.md"), "base\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "base commit");
}

function runCli(cwd: string, ...args: string[]) {
  return spawnSync("node", ["--experimental-strip-types", SCRIPT_PATH, ...args], { cwd, encoding: "utf8" });
}

describe("CLI", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-board-path-cli-test-"));
    process.env.GIT_CEILING_DIRECTORIES = real(path.dirname(tmpDir));
    initRepo(tmpDir);
  });

  afterEach(() => {
    delete process.env.GIT_CEILING_DIRECTORIES;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("--action path", () => {
    it("prints boardRelPath's result given --key and --title, with a real em dash", () => {
      const result = runCli(tmpDir, "--action", "path", "--key", "dgs-159", "--title", "Fix cart drawer padding");
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe(`${BOARD_DIR_PATH}/DGS-159—fix-cart-drawer-padding`);
    });

    it("prints boardRelPathForSlug's result given --key and --slug, without re-slugifying", () => {
      const result = runCli(tmpDir, "--action", "path", "--key", "dgs-161", "--slug", "plugin-update-after-merge");
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe(`${BOARD_DIR_PATH}/DGS-161—plugin-update-after-merge`);
    });

    it("fails loudly on an empty-slug title, matching buildFolderName", () => {
      const result = runCli(tmpDir, "--action", "path", "--key", "dgs-1", "--title", "To Of For");
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("cannot build a board folder name");
    });
  });

  describe("--action find", () => {
    it("prints the matching folder name when one exists, regardless of key", () => {
      fs.mkdirSync(path.join(tmpDir, ...BOARD_DIR_PATH.split("/"), "DGS-161—plugin-update-after-merge"), { recursive: true });
      const result = runCli(tmpDir, "--action", "find", "--slug", "plugin-update-after-merge");
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("DGS-161—plugin-update-after-merge");
    });

    it("prints nothing and exits 0 when no folder matches the slug", () => {
      const result = runCli(tmpDir, "--action", "find", "--slug", "nothing-here");
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("");
    });

    it("uses --root directly when given, bypassing git entirely", () => {
      const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-board-path-root-test-"));
      const nonGitCwd = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-board-path-nongit-test-"));
      try {
        fs.mkdirSync(path.join(rootDir, ...BOARD_DIR_PATH.split("/"), "DGS-5—root-override"), { recursive: true });

        const result = runCli(nonGitCwd, "--action", "find", "--slug", "root-override", "--root", rootDir);

        expect(result.status).toBe(0);
        expect(result.stdout.trim()).toBe("DGS-5—root-override");
      } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
        fs.rmSync(nonGitCwd, { recursive: true, force: true });
      }
    });

    it("finds a board folder that exists only in the current worktree, not the main checkout — the exact DGS-161 case", () => {
      const worktreeDir = path.join(os.tmpdir(), `digismith-board-path-worktree-${process.pid}-${Date.now()}`);
      git(tmpDir, "worktree", "add", "-q", "-b", "feature", worktreeDir);
      try {
        fs.mkdirSync(path.join(worktreeDir, ...BOARD_DIR_PATH.split("/"), "DGS-9—only-in-worktree"), { recursive: true });

        const foundInWorktree = runCli(worktreeDir, "--action", "find", "--slug", "only-in-worktree");
        expect(foundInWorktree.status).toBe(0);
        expect(foundInWorktree.stdout.trim()).toBe("DGS-9—only-in-worktree");

        const foundInMainCheckout = runCli(tmpDir, "--action", "find", "--slug", "only-in-worktree");
        expect(foundInMainCheckout.status).toBe(0);
        expect(foundInMainCheckout.stdout.trim()).toBe("");
      } finally {
        // Always remove the worktree, even if an assertion above throws — otherwise a failing
        // run leaks a full git checkout under the OS temp dir, and a dangling worktree
        // registration against `tmpDir` once afterEach deletes it.
        git(tmpDir, "worktree", "remove", "-f", worktreeDir);
      }
    });
  });

  describe("--action parse", () => {
    it("prints the key then the slug on two lines", () => {
      const result = runCli(tmpDir, "--action", "parse", "--name", "DGS-159—fix-cart-drawer-padding");
      expect(result.status).toBe(0);
      expect(result.stdout.trim().split(/\r?\n/)).toEqual(["DGS-159", "fix-cart-drawer-padding"]);
    });

    it("fails loudly on a name with no em dash", () => {
      const result = runCli(tmpDir, "--action", "parse", "--name", "DGS-159-fix-cart-drawer-padding");
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("no em dash (U+2014) found");
    });
  });

  it("fails loudly on an unknown action", () => {
    const result = runCli(tmpDir, "--action", "bogus");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('unknown --action "bogus"');
  });
});
