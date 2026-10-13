# Probe: DGS-442 add-comment

Status 2026-10-13: first use not run yet. It runs after the Conductor's "go: merge".

## To check on the first use (comment on DGS-436)
- Text: `Lineage A.5: Scheduling created 2026-10-13 (DGS-441); DGS-434, DGS-435, DGS-439 moved in.`
- Run the dry run, then `--yes`, then read the comment back.
- Open question 1: does the read-back list the new comment on the first page, and is the list newest first? (The code does not sort; the review flagged this as unverified.)
- Open question 2: `--markdown-file` is read as plain text. Does ClickUp keep markdown characters as typed? Note what the read-back shows.
