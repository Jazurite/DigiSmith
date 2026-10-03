# C: Platform: a lineage for the load balancer (name open: Accounts or Billing)

**Status:** Settled, Jack (2026-10-03): **Accounts**. The list `C.3: Accounts` (`1301150000002956`) exists and DGS-144 moved
in the same day. Migration ticket: **DGS-152** (Town Hall). The text below is the reasoning that led to the choice.

**Decision (Jack, 2026-10-03):** the load balancer (DGS-144, the subscription load balancer) moves to C: Platform. It leaves
B.2. Jack still has to choose the lineage name. The new lineage would be `C.3`, after `C.0: Pavilion`, `C.1: Workbox` and
`C.2: CLI` (see [platform-clan.md](platform-clan.md)).

## Name candidates

- **Accounts** (the maestro's pick). The load balancer decides which login a worker uses, and the vocabulary already says
  account: `claude-account`, `CLAUDE_ACCOUNT`, the roster's Account column. It would hold the seats, which seat each worker
  uses, limit stops and exhausted marks, and the token handling.
- **Billing** (Jack's alternative). It is about money: plans and seats, Team extra usage, an Anthropic API key on Console
  billing, TokenReply spend, and cost per ticket. DGS-144's Step 0 fallback touched it, and the token counter (K.4) would
  be its first fit. It does not decide which login a worker uses.
- **Capacity** (Jack, 2026-10-03: a submodule of C.3, not the lineage name). The maestro's first idea covered seats, usage
  and limit stops. The RAM gate is a "refuse to start a worker" check, so it belongs in C.1 Workbox instead.

If C.3 is "Accounts", the submodules could be Capacity (seats, usage, limit stops) and, later, Billing (cost). Jack has not
said how a submodule is shown in ClickUp. D.3 groups its tickets under milestones named in the list description, which is
one model.

It may also be two lineages: `C.3: Accounts` now and `C.4: Billing` when cost tracking becomes real work. Jack has not
decided.

## What moves where

- DGS-144 goes to the new lineage. Its manual rule already lives in the Workbox runbook ("Choose the account for a new
  worker").
- DGS-151 (`dg workbox` as a package, account-aware start) goes to C.1 Workbox, because a command belongs to the feature it
  operates.
- Moving needs `dg clickup move-task` (DGS-76) or the ClickUp UI. Do not copy tickets to move them.

## Consequence for B.2

B.2 was to be renamed "Router" for a subscription router plus a model router. With the load balancer gone, B.2 is the model
router again, so "Model Router" may be the right name. Nothing was renamed in ClickUp. Only the maestro's notes and the
parked DGS-144 docs say "B.2 Router". Jack has not decided.

## Next

Jack picks the name or names. Then create the list or lists (and `C.3` or `C.4` descriptions, as for the C.0 to C.2 drafts
in [platform-clan.md](platform-clan.md)), and move DGS-144 in.
