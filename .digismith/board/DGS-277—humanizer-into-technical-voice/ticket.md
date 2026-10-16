# Absorb humanizer into the H.1 technical-voice standard

**Key:** DGS-277
**Source:** ClickUp DGS-277, list H.1 Technical voice (clan H: Whisper). Status: in progress. Milestone: V1.1 (DGS-470).

## Description
Original ticket: "Writing standard: cluster restraint, preserve list and a bigger tell catalog (T.1 follow-up)".
Flag AI-writing tells only when they cluster, protect signs of human writing from over-editing, grow the tell catalog,
add a mark-draft-check-final revision loop.

Jack's decision (2026-10-16): absorb blader/humanizer (MIT, v3.1.0, commit `225a6f3`) into DigiSmith's own voice system.
**No standalone humanizer skill or plugin.** Its patterns, the "weak alone" restraint, the "When not to act" preserve list and
the mark-draft-check-final loop go into `standards/global/ste100-*.md` (new companion files allowed). They reach artifacts
through the existing inject-standards Voice Gate. Credit the source (name, MIT, pinned commit).

First real use: Jack's proposal, written in another session and reviewed with the Whisper voice.

## Acceptance criteria
- Humanizer patterns, restraint rule, preserve list and revision loop live in `standards/global/ste100-*.md`.
- They load through the inject-standards Voice Gate; `index.yml` is rebuilt.
- The source is credited: blader/humanizer, MIT, commit `225a6f3`.
- No standalone humanizer skill or plugin.

## Open questions for Jack (via the conductor)
1. No-em-dash rule and sentence-case headings: hard rules or "weak alone"?
2. Scope: H.1 artifacts only, or also proposals (H.5 Business voice)? One shared tell catalog or H.1 only for now?
3. Pattern 26 (re-explaining what the reader knows): in H.2 Conversation voice in this ticket, or a linked H.2 ticket?
4. A review mode on a draft file: inside `digismith:voice`, or not in this ticket?
