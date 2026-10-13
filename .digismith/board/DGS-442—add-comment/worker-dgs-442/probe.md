# Probe: DGS-442 add-comment

## First use, 2026-10-13 (UTC+7), after merge b0c457d and bump 9d5b290
Task DGS-436 (id 14zcebrvmq0), one comment, as ordered.

1. Dry run: `dg clickup add-comment --task DGS-436 --text '<text>'` printed `POST /task/14zcebrvmq0/comment`, the body with `notify_all: false`, the line that a second `--yes` posts a second comment, and `nothing sent; add --yes to send`. One read-only call to resolve the key.
2. `--yes`: `added comment 1301150000096070 on DGS-436 (14zcebrvmq0) ...; read back OK`, exit 0.
3. Read-back (`getTaskComments`, list of the task): 1 row, index 0, id `1301150000096070`, comment_text exactly the ordered text, date 1791882154064.

## What the probe did not settle
- Position: the task had no other comment, so the list had one row. "Newest first on the first page" is NOT verified. The read-back checks the whole first page for the id, so it passes at any position within that page. A task with more than 25 comments is untested.
- Markdown: the ordered text has no markdown characters, and I posted no second comment to test them (one comment was ordered). Whether ClickUp keeps `**bold**` as typed characters is NOT verified. `--markdown-file` stays "plain text from a file".

## Shipping
`dg` is a global pnpm link to `packages/cli`; `pnpm --filter @digismith/cli build` refreshed `dist` (not tracked). `dg clickup add-comment --help` works from the repo.
