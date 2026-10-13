# DGS-267 report: create-folder --parent-folder

Status: built and committed on branch dgs-267-create-folder-parent, not pushed, not merged (merge order: fifth). First use, after the merge and by the conductor: dry run only; a real create needs Jack.

- `dg clickup create-folder --name <n> [--parent-folder <id>] [--yes]`. Without `--parent-folder`: unchanged (creates at once). With it: create at the top level (`POST /space/{id}/folder`), then move (`PUT /folder/{new id}/position`, the client's `moveFolder`), then read back with `getFolder`. A dry run unless `--yes`; the dry run builds no client and shows `<new folder id>` as the placeholder. `--yes` alone, a non-digit parent and an empty name are refused before any call.
- Create ok, move fails: exit 1; prints the new folder id, its name, "nothing was deleted" and the line `dg clickup move-folder --folder <id> --parent <p> --yes`. The read-back compares the parent: another parent prints `MISMATCH: ...` with the move-folder command and exits 1; no parent or a failed read-back prints `parent not confirmed` / `read-back failed` (never "inside") and exits 0. A create answer with no id stops before the move.
- Files: `create-folder.ts`, `create-folder.test.ts`. No client change, no allow rule.
- Tests: create-folder file base 1 describe / 2 tests; now 2 describes / 14 tests (old 2 kept, 12 new; the validation test is split, the empty-name test runs for "" and "   "). Full run after the review fixes: 1864 passed, 0 failed (132 files). An earlier run had one `depot/process-lifecycle.test.ts` timeout under load; it passes alone. tsc clean on the CLI package.
- Dry run by hand printed both calls; `--yes` without `--parent-folder` printed the error.

## Review (Claude whole-branch review: ready after fixes, 6 findings, all fixed)
1. Read-back now compares the parent: mismatch warns and exits 1; null parent says "not confirmed". Tests for both.
2. Empty or whitespace `--name` refused before the dry run, on the `--parent-folder` path. The old path is left untouched and has the same gap.
3. Throw right after the create if the answer has no id, naming the folder. Test.
4. The move-fail test asserts "nothing was deleted".
5. The validation test is one case per test; tests added for 1, 2 and 3.
6. plan.md and this report use the real output strings.
