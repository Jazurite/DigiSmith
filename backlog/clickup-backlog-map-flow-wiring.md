# Wire DigiSmith's own backlog/map flow to the ClickUp connector

Once the ClickUp connector package (brainstormed 2026-09-24, expected under
the **V** lineage — see `.digismith/docs/V/` once shipped) exists, wire
DigiSmith's own backlog- and map-tracking flow to actually call it, replacing
the current `backlog/*.md` flat-file filing and `MEMORY.md` map-table prose
edits for **new** entries going forward (per Jack's decision this session:
not dual-write, not additive — a full replacement for new items only; the
~55 existing `backlog/*.md` files and ~40 already-shipped map letters stay
frozen, no bulk migration).

Touches: `digismith:brainstorming` (where a new letter/sub-item gets
proposed), `digismith:writing-plans`, `digismith:report-implementation`
(where a build gets marked shipped), and the `post-finish` lifecycle hooks.

Deliberately deferred out of the connector-package brainstorm itself — that
brainstorm is scoped to only the connector + its `dg clickup` CLI surface,
not this consumer wiring. Depends on the connector package shipping first.
