# C: Platform clan, and the Pavilion-is-lineage-0 rule

**Status:** Created in ClickUp 2026-10-03 (Jack). Folder `1301150000002449`, lists `C.0: Pavilion` (`1301150000002950`),
`C.1: Workbox` (`1301150000002951`) and `C.2: CLI` (`1301150000002952`). The lists have no description yet: the CLI
cannot set one. Paste the drafts below, or use `dg clickup update-list` (DGS-137) when it exists. No ticket has moved in.

**Rule (Jack, 2026-10-03):** lineage 0 of every clan is the Pavilion. For C that is `C.0: Pavilion`. The older clans
(A, B, D, O) keep a separate "Pavilion" list and their own `.0` lineages (`A.0: Primitives`, `B.0: Maestro`,
`D.0: Foundation`, `O.0: Foundation`). Renumbering them would break session titles, handoff paths (`.digismith/docs/A/A.0/`)
and docs, so decide that separately. The Town Hall list description still says "Each clan folder has its own Pavilion
list": update it when the rule is applied to every clan.

## What C: Platform is

What DigiSmith runs on and operates with. A: System is how DigiSmith behaves inside a session. D: Depot stays Jack's public
server and MCP. The load balancer stays in B.2 Router (the router picks a backend per worker, like the model router).

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
- Which account or model a worker uses is decided in B.2: Router. This lineage runs the workers.
- 2026-10-03: Created (Jack). Candidates to move in: VPS hosting tickets from B.1, DGS-131, DGS-151.
```

**C.2: CLI**

```
The dg command line: the command framework, its conventions and its tests.

- Each command group belongs to the lineage of the feature it operates (dg clickup in D.3, dg depot in D.2, dg workbox in C.1).
  This lineage owns the shell they plug into.
- 2026-10-03: Created (Jack). Candidate to move in: DGS-117.
```
