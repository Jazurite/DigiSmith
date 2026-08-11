# Per-worktree dev server port allocation

**Status:** Not applied. Findings only. **Medium confidence** — flagged
below; depends on how often Jack actually runs more than one worktree's
dev server at once, which isn't confirmed.

**Source:** `D:\Workspace\Library\automaker\apps\server\src\services\dev-server-service.ts`.

## What automaker does

"Each worktree can have its own dev server running on a unique port."
Allocates ports starting at 3001 (avoiding common defaults like 3000),
detects the actual bound port from the dev server's own stdout via a set
of framework-agnostic regexes (`listening on port 3000`, generic
`localhost:PORT` URLs, etc. — because a requested port and the port a
dev server actually binds can differ), re-attaches to an already-running
server for a worktree instead of double-starting one, and cleans up
known livereload ports on stop.

## Why this might matter for DigiSmith

`using-digismith` explicitly supports multiple tickets each having their
own live worktree at once (resume-from-earlier-session is a first-class
case, not just sequential). If Jack ever wants to preview two Emma theme
branches side by side — e.g. `shopify theme dev` in two worktrees at
once — the second one collides on Shopify CLI's default port with no
existing coordination anywhere in DigiSmith or the superpowers skills it
calls into (not checked against Shopify CLI specifically — worth
confirming its actual default-port behavior before treating this as
settled).

## Why this is flagged medium- not high-confidence

Unlike the `.env`-provisioning gap or the index-lock issue, this only
bites under a specific usage pattern (concurrent worktrees, each running
a local dev server) that hasn't been confirmed as something Jack actually
does regularly. Worth checking with him before investing effort — this
could easily be a "never actually happens" scenario for a
single-developer personal tool where tickets are mostly worked
sequentially.

## Where this would land, not yet decided

If this turns out to matter, it's a `.automaker`-style problem: something
worktree-creation-adjacent, likely alongside wherever the `.env`
provisioning idea (see `worktree-custom-setup-script.md`) ends up, not
its own subsystem. No ticket exists; may just get dropped after a
confirm-with-Jack check.
