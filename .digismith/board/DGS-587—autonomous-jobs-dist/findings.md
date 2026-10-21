# Review findings

| Reviewer type | Round | Path:line | Severity | What is wrong | Failing scenario | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| ticket | 1 | packages/cli/src/strip-types.smoke.test.ts:10 | Minor | The smoke test loads only the import graph of index.ts, so syntax that type stripping refuses in test or test-util files under packages/cli/src is not detected. | A later change adds `constructor(public x: T) {}` to a *.test-util.ts file: vitest passes, the smoke test passes, and the acceptance criterion 'no file under packages/cli/src uses such syntax' is silently broken. | fixed (commit 90d76de: stripTypeScriptTypes over every .ts file under packages/cli/src; erasableSyntaxOnly not used, tsconfig.build.json excludes test files) [r2] |
| ticket | 2 | - | - | approved, no findings | - | - |
