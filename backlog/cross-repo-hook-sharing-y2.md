# Cross-repo hook sharing (new letter, tentatively Y2)

**Status:** Idea only. No design yet — explicitly scoped out of **Y**
(lifecycle hooks) rather than folded into it. See `MEMORY.md`'s **Y**
row and `.digismith/docs/lifecycle-hooks/design.html`.

**Source:** 2026-09-05, same session as **Y.1**'s build. Hook files
ship repo-local only, under `.digismith/hooks/<point>/` — a hook
authored once and reused across multiple repos/profiles without a
per-repo copy was explicitly deferred rather than designed in.

## The idea

Some mechanism for a hook file (or a whole point's hook folder) to be
authored once and shared across repos/profiles, instead of every repo
needing its own local copy.

## Why not applied yet

Deferred at **Y.1**'s own scoping decision — no second real use case
yet, and no design work has started.
