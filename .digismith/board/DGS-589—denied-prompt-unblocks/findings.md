# Review findings

| Reviewer type | Round | Path:line | Severity | What is wrong | Failing scenario | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| task 1 | 1 | - | - | approved, no findings | - | - |
| task 2 | 1 | - | - | approved, no findings | - | - |
| task 3 | 1 | - | - | approved, no findings | - | - |
| ticket | 1 | packages/cli/src/autonomous/watch.ts:128 | Important | When herdr's status resolves a denied prompt, the healthy branch deletes the run's opened keys, so a later pass that reads no status (herdr down) or an unsure status reopens a blocked item with the same since and posts a new comment. | Run with a permission_prompt 5 min old and no later event; pass 1 status blocked opens the item; pass 2 status done resolves it; pass 3 herdr pane list fails (null map) or reads unknown: classify returns blocked with the same since, open() is not suppressed, a duplicate item and ClickUp comment are made. | fixed (d4d04d1c; r2 clean) [r2] |
| ticket | 2 | packages/cli/src/autonomous/watch.ts:136 | Minor | An answered prompt that turns lost (30 min silence) loses its <run>\|blocked key at line 136, so a later herdr-down pass reopens the same prompt as a duplicate blocked item and closes the lost item. | blocked opened; agent denied and sits idle 30 min, herdr reads idle -> lost (blocked item closed, key deleted); next pass herdr returns null -> blocked with the same since opens again | parked (out of scope: an answered prompt that turns lost loses its blocked key at watch.ts lost branch; the old code did the same) |
