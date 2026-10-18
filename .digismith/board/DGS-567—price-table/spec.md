# DGS-567 spec: fix the Anthropic price table

Status: draft for checkpoint 1. Refinement only. No code.
Written 2026-10-18 22:40 UTC+7 [15:40 UTC].

## Problem

`scripts/token-counter/anthropic-pricing.ts` has three faults.

1. **Wrong keys.** It is keyed `claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5-20251001`. `resolvePricing` (`registry.ts`) is an exact lookup. Transcripts carry `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`, `claude-fable-5-1`. So every cost is `null`.
2. **No cache-write price.** `PricingEntry` has no 5m or 1h write field. `TokenUsage` has no cache-write token count. Cache writes are never costed.
3. **Old prices.** The rates in the file (Opus 15/75, Sonnet 3/15) do not match the official page. The spike DGS-563 copied the same wrong assumptions (it also assumed cache read = 10% of input).

Only `compute.ts`, `registry.ts` and their tests use the table. No `dg` command calls it yet, so a signature change is safe.

## Source of prices

Fetched by me on 2026-10-18 from Anthropic's official page, https://platform.claude.com/docs/en/about-claude/pricing (table "Model pricing"). USD per million tokens.

| Model id | Input | 5m write | 1h write | Cache read | Output |
|---|---|---|---|---|---|
| `claude-fable-5-1` | 10 | 12.50 | 20 | 0.25 | 50 |
| `claude-opus-5-5` | 4 | 5 | 8 | 0.20 | 20 |
| `claude-sonnet-5-5` | 2 | 2.50 | 4 | 0.10 | 10 |
| `claude-haiku-5-5`, prompt up to 100,000 tokens | 0.10 | 0.125 | 0.20 | 0.01 | 0.50 |
| `claude-haiku-5-5`, prompt over 100,000 tokens | 0.50 | 0.625 | 1 | 0.05 | 2.50 |

Notes from the page:
- Cache read is **not** always 10% of input. It is 0.05x on Opus 5.5 and Sonnet 5.5, and 0.025x on Fable 5.1. We store the listed price, not a multiplier.
- Haiku 5.5 is priced **per request** by prompt length. Prompt length counts input, cache-read and cache-write tokens of that request. Over 100,000 = the higher column.
- Not priced here: fast mode, batch, US-only (1.1x). Out of scope; the code says so in a comment.

## Fix (what the build does)

1. **Prices.** Replace the table with the five rows above (the three old keys go; the older models, `claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5`, are kept with their official rows: Opus 5 = 5/6.25/10/0.50/25, Sonnet 5 = 2/2.50/4/0.20/10, Haiku 4.5 = 1/1.25/2/0.10/5), so old transcripts still cost out. Header comment: source URL and date 2026-10-18.
2. **Cache-write fields.** `PricingEntry` gets optional `cacheWrite5mPricePerMillion` and `cacheWrite1hPricePerMillion`. `TokenUsage` gets optional `cacheWrite5mTokens` and `cacheWrite1hTokens`. Cost adds them. An unpriced write gets a note, like the existing cache-read note. Other providers are unchanged.
3. **Model-id match.** `resolvePricing("anthropic", id)`: exact key first. Then strip a date suffix (`-YYYYMMDD`), then try again. So `claude-haiku-4-5-20251001` finds `claude-haiku-4-5`. No loose prefix match: `claude-opus-5-5` must never fall to `claude-opus-5`. Unknown id stays `undefined` and cost stays `null`.
4. **Haiku long prompt.** A `PricingEntry` may carry an optional `longPrompt` tier with a token threshold and its own rates. `costFromPricing` switches to it when input + cache-read + cache-write tokens of that one record exceed the threshold. One record = one request. Callers pass per-request usage; the spec states this in the type comment.
5. **Tests.** One test per current model id (Fable 5.1, Opus 5.5, Sonnet 5.5, Haiku 5.5 short and long), each with an exact cost for a fixed usage. Tests for dated-id strip, the no-loose-prefix rule, cache-write 5m and 1h, the unpriced-write note, and an unknown id.

## Out of scope

- Any `dg` command that prints cost (a later ticket; DGS-545 / DGS-546).
- Fast mode, batch, US-only multiplier, cloud-platform prices.
- Other providers' tables.
- Fixing the DGS-563 spike numbers (they stay as a record; the README already says cost is not exact).

## Decision for Jack (checkpoint 1)

Keep the older models (Opus 5, Sonnet 5, Haiku 4.5) in the table? I propose yes: three small rows, so old transcripts still get a cost. Say "drop them" if you want only the four current ids.

## Risks

- The page is the source of truth, but it changes. The header comment holds the date. A drift check is a separate ticket.
- Haiku 5.5 tier needs per-request usage. If a caller sums a whole session into one record, the tier is wrong. No caller does this today.
