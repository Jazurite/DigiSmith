# DGS-493 report: dg clickup add-status --after / --before

Status: built and committed on branch DGS-493__add-status-placement (not merged; waits for "go: merge"). No ClickUp write was made. Only unit tests ran.

- `--after <status>` and `--before <status>`: the new status goes right after or right before that status. They conflict (yargs `conflicts`, and `planStatusAdd` refuses both too).
- The anchor matches after trim, any case. An unknown name is an error that lists the existing names.
- Without a flag: the old behaviour (before the closed status), no rule check.
- Order rule (anchored adds only): rank open 0, custom 1, done 2, closed 3. The new status must rank >= its left neighbour and <= its right neighbour. A refusal names both neighbours and their types.
- Every other status keeps id, name, type, color and relative order; orderindex is re-numbered dense from 0.
- Dry run: the full new order and `position: after "<x>"` / `before "<y>"`.
- After a real add: `verify()` read-back as before; on success the set as read back is printed (orderindex, name, type).
- `packages/cli/README.md` does not list add-status: no change there. `--help` names both flags.
- Tests: add-status 47 (was 23+); full suite 2299 pass with `FORCE_COLOR=1`; CLI build clean.

## Review
Claude whole-branch review (subagent) on the diff against origin/main: no findings. Fixed: 0.

## First use
Pending after "go: merge": refinement after discovery, acceptance after review, space 1301150000001271.
