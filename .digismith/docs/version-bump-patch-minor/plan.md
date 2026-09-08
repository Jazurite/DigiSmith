# Version-Bump Patch/Minor Distinction (W.4.1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `bump-plugin-version.ts` distinguish a patch-worthy version bump (every commit since the base is a conventional `fix(...)`) from a minor-worthy one, instead of always bumping minor.

**Architecture:** A new `bumpTypeSince` function inspects the commit range's subjects via `git log`; `computeNextVersion` gains a `bumpType` parameter (defaulting to today's exact minor-bump behavior); `main()` wires the two together only when `--base` is supplied.

**Tech Stack:** TypeScript (Node's `--experimental-strip-types`), Vitest, real git fixtures in tests (no mocking, matching this file's existing style).

## Global Constraints

- Full spec: `.digismith/docs/version-bump-patch-minor/design.html` — read it if anything below is ambiguous.
- Target file: `.digismith/hooks/post-finish/scripts/bump-plugin-version.ts`, sibling test file `.digismith/hooks/post-finish/scripts/bump-plugin-version.test.ts`.
- Test command for this repo: `pnpm test` (runs `vitest run`).
- Fix-commit regex: `/^fix(\([^)]*\))?:/` — anchored at the start, so `fix:` and `fix(scope):` and `fix(scope1,scope2):` all match, while `fixup!: ...` (git's own fixup-commit marker) does not.
- `computeNextVersion`'s default `bumpType` ("minor") must remain byte-for-byte identical to its current behavior — every existing test in this file must keep passing unchanged with no modification to those existing tests.
- Major-version bumps are out of scope — DigiSmith stays at major `0` through beta; nothing in this plan touches that.
- Commit messages: title only, no body, no AI references (this repo's standing convention).
- This is DigiSmith's own self-development. Multiple other Claude Code sessions may be concurrently active on this same repo/checkout — before any file edit that uses an exact "find" substring against a shared doc (`MEMORY.md`, `backlog/README.md`, `backlog/check-vendored-skills-hardening.md`), verify the substring still matches what's actually in the file; if it doesn't, stop and report rather than guessing at a fuzzy replacement.

---

### Task 1: `bumpTypeSince`, `computeNextVersion`'s new parameter, and `main()` wiring

**Files:**
- Modify: `.digismith/hooks/post-finish/scripts/bump-plugin-version.ts`
- Modify: `.digismith/hooks/post-finish/scripts/bump-plugin-version.test.ts`

**Interfaces:**
- Produces: `bumpTypeSince(baseSha: string, cwd?: string): "patch" | "minor"` (exported), `computeNextVersion(current: string, bumpType?: "patch" | "minor"): string` (existing export, new second parameter, default `"minor"`).
- Consumes: nothing from other tasks — this task is fully self-contained.

- [ ] **Step 1: Write the failing tests**

Read the current full contents of `.digismith/hooks/post-finish/scripts/bump-plugin-version.test.ts` first (confirm it still matches what's expected — see the Global Constraints note on concurrent sessions). Then add a `commitMessage` helper and a new `describe("bumpTypeSince", ...)` block, and one new test inside the existing `describe("computeNextVersion", ...)` block.

Add this helper function right after the existing `initVersionFixtureRepo` function:

```typescript
function commitMessage(dir: string, message: string): void {
  spawnSync("git", ["commit", "--allow-empty", "-q", "-m", message], { cwd: dir });
}
```

Add `bumpTypeSince` to the existing import from `"./bump-plugin-version.ts"` (it currently imports `computeNextVersion, readPluginVersion, bumpVersionInFile, versionChangedSince` — add `bumpTypeSince` to that same list).

Add this new `describe` block anywhere after the `initVersionFixtureRepo`/`commitMessage` helper functions and before (or after) the other `describe` blocks — placement among siblings doesn't matter, this file has no ordering dependency between blocks:

```typescript
describe("bumpTypeSince", () => {
  it("returns patch when every commit since base is a conventional fix", () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-type-"));
    try {
      initVersionFixtureRepo(repoDir, "0.29.0-beta");
      const baseSha = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoDir, encoding: "utf8" }).stdout.trim();
      commitMessage(repoDir, "fix(hooks): flush superseded plugin cache versions on reinstall");
      commitMessage(repoDir, "fix(bootstrap,adopt): check Jira credentials at ticket start");

      expect(bumpTypeSince(baseSha, repoDir)).toBe("patch");
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("returns minor when a feat commit is mixed in", () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-type-"));
    try {
      initVersionFixtureRepo(repoDir, "0.29.0-beta");
      const baseSha = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoDir, encoding: "utf8" }).stdout.trim();
      commitMessage(repoDir, "fix(hooks): flush superseded plugin cache versions");
      commitMessage(repoDir, "feat(preferences): add get/set/clear CLI");

      expect(bumpTypeSince(baseSha, repoDir)).toBe("minor");
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("returns minor when a docs or chore commit is mixed in", () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-type-"));
    try {
      initVersionFixtureRepo(repoDir, "0.29.0-beta");
      const baseSha = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoDir, encoding: "utf8" }).stdout.trim();
      commitMessage(repoDir, "fix(hooks): flush superseded plugin cache versions");
      commitMessage(repoDir, "docs(backlog): record a finding");

      expect(bumpTypeSince(baseSha, repoDir)).toBe("minor");
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("returns minor for a fixup! commit, not patch", () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-type-"));
    try {
      initVersionFixtureRepo(repoDir, "0.29.0-beta");
      const baseSha = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoDir, encoding: "utf8" }).stdout.trim();
      commitMessage(repoDir, "fixup! fix(hooks): flush superseded plugin cache versions");

      expect(bumpTypeSince(baseSha, repoDir)).toBe("minor");
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("returns minor for an empty commit range", () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-type-"));
    try {
      initVersionFixtureRepo(repoDir, "0.29.0-beta");
      const baseSha = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoDir, encoding: "utf8" }).stdout.trim();

      expect(bumpTypeSince(baseSha, repoDir)).toBe("minor");
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });
});
```

Add this one new test inside the existing `describe("computeNextVersion", ...)` block (alongside its current 3 tests — do not modify those 3):

```typescript
  it("bumps only the patch field when bumpType is \"patch\"", () => {
    expect(computeNextVersion("0.29.0-beta", "patch")).toBe("0.29.1-beta");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- bump-plugin-version`
Expected: FAIL — `bumpTypeSince is not exported` (or equivalent import error) for the new `describe("bumpTypeSince", ...)` block's tests, and the new `computeNextVersion("0.29.0-beta", "patch")` test fails because the current implementation ignores its second argument and returns `"0.30.0-beta"` instead of `"0.29.1-beta"`.

- [ ] **Step 3: Implement `bumpTypeSince`**

In `.digismith/hooks/post-finish/scripts/bump-plugin-version.ts`, add this new exported function immediately after `versionChangedSince` (before the `const PLUGIN_JSON_PATH = ...` line):

```typescript
export function bumpTypeSince(baseSha: string, cwd: string = process.cwd()): "patch" | "minor" {
  const result = spawnSync("git", ["log", `${baseSha}..HEAD`, "--format=%s"], { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git log failed for ${baseSha}..HEAD: ${result.stderr}`);
  }
  const subjects = result.stdout.split("\n").filter((line) => line.length > 0);
  if (subjects.length === 0) {
    return "minor";
  }
  const fixPattern = /^fix(\([^)]*\))?:/;
  const allFix = subjects.every((subject) => fixPattern.test(subject));
  return allFix ? "patch" : "minor";
}
```

- [ ] **Step 4: Extend `computeNextVersion`**

Replace the existing `computeNextVersion` function:

```typescript
export function computeNextVersion(current: string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)(-.+)?$/.exec(current);
  if (!match) {
    throw new Error(`Cannot parse version: ${current}`);
  }
  const [, major, minor, , prerelease] = match;
  return `${major}.${Number(minor) + 1}.0${prerelease ?? ""}`;
}
```

with:

```typescript
export function computeNextVersion(current: string, bumpType: "patch" | "minor" = "minor"): string {
  const match = /^(\d+)\.(\d+)\.(\d+)(-.+)?$/.exec(current);
  if (!match) {
    throw new Error(`Cannot parse version: ${current}`);
  }
  const [, major, minor, patch, prerelease] = match;
  if (bumpType === "patch") {
    return `${major}.${minor}.${Number(patch) + 1}${prerelease ?? ""}`;
  }
  return `${major}.${Number(minor) + 1}.0${prerelease ?? ""}`;
}
```

- [ ] **Step 5: Wire `bumpTypeSince` into `main()`**

Replace this line in `main()`:

```typescript
    const nextVersion = computeNextVersion(currentVersion);
