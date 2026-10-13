# DGS-443 plan: live session notes into the depot

Worker `dgs-443`, list I.7. Spec: DGS-404 design.md sections 8 and 9 (conductor note `<conductor>/note.md`, orders `orders/`). The Maestro note path is this plan's proposal.

## 1. Path layout (Checkpoint 1, for Jack)

Root: `~/.digismith-depot/sessions/<project>/` (`<project>` = the main checkout's folder name, `DigiSmith`; `DIGISMITH_DEPOT_DIR` overrides the depot, as today).

```
sessions/<project>/
  cards/  archive/                 (exist, DGS-417)
  orders/<name>.md                 orders and mandates (exists: order-scheduling-442-439-443.md)
  <conductor>/note.md              conductor state note (design table; state.ts already reads it)
  maestros/<session-title>/note.md Maestro note: PROPOSAL
  workbox.md                       the runbook (and workbox-macos.md beside it)
```

Why `maestros/<title>/note.md` (proposal): the handoff skill finds a Maestro's note by the session title (`get_session self`), so the title stays the key and nothing about "resume" changes. The `maestros/` level keeps titles apart from `cards/`, `archive/`, `orders/` and the conductor folder: a Maestro titled "orders" or "digismith-conductor" cannot collide. Alternative: `<project>/<title>/note.md` (shorter, but shares the namespace with conductor folders).

## 2. Files to move (copy, never rename)

| Old (`.digismith/sessions/`) | New (depot `sessions/DigiSmith/`) |
|---|---|
| `DigiSmith/note.md` (170 KB; today the conductor's AND the DigiSmith Maestro's state) | `digismith-conductor/note.md` (see open question A) |
| `Scheduling/note.md` | `maestros/Scheduling/note.md` |
| `Token Economics/note.md` | `maestros/Token Economics/note.md` |
| `Nexus/note.md` | `maestros/Nexus/note.md` |
| `b3-maestro/note.md`, `d3-maestro/note.md` | `maestros/b3-maestro/note.md`, `maestros/d3-maestro/note.md` |
| `workbox.md`, `workbox-macos.md` | `workbox.md`, `workbox-macos.md` |
| `DigiSmith/order-*.md` and other loose files | NOT moved: old folders are DGS-424. New orders go to `orders/` from now on. |

Not moved: worker `dgs-*/brief.md` (briefs, DGS-424), `batch-2026-10-11-rules.md`, `roles-followups-common.md` (shared worker rules; Jack may add them), `workbox.md.before-*` backups.

Also repointed (a pointer, not a move): `~/.digismith-depot/conductors.json` (`note` for DigiSmith/digismith-conductor), `state:` in identity `digismith-maestro.yml` and in the open cards of the conductor and Maestro sessions.

## 3. Old copies

Copy -> verify with `cmp` (exit 0, also size) -> the old file stays byte-for-byte untouched. No rename, no stub, no "moved" marker written into it, no delete. Deleting the old copies waits for Jack to name each one (DGS-424 will handle the old folders). A `cmp` pass is run again at each owner's switch moment and once more before the report.

## 4. MEGA (report only, not changed)

`mega-sync` lists four syncs: `~/Workspace`, `~/Obsidian`, `~/Downloads`, `~/CoWorkspace`. `~/.digismith-depot` is NOT inside any of them. So: the old notes are backed up today (they sit in `~/Workspace/Jazurite/DigiSmith/.digismith/sessions/`, git-excluded but not MEGA-excluded; I did not check MEGA's own exclude rules), and the moved notes will NOT be, unless Jack adds a sync for the depot. Cards, orders, identities and the rest of the depot are already unbacked. Decision for Jack (open question B). Keeping the old copies is a partial safety net until then, but they go stale after the switch.

## 5. Switching without a lost write

Several sessions write live. A note has one writer (its owner), so the switch is per owner, one at a time:

1. I land code that reads and writes the depot path and still READS the old path when no depot copy exists (resume fallback). Nothing moves yet. Merge needs "go: merge".
2. Per owner, on that owner's "idle" word: I copy the note, `cmp`, and tell the owner "switch now". The owner writes only to the new path from then on. The old file is not touched by me or by them again.
3. Drift check (a small script in the tests' style, `scripts/notes-drift.ts`, read-only): for every moved note, compare old and new; an old file whose mtime is newer than the copy time means someone still wrote the old path; the check prints the diff so the owner can append it to the new note by hand. I run it after each switch and at the end.
4. Only after the owner's switch do I repoint that owner's `state:` field and the `conductors.json` entry. A reader that follows `state:` therefore never lands on a path that holds a stale copy.

Owners to tell (path to switch to), each after their own idle word:

| Owner | Session | Switch to |
|---|---|---|
| DigiSmith Maestro | "DigiSmith" (Desktop) | `~/.digismith-depot/sessions/DigiSmith/digismith-conductor/note.md` if shared (question A), or `.../maestros/DigiSmith/note.md` if split |
| Scheduling Maestro | "Scheduling" | `~/.digismith-depot/sessions/DigiSmith/maestros/Scheduling/note.md` |
| Token Economics | "Token Economics" | `.../maestros/Token Economics/note.md` |
| The conductor | `digismith-conductor` (herdr w2:p1) | `.../digismith-conductor/note.md` (I say when; it is the largest, 170 KB) |
| Nexus, b3-maestro, d3-maestro | no live card today | copied; whoever resumes them uses the new path (the resume fallback finds the old one if the copy is missing) |

## 6. Code and docs to change (TDD, pnpm vitest)

Each item: failing test first.

- `scripts/session-path.ts`: new `sessionsRoot(project, env)`, `maestroNotePath(project, title, env)`, `conductorNotePath(...)`, `ordersDir(...)` built on `depotDir()`; `listNoteSessionNames(mainRoot, env)` lists `maestros/*/note.md` in the depot, plus legacy names (old folder, no depot copy) so an unmigrated note stays visible; `isSafeSessionName` unchanged. The old relative-path helpers stay for the legacy fallback.
- `scripts/lineage-handoff.ts`: its `--action list` combines depot names with fallback keys; fallback behavior unchanged (it only knows the old DGS-158 paths).
- `scripts/session-init.ts` (the SessionStart hook's note list): prints the depot folder, `session notes in <depot>/sessions/DigiSmith/maestros: ...`.
- `skills/handoff/SKILL.md` and `skills/finishing-a-development-branch/SKILL.md` (Step 7 line): current note path = depot path; "tracked by git" stop becomes "refuse a path outside the depot"; resume reads the depot note, then the old `.digismith/sessions/<name>/note.md` as fallback (say where it came from).
- `scripts/conductor/state.ts` default path already is `<depot>/sessions/<project>/<conductor>/note.md`; only the `conductors.json` override entry changes (a data edit in the depot at the conductor's switch). `catch-up.ts` / consult read through `resolveNotePath`: test that a depot-path note is found.
- `scripts/identity.ts` / `session-card.ts`: `state:` stays "an absolute path"; the identity record and open cards get the new absolute path (data edits, only after each owner switched, written with the existing identity/card commands).
- Orders: wherever the skills and prompts name the order location, point to `<depot>/sessions/<project>/orders/` (the order that started this ticket already lives there).
- DGS-439 `dg sessions cleanup` allow-list is `archive/*.yml` cards only (read in its plan.md): `maestros/`, `<conductor>/note.md`, `orders/`, `workbox.md` are outside it by construction. I add a test in this ticket's tests that `planCleanup`-style logic (if merged first) keeps a 10-day-old `maestros/X/note.md`; otherwise dgs-439 adds it before its merge (its plan already says it will).
- Tests use a temp `DIGISMITH_DEPOT_DIR`, never the real depot.

## 7. Jack's answers (2026-10-13): A shared note kept (split = DGS-447); B no MEGA sync, encrypted backup later (DGS-446); C `maestros/<title>/note.md`; D both rule files left for DGS-424.

Original questions:

- A. `DigiSmith/note.md` is today BOTH the conductor's note and the DigiSmith Maestro's `state:`. Keep it one shared file (moves to `digismith-conductor/note.md`, the Maestro's `state:` points there) or split: the Maestro gets a fresh `maestros/DigiSmith/note.md`? Recommendation: keep shared for now (no content split of 170 KB mid-flight), split later by its own ticket.
- B. MEGA does not cover `~/.digismith-depot`. Add a sync (Jack's own MEGA change), or accept the loss risk?
- C. Maestro note path: `maestros/<title>/note.md` (recommended) or `<title>/note.md`.
- D. Move `workbox-macos.md`, `batch-2026-10-11-rules.md`, `roles-followups-common.md` too?

## 8. Order of work

1. Plan checkpoint 1 (this file). 2. TDD for session-path, session-init, handoff list. 3. Skills text. 4. `notes-drift.ts`. 5. Report.md + report.html (`<section id="summary">`), committed with plan.md by named paths. 6. Review, fixes. 7. On "go: merge": hooks 01 bump, 02 `claude plugin update digismith@jazurite`, 03 depot history; push; remove worktree and branch. 8. Per-owner copy and switch (first use); ticket stays open for the conductor to set done.
