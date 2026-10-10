# DGS-214: Count the tokens of every ticket, Claude Code first

**Key:** DGS-214
**ClickUp:** 14zcebrvck3 (subtask of DGS-204, lineage B.3: Token Economics)
**Source text:** backlog/count-tokens-per-ticket.md (commit 77c03f9)

Phase 1 (design target): every Claude Code session of a ticket (worker, subagents, maestro turns if separable).
Totals per ticket, session and model, split by input, output, cache read, cache write. Priced at API list price.
Phase 2 (named and bounded, not designed): OpenCode and gateway models (Kimi, luna, Sol).

Open questions: attribution, counting right (dedupe by message id), when (after the fact or live),
where the result goes, prior art (ccusage, Claude Code OpenTelemetry).
