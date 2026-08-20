# Provenance

Source: Superpowers plugin (claude-plugins-official marketplace)
Upstream repository: https://github.com/obra/superpowers
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
activates it. Until then, every vendored skill listed above is an inert,
unused copy — nothing in DigiSmith calls into any of them. Activating one
means:

- Editing its `skills/vendored-<name>/` copy with the actual content
  changes wanted.
- Updating DigiSmith's own internal call sites that reference
  `superpowers:<name>` to reference `digismith:<name>` instead.
- Rewriting any internal `superpowers:<name>` cross-references inside the
  activated skill's own body (e.g. one skill's file telling the reader to
  "use `superpowers:finishing-a-development-branch`") so it points at the
  vendored/activated copy instead of chaining back to the still-live
  upstream skill — covered at a high level by the design spec's Error
  Handling section; noted here explicitly since this is the checklist
  someone actually opens at activation time.
- Deconflicting the `description:` frontmatter field from the
  still-active `superpowers:<name>` original, so automatic skill
  selection can't pick the wrong one once content diverges. Today both
  descriptions are identical and harmless (bodies are identical too, and
  DigiSmith's call sites are always explicitly prefix-qualified), but that
  stops being true the moment a vendored copy's content changes.
- Recording the switch in `MEMORY.md`.

Known stale path to fix during `brainstorming`'s activation specifically:
`skills/vendored-brainstorming/SKILL.md` (around line 151) references
`skills/brainstorming/visual-companion.md`, which doesn't exist — the file
actually vendored to is `skills/vendored-brainstorming/visual-companion.md`.
Left uncorrected in this slice on purpose (a byte-identical clone makes
zero content edits); fix it when `brainstorming` is activated.
