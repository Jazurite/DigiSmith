# DGS-630 plan: close attention items by rule

Spec: `spec.md` in this folder. Work in the worktree `.worktrees/dgs-630`. Test first in every task. Protected paths: merge needs the Maestro.

Setup (fresh worktree only, never in the depot clone): `pnpm install --frozen-lockfile`, then `pnpm --filter @digismith/clickup-client build` if the client `dist` is missing.
Run tests: `pnpm vitest run packages/cli/src/autonomous`. Types: `pnpm --filter @digismith/cli build` (or `pnpm exec tsc -p packages/cli/tsconfig.build.json --noEmit`).

### Task 1: Rule 1 (scan closes already-merged) and Rule 2 (release closes unknown items)
Files: `packages/cli/src/autonomous/scan.ts`, `scan.test.ts`, `release.ts`, `release.test.ts`.
1. Test first. In `scan.test.ts` (use `FakeTracker`, a `guard` stub whose `alreadyDone` returns null, `appendAttention` to seed the item; seed id `DGS-600/already-merged.unknown.0`, ticket `DGS-600`, cause `already-merged-but-open`):
   - `already-merged item closes when its ticket is no longer in to do`: tracker has DGS-600 with status `complete`; run the scan; `readOpen` has no such item; the closing line has `by: "watchdog"` and note `ticket left to do`.
   - `already-merged item stays open while its ticket is still in to do`: DGS-600 `to do`, Mode Manual (so it is skipped, not claimed); item still open.
   - `a dry run closes nothing`.
   - `an item with another cause or another run is not closed` (seed `starter-status` and a `DGS-9/already-merged` for a ticket still in to do).
2. In `release.test.ts` (existing `mk`, `lock`, `acquireLock`, `appendOpen`/`appendAttention` to seed):
   - `merged closes the ticket's open unknown items as controller`: lock DGS-1; seed `builder-9.unknown.0` (ticket DGS-1, cause `journal-uncertain-order-merge`) and `DGS-1/already-merged.unknown.0`; release merged; both closed, `by: "controller"`, note `ticket released as merged`.
   - `merged leaves other items open`: a `failed` item of DGS-1, an `unknown` item of DGS-2, and a ticket-null `unknown` item stay open.
   - `failed, stopped and awaiting-jack close nothing`.
   - `a corrupt lock (--ticket ?) closes nothing`.
3. Run the tests: they fail.
4. `scan.ts`: in step 4, right after `const all = await d.tracker.listByStatus(INTAKE);`, add (not in dry run):
   ```ts
   if (!d.dryRun) {
     const inToDo = new Set(all.map(keyOf));
     try {
       for (const it of readOpen(d.dir)) if (it.cause === "already-merged-but-open" && it.ticket !== null && !inToDo.has(it.ticket)) appendResolved(d.dir, it.id, "watchdog", now.toISOString(), "ticket left to do");
     } catch { /* the item stays open until a later scan */ }
   }
   ```
5. `release.ts`: import `appendResolved, readOpen` from `./attention.ts`. After `clearLock(d.dir); lockCleared = true;` add, only `if (a.result === "merged" && !corrupt)`:
   ```ts
   try {
     for (const it of readOpen(d.dir)) if (it.ticket === a.ticket && it.kind === "unknown") appendResolved(d.dir, it.id, "controller", nowIso, "ticket released as merged");
   } catch { /* best effort: the release goes on */ }
   ```
6. Run the tests: pass.
7. Commit: `fix(autonomous): close already-merged and controller unknown items by rule`

### Task 2: Rule 3 (no obs-git-failed for a done ticket or a gone worktree)
Files: `packages/cli/src/autonomous/phase-types.ts`, `advance.ts`, `advance.test.ts`, `observers-real.ts`, `observers-real.test.ts`.
1. Test first. In `advance.test.ts` (helpers `S`, `O`, `bad`, `withEvent`, `m` already exist):
   - `building: a failed git read with a done ticket waits, no note`: `O({ ...withEvent("building"), git: bad(), tracker: ok({ status: "complete" }) })` gives `{ kind: "wait", reason: "ticket-done" }`. Same for `done` and `closed`; same for `review` and `merge-ready`.
   - `a failed git read with an open ticket still gives obs-git-failed` (existing tests stay green).
   - `merge-ready: a worktree-gone error waits`: `git: bad("worktree-gone: no branch")` gives `{ kind: "wait", reason: "worktree-gone" }`.
   - `building and review: a worktree-gone error still gives obs-git-failed`.
   - `a failed tracker read does not hide obs-git-failed`: `tracker: bad()` gives the note.
