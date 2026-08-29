# Plugin version bump has no automation — belongs in a future CI/CD pipeline, not a skill step

**Status:** Not applied. Finding only — no ticket, no code touched.

**Source:** 2026-08-29, discovered during W.3's (call-site-cutover) final-review fix wave.

## What happened

The installed DigiSmith plugin cache is version-keyed
(`~/.claude/plugins/cache/jazurite/digismith/<version>/`) and only refreshes
when `.claude-plugin/plugin.json`'s `"version"` actually changes. Checking
`git log` against the last real bump (`0.13.0-beta`, 2026-08-27, for I.1)
turned up **7 merges into `main` since then that shipped without ever
bumping the version**: K.2 (implementer-offload), V (depot), V.1
(depot-opencode-server), I.1's REST-migration fix, W.2
(primitive-activation-mechanism), K.3 (ai-gateway-vendors), and W.3
(call-site-cutover) itself. W.3's own final review only caught this because
it happened to be the branch that made the gap load-bearing (every
DigiSmith entry point now says `digismith:<name>` instead of
`superpowers:<name>`, so an unrefreshed cache means none of those names
resolve). The version was corrected to `0.20.0-beta` by hand
(`b9447c1`) — one bump per missed shipment.

## Why this is a real, recurring gap, not a one-off

Nothing currently makes bumping the version part of merging a DigiSmith
feature — it's a manual step a human or an implementer has to remember,
and it's now been missed **seven times**, not the "four" the W.3 review
first estimated (that count only covered the branches its reviewer
happened to check for skill-resolution purposes, not a full audit).
Every future merge to `main` will keep silently drifting the installed
plugin further behind until something enforces the bump automatically.

## Where this belongs — Jack's call, overriding the W.3 review's suggestion

The W.3 final review suggested folding a "bump version" step into
`superpowers:finishing-a-development-branch`'s own flow or into a
DigiSmith-side merge checklist (skill-level enforcement, same shape as
[[no-push-after-local-merge]]). **Jack's read: this isn't a
`finishing-a-development-branch` fix — it's part of a future CI/CD
pipeline for DigiSmith itself.** Likely shape: a GitHub Actions (or
equivalent) workflow on `main` that computes and commits the next integer
SemVer minor bump automatically on every merge, rather than relying on a
skill step a human/implementer has to remember to invoke. No such
pipeline exists yet for this repo — this item is the seed for that
future work, not a design.

## Not yet decided

- Whether the automation lives in a GitHub Actions workflow, a git hook,
  or something else — no CI/CD infrastructure exists in this repo today.
- Whether it should also trigger the plugin cache reinstall itself, or
  only the version bump (reinstall may still require a session
  restart/plugin-update action regardless — see
  [[plugin-cache-lag-self-development]]).
- No map letter reserved yet; this is a future brainstorm, not scoped
  here.
