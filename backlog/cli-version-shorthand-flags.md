# `@digismith/cli`: add `-v`/`-V` as aliases for `--version` (map item V.4)

**Status:** Idea only, confirmed live. No design yet.

**Source:** Found live 2026-09-12, right after `@digismith/cli@0.1.0-beta`'s first publish — Jack
ran `dg -v` expecting the standard version shorthand (the same convention `npm -v`, `node -v`, and
most CLIs follow) and got the dispatcher's unknown-group usage message + exit 1 instead, since
`packages/cli/src/index.ts` only recognizes the long form `--version`.

## The idea

In `packages/cli/src/index.ts`'s `main()`, treat `-v` and `-V` as aliases for `--version` —
same branch, same `readVersion()` call, same exit 0. No change to `resolveGroup`/`GROUPS`/`usage()`;
`-v`/`-V` should short-circuit before group resolution exactly like `--version` already does.

## Why not applied yet

`0.1.0-beta` is already published and immutable — npm never allows overwriting a published
version, so this needs a new version (`0.1.0-beta.1`, or whatever the next release is named) to
ship. Jack asked for it to be backlogged rather than cut as an immediate follow-up release.
