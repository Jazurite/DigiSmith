# DGS-605 — Implementation Report

Ticket: DGS-605

## What changed
- New skill `skills/study/SKILL.md` (`digismith:study`). It replaces the untracked draft. The draft ordered a scout. The skill now orders a researcher (role since DGS-606).
- The Maestro does not research itself. It writes an order to `~/.digismith-depot/sessions/<project>/orders/`. The order names the subject, Jack's words, the library `<name>`, the findings path `~/.digismith-depot/research/<name>.md`, the seat and the ticket key for the run. The conductor starts the researcher by `skills/researcher/SKILL.md`, "Start of a researcher" (`--role other` until DGS-609).
- Ticket key for the run: a related open ticket when the study serves one, else `study-<name>`. `dg run start` accepts any key that matches `^[A-Za-z0-9][A-Za-z0-9._-]*$`.
- Relay: read the findings file, check one or two claims against the clone, give Jack the three answers, the clone path and the findings path.
- Lineage: an agentic spike goes to clan B (B.5 for autonomous engineering, B.0 when no lineage fits). F.9 only after Jack adopts it.
- Ticket: a Spike with `dg clickup create-task --type Spike --status backlog --priority 3`, read back with `dg clickup get-task`. A ticket is not an order.
- The description triggers on the intent ("study X", "research this repo", a GitHub link with "study"). It excludes work inside DigiSmith's own code ("fix this bug", "review this branch").

## Tests
New `scripts/study-skill.test.ts`, 7 tests: frontmatter name, trigger words, exclusions, researcher card and order path, "The Maestro does not research itself", no scout order, clone/findings/ticket rules.
- Red: the new test against the old draft text: 5 failed, 2 passed (the controller ran it in the scratchpad; the implementer lost its own red output).
- Green: `scripts/study-skill.test.ts` and `scripts/researcher-skill.test.ts`: 15 passed.

## Review
One task Reviewer (claude-sonnet-5-5), round 1: pass, no Critical or Important. One Minor, F1: the order did not name the ticket key of the researcher run. Fixed in c10131f. The conductor ordered no re-review and no ticket-level review (the Maestro ordered one Reviewer for this ticket). Table: `findings.md`.

## Commits
- bc7ecc6 docs(dgs-605): add the ticket file
- 3dddb3a docs(dgs-605): add the study skill plan
- 52bfce6 feat(dgs-605): add the digismith:study skill
- c10131f fix(dgs-605): name the ticket key of the researcher run

## First use (after merge)
In a new Maestro session, "study <a small GitHub link>" loads the skill and writes a researcher order. Dry run: stop at the order.
