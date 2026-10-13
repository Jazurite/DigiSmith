# Report: DGS-442 `dg clickup add-comment`

## Summary
`dg clickup add-comment --task <id|key> (--text | --markdown-file) [--yes]` is built, tested and merge-ready. It is a dry run unless `--yes`. With `--yes` it posts, then reads the comments back and looks for the new comment id. `notify_all` is always false. A second `--yes` posts a second comment; the dry run says so. `--markdown-file` reads the file as plain text; ClickUp does not convert it, and `--help` says so.

## What changed
- `packages/clickup-client`: `addTaskComment`, `getTaskComments`, `commentBody` (the one place the body is built), comment types.
- `packages/cli/src/clickup/add-comment.ts` and its test; registered in `index.ts`; one README line.
- Tests: 84 client, 681 CLI, all pass. The CLI tests and code were written together, not red first; the client test was red first.

## Review
Review done: independent `code-review` agent (high) over b662b33..HEAD, 8 findings.
- Fixed: (1) a failed read-back after the post now says "sent, do not send again"; (3) a flag given twice is refused; (4) the dry run and the client share `commentBody`; (6) a leading BOM is stripped.
- Not fixed: (2) first page and newest-first order are unverified; checked on the first use (see `probe.md`). (5) shared scaffolding with `relation-write.ts`: left as is, one more command does not justify a helper yet. (7) `exitCode = 0` copies the existing pattern. (8) import placement is cosmetic.

## Not done
- No allow rule in `.claude/settings.json` (add-link has one). The Conductor decides.
- First use on DGS-436 waits for "go: merge".
