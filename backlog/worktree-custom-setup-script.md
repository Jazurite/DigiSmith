# Worktree creation: support arbitrary per-project setup, not just package-manager installs

**Status:** Not applied. Findings only — no ticket, no code touched.

**Source:** `D:\Workspace\Library\automaker`, specifically
`docs/worktree-init-script-example.sh` and
`apps/server/src/services/init-script-service.ts`.

## What's already covered (checked, not assumed)

`superpowers:using-git-worktrees` Step 2 ("Project Setup") already
auto-detects and runs the common package-manager installs after creating
a worktree:

```bash
if [ -f package.json ]; then npm install; fi
if [ -f Cargo.toml ]; then cargo build; fi
if [ -f requirements.txt ]; then pip install -r requirements.txt; fi
if [ -f pyproject.toml ]; then poetry install; fi
if [ -f go.mod ]; then go mod download; fi
```

So "install dependencies in a fresh worktree" is **not** a gap — confirmed
by reading the skill file directly (superpowers 6.2.0).

## The actual gap

Neither `using-git-worktrees` nor `using-digismith` provisions anything
beyond that fixed package-manager list — confirmed by grepping both for
`.env`/setup/init-script mentions (none found). A fresh `git worktree add`
never gets gitignored files, and `.env` is the obvious one: Emma theme
repos almost certainly need Shopify API keys / store domain / similar in
a gitignored `.env` for `npm install`-adjacent tooling (dev server, build
scripts) to work at all. Right now that would silently break or use stale
values the first time something runs in a new worktree — surfacing
mid-brainstorming or mid-build, not at worktree-creation time when it'd
be obvious what went wrong.

## What automaker does about it

A project-defined, arbitrary shell script
(`.automaker/worktree-init.sh`) run once per worktree after creation —
not limited to package managers, so it can copy `.env.example` → `.env`,
seed a local DB, symlink shared assets, whatever the project needs. Three
details worth keeping if this gets built:

1. **Idempotency** — a persisted "already ran" flag in worktree metadata,
   so resuming a worktree doesn't re-run the script every time.
2. **Safe-env allowlist** — the spawned script gets a curated env
   (`PATH`, `HOME`, etc.), not the full `process.env`. Deliberate: avoids
   leaking `ANTHROPIC_API_KEY` and similar into a project-supplied
   script.
3. **Windows shell resolution** — explicitly prefers Git Bash over WSL
   bash (`C:\Windows\System32\bash.exe`), because WSL bash without proper
   configuration causes ENOENT/compat errors. Relevant since Jack runs on
   Windows.

## Where this would land, not yet decided

Same upstream-vs-DigiSmith tension as the other backlog items: generic
"run a setup script after worktree creation" is `using-git-worktrees`
territory (Step 2), not a DigiSmith file. But `.env` provisioning
specifically is Emma-repo domain knowledge DigiSmith already owns
elsewhere (per-repo standards, ticket context) — it could instead be a
DigiSmith-specific step layered onto `using-digismith`'s existing
worktree-attach logic, rather than a generic upstream patch. No ticket
exists for either path yet.
