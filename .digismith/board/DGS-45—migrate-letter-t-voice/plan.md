# DGS-45 plan: Migrate Letter T (Voice), checkpoint 1

Written 2026-10-10 (UTC+7), revised for the Decision (clan H: TBD). Read-only. No ClickUp write, no list, no folder, no git change except this file.
Waiting for Jack's pick of a target and clan name, and "approved: checkpoint 1".

## 1. Every T sub-item (current meaning)
T is the Voice letter (promoted 2026-09-13 out of G, where it was "G.3"). Sources: MEMORY.md row T, `.digismith/history.html`, `.digismith/docs/`, `backlog/*.md`, git log, the G rescan report.

| Item | What it is | Ship date (UTC+7) | Evidence |
|---|---|---|---|
| T.1 ASD-STE100 Writing Standard (was "G.3.1") | 3 files `standards/global/ste100-writing.md`, `ste100-word-swaps.md`, `ste100-use-cases.md` + 3 `index.yml` entries. Content only. | 2026-09-12 | `ed672dd`, report `4b7f3b0`; docs `asd-ste100-writing-standard/` (design, plan, report; they still say "G.3.1", frozen) |
| T.1 review fixes | Fable review (15 issues), 13 fixed the same day, 2 deferred (became the prose gate) | 2026-09-12 | `428498b` |
| Prose-scope gate for `inject-standards` (no letter) | `kind: prose` (Scenario 4 skips it) and `companions: [...]` in `index.yml`; `inject-standards` and `index-standards` honor both | 2026-09-13 | `09484d5`; docs `inject-standards-prose-scope-gate/` (design, plan, NO report); `backlog/inject-standards-prose-scope-gate.md` (status Applied) |
| T.5 Conversational Voice | `standards/global/ai-voice-conversational.md` + `index.yml` entry (from `ayghri/i-have-adhd`, MIT). Content only. | 2026-09-13 | `6468995`, merge `06a49b5`; docs `ai-voice-conversational/` (design, plan, report) |
| T.7 Voice Selection | `technical_voice` / `conversation_voice` per-repo switches, skill `digismith:voice` (`scripts/voice.ts`), Voice Gate in `inject-standards`, bootstrap/adopt Step 0.7, `scripts/voice-init.ts` for the W.10 SessionStart hook | 2026-09-22 | `dd3f1bf`..`997f214`, report `b40bedc`; docs `voice-selection-t7/` (design, plan, report) |
| T.2 Artifact Integration | `generate-comment`, `report-implementation`, `finishing-a-development-branch` consult T.1, gated by `technical_voice` | 2026-09-23 | `00443e3`, `1192054`, `df045d6`, `613dc17`, report `56951c0`; docs `T/T.1-wire-standards-into-generated-artifacts-t2/` (design, plan, report) |
| T.3 Consuming-repo propagation | put T.x content into a repo's committed `CLAUDE.md` | backlog | `backlog/ste100-consuming-repo-propagation-t3.md` |
| T.4 Portable output style + linter | output-style file and an `ste-lint` adaptation | backlog | `backlog/ste100-portable-packaging-t4.md` |
| T.6 Audience-Filtering Voice | filter content by reader (PO/PM vs developer); raw idea | backlog | `backlog/audience-filtering-voice-t6.md` |
| T.1 anti-slop enhancement | cluster counting, preserve list, bigger tell catalog (EveryDay-Writer); deferred T.1 follow-up | backlog | `backlog/ste100-anti-slop-enhancement.md` |
| Category-scoped injection | raw idea from the T.2 brainstorm (2026-09-23), the rescan marks it "Not G" | backlog | `backlog/inject-standards-category-scoped-injection.md` |

Not tickets:
- `fix(voice)` of 2026-10-02 (`e9f85b2`) and the preferences move to `config.yml` (`178cb31`, `53a1eef`): part of DGS-141 (done, A.4) and DGS-142. Nothing to add.
- `backlog/ste100-writing-standard-t.md`: the source narrative of the whole lineage. Attach to the T.1 ticket; no ticket of its own.
- `backlog/README.md` still lists `ste100-artifact-integration-t2.md` (file gone, T.2 shipped). Stale index line; belongs to the DGS-165 sweep.
- The G rescan's item 4 ("G.3.1, G.3.2 to G.3.6, T.1 to T.5, Voice Gate") moved here. Mapped once, above. Item 9 (category-scoped injection) mapped above.

