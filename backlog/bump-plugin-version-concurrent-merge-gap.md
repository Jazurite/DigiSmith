# `bump-plugin-version.ts` can't tell "this branch bumped" from "a later merge bumped" (map item W.4.1)

**Status:** Not applied. Observational — surfaced live by two concurrent
merges landing back-to-back on `main`, not yet patched.

**Source:** 2026-09-11/12, live during Y.1.3's merge (`digismith-76`) racing
Z (Model Router)'s own merge (`ac1b451`) on the same shared main checkout.

## What happened

`versionChangedSince(baseSha, ...)` (in
`.digismith/hooks/post-finish/scripts/bump-plugin-version.ts`) answers one
question: has `plugin.json`'s version changed since `baseSha`? It has no way
to distinguish *why* — whether the incoming branch itself bumped the
version (the case it was built for, e.g. `no-push-after-local-merge`'s
original scenario), or a **different, unrelated merge** landed on `main` and
bumped it in between.

Concretely: Y.1.3's `post-finish` hook ran `01-version-bump.md` against
`ORIG_HEAD` (correctly `ac1b451`, Y.1.3's own true pre-merge base) and
bumped `0.41.0-beta` → `0.42.0-beta`. The Z session's own merge had already
landed on `main` *before* Y.1.3's push (base `de7ac6b`, an earlier tip), and
Z's own post-finish run — deliberately paused until Y.1.3 finished, per its
own heads-up message — will call `versionChangedSince("de7ac6b", ...)` and
get `true`, so `bump-plugin-version.ts` will print `SKIPPED`. That's the
*correct mechanical answer* to "did the version change since de7ac6b" — but
it's misleading in intent: Z's own commits never touched `plugin.json`, Y's
did, and Z's merge content is already inside the installed `0.42.0-beta` (Y's
merge landed first), so nothing is actually stale. The script can't
express "this is fine, my commits are already covered" — it can only report
the same `SKIPPED` it would give if Z's *own* branch had bumped the version.

## Why this is a real, recurring gap, not a one-off

Any time two feature branches both reach `finishing-a-development-branch`'s
Option 1 close together — increasingly common now that multiple concurrent
Claude Code sessions routinely work this repo simultaneously — the second
merge's `post-finish` hook sees a version already changed by the first
merge's hook, not by anything in its own commit range. `SKIPPED` is the only
available output for that case today, indistinguishable from "the incoming
branch already changed `plugin.json` itself" (`versionChangedSince`'s actual
designed case, e.g. a feature that edits `plugin.json` directly).

## What's still worth examining

- Whether `bump-plugin-version.ts` should distinguish these two `SKIPPED`
  causes at all, or whether "the version already reflects everything on
  `main`, nothing to do" is a sufficient invariant regardless of *why* —
  i.e. is this actually a gap, or just an unfamiliar-looking but correct
  outcome that only needs better hook-side messaging?
- If a real distinction is wanted: `versionChangedSince` would need to check
  whether the *incoming branch's own commit range* (not just `baseSha` vs.
  current) touched `plugin.json`/`marketplace.json`, rather than comparing
  point-in-time snapshots — a materially different check, not a tweak.
- At minimum, `01-version-bump.md`'s `SKIPPED` message could say plainly
  that a version change was detected since `ORIG_HEAD` but doesn't
  necessarily mean *this* branch's own commits caused it — so a human
  reading hook output isn't left wondering whether their merge's version
  was silently dropped.

## Why not applied yet

Surfaced live, mid-merge, via a cross-session heads-up — writing it down
before deciding whether it's a real defect or a correct-but-surprising
edge of an already-shipped design. Same holding-pen disposition as the rest
of `backlog/`.
