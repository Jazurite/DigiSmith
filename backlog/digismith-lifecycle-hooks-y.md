# DigiSmith lifecycle hooks (new letter, tentatively Y)

**Status:** Idea only, not brainstormed to a design. Second real use case has now arrived (see
below) and two scope decisions were reached conversationally, but hook mechanics and the other
open questions are still unresolved — a dedicated future session will brainstorm this properly,
starting from "Second use case arrived" below.

**Map item:** **Y** — the next actually-unclaimed letter alphabetically (T, U, X, and Z are
already tentatively claimed by other backlog ideas; see `backlog/README.md`).

**Source:** 2026-09-05, surfaced mid-brainstorm for **W.4.1** (auto version-bump on
`finishing-a-development-branch`'s Option 1). Jack's own framing: "This is similar to any open
source or software library that we need to like custom hook" — WordPress actions/filters,
webpack's tapable hooks, git hooks, and npm lifecycle scripts (`postinstall`, `prepublish`) are
all the same shape.

## The idea

A general lifecycle-hook mechanism for DigiSmith itself: specific points in its own SDLC
pipeline (e.g. post-brainstorm-approval, post-plan-approval, post-finish) each fire a hook that
can run either a **stock** hook (a behavior DigiSmith ships built-in) or a **custom** hook (Jack's
own registered instructions/script for that point, per-repo or per-profile). W.4.1's version-bump
would become the first stock hook, registered at "post-finish," instead of being wired directly
into `finishing-a-development-branch`'s own body the way it actually shipped.

## Why this didn't get folded into W.4.1

Assessed live during W.4.1's own brainstorm: building a general stock/custom hook registry across
multiple lifecycle points to serve exactly one concrete use case (the version bump) is the kind
of premature abstraction `digismith:brainstorming`'s own rules warn against ("YAGNI ruthlessly").
W.4.1 shipped as the narrow, direct fix instead — see `MEMORY.md`'s **W** row. Jack's call:
capture the general concept here, reserve the letter, and give it a fully dedicated future
session rather than a mid-conversation pivot.

## Open questions, not yet scoped

- Which lifecycle points actually need a hook? Post-finish (this item's origin) is the only
  concrete one so far — post-brainstorm-approval, post-plan-approval, pre-merge, and others are
  speculative until a second real use case shows up.
- What does a "custom hook" actually look like mechanically — a script path DigiSmith shells out
  to, a markdown file of instructions a skill reads and follows, a small TS module with a known
  export signature? Each implies a very different config/registry shape.
- Where would the registry/config live — a new `.digismith/hooks/` convention (profile-scoped,
  matching `profiles/*.yml`), or something inside `MEMORY.md`/`vendored/PROVENANCE.md`'s existing
  documentation style?
- Does every vendored/activated primitive need to know how to fire hooks, or does a small shared
  helper (in the style of `scripts/check_vendored_skills.ts`'s own self-contained scripts) do the
  firing on their behalf, keeping the primitives themselves hook-agnostic?
- Stock hooks ship as part of DigiSmith itself (this repo) — do custom hooks ever need to be
  *shared* across repos/profiles, or are they always local to one project?

## Second use case arrived (2026-09-05, same day, separate session)

During W.4.1's actual execution and finish, a stale plugin-cache incident surfaced the second
concrete lifecycle-hook use case this item's "why not applied yet" was waiting on:

A different Claude Code session, on a different project, was running on an installed DigiSmith
plugin cache built from a commit *before* W.6 retired map item H (`subagent-driven-always` —
folded into `writing-plans`, its skill folder deleted from the repo at commit `733bd4e`). That
stale cache still physically had the old, retired `skills/subagent-driven-always/SKILL.md`, and
the session invoked it, running pre-W.6 unconditional-always logic that no longer reflects
DigiSmith's real design. Nothing is wrong in the source (`git log` confirms the folder is fully
gone from `main`) — it's purely a consumer installation that never got told to refresh. This is
the mirror image of the *original* `plugin-cache-lag-self-development.md` gap (that one is about
new skills not being resolvable yet; this one is about retired skills lingering) — same root
cause (the installed cache always lags the source repo), opposite direction of drift.

Jack's call once this surfaced: build **Y** now, using both the already-shipped W.4.1 version-bump
and a new "reinstall the DigiSmith plugin cache after a DigiSmith self-merge" behavior as its two
stock post-finish hooks — **retrofitting** the version-bump to route through Y's mechanism instead
of leaving it wired directly into `finishing-a-development-branch` the way it actually shipped.
Two decisions were reached before the session moved this item back to backlog for its own
dedicated brainstorm:

- **Lifecycle points: post-finish only, for now.** Per this item's own YAGNI reasoning below —
  post-finish is still the only lifecycle point with real use cases (now two, not one).
  Post-brainstorm-approval, post-plan-approval, pre-merge, etc. stay speculative. Build the
  mechanism so a second point is a small extension later, not a rewrite now.
- **Both stock hooks are DigiSmith-repo-gated**, same `IS_DIGISMITH` check the version-bump
  already uses (`plugin.json` has `"name": "digismith"`) — neither fires in a consumer repo.
  The plugin-reinstall hook should also print an explicit reminder that other already-running
  Claude Code sessions on the same machine won't hot-reload and need a manual restart to pick up
  the refreshed cache — that's a hard CLI limitation, not something the hook can fix.

**Still open, unresolved** — this is exactly where the dedicated future session should pick up:
hook mechanics. Three options were on the table when the session paused to backlog this instead
of guessing:
1. **Executable script path** (leaning candidate) — a hook is a path to any executable script,
   run the same way `scripts/bump-plugin-version.ts` and `scripts/check_vendored_skills.ts`
   already are (`node --experimental-strip-types <path>`, or any other shebang'd script);
   `finishing-a-development-branch`'s bash just shells out and checks the exit code/stdout.
   Stock hooks ship as real scripts in this repo's own `scripts/`; a consumer repo's custom hook
   is just their own script path. Most consistent with existing DigiSmith conventions.
2. **Markdown instructions file** — a hook is prose the *agent* reads and follows live (matching
   how skills themselves work: agent-executed prose, not machine-executed code). More flexible,
   but less deterministic/testable than a script.
3. **TS module with a known export** — most structured/type-safe, but requires a loader DigiSmith
   doesn't have today, and doesn't fit the current execution model (agent-run bash, not a Node
   host importing arbitrary consumer-repo modules).

The remaining open questions from the original list below (registry/config location, whether
custom hooks are ever shared across repos, whether primitives need to know how to fire hooks
themselves or a shared helper does it for them) are all still genuinely open too — none were
resolved this round.

## Why not applied yet

Idea only, still not brainstormed to a design — this update captured a second real use case and
two scope decisions (post-finish only; both new stock hooks DigiSmith-repo-gated) conversationally,
mid-way through what was meant to be *this* item's own dedicated session, then deliberately paused
before resolving hook mechanics so as not to guess. The next session should start from "hook
mechanics" above rather than re-deriving everything that led here.
