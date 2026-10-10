Finding 1

- Severity: important
- File: `packages/cli/src/tokens/entry.ts:47-49`
- What is wrong: `readLedger()` unconditionally executes `readFileSync(flags.ledger, "utf-8")`. A missing ledger file, deleted ledger, unreadable file, or transient race causes `readFileSync` to throw. The exception propagates to the top-level handler and exits the command with status 1.
- Scenario: The finishing flow writes the snapshot immediately before SDD deletes its workspace, but the design explicitly calls out “crashes on a missing or malformed ledger” as something to avoid. Running:
  ```
  entry.ts snapshot --ticket DGS-214 --ledger .sdd-workspace/progress.md --write
  ```
  after the ledger has been removed causes the whole snapshot command to fail instead of producing a snapshot with no task rows.
- Fix: Make `readLedger()` tolerant of missing/unreadable/malformed ledgers and return `undefined` (or `{}`) with a warning. The snapshot path should still complete successfully.

Finding 2

- Severity: important
- File: `skills/adopt/SKILL.md:343-345` and `skills/subagent-driven-development/SKILL.md:117-123`
- What is wrong: Adoption now records `step-start --step implementation` before handing off to SDD, and SDD also records `step-start --step implementation` when it begins. That creates two implementation starts for the same session with no matching end between them.
- Scenario: A ticket adopted from an existing plan follows the documented path: adopt → SDD. The registry receives:
  ```
  step_start implementation
  step_start implementation
  ...
  step_end implementation
  ```
  The design defines implementation windows via explicit start/end boundaries. The extra start is not part of the approved writer matrix and produces duplicated boundary events for the same step/session.
- Fix: Record the implementation start in exactly one place. Either keep it in `adopt` or keep it in `subagent-driven-development`, but not both.

Finding 3

- Severity: important
- File: `skills/subagent-driven-development/SKILL.md:498-507` and `skills/finishing-a-development-branch/SKILL.md:280-283,340-343,358-361,387-390`
- What is wrong: The snapshot is written twice in the normal SDD path. SDD writes:
  ```
  snapshot --ledger <workspace>/progress.md --write
  ```
  before deleting the workspace, then the finishing skill writes another:
  ```
  snapshot --write
  ```
  without a ledger.
- Scenario: A completed SDD ticket reaches Finish. The first snapshot contains task rows from the ledger. The second snapshot rewrites the same file after the ledger is gone and relies on carry-forward logic from the previous snapshot. If anything about the earlier snapshot is incomplete, corrupt, or schema-mismatched, task rows disappear. The design calls for the snapshot to be written before SDD deletes the ledger; it does not require a second rewrite.
- Fix: Write the snapshot once, from the SDD finish path that still has access to the ledger, or make the finishing skill detect an existing snapshot and avoid rewriting it.

Finding 4

- Severity: minor
- File: `packages/cli/src/tokens/entry.test.ts`
- What is wrong: The design decision document explicitly calls out `/clear`, resume/continue, fork, and subagent session-id behavior as the reason for the `CLAUDE_CODE_SESSION_ID` choice, but the new tests only cover flag/env precedence, invalid env values, and missing ids.
- Scenario: `entry.ts` could regress its session-id handling around resumed/forked sessions while all slice‑2 tests still pass.
- Fix: Add tests that exercise the approved session-id resolution rules documented in `session-id-source.md`, especially the “new id after /clear” and “same id after resume/continue” cases.

Verdict: ready after fixes