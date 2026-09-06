# Reconsider TokenReply's "task" role default model (kimi-k2.7 vs. kimi-k3)

**Status:** Not applied. Raised and deliberately deferred, not investigated further.

**Source:** 2026-09-06, during Model Router Z.1's execution (map item K-lineage territory, not Z —
Z.1 only ever touched the new `"mechanical"` role).

## The idea

Z.1 added a `"mechanical"` role branch to `scripts/providers/tokenreply.ts`'s `model(role)`
(`kimi-k3`), leaving the pre-existing `"task"` role branch unchanged (`kimi-k2.7` — this is
`offload-implementer`'s own explicit-ask default, used for any manually-offloaded task regardless
of size, completely unrelated to Z.1's mechanical-tier auto-offload path). Jack asked live whether
the `"task"` role should also move to `kimi-k3`, eliminating `kimi-k2.7` from TokenReply
entirely — deliberately deferred rather than answered on the spot, to avoid scope-creeping Z.1's
already-narrow first slice.

## Why not applied yet

This is squarely K-lineage territory (K.3's own provider-default decision), not Z.1's — changing
it would affect every explicitly-offloaded task via `offload-implementer`, not just mechanical-tier
auto-offloaded ones. Real tension to resolve before deciding: `kimi-k3` has a live, confirmed
tool-calling bug on TokenReply (`backlog/tokenreply-kimi-k3-tool-calling-failure.md`) that
`kimi-k2.7` does not — K.3 specifically reverted TokenReply's default away from `kimi-k3` because
of it. Z.1's own mechanical-tier use of `kimi-k3` only works safely because (a) mechanical tasks
need few tool calls, fitting inside the XTML-leak recovery mechanism's bounded ceiling, and (b) a
same-session correction (Jack's other live request this session) now routes fix rounds to Claude
instead of resuming `kimi-k3` — neither protection would automatically extend to the general
`"task"` role if it moved to `kimi-k3` too.

## Open questions, not yet scoped

- Does the `"task"` role's own caller (`offload-implementer`'s explicit-ask path) have an
  equivalent way to bound `kimi-k3`'s exposure the way Z.1 does, or would moving it to `kimi-k3`
  reopen the exact regression K.3 already fixed once?
- Is this really a binary "k2.7 vs k3" choice, or does it want the same per-role branching
  treatment Z.1 introduced — e.g. a third role, or criteria beyond just "mechanical vs. task"?
- Filed under **K** (the model-tiering lineage that owns TokenReply's general provider defaults)
  rather than Z, since it's about the pre-existing explicit-ask path's default, not the new
  automatic mechanical-tier routing Z.1 built.
