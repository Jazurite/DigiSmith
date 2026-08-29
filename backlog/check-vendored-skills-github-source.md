# `check_vendored_skills.ts`: check upstream via GitHub, not the local plugin cache

**Status:** Not applied. Raw idea only — no design spec yet, needs its own brainstorm.
Tentative map sub-item **W.2.1** (a revision to W.2's already-shipped script), not part
of **W.3**.

**Source:** Raised by Jack mid-brainstorm on W.3 (2026-08-29), while discussing whether
to uninstall the Superpowers plugin entirely once DigiSmith's own call sites (W.3) no
longer need it. He confirmed he intends to stop keeping Superpowers installed going
forward ("I'm not gonna install Superpower from now on. Everything is Digi Smith").

## What this covers

W.2's `scripts/check_vendored_skills.ts` currently resolves "upstream" by reading
whatever Superpowers plugin version is installed locally
(`~/.claude/plugins/cache/claude-plugins-official/superpowers/*/skills/`, see
`resolveUpstreamSkillsDir` in that file). If Superpowers is never installed (or gets
uninstalled once nothing calls it directly, per W.3), that resolution fails —
`check_vendored_skills.ts` always reports "Superpowers plugin cache not found" and the
upstream-drift mechanism goes permanently dark, even though upstream Superpowers keeps
evolving on GitHub regardless of what's installed on this machine.

Jack's proposed fix: have the script check the actual upstream GitHub repository
(`https://github.com/obra/superpowers`, per `vendored/PROVENANCE.md`) directly —
e.g. a shallow clone to a temp dir, or the GitHub API to read file contents at a given
ref — instead of depending on local plugin installation state. This decouples
drift-checking from whether Superpowers is installed on this machine at all, which
matters once W.3 makes DigiSmith call `digismith:<name>` for every primitive it
currently uses and Jack stops keeping the upstream plugin installed for its own sake.

## Why this doesn't block W.3

W.3 is scoped to redirecting DigiSmith's own internal call sites
(`superpowers:<name>` → `digismith:<name>`) across its 10 hand-authored skill files —
a text change, not a rework of W.2's script. The two are independent: W.3 doesn't
depend on this GitHub rework, and this rework doesn't depend on W.3 having shipped.
Confirmed with Jack to keep them as separate items rather than combining into one
brainstorm.

## Open questions for its own future brainstorm

- Shallow `git clone`/`fetch` to a temp dir (keeps the existing file-tree-diff approach
  in `check_vendored_skills.ts` largely intact, just changes where "upstream" content
  comes from) vs. the GitHub REST/contents API (no git binary dependency for this part,
  but more surface area — rate limits, auth for a private fork scenario, pagination).
- Does this replace local-plugin-cache resolution entirely, or become a fallback/primary
  toggle (e.g. prefer GitHub, fall back to local cache if offline)?
- Network dependency: today's script has none (pure local git + filesystem). A
  GitHub-backed version needs to decide how to fail when offline — loud error,
  consistent with the existing "no partial report" principle from W.2's design.
- Which ref to compare against — a specific tag/release, or just the default branch's
  tip — and whether that should be configurable or hardcoded like today's baseline SHA.

## Why not applied yet

Purely a raw idea from one conversation aside, not yet run through its own brainstorm.
