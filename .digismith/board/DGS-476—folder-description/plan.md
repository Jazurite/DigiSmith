# DGS-476 plan: set a folder description with dg clickup update-folder

Checkpoint 1 approved by the conductor (2026-10-13). Test-first.

Request shape (from the Frontdoor capture of the web app, headers never read):
- Write: `PUT /hierarchy/v1/category/{folderId}`, body `{"content": "<Quill delta as a JSON string>"}`. Answer: `{"category": {..., "content": ...}}`.
- Read: `GET /hierarchy/v1/category/{folderId}` answers the folder flat, with `content` (delta string).
- Delta: per line one text op and one `"\n"` op with `attributes: {"block-id": "block-" + 10 letters/digits}`.

1. `frontdoor.test.ts`: PUT path and body, GET path, round trips (quotes, backslashes, newlines, unicode, trailing newline), one block id per newline, null/missing/broken content. Red.
2. `frontdoor.ts`: `folderDescriptionDelta`, `folderDescriptionText`, `setFolderDescription`, `getFolderDescription`; export from `index.ts`. Green.
3. `update-folder.test.ts`: dry run (no client built), `--yes` set and read back, mismatch, file input, exclusive options, blank refused, name plus description order, failures exit 1. Red.
4. `update-folder.ts`: `--description`, `--description-file`, `--name` optional. Green. Update `--help`.
5. Full suite, `pnpm --filter @digismith/cli build`, dry run with a folder id from `dg clickup get-lists`.
6. Claude whole-branch review; fix verified findings.
7. report.md, report.html, plan.md committed together by named paths. Stop before the merge; merge only on "go: merge".
