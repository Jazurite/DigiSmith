# Review findings

| Reviewer type | Round | Path:line | Severity | What is wrong | Failing scenario | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| ticket | 1 | packages/cli/src/salvage/secrets.ts:17 | Minor | The .yml/.yaml harmless-extension skip lets real secret stores such as secrets.yaml or a Kubernetes db-secret.yaml pass the salvage check. | A worktree holds an untracked k8s/db-secret.yaml with real credentials; dg salvage commits it and pushes the rescue branch with no refusal. | fixed (e96ed0b; Maestro ruling: yaml skips only the token match) |
| ticket | 2 | - | - | approved, no findings | - | - |