## 2. Overlap check (existing tickets)
- DGS-192 Standards injection (G.1, E.1, done): the base `inject-standards` skill. Covers none of T. The prose gate and the category-scoped idea are follow-ups of it: link, not duplicate.
- DGS-193, DGS-194 (G.2 toolchain, done), DGS-195 (G.3 docs conventions, done): none covers T. DGS-205 (global standards: git/PR, E.1): not T.
- DGS-229 (E.1, backlog): the article-writing standard. It only mentions T.1 and T.6 as relations. It is not a T item. `backlog/article-writing-standard.md` stays with DGS-229.
- DGS-141 (config.yml, done): holds the voice migration fix. DGS-143 (timezone setting, O.1): not T.
- No A.1 ticket exists for `digismith:voice`. No F.7 ticket mentions voice. O.2 (Tailoring) is empty (0 tasks).
- `backlog/distribute-parked-letters.md` says a parked placeholder clan was called "T", and notes the name clashes with this letter. A naming note for the Master, not a T ticket.

## 3. Target (decided by Jack, 2026-10-10)
Clan H, named `H: TBD` for now. Options (a) spread and (b) E.5 are dropped. New folder `H: TBD` in the DigiSmith space (`1301150000001271`), 7 lists. Created only after "approved: checkpoint 1".

| List | Description (draft) |
|---|---|
| H.0: Pavilion | Items that affect more than one voice, or the clan as a whole: the clan name, voice selection, rules shared by all voices. |
| H.1: Technical voice | AI-written artifacts read by an engineer or agent: PR descriptions, JIRA and Teams comments, reports, skill text (ASD-STE100). |
| H.2: Conversation voice | The shape of live replies to an engineer. |
| H.3: Public article voice | Articles, tutorials and write-ups for readers outside the team. |
| H.4: Presentation voice | Slides and talks. |
| H.5: Business voice | Text for business readers: PO, PM, owners. |
| H.6: Analytical voice | Reports and analysis that argue from data. |

## 4. Tickets
Rule: plain title + map id in brackets, one sentence, `done` with start = due = ship date, or `backlog` with no dates, one attachment per doc, every ticket read back. No ticket in Imperium.

