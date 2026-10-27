# DGS-664 spec: conductor flux at the next idle

Written 2026-10-26 (UTC+7). Checked against `origin/main` fe6d03a6. Docs only: nothing is committed to main.
Order: `order-dm-02-refine-664-flux-at-idle.md` (decisions 1 to 4 stand).

## Goal

A conductor is renewed (`/clear` plus a wake prompt) as soon as it is idle and has nothing in hand, at any hour.
Today `fluxConductor` in `scripts/conductor/flux.ts` skips outside `NIGHT_WINDOW` (23:30 to 02:00 UTC+7) with `outside_night_window`, and the CLI says "no override".

## What is true on main today (claims checked)

1. The night window is checked in step 0 of `fluxConductor` (`inNightWindow`, constant `NIGHT_WINDOW`). Tests: `flux.test.ts` "night window" block and "outside the night window".
2. Every other check already exists and stays: refused target (the sender, any maestro card), agent found once, session id, `status` idle or done, input box empty, brief and note files, no open worker card under the conductor, `workers` names not working or blocked, state block with no Running or Waiting rows, `scanNoteInFlight`, note written after the last work, `changed_before_clear`, then clear, wake, verify.
3. `~/.digismith-depot/flux-targets.json` does not exist. `resolveTarget` already reads it, and falls back to `conductors.json` and the default brief path.
4. **There is no scheduler job for the flux.** `JOBS` in `scripts/nexus-api/src/scheduler/registry.ts` has six jobs (selftest, autonomous-scan, autonomous-report, nightwatch-watchdog, schedule-release, oculus-tokens). The only "flux" there is a fixture in `engine.test.ts`. So "the scheduler job keeps working" has nothing to keep. See decision D5.
5. **The runbook has no "Conductor flux: night only" text.** `.digismith/sessions/workbox.md` explains the worker and Maestro flux, not this rule. The night rule text is in: `FLUX_USAGE` and the header comment in `flux-cli.ts`, the usage text in `scripts/conductor/cli.ts` line 36, the header comment of `flux.ts`, the main-conductor note ("No conductor flux in the daytime"), the b3-maestro brief, and the memory file `project_conductor-flux-night-rule.md`. The runbook and the notes are git-excluded or in the depot, so the conductor edits them by hand, not the builder.
6. Live agents today (herdr list, w2): `token-economics-conductor` is `done` at `w2:pK`; it keeps its files in the old `.digismith/sessions/b3-maestro/` (brief.md, note.md) and has no identity record. The depot also has `maestros/Token Economics/note.md`.

## Design

### D1. Replace the night window with the idle rule (no override flag)

Delete `NIGHT_WINDOW`, `inNightWindow`, step 0's window check, the `outside_night_window` skip, the `checks.night` field and the "night window" tests. Keep the refused-target check as step 0.
A conductor fluxes when all of these hold (checks 2 to 6 below are the existing ones; D2 and D3 sharpen two of them):

| Condition | Read from | Skip reason (unchanged names) |
|---|---|---|
| agent status idle or done | `herdr agent list` | `status_<x>` |
| input box empty | pane read, ANSI | `input_typed`, `input_box_unreadable` |
| no live worker tab | D2 | `worker_running:<name>` |
| no open ticket of its own | D3 | `note_running_rows`, `note_waiting_rows`, `note_ticket_in_flight:<KEY>` |
| note written after the last work | file times | `note_stale` |
| last look before the send | herdr get | `changed_before_clear` |

Reason names stay, so the run log, `needs_attention` and the CLI output keep their shape. `FluxResult.checks.night` disappears; nothing reads it (checked: only `flux.ts` and its tests).

Why no flag: a flag is a way to force a flux past the checks. The ticket wants the checks to be the only gate.

### D2. "No live worker tab"

Two reads, both exist today; the second gets stricter:

- An **open worker card** under the conductor's card (`role: worker`, `under: <conductor id>`, `status: open`). Unchanged.
- The target's `workers` list in `flux-targets.json`: today a worker counts only when herdr shows it `working` or `blocked`. Change: **any status counts, as long as the agent exists in herdr.** An idle or done worker that is still there is a tab not yet closed (tab cleanup is automatic), so its ticket is not finished and the conductor may still owe it an answer or a close. Reason stays `worker_running:<name>`.

Not done: guessing workers from names in `herdr agent list`. Names do not say whose worker it is; the card `under` field and the explicit list do.

### D3. "No open ticket of its own"

ClickUp has no field that says which conductor owns a ticket (no assignee, no Mode or lineage link), so the flux cannot ask ClickUp "what does this conductor own". The per-conductor record is its note, which `note_stale` already forces to be newer than the last work. So the reading stays on the note, with two changes:

1. `IN_FLIGHT` in `scanNoteInFlight` gains the statuses `to do`, `in progress`, `claimed` (it already has review, waiting, building, running, merging). A line in a note section newer than the last handoff that names a `DGS-n` key and one of these words, without a negating word (no, none, done, merged, closed, parked...), blocks the flux: `note_ticket_in_flight:<KEY>`.
2. The state block rows (Running, Waiting) block as today.

