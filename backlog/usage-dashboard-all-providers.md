# A usage dashboard like TokenReply's, for every account and provider Jack uses

**Status:** Direction, Jack (2026-10-10 ~20:4x UTC+7 [13:4xZ]). ClickUp: **DGS-326** (B.3: Token Economics, subtask of DGS-204, task id `14zcebrvcyq`). No design yet.

**Source:** Live session 2026-10-10, after DGS-214 shipped. Jack showed his TokenReply dashboard twice that day and said: "This is the direction of where
we're going. You see the dashboard for the token reply ... explain all the metrics. I want to build one like that. Just not for a single TokenReply one:
every account or provider that I use, Anthropic, ..."

## The TokenReply dashboard, metric by metric (as seen 2026-10-10)

| Panel | Metric | What it means |
|---|---|---|
| Header | API key, Base URL | The key and endpoint clients use. Not a metric. |
| Usage allowance | 82% left, $4.09 of $5.00, resets Nov 9 | The money the Plus plan includes each month, what is left, and when it refills. |
| Account and usage | Subscription: plus | The plan tier. |
| | Credit: $0.00 | Prepaid top-up money beyond the allowance. |
| | Consumption: $4.71 | All-time money spent. |
| | Saved vs Direct API: $20.40 | The same tokens at the provider's list price ($25.11) minus what was paid ($4.71). |
| | Daily Models: 655 / ∞ | Model requests today against a daily cap (none). It rose by 9 with the 9-step Sol review. |
| | Rate Limit: 10 RPM | The most requests allowed per minute. |
| | Number of Requests: 1127 | All-time requests. |
| | Calls in Period: 650 | Requests in the selected period, with a sparkline. |
| Performance indicators (period) | Spend in Period: $0.62 | Money spent in the period. |
| | Tokens in Period: 3,819,386 | Tokens in the period (input plus output, as TokenReply counts them). |
| | Average RPM: 0.433 | Requests per minute, averaged over the period. |
| | Average TPM: 2546 | Tokens per minute, averaged over the period. |
| Model data analysis | Pricing, Count, Trend, Model, Ranking; 24h to 1y | Spend or requests per model over time (stacked bars per hour), a trend line, a per-model table, and a ranking. |
| API information | (empty) | Admin-configured notes. |

## Our version: every account in one place

The same panels, with one row or filter per account and provider, plus a combined view.

| Our metric | Anthropic seats (`jack`, `dev0`) | TokenReply | Other providers (Chutes, OpenCode, Codex, direct API keys) |
|---|---|---|---|
| Plan and allowance | Seat plan and price; the 5-hour and weekly windows are the "allowance" (percent used, reset time) | Plus, $5 a month, reset date | Each plan's own limit |
| Spend | $0 per token: the seat price per month | Real dollars | Real dollars, or plan price |
| Value at API list price ("saved vs direct API") | Tokens priced at Anthropic's list (Analysis plan) | As TokenReply shows | Tokens priced at the provider's list |
| Requests, calls in period | Responses counted from transcripts (`dg tokens` reader) | Its request log | Each harness's own log |
| Tokens in period, by type | Input, output, cache read, cache write 5m and 1h | Its log (check how it counts cache) | Native logs |
| RPM and TPM | From response timestamps | Its log | Native logs |
| Per model over time | Transcripts | Its log | Native logs |
| Per ticket, step and task | `dg tokens` and `tokens.json` (DGS-214) | Tagged by the session or key that called it | Same |
| Rate limits and caps | Seat limit stops, exhausted marks | 10 RPM | Each provider's |

## Data sources (what exists, what is missing)

- **Claude Code seats:** transcripts (`dg tokens`, DGS-214) and the usage probe (5h and weekly percent, `~/.digismith-depot/usage-probe/`).
- **TokenReply:** it runs New API. Account endpoints exist and need a login (401 without one): `/api/user/self` (totals), `/api/log/self` (one row per
  request: model, tokens, quota, time) and `/api/data/self` (totals by model and hour). They need an account access token, not the `sk-` API key. Where
  that token is kept (the depot `.env`, never printed) is an open question.
- **OpenCode:** its own session store has tokens per message (DGS-214 phase 2 reader).
- **Chutes:** an hourly-bucketed usage API (K.4 finding).
- **Codex:** its native session logs, if Jack uses it.
- **Direct Anthropic API keys:** the Usage and Cost Admin API, if an org key is in use.

## Dependencies

- The store and the record shape: DGS-220 (epic). The dashboard reads that store (Grafana or another chart tool).
- The readers per provider: DGS-214 phase 2 (OpenCode, Codex, TokenReply), plus a TokenReply account reader.
- Dollars and "saved vs direct API": the separate Analysis plan (not filed), using DGS-204's dated price table.

## Open questions

- Grafana (where it runs) or a small DigiSmith page.
- Which accounts are in scope first: the two seats and TokenReply are the minimum.
- How often to collect (on each ticket finish, hourly, on demand).
- The seat plans and prices of `jack` and `dev0` (Team Standard at $25 was the example used in DGS-204).

## Related

DGS-204 ([token-economics-b3.md](token-economics-b3.md)), DGS-214 ([count-tokens-per-ticket.md](count-tokens-per-ticket.md)), DGS-220
([telemetry-and-data-collection-plan.md](telemetry-and-data-collection-plan.md)), DGS-288 ([dg-tokens-show-task-rows.md](dg-tokens-show-task-rows.md)),
[usage-monitoring-client.md](usage-monitoring-client.md) (C.3, seat usage per worker).