| # | Name | One sentence | List | Status / date | Attachments |
|---|---|---|---|---|---|
| 1 | ASD-STE100 writing standard (T.1) | Three `standards/global` files give AI-written prose a controlled-language standard (rules, 52-row word-swap table, nine genre patterns); review fixes folded in. | H.1 | done, 2026-09-12 | `asd-ste100-writing-standard/` design.html, plan.md, report.html; `backlog/ste100-writing-standard-t.md` (source narrative) |
| 2 | inject-standards: prose scope gate and companion files | `kind: prose` keeps prose standards out of code-subagent briefs and `companions:` carries sibling files; follow-up of DGS-192. | H.1 | done, 2026-09-13 | `inject-standards-prose-scope-gate/` design.html, plan.md (no report exists); `backlog/inject-standards-prose-scope-gate.md` |
| 3 | Wire the writing standard into generated artifacts (T.2) | `generate-comment`, `report-implementation` and the PR description step consult T.1 when `technical_voice` is on; names DGS-249 and DGS-253 (F.7). | H.1 | done, 2026-09-23 | `T/T.1-wire-standards-into-generated-artifacts-t2/` design.html, plan.md, report.html |
| 4 | Portable output style and mechanical linter for the writing standard (T.4) | Idea: T.1 as a Claude Code output style plus an `ste-lint` adaptation. | H.1 | backlog | `backlog/ste100-portable-packaging-t4.md` |
| 5 | Writing standard: cluster restraint, preserve list and a bigger tell catalog (T.1 follow-up) | Idea: stop flagging a single tell and protect signs of human writing, from EveryDay-Writer. | H.1 | backlog | `backlog/ste100-anti-slop-enhancement.md` |
| 6 | Conversation voice standard (T.5) | `ai-voice-conversational.md` sets the response shape for live talk with an engineer (action first, one next step, no preamble). | H.2 | done, 2026-09-13 | `ai-voice-conversational/` design.html, plan.md, report.html |
| 7 | Voice switches: technical and conversation voice per repo (T.7) | A repo turns T.1 and T.5 on or off alone (both default on), through a Voice Gate in `inject-standards`, the ticket-start step and the SessionStart banner. | H.0 | done, 2026-09-22 | `voice-selection-t7/` design.html, plan.md, report.html |
| 7b | digismith:voice skill: view and set the voice switches (T.7) | The skill and `scripts/voice.ts` read and write the two voice preferences; ticket 7 and this one name each other. | A.1 (Primitives, `1301150000002238`) | done, 2026-09-22 | none (docs are on ticket 7; the description points to it) |
| 8 | Propagate the voice standards into a repo's own CLAUDE.md (T.3) | Idea: a committed, team-shared `CLAUDE.md` section so every engineer's session follows the voices; it must carry any voice, not only T.1. | H.0 | backlog | `backlog/ste100-consuming-repo-propagation-t3.md` |
| 9 | Audience-filtering voice (T.6) | Idea: filter content by reader, no git mechanics for a PO, no filler for a developer; a cross-voice rule that links the business voice (ticket 13). | H.0 | backlog | `backlog/audience-filtering-voice-t6.md` |
| 10 | Write down the name for clan H | Clan H is `H: TBD`; options so far: Voice, Oratory, Rhetoric; same pattern as DGS-237 for clan G. | H.0 | backlog | none |
| 11 | inject-standards: category-scoped injection | Idea from the T.2 brainstorm: let a caller ask for "just the writing standards"; follow-up of DGS-192. Not a voice item, so it stays with DGS-192. | E.1 (Standards, `1301150000002966`) | backlog | `backlog/inject-standards-category-scoped-injection.md` |
| 12 | Public article voice | Concept: how AI writes a tutorial or write-up for outside readers; names DGS-229 (E.1, the article writing standard), which gets a back-link only with Jack's yes. | H.3 | backlog | none |
| 13 | Business voice | Concept: how AI writes for PO, PM and owners; links ticket 9. | H.5 | backlog | none |
| 14 | Presentation voice | Concept: how AI writes slides and talk scripts. | H.4 | backlog | none |
| 15 | Analytical voice | Concept: how AI writes analysis and reports that argue from data. | H.6 | backlog | none |

Totals: 16 tickets (ids 1 to 15 plus 7b): 6 done, 10 backlog (4 of them concepts, 1 the naming ticket). Every list holds a ticket: H.0 4, H.1 5, H.2 1, H.3 to H.6 1 each.
- T.3 and T.6 go to H.0 (they apply to every voice). T.4 goes to H.1 (it packages T.1). T.5 to H.2. T.7 to H.0, its skill to A.1.
- Links (each names the other): 7 and 7b; 9 and 13; 12 and DGS-229. Tickets 2 and 11 name DGS-192. DGS-45 and DGS-25 untouched until the end. I do not edit DGS-229 without a yes.

### Backlog files of T and their tickets (for the Master to write back)
| Backlog file | Ticket |
|---|---|
| ste100-writing-standard-t.md | attachment on ticket 1 (no key of its own) |
| ste100-consuming-repo-propagation-t3.md | ticket 8 |
| ste100-portable-packaging-t4.md | ticket 4 |
| audience-filtering-voice-t6.md | ticket 9 |
| ste100-anti-slop-enhancement.md | ticket 5 |
| inject-standards-category-scoped-injection.md | ticket 11 |
| inject-standards-prose-scope-gate.md | ticket 2 (status Applied) |
| article-writing-standard.md | already DGS-229 (not T) |
| ste100-artifact-integration-t2.md | file is gone; shipped as ticket 3 |
Keys are written after creation.

## After "approved: checkpoint 1"
Create the folder and 7 lists, then the tickets in the order above, attach docs (`dg clickup upload-attachment`), read every ticket back, write `report.html`. DGS-45 stays as it is.

## Questions for Jack
1. Backlog tickets 4, 5, 8, 9, 11: create all five?
2. Ticket 11 in E.1 (with DGS-192), not H: OK?
3. Concept tickets 12 to 15 as drafted, in Jack's list order (article, presentation, business, analytical)?
