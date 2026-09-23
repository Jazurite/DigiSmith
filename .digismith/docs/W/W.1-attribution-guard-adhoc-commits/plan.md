# Attribution Guard for Ad-Hoc Commits (W.11) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the AI Attribution Guard's third confirmed gap — `check-attribution` only ever runs inside a formal review flow, so a direct/ad-hoc `git commit` never gets checked — with a real git `commit-msg` hook that fires on every commit regardless of flow, plus an unconditional `SessionStart` reminder as defense in depth.

**Architecture:** A new `scripts/git-hooks/attribution-pattern.sh` becomes the single source of truth for the attribution regex, sourced by both a new `scripts/git-hooks/commit-msg` hook and the existing `check-attribution` script (one-line change, no behavior change). A new `package.json` `prepare` script points `core.hooksPath` at that directory on every `pnpm install`. `scripts/session-init.ts` gains an unconditional reminder line for DigiSmith's own repo, independent of `.digismith/profile`.

**Tech Stack:** Bash (the hook and shared pattern file, matching `check-attribution`'s own style), TypeScript (`session-init.ts`), Vitest with real fixtures (temp dirs, real `bash`/`git` subprocess calls — this file family's existing style, no mocking).

## Global Constraints

- Full spec: `.digismith/docs/W/W.1-attribution-guard-adhoc-commits/design.html` — read it if anything below is ambiguous.
- Attribution regex, exact, single source of truth: `co-authored-by:.*claude|co-authored-by:.*anthropic|generated with.*claude|generated with.*anthropic|🤖` — must exist in exactly one file (`scripts/git-hooks/attribution-pattern.sh`) after this plan; `check-attribution` and the new `commit-msg` hook both source it, neither hardcodes it.
- Hard block, no exceptions: any match exits 1 and refuses the commit. No warn-only mode, no escape hatch.
- `core.hooksPath` must be written as the **relative** literal string `scripts/git-hooks` — never an absolute path. Git resolves a relative `core.hooksPath` against whichever working tree is currently active at hook-invocation time, so this is what makes every worktree use its own checked-out copy of the hook. This is verified live in Task 2, not just asserted.
- `check-attribution` resolves the shared pattern file relative to its own location (3 directories up from `skills/subagent-driven-development/scripts/` to the repo/plugin root, then into `scripts/git-hooks/`) — never `git rev-parse --show-toplevel`, since this script ships inside the vendored plugin and must resolve identically whether it's running against DigiSmith's own repo or an installed plugin cache inside a consumer repo.
- `scripts/session-init.ts`'s existing exported functions (`readProfile`, `loadVoiceSummary`, `formatBanner`, `buildBanner`) keep their exact current signatures — the new check is a fully independent addition, not threaded through them.
- Test command for this repo: `pnpm test` (runs `vitest run`). Single file: `pnpm exec vitest run <path>`.
- Commit messages: title only, no body, **no AI attribution of any kind** (no `Co-Authored-By`, no "Generated with", no robot emoji) — this repo's standing rule. After every commit, run `git log -1 --format=%B` and confirm the message is exactly the one line you intended. Once Task 1 and Task 2 land, every commit you make afterward in this worktree is itself checked by the hook you just built — a real attribution mistake at that point would be caught, not just theoretically prevented.
- Windows Git Bash environment: `git` already invokes shebang-script hooks correctly on this machine (`check-attribution` is existing, working proof) — `chmod +x` the new hook and `git add` it normally so git records the executable bit (mode `100755`); no special-casing needed.
- This is DigiSmith's own self-development. Other Claude Code sessions may be concurrently active on the same repo. Before any edit that relies on an exact "find" substring against a shared doc (`MEMORY.md`, `backlog/README.md`, `vendored/PROVENANCE.md`), confirm the substring still matches the file's current content; if it doesn't, stop and report rather than guess at a fuzzy replacement.
- Windows checkout: do not change a file's existing line-ending style; edit in place.

---

### Task 1: Shared attribution pattern and the `commit-msg` hook

