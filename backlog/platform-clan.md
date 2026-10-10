# C: Platform clan, and the Pavilion-is-lineage-0 rule

**Status:** Created in ClickUp 2026-10-03 (Jack). Migration ticket: **DGS-152** (Town Hall). Folder `1301150000002449`, lists `C.0: Pavilion` (`1301150000002950`),
`C.1: Workbox` (`1301150000002951`), `C.2: CLI` (`1301150000002952`) and `C.3: Accounts` (`1301150000002956`, Jack picked the
name the same day). The four descriptions were set on 2026-10-03 with
`dg clickup update-list` (DGS-137), from the drafts below. The same day the tickets moved in with `dg clickup move-task`
(DGS-76): DGS-144 into C.3, DGS-106, DGS-107, DGS-109, DGS-131 and DGS-151 into C.1, and DGS-117 into C.2. DGS-153 was
filed in C.1. Town Hall also got its name back (`Town Hall (` to `Town Hall`).

**Rule (Jack, 2026-10-03):** lineage 0 of every clan is the Pavilion. For C that is `C.0: Pavilion`. Clan A applied
the rule on 2026-10-03: `A.0: Pavilion` now exists, and the old A lineages were renumbered (`A.0: Primitives` is now
`A.1`, `A.1: Lifecycle Hooks` is now `A.3`, `A.2: Configuration` is now `A.4`, and `A.2: Protocols` is new). The handoff
folders moved with them (`.digismith/docs/A/A.1/` and `.digismith/docs/A/A.4/`). B, D and O still keep a separate
"Pavilion" list and their own unnumbered Pavilion with `.0` lineages (`B.0: Maestro`, `D.0: Foundation`,
`O.0: Foundation`). Renumbering them would break session titles, handoff paths and docs, so decide that separately.
**Decided 2026-10-10 (Jack): every clan's .0 is its Pavilion.** Renamed in ClickUp (lists kept, no ticket moved): `B.0: Maestro` became
`B.4: Maestro` and the unnumbered `Pavilion` became `B.0: Pavilion`; `D.0: Foundation` became `D.4: Foundation` and `Pavilion` became
`D.0: Pavilion`; `O.0: Foundation` became `O.4: Foundation` and `Pavilion` became `O.0: Pavilion`. Older notes that name the old lists stay as
history. The
Town Hall list description still says "Each clan folder has its own Pavilion list": update it when the rule is applied
to every clan.

## What C: Platform is

What DigiSmith runs on and operates with. A: System is how DigiSmith behaves inside a session. D: Depot stays Jack's public
server and MCP. The load balancer (DGS-144) moves into this clan, in a lineage whose name is still open: see
[platform-accounts-or-billing-lineage.md](platform-accounts-or-billing-lineage.md).

## Lineages and what moves in later

Moving a ticket needs `dg clickup move-task` (DGS-76) or the ClickUp UI. Do not copy tickets to move them.

- **C.1 Workbox:** herdr on a VPS or dedicated server: worker slots, the roster, accounts, the reviewer, `packages/workbox`
  and `dg workbox`. Candidates: DGS-106, DGS-107 and DGS-109 (now B.1: VPS Hosting), DGS-131 (reviewer commands), DGS-151
  (account-aware start, `dg workbox` as a package), the Workbox runbook. B.1 stays until it is empty.
- **C.2 CLI:** the `dg` command framework, its conventions and its tests. Candidate: DGS-117, the isomorphic `--help` e2e
  test (now D.2). D.2 keeps the npm package and `dg depot`, which are Depot's public surface.

## Description drafts

**C.0: Pavilion**

```
Items that affect more than one lineage in this clan, or the clan as a whole.

- Work for one lineage goes in that lineage's list.
- Work that affects more than one clan goes in Town Hall (Clans folder).
- Lineage 0 of every clan is the Pavilion (Jack, 2026-10-03).
- 2026-10-03: Created with the clan.
```

**C.1: Workbox**

```
Workbox: herdr on a VPS or any dedicated server, where DigiSmith's workers and reviewers run.

- Worker slots, the roster, the runbook (.digismith/sessions/workbox.md), and the dg workbox commands in packages/workbox.
- Which account a worker uses is decided in C.3: Accounts, and which model in B.2. This lineage runs the workers.
- 2026-10-03: Created (Jack). Candidates to move in: VPS hosting tickets from B.1, DGS-131, DGS-151.
```

**C.2: CLI**

```
The dg command line: the command framework, its conventions and its tests.

- Each command group belongs to the lineage of the feature it operates (dg clickup in D.3, dg depot in D.2, dg workbox in C.1).
  This lineage owns the shell they plug into.
- 2026-10-03: Created (Jack). Candidate to move in: DGS-117.
```

**C.3: Accounts** (list `1301150000002956`, created 2026-10-03)

```
Accounts: the logins DigiSmith's workers run on, and which one a new worker gets.

- The seats (jack, dev0), which seat each worker uses, usage against the 5h and weekly limits, limit stops, exhausted marks and token handling.
- Submodule: Capacity (seats, usage and limit stops). Billing (cost per ticket, plans, extra usage) may join later.
- The manual is in the Workbox runbook (.digismith/sessions/workbox.md), "Choose the account for a new worker". Starting a worker is C.1: Workbox.
- 2026-10-03: Created (Jack). Candidate to move in: DGS-144.
```
