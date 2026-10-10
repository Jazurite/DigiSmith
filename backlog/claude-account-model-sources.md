# claude-account: switch the model source, not only the seat (Claude subscription, TokenReply, Anthropic API key, more later)

**Status:** Idea, Jack (2026-10-10 ~13:5x UTC+7 [06:5xZ]). ClickUp: **DGS-224** (C.3: Accounts, task id `14zcebrvcnk`). No design yet.

## The idea (Jack)

`claude-account` switches today between Claude subscription seats (`jack`, `dev0`) for herdr workers. Jack wants it to switch the **model source**
too: "we can switch between the own Claude subscription, TokenReply, or the new one."

## Why now

- The shared OpenCode server (DGS-223) will run its maestros on **Opus**. A Claude subscription login cannot be used in a third-party tool such as
  OpenCode, so Opus there must come from a pay-per-token source: TokenReply (`claude-opus-5-5`, $4 in / $20 out per 1M, cache read $0.20) or an
  Anthropic API key.
- Claude Code maestros and workers stay on the seats (no per-token bill) unless switched.
- Cost matters: Jack's TokenReply allowance is $5; a long Opus maestro session could cost several dollars a day.

## Sources to cover (first cut)

| Source | Used by | How it is wired today |
|---|---|---|
| Claude subscription seat (`jack`, `dev0`) | Claude Code | `claude-account use <seat>`; setup-token logins; usage probe reads 5h and weekly use |
| TokenReply | OpenCode (global plugin `~/.config/opencode/plugins/tokenreply-key.js`, key read in memory from `~/.digismith-depot/.env`); Claude Code through `offload-implementer`'s claude-code-runner | per model, pay per token |
| Anthropic API key | not wired | new |

## Open questions

- One command for both tools (Claude Code env and OpenCode provider), or one per tool?
- Per agent or per workspace? (a maestro on Opus through TokenReply, workers on seats)
- Spend caps and a usage readout for the pay-per-token sources (the seats have the usage probe).
- Never read or print a token or key (the existing rule for `claude-account`).

## Related

DGS-223 ([shared-opencode-server.md](shared-opencode-server.md)), DGS-144 (subscription load balancer), DGS-151 (account-aware worker start),
[platform-accounts-or-billing-lineage.md](platform-accounts-or-billing-lineage.md) (why C.3 is Accounts).
