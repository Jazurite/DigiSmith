# DGS-230 plan: --markdown-description

Scope: `create-task` and `update-task` get `--markdown-description <text>` and `--markdown-description-file <path>` (API field `markdown_description`).
`get-task` gets `--markdown` (`include_markdown_description=true`) to read it back.

Rules:
- `--description`, `--markdown-description`, `--markdown-description-file` are mutually exclusive: refuse any two together (no silent winner).
- File is read as UTF-8 in `buildTaskWriteBody` (lib.ts), same error text style as update-list.
- Type `markdown_description` added to `ClickUpTaskWriteBody`.

Steps (TDD, mocks only for writes):
1. lib.test.ts: failing tests for body build, file read, conflicts. Then lib.ts + types.
2. create-task / update-task: options, tests with mocked client.
3. get-task --markdown test, then code.
4. README, full tests, rebuild dist, one real proof on DGS-230.
