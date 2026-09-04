# Persistent VPS-hosted Claude Code session via SSH (new letter, tentatively X)

**Status:** Not applied. Raw idea only — no map letter formally added
yet, no design spec, needs `superpowers:brainstorming` before becoming
a skill/mechanism. (`T` and `U` are already tentatively claimed by
[[technical-writing-content-voice.md]] and
[[opinionated-tech-stack-defaults.md]] — this would be the next free
letter, not committed in `MEMORY.md`'s map table yet.)

**Source:** 2026-09-04, same session as K.8's worker-pool idea and the
`~/.digismith` → `~/.digismith-depot` rename. Surfaced while exploring
whether Remote Control or cross-session messaging could give Jack an
always-on, connect-from-anywhere Claude Code session; both turned out
not to fit, which is what led here.

## What this covers

Run the *main* interactive Claude Code session on a VPS Jack controls,
instead of his local machine — reached over plain SSH, kept alive
across disconnects via tmux/screen, so the session (conversation state,
working tree, everything) persists independent of whether his laptop
is even on.

Confirmed practical this session (desk research against Claude Code's
own docs, not yet live-tested):

- **Auth:** `ANTHROPIC_API_KEY` as an env var needs no browser at all —
  simplest path for a headless box. `CLAUDE_CODE_OAUTH_TOKEN` (minted
  once via `claude setup-token` on a machine that has a browser) ties
  usage to an existing Pro/Max subscription instead, at the cost of a
  one-year expiry to track and refresh. A documented browser-code-paste
  fallback also exists if neither is set up ahead of time.
- **Persistence:** Claude Code's own `--resume`/`--continue` switches
  between *past* conversations on the same machine — it does **not**
  survive an SSH disconnect. tmux/screen is the actual mechanism
  holding the process alive; reattaching over SSH resumes exactly where
  it was left.
- **Two distinct usage modes, worth keeping separate:** plain
  interactive `claude` inside tmux (Jack approves tool-use prompts live
  over SSH, same as local use — this is the simple case he actually
  asked for) vs. unattended `claude -p ... --permission-mode auto
  --permission-prompts none` (a classifier auto-approves what it can
  and silently denies the rest — needs `permissions.allow` pre-set in
  `~/.claude/settings.json` for any custom tools/MCP servers, since
  nothing is present to say yes).

**Alternatives explicitly ruled out, both researched this session:**

- **Remote Control** — connects a phone/browser to an already-running
  session, but only ever a session on the *same local machine* as the
  thing being connected to. No path from it to a VPS at all.
- **Anthropic's own self-hosted environments / cloud sessions** — the
  "official" always-on remote-session feature, runner + environment-
  secret architecture, outbound-only from the VPS. Gated to Team/
  Enterprise plans (public beta) — heavier than this needs, and
  unavailable on Jack's plan tier if not Team/Enterprise.

## Why this doesn't obviously fold into an existing map item

Nothing else on the map is about *where Claude Code itself runs*. **V**
(Depot) and K.2/V.1's shared OpenCode server are machine-wide resources
backing *offload dispatch* specifically (third-party models via Chutes/
TokenReply) — not about hosting the main interactive session Jack
drives ticket work from. This is infrastructure underneath all of
DigiSmith, not a pipeline stage, and shouldn't be confused with **K.8**
(persistent worker pool) — that's a pool of gateway-backed *offload*
workers for `subagent-driven-development` tasks; this is about the one
session Jack himself is typed into.

## Suggested shape (unrefined)

Not designed. At minimum: a documented setup runbook (VPS provisioning,
`ANTHROPIC_API_KEY` vs. `CLAUDE_CODE_OAUTH_TOKEN` choice, a tmux
session-naming convention). Possibly a small DigiSmith skill wrapping
the SSH+tmux dance itself (e.g. "reconnect to my VPS session") if this
turns out to be used often enough to be worth automating rather than
just remembered by hand.

## Why not applied yet

Idea only, captured verbatim per Jack's request ("write it up as a new
concept") rather than brainstormed. No VPS has actually been
provisioned or tested — everything above is desk research against
Claude Code's documented auth/persistence/permission behavior, not a
live confirmation the way K.6's runner fix was.