**Files:**
- Create: `scripts/git-hooks/attribution-pattern.sh`
- Create: `scripts/git-hooks/commit-msg`
- Create: `scripts/git-hooks/commit-msg.test.ts`
- Modify: `skills/subagent-driven-development/scripts/check-attribution`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `ATTRIBUTION_PATTERN` (shell env var, exported by `attribution-pattern.sh`) — consumed by Task 2's live smoke tests and by `check-attribution`, both in this task. `scripts/git-hooks/commit-msg <msg-file>` — consumed by Task 2's install wiring (git invokes it by fixed name, no explicit call site needed).

- [ ] **Step 1: Write the failing test**

Create `scripts/git-hooks/commit-msg.test.ts`:

```typescript
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

  it("blocks a message carrying the robot emoji", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-commit-msg-"));
    try {
      const result = runHook(dir, "docs: fix a typo\n\n🤖 Generated with Claude Code\n");

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
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run scripts/git-hooks/commit-msg.test.ts`

Expected: FAIL — `scripts/git-hooks/commit-msg` does not exist yet, so `spawnSync` fails to find/execute it (every test in the file fails, typically with a non-zero status from a missing executable rather than a thrown error).

- [ ] **Step 3: Verify the relative-path depth before wiring it in**

`check-attribution` lives at `skills/subagent-driven-development/scripts/check-attribution`. Confirm the exact number of `..` segments needed to reach the repo root from its own directory, rather than trusting arithmetic:

```bash
cd skills/subagent-driven-development/scripts && cd ../../.. && pwd
```

Expected: prints the absolute path of this worktree's root (the directory containing `.claude-plugin/`). If it prints anything else, count again — do not proceed with a guessed depth.

- [ ] **Step 4: Create the shared pattern file**

Create `scripts/git-hooks/attribution-pattern.sh`:

```bash
#!/usr/bin/env bash
# Shared regex for detecting AI/assistant attribution in commit messages.
# Sourced by scripts/git-hooks/commit-msg (fires on every commit to this repo)
# and skills/subagent-driven-development/scripts/check-attribution (fires on a
# commit range inside review flows). Edit this one file, not either caller.
export ATTRIBUTION_PATTERN='co-authored-by:.*claude|co-authored-by:.*anthropic|generated with.*claude|generated with.*anthropic|🤖'
```

- [ ] **Step 5: Create the commit-msg hook**

Create `scripts/git-hooks/commit-msg`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/attribution-pattern.sh"

msg_file="$1"
body=$(cat "$msg_file")
match=$(printf '%s\n' "$body" | grep -iE "$ATTRIBUTION_PATTERN" || true)

if [ -n "$match" ]; then
  echo "AI attribution found in commit message:" >&2
  echo "$match" >&2
  echo "This repo forbids AI/assistant attribution anywhere — no exceptions." >&2
  exit 1
