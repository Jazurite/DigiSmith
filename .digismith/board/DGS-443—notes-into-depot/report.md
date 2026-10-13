# DGS-443 report: live session notes into the depot

## Summary
Notes are read and written in the depot now: `~/.digismith-depot/sessions/<project>/maestros/<title>/note.md` for Maestros, `<conductor>/note.md` for the conductor (the DigiSmith Maestro shares it, answer A; split = DGS-447), `orders/` for orders. The old `.digismith/sessions/` copies are never written, renamed or deleted by any code. No file was copied yet: each owner's copy, `cmp` and switch happens after the merge, on that owner's idle word.

## Built (TDD, 1887 tests pass, `pnpm vitest run`)
- `scripts/session-path.ts`: `sessionsRoot`, `maestroNotePath`, `conductorNotePath`, `ordersDir`, `noteLocation` (shared-note map `SHARED_NOTES`), `listDepotNoteNames`, `listUnmovedNoteNames`; names checked with `isSafeName`/`isSafeSessionName`.
- `scripts/lineage-handoff.ts`: `--action list` prints depot names, then unmoved old names; new `--action maestro-path --title`.
- `scripts/session-init.ts`: the SessionStart pointer names the depot folder, the shared note at its conductor path, and old notes not yet moved.
- `scripts/notes-switch.ts`: the per-owner switch, one repeatable command: `node --experimental-strip-types scripts/notes-switch.ts <title|workbox.md> --main <repo root>` copies the old note into the depot (never over an existing file, built under a hidden temp name and renamed into place only after a byte check, aborts if the old note changed meanwhile), and records the switch time in `<depot>/sessions/<project>/switches/<key>.json` (one file per key, created with `wx`). After the owner confirms "switch now", the same command with `--repoint` (and `--identities` for the identity record) rewrites the `state:` line of open cards whose path names the old note (quotes, comment, `./`, symlink spelling are matched).
- `scripts/notes-drift.ts`: read-only; flags ANY write to an old path after the recorded switch time (a later depot write does not hide it), a recorded switch whose depot copy is gone, and lists notes not switched yet.
- `maestro-path` returns `{source: depot|old|none, path, writePath}`; the handoff skill follows that result and never decides by hand.
- Skills `handoff` and `finishing-a-development-branch`, and `CLAUDE.md` (orders go to `orders/`): current path = depot; old copy = read-only resume fallback; write mode never writes the old path.
- Already depot-based, unchanged: `scripts/conductor/state.ts` default path; its `conductors.json` override and the `state:` fields are data edits at each owner's switch.

## Review
Independent Claude reviews (separate read-only agents), two rounds: whole branch, then a focused one on the fix commit. Done.
- Round 1: 1 medium, 3 low. Fixed: the SessionStart hook threw for a repo folder name that fails `isSafeName` (now no depot notes, test); the pointer listed the shared DigiSmith note under `maestros/` (now its conductor path, test). Open lows taken in round 2 on the Scheduling Maestro's order: drift now uses the recorded switch time; `maestro-path` returns the resolved choice.
- Round 2 (on the fix commit): 2 medium, 2 low-ish, rest info. Fixed, with tests: (a) a failed or interrupted copy left a stale copy that `maestro-path` would call the live note: the copy is now built under a hidden temp name and renamed in only after verification; (b) `switches.json` read-modify-write could drop a record: one record file per key now; (c) `--repoint` skipped quoted, commented, `./` or symlink-spelled `state:` values: now matched by real path; (d) a title like `__proto__` could never switch: records live in a null-prototype map.
- Not fixed: `--repoint` rewrites a card file by read and rename, so a card heartbeat in that few-millisecond window could be overwritten (lost `last_seen`): run it while the owner is idle. A writer that preserves the old file's mtime (`rsync -t`) would escape drift. A failed switch leaves a hidden `.note.md.*.tmp` file that only Jack may remove.
- Note for the switch: the SessionEnd card hook appends a handoff block to the card's `state:` path, so repoint the card before the owner's session ends, or that block lands in the old file (drift would flag it).

## Not done / for the owners
- MEGA: `~/.digismith-depot` is in none of the four syncs (`~/Workspace`, `~/Obsidian`, `~/Downloads`, `~/CoWorkspace`). Jack: no sync (answer B). **Moved notes have NO backup until DGS-446 (encrypted backup).** The old copies stay byte-for-byte untouched and remain the backed-up copy under `~/Workspace`; they go stale after each switch.
- Per-owner switch after merge (`notes-switch.ts <key>`, then "switch now", then `--repoint`; `conductors.json` is a by-hand edit for the conductor's own switch): Scheduling, Token Economics, DigiSmith Maestro and conductor (`digismith-conductor/note.md`); Nexus, b3-maestro and d3-maestro copied when someone resumes them. `workbox.md` and `workbox-macos.md` are copied to `<project>/workbox.md`; no code reads them yet.
- Not moved: old loose orders and briefs (DGS-424), the two rule files (answer D).
- dgs-439's allow-list covers this layout (its tests, per the conductor).
