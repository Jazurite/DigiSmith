# Real Claude Code `SessionStart` hook to init DigiSmith (tentatively W.10)

**Status:** Not applied. Raw idea only, no design spec yet — needs `digismith:brainstorming`
before becoming a feature. Surfaced 2026-09-22 during a T-lineage brainstorm (voice selection,
see `backlog/ai-voice-selection-t7.md` once that lands) once it became clear that neither
`bootstrap`/`adopt` (fires on ticket start, via `digismith:init`) nor `inject-standards` (fires on
coding/planning/dispatch) cover a plain conversation with no ticket or task attached — there is no
DigiSmith mechanism today that runs on Claude Code's actual `SessionStart` hook event.

## What this covers

A real `settings.json` `SessionStart` hook (the harness-native mechanism — distinct from
DigiSmith's own `.digismith/hooks/<point>/` convention used by lifecycle point **Y**, which fires
on DigiSmith's own SDLC points like `post-finish`, not on literal session start) that inits
DigiSmith at the start of every Claude Code session in a repo where DigiSmith is installed.

**Scoping decision (Jack, live, 2026-09-22):** this hook's init sequence should immediately include
invoking `digismith:voice`'s activation step — reading `.digismith/preferences.yml` and silently
loading whichever voices are ON for that repo (see the T-lineage voice-selection item) — as part of
`SessionStart`, not as a separate follow-up mechanism. This is what closes the "plain conversation
never gets an auto-loaded voice" gap identified during that brainstorm.

## Why not applied yet

Raw idea, no real brainstorm yet — needs its own `digismith:brainstorming` session (this is
**W**'s lineage's own territory per Jack's call, not Y's, even though it's conceptually adjacent
to Y's lifecycle-hook mechanism). Open questions for that brainstorm:

- What else, besides voice activation, belongs in this hook's init sequence? (profile resolution?
  preferences load in general, not just voice?)
- Hook scope: DigiSmith's own repo only, or every repo DigiSmith is installed into?
- Failure mode if the hook errors — silent skip vs. surfaced warning?