fi
```

Make it executable:

```bash
chmod +x scripts/git-hooks/commit-msg
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm exec vitest run scripts/git-hooks/commit-msg.test.ts`

Expected: PASS — all 4 tests.

- [ ] **Step 7: Modify `check-attribution` to source the shared pattern**

Read the current full contents of `skills/subagent-driven-development/scripts/check-attribution` first (confirm it still matches — see the Global Constraints note on concurrent sessions). Find this exact line:

```bash
pattern='co-authored-by:.*claude|co-authored-by:.*anthropic|generated with.*claude|generated with.*anthropic|🤖'
```

Replace it with:

```bash
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)/scripts/git-hooks/attribution-pattern.sh"
pattern="$ATTRIBUTION_PATTERN"
```

(The `../../..` depth is the one you just confirmed in Step 3 — three segments: `scripts` → `subagent-driven-development` → `skills` → repo root.) Nothing else in the file changes — same loop, same per-commit messages, same exit codes.

- [ ] **Step 8: Verify `check-attribution`'s behavior is unchanged**

Run it against this worktree's own recent history, both to confirm it still executes cleanly and that its output is identical in shape to before the edit:

```bash
skills/subagent-driven-development/scripts/check-attribution HEAD~3 HEAD; echo "exit: $?"
```

Expected: exit 0 (this worktree's own recent commits carry no attribution), no error about a missing `attribution-pattern.sh`. If it exits non-zero for any reason other than a real attribution hit, stop and investigate before continuing — a broken `source` path here would silently defeat both this hook and the existing review-flow guard.

- [ ] **Step 9: Run the full suite**

Run: `pnpm test`

Expected: PASS — the new `commit-msg.test.ts` file plus every pre-existing test, unaffected.

- [ ] **Step 10: Commit**

```bash
git add scripts/git-hooks/attribution-pattern.sh scripts/git-hooks/commit-msg scripts/git-hooks/commit-msg.test.ts skills/subagent-driven-development/scripts/check-attribution
git commit -m "feat(hooks): add a commit-msg attribution guard, shared with check-attribution"
git log -1 --format=%B
```

The last command must print exactly that one line and nothing else.

---

### Task 2: Automatic install via `prepare`, verified live

**Files:**
- Modify: `package.json`

**Interfaces:**
- Consumes: `scripts/git-hooks/commit-msg` and `scripts/git-hooks/attribution-pattern.sh` from Task 1 (must already exist and be executable).
- Produces: nothing downstream — this task's own live verification is the final proof the whole feature works end to end.

This task has no unit test of its own — a `prepare` script's effect is git configuration state and live hook firing, not something a Vitest fixture can observe in isolation without reimplementing `pnpm install`'s own lifecycle-script handling. Its "test cycle" is the two live checks in Steps 2 and 3, run for real, with their exact expected output.

- [ ] **Step 1: Add the `prepare` script**

Read the current full contents of `package.json` first. Find:

```json
  "scripts": {
    "test": "vitest run"
  },
```

Replace with:

```json
  "scripts": {
    "test": "vitest run",
    "prepare": "git config core.hooksPath scripts/git-hooks"
  },
```

Then run it once directly, since `pnpm install` only re-runs `prepare` when something changes and you have not just run a fresh install:

```bash
pnpm run prepare
```

Expected: no output (a bare `git config` set prints nothing on success), exit 0.

- [ ] **Step 2: Verify the setting and prove the end-to-end block, in this worktree**

```bash
git config core.hooksPath
```

Expected: prints exactly `scripts/git-hooks`.

```bash
git commit --allow-empty -m "test: attribution guard smoke test" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
echo "commit exit: $?"
```

Expected: the commit is refused — git prints the hook's stderr output (`AI attribution found in commit message: ...`) and `commit exit: 1`. Confirm no commit was actually created:

```bash
git log -1 --format=%s
```

Expected: still shows the previous commit's subject (Task 1's), not "test: attribution guard smoke test".

Then confirm a clean commit goes through and remove it immediately (this is a throwaway smoke test, not a real change):

```bash
git commit --allow-empty -m "test: attribution guard smoke test clean"
echo "commit exit: $?"
git reset --hard HEAD~1
```

Expected: first `commit exit: 0`, then `git log -1` before the reset would have shown the smoke-test commit, and after `git reset --hard HEAD~1` you're back on Task 1's commit. Confirm:

```bash
git log -1 --format=%s
```

Expected: back to `feat(hooks): add a commit-msg attribution guard, shared with check-attribution`.

- [ ] **Step 3: Prove the relative-path-per-worktree claim in a scratch repo**

This is the one claim in the design that must be proven, not trusted — that setting `core.hooksPath` from one worktree makes every worktree use *its own* copy of the hook, not the copy from wherever it was set. Run this in the Bash tool (builds a throwaway repo with two worktrees, each with a *different* hook script content, and confirms each fires its own):

```bash
T=$(mktemp -d) && cd "$T" \
  && git init -q -b main \
  && git -c user.email=t@t -c user.name=t commit -q --allow-empty -m base \
  && git config core.hooksPath scripts/git-hooks \
  && mkdir -p scripts/git-hooks \
  && printf '#!/usr/bin/env bash\necho "MAIN HOOK FIRED" >&2\nexit 1\n' > scripts/git-hooks/commit-msg \
  && chmod +x scripts/git-hooks/commit-msg \
  && git add -A && git -c user.email=t@t -c user.name=t commit -q -m "add main hook" \
  && git worktree add -q ../wt2 -b wt2-branch \
  && cd ../wt2 \
  && printf '#!/usr/bin/env bash\necho "WT2 HOOK FIRED" >&2\nexit 1\n' > scripts/git-hooks/commit-msg \
  && (git -c user.email=t@t -c user.name=t commit -q --allow-empty -m "attempt in wt2" 2>&1 | grep -q "WT2 HOOK FIRED" && echo "PASS: wt2 used its own hook copy" || echo "FAIL: wt2 did not use its own hook copy") \
  && cd "$T" \
  && (git -c user.email=t@t -c user.name=t commit -q --allow-empty -m "attempt in main" 2>&1 | grep -q "MAIN HOOK FIRED" && echo "PASS: main used its own hook copy" || echo "FAIL: main did not use its own hook copy") \
  && cd / && rm -rf "$T"
