# DigiSmith Lifecycle Hooks (Y) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build DigiSmith's first general lifecycle-hook mechanism (map item Y): a `post-finish` point fired from `finishing-a-development-branch`'s Option 1, with two stock hooks — a retrofit of W.4.1's version-bump and a new plugin-cache-reinstall hook that closes the stale-cache gap discovered during W.4.1's own finish step.

**Architecture:** A hook is a markdown instructions file using the exact same template as a `SKILL.md` (frontmatter + body), executed by the agent the same way a skill is, but fired automatically rather than matched by description. Hook files live in `.digismith/hooks/<point>/`, one flat file per hook, filename-ordered. A single shared reference doc (`skills/finishing-a-development-branch/fire-lifecycle-hook.md`) holds the enumerate-and-follow procedure once, point-agnostic, so a future second lifecycle point in another skill can reuse it. `finishing-a-development-branch`'s Option 1 fires `post-finish` as its final step, after merge, push, and worktree cleanup all complete.

**Tech Stack:** Markdown (hook files, firing doc), TypeScript (the relocated `bump-plugin-version.ts`, unchanged logic), Vitest, Bash (skill/hook bodies).

## Global Constraints

- Full spec: `.digismith/docs/lifecycle-hooks/design.html` — read it if anything below is ambiguous.
- Test command for this repo: `pnpm test` (runs `vitest run`). No custom Vitest config exists — default recursive `*.test.ts` discovery picks up test files anywhere in the repo, including under `.digismith/`.
- Lifecycle points: `post-finish` only. No other point is implemented in this plan.
- `post-finish` is fired only from Option 1 ("Merge Locally") today — Options 2 and 3 are untouched.
- Hook file format: same YAML frontmatter (`name:`, `description:`) + body template as a `SKILL.md`. The `description:` field is documentation only — nothing matches against it; a hook fires because it's present in the right folder.
- Each hook file is self-contained: it names its own gate condition inline (e.g. the `IS_DIGISMITH` check). The firing mechanism itself performs no gating — it only checks whether hook files exist.
- Registry: `.digismith/hooks/<point>/` — one flat `.md` file per hook, no separate config file. Multiple hooks sharing a point fire in filename sort order.
- A hook's backing scripts (if any) live in a `scripts/` subfolder next to the point's own folder (e.g. `.digismith/hooks/post-finish/scripts/`), mirroring the existing `skills/subagent-driven-development/scripts/` convention.
- The firing-procedure reference doc lives at `skills/finishing-a-development-branch/SKILL.md`'s sibling file `fire-lifecycle-hook.md` (not a new top-level shared convention), since only one skill needs it in this plan.
- Both stock hooks gate on the same DigiSmith-repo check already established: `<MAIN_ROOT>/.claude-plugin/plugin.json` exists and contains the literal substring `"name": "digismith"`.
- The version-bump hook fires after Option 1's own push already happened, so it makes its own commit *and* its own push (a small second push) — it can no longer ride along in Option 1's push the way it did before this plan.
- Commit messages: title only, no body, no AI references (this repo's standing convention).
- This is DigiSmith's own self-development. Multiple other Claude Code sessions may be concurrently active on this same repo/checkout — before any file edit that uses an exact "find" substring against a shared doc (`MEMORY.md`, `vendored/PROVENANCE.md`, `backlog/README.md`), verify the substring still matches what's actually in the file; if it doesn't, stop and report rather than guessing at a fuzzy replacement.

---

### Task 1: Relocate `bump-plugin-version.ts` under the new hooks convention

**Files:**
- Create: `.digismith/hooks/post-finish/scripts/bump-plugin-version.ts`
- Create: `.digismith/hooks/post-finish/scripts/bump-plugin-version.test.ts`
- Delete: `scripts/bump-plugin-version.ts`
- Delete: `scripts/bump-plugin-version.test.ts`

**Interfaces:**
- Produces (unchanged, just relocated): `computeNextVersion(current: string): string`, `readPluginVersion(pluginJsonPath: string): string`, `bumpVersionInFile(filePath: string, nextVersion: string): void`, `versionChangedSince(baseSha: string, pluginJsonRelPath: string, cwd?: string): boolean`, `main(): void` — all exported. Task 2's `01-version-bump.md` invokes this file directly as a CLI (`node --experimental-strip-types .digismith/hooks/post-finish/scripts/bump-plugin-version.ts --base <sha>`); nothing imports it as a module.

- [ ] **Step 1: Write the relocated implementation**

Create `.digismith/hooks/post-finish/scripts/bump-plugin-version.ts` — identical to the current `scripts/bump-plugin-version.ts` except the import path (four directories up to reach the repo-root `scripts/` folder, verified with `node -e "console.log(require('path').relative('.digismith/hooks/post-finish/scripts', 'scripts/cli-args.ts'))"` → `../../../../scripts/cli-args.ts`):

```typescript
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs } from "../../../../scripts/cli-args.ts";

export function computeNextVersion(current: string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)(-.+)?$/.exec(current);
  if (!match) {
    throw new Error(`Cannot parse version: ${current}`);
  }
  const [, major, minor, , prerelease] = match;
  return `${major}.${Number(minor) + 1}.0${prerelease ?? ""}`;
}

export function readPluginVersion(pluginJsonPath: string): string {
  const content = fs.readFileSync(pluginJsonPath, "utf8");
  const parsed = JSON.parse(content) as { version?: string };
  if (typeof parsed.version !== "string") {
    throw new Error(`No "version" field found in ${pluginJsonPath}`);
  }
  return parsed.version;
}

export function bumpVersionInFile(filePath: string, nextVersion: string): void {
  const content = fs.readFileSync(filePath, "utf8");
  const updated = content.replace(/"version":\s*"[^"]+"/, `"version": "${nextVersion}"`);
  if (updated === content) {
    throw new Error(`No "version" field found to replace in ${filePath}`);
  }
  fs.writeFileSync(filePath, updated);
}

export function versionChangedSince(
  baseSha: string,
  pluginJsonRelPath: string,
  cwd: string = process.cwd(),
): boolean {
  const result = spawnSync("git", ["show", `${baseSha}:${pluginJsonRelPath}`], { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git show failed for ${baseSha}:${pluginJsonRelPath}: ${result.stderr}`);
  }
  const parsed = JSON.parse(result.stdout) as { version?: string };
  if (typeof parsed.version !== "string") {
    throw new Error(`No "version" field found at ${baseSha}:${pluginJsonRelPath}`);
  }
  const currentVersion = readPluginVersion(path.join(cwd, pluginJsonRelPath));
  return parsed.version !== currentVersion;
}

