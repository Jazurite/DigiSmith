# DGS-41 plan: Migrate Letter P (Telemetry), checkpoint 1

Written 2026-10-10 (UTC+7). Read-only. No ClickUp write, no git change. Waiting for "approved: checkpoint 1" (Jack picks the target).

## 1. Every historical P sub-item
Letter P has no sub-letters (no P.1, P.2). One shipped build plus a few follow-ups and backlog ideas.

| Source | Item | Date (UTC+7) |
|---|---|---|
| MEMORY.md row P, history.html | P Telemetry: capture a ticket build's session transcript and commit it into DigiSmith's repo, raw and unredacted by choice. Pulled forward, outside any tier | built 2026-08-12 |
| git `6efc438`, `525cd5f`, `9d5e15e`, `5b2cd56`, `6b7b06c`, `d04b00b`, `bdd7d59`, `ef0d005`, `3f5e3c9` | design, plan, `logging` profile field + marker, `skills/telemetry`, fixes, README, report, history | all 2026-08-12 |
| git `3104d2a` | fix: Step 3.5 menu-skip path in the trigger phrase | 2026-09-08 |
| git `601ab10` | `logging: false` in all three profiles ("not ready yet"): capture is OFF | 2026-09-04 |
| `.digismith/docs/telemetry/` | `design.html`, `plan.md`, `report.html` | 2026-08-12 |
| `skills/telemetry/SKILL.md` | the skill | 2026-08-12 |
| `backlog/telemetry-auto-lifecycle.md` | idea, 2026-08-14: start and stop telemetry on its own. No ClickUp key | not built |
| `backlog/shipped-product-telemetry.md` | idea: instrument the deployed app. Already DGS-168 (D.1) | not built |
| `backlog/telemetry-and-data-collection-plan.md` | epic DGS-220 (Imperium); DGS-214 (B.3) is its first ticket | not built |

The last two backlog items already have tickets. Not touched here.
Retired meaning: none. P has meant Telemetry since it was created.

## 2. Earlier ticket draft (superseded by the table in section 3)

| # | Name | One sentence | Ship date | Attach |
|---|---|---|---|---|
| 1 | Session transcript capture: the telemetry skill (P) | The telemetry skill slices a ticket build's transcript from a marker and commits it raw into DigiSmith's repo, after the integration decision. | 2026-08-12 | `telemetry/design.html`, `plan.md`, `report.html` |
| 2 | Logging profile field and telemetry marker (P) | A `logging` field in each profile gates capture, and bootstrap/adopt write `.digismith/telemetry-marker`. | 2026-08-12 | none (docs cover it in ticket 1) |
| 3 | Switch telemetry logging off in all profiles | Commit 601ab10 set `logging: false` in digismith, emma and jazurite because capture was not ready. No letter: a state change, not a map meaning. | 2026-09-04 | none |
| 4 (optional) | Telemetry auto lifecycle (P) | Start and stop capture automatically. Idea, status backlog, no dates. Only if Jack wants the idea tracked. | none | `backlog/telemetry-auto-lifecycle.md` |

