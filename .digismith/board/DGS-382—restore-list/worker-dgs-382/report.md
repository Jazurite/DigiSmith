# DGS-382 report: `dg clickup restore-list` restores a deleted list from the Trash

Worker `dgs-382`, 2026-10-11 (UTC+7). Branch `dgs-382`.

## Built
- `FrontdoorClient.restoreList(listId)`: `PUT /v1/subcategory/{id}/undo`, body `{"method":"delete"}`, answer `200 {}` (Jack's capture Raw_10_11_2026_11_48_47, entry [13]). The error body is in the message of a failed call.
- `dg clickup restore-list --list <id> [--yes]`: `--list` digits only. A dry run builds no client and prints the call and "nothing sent; add --yes to send". `--yes` sends it and says "check with dg clickup get-lists (the list is back, task count)".
- Tests: client (path and body, 404 body), command (dry run, no session, `--yes`, bad ids, failed send, no session on `--yes`). Whole repo passes with `FORCE_COLOR=1`; CLI build clean.
- No allow rule: every real restore prompts for Jack.

## Not built
- Restore of a folder (`/v1/category/{id}/undo`) and of a task: they likely exist, but a capture is needed before adding them.

## Review
Claude whole-branch review: no bugs. Style notes only (success wording follows the ticket's read-back advice; kept).

## First use
None, by Jack's rule. One dry run with the made-up id `--list 1` printed the call and "nothing sent". Merged, pushed, first use pending: a real `--yes` only on a list Jack names.