```

with:

```typescript
    const bumpType = args.base !== undefined ? bumpTypeSince(args.base) : "minor";
    const nextVersion = computeNextVersion(currentVersion, bumpType);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm test -- bump-plugin-version`
Expected: PASS — all tests green, including the 5 new `bumpTypeSince` tests and the 1 new `computeNextVersion` patch-argument test, plus every pre-existing test in this file unmodified and still passing.

- [ ] **Step 7: Run the full test suite**

Run: `pnpm test`
Expected: PASS — no regressions anywhere else in the repo (this task only touched one script and its own test file).

- [ ] **Step 8: Commit**

```bash
git add .digismith/hooks/post-finish/scripts/bump-plugin-version.ts .digismith/hooks/post-finish/scripts/bump-plugin-version.test.ts
git commit -m "feat(bump-plugin-version): distinguish patch-worthy fix-only ranges from minor"
```

---

### Task 2: Doc updates and backlog retirement

**Files:**
- Modify: `MEMORY.md` (the **W** map-item row)
- Modify: `backlog/check-vendored-skills-hardening.md` (remove the `## bump-plugin-version.ts (map item W.4.1)` section)
- Modify: `backlog/README.md` (update the pointer line for that file)

**Interfaces:** None — pure documentation, no code. Does not depend on Task 1's specific code, only on the fact that it shipped.

