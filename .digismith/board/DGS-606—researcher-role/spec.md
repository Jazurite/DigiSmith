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
- `skills/researcher/SKILL.md` section "Start of a researcher (owner: conductor or Maestro)": the order names subject, `{{NAME}}`, findings path and seat. The conductor fills the brief, then follows the runbook "Start of a ticket" S0 to S6 with `dg run start --role other` (DGS-609 adds the run role `researcher`), tab label `<name> ⚚ researcher`, agent name `<name>-researcher`. No worktree: the researcher runs in the Library folder (or `~/Workspace/Library`), `--add-dir` for the depot findings folder.
- The Workbox runbook (`.digismith/sessions/workbox.md`) is untracked on purpose, so I do not edit it. The spec adds the one-line pointer the conductor puts there: "Start of a researcher: see `skills/researcher/SKILL.md`." I name it in my report.
- `dg run start --role other` must work (test in `packages/cli/src/run/start-other.test.ts`).

### 5. Run-role lists and DGS-598: moved to DGS-609
Maestro ruling (Jack), 2026-10-24: the run-role lists (`researcher` in the run `ROLES`, the `roleOf` rule, the Nexus copy, the equality test) are DGS-609 (backlog, after DGS-598). DGS-606 is the general DigiSmith role only: session card, researcher card, brief. Until DGS-609 lands the card starts a researcher with `dg run start --role other`; a test checks that `dg run start --role other` works. The brief's session registration (`entry.ts session --role`) also uses `other`, because the tokens roles are worker, maestro, reviewer, other (`packages/cli/src/tokens/entry.ts`); a test checks the brief's value is in that list. DGS-609 changes the run role, the tokens role, the card and the brief together.

## Out of scope
DGS-605 (`digismith:study`; do not touch `.worktrees/dgs-605`), any watchdog change, Oculus view changes, a real herdr start.

## Decisions I made (technical, inside the ticket)
- Card in `skills/researcher/` (same place as the Reviewer card), not in the runbook.
- Parents conductor and maestro only (as the ticket says). A scout may have a worker parent; a researcher may not.
- Findings path: `~/.digismith-depot/research/<name>.md`; the order may override it.

## First use (after the merge)
1. Validate a card with `role: researcher`: good mandate and parent passes; no mandate fails; a `worker` parent fails in the sweep check.
2. (Moved to DGS-609: `dg run show` shows `researcher`.) Here: start a researcher from a test order through the conductor.

## Acceptance (from the ticket)
- Card with `role: researcher` validates; no mandate or a bad parent fails.
- A conductor can start a researcher from an order and the run exists (run role `other` until DGS-609).
- The card and the brief both say it cannot write in the DigiSmith repo.
- Tests cover role value, parent roles and mandate rule.
