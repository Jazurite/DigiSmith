# A digismith:study skill that runs the study process

**Key:** DGS-605

When Jack says "study X" (an outside repository, tool or idea), the session follows one fixed process, kept in the plugin as the skill `digismith:study` (not in memory). The Maestro does not research itself: it orders a researcher (role from DGS-606) through an order in the depot `orders/` folder. The researcher clones into `~/Workspace/Library/<name>` (pull if it exists), reads it in full and answers three questions: how it relates to DigiSmith, how we could absorb it, how it could help us (link open tickets). The Maestro relays, places it on the lineage (agentic spike -> clan B: B.5 or B.0; F.9 only after Jack adopts it) and writes a Spike ticket with `dg clickup` (backlog, Normal). A ticket is not an order.

Scope: `skills/study/SKILL.md`, description triggers on the intent. Out: a SessionStart hook line, the run-role lists (DGS-609), the first real study.

Acceptance: "study <GitHub link>" in a new Maestro session loads the skill and ends with a researcher order (dry run) and later a Spike ticket; the Maestro does not research inline; the skill does not trigger on work inside DigiSmith's own code; merged with the post-finish hooks, plugin updated.
