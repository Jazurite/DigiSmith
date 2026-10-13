# DGS-443 report: live session notes into the depot

## Summary
Notes are read and written in the depot now: `~/.digismith-depot/sessions/<project>/maestros/<title>/note.md` for Maestros, `<conductor>/note.md` for the conductor (the DigiSmith Maestro shares it, answer A; split = DGS-447), `orders/` for orders. The old `.digismith/sessions/` copies are never written, renamed or deleted by any code. No file was copied yet: each owner's copy, `cmp` and switch happens after the merge, on that owner's idle word.

## Built (TDD, 1852 tests pass, `pnpm vitest run`)
- `scripts/session-path.ts`: `sessionsRoot`, `maestroNotePath`, `conductorNotePath`, `ordersDir`, `noteLocation` (shared-note map `SHARED_NOTES`), `listDepotNoteNames`, `listUnmovedNoteNames`; names checked with `isSafeName`/`isSafeSessionName`.
- `scripts/lineage-handoff.ts`: `--action list` prints depot names, then unmoved old names; new `--action maestro-path --title`.
- `scripts/session-init.ts`: the SessionStart pointer names the depot folder, the shared note at its conductor path, and old notes not yet moved.
- `scripts/notes-drift.ts`: read-only check; reports an old note with no depot copy, or changed after its copy.
- Skills `handoff` and `finishing-a-development-branch`, and `CLAUDE.md` (orders go to `orders/`): current path = depot; old copy = read-only resume fallback; write mode never writes the old path.
- Already depot-based, unchanged: `scripts/conductor/state.ts` default path; its `conductors.json` override and the `state:` fields are data edits at each owner's switch.

## Review
Independent Claude whole-branch review (separate agent, read-only): done. Findings: 1 medium, 3 low. Fixed: (medium, verified by the reviewer) the SessionStart hook threw for a repo folder whose name fails `isSafeName` (space, non-ASCII) and lost all pointers: the depot lists now return nothing for such a project, test added; (low) the pointer listed the shared DigiSmith note under `maestros/`: it now prints the conductor path, test added. Not fixed, by design: the drift check flags an old file only when newer than the copy (plan rule; a stray old write made before a later depot write is not flagged); the skill does the "depot, else old copy, else ask" choice by hand because `maestro-path` returns a path whether or not it exists.

## Not done / for the owners
- MEGA: `~/.digismith-depot` is in none of the four syncs (`~/Workspace`, `~/Obsidian`, `~/Downloads`, `~/CoWorkspace`). Jack: no sync (answer B). **Moved notes have NO backup until DGS-446 (encrypted backup).** The old copies stay byte-for-byte untouched and remain the backed-up copy under `~/Workspace`; they go stale after each switch.
- Per-owner switch after merge (copy, `cmp`, then `state:` and `conductors.json`): Scheduling, Token Economics, DigiSmith Maestro and conductor (`digismith-conductor/note.md`); Nexus, b3-maestro and d3-maestro copied when someone resumes them. `workbox.md` and `workbox-macos.md` are copied to `<project>/workbox.md`; no code reads them yet.
- Not moved: old loose orders and briefs (DGS-424), the two rule files (answer D).
- dgs-439's allow-list covers this layout (its tests, per the conductor).
