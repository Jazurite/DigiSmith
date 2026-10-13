# DGS-404 report: role architecture (design)

Ticket: DGS-404. Date: 2026-10-13. Design only, no code. Approved by Jack 2026-10-13.

## Summary
The role architecture is designed: Jack at the top, then Maestro (outside herdr, manual, thin), Conductor (inside herdr, persistent, automated), Worker; Scout, Reviewer and Observer are read-only helpers. The Representative (DGS-203) is a conductor under a mandate. Authority is a fixed ceiling per role that a mandate can only narrow; deletes follow an ownership rule.

## Built
- `design.md` and `design.html`: role table, authority ladder (alone, needs the role above, always needs Jack), session card, how roles talk, the Catch-up report and its template, state locations, lifecycle and cleanup, enforcement, open questions, follow-ups.
- Follow-up tickets, each linked to DGS-402 and DGS-404:
  - I.7 Identity: DGS-417 (card format and depot layout), DGS-418 (session hooks), DGS-424 (migrate old session folders).
  - I.6 Roles and Permissions: DGS-419 (permission profiles), DGS-420 (mandate format), DGS-421 (ownership delete check), DGS-422 (conductor state and consult flow), DGS-423 (Maestro to Maestro), DGS-425 (close out superseded role tickets), DGS-426 (authenticate orders), DGS-428 (catch-up behaviour).
  - E.5 Templates: DGS-427 (catch-up template), also linked to DGS-416 and DGS-428.

## Not done
No code, no ticket status changes for the old role tickets (DGS-425), no move of the old `.digismith/sessions/` folders (DGS-424). Eight open questions stay open in design section 11.

## Review
No whole-branch review: design-only change (Jack's order). Jack approved the design after four revisions of the Catch-up section.
