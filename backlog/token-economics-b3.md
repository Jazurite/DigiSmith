# Token Economics (B.3): one big comparison of what a token costs on the API, a subscription and a gateway, then per task

**Status:** Idea, Jack (2026-10-10 ~11:0x UTC+7 [04:0xZ]). New lineage **B.3: Token Economics** in clan B: Agentic, the K family (list
`1301150000003495`, created 2026-10-10 11:1x UTC+7 on Jack's order, name picked by Jack). ClickUp: **DGS-204** (B.3: Token Economics, task id `14zcebrvcj9`).
No design yet.

**Source:** Live session 2026-10-10. Jack shared two screenshots: a third-party relay card for `claude-sonnet-5-5`, and a table of subscription
plans with their "max possible spend". The question was why the relay is so much cheaper than the Claude API. Then Jack: "I really want to build a
knowledge base ... the big comparison table for Claude, and later add other tokens, between the official API price for Claude, the subscription
price and the third-party AI gateway providers like TokenReply ... so we have the benchmark, how it counts, how we compare together." And: "each
task we will use, like Kimi, other things, and we could count the tokens and have the comparison, like what happens if using, over-using." "It will
be a big comparison."

## The idea

Three layers:

1. **Price table.** For each model on each channel: input, output, cache read, cache write (5 minutes and 1 hour), the ratio against the official
   price, the date seen and the source. Claude first, then Kimi, GPT and the other models DigiSmith offloads to.
2. **Channel benchmark.** How each channel counts and bills: subscription limits turned into API-equivalent dollars, a gateway's flat ratio, which
   features pass through (cache, batch, beta headers), availability and latency, and trust (can we prove the model is the one named?).
3. **Per task.** The real token counts of each task (worker, ticket, model), and a what-if: what the same task cost or would cost on the API, on a
   seat (points of the 5h and weekly window), and on each gateway. "Over-using": what a month of our real use would cost on the API.

## Seed data (2026-10-10)

### Official Claude API prices, per 1M tokens

From the `claude-api` skill's model table, cached 2026-10-06. Confirm against Anthropic's pricing page before the first real row. Standard
multipliers: a 5-minute cache write is 1.25x input, a 1-hour write 2x, the Batch API 50% off.

| Model | Input | Output | Cache read |
|---|---|---|---|
| `claude-fable-5-1` | $10.00 | $50.00 | $0.25 |
| `claude-opus-5-5` | $4.00 | $20.00 | $0.20 |
| `claude-sonnet-5-5` | $2.00 | $10.00 | $0.20 |
| `claude-haiku-5-5` | $0.10 | $0.50 | not stated |

Haiku 5.5 prices are for prompts up to 100K tokens ($0.50 / $2.50 beyond).

### A relay card (screenshot)

`claude-sonnet-5-5` on a third-party relay. Tags `claude_official`, `claude_enterprise`, `claude_sales` and two more. Availability 88.0%, latency 2.3 s.

| | API | Relay | Ratio |
|---|---|---|---|
| Input | $2.00 | $0.60 | 0.3 |
| Output | $10.00 | $3.00 | 0.3 |
| Cache read | $0.20 | $0.06 | 0.3 |
| Cache write, 5 min | $2.50 | $0.75 | 0.3 |

Every price is 0.3x the API price. A flat ratio is how relay panels such as New API and One API price: the API price times a group ratio. Possible
sources of tokens this cheap: pooled subscription seats (against Anthropic's terms), farmed cloud credits, stolen keys or cards, a cheaper model
in place of the named one, inflated token counts. Not known for this relay.

A model check: real Sonnet 5.5 returns a 400 for `thinking: {type: "disabled"}` and for `tool_choice: {type: "any"}`. If a channel accepts either,
another model answered or the channel changed the request.

### Subscription plans: "max possible spend" (screenshot, source unknown)

| Plan | Price per month | Max API value per month | Value per dollar | Break-even use at 0.3x resale |
|---|---|---|---|---|
| claude-pro | $20 | $400 | 20x | 17% |
| claude-max-5x | $100 | $2,000 | 20x | 17% |
| claude-max-20x | $200 | $8,000 | 40x | 8% |
| chatgpt-plus | $20 | $700 | 35x | 10% |
| chatgpt-pro-5x | $100 | $3,500 | 35x | 10% |
| chatgpt-pro-20x | $200 | $14,000 | 70x | 5% |

These are upper bounds: every 5-hour window used to the cap for the whole month. The weekly limit stops that earlier. Anthropic does not publish
dollar values for plan limits. The last column is the share of a seat a relay must use to cover the seat's price when it resells at 0.3x.

### A finding: the repo's own Anthropic price table is out of date

`scripts/token-counter/anthropic-pricing.ts` (K.4, 2026-09-11) has `claude-opus-5` at $15 / $75 and `claude-sonnet-5` at $3 / $15. The skill
table says $5 / $25 and $2 / $10. It has no 5.5 models. `tokenreply-pricing.ts` marks its Kimi rates as unverified. This is the first reason for
one table where each row has a date and a source.

## What exists today

- **K.4 token counter:** `scripts/token-counter/` (`computeTokenCost`, price tables for Anthropic, Chutes and TokenReply). Nothing produces a real
  `TokenUsage` yet ([token-counter-usage-producer-gap.md](token-counter-usage-producer-gap.md)).
- **K.7 vendor benchmark** (idea): gateway against gateway on models, price and quality ([gateway-vendor-benchmark-k7.md](gateway-vendor-benchmark-k7.md)).
  Layer 2 overlaps it.
- **K.6 harness benchmark:** Claude Code against OpenCode ([harness-benchmark-claude-code-vs-opencode-k6.md](harness-benchmark-claude-code-vs-opencode-k6.md)).
- **Usage monitoring client** (C.3: Accounts, Capacity): quota points per worker and per ticket ([usage-monitoring-client.md](usage-monitoring-client.md)).
  Layer 3 needs its readings.
- **Usage probe:** 5h and weekly percent used per seat (`~/.digismith-depot/usage-probe/`).
- **Billing on C.3:** cost per ticket, plans, TokenReply spend ([platform-accounts-or-billing-lineage.md](platform-accounts-or-billing-lineage.md)).
  It may move here.

## Open questions

- **Storage.** Jack said "big database". A dated data file in the repo (like `toolchain.yml`), a package with its own store, or ClickUp? Each price
  row needs a date and a source.
- **A client.** Jack: "this could be an own client but not sure what's the name." A package next to `clickup-client` and `jira-client`? Name open.
  Does it replace the K.4 price tables?
- **Price updates.** Jack dictates them, a provider API gives them (TokenReply's model catalog; Anthropic's Models API has no prices), or a
  scheduled check reads them?
- **Real seat value.** Measure a seat's API-equivalent value from our own use (tokens per 5-hour window) instead of a third-party table.
- **What moves in.** The K.4 gap, K.7 and the Billing part of C.3: move to B.3, or stay and link?
- **Output.** A page, a `dg` command, or both.

## Related

[token-counter-usage-producer-gap.md](token-counter-usage-producer-gap.md), [gateway-vendor-benchmark-k7.md](gateway-vendor-benchmark-k7.md),
[usage-monitoring-client.md](usage-monitoring-client.md),
[platform-accounts-or-billing-lineage.md](platform-accounts-or-billing-lineage.md), [ai-gateway-vendors-k3.md](ai-gateway-vendors-k3.md).