const PLUGIN_JSON_PATH = ".claude-plugin/plugin.json";
const MARKETPLACE_JSON_PATH = ".claude-plugin/marketplace.json";

export function main(): void {
  const args = parseArgs(process.argv.slice(2));

  try {
    const currentVersion = readPluginVersion(PLUGIN_JSON_PATH);

    if (args.base !== undefined && versionChangedSince(args.base, PLUGIN_JSON_PATH)) {
      console.log(`SKIPPED already changed by incoming branch (current: ${currentVersion})`);
      return;
    }

    const nextVersion = computeNextVersion(currentVersion);
    bumpVersionInFile(PLUGIN_JSON_PATH, nextVersion);
    bumpVersionInFile(MARKETPLACE_JSON_PATH, nextVersion);
    console.log(`BUMPED ${currentVersion} -> ${nextVersion}`);
  } catch (err) {
    console.error(`Cannot bump plugin version: ${(err as Error).message}`);
    process.exit(1);
  }
}

if (import.meta.filename === process.argv[1]) {
  main();
}
```

- [ ] **Step 2: Write the relocated test file**

Create `.digismith/hooks/post-finish/scripts/bump-plugin-version.test.ts` — byte-identical to the current `scripts/bump-plugin-version.test.ts` (its own import, `from "./bump-plugin-version.ts"`, is a same-directory relative import and needs no change since both files move together):

```typescript
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import {
  computeNextVersion,
  readPluginVersion,
  bumpVersionInFile,
  versionChangedSince,
} from "./bump-plugin-version.ts";

