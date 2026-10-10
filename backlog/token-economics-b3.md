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

**Update, 2026-10-10 11:2x UTC+7:** the card is TokenReply's. TokenReply runs New API, and its price list is public at
`https://www.tokenreply.com/api/pricing` (no login). Base price = `model_ratio` x $2 per 1M input, output = input x `completion_ratio`, then x
the group ratio. The Claude groups on that list:

| Group | Ratio | Sonnet 5.5 in / out per 1M | Opus 5.5 in / out per 1M |
|---|---|---|---|
| `claude_plus`, `claude_enterprise`, `claude_sales` | 0.3 | $0.60 / $3.00 | $1.20 / $6.00 |
| `devin` | 0.5 | $1.00 / $5.00 | $2.00 / $10.00 |
| `claude_official` | 1.2 | $2.40 / $12.00 | $4.80 / $24.00 |

The group names suggest the source: `claude_official` costs 20% more than Anthropic (likely real API keys plus a margin), while the 0.3 groups are
named after subscription plans. All of these Claude models are `access_tier: plus` on TokenReply (Plus is a $5 subscription, per Jack 2026-10-10, assumed monthly; it is not on the price list, and whether it includes credit is not known).
The list's own `recent_metrics` showed `claude-sonnet-5-5` at 25% availability over 4 calls at that time, where the card showed 88.0%.
One TokenReply base price differs from the skill table: `claude-haiku-5-5` at $0.20 / $1.00 (skill: $0.10 / $0.50).

### A $25 Team Standard seat at its cap against the same tokens on TokenReply

Jack's question, 2026-10-10. Third-party sources put a Team Standard seat ($25 a month, $20 on annual billing) at about Pro-level usage, or
1.25x Pro. With Pro at $400 a month at the cap (the table below), the seat's API value at the cap is about **$400 to $500 a month**.

| The same tokens on | Cost per month | Against the $25 seat |
|---|---|---|
| The $25 Team Standard seat, at its cap | $25 | 1x |
| TokenReply, 0.3 groups, plus the $5 Plus subscription | $125 to $155 | 5x to 6x more |
| TokenReply, `devin` (0.5) | $200 to $250 | 8x to 10x more |
| Anthropic API (list) | $400 to $500 | 16x to 20x more |
| TokenReply, `claude_official` (1.2) | $480 to $600 | 19x to 24x more |

Break-even: with the $5 Plus subscription, TokenReply's 0.3 groups cost less than the seat only below $67 of API-value a month ($5 + 0.3 x $67 = $25), which is 13% to 17% of the seat's cap. The ratio
holds for any model, because TokenReply applies one ratio to every price. The seat has a 5-hour and a weekly cap; TokenReply has none, so it is an
overflow option at 0.3x when a seat is out (Team extra usage is billed at API prices). The seat's real value at the cap is an estimate until we
measure our own tokens per 5-hour window.

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
