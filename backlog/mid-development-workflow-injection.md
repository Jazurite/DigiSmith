# Workflow: support joining mid-development, not just from ticket start

**Status:** Not applied. Idea only. Deferred until real usage data has
been collected.

**Source:** Jack's own note, 2026-08-14.

## The idea

DigiSmith's workflow is too strict about entry point — it assumes work
starts at the beginning of its own pipeline. Need a way to inject
DigiSmith into a development flow that's already mid-stream (e.g. work
started outside DigiSmith, or an earlier stage was skipped), instead of
requiring the full pipeline from the top every time.

## Why this might matter

A rigid start-to-finish pipeline works for greenfield ticket intake but
breaks down the moment real work doesn't match that shape — resuming
someone else's branch, picking up after manual exploration, or bringing
in a ticket that's already partway done elsewhere.

## Open questions

- Which specific step(s) of the current pipeline (see
  `digismith:using-digismith`, `digismith:jira-intake`) are the ones
  that actually block mid-stream entry — not yet identified.
- Deliberately deferred by Jack until there's real friction data showing
  where this bites, rather than redesigning the pipeline speculatively.
