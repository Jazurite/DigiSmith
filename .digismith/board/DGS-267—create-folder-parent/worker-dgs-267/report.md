# DGS-267 report: create-folder --parent-folder

Status: built and committed on branch dgs-267-create-folder-parent, not pushed, not merged (merge order: fifth). First use, after the merge and by the conductor: dry run only; a real create needs Jack.

- `dg clickup create-folder --name <n> [--parent-folder <id>] [--yes]`. Without `--parent-folder`: unchanged (creates at once). With it: create at the top level (`POST /space/{id}/folder`), then move (`PUT /folder/{new id}/position`, the client's `moveFolder`), then read back with `getFolder`. A dry run unless `--yes`; the dry run builds no client and shows `<new folder id>` as the placeholder. `--yes` alone and a non-digit parent are refused before any call.
- Create ok, move fails: exit 1; prints the new folder id, its name, "nothing was deleted" and the line `dg clickup move-folder --folder <id> --parent <p> --yes`. Read-back failure alone: exit 0 with a note.
- Files: `create-folder.ts`, `create-folder.test.ts`. No client change, no allow rule.
- Tests: create-folder file base 1 describe / 2 tests; now 2 describes / 8 tests (old 2 kept, 6 new). Full run: 1857 passed, 1 failed (`depot/process-lifecycle.test.ts`, a 5s real-process start timeout under load from parallel workers; passes alone, 30/30). tsc clean on the CLI package.
- Dry run by hand printed both calls; `--yes` without `--parent-folder` printed the error.