```

Expected: both `PASS:` lines print, no `FAIL:` line. If either fails, stop — the core design assumption (relative `core.hooksPath` resolves per-worktree) does not hold as expected on this git version/platform, and the install mechanism needs to be rethought before continuing (report this as BLOCKED rather than proceeding).

- [ ] **Step 4: Run the full suite**

Run: `pnpm test`

Expected: PASS. (Nothing in this task changes application code — this confirms nothing about the `prepare` script or the smoke tests above left the tree in an unexpected state.)

- [ ] **Step 5: Commit**

```bash
git add package.json
git commit -m "feat(hooks): auto-install the commit-msg guard via a prepare script"
git log -1 --format=%B
```

The last command must print exactly that one line and nothing else.

---

### Task 3: SessionStart reminder for DigiSmith's own repo

**Files:**
- Modify: `scripts/session-init.ts`
- Modify: `scripts/session-init.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `isDigismithRepoRoot(pluginJsonPath: string): boolean` (exported) — no other task consumes it, but it must match this exact name/signature since it mirrors `scripts/model_offload.ts`'s `isDigismithRepo()` deliberately (see the design's Section 4 rationale for why it takes an explicit path instead).

- [ ] **Step 1: Write the failing tests**

Read the current full contents of `scripts/session-init.test.ts` first. Add this import to the existing import list from `./session-init.ts` (alongside `buildBanner`, `main`, etc.):

```typescript
  isDigismithRepoRoot,
```

Add a new `describe` block after the existing `describe("formatBanner", ...)` block and before `describe("buildBanner", ...)`:

```typescript
describe("isDigismithRepoRoot", () => {
  let tmpDir: string;
  let pluginJsonPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-session-init-test-"));
    pluginJsonPath = path.join(tmpDir, "plugin.json");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns false when the file doesn't exist", () => {
    expect(isDigismithRepoRoot(pluginJsonPath)).toBe(false);
  });

  it("returns true when the file names the digismith plugin", () => {
    fs.writeFileSync(pluginJsonPath, JSON.stringify({ name: "digismith", version: "1.0.0" }));
    expect(isDigismithRepoRoot(pluginJsonPath)).toBe(true);
  });

  it("returns false when the file names a different plugin", () => {
    fs.writeFileSync(pluginJsonPath, JSON.stringify({ name: "some-other-plugin" }));
    expect(isDigismithRepoRoot(pluginJsonPath)).toBe(false);
  });

  it("returns false for malformed JSON rather than throwing", () => {
    fs.writeFileSync(pluginJsonPath, "{not valid json");
    expect(isDigismithRepoRoot(pluginJsonPath)).toBe(false);
  });
});
```

