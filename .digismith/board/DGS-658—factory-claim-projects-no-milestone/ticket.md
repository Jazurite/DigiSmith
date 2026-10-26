# Factory claim: no milestone needed for Projects tickets (DGS-658)

**Key:** DGS-658
**URL:** https://app.clickup.com/t/14zcebrwmwd
**List:** B.5 Autonomous Engineering. **Priority:** high. **Sign-off:** Auto. **Milestone link:** DGS-548.
**Story Points:** TBD

## Description

The factory (`dg autonomous scan`) claims a ticket only with a milestone link. Milestones are DigiSmith's roadmap; work in the
Projects folder (Emma, personal) has none, so the factory can never claim it. First case: DGS-652 and DGS-654.
Jack 2026-10-26: "No milestone, this is Emma."

Full text: `dg clickup get-task DGS-658`. Order: `~/.digismith-depot/sessions/DigiSmith/orders/order-sv-06-dgs-658-build.md`.

## Acceptance Criteria

- A ticket whose list sits in the Projects folder (`1301150000003307`) is ready without a milestone.
- A clan ticket with no milestone is still refused with `REASON.milestone`.
- Sign-off stays required everywhere. The missing "Sign-off" field on the Projects lists is an open item for Jack (ClickUp UI), not part of this change.
- Dry run shows DGS-652 and DGS-654 refused only for Sign-off.
