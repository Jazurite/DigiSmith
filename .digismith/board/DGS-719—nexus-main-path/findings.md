# Review findings (DGS-719, whole ticket)

- **ticket-final-r1 (opus): WITH FIXES.** 0 Critical, 2 Important, 3 Minor.
  - Important 1: `server.test.ts` `boot()` ran the real checkout check. Fixed: it passes `mainCheckout` (87b9467e).
  - Important 2: whole-suite runs missing. Done: see report.md.
  - Minor 2, 3: env stubs and temp dirs not reset in tests. Fixed (87b9467e).
  - Minor 1: castle plist WorkingDirectory holds the old path. Not changed, in the merge note.
  - Recommendation: env var in herdr-bootstrap.sh and consult.ts. Done, with the ssh whitelist widened for that one expression.
- **ticket-final-r2 (opus): CLEAN.** No new breakage. Note: a remote non-interactive ssh shell does not read ~/.zshrc, so the remote catch-up uses the default path.
