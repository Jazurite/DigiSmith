# Decouple @digismith/cli from Depot into its own letter, U

## Status
Letter assigned 2026-09-19, per Jack's direct request. No code has moved yet — this file
records the decision and scope so whoever picks up U next (or V, whose lineage this is coming
out of) starts from real context instead of a cold brainstorm.

## Why
`@digismith/cli` (`packages/cli`) was built under **V.4** as "Depot's CLI surface" — a
publishing vehicle for V.3's VPS `status`/`connect` commands. **V.5** then added a second
command group (`dg depot clone|opencode|bridge ensure|refresh|stop`) directly tying the package
to Depot's own resource-management concern. Jack's call: the CLI itself — the binaries, the
dispatcher, the package/publishing mechanics — is a distinct concern from Depot's `ensure-*`
resource lifecycle, and deserves to be "fully decoupled" rather than staying a V sub-item that
happens to also host V's own commands.

## What actually moves
- **Stays conceptually the same, ownership changes:** `packages/cli`'s binaries (`digismith`,
  `dg`), its dispatcher/command-registration framework, build tooling (`tsc` → `dist/`),
  publishing mechanics (`pnpm publish --access public`, own semver starting `0.1.0-beta`) — all
  of this becomes **U**'s to own and evolve.
- **V's own command groups become consumers, not owners:** the `vps` command group (V.3's code)
  and the `depot` command group (V.5's code) keep their content and behavior, but register into
  U's CLI framework as consumers — the same shape as Q.1's `generate-comment` being consumed by
  I.1/I.4 rather than owning them.
- **The "login / save credentials / connect to our server" half of the original CLI vision**
  (deliberately out of scope per V.4's own note, pending letter **X**'s server-with-real-auth)
  stays exactly as undecided as it was — this split doesn't resolve it, just relocates which
  letter would eventually own building it.

## Open questions for whoever scopes this for real
- Does the actual package (`packages/cli`) move location in the repo, or does ownership change
  without a physical move? (Probably no move needed — map-letter ownership is a documentation/
  responsibility concept, not a folder-structure one, per how V.4/V.5 already coexisted with
  V.1-V.3's non-CLI code.)
- Does V.5's `depot` command-registration code need any real refactor to become a "consumer," or
  is it already structured that way and this is purely a documentation/ownership reassignment?
- First real U-owned work, once this settles: likely whatever's next for the CLI itself
  (auto-publish via a `post-finish` hook was already flagged as future work in V.4's own note).

## How to apply
Read this file plus V.4/V.5's existing design docs (`.digismith/docs/digismith-cli-npm/`,
`.digismith/docs/depot-cli-command-group/`) before scoping U's first real plan — don't re-derive
the CLI's existing shape from scratch.
