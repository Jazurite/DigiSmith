# Provenance

Source: Superpowers plugin (claude-plugins-official marketplace)
Version: 6.2.0
Plugin cache directory: 44c9b2d6e889
Cloned: 2026-08-20

## Skills vendored (verbatim, byte-identical to source)

- brainstorming
- dispatching-parallel-agents
- executing-plans
- finishing-a-development-branch
- receiving-code-review
- requesting-code-review
- subagent-driven-development
- systematic-debugging
- test-driven-development
- using-git-worktrees
- using-superpowers
- verification-before-completion
- writing-plans
- writing-skills

## License

MIT (Jesse Vincent, 2025) — see `LICENSE` in this folder.

## Sync policy

No automated sync or diff-tracking against upstream exists, by design
(DigiSmith stays a personal tool, not a multi-source merge system). Future
upstream Superpowers improvements are pulled in manually, skill by skill,
only if and when actually wanted. See DigiSmith `MEMORY.md` map item R.

## Activation

A vendored skill above is "dormant" until a future map item R.2+ brainstorm
activates it: edits its `skills/vendored-<name>/` copy, updates DigiSmith's
own internal call sites that reference `superpowers:<name>` to reference
`digismith:<name>` instead, and records the switch in `MEMORY.md`. Until
then, every vendored skill listed above is an inert, unused copy — nothing
in DigiSmith calls into any of them.
