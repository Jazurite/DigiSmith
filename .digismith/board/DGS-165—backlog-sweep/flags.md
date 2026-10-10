# Flags (checkpoint 1)

Merge or discard only. Nothing is deleted.

## Duplicates and merge candidates
- `review-time-standards-injection-gap.md` says it is folded into the W.9 activation file (it calls it `-w8`, the real name is `-w9`). One ticket for both: `activate-requesting-code-review-w9.md`.
- `non-fast-forward-merge-first-occurrence.md` is the earlier flag of DGS-260 (`report-implementation-non-ff-merge-range.md`). Merge into DGS-260.
- `check-attribution-hardening.md`, `check-attribution-no-escape-hatch-for-pre-policy-history.md` and `attribution-guard-pr-description-gap.md` all come from the W.8 final review. Keep three tickets (one per file) or one: Jack's choice. Default: three, linked.
- `platform-clan.md` and `platform-accounts-or-billing-lineage.md` record the same ticket, DGS-152.
- `rename-g-methodology` and `structure-merge-g-and-u` (docs) both belong to DGS-194.
- `docs/depot`, `docs/agentic-bridge`: one doc, two tickets (DGS-2 + DGS-1/DGS-8; DGS-5 + DGS-96).
- Lifecycle-stage twins: a built skill (A.1) and its stage ticket (F.x) share one docs folder: DGS-239/248, 240/249, 241/250, 243/253, 210/247, 244/251, 242/252.
- DGS-147 and DGS-149 stay for reuse (not touched).

## Already applied, ticket `done`, file still in `backlog/` (20)
The README rule says to delete an applied file; the rule here is merge or discard. Jack decides per file; none is changed in phase 1.
ai-gateway-vendors-k3 (DGS-92), auto-update-plugin-after-merge (161), brainstorm-the-new-maestro-role (170), cli-decouple-from-depot-u (268), clickup-parent-flag (197),
define-project-and-project-workflow (172), docs-convention-letter-nesting (195), herdr-single-session-spike (198), inject-standards-prose-scope-gate (274), maestro-in-herdr (169),
opencode-safety-layer (226), opinionated-tech-stack-defaults (193, found), platform-accounts-or-billing-lineage (152), platform-clan (152), process-lifecycle-test-leaks-dummy-servers (180),
scripture-clan (186), shopee-import-orders (196), ste100-writing-standard-t (273), vps-connect-workspace-dedup-x1 (107, found), worker-and-maestro-conventions (158).

## Stale or doubtful, no ticket
- `handoff-pointer-missed-on-fresh-session-w12.md`: file says "now moot" (clear_context is `no`). Discard candidate; if kept, a ticket in A.1.
- `merge-conflict-detection-gap.md`: file says lower confidence, may not be worth doing. Discard candidate.
- `dev-server-port-allocation.md`: file says medium confidence, not confirmed. Ticket with a `concept` status, or discard.
- `diagramming-tool-integration-g21.md`: no status line at all. Needs a read by Jack.
- `vitest-worktree-test-discovery-contamination.md`: a built fix exists (`docs/vitest-worktree-contamination`); check if applied before a ticket.
- `plugin-cache-lag-self-development.md`: observation; DGS-161 (done) fixed the related plugin-update flow.

## History only (no work left)
- `manager-mode-retro-2026-10-02.md`: a retro; source of 8 items. Stays a document, no ticket.
- `opinionated-tech-stack-defaults.md`: shipped as G.2 (DGS-193).
- Letter-migration tickets DGS-26 to DGS-49 hold the docs of every shipped letter (history).

## Count differences from the order
- `backlog/`: 139 files on disk (138 items + `README.md`), the order said 136. 79 record their own key; 59 do not (the order said 74). Of the 59, 23 already have a ClickUp ticket; 36 have none.
- `.digismith/docs/`: 69 top-level entries, 79 leaf folders (9 entries are clan or letter containers).
- ClickUp read: 278 tasks in 42 lists (all lists of the DigiSmith space, closed ones included; the Imperium list holds the epic and its subtasks). Keys DGS-1 to DGS-287 absent from ClickUp: DGS-3, 4, 60, 61, 74, 199 to 202 (not found in any list; Jack may know why).
