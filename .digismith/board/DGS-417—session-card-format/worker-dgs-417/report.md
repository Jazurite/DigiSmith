# DGS-417: Session card format and depot layout — Implementation Report

Date: 2026-10-13. Ticket: DGS-417 (I.7). Design: DGS-404 sections 5, 7, 8.

## Summary
The session card is a machine-checked format with a shared store in the global depot. `scripts/depot-dir.ts` owns `depotDir()` (env `DIGISMITH_DEPOT_DIR`). `scripts/session-card.ts` holds the card type, `validateCard`, parse and format, and the store: `writeCard`, `readCard`, `listCards`, `touchCard`, `closeCard`, `markLost`, `newestLastSeen`, `findCardBySession`. `scripts/session-card-cli.ts` writes and checks cards by hand (`new`, `write`, `validate`, `read`, `find`, `list`, `touch`, `close`, `lost`).

## Built
- Cards: `<depot>/sessions/<project>/cards/<id>--<session>.yml`; closed and lost cards move to `archive/` and are never deleted or overwritten (numbered names `--<n>`). Atomic writes (temp file in the same folder, fsync, rename).
- Validator: 14 design fields plus optional `ended` and `result`; role rules; timestamps with an offset; secret-like values refused without echoing them; safe names against path traversal.
- Tests: 76 in `scripts/session-card.test.ts` and `scripts/depot-dir.test.ts`; full suite 1570 passed (`FORCE_COLOR=1 pnpm test`).

## Not done
Cross-card tree checks (need two cards; `LEGAL_PARENT_ROLES` is exported), identity records (DGS-411), a `dg` wrapper, a registry.

## Review
A review subagent on the diff found five points; fixed with tests: secret-check false positives (sha, hex id, "Bearer" prose, "sk-learn"), `writeCard` overwrite, case-folded names, fractional seconds, the touch/close race. dgs-418's review added: archive never overwritten, result on close and lost, a touch never resurrects a card. One residual: a microsecond window between touch's existence check and its rename (documented in the plan).
