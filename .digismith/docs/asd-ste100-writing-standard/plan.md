# G.3.1 — ASD-STE100 Writing Standard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three new content-only standards files (the ASD-STE100 writing rules, a word-swap
table, and a per-genre use-cases guide) to DigiSmith's `standards/` library, indexed the same way
as every other standard.

**Architecture:** Three markdown files under `standards/global/` plus three new entries in
`standards/index.yml`. No code, no skill changes — `digismith:inject-standards` already knows how
to find, suggest, and inject anything listed in the index; this plan only supplies content.

**Tech Stack:** Markdown, YAML (hand-edited, no parser library — same as every existing
`standards/index.yml` entry).

## Global Constraints

- New content lives only under `standards/global/` — no code changes, no skill changes, no wiring
  of any consumer skill (that's a separate, deferred item — G.3.2)
- The hedge-preservation wording in `ste100-writing.md` must survive intact: never let a rewrite
  upgrade a hedge ("may have failed") into a stated fact ("failed")
- `ste100-word-swaps.md`'s table is adopted whole from AminBlg/SimpleEnglish (MIT) — all 52 rows,
  unchanged
- No AI/Claude/assistant attribution in any commit message (standing DigiSmith-wide rule)

---

### Task 1: Author the G.3.1 standards files and index entries

**Files:**
- Create: `standards/global/ste100-writing.md`
- Create: `standards/global/ste100-word-swaps.md`
- Create: `standards/global/ste100-use-cases.md`
- Modify: `standards/index.yml:10-12` (insert three new entries between `pr-descriptions` and
  `surgical-changes`, preserving the existing alphabetical order)

**Interfaces:**
- Consumes: nothing — first task, no prior DigiSmith code or content to build on
- Produces: three standards files at the paths above, discoverable by
  `digismith:inject-standards` via the three new `standards/index.yml` entries under `global:`.
  No other task in this plan depends on these outputs — the next consumer is the deferred,
  separately-planned G.3.2 (`backlog/ste100-artifact-integration-g3-2.md`)

- [ ] **Step 1: Write `standards/global/ste100-writing.md`**

```markdown
# ASD-STE100 Writing Standard

Style discipline for AI-generated prose read by someone other than Jack in
the moment — PR descriptions, JIRA/Teams comments, report prose, and
`SKILL.md` authoring. Not for code, code comments (see
`global/code-comments.md`), or live conversation.

Adapted from [danyuchn/asd-ste100-skill](https://github.com/danyuchn/asd-ste100-skill)'s
STE-flavored mode — DigiSmith has no agent-facing Strict-mode use case (tool
descriptions, inter-agent instructions), so this file only carries the
prose-facing ruleset.

## Structural rules

Apply these with confidence — they describe sentence shape and need no
external dictionary to check.

| Rule | Do | Don't |
|---|---|---|
| Active voice | "The agent deletes the file." | "The file is deleted (by the agent)." — unless the actor is genuinely unknown or irrelevant |
| No phrasal verbs | "Remove the panel." / "Start the job." | "Take off the panel." / "Spin up the job." |
| One instruction per sentence | "Open the file. Read line 3." | "Open the file and read line 3, then check if it matches." |
| Sentence length | ≤20 words for instructions, ≤25 words for descriptions | Long compound/subordinate-clause sentences |
| No semicolons | Split into separate sentences | Any semicolon at all |
| Noun clusters | ≤3 words stacked as a noun phrase ("fuel pump valve") | 4+ word noun stacks |
| No ellipsis | Keep subject, verb, and article explicit | Drop words to save space, even if it reads longer |
| Keep modality | "The request **may have** failed." stays "may have" | Promote a hedge to a fact, or invent a certainty the source didn't state |
| Paragraph limits | One topic per paragraph, ≤6 sentences | Multi-topic paragraphs |
| Lists for sequences | Use a numbered or bulleted list for 3+ steps or conditions | Bury a sequence inside one prose sentence |

## Lexical rules — advisory only

These are direction-of-travel, not verified compliance — the real
ASD-STE100 dictionary (~900 approved words) is copyrighted and not
reproduced here, so there's nothing to check word choice against
mechanically.

| Rule | Do | Don't |
|---|---|---|
| One word, one meaning | Pick one verb for one action and reuse it every time | Rotate synonyms for the same idea across a document |
| Verb, not noun | "Analyze the log." | "Perform an analysis of the log." |
| Domain terms | Keep necessary technical nouns/verbs, define once if not common English | Use jargon without ever defining it |

See `global/ste100-word-swaps.md` for a concrete slop-word substitution
table and `global/ste100-use-cases.md` for per-genre patterns.

## Hedge preservation

**Never upgrade a hedge into a stated fact.** "May have failed" stays "may
have failed" — it does not become "failed." "Could be caused by X" does not
become "X is the cause." A hedge carries the author's actual confidence;
removing it is a different claim, not a simplification. This rule applies
even when a tighter, hedge-free rewrite would read better — clarity never
trades against accuracy.

## Scan checklist

Run this check before finalizing any drafted paragraph:

1. **Synonym rotation** — does the same thing have several names in one
   document ("the user", "the customer", "the client")? Pick one, use it
   throughout.
2. **Hedge stacking** — do qualifiers pile up until the sentence asserts
   nothing ("it is important to note that this may potentially help")?
   State the claim, or delete it.
3. **Nominalization** — is an action frozen into a noun ("perform an
   analysis of")? Use the verb ("analyze").
4. **Marketing adjectives** — words that claim quality instead of showing
   it (seamless, robust, powerful, cutting-edge, effortless). Delete, or
   replace with the measurement that earns the claim.
5. **Run-on sentences** — are several ideas joined by semicolons or em
   dashes? One idea per sentence.
6. **Soft phrasal verbs** — spin up, reach out, dive into, kick off. Use
   the plain verb (start, contact, read, begin).

## Boundaries

**Will:**
- Apply structural rules with confidence; treat lexical rules as a
  direction, not a checked standard
- Preserve every fact, condition, and scope qualifier in the source
  material
- Preserve the strength of every hedge

**Will not:**
- Simplify creative, marketing, or persuasive copy — voice and nuance are
  the point there, not this standard's target
- Fabricate a certainty the source material didn't state
- Polish a hollow paragraph into looking substantive — if there's nothing
  to say, say that instead of dressing it up
```

- [ ] **Step 2: Verify Step 1's content landed correctly**

Run: `grep -c "^## " standards/global/ste100-writing.md`
Expected: `5` (Structural rules, Lexical rules — advisory only, Hedge preservation, Scan checklist,
Boundaries)

Run: `grep -c "may have failed" standards/global/ste100-writing.md`
Expected: `1` or more (confirms the hedge-preservation example text is present verbatim)

- [ ] **Step 3: Write `standards/global/ste100-word-swaps.md`**

```markdown
# ASD-STE100 Word Swaps

Slop-word → plain-word substitutions for AI-generated prose. Adopted
whole from [AminBlg/SimpleEnglish](https://github.com/AminBlg/SimpleEnglish)
(MIT) — companion to `global/ste100-writing.md`.

| Slop | Write instead |
|---|---|
| leverage, utilize | use |
| in order to | to |
| prior to | before |
| ensure | make sure that |
| it is worth noting that | (delete) |
| it's important to | (delete — state the fact) |
| simply, just, easily, seamless, seamlessly, effortlessly | (delete) |
| robust, powerful, comprehensive, performant | (delete, or give the measurable property) |
| functionality | function, feature |
| enables you to, allows you to | you can |
| is designed to, aims to | (delete — say what it does) |
| facilitate | help, make possible |
| dive into, delve into | read, examine |
| when it comes to | for |
| in the event that | if |
| due to the fact that | because |
| as needed, as necessary | (state the condition) |
| and/or | Pick one, or write "X, or Y, or both" |
| e.g. / i.e. / etc. | for example / that is / (name the items) |
| gracefully handles | (say what it does: "retries three times, then stops") |
| out of the box | by default |
| under the hood | internally |
| blazingly fast | fast (give the number) / (delete) |
| streamline | make simpler, make faster |
| plethora, myriad | many |
| addresses the issue, tackles | corrects the fault, removes the error |
| pivotal, crucial, crucially, paramount | important |
| tapestry, testament, synergy | (delete) |
| interplay | interaction (or delete) |
| intricate | complex |
| vibrant, nuanced, multifaceted | (delete, or name the parts) |
| realm, landscape (metaphorical) | area |
| groundbreaking, cutting-edge, state-of-the-art, innovative, unprecedented | new (or delete) |
| transformative, game-changer | (delete — say what changes) |
| revolutionize | change |
| showcase, underscore, emphasize | show |
| foster, empower, bolster | help, support, let |
| harness | use |
| enhance | improve |
| elevate | increase |
| furthermore, moreover | also |
| in conclusion, in summary, at the end of the day | (delete) |
| embark, endeavor | start, try |
| meticulous, meticulously | careful, carefully |
| holistic | full |
| paradigm | model |
| navigate (metaphorical) | go to |
| boasts | has |
| nestled, in the heart of | (delete — give the location or the fact) |
| bustling | busy |
| that being said, notwithstanding | but |
| I hope this helps, let's dive in | (delete) |
```

- [ ] **Step 4: Verify Step 3's content landed correctly**

Run: `grep -c "^|" standards/global/ste100-word-swaps.md`
Expected: `54` (1 header row + 1 separator row + 52 data rows)

- [ ] **Step 5: Write `standards/global/ste100-use-cases.md`**

```markdown
# ASD-STE100 Use Cases

Per-genre patterns for applying `global/ste100-writing.md` and
`global/ste100-word-swaps.md`. Adapted from
[AminBlg/SimpleEnglish](https://github.com/AminBlg/SimpleEnglish) (MIT).

## Error messages and CLI output

**DigiSmith fit:** `@digismith/cli`'s own output.

An error message is an instruction to a stressed reader, so it's a
high-value target. State what happened (simple past), state the cause if
known, give the command or condition that fixes it.

> Before: Oops! Something went wrong while attempting to establish a
> connection. Please ensure your credentials are properly configured and
> try again.
> After: Connection to the database failed. The password for user `app`
> was not correct. Set `DB_PASSWORD` and connect again.

## Runbooks and standard operating procedures

**DigiSmith fit:** none yet — kept as forward-looking reference.

Every step is imperative, one instruction per step, condition first. A
warning comes before its step: command first, risk second. The 20-word
sentence-length limit is not negotiable here — a reader under pager stress
reads each sentence once.

## Incident reports and postmortems

**DigiSmith fit:** none yet — kept as forward-looking reference.

Simple past only. A timeline in present perfect ("we have identified")
hides when things happened.

> Before: We have identified an issue that may have impacted some users'
> ability to access the service.
> After: Between 14:02 and 14:31 UTC, 12% of requests failed. A deploy at
> 14:00 removed the cache warmup step.

State what is known and say "unknown" for the rest — but never at the cost
of the hedge-preservation rule in `global/ste100-writing.md`. If the cause
genuinely isn't confirmed, keep the hedge ("may have been caused by")
rather than asserting a cause for the sake of a cleaner sentence.

## Commit messages and PR descriptions

**DigiSmith fit:** real and current — see `global/commit-style.md` and
`global/pr-descriptions.md` for the standing rules on this surface. This
standard tightens the same surface for a second, compounding reason
(reader clarity), it doesn't replace those rules.

Imperative subject line, descriptive body. Apply the word swaps and the
25-word limit to the body. Delete "this PR aims to."

## API changelogs and release notes

**DigiSmith fit:** none yet — kept as forward-looking reference.

One entry, one change, one sentence where possible. A breaking-change
entry follows the warning pattern, command first: "Update your calls to
`v2/users`. The `name` field split into `first_name` and `last_name`."

## Instructions for AI agents (prompts, SKILL.md files)

**DigiSmith fit:** real and current — writing any DigiSmith `SKILL.md` is
exactly this genre.

One instruction per sentence keeps each rule quotable and hard to
half-follow. One word, one meaning stops a model from treating "check",
"verify", and "validate" as three different operations. A condition first
("If the build fails, stop") beats a trailing condition, which models
drop. No "should" — a model reads "should" as optional; write "must" or
delete the rule.

## Support macros and status-page updates

**DigiSmith fit:** none yet — kept as forward-looking reference.

25-word limit. Not "we sincerely apologize for any inconvenience this may
have caused" but "The API was down for 18 minutes. Uploads made during
this time were saved and will process today."

## Translation and localization prep

**DigiSmith fit:** none yet — kept as forward-looking reference.

One meaning per word plus complete grammar (articles, "that") removes most
translation ambiguity — relevant if any DigiSmith-generated text is ever
localized.

## UI copy and empty states

**DigiSmith fit:** none yet — kept as forward-looking reference. DigiSmith
has no end-user UI today.

Buttons and labels are technical names and are exempt. Body copy follows
the rules: "No projects yet. Create a project to start."

## Where this doesn't fit

Marketing pages, launch posts, blog voice, brand writing. This standard
deletes persuasion on purpose — write those in your own voice instead.
```

- [ ] **Step 6: Verify Step 5's content landed correctly**

Run: `grep -c "^## " standards/global/ste100-use-cases.md`
Expected: `10` (9 genre sections + "Where this doesn't fit")

- [ ] **Step 7: Update `standards/index.yml`**

Insert these three entries after the existing `pr-descriptions` entry (lines 10-11) and before
`surgical-changes` (line 12), keeping the block's existing alphabetical order:

```yaml
  ste100-use-cases:
    description: Per-genre writing patterns (errors, PR descriptions, changelogs, agent instructions, etc.) for applying the ASD-STE100 writing standard
  ste100-word-swaps:
    description: Slop-word to plain-word substitution table for AI-generated prose
  ste100-writing:
    description: Writing style for AI-generated prose artifacts (PR descriptions, comments, reports, SKILL.md) — concise, unambiguous, hedge-preserving; not for code or live conversation
```

The full `global:` block should read, top to bottom, after this edit: `branch-scope-discipline`,
`code-comments`, `commit-style`, `fixing-blockers-mid-task`, `pr-descriptions`,
`ste100-use-cases`, `ste100-word-swaps`, `ste100-writing`, `surgical-changes`.

- [ ] **Step 8: Verify Step 7's edit landed correctly**

Run: `grep -c "ste100-" standards/index.yml`
Expected: `3`

Run: `grep -n "^  [a-z]" standards/index.yml | head -9`
Expected: the nine `global:` keys listed above, in that exact order (confirms alphabetical
ordering held and no stray indentation crept in — every key line starts with exactly two spaces)

- [ ] **Step 9: Commit**

```bash
git add standards/global/ste100-writing.md standards/global/ste100-word-swaps.md standards/global/ste100-use-cases.md standards/index.yml
git commit -m "feat(standards): add ASD-STE100 writing standard (G.3.1)"
```
