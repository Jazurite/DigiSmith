# Vitest Worktree Contamination Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `pnpm test` at the repo root from picking up other concurrent sessions' worktree test files, which currently causes false failures and silent double-counting.

**Architecture:** Add a single root `vitest.config.ts` that extends Vitest's default `exclude` list (via `configDefaults.exclude`, not a bare array) with all three worktree-path conventions `using-git-worktrees` documents. No other file changes.

**Tech Stack:** Vitest ^2.1.0 (already the repo's test runner), TypeScript config file (`defineConfig`/`configDefaults` from `vitest/config`).

## Global Constraints

- Full spec: `.digismith/docs/vitest-worktree-contamination/design.html` — read it if anything below is ambiguous.
- Setting `test.exclude` to a bare array replaces Vitest's built-in excludes (`node_modules`, `dist`, etc.) rather than extending them — verified against Vitest's own current docs. Must use `configDefaults.exclude` spread in, never a bare array.
- Cover all three worktree conventions: `**/.claude/worktrees/**`, `**/.worktrees/**`, `**/worktrees/**` — not only the one currently in use.
- Repo-wide, single `package.json`, no nested per-package vitest config exists or is needed.

---

### Task 1: Add root `vitest.config.ts` excluding worktree directories

**Files:**
- Create: `vitest.config.ts`

**Interfaces:** None — a config file, no exported functions or types consumed elsewhere.

- [ ] **Step 1: Confirm the contamination reproduces before the fix**

Run: `pnpm test 2>&1 | tail -6`

Expected: the reported test/file counts are higher than the isolated baseline (currently ~385 tests / ~33 files when run in isolation — see the design doc's Verification section for the exact numbers this was last confirmed against). If no other worktrees currently exist on this machine, this step may show the correct count already — that's fine, it just means Step 4's before/after comparison below has less to show; proceed regardless, since the config's correctness doesn't depend on a worktree being present at plan-execution time.

- [ ] **Step 2: Write `vitest.config.ts`**

Create `vitest.config.ts` at the repo root:

```typescript
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: [
      ...configDefaults.exclude,
      '**/.claude/worktrees/**',
      '**/.worktrees/**',
      '**/worktrees/**',
    ],
  },
})
```

- [ ] **Step 3: Confirm built-in excludes are still honored**

Run: `node --experimental-strip-types -e "import('./vitest.config.ts').then(m => console.log(JSON.stringify(m.default.test.exclude)))"`

Expected: the printed array includes Vitest's own defaults (`**/node_modules/**`, `**/dist/**`, `**/cypress/**`, `**/.{idea,git,cache,output,temp}/**`, `**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*`) **and** the three new worktree patterns — not just the three new ones alone. This confirms `configDefaults.exclude` was actually spread in, not silently replaced.

- [ ] **Step 4: Run the test suite and confirm the contamination is gone**

Run: `pnpm test 2>&1 | tail -6`

Expected: PASS, with the test/file count matching an isolated run rather than any inflated count from Step 1. If a worktree exists on this machine at the time this step runs, its test files must **not** appear in this run's file list — spot-check by running `pnpm test 2>&1 | grep -i "worktree"` and confirming no output.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts
git commit -m "fix(test): exclude worktree directories from root vitest discovery"
```
