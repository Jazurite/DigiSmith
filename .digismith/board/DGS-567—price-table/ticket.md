# Token counter: price the current Claude model ids and cache writes

**Key:** DGS-567 (Bug, list B.3: Token Economics, status refinement; Sign-off: Auto proposed)
**Source:** spike DGS-563 (2026-10-17). `scripts/token-counter/anthropic-pricing.ts` is keyed `claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5-20251001`. `resolvePricing` is an exact lookup, so transcripts with `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5` get `costUsd: null`. The table has no cache-write price (5m, 1h), and its prices differ from Anthropic's official page.
**Wanted:** a real cost for every current model id (Fable 5.1, Opus 5.5, Sonnet 5.5, Haiku 5.5) and the older Opus 5, Sonnet 5, Haiku 4.5, including cache-write tokens, with prices from Anthropic's pricing page (fetched 2026-10-18).
**Spec:** `spec.md` (approved at checkpoint 1). **Plan:** `plan.md` (3 tasks, one commit each; approved at checkpoint 2, with the zero-price change).
**Related:** DGS-214, DGS-545, DGS-546, DGS-563.
**Branch:** `DGS-567__price-table`, worktree `.worktrees/dgs-567`. Refinement only: no build until Jack moves the ticket to `to do`.
