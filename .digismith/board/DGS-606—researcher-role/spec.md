# DGS-606 Spec: the researcher role

Ticket: DGS-606 (B.8 Roles and Permissions). Decided by Jack, 2026-10-24: keep both roles.
`scout` reads our own systems. `researcher` studies new, external things.

## What changes

### 1. Session card (`scripts/session-card.ts`)
- `ROLES` gets `"researcher"` (after `scout`).
- `LEGAL_PARENT_ROLES.researcher = ["conductor", "maestro"]`. A scout may also have a worker parent. A researcher may not: a Builder must not start outside study.
- Mandate rule: the list `["conductor", "worker", "scout", "reviewer"]` gets `"researcher"`. A researcher card without `mandate` fails with `mandate: required for role researcher`.
- `under` is required (existing rule for every non-maestro). No `state`, no `reviewer_type`, no `machine`, no `seat` rule change (seat stays worker/reviewer only: a researcher's seat lives in its run record).
- Tests in `scripts/session-card.test.ts`:
  - a good researcher card validates;
  - missing `mandate` fails;
  - `LEGAL_PARENT_ROLES.researcher` equals `["conductor", "maestro"]` and has no `worker`;
  - `reviewer_type`, `machine` and `state` on a researcher are rejected or ignored as for a scout (same assertions as the scout cases).

### 2. The role card: `skills/researcher/SKILL.md` (where the Reviewer card lives)
Card text, short:
- **What it is:** a worker that studies outside material (a repository, a tool, an idea) and reports. Process (the DGS-605 study steps): clone, read in full, answer how it relates, how to absorb it, how it helps, where it sits on the lineage, reply and stop.
- **May:** read anything on the machine that is not a secret; clone into `~/Workspace/Library/<name>`; write its findings file in the depot (`~/.digismith-depot/research/<name>.md`; the brief gives the exact path); read the web with WebFetch and WebSearch.
- **May not:** write in the DigiSmith repo or any worktree; any ClickUp write; commit; push; merge; start or stop another agent; install into the DigiSmith repo; run code from the studied repo with network or secrets; read a token, key or `.env` value.
- **Its ONE write:** the clone in `~/Workspace/Library/<name>` and the findings file in the depot.
- **Where the other cards live:** `skills/reviewer/SKILL.md`; the scout has no skill file (its card is the session card plus the brief). The card lists them.
- **Ends with:** one pane line `done: <findings path>`, then stop.
- **Registers its session** with `entry.ts session --ticket <KEY> --role researcher` when the order has a ticket key (skip on `none`).

### 3. Brief template: `skills/researcher/brief.md`
Placeholders `{{AGENT}}`, `{{KEY}}`, `{{SUBJECT}}` (what to study), `{{NAME}}` (library folder name), `{{FINDINGS}}` (findings path), `{{PLUGIN_ROOT}}`. It repeats the may-not list in the Rules section: no write in the DigiSmith repo, no ClickUp write, no commit, no push.

### 4. Spawn path from an order
- `skills/researcher/SKILL.md` section "Start of a researcher (owner: conductor or Maestro)": the order names subject, `{{NAME}}`, findings path and seat. The conductor fills the brief, then follows the runbook "Start of a ticket" S0 to S6 with `dg run start --role researcher` (run record role `researcher`), tab label `<name> ⚚ researcher`, agent name `<name>-researcher`. No worktree: the researcher runs in the Library folder (or `~/Workspace/Library`), `--add-dir` for the depot findings folder.
- The Workbox runbook (`.digismith/sessions/workbox.md`) is untracked on purpose, so I do not edit it. The spec adds the one-line pointer the conductor puts there: "Start of a researcher: see `skills/researcher/SKILL.md`." I name it in my report.
- `dg run start --role researcher` must work. That needs the run record role list below.

### 5. Role lists (found by grep; kept equal by a test)
| List | File | Today | Change |
|---|---|---|---|
| Session card roles | `scripts/session-card.ts` | maestro, conductor, worker, scout, reviewer, observer | + researcher |
| Run roles | `packages/cli/src/run/record.ts` | builder, reviewer, scout, other | + researcher (DGS-598 moves this list to `run/schema.ts`; see below) |
| Run roles (Nexus copy) | `scripts/nexus-shared/nightwatch.ts` | builder, reviewer, scout, other | + researcher |
| View role type | `packages/cli/src/nightwatch/types.ts` | `"builder" \| "reviewer" \| "scout" \| "other"` | + researcher |
| `dg run start --role` text | `packages/cli/src/run/index.ts`, `run/README.md` | builder, reviewer, scout or other | add researcher |

The run roles list is already kept in two files (`record.ts` and `nexus-shared/nightwatch.ts`) with no test. I add a test (`scripts/nexus-shared/roles-equal.test.ts`, or beside the existing nightwatch test) that reads both and asserts they are equal. The card-role list and the run-role list stay different on purpose (card has maestro/conductor/worker/observer; run has builder/other). A second test asserts every run role other than `builder` and `other` is a card role, so `researcher` cannot be a run role without being a card role.

### 6. How researcher fits DGS-598 (read-only look at its spec and plan)
DGS-598 (`.worktrees/dgs-598`, in progress) adds `packages/cli/src/run/schema.ts` (`ROLES`, `Role`) and `packages/cli/src/run/role.ts` (`roleOf`, THE role rule). `roleOf` names the role from the herdr agent name: `-conductor`, `-rev`, `scout`/`probe`, ticket key. The shared places are `schema.ts` `ROLES` (the list) and `role.ts` `roleOf` (the rule).
- My branch edits `record.ts` as it is on `main`. I do not touch DGS-598's files.
- Whichever of the two merges second rebases. After DGS-598 merges, my rebase moves the `researcher` entry into `schema.ts` `ROLES` and adds one rule line to `roleOf`: `if (n.endsWith("-researcher")) return { role: "researcher", role_from: "herdr" };` placed before the scout line (the agent name `<name>-researcher`, an exact suffix, so a scout named `research-scout` is not caught). The test lines go into `role.test.ts`.
- If DGS-598 merges first, I do that on my branch before my own merge. If I merge first, the DGS-598 Builder gets one note from the conductor to add `researcher` to its `ROLES` and the rule line. Either way the conductor decides; I report which case it is at plan-ready.
- Watchdog: DGS-598 classifies only builder, reviewer and scout runs. A researcher run is not watched (it has no phase). I add nothing to the watchdog.

## Out of scope
DGS-605 (`digismith:study`; do not touch `.worktrees/dgs-605`), any watchdog change, Oculus view changes, a real herdr start.

## Decisions I made (technical, inside the ticket)
- Card in `skills/researcher/` (same place as the Reviewer card), not in the runbook.
- Parents conductor and maestro only (as the ticket says). A scout may have a worker parent; a researcher may not.
- Findings path: `~/.digismith-depot/research/<name>.md`; the order may override it.
- Agent name suffix `-researcher` is the rule for the run role.

## First use (after the merge)
1. Validate a card with `role: researcher`: good mandate and parent passes; no mandate fails; a `worker` parent fails in the sweep check.
2. Start a researcher from a test order through the conductor, and see `researcher` in `dg run show`.

## Acceptance (from the ticket)
- Card with `role: researcher` validates; no mandate or a bad parent fails.
- A conductor can start a researcher from an order and the run shows its role.
- The card and the brief both say it cannot write in the DigiSmith repo.
- Tests cover role value, parent roles and mandate rule.
