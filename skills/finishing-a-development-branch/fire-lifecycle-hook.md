# Fire Lifecycle Hook

Shared procedure for firing a DigiSmith lifecycle hook at a given point. Any skill that wants
to fire hooks at a point in its own flow follows this procedure, passing just the point's name
(e.g. `post-finish`) — this doc is the only place the enumerate-and-follow logic is written, so
a future second lifecycle point in another skill can reuse it without duplicating the steps.

## Procedure

Given a point name `<point>`:

1. Check whether `.digismith/hooks/<point>/` exists in the current project (the repo root —
   the same one `.claude-plugin/plugin.json`, if present, and `.digismith/` itself live in). If
   it doesn't exist, or exists but has no `.md` files directly inside it, there is nothing to
   fire — stop here, silently. This is the normal case for most repos.
2. If it has `.md` files, list them (only the files directly inside `.digismith/hooks/<point>/`,
   not its `scripts/` subfolder or any other nested directory), sorted by filename.
3. For each file, in that sorted order: read it in full, then follow its instructions exactly
   as if invoking it as a skill. Its frontmatter (`name:`, `description:`) is documentation
   only at this point — nothing matches against it, so just execute the body.
4. If a hook's own instructions fail partway (a command exits non-zero, a gate condition it
   names isn't met), that hook's own instructions define what "failure" means and how to
   report it — this procedure doesn't impose a uniform failure contract across hooks. Continue
   to the next hook file in sorted order regardless, unless the failed hook's own instructions
   say otherwise.

## Notes

- This procedure is point-agnostic — it works identically for `post-finish` today and for any
  future point some other skill adds later. Only the point name changes.
- A hook file that needs backing scripts keeps them in a `scripts/` subfolder next to that
  point's own folder (e.g. `.digismith/hooks/post-finish/scripts/`), matching the convention
  already used by skills like `subagent-driven-development`.
- Hook files execute with the agent's full tool authority, the same as any skill — only follow
  them in repos the user controls. If a hook file shows up somewhere unexpected, surface it
  rather than running it.
