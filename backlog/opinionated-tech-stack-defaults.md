# Opinionated default tech stack (new letter, tentatively U)

**Status:** Not applied. Raw idea only — no map letter formally added
yet, no design spec, needs `superpowers:brainstorming` before becoming
a skill/mechanism. (`T` is already tentatively claimed by
[[technical-writing-content-voice.md]] — this would be the next free
letter, not committed in `MEMORY.md`'s map table yet.)

**Source:** Surfaced mid-brainstorm on the Jira REST-migration spec
(2026-08-27). The brainstorming flow asked "which test runner?" as a
fresh multiple-choice `AskUserQuestion`, Jack answered Vitest, then
immediately volunteered SCSS (styling) and Playwright (E2E) as also
being standing defaults — unprompted, and not something the session had
any way to know going in. That "etc." implies the real list is longer
than these three and currently exists only in Jack's head.

## What this covers

Jack has a personal default tech stack for common tooling decisions —
test runner, styling approach, E2E framework, and presumably others not
yet named. Right now, every brainstorm that hits one of these decisions
either burns a question round re-asking something already decided, or
risks a session picking something else and Jack having to catch and
correct it after the fact (higher cost than just asking).

**Known so far (seed data, not exhaustive):**
- Test runner: Vitest
- Styling: SCSS
- E2E: Playwright

Also observed in the same brainstorm, though not explicitly named as a
"standing default" the way the three above were — worth confirming
rather than assuming these generalize:
- TypeScript preferred over Python for a new script/package where
  there's no existing precedent to match instead (this session's Jira
  client picked TypeScript over matching K.1's Python precedent,
  specifically because it was Jack's stated instinct).
- pnpm for workspace/package management on this machine (already used
  for K.2's OpenCode install; carried into this session's monorepo
  decision without objection).

## Why this doesn't obviously fold into an existing map item

Map item **G** (Standards injection) already carries "Jack's coding
standards + style guide... into every implementer subagent's brief" —
but that's consumed at *implementation* time, against code that already
exists in a target repo. This gap is earlier in the lifecycle: it's
consulted during *brainstorming's* "Exploring approaches" /
clarifying-questions step, before any code or even a spec exists, for
greenfield tool/stack selection rather than in-codebase style
conformance. Genuinely unclear whether the right shape is:

- Extend **G**'s existing `standards/` mechanism with a new category
  (e.g. `standards/tooling-defaults.md`, alongside `global`/`shopify`/
  `team`) and have brainstorming consult it the same way it already
  consults standards, or
- A new, separate letter/mechanism specifically for
  brainstorming-time defaults, since "what test runner do you prefer"
  and "how do you format a switch statement" are different kinds of
  question answered at different moments.

Needs `superpowers:brainstorming` to actually decide, not guessed here.

## Suggested shape (unrefined)

- A durable, dictatable list (domain → default choice), grown the same
  way `digismith:add-standards` already lets Jack dictate a standard
  directly rather than extracting one from a codebase — this is the
  same kind of "record a preference before it's re-discovered the hard
  way" mechanism, just for stack/tool choices instead of code style.
- Whatever currently drives `AskUserQuestion` choices during
  brainstorming (Superpowers' own skill, which DigiSmith augments but
  never replaces per `MEMORY.md`'s philosophy) would need a seam to
  check this list first and skip/pre-fill the question when a domain
  already has a standing default — same shape of problem map item **B**
  already solves for ticket context, just for tooling choices instead.

## Why not applied yet

Single-session observation from one brainstorm, not yet run through
`superpowers:brainstorming`. The seed list above is known to be
incomplete — Jack referenced "etc." — so even before a mechanism gets
designed, the list itself needs a proper dictation pass to capture what
else is in there.