Add one new test inside the existing `describe("main (CLI)", ...)` block, after its last existing `it(...)`:

```typescript
  it("prints the attribution reminder in DigiSmith's own repo even with no profile", async () => {
    fs.mkdirSync(path.join(tmpDir, ".claude-plugin"));
    fs.writeFileSync(
      path.join(tmpDir, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "digismith", version: "1.0.0" }),
    );
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await main();

    expect(logSpy).toHaveBeenCalledWith("DigiSmith: no AI attribution in commits or PRs — no exceptions");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run scripts/session-init.test.ts`

Expected: FAIL — `isDigismithRepoRoot` is not exported yet (import error fails the whole file), and the new `main()` test finds `logSpy` never called with the reminder text.

- [ ] **Step 3: Implement**

In `scripts/session-init.ts`, add this new exported function after `readProfile` (before `type VoiceInitModule = ...`):

```typescript
export function isDigismithRepoRoot(pluginJsonPath: string): boolean {
  if (!isFile(pluginJsonPath)) return false;
  try {
    const config = JSON.parse(fs.readFileSync(pluginJsonPath, "utf8"));
    return config?.name === "digismith";
  } catch {
    return false;
  }
}
```

(`isFile` is already defined lower in this same file — used by `loadVoiceSummary`. No new import needed; `fs` is already imported at the top.)

In `main()`, find:

```typescript
    const banner = await buildBanner(
      path.join(process.cwd(), DEFAULT_PROFILE_PATH),
      path.join(scriptDir, VOICE_INIT_FILENAME),
    );
    if (banner) console.log(banner);
```

Replace with:

```typescript
    const banner = await buildBanner(
      path.join(process.cwd(), DEFAULT_PROFILE_PATH),
      path.join(scriptDir, VOICE_INIT_FILENAME),
    );
    if (banner) console.log(banner);
    if (isDigismithRepoRoot(path.join(process.cwd(), ".claude-plugin", "plugin.json"))) {
      console.log("DigiSmith: no AI attribution in commits or PRs — no exceptions");
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run scripts/session-init.test.ts`

Expected: PASS — every test in the file, including all pre-existing ones (`constants`, `readProfile`, `loadVoiceSummary`, `formatBanner`, `buildBanner`, and the earlier `main (CLI)` tests), which are untouched by this change and whose tmp dirs never contain `.claude-plugin/plugin.json`.

- [ ] **Step 5: Run the full suite**

Run: `pnpm test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/session-init.ts scripts/session-init.test.ts
git commit -m "feat(hooks): remind DigiSmith's own repo of the no-attribution rule on session start"
git log -1 --format=%B
```

The last command must print exactly that one line and nothing else.

---

### Task 4: Docs and backlog

