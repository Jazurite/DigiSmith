# DGS-555 plan

Single file: `skills/handoff/SKILL.md`. Spec: `spec.md` (items 1-9).

1. RED: run the scenarios (a)-(g) from the spec against the current text with one subagent. Save the answers in `baseline.md`.
2. GREEN: edit the skill.
   - Invoked By: add "flux", "flux it" to write-then-clear; add the `next: X` form.
   - Write Mode step 3: unverified-claims rule, redaction rule, focus-argument rule (Next first, Open problems ordered).
   - Clear Decision: manual clear order clears in the same turn (final summary, then `clear_session` last); kicker path kept here.
   - Check Gate: end-of-ticket mode only.
   - Rationalizations: rewrite the gate row; add "I'm sure it passed", "the note may hold the key so the next session can use it".
   - Credits line at the end.
3. Run the same scenarios against the new text; save in `verify.md`. Close any loophole found.
4. Commit: `feat(dgs-555): ...`, then the whole-branch review; stop for the conductor's ack before the merge.
