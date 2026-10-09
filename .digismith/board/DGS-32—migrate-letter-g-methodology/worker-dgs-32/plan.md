# DGS-32 plan: Migrate Letter G (Methodology), checkpoint 1

Written 2026-10-07 (UTC+7). No ClickUp write has been made. Waiting for "approved: checkpoint 1".

## What I found
- The clan folder (E: Methodology, `1301150000002460`) and its lists already exist. Nothing to create there.
  - E.1 Standards `1301150000002966`: 0 tasks.
  - E.2 Toolchain `1301150000002967`: 0 tasks.
  - E.3 Conventions `1301150000002969`: 5 tasks, all current work (DGS-158, 159, 164, 165, 166). E.4 has current work too. I leave both alone.
- Recipe copied from finished tickets (DGS-65 in A.3 as the model, DGS-47 W and DGS-49 Y as the parents):
  name = plain title + map id in brackets, one short description sentence, start date = due date = real ship date,
  status `done`, one attachment per generated doc (`design.html`, `plan.md`, `report.html`), read back at the end.
  `date_created` stays the real creation day (today); the ship date goes in start and due dates.
- Ship dates come from git (report commit date) and `.digismith/history.html`.

## Tickets I would create (4)

| # | Name | List | Ship date | Attach (from `.digismith/docs/`) |
|---|------|------|-----------|-----------------------------------|
| 1 | Standards injection (G.1) | E.1 `1301150000002966` | 2026-08-06 | `standards-injection/design.html`, `plan.md`, `report.html` |
| 2 | Toolchain defaults: toolchain.yml and digismith:toolchain (G.2) | E.2 `1301150000002967` | 2026-09-11 | `toolchain/design.html`, `plan.md`, `report.html` |
| 3 | Merge letter U into G and rename G to Methodology (G.2) | E.2 `1301150000002967` | 2026-09-11 | `structure-merge-g-and-u/` x3 and `rename-g-methodology/` x3 (6 files) |
| 4 | Dynamic Doc Conventions: per-letter doc nesting (G.3) | E.3 `1301150000002969` | 2026-09-23 | `dynamic-doc-conventions/design.html`, `plan.md`, `report.html` |

Descriptions (one sentence each, status `done` on all four):
1. Jack's coding standards and style guide carried into every implementer subagent's brief, via the `digismith:inject-standards` skill and `standards/index.yml`.
2. A dictatable list of Jack's standing tool defaults in `toolchain.yml`, read by `digismith:brainstorming` so it stops re-asking decided questions. First built as letter U.
3. Map housekeeping the same day: the standalone letter U folded into G.2, and G renamed from its old title to Methodology. Letter U freed for reuse.
4. Docs nest by letter as `.digismith/docs/<Letter>/<Letter.N>-<slug>/`. Superseded by DGS-158 (ticket-based naming); kept here as history.

Ticket 3 is a judgment call: it is map housekeeping, not a feature. Alternative: drop it and attach the six files to ticket 2. I prefer a separate ticket so the dates and docs stay honest.

## What I do about G.3
- Create ticket 4 as `done` with its real ship date (2026-09-23) and its three docs, in E.3.
- Say "superseded by DGS-158" in its description. No link edit on DGS-158, no change to DGS-158, DGS-159, DGS-164, DGS-165 or DGS-166.
- Do not create a ticket for the new design: DGS-158 already is that ticket.

## What I do not create (and why)
- G.2.1 Diagramming tool integration: raw idea, never built (`backlog/diagramming-tool-integration-g21.md`).
- Toolchain general-trigger scope and docs-convention nesting backlog files: backlog items, not shipped. DGS-165 converts backlog files to tickets.
- `unified-docs-convention` (2026-08-08, no map letter), `rename-g-methodology` ticket is covered by 3. The `.digismith/docs/E/E.3` and `E.4` folders: current work, untouched.
- T.1 prose-scope-gate (2026-09-13) shipped as a T fix, not G.

## Questions for Jack
1. Is ticket 3 fine as its own ticket (E.2)?
2. DGS-164 ("Backfill tickets for the historical `.digismith/docs/` folders") may overlap with the attachments here. I keep going unless you say stop.

## After approval
Create 4 tickets, set `done`, set start and due dates, upload the docs, read each ticket back, write `report.html` next to this file. Stop and report. DGS-32 stays `in progress`.
