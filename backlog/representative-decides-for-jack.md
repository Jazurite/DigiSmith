# Representative (name TBD): an agent that decides for Jack within a written mandate and reports back for review

**Status:** Idea, Jack (2026-10-10 ~10:4x UTC+7 [03:4xZ]). ClickUp: **DGS-203** (O.3: Roles, task id `14zcebrvcgn`). No design yet. The name is open.

## The idea (Jack)

A separate agent that makes decisions on Jack's behalf. It is **not the maestro**: the maestro orders and the workers build, so the agent that
approves must be a different one. Jack writes its instructions in a **separate file** (the mandate). The agent answers checkpoints and decisions
within that file, and **only reports back**: Jack reviews its decisions afterwards and overturns any of them.

Jack's words: "my attorney or my representative or my assistant, maybe I call it my representative, it will decide for me. But we must separate
from the file and I will instruct it to give this decision for me and only report back for me to review."

## Shape (a starting point, not a design)

- **Mandate file**, owned and edited by Jack: what the agent may decide (checkpoint approvals, design choices with a stated default, toolchain
  questions), Jack's standing preferences (`toolchain.yml`, pnpm, Sol as reviewer, and so on), and what must always go to Jack (push, merge,
  ClickUp status changes, spending above a cap, security, anything the file does not cover).
- **At a checkpoint** the maestro (or a worker) asks the agent instead of Jack. It answers within the mandate or escalates.
- **Decision log** for Jack's review: question, answer, the mandate line that allowed it, and the source it read. Jack overturns any decision; an
  overturn becomes a new or changed mandate line.
- **Separation of duties:** the agent never builds, never orders workers, and never approves its own work.

## Names (open)

Candidates: **Representative** (Jack's first word), **Proxy**, **Delegate**, **Chief of Staff**, **Steward**. Supporting terms from the research:
Jack is the **Principal**, the file is the **Mandate**, Jack reviews **on the loop** (after the decision, not before). "Chief of Staff" and the Gas
Town "Mayor" are closer to what the maestro does now, so they may clash with it (and with DGS-191, Maestro to Conductor).

## Prior art (Master's web research, 2026-10-10)

- **AutoGen / AG2 `UserProxyAgent`**: an agent that stands in for the user in a multi-agent chat; with `human_input_mode=NEVER` a model answers
  in the human's place. https://docs.ag2.ai/docs/api-reference/autogen/UserProxyAgent
- **Agentic Chief of Staff**: acts for its principal, filters, prioritises, escalates novel situations.
  https://zachpan.substack.com/p/after-reviewing-five-agentic-chief, https://capx.ai/blog/ai-cofounder-delegation
- **Gas Town (Steve Yegge)**: Mayor (acts on your behalf, coordinates), Witness (checks work matches the spec), Deacon, Refinery, Polecats.
  https://kilo.ai/docs/code-with-ai/gastown/mayor, https://codex.danielvaughan.com/2026/04/08/gas-town-multi-agent-factory/
- **Governed mandate**: mandate scope, authority and duration as a governed object; drift by "mandate translation".
  https://arxiv.org/pdf/2609.07741; delegation chains amplify risk: https://arxiv.org/pdf/2609.27900
- **Approval gates and escalation**: risk tiers, escalation triggers, separation of duties, expiry, no bypass through another agent; too many
  prompts lead to rubber-stamping. https://gravitee.io/corpus/gen-2217/oncodaily/human-in-the-loop-escalation-controls-for-ai-agents.html
- **Decision records** shipped with the work for a later reviewer: https://softwareguru.substack.com/p/the-missing-layer-in-agent-code-review

## Open questions

- The name.
- Which decisions go in the first mandate, and which always escalate.
- Which model it runs on (a different family than the maestro, by rule?), and where it lives (herdr tab, OpenCode agent, subagent).
- How Jack reviews: a daily digest, a page, or the note.

## Related

DGS-171 ([define-scout-reviewer-and-jack-roles.md](define-scout-reviewer-and-jack-roles.md), what only Jack decides), DGS-176
([define-the-maestro-role.md](define-the-maestro-role.md), decision log and policy lines), DGS-155 (maestro approval inside a guardrail), DGS-185
([autonomous-agentic-architecture.md](autonomous-agentic-architecture.md), the escalation queue this agent would answer first), DGS-169 (OpenCode maestro).