Consequence, on purpose: a conductor that leaves a merged ticket "in progress for the Maestro's first-use check" must write it as parked or "merged", or it is not fluxed. Jack's rule is that such a ticket is the Maestro's, so this is the right line. The skill that writes the note (`digismith:handoff`, the "Session end" block) already puts finished work under the handoff heading, which resets the scan.

Not done: a ClickUp status lookup per key in the note (`ticket-status.ts`). Reason: it needs a key-to-conductor map that does not exist, it costs a `dg clickup get-task` per key, and a failed lookup would have to fail open or closed with no good answer. If the false-block rate is high in the first real use, that is a follow-up ticket, not part of this one.

### D4. `flux-targets.json`

Create `~/.digismith-depot/flux-targets.json` (the depot, not the repo; the builder writes it as part of first use, after the merge). First content:

```json
{
  "token-economics-conductor": {
    "project": "DigiSmith",
    "brief": ".digismith/sessions/b3-maestro/brief.md",
    "note": ".digismith/sessions/b3-maestro/note.md"
  }
}
```

No `wake` (the default wake names brief and note) and no `workers` yet (its open worker cards are read from the session cards). Relative paths resolve against the repo root; they are checked to exist by the flux itself (`no_brief`, `no_note`). The `--all` run takes every key of this file, so one entry means `--all` fluxes only this conductor. Adding `main-conductor` and others is a later edit, one entry each.
The file is machine state: it is not committed and not uploaded.

### D5. The scheduler job

There is nothing to update (finding 4). Decision: this ticket adds **no** scheduler job. A job that fluxes every idle conductor on a timer, at any hour, is a different risk (it removes Jack's watching eye) and is its own ticket under DGS-434/435. This ticket makes the manual entry `dg conductor flux <agent> | --all` day-safe, and writes the follow-up as one line in the report.
The module stays a job module (`fluxConductor`, `fluxAll`), so the later job needs no change here.

### D6. Text that changes

Builder (in the repo):
- `FLUX_USAGE` and the header comment of `flux-cli.ts`: replace "only at night (23:30 to 02:00 UTC+7); there is no override" with "a conductor fluxes when it is idle or done, has no live worker tab and no open ticket of its own; every check runs; --dry-run sends nothing".
- `scripts/conductor/cli.ts` line 36: "(night only, see flux)" becomes "(only when idle, see flux)".
- Header comment of `flux.ts`.

By the conductor, outside the repo (listed in the order so nothing is missed): the main-conductor note line "No conductor flux in the daytime", the b3-maestro brief line "fluxed only at night", the memory file `project_conductor-flux-night-rule.md` (rewrite as "idle rule"; Maestro owns memory), and a runbook line under the Flux section (git-excluded edit) that states the idle rule.

### D7. First use

After the merge: `dg conductor flux token-economics-conductor --dry-run` (needs `HERDR_WS=w2`), read every check in the output, then one real flux of `token-economics-conductor`. The Maestro and Jack watch it. The run is logged to `~/.digismith-depot/runs/conductor-flux/<date>.jsonl`. The ticket stays `in progress` until the Maestro has seen the real flux verify (new session id, reply, idle, old card closed, new card open and pointing at the same note).

## Errors

No new error kinds. A skip is a normal result (exit 0). `failed` (clear not seen, verify failed) is unchanged: `needs_attention`, exit 2.
Daytime risk that is new: Jack may be reading the conductor tab. The input-box check covers typed text; the final `changed_before_clear` look covers a turn started in between. A conductor mid-answer is `working`, so it is skipped.

## Tests (in the existing files, vitest style as today)

`flux.test.ts`:
- remove: "night window" block (3 tests), "outside the night window".
- change: "a worker of the target list that herdr shows working" becomes a table over `working`, `blocked`, `idle`, `done` (all skip with `worker_running:<name>`); a name that herdr does not list does not skip.
- add: `scanNoteInFlight` catches `DGS-9 in progress`, `DGS-9 to do`, `DGS-9 claimed`; does not catch "DGS-9 merged, was in progress", "no ticket in progress", or text before the last "## Session end".
- add: a dry run and a real flux both run by day (clock set to 14:00 UTC+7); the existing "works by day" dry-run test is kept.
- keep unchanged: every other skip, the flux, verify and log tests.
`flux-io.test.ts`: `FLUX_USAGE` no longer says night; a test pins that `--dry-run` text.
`flux-cli`: add a check that the usage text contains neither "night" nor "override".
Whole suite stays green (`pnpm test`).

## Out of scope

A scheduled flux job (D5); a ClickUp lookup of ticket status (D3); changing the herdr verb guard (no new verb is needed); fluxing a Maestro (still refused); other conductors in `flux-targets.json`.

## Decisions I made (technical, not taste)

D2 any-status worker tab; D3 note reading and the three words; D4 file content; D5 no job. Reasons are in each section.

## Taste question for Jack

None.