function initVersionFixtureRepo(dir: string, version: string): void {
  fs.writeFileSync(path.join(dir, "plugin.json"), JSON.stringify({ name: "digismith", version }));
  spawnSync("git", ["init", "-q"], { cwd: dir });
  spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "Test"], { cwd: dir });
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-q", "-m", "fixture commit"], { cwd: dir });
}

describe("computeNextVersion", () => {
  it("increments the minor field by 1 and resets patch to 0, keeping the prerelease suffix", () => {
    expect(computeNextVersion("0.23.0-beta")).toBe("0.24.0-beta");
  });

  it("handles a version with no prerelease suffix", () => {
    expect(computeNextVersion("1.2.3")).toBe("1.3.0");
  });

  it("throws a clear error for a malformed version string", () => {
    expect(() => computeNextVersion("not-a-version")).toThrow("Cannot parse version");
  });
});

describe("readPluginVersion", () => {
  it("reads the version field from a plugin.json-shaped file", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-test-"));
    const tmpFile = path.join(tmpDir, "plugin.json");
    fs.writeFileSync(tmpFile, JSON.stringify({ name: "digismith", version: "0.5.0-beta" }));

    expect(readPluginVersion(tmpFile)).toBe("0.5.0-beta");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws a clear error when the version field is missing", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-test-"));
    const tmpFile = path.join(tmpDir, "plugin.json");
    fs.writeFileSync(tmpFile, JSON.stringify({ name: "digismith" }));

    expect(() => readPluginVersion(tmpFile)).toThrow('No "version" field found');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe("bumpVersionInFile", () => {
  it("replaces the version field in place, leaving the rest of the file untouched", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-test-"));
    const tmpFile = path.join(tmpDir, "plugin.json");
    const original = '{\n  "name": "digismith",\n  "version": "0.23.0-beta",\n  "keywords": ["a"]\n}\n';
    fs.writeFileSync(tmpFile, original);

    bumpVersionInFile(tmpFile, "0.24.0-beta");

    expect(fs.readFileSync(tmpFile, "utf8")).toBe(
      '{\n  "name": "digismith",\n  "version": "0.24.0-beta",\n  "keywords": ["a"]\n}\n',
    );

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws a clear error when no version field exists to replace", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-test-"));
    const tmpFile = path.join(tmpDir, "plugin.json");
    fs.writeFileSync(tmpFile, JSON.stringify({ name: "digismith" }));

    expect(() => bumpVersionInFile(tmpFile, "0.24.0-beta")).toThrow('No "version" field found to replace');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe("versionChangedSince", () => {
  it("returns false when the version is unchanged since the base commit", () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-repo-"));
    try {
      initVersionFixtureRepo(repoDir, "0.23.0-beta");
      const baseSha = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoDir, encoding: "utf8" }).stdout.trim();

      expect(versionChangedSince(baseSha, "plugin.json", repoDir)).toBe(false);
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("returns true when the working tree's version differs from the base commit's", () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-repo-"));
    try {
      initVersionFixtureRepo(repoDir, "0.23.0-beta");
      const baseSha = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoDir, encoding: "utf8" }).stdout.trim();
      fs.writeFileSync(path.join(repoDir, "plugin.json"), JSON.stringify({ name: "digismith", version: "0.24.0-beta" }));

      expect(versionChangedSince(baseSha, "plugin.json", repoDir)).toBe(true);
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 3: Run tests at the new location to verify they pass**

Run: `pnpm test -- .digismith/hooks/post-finish/scripts/bump-plugin-version`
Expected: PASS — all 9 tests green, discovered from the new path (the old copy still exists at this point too, but this filter targets the new path specifically).

- [ ] **Step 4: Delete the old files**

```bash
git rm scripts/bump-plugin-version.ts scripts/bump-plugin-version.test.ts
```

- [ ] **Step 5: Run tests once more to confirm exactly one copy remains and passes**

Run: `pnpm test -- bump-plugin-version`
Expected: PASS — all 9 tests green, exactly one matching test file now (the old one is gone).

- [ ] **Step 6: Commit**

```bash
git add .digismith/hooks/post-finish/scripts/bump-plugin-version.ts .digismith/hooks/post-finish/scripts/bump-plugin-version.test.ts
git commit -m "refactor(bump-plugin-version): relocate under .digismith/hooks/post-finish/scripts/"
```

---

### Task 2: Write the hook files and the shared firing-mechanism doc

**Files:**
- Create: `skills/finishing-a-development-branch/fire-lifecycle-hook.md`
- Create: `.digismith/hooks/post-finish/01-version-bump.md`
- Create: `.digismith/hooks/post-finish/02-plugin-reinstall.md`

**Interfaces:**
- Consumes: Task 1's relocated `.digismith/hooks/post-finish/scripts/bump-plugin-version.ts` CLI contract (`node --experimental-strip-types .digismith/hooks/post-finish/scripts/bump-plugin-version.ts --base <sha>`, stdout starting with `BUMPED` or `SKIPPED`, exit 0 on success, exit 1 with a stderr message on failure).
- Produces: three files at the exact paths above. Task 3 references `fire-lifecycle-hook.md` by name; nothing else consumes these files' content directly (they're agent-executed prose, not code).

There is no automated test harness for prose files in this repo — verification here is a careful read-through plus the manual gate-check smoke test in Step 4 below.

- [ ] **Step 1: Write the shared firing-mechanism reference doc**

Create `skills/finishing-a-development-branch/fire-lifecycle-hook.md`:

```markdown
# Fire Lifecycle Hook

Shared procedure for firing a DigiSmith lifecycle hook at a given point. Any skill that wants
to fire hooks at a point in its own flow follows this procedure, passing just the point's name
(e.g. `post-finish`) — this doc is the only place the enumerate-and-follow logic is written, so
a future second lifecycle point in another skill can reuse it without duplicating the steps.

## Procedure

Given a point name `<point>`:

1. Check whether `.digismith/hooks/<point>/` exists in the current project (the repo root —
   the same one `.claude-plugin/plugin.json`, if present, and `.digismith/` itself live in). If
   it doesn't exist, or exists but has no `.md` files directly inside it, there is nothing to
   fire — stop here, silently. This is the normal case for most repos.
2. If it has `.md` files, list them (only the files directly inside `.digismith/hooks/<point>/`,
   not its `scripts/` subfolder or any other nested directory), sorted by filename.
3. For each file, in that sorted order: read it in full, then follow its instructions exactly
   as if invoking it as a skill. Its frontmatter (`name:`, `description:`) is documentation
   only at this point — nothing matches against it, so just execute the body.
4. If a hook's own instructions fail partway (a command exits non-zero, a gate condition it
   names isn't met), that hook's own instructions define what "failure" means and how to
   report it — this procedure doesn't impose a uniform failure contract across hooks. Continue
   to the next hook file in sorted order regardless, unless the failed hook's own instructions
   say otherwise.

## Notes

- This procedure is point-agnostic — it works identically for `post-finish` today and for any
  future point some other skill adds later. Only the point name changes.
- A hook file that needs backing scripts keeps them in a `scripts/` subfolder next to that
  point's own folder (e.g. `.digismith/hooks/post-finish/scripts/`), matching the convention
  already used by skills like `subagent-driven-development`.
```

- [ ] **Step 2: Write the version-bump stock hook**

Create `.digismith/hooks/post-finish/01-version-bump.md`:

```markdown
---
name: version-bump
description: Stock post-finish hook — bumps DigiSmith's own plugin version after a self-merge
---

# Version Bump

**DigiSmith's own repo only.** Check first:

```bash
MAIN_ROOT=$(git rev-parse --show-toplevel)
IS_DIGISMITH=false
if [ -f "$MAIN_ROOT/.claude-plugin/plugin.json" ] && grep -q '"name": "digismith"' "$MAIN_ROOT/.claude-plugin/plugin.json"; then
  IS_DIGISMITH=true
fi
echo "$IS_DIGISMITH"
```

If `IS_DIGISMITH` is not `true`, stop here — this hook does nothing in any other repo.

Otherwise, bump the plugin version:

```bash
BASE_SHA=$(git rev-parse ORIG_HEAD)
BUMP_OUTPUT=$(node --experimental-strip-types .digismith/hooks/post-finish/scripts/bump-plugin-version.ts --base "$BASE_SHA")
BUMP_STATUS=$?
echo "$BUMP_OUTPUT"
if [ "$BUMP_STATUS" -ne 0 ]; then
  echo "Version bump script failed — stop here, do not push, and investigate." >&2
fi
if [[ "$BUMP_OUTPUT" == BUMPED* ]]; then
  git add .claude-plugin/plugin.json .claude-plugin/marketplace.json
  git commit -m "chore: bump plugin version" -- .claude-plugin/plugin.json .claude-plugin/marketplace.json
  git push origin "$(git rev-parse --abbrev-ref HEAD)"
fi
```

`ORIG_HEAD` is git's own record of the branch tip immediately before the merge that triggered
this `post-finish` firing — set correctly whether that merge was a fast-forward or a true merge
commit, and still valid here since nothing between the merge and this hook firing changes it.

A `BUMPED` result commits both version files in their own commit — separate from the merge
commit — and pushes it: this hook fires after Option 1's own push already happened, so the bump
needs its own, second push rather than riding along in the first one. A `SKIPPED` result means
the incoming branch's own commits already changed the version — do nothing further. A non-zero
exit means the bump script itself failed: stop, do not push, and investigate — the bump is the
point of this hook, so a failure here must not be silently skipped.
```

- [ ] **Step 3: Write the plugin-reinstall stock hook**

Create `.digismith/hooks/post-finish/02-plugin-reinstall.md`:

```markdown
---
name: plugin-reinstall
description: Stock post-finish hook — refreshes the installed DigiSmith plugin cache after a self-merge
---

# Plugin Reinstall

**DigiSmith's own repo only.** Check first:

```bash
MAIN_ROOT=$(git rev-parse --show-toplevel)
IS_DIGISMITH=false
if [ -f "$MAIN_ROOT/.claude-plugin/plugin.json" ] && grep -q '"name": "digismith"' "$MAIN_ROOT/.claude-plugin/plugin.json"; then
  IS_DIGISMITH=true
fi
echo "$IS_DIGISMITH"
```

If `IS_DIGISMITH` is not `true`, stop here — this hook does nothing in any other repo.

Otherwise, refresh the installed plugin cache from the just-pushed `main` (fires after
`01-version-bump.md`, so the refreshed cache reflects the bumped version too):

```bash
claude plugin marketplace update jazurite && claude plugin install digismith@jazurite --scope user
```

Then print this reminder plainly:

> "DigiSmith's plugin cache has been refreshed to the latest merge. Any other Claude Code
> sessions already running on this machine won't see this update until restarted."

This session's own tools already reflect the change (files are re-read from disk on each use) —
the reminder is for any *other*, already-running session on this same machine, which loaded its
skill list at its own start and has no way to hot-reload a plugin.
```

- [ ] **Step 4: Manual smoke test of the shared gate logic**

Run from the repo root (this repo genuinely is DigiSmith, so this should evaluate `true` — this
is the same gate check both hook files above open with):

```bash
MAIN_ROOT=$(git rev-parse --show-toplevel)
IS_DIGISMITH=false
if [ -f "$MAIN_ROOT/.claude-plugin/plugin.json" ] && grep -q '"name": "digismith"' "$MAIN_ROOT/.claude-plugin/plugin.json"; then
  IS_DIGISMITH=true
fi
echo "$IS_DIGISMITH"
```

Expected output: `true`.

Also confirm `git rev-parse ORIG_HEAD` succeeds and prints a SHA (its exact value isn't
meaningful outside a real merge sequence — just confirm the command itself works in this repo):

```bash
git rev-parse ORIG_HEAD
```

- [ ] **Step 5: Commit**

```bash
git add skills/finishing-a-development-branch/fire-lifecycle-hook.md .digismith/hooks/post-finish/01-version-bump.md .digismith/hooks/post-finish/02-plugin-reinstall.md
git commit -m "feat(lifecycle-hooks): add post-finish hook files and shared firing procedure"
```

---

### Task 3: Rewrite `finishing-a-development-branch`'s Option 1 to fire post-finish hooks

**Files:**
- Modify: `skills/finishing-a-development-branch/SKILL.md` (the `### Option 1: Merge Locally` subsection, currently lines 86-168)

**Interfaces:**
- Consumes: Task 2's `fire-lifecycle-hook.md` (referenced by name, in the same folder) and the `post-finish` point name.
- No new interfaces produced — this task only edits skill prose/bash, no code.

There is no automated test harness for skill-body prose in this repo — verification here is a
careful read-through plus the manual smoke test in Step 3 below. The real, live proof is this
plan's own merge in the finishing step, which will exercise this exact new code path for the
first time (same chicken-and-egg as W.4.1 — the installed plugin cache will still have the
*old* Option 1 at that point, so the finish step needs to execute the corrected version by hand
from this branch, not trust the stale installed skill).

- [ ] **Step 1: Verify the current text matches before replacing**

Read `skills/finishing-a-development-branch/SKILL.md` and confirm the `### Option 1: Merge
Locally` subsection (currently lines 86-168, ending right before `### Option 2: Push and Create
PR`) still reads exactly as shown in "Old text" below. If it doesn't match — another concurrent
session may have touched this file — stop and report rather than guessing at a fuzzy
replacement.

**Old text** (what's being replaced, verified present as of this plan's own design):

```markdown
### Option 1: Merge Locally

```bash
# Get main repo root for CWD safety
MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
cd "$MAIN_ROOT"

# Merge first — verify success before removing anything
git checkout <base-branch>
git pull
git merge <feature-branch>

# Verify tests on merged result
<test command>
```

If tests fail on the merged result: stop, leave the worktree and branch in
place, and investigate — nothing has been pushed, so the merge is local
and recoverable.

**DigiSmith's own repo only:** once the merged result is green, before
pushing, check whether this is DigiSmith's own repo (never any other
project using this same forked skill). This check is self-contained —
it re-derives everything from durable git state rather than relying on
shell variables from the block above, which may not persist if each block
runs as a separate command:

```bash
MAIN_ROOT=$(git rev-parse --show-toplevel)
IS_DIGISMITH=false
if [ -f "$MAIN_ROOT/.claude-plugin/plugin.json" ] && grep -q '"name": "digismith"' "$MAIN_ROOT/.claude-plugin/plugin.json"; then
  IS_DIGISMITH=true
fi
echo "$IS_DIGISMITH"
```

If `IS_DIGISMITH` is `true`, bump the plugin version:

```bash
BASE_SHA=$(git rev-parse ORIG_HEAD)
BUMP_OUTPUT=$(node --experimental-strip-types scripts/bump-plugin-version.ts --base "$BASE_SHA")
BUMP_STATUS=$?
echo "$BUMP_OUTPUT"
if [ "$BUMP_STATUS" -ne 0 ]; then
  echo "Version bump script failed — stop here, do not push, and investigate." >&2
fi
if [[ "$BUMP_OUTPUT" == BUMPED* ]]; then
  git add .claude-plugin/plugin.json .claude-plugin/marketplace.json
  git commit -m "chore: bump plugin version" -- .claude-plugin/plugin.json .claude-plugin/marketplace.json
fi
```

`ORIG_HEAD` is git's own record of the branch tip immediately before the
merge above — set correctly whether that merge was a fast-forward or a
true merge commit — so it reproduces the pre-merge base SHA without
depending on a shell variable surviving across blocks.

A `BUMPED` result commits both version files in their own commit, never
amended into the merge commit. A `SKIPPED` result means the incoming
branch's own commits already changed the version — do nothing further. A
non-zero exit means the bump script itself failed: stop, do not push, and
investigate — the bump is the point of this step, so a failure here must
not be silently skipped. If this isn't DigiSmith's own repo, both steps
above are skipped entirely and Option 1 proceeds exactly as it always has.

Once the merged result is green (and, for DigiSmith's own repo, the bump
above has run cleanly), push `<base-branch>` to origin:

```bash
git push origin <base-branch>
```

If the push is rejected (the remote moved since `git pull` above): stop,
report the rejection plainly, and investigate — do not force-push
automatically. Force-push only on your human partner's explicit request
(see "The push was rejected — force-push will fix it" below).

Once the push succeeds: clean up the worktree (Step 6), then delete the
branch:

```bash
git branch -d <feature-branch>
```
```

- [ ] **Step 2: Apply the new text**

Replace the entire subsection identified in Step 1 with:

```markdown
### Option 1: Merge Locally

```bash
# Get main repo root for CWD safety
MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
cd "$MAIN_ROOT"

# Merge first — verify success before removing anything
git checkout <base-branch>
git pull
git merge <feature-branch>

# Verify tests on merged result
<test command>
```

If tests fail on the merged result: stop, leave the worktree and branch in
place, and investigate — nothing has been pushed, so the merge is local
and recoverable.

Once the merged result is green, push `<base-branch>` to origin:

```bash
git push origin <base-branch>
```

If the push is rejected (the remote moved since `git pull` above): stop,
report the rejection plainly, and investigate — do not force-push
automatically. Force-push only on your human partner's explicit request
(see "The push was rejected — force-push will fix it" below).

Once the push succeeds: clean up the worktree (Step 6), then delete the
branch:

```bash
git branch -d <feature-branch>
```

Finally, fire the `post-finish` lifecycle hook: see `fire-lifecycle-hook.md`
(in this skill's own folder) for the procedure. This runs in every repo,
DigiSmith's own included — a repo with no `.digismith/hooks/post-finish/`
folder simply has nothing fire.
```

- [ ] **Step 3: Read the whole file once, end to end**

Open `skills/finishing-a-development-branch/SKILL.md` and read it top to bottom. Confirm: the
`### Option 2: Push and Create PR` heading and everything after it is unchanged; no other part
of the file references `scripts/bump-plugin-version.ts`, `BASE_SHA`, or `IS_DIGISMITH` (all of
that logic now lives only inside `01-version-bump.md`); the fenced code blocks all balance (no
stray ` ``` `).

- [ ] **Step 4: Manual smoke test**

Run from the repo root (this repo genuinely is DigiSmith):

```bash
ls .digismith/hooks/post-finish/*.md
```

Expected output: `01-version-bump.md` and `02-plugin-reinstall.md` both listed, confirming the
path `fire-lifecycle-hook.md` will look for actually has files in it.

- [ ] **Step 5: Commit**

```bash
git add skills/finishing-a-development-branch/SKILL.md
git commit -m "feat(finishing-a-development-branch): fire post-finish lifecycle hooks from Option 1 (Y)"
```

---

### Task 4: Doc updates and backlog retirement

**Files:**
- Modify: `MEMORY.md` (the **W** row's W.4.1 sentence, plus a new **Y** row)
- Modify: `vendored/PROVENANCE.md` (the `finishing-a-development-branch` entry)
- Modify: `backlog/README.md` (remove one line)
- Delete: `backlog/digismith-lifecycle-hooks-y.md`

**Interfaces:** None — pure documentation, no code.

- [ ] **Step 1: Update the W.4.1 sentence in `MEMORY.md`**

Verify this exact substring is still present in the **W** row (if not, stop and report):

```
A general lifecycle-hook mechanism (stock/custom hooks across SDLC points) was raised during this brainstorm and deliberately deferred to its own future letter — see `backlog/digismith-lifecycle-hooks-y.md` (**Y**). See `.digismith/docs/auto-bump-plugin-version-on-merge/design.html` · **W.5** built 2026-09-04:
```

Replace it with:

```
A general lifecycle-hook mechanism (stock/custom hooks across SDLC points) was raised during this brainstorm and deliberately deferred to its own future letter, built the same day as **Y** (see **Y** below) — the version-bump above was retrofitted to become Y's first stock `post-finish` hook, no longer wired directly into this file; see `.digismith/hooks/post-finish/scripts/bump-plugin-version.ts`. See `.digismith/docs/auto-bump-plugin-version-on-merge/design.html` · **W.5** built 2026-09-04:
```

Do not touch any other part of the **W** row.

- [ ] **Step 2: Add the new Y row to `MEMORY.md`**

Find the end of the **W** row — it's the last row in the map table, ending in `... each its own
future brainstorm, undesigned here |` right before the table's closing blank line. Immediately
after that row, add a new row:

```
| **Y** | Lifecycle hooks | A general lifecycle-hook mechanism: specific points in DigiSmith's own SDLC pipeline fire a hook — a markdown instructions file executed the same way a skill is (agent reads and follows it live), triggered automatically rather than matched by description. Surfaced mid-**W.4.1** brainstorm (2026-09-05), deferred to its own session per Jack's request, built the same day once a second real use case arrived (a stale plugin cache still running map item H's retired `subagent-driven-always` skill — see **W.6**). **Y.1** built 2026-09-05: first lifecycle point, `post-finish`, fired from `finishing-a-development-branch`'s Option 1 after merge, push, and worktree cleanup all complete — general to whichever integration option is taken, though only Option 1 wires it in today. Hook files live in `.digismith/hooks/<point>/`, one flat file per hook, filename-ordered; a shared `skills/finishing-a-development-branch/fire-lifecycle-hook.md` doc holds the enumerate-and-follow procedure so a future second lifecycle point in another skill can reuse it without duplicating the logic. Two stock hooks ship at `post-finish`, both gated on the same DigiSmith-repo check W.4.1/W.5 established: `01-version-bump.md` (retrofit of W.4.1's version bump, now making its own commit and push since it fires after Option 1's own push already happened) and `02-plugin-reinstall.md` (new — reinstalls DigiSmith's own plugin cache after a self-merge, closing the stale-cache gap, printing a reminder that other already-running sessions need a manual restart to pick up the refresh). Cross-repo hook sharing and lifecycle points beyond `post-finish` were both explicitly scoped out — deferred to future ideas, tentatively **Y2** for the former (a separate letter, not a Y sub-item). See `.digismith/docs/lifecycle-hooks/design.html` |
```

- [ ] **Step 3: Update the `vendored/PROVENANCE.md` entry**

Verify this exact substring is still present (if not, stop and report):

```
- **finishing-a-development-branch** — map item **W.4**, activated 2026-09-04.
  Option 1 ("Merge Locally") now pushes `<base-branch>` to origin after a
  successful merge and green tests. **Further diverged by W.4.1** (2026-09-05):
  Option 1 now also bumps `.claude-plugin/plugin.json` and
  `.claude-plugin/marketplace.json`'s version (via `scripts/bump-plugin-version.ts`)
  after a successful merge, gated strictly to DigiSmith's own repo. See DigiSmith
  `MEMORY.md` map item W.
```

Replace it with:

```
- **finishing-a-development-branch** — map item **W.4**, activated 2026-09-04.
  Option 1 ("Merge Locally") now pushes `<base-branch>` to origin after a
  successful merge and green tests. **Further diverged by Y** (2026-09-05): Option 1
  now fires a `post-finish` lifecycle hook after pushing and cleaning up — see
  `.digismith/hooks/post-finish/` and `fire-lifecycle-hook.md` in this skill's own
  folder. W.4.1's version-bump (previously wired directly into this file) is now
  the first stock hook there, alongside a new plugin-cache-reinstall hook. See
  DigiSmith `MEMORY.md` map items W and Y.
```

- [ ] **Step 4: Retire the superseded backlog item**

Delete the file `backlog/digismith-lifecycle-hooks-y.md`.

Verify this exact line is still present in `backlog/README.md` (if not, stop and report), then
remove it entirely (including its trailing newline):

```
- [DigiSmith lifecycle hooks (new letter, tentatively Y)](digismith-lifecycle-hooks-y.md) — general stock/custom hook mechanism across SDLC lifecycle points; surfaced mid-W.4.1, deliberately deferred to its own future session rather than built now
```

- [ ] **Step 5: Run the full test suite once more**

Run: `pnpm test`
Expected: PASS — this task touched no code, so the suite's pass count should be identical to
what it was immediately before this task (note the actual count in your report for the
reviewer to compare against Task 1's own baseline).

- [ ] **Step 6: Commit**

```bash
git add MEMORY.md vendored/PROVENANCE.md backlog/README.md
git rm backlog/digismith-lifecycle-hooks-y.md
git commit -m "docs(Y): record lifecycle hooks in MEMORY.md and PROVENANCE.md, retire superseded backlog item"
```
