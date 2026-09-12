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

**Never upgrade a hedge into a stated fact.**
"May have failed" stays "may have failed" — it does not become "failed."
"Could be caused by X" does not become "X is the cause." A hedge carries
the author's actual confidence; removing it is a different claim, not a
simplification. This rule applies even when a tighter, hedge-free rewrite
would read better — clarity never trades against accuracy.

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
