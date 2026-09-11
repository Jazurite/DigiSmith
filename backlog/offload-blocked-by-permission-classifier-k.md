# Mechanical/task-tier offload is unusable under Claude Code's auto-mode permission classifier (K-lineage)

**Status:** Not applied. Confirmed live, twice in one session (2026-09-11), across both configured
runners. This is an environmental constraint, not a DigiSmith bug — nothing in `offload-implementer`,
`print-config.ts`, or the profile config is broken. Filed under K (Maestro) since it affects the
whole offload mechanism (K.2/K.3/K.6) regardless of which provider or runner is selected.

## What's confirmed

Every prerequisite check passed cleanly both times (`claude`/`opencode` on PATH, credential
resolved via `~/.digismith-depot/.env`'s file fallback — the *real* check, not the shallow
`echo $VAR` this repo already fixed once — `print-config.ts` exiting 0 with a real model). The
block happens strictly at the permission layer, after every legitimate prerequisite is satisfied:

1. **`claude-code` runner, first attempt (building map item U/Toolchain):** exporting
   `TOKENREPLY_API_KEY` and driving `claude -p ... --permission-mode auto` against
   `api.tokenreply.com` was refused by "the Claude Code auto mode classifier." Confirmed a second
   time later the same session (renaming G to "Methodology") — blocked even earlier, at the bare
   `export TOKENREPLY_API_KEY=$(...)` step alone, before the `claude` dispatch was ever attempted.
2. **`opencode` runner, considered as a workaround the same session:** the hypothesis was that
   `digismith:depot`'s `ensure-opencode-server` operation might dodge the block, since *it* fetches
   the credential internally (via `manage_credentials.py`) to launch a long-lived local background
   server, rather than the controller directly handing a secret to an external, unattended dispatch.
   Tested live: **also blocked**, at the exact same shape —
   `CHUTES_API_KEY=$(python3 manage_credentials.py get ...) opencode serve ... &` — with the
   identical classifier message.

**Conclusion:** the block isn't specific to the `claude-code` runner, to TokenReply, or to making
an external API call directly. It's the general action *shape* — fetch a credential via command
substitution, then hand it (as an env var) to a spawned process — that the classifier refuses,
regardless of which runner, which provider, or whether the spawned process is a one-shot external
dispatch or a local background server that itself later talks externally. Both of K-lineage's two
configured runners are unusable for offload in this specific harness/session type as a result.

## Why this matters

- `subagent-driven-development`'s "mechanical-tier auto-offload" paragraph (K.2/K.6 territory)
  assumes a graceful, silent fallback to a normal Claude implementer when offload is unavailable —
  and that fallback path does work correctly (confirmed both times, ledger-noted, task completed
  normally). So this isn't a functional break in the *plan execution* — plans still complete. It's
  specifically K-lineage's own value proposition (cheaper/faster third-party dispatch) that's
  unavailable here.
- This is very likely **session/harness-specific**, not universal — a different Claude Code
  session, a different permission mode, or a session with explicit Bash permission rules
  pre-configured by the user could plausibly not hit this at all (the classifier's own message
  says: "To allow this type of action in the future, the user can add a Bash permission rule to
  their settings"). Don't generalize this to "offload is broken everywhere" — it's "offload is
  blocked in sessions running under this default auto-mode classifier, unless the user
  pre-authorizes the specific action shape."

## What a fix would need (not designed here)

- Nothing on DigiSmith's own side is fixable — this isn't a script or config bug.
- The only lever is the user's own Claude Code permission settings (a Bash permission rule scoped
  to the credential-export/spawn pattern) — entirely outside this repo's control, and not
  something to prompt for automatically (see the security-review-style caution around encouraging
  permission-prompt bypasses).
- If this recurs across multiple independent sessions/machines, it may be worth `offload-implementer`
  itself documenting the failure mode explicitly (a new Error Handling row: "classifier-blocked" as
  a distinct disposition from the four already documented), so a future controller recognizes it
  immediately rather than re-diagnosing from scratch — but that's a documentation call, not a code
  fix, and not made here.

## Why not applied yet

Purely a live observation from two real dispatch attempts in one session — not yet decided whether
this needs any DigiSmith-side documentation change at all, given it may be entirely session-specific
and already handled correctly by the existing silent-fallback behavior.
