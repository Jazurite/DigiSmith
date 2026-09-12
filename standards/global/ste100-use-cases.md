# ASD-STE100 Use Cases

Per-genre patterns for applying `global/ste100-writing.md` and
`global/ste100-word-swaps.md`. Adapted from
[AminBlg/SimpleEnglish](https://github.com/AminBlg/SimpleEnglish) (MIT).

## Error messages and CLI output

**DigiSmith fit:** `@digismith/cli`'s own output.

An error message is an instruction to a stressed reader, so it's a
high-value target. State what happened (simple past), state the cause if
known, give the command or condition that fixes it.

> Before: Oops! Something went wrong while attempting to establish a
> connection. Please ensure your credentials are properly configured and
> try again.
>
> After: Connection to the database failed. The password for user `app`
> was not correct. Set `DB_PASSWORD` and connect again.

## Runbooks and standard operating procedures

**DigiSmith fit:** none yet — kept as forward-looking reference.

Every step is imperative, one instruction per step, condition first. A
warning comes before the step it protects. Inside the warning itself,
state the command first and the risk second. The 20-word sentence-length
limit is not negotiable here — a reader under pager stress reads each
sentence once.

## Incident reports and postmortems

**DigiSmith fit:** none yet — kept as forward-looking reference.

Simple past only. A timeline in present perfect ("we have identified")
hides when things happened. State what is known and say "unknown" for the
rest — but never at the cost of the hedge-preservation rule in
`global/ste100-writing.md`. The example below states a time window, a
failure rate, and a cause as fact only because those were confirmed after
investigation. If a cause genuinely isn't confirmed, keep the hedge ("may
have been caused by") instead of asserting one for a cleaner sentence.

> Before: We have identified an issue that may have impacted some users'
> ability to access the service.
>
> After: Between 14:02 and 14:31 UTC, 12% of requests failed. A deploy at
> 14:00 removed the cache warmup step.

## Commit messages and PR descriptions

**DigiSmith fit:** real and current — `global/commit-style.md` and
`global/pr-descriptions.md` set the shape (title-only commits, short plain
PR bodies). This file only tightens the sentence-level wording within
that shape, for the same reader-clarity reason, and never adds structure
those standards don't already allow.

Commit messages have no body to apply sentence-level rules to at all —
`global/commit-style.md` is title-only. Apply the word swaps to the title.

For a PR description: apply the word swaps and the 25-word limit per
sentence. Delete "this PR aims to." Where this file's own structural
rules ("Lists for sequences," "Paragraph limits") would add headers or
checklists, `global/pr-descriptions.md` wins — it explicitly bans that
shape.

## API changelogs and release notes

**DigiSmith fit:** none yet — kept as forward-looking reference.

One entry, one change, one sentence where possible. A breaking-change
entry follows the warning pattern, command first: "Update your calls to
`v2/users`. The `name` field split into `first_name` and `last_name`."

## Instructions for AI agents (prompts, SKILL.md files)

**DigiSmith fit:** intended, not yet enforced — no skill currently checks
`SKILL.md` prose against this standard, and existing `SKILL.md` files
predate it (many already use "e.g."). Apply it to new or edited prose,
not as a retroactive audit of what's already there.

For imperative framing, hedged instructions, and when directive language
helps versus backfires, see `digismith:writing-skills` — that skill owns
the judgment call on how forceful to be. This file adds only the
sentence-shape rules on top: one instruction per sentence keeps each rule
quotable and hard to half-follow, and one word, one meaning stops a model
from treating "check", "verify", and "validate" as three different
operations.

## Support macros and status-page updates

**DigiSmith fit:** none yet — kept as forward-looking reference.

25-word limit. Not "we sincerely apologize for any inconvenience this may
have caused" but "The API was down for 18 minutes. Uploads made during
this time were saved and will process today."

## Translation and localization prep

**DigiSmith fit:** none yet — kept as forward-looking reference.

One meaning per word plus complete grammar (articles, "that") removes most
translation ambiguity — relevant if any DigiSmith-generated text is ever
localized.

## UI copy and empty states

**DigiSmith fit:** none yet — kept as forward-looking reference. DigiSmith
has no end-user UI today.

Buttons and labels are technical names and are exempt. Body copy follows
the rules: "No projects yet. Create a project to start."

## Where this doesn't fit

Marketing pages, launch posts, blog voice, brand writing. This standard
deletes persuasion on purpose — write those in your own voice instead.
