# dg workbox: account-aware worker start, roster and account balancer

**Status:** Deferred, Jack (2026-10-03). ClickUp: **DGS-151** (D.2: CLI & Packaging, next to DGS-131). It comes from
DGS-144 (B.2: Router, the subscription load balancer). DGS-144 now runs by hand with `claude-account`, and this is the
later CLI build.

**Decision (Jack, 2026-10-03):** `dg workbox` is a separate package, `packages/workbox`, not a command group inside
`packages/cli`. The CLI only wires the `dg workbox` command to it. DGS-127, DGS-131 and DGS-139 build 2 already plan
`packages/workbox`. The package name is the evidence: a command group of its own is a package of its own.

## What already exists

The B.2 worker brainstormed and planned a first slice before Jack re-scoped it. Nothing was built.

- Branch `subscription-load-balancer` (pushed, not merged), under `.digismith/docs/B/B.2/subscription-load-balancer/`:
  `design.html` and `plan.md` (7 test-first tasks, one commit each). Both carry a "Deferred" banner. Their file paths say
  `packages/cli/src/workbox` and must become `packages/workbox`.
- Commands: `start`, `list`, `stop`, `exhaust <account> --until <time>`.
- Units: a pure `pickAccount` function, a roster file, a pane-side token loader that prints only
  `workbox account: <name>`, and a herdr wrapper that takes argument arrays and an injected runner.
- `dg workbox start <agent> --pane <id>` refuses when the pane still runs an agent. The token load check fails on a
  missing or empty token file, so `claude` never starts on the stored login by mistake.
- Assignment, v1: skip exhausted accounts, then the fewest live workers, then the least recently assigned.

## Open decisions

Jack was asked these five on 2026-10-03. Only the first is settled.

1. **Home.** Separate package. Settled.
2. **What "load" means.** v1 counts herdr workers only, per herdr session. It does not see the Desktop maestro or Jack's
   own use of a seat on another device. The plan counts the `DigiSmith` session and the `emma` session separately,
   although both draw on the same seats. Options: a base weight per account, a count across all sessions, or usage-based
   v2. The v2 data source exists since 2026-10-03: Claude Code's status line gets `rate_limits` (5h and weekly used
   percentage and reset time) with a setup-token login too. The by-hand probe is in the Workbox runbook ("Reading usage")
   and `~/.digismith-depot/usage-probe/`.
3. **Limit stops.** The maestro marks an account exhausted by hand with `exhaust`. A worker that hits its limit idles
   until someone notices. Option: detect "You've hit your session limit" when the maestro reads the pane.
4. **Token path.** The pane reads `~/.config/claude-accounts/<name>.token` itself, so only the path crosses herdr and the
   maestro. That ties DigiSmith to the layout of the Soveron `claude-account` tool. A `claude-account env <name>` form
   would remove the coupling, but DGS-144 said not to depend on changes to that tool.
5. **Worker model.** Sonnet 5 auto-compacted once, about 20 minutes into the design and spec. A bigger model may suit the
   build.

## Shared roster with DGS-131

`dg workbox reviewer` (DGS-131) also writes `~/.digismith-depot/workbox.json`. Settle one schema for workers, accounts and
the reviewer before either command is built.

## Until it lands

DGS-144's manual steps in the Workbox runbook (`.digismith/sessions/workbox.md`, "Choose the account for a new worker"):
the roster table has an Account column, and the assignment rule is applied by hand with `claude-account`.