2. In `observers-real.test.ts` (near the F7 tests):
   - `worktree gone, no mergeHead, branch rev-parse fails: throws "worktree-gone:"` (use `handler` where `rev-parse` returns `codeErr(128)`).
   - `worktree gone and the run has no branch: throws "worktree-gone:"` (replaces the plain-message expectation if one exists).
   - `worktree present and git fails: the error does not start with worktree-gone`.
3. Run the tests: they fail.
4. `phase-types.ts`: `export const WORKTREE_GONE = "worktree-gone:";`.
5. `observers-real.ts` `gitView`: wrap the two fallbacks of a missing worktree. When `!existsSync(run.worktree)` and `mergeHead === null`: try the `rev-parse` of the branch; on any error, or when `run.branch` is empty, `throw new Error(\`${WORKTREE_GONE} ${message}\`)`. Everything else is unchanged.
6. `advance.ts`: add
   ```ts
   const DONE = new Set(["complete", "done", "closed"]);
   const ticketDone = (obs: Observations): boolean => obs.tracker.ok && DONE.has(obs.tracker.value.status.toLowerCase());
   // null = git read fine; else the action for a failed read
   function gitFailed(obs: Observations, phase: Phase): Action | null {
     if (obs.git.ok) return null;
     if (ticketDone(obs)) return wait("ticket-done");
     if (phase === "merge-ready" && obs.git.error.startsWith(WORKTREE_GONE)) return wait("worktree-gone");
     return note("obs-git-failed");
   }
   ```
   and replace the three lines `if (!obs.git.ok) return note("obs-git-failed");` by `const gf = gitFailed(obs, s.phase); if (gf !== null) return gf;` (building, review, mergeReady). Import `WORKTREE_GONE`.
7. Run the tests: pass.
8. Commit: `fix(autonomous): no obs-git-failed note for a done ticket or a gone worktree`

### Task 3: Rule 4 (the watchdog closes guardrails.failed)
Files: `packages/cli/src/autonomous/watch.ts`, `watch.test.ts`, `index.ts`.
1. Test first, in `watch.test.ts` (existing `mk` helpers, `appendAttention` to seed `guardrails.failed.0` with `run: "guardrails"`, `kind: "failed"`, cause `bad-guardrail-config`; deps gain `guardrailProblems`):
   - `closes guardrails.failed when the guardrail read is clean`: stub returns `[]`; item closed, `by: "watchdog"`, note `guardrails read clean`; `res.resolved` is 1.
   - `keeps it open while the read has problems`: stub returns `['nightwatch: unknown guardrail key "x"']`; item open; the watch opens nothing new.
   - `keeps it open when the read throws`.
   - `no guardrailProblems dep: the item is untouched` (older callers).
   - `a dry run closes nothing and says would resolve`.
   - `does not close other items of run "-"` (a `bad-budget-config` item stays).
2. Run the tests: they fail.
3. `watch.ts`: add to `WatchDeps` `guardrailProblems?: () => string[];`. After the scan interval block add:
   ```ts
   if (d.guardrailProblems) {
     let clean = false;
     try { clean = d.guardrailProblems().length === 0; } catch { /* unread: stays open */ }
     if (clean) for (const it of items.filter((o) => o.run === "guardrails" && o.cause === "bad-guardrail-config")) close(it, "guardrails read clean");
   }
   ```
4. `index.ts` watch handler: `const repo = (argv.repo as string | undefined) ?? process.cwd();` use it for `cwd`, and pass `guardrailProblems: makeScanGuard(d.git ?? realGit, repo).guardrailProblems`. (`makeScanGuard` is already imported.)
5. Run the tests: pass. Then the whole suite: `pnpm vitest run packages/cli` and the type check from the top of this plan.
6. Commit: `fix(autonomous): the watchdog closes a guardrails item on a clean read`

### Finish
The factory's Reviewers run after Task 3. Merge stops for the Maestro (protected path `packages/cli/src/autonomous/`). After the merge: first use as in `spec.md`.
