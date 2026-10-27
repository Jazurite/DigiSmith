# Plan: DGS-668 + DGS-669

Spec: `spec.md` beside this file. Branch `DGS-668__track-block`, two commits.

## Task 1 (DGS-668): templates
- [x] Create `skills/jira-progress-write-back/templates/track-single-market.json` and `track-multi-market.json`.
- [x] `packages/jira-client/src/track-templates.test.ts`: shape, stage order, colors, emoji, table.
- [ ] Commit `feat(dgs-668): add the Jira Track block templates`.

## Task 2 (DGS-669): skill text
- [ ] `skills/jira-progress-write-back/SKILL.md`: overview, Step 7 (build on first write), Step 8, Step 12, Step 15, Error Handling, Quick Reference. Remove the "never scaffold" wording.
- [ ] Check `skills/generate-comment` progress-update template and SKILL text still agree.
- [ ] Commit `feat(dgs-669): build the Track block on first write`.

## Finish
- [ ] Whole-branch Claude review, fix verified findings. Full suite after the conductor's go. Merge, push, hooks 01-03, report.html + plan.md.