The 2026-09-08 fix (`3104d2a`) is folded into ticket 1's description, not a ticket.
Tickets 1-3 would be status `done`, start = due = ship date. Ticket 2 could merge into ticket 1 (Jack's call; I lean merge: one build, one report).
Recommended: tickets 1, 3 and 4 (2 merged into 1).

## 3. Target: a Telemetry lineage in the new monitoring clan (Amendment 2, replaces Amendment 1)
Jack decided in principle (DGS-232, `backlog/monitoring-analysis-clan.md`): a dedicated clan for monitoring, telemetry, metrics, token count analysis
(reads the DGS-214 counter's results), ingest, analysis and visualization (Grafana). Clan letter **G** (Jack). Name open. Option (b) (A.1) is dropped.
Nothing below exists yet. I create no folder, list or ticket before Jack's yes on the name, the letter and this plan.

**Name options for the folder**
| Name | For | Against |
|---|---|---|
| Monitoring | Jack's own word; says what the clan does; plain | Narrow: telemetry and analysis are more than watching |
| Analysis | Covers reading, metrics, token analysis | Hides Grafana dashboards and live monitoring |
| Observatory | Same style as Scripture and Imperium; covers watch + analyse + show | Less obvious to a new reader |

**Recommendation: Observatory** if Jack wants the Scripture/Imperium style, else **Monitoring** (his own word). Either way the folder is `G: <name>`.
Say "clan G" for this one and "letter G" for the legacy Methodology letter (now clan E).

**Lists I would create (after the yes)**
| List | Purpose |
|---|---|
| G.0 Pavilion | Pavilion rule: every new clan starts with `.0` Pavilion (clan-level overview and shared work) |
| G.1 Telemetry | Letter P: capture of session transcripts. Holds the P tickets below |

Further lineages (G.2 Metrics, G.3 Token Analysis, G.4 Visualization/Grafana) are Jack's call per DGS-232. I propose none now: an empty list is noise.
Nothing moves: B.3 / DGS-204 / DGS-214 stay in B; DGS-168 (D.1), DGS-220 (Imperium) stay where they are.
Per Jack's rule the skill ticket's home is A.1; the Telemetry lineage holds the telemetry stage tickets. Open for Jack: P tickets live only in G.1 (my plan), or the skill ticket in A.1 and the rest in G.1.

**P tickets in G.1 Telemetry** (status `done`, start = due = ship date; ticket 4 backlog)
| # | Name | Description | Ship date | Docs |
|---|---|---|---|---|
| 1 | Session transcript capture: the telemetry skill (P) | The telemetry skill slices a ticket build's transcript from a marker and commits it raw into DigiSmith's repo; the 2026-09-08 trigger fix is part of it. | 2026-08-12 | `telemetry/design.html`, `plan.md`, `report.html` |
| 2 | Logging profile field and telemetry marker (P) | A `logging` field in each profile gates capture, and bootstrap/adopt write `.digismith/telemetry-marker`. Suggest merging into 1. | 2026-08-12 | none |
| 3 | Switch telemetry logging off in all profiles | Commit 601ab10 set `logging: false` in digismith, emma and jazurite because capture was not ready. No letter. | 2026-09-04 | none |
| 4 (optional) | Telemetry auto lifecycle (P) | Start and stop capture on its own. Idea, status backlog, no dates. | none | `backlog/telemetry-auto-lifecycle.md` |
| 5 (new, optional) | Keep raw transcripts out of the public repo | Redaction, or storage outside the repo, before `logging` is turned on again (DGS-232 open question 4). Status backlog. | none | none |

Ticket 5 is new work, not history. I add it only on Jack's yes.

## 4. Read-only transcript check (repo is PUBLIC)
- Skill target path is `.digismith/telemetry/<repo>/<slug>/<ts>.jsonl`.
- Result: **no transcript was ever committed.** No `.digismith/telemetry/` dir on disk; no history for that path in any ref (`git log --all`); no `.jsonl` file ever added in any ref; no telemetry capture commit message in the log.
- Reason: `logging: false` in all profiles since 2026-09-04, and the build ran only as UAT planning.
- Secret scan: nothing to scan, so zero files with token shapes, IPs or emails. Matched values: none.
- Residual risk: the skill is still installed. Turning `logging: true` back on would commit raw transcripts to the public repo. Suggest a follow-up ticket in E or A (redaction or a private store), likely under DGS-220. I make none without Jack's yes.

## Questions for Jack
1. Clan name: Observatory, Monitoring or Analysis? Letter G confirmed?
2. Lists: only G.0 Pavilion and G.1 Telemetry for now?
3. Skill ticket (1) in G.1 with the rest, or in A.1?
4. Merge ticket 2 into 1? Keep 3? Include 4 and 5?
