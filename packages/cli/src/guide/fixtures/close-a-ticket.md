**Adopted by Jack on 2026-11-14 UTC+7 ("Yes, adopt it"). Kind: Process.**

**Group:** Ticket lifecycle · **Ticket:** DGS-758

## What it is

Closing a ticket moves it to `done` (or out of the way: `discarded`, `Closed`) once its work is finished. The Sign-off mark on the ticket decides who may say "finished". The Steward makes every move; nobody sets a status by hand.

## When to use it

*   A build ticket is merged and pushed (the merge-and-finish guide ran).
*   A ticket with no merge is finished: a decision, a shaping or inventory ticket, a guide page.
*   A ticket is dropped (`discard`) or no longer applies (`close`).

## Who decides

| Sign-off | Finished means | Who says so |
| ---| ---| --- |
| Auto | merged and pushed | nobody: the `merged` event moves it to `done` |
| Jack | Jack has seen it and said yes | Jack only. The ticket waits in `acceptance`; the Maestro or a conductor never marks it done for him |
| none (unmarked) | merged, pushed, and the first real use checked | the Maestro or the conductor, then `verified` |

Never close an epic that still has open tickets (see Guide: close an epic).

## Steps

### A. A ticket with a merge

1. Check the merge is on `origin/main`:

`git fetch && git log origin/main --oneline -5`

2. Record the merge (from the repo folder, see Rules):

`dg steward event merged --ticket <KEY> --by <you> --sha <merge sha>`
*   Sign-off Auto: the ticket goes to `done`. Stop here.
*   Sign-off Jack: the ticket goes to `acceptance`. Go to step 3.
*   Unmarked: the merge is recorded, the ticket stays in `review`. Go to step 4.

3. Sign-off Jack: show Jack the result (a preview, the page, the command output). Send his answer with his own words:

`dg steward event accepted --ticket <KEY> --answer yes --quote "<Jack's words>"`

A "no" sends it back to `refinement` with his comment: `--answer no --quote "<his reason>"`.

4. Unmarked: use the change once for real (run the command, open the page, fire the hook) and read the result back. Then:

`dg steward event verified --ticket <KEY> --by <you>`

5. Tell Jack in one line what is now done.

### B. A ticket without a merge

1. The ticket must be `in progress`.
2. Sign-off Jack: ask Jack and wait for his yes. Sign-off Auto: the Maestro's own approval line is the quote.
3. `dg steward event completed --ticket <KEY> --by <you> --quote "<the approver's words>"`

### C. Drop or close a ticket

Only on Jack's word: `dg steward event discard --ticket <KEY> --quote "<Jack's words>"` (dropped), or `close` (no longer applies). Tickets are never deleted.

## What the Steward does for you

*   `done` sets the **due date** (today); `started` set the **start date** earlier. Both are required on a done ticket.
*   Every move is read back and written to the Steward log.

## Rules

*   Run `dg steward event` **from the DigiSmith repo folder**. Outside it, it finds no profile, does nothing and still exits 0 (bug DGS-747).
*   Close in the same step the work finishes. Do not ask "should I set it done?" when the rules above already decide.
*   Still ask when only part of the work is done: file the rest as a new ticket first, then close.
*   A ticket that belongs to another Maestro's epic is closed by that Maestro.

## Exceptions

*   The Steward refuses an event from the wrong status (for example `completed` from `refinement`). Walk the ticket through the missing events (`approved`, `started`) instead of setting a status by hand.
*   An epic: the Steward cannot move it from `backlog`; see Guide: start an epic and Guide: close an epic.

## The skill that runs it

`digismith:finishing-a-development-branch` sends `merged` after a merge. The Maestro sends `accepted`, `verified`, `completed`, `discard` and `close` by hand. Source of the rules: DGS-731 (status flow) and the Steward's rules (`packages/cli/src/steward/rules.ts`).

* * *

Original ticket text: User-manual page (group: Ticket lifecycle) for epic DGS-740, from the DGS-82 list. When a ticket counts as done: the done rules for Auto, Jack and unmarked tickets, start and due dates, the Steward events. Today's sources: memory notes done-after-merge and ticket-priority-and-dates, DGS-731. Write down what we do today; a process change is its own ticket. Drafted, shown to Jack, done only on his yes (Sign-off Jack, Mode Manual).
