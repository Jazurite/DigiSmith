# Merge G (Standards) and U (Toolchain) into a new umbrella letter, "Structure"

**Status:** Not applied. Raised live 2026-09-11 mid-implementation of map item U (Toolchain) —
deliberately deferred rather than acted on immediately, so the in-flight U plan/worktree didn't
get reworked mid-task.

## The idea

Jack's read: map item **G** (Standards injection) and map item **U** (Toolchain) are "the same
domain" — both carry Jack's own established conventions/preferences into work that's about to
happen, just at different moments (G at implementation time, against code that already exists;
U at brainstorming time, before any code or spec exists — see U's own design doc,
`.digismith/docs/toolchain/design.html`, Brainstorming Integration section, for that distinction
as originally reasoned through).

Proposed shape, confirmed live during the same conversation:

- Rename map item **G**'s row title from "Standards injection" to **"Structure"**.
- **G.1** — Standards (G's existing content and mechanism: `standards/` library,
  `digismith:inject-standards`, `digismith:add-standards`/`digismith:discover-standards`) — carried
  over unchanged, just renumbered under the new umbrella letter.
- **G.2** — Toolchain (U's content and mechanism: `toolchain.yml`, `digismith:toolchain`, the
  `digismith:brainstorming` consult paragraph) — carried over unchanged, just renumbered.
- Letter **U** is freed for future reuse, same precedent as **R**, **Q**, and **H** before it.

**Explicitly not a technical merge** — this is a map-labeling change only. Neither mechanism's
storage format, skill name, script, or trigger point changes: `digismith:toolchain` stays its own
skill wrapping `toolchain.yml`, `digismith:inject-standards` stays its own skill wrapping
`standards/`. Only the map's letter/number bookkeeping and the `Map item:` field inside U's own
design doc and plan change.

## Why not applied now

Jack's own call, given live during U's implementation: capture the idea in the backlog and
continue executing U's already-approved plan as-is (map item **U**, not yet renumbered) rather
than pause mid-task to rework the plan, the in-progress worktree, or the ledger. Revisit this
relabeling once U has actually shipped, as its own small follow-up (rename G's row, add the G.1/G.2
split, remove U's row, update U's design.html/plan.md `Map item:` fields, free the letter) — not
before.

## Open questions

- Whether `G.1`/`G.2` is the final numbering Jack wants once this is actually picked up, or
  something else — confirmed live as the working answer for now, but worth a quick re-confirm
  before applying, since it was settled fast mid-flow rather than deliberated at length.
- Whether `digismith:inject-standards`'s and `digismith:toolchain`'s own doc-level references to
  their map letters (if any exist beyond MEMORY.md itself) need updating too, or whether MEMORY.md's
  table is the only place map letters are recorded as of this writing. **Answer: yes, specifically
  `skills/toolchain/SKILL.md`'s "DigiSmith's map item **U**" line and `skills/brainstorming/SKILL.md`'s
  "Toolchain defaults (map item U)" heading would both need updating.**