**Files:**
- Delete: `backlog/attribution-guard-blind-spot-adhoc-commits-w.md`
- Modify: `backlog/README.md` (remove the retired item's line)
- Modify: `MEMORY.md` (the **W** row — a single very long line)
- Modify: `vendored/PROVENANCE.md` (the `subagent-driven-development` entry)

**Interfaces:**
- Consumes: nothing from other tasks (prose only, references what Tasks 1-3 built by name).
- Produces: nothing downstream.

Before each edit below, confirm the "find" text still matches the file exactly (see Global Constraints — concurrent sessions edit these files).

- [ ] **Step 1: Retire the backlog item**

```bash
git rm backlog/attribution-guard-blind-spot-adhoc-commits-w.md
```

Then in `backlog/README.md`, delete this entire line (it is one line in the file):

```
- [AI Attribution Guard (W.8) never runs on ad-hoc/direct commits — only inside a formal review flow](attribution-guard-blind-spot-adhoc-commits-w.md) — confirmed live, 2026-09-23: four commits carrying an unwanted attribution trailer slipped through since none went through `subagent-driven-development` or `requesting-code-review`; W.10's SessionStart hook already fires in this exact context and already does nothing, since it's gated on `.digismith/profile` existing
```

- [ ] **Step 2: Update `MEMORY.md`'s W row**

`MEMORY.md`'s **W** row is a single long line. Find this exact substring at its very end:

```
· **W.11+** further primitive-by-primitive content activation and assimilation of outside methodologies (Hermes agent, spec-driven development) — each its own future brainstorm, undesigned here |
```

Replace it with (one line; the placeholder counter advances from `W.11+` to `W.12+`, matching this row's own established pattern of consuming and re-issuing its own trailing placeholder each time a real sub-item is built):

```
· **W.11** built 2026-09-23: closed a third, distinct gap in the AI Attribution Guard (W.8) — `check-attribution` only ever ran inside a formal review flow (`subagent-driven-development`'s `review-package`, `requesting-code-review`'s `code-reviewer.md`), so a direct/ad-hoc `git commit` outside either flow — the shape of most of DigiSmith's own self-development bookkeeping — was never checked at all. Surfaced live: four docs-only commits (`b0f41c8`, `11bbd91`, `2508f74`, `490ce4f`) carried an unwanted `Co-Authored-By: Claude ...` trailer despite the standing no-attribution rule, caught by Jack directly, left in history rather than rewriting shared `main`. Two independent, non-exclusive fixes: a real git `commit-msg` hook (`scripts/git-hooks/commit-msg`, sharing its regex with `check-attribution` via a new `scripts/git-hooks/attribution-pattern.sh` both source) now blocks any commit to this repo carrying attribution, installed automatically via a new `package.json` `prepare` script (`git config core.hooksPath scripts/git-hooks`) that runs on every `pnpm install`; and **W.10**'s `SessionStart` hook (`session-init.ts`) gained an unconditional one-line reminder for DigiSmith's own repo, independent of `.digismith/profile` (deliberately never set here) — the one proactive mechanism that already ran here and already said nothing now says something. See `.digismith/docs/W/W.1-attribution-guard-adhoc-commits/design.html`, `plan.md`, and `report.html` · **W.12+** further primitive-by-primitive content activation and assimilation of outside methodologies (Hermes agent, spec-driven development) — each its own future brainstorm, undesigned here |
```

- [ ] **Step 3: Update `vendored/PROVENANCE.md`**

Find this exact substring (the end of the `subagent-driven-development` entry, right before the `requesting-code-review` entry begins):

```
  Step 3 manual "without bash" fallback gained the same check inline. See DigiSmith
  `MEMORY.md` map item W.
- **requesting-code-review** — map item **W.8**, activated 2026-09-11.
```

Replace it with:

```
  Step 3 manual "without bash" fallback gained the same check inline. See DigiSmith
  `MEMORY.md` map item W. **Further diverged by W.11** (2026-09-23): `check-attribution` now
  sources its attribution regex from a new `scripts/git-hooks/attribution-pattern.sh` instead of
  declaring it inline, so the same pattern also backs a new `commit-msg` git hook that catches
  ad-hoc commits outside any review flow — see DigiSmith `MEMORY.md` map item W.
- **requesting-code-review** — map item **W.8**, activated 2026-09-11.
```

- [ ] **Step 4: Verify and commit**

Run `git status --short` — expected: `D backlog/attribution-guard-blind-spot-adhoc-commits-w.md` plus `M` for `backlog/README.md`, `MEMORY.md`, `vendored/PROVENANCE.md`; nothing else. Run `grep -rn "attribution-guard-blind-spot-adhoc-commits-w" --include=*.md . | grep -v node_modules | grep -v "^./.digismith/docs/"` — expected: no output (the only remaining references live in this feature's own design/plan). Run `pnpm test` once more — expected: PASS (nothing in this task touches code; this confirms the branch is green before finish).

```bash
git add backlog/README.md MEMORY.md vendored/PROVENANCE.md
git commit -m "docs: record W.11 (attribution guard for ad-hoc commits) and retire its backlog item"
git log -1 --format=%B
```

(`git rm` already staged the deletion.) The last command must print exactly that one line and nothing else.
