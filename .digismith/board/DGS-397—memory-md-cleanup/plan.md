# Plan: DGS-397 MEMORY.md keeps only the founding docs

Part 4 of DGS-327. ClickUp `14zcebrvdn1` (F.7). Date 2026-10-11.

## Step 1: what moved where (done, read back)

| MEMORY.md section | Went to | Read-back |
|---|---|---|
| "Frozen: the clan-letter map" l.225-315 (91 lines, 76,642 bytes) | DGS-356 (Notes): attachment `frozen-letter-map.md` plus an appended section "The frozen letter map" | Attachment byte-identical to the source (cmp). Old description saved first; read-back shows the old 14 text lines intact. Only differences: blank line before the new section, ClickUp autolinks on `frozen-letter-map.md` and `MEMORY.md`. |
| The career-notes section, l.106-131 | New ticket **DGS-398** (Notes list, backlog, priority Normal), description = the section, .md attached | Same words. ClickUp split two wrapped bullets into paragraphs and added an autolink. No text difference. |
| "Open questions (current)" l.212-224: F's shape | DGS-167 already holds it (get-task --markdown: options a/b/c, who runs the critique, rendering, recording) | No append needed. |
| same: shipped-product telemetry | DGS-168 already holds it | No append needed. |
| same: `{{MAP_ITEM}}` gap | No ticket existed (searched every list). New ticket **DGS-399** in F.7 (backlog, priority Normal) | Read back: text as written. |

Old descriptions are in the scratchpad (`dgs-356-old.md`, `dgs-167-old.md`, `dgs-168-old.md`).
Note: DGS-356's old text says "History entries ... are in .digismith/history.html". That file is gone; I leave the ticket text as is (not mine to rewrite). Tell Jack if wanted.

## Step 2: planned MEMORY.md structure

- l.1-9 intro: same title; the paragraph keeps "foundational document: the philosophy every later spec argues from" and drops "the map of what gets built, and the order it gets built in". The status line becomes: ClickUp is the only tracker, the frozen map lives on DGS-356.
- "Where work is tracked now": rewritten. ClickUp is the only tracker; `backlog/` is gone (DGS-327); working files in `.digismith/board/<KEY>—<slug>/`, `.digismith/docs/<slug>/` for work with no key, `.digismith/sessions/`; shipped work goes to the depot history page through hook 03 (`DIGISMITH_HISTORY_DIR`, DGS-389), not `.digismith/history.html`; the frozen letter map lives on DGS-356 as `frozen-letter-map.md`; no new letter or lineage number.
- Philosophy: UNCHANGED.
- Structure: UNCHANGED.
- What Superpowers already covers: UNCHANGED.
- The career-notes section: replaced by one line: moved to ClickUp DGS-398 (Notes).
- Conventions: UNCHANGED (report-implementation l.192 and l.209 read "MEMORY.md's Conventions section": the heading stays).
- "Open questions (current)": replaced by one line: now DGS-167, DGS-168, DGS-399.
- "Frozen: the clan-letter map": replaced by one line: now the attachment on DGS-356.
- Expected size: about 315 -> about 200 lines; bytes measured before and after in the report.

## Conflict to decide (needs Jack or the maestro)

The brief says Philosophy and Structure stay UNCHANGED and also that MEMORY.md has no personal or employer text after the edit. Two lines in the kept sections break that:
- l.41 (Philosophy 3): the sentence about the notes pipeline.
- l.82 (Structure tree): the personal profile file name (a tracked file; no employer prose).
My plan: keep both UNCHANGED (the order wins), and report them. If you want them gone, say so: l.41 loses the words naming the notes pipeline and l.82 loses the profile file line.

## Tracked references to a removed section

Searched: `git grep` for frozen, clan-letter map, Build order, map item, MEMORY.md, Open questions in everything but `.digismith/` and MEMORY.md; then `.digismith/docs`.

| File | Reference | Planned fix |
|---|---|---|
| README.md:5 | "MEMORY.md for the full philosophy and roadmap" | "the philosophy" (no roadmap in MEMORY.md any more) |
| README.md:7 | "progress tracker across every map item" | "across every ticket" |
| README.md:26,38,51,65,78,125,223 | "(map item **M**)" etc. | none: letters stay as historic ids, the map is on DGS-356 |
| docs/getting-started.md:4 | "Philosophy lives in MEMORY.md" | none: still true |
| docs/getting-started.md:114 | "live progress per map item and per tier" | "per ticket" |
| vendored/PROVENANCE.md (10 lines: 29, 42, 50, 59, 64, 69, 72, 84, 108, 143) | "see DigiSmith `MEMORY.md` map item W" | "see the frozen letter map (DGS-356), map item W"; l.143 "Recording the switch in MEMORY.md" is a task note: leave |
| skills/report-implementation/SKILL.md:192,209 | "MEMORY.md's Conventions section" | none: heading stays |
| skills/*/SKILL.md "map item **X**" (about 30 lines) | historic letter ids | none |
| skills/brainstorming/SKILL.md:194,213,251-258 | `{{MAP_ITEM}}` placeholder | none: DGS-399 owns it |
| scripts/agentic-bridge/server.ts:4, scripts/check_vendored_skills.ts:182, own-repo-config.test.ts, session-path.test.ts | "map item K.9", "frozen" copies, "clan-letter" fixture | none: not about MEMORY.md sections |
| scripts/git-hooks/commit-msg.test.ts:104 | MEMORY.md as a fixture | leave (order) |
| `.digismith/docs/**` (design, plan, report files) | "MEMORY.md row", "Map item: X" | none: frozen historical docs |

No script or test changes: no test run needed beyond a quick `git diff --stat` check.

## Rulings applied (Master, 2026-10-11, after checkpoint 1)

- Philosophy l.41: only the words naming the notes pipeline were replaced by "Jack's retrospective career-notes pipeline (DGS-398)".
- Structure l.82 (the personal profile file name) stays: it is a real tracked file name.
- The heading of the career-notes section became "Relationship to Jack's notes pipeline" so the public file names no career folder.
- DGS-356 got one appended line at the end: the history page lives in the depot (DGS-389). Old text intact on read-back.

## Result

MEMORY.md: 315 lines, 89,858 bytes before; 197 lines, 11658 bytes after (see report).