- [ ] **Step 1: Add a hardening note to `MEMORY.md`'s W.4.1 sentence**

In `MEMORY.md`, find this exact substring inside the **W** row:

```
See `.digismith/docs/auto-bump-plugin-version-on-merge/design.html` · **W.5** built 2026-09-04:
```

Replace it with:

```
See `.digismith/docs/auto-bump-plugin-version-on-merge/design.html`. Hardened 2026-09-08: `computeNextVersion` now distinguishes patch-worthy ranges (every commit since the base is a conventional `fix(...)`) from minor-worthy ones via a new `bumpTypeSince` helper, after a real live miss (3 `fix(...)` commits bumped as minor instead of patch, corrected by hand to `0.29.1-beta`) — see `.digismith/docs/version-bump-patch-minor/design.html` · **W.5** built 2026-09-04:
```

Do not touch any other part of the **W** row.

- [ ] **Step 2: Remove the superseded backlog section**

In `backlog/check-vendored-skills-hardening.md`, this file currently has two `##`-level sections: `` ## `check_vendored_skills.ts` (map item W.2) `` (starts near the top of the file) and `` ## `bump-plugin-version.ts` (map item W.4.1) `` (the entire remainder of the file, running to end-of-file). Confirm this structure first — read the file and find the line number where `` ## `bump-plugin-version.ts` (map item W.4.1) `` starts and confirm it runs to the last line of the file with nothing after it.

Delete that entire section — from the blank line immediately preceding `` ## `bump-plugin-version.ts` (map item W.4.1) `` through the end of the file — leaving the file ending right after the `` ## `check_vendored_skills.ts` (map item W.2) `` section's own final line (currently: "the next time this file is touched (e.g. during W.3's call-site cutover or W.4's first real activation), not on its own."). Do not touch the `` ## `check_vendored_skills.ts` (map item W.2) `` section in any way.

- [ ] **Step 3: Update `backlog/README.md`'s pointer line**

Find this exact line in `backlog/README.md`:

```
- [Primitive-ownership (W) script hardening backlog](check-vendored-skills-hardening.md) — `check_vendored_skills.ts` (W.2): 8 deferred minors from its final review; `bump-plugin-version.ts` (W.4.1): no fix/feat patch/minor distinction, caught live when 3 fix commits got bumped as minor; none reachable today
```

Replace it with:

```
- [`check_vendored_skills.ts` hardening (map item W.2)](check-vendored-skills-hardening.md) — 8 deferred minors from its final review; none reachable today
```

- [ ] **Step 4: Run the full test suite once more**

Run: `pnpm test`
Expected: PASS — this task touched no code, so the full suite should still be fully green with the same pass count as Task 1's own Step 7.

- [ ] **Step 5: Commit**

```bash
git add MEMORY.md backlog/check-vendored-skills-hardening.md backlog/README.md
git commit -m "docs(W.4.1): record patch/minor hardening, retire superseded backlog section"
```
