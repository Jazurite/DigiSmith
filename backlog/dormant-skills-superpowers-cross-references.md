# Dormant vendored skills' internal `superpowers:` cross-references (map item W)

**Status:** Not applied. Found during W.2.1's final whole-branch review
(2026-09-05).

**Source:** Final review (opus) of the W.2.1 branch
(`check-vendored-skills-github-source`).

## The gap

18 references to `superpowers:<name>` remain inside the bodies of the 10
vendored skills that are still dormant (byte-identical to upstream, not yet
activated per `vendored/PROVENANCE.md`). These are the skills' own internal
cross-references to each other — not this repo's call sites, which already
resolve everything through `digismith:<name>` — and they resolve correctly
today only because Jack still has the actual Superpowers plugin installed
alongside DigiSmith. Once he stops keeping it installed ("Everything is
DigiSmith," the same plan that motivated W.2.1 itself), any of these
references that get followed — a skill telling itself or a reader to go use
`superpowers:test-driven-development`, say — will fail to resolve.

Current locations (18 occurrences, 7 files):

- `skills/subagent-driven-development/SKILL.md:77,106,113,399,423,502` (6)
- `skills/writing-skills/SKILL.md:18,283,284,393` (4)
- `skills/systematic-debugging/SKILL.md:177,189` (2)
- `skills/using-superpowers/SKILL.md:30,31` (2)
- `skills/using-superpowers/references/gemini-tools.md:34,39` (2)
- `skills/writing-skills/testing-skills-with-subagents.md:13` (1)
- `skills/test-driven-development/writing-good-tests.md:51` (1)

## Why not applied yet

Explicitly out of scope for W.2.1, which only changed how
`check_vendored_skills.ts` resolves the comparison source — it doesn't
touch the vendored skill bodies themselves. Fixing this for real means
either activating each of these 10 skills (rewriting their cross-refs the
same way W.4/W.5/W.6 did for the 4 already-activated primitives) or a
smaller mechanical pass that just rewrites dormant skills' internal
`superpowers:` cross-refs to `digismith:` without otherwise touching their
content — a decision for whoever picks this up, not assumed here.
