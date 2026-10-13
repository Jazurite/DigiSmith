# DGS-476 report: set a folder description with dg clickup update-folder

Date: 2026-10-13. Branch `DGS-476__folder-description` (worktree `.worktrees/dgs-476`). Not merged.

## Summary
`dg clickup update-folder --folder <id> [--name <n>] [--description <text> | --description-file <path>]`. A description goes through Frontdoor: `PUT /hierarchy/v1/category/{id}` with `{"content": "<Quill delta string>"}`. Dry run unless `--yes`; with `--yes` it reads the folder back (`GET /hierarchy/v1/category/{id}`, no query string in the code) and exits 1 when the text differs. `--name` alone works as before; with both, the rename goes first through the public API.

## Details
- Delta: one text op per line (none for an empty line) and one `"\n"` op per line with `attributes: {"block-id": "block-" + 10 letters/digits}`. A final newline is added when missing; CRLF becomes LF.
- block-id: in the capture, every newline op had one (4 of 4: three in the folder's own content, one the web app made for the new line, in the 10-character form; older ones are UUID form). One edit only, so "always" is not proven. The code sends a generated one per newline.
- Read-back: the plain GET is **not verified** against ClickUp; the capture shows only the GET with a long query string (`include_views`, `standard`, ...). If the plain GET answers without `content`, the command exits 1 with "answered with no content field"; first use verifies. Fallback: add `?standard=true&v2=true`.
- Not verified either: that ClickUp accepts a newline op without a block-id (the code always sends one), and that it keeps the text unchanged (a server-side trim would make the read-back fail).
- Plain text only. Repeated flags (`--description a --description b`, also `--name`, `--description-file`) are refused. A text starting with `-` needs `--description=<text>` or `--description-file` (yargs); the help says so.
- Tests: client round trips (plain, quotes, backslashes, newlines, unicode, trailing newline, only newlines), one id per newline, null/missing/broken content; command dry run (no client built), `--yes`, mismatch, file input, exclusive options, blank refused, rename-then-describe order, failures exit 1. Full suite: 2274 pass before the review fixes; the CLI build passes.
- Review (independent Claude, whole branch): no data bug; three findings fixed (repeated flags, CRLF, leading `-` documented).

## Follow-ups
- `--clear-description` (not built, YAGNI).
- First use by the DigiSmith Maestro (the DGS-474 texts): verify the plain GET read-back and the missing block-id question.
