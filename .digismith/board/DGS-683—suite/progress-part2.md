# DGS-683 part 2 ledger (Builder dgs-683-scope, S3b)
Times UTC+7. Part 2 = T10, T11, T12 (herdr-ws scope). Branch DGS-683__herdr-scope from origin/main 91554b76.

- T10 scope parsing and --session: ab1e3d79; r1 NEEDS FIXES (F1-F4) fixed e7bdc94e; r2 clean.
- T11 the Castle close rule: a508ba47; r1 NEEDS FIXES (rename bypass, 2 Minor) fixed e9914eb7; r2 clean.
- Pane move/swap (Maestro follow-up to T11 r2): 32261a68.
- T12 audit log: 3cad50ca; r1 NEEDS FIXES (2 Important: positional/flag parsing of relocate_check; = form) fixed fab2cd9c; r2 clean.
- RENAME (Maestro/Jack): Suite -> Castle in herdr-ws and its tests, 7924f90c. Spec/plan on main untouched: read Suite as Castle.
- Ticket final r1 NEEDS FIXES (F1 flag targets, F2 audit without HERDR_WS, F3 agent+pane in the line; F4 accepted) fixed 0fd4eaf2; r2 APPROVED; N1 (text payload with --flag=value): docstring + test, cfb2fdb3.
- Note: the plan's example line `agent prompt dgs-2` -> _unmapped.log disagrees with its own rule (DGS-2.log); followed the rule, plan on main untouched.
- Note: the plan's "unset HERDR_WS writes nothing" was replaced by the Maestro's decision (always log, own=unknown).
- Verification: vitest herdr-ws.test.ts 59/59 (fork pool of 2); test-herdr-ws.mjs ALL PASS (read-only, live herdr). Raw herdr calls used: only `herdr <tab|agent|pane> [verb] --help` and the old script's read-only calls: none denied.
- Unverified: needs a real session (install + first use are the conductor's): the whole script against a live Castle session.
- Hard limits kept: deployed copy, live sessions, conductors.json, cards, LaunchAgents untouched; no ClickUp write; no protected path (`git diff --name-only origin/main...HEAD` = herdr-ws + test + board files).
