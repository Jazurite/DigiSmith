# Maestro role: one Desktop session supervises herdr worker agents

**Status:** Proposal for Jack's review (2026-10-02). No design, no code. Confirmed live on
2026-09-29 (DGS-122, DGS-123) and on 2026-10-02 (EMKT-791, EMKT-810).

**Map item:** clan **O: Profiling**, lineage **O.3: Roles** (Jack, 2026-10-02; ClickUp list
`1301150000002911`). ClickUp ticket: **DGS-139**, linked to DGS-110 and DGS-127. It was filed in
O.2: Tailoring first and moved to O.3 the same day, when maestro became a role. It depends on clan
B: Agentic: it reuses `packages/workbox` from DGS-127 and continues the DGS-110 orchestrator work
(DGS-121, DGS-122, DGS-123).

**Source:** Live session 2026-10-02 (Claude desktop-app session "Main", manager mode: one Claude
session managed herdr worker agents on EMKT-791 and EMKT-810). Full retro:
[manager-mode-retro-2026-10-02.md](manager-mode-retro-2026-10-02.md). The Desktop session
"Digi Smith maestro orchestration" took the same role on 2026-10-02.

## Decision: two axes, profile and role (Jack, 2026-10-02)

This decision replaces "maestro is a fifth profile". Where sections below still say
`profiles/maestro.yml` or "the maestro profile", they are history.

- **Profile:** which org's behavior applies: `digismith`, `emma`, `jazurite`, `personal`. It does not
  change. O.0 owns the mechanism, and O.2 owns the tailoring of each profile.
- **Role:** what the session does. Like Kubernetes: the maestro is the control plane (the
  "master"), and the workers are the nodes.
  - **maestro:** a Desktop session opened in `~/.digismith-depot/maestro/`. It supervises herdr
    workers.
  - **worker:** a terminal session in a herdr pane, started by a maestro. It never sees the role
    question, because the maestro sets its role at start (`DIGISMITH_MAESTRO` in its environment).
  - **solo:** Jack's direct sessions, which are neither.
- **Lineage O.3: Roles** owns the role question at session start and the setup for each role.
- The session-start prompt asks for the role once per folder, through the profile mechanism.
- To settle in the design: where the role is stored (for example `.digismith/role` beside
  `.digismith/profile`), which profile the maestro folder has (it manages more than one org), and
  whether the ClickUp `Profile` option "Maestro" goes (DGS-139 still carries that value).

## What's wrong

The maestro role exists only in prompts, the Workbox runbook (`.digismith/sessions/workbox.md`)
and Claude's memory. Each new maestro session learns the rules again. The retro found these
problems:

- The maestro did not know Jack's approval rules. It pushed without asking, then hand-wrote a
  JIRA draft (retro findings 1 and 2).
- The herdr commands are typed by hand every time. Each of these mistakes happened at least once:
  - a missing `--session` after the `emma`/`DigiSmith` split (finding 12),
  - a dim prompt suggestion read as typed input (finding 8),
  - a folder-trust prompt that blocked `agent start` (finding 6).
- A worker's auto mode can answer its own "post as drafted" menu before the maestro's redirect
  arrives. A JIRA comment went out without its screenshot
  ([herdr-auto-answer-races-external-intervention.md](herdr-auto-answer-races-external-intervention.md)).
- The runbook's worker table is kept by hand. It was stale after the herdr session split (w7 in
  `default` became w4 in `DigiSmith`).

## A profile today belongs to a repo, not to a session (history: see the two-axes decision)

`.digismith/profile` selects one of `profiles/*.yml` (`digismith`, `emma`, `jazurite`,
`personal`) for the whole repo. That file sets standards, ticket mode and offload. The maestro
is a role of one session. Today it runs in the DigiSmith repo, and it manages workers in Emma
repos too. If the DigiSmith repo's profile became `maestro`, every other session in that repo
would get the maestro rules and lose the `digismith` ones.

Jack sees `maestro` as one more profile next to the four that exist (2026-10-02). Two ways to get
there:

- **A. A maestro home folder (closest to "one more profile").** The maestro session runs in
  its own folder, `~/.digismith-depot/maestro/` (decided 2026-10-02), with `.digismith/profile` set to
  `maestro`. `profiles/maestro.yml` becomes a real profile, like the other four. The DigiSmith repo
  keeps `digismith`. Cost: the maestro's own notes and runbook move to that folder. When the maestro
  edits DigiSmith files (backlog, runbook), it works in another repo, like any other session.
- **B. A session role on top of the repo profile.** The maestro keeps running in the DigiSmith
  repo. A skill and the session title turn the role on. No `profiles/maestro.yml`. Cost: the
  maestro is not a profile in the O.0 sense, only a role.

Recommendation: **A**, because it uses the O.0 mechanism as it is, and it keeps every profile in
the same shape. Open question 3 below. Part 1 describes the triggers for both.

## The proposal: five parts

### 1. Activation

- **Maestro side.** A new skill, `digismith:maestro`, loads the playbook (part 2).
  - With option A: the SessionStart banner prints `profile=maestro`, and that triggers the skill.
    `profiles/maestro.yml` holds the flags, for example `standards: [global]`, `ticket: false`.
  - With option B: Jack says so ("you are the maestro"), or the session title starts with
    `Maestro`. The maestro is always a Desktop session, because terminal sessions have no
    `get_session` or `clear_session` (B note, 2026-09-29). So it can read its own title.
- **Worker side.** The maestro starts each worker with the environment variable
  `DIGISMITH_MAESTRO=<maestro name>`. `herdr workspace create --env` supports this. The
  SessionStart hook (`scripts/session-init.ts`) prints one more line when the variable is set:
  "DigiSmith: a maestro supervises you. Ask it, not Jack. Stop at each checkpoint. Do not post
  externally."

### 2. Playbook: rules the maestro follows

**Approval rules (Jack, 2026-10-02):**

- Commits and normal pushes to the ticket's PR branch: the maestro decides.
- JIRA comments:
  - Jack reviews every draft before it is posted.
  - Draft it with `digismith:generate-comment`, never by hand. DigiSmith must be initialized in
    the worker's repo.
  - To correct a posted comment, edit it in place (`add-comment --comment-id`). Never post a
    second comment to correct it.
- Ask Jack before: a force-push, a merge, a live-theme change, a Teams post, or a change to a
  global theme-setting value.
- PRs stay draft until Jack says otherwise.
- Permanent deletes: move the thing aside, then give Jack the `rm` command to run himself.

**Review checkpoints.** The worker stops at each checkpoint. The maestro reviews before it lets
the worker continue:

1. each design section,
2. the plan,
3. each task diff,
4. the test results,
5. the whole-branch review,
6. before each push,
7. before each external post.

**Verify, do not trust.** The maestro runs the worker's checks itself (tests, check scripts,
`--ignore-cr-at-eol` diff stats). It does not only read the worker's report.

**Only the maestro posts externally.** The maestro posts JIRA comments, Teams drafts and PR
descriptions, not the worker. The worker drafts the text and stops. This removes the auto-mode
race, because no worker menu can post anything.

**CI triage.** A CI job fails in code that the diff does not touch: rerun the failed jobs once
(`gh run rerun <id> --failed`). The rerun passes: report "cause not confirmed". The rerun fails
too: keep the logs of the first run, then investigate
([manager-ci-rerun-triage.md](manager-ci-rerun-triage.md)).

**Hold.** Send `herdr agent send-keys <name> esc`, then a short message: "HOLD, reply with one
line".

**Do not accept a worker's offer to redo work.** Example: a worker that reads the maestro's note
offers to redo a write-up that is already done (B note, open problems).

### 3. Workbox toolkit: tested commands instead of typed herdr commands

Add worker operations to the planned `packages/workbox` (DGS-127, Sol review process). They
share its roster file, `~/.digismith-depot/workbox.json`. The DGS-127 design already says:
"Other Workbox roles, such as the worker slots in the runbook table, can go in the same file
later."

| Operation | What it does | Replaces |
|---|---|---|
| `start` | Checks free RAM. Creates the workspace with `--env DIGISMITH_MAESTRO=…`. Accepts folder trust for an allowlisted repo. Starts the agent and writes it to the roster. | Typed `workspace create` and `agent start`; findings 6 and 12 |
| `prompt` | Sends `herdr --session <s> agent prompt <name> "<msg>" --wait --timeout 7000000`. The maestro runs it as a background job, so the harness wakes the maestro when the worker settles. No polling. | Typed command |
| `read` | Reads with `--format ansi`. Removes dim text (`ESC[2m`). Reports "input box: suggestion only" when only a suggestion is there. | Finding 8 |
| `hold` | Sends `esc`, then the HOLD message. | Typed keys |
| `list` | Prints the roster: herdr session, workspace, pane, agent, Claude session ID, repo, worktree, ticket, brief path, state. | The runbook's hand-kept table |
| `stop` | Closes the workspace and marks the roster entry `stopped`. | Typed command |

**Folder trust** ([auto-trust-own-repo-agents.md](auto-trust-own-repo-agents.md)). Accept trust
only for git clones of Jack's own orgs under `/root/Workspace` (remote `git@github-emma:emma-sleep/*`
or a Jazurite repo). Use a documented Claude Code setting if one exists. Otherwise use the live
fallback: read the screen, send `down`, check that the selected line reads "Yes, I trust this
folder", then send `enter`. Never accept trust for any other folder.

**RAM gate.** The VPS has 3.7 GB of RAM and a 4 GB swap file. The OOM killer stopped a worker on
2026-09-29. `start` refuses when available memory is below a limit. The limit is open question 6.

### 4. Handoff brief: maestro to worker

The maestro writes `.digismith/docs/<slug>/brief.md` in the worker's repo. That folder is
gitignored. Sections:

- **Goal:** the ticket and the outcome.
- **Findings:** what the maestro already knows.
- **Decisions, do not re-ask.**
- **Stop and ask:** the checkpoints from part 2, plus ticket-specific items.
- **How to reach the maestro:** stop the turn with the question as the last message. The maestro's
  background `prompt` job wakes when the worker settles.

The brief is not the lineage handoff note (`handoff.md`). The brief goes from the maestro to a
worker, for one ticket. The handoff note goes from a session to its next self.

### 5. Out of this item: worker-side features

These change skills that every session uses, not only the maestro. They stay separate backlog
items. Until they are built, the maestro does them by hand from the playbook:

- [init-amend-initialized-ticket.md](init-amend-initialized-ticket.md): a new change request on a
  ticket that is already initialized (finding 7).
- [cross-market-port-structural-check.md](cross-market-port-structural-check.md): check each
  market's structure before a port (finding 10).

## How the retro findings map

| Retro finding | Where it goes |
|---|---|
| 1, 2: approval rules, JIRA template | Part 2 |
| 6: folder-trust prompt | Part 3, `start` |
| 7: init amend path | Separate item (part 5) |
| 8: dim prompt suggestions | Part 3, `read` |
| 10: cross-market structure check | Separate item (part 5) |
| 12: `vps` CLI and named sessions | Part 3: the roster stores the herdr session. [vps-cli-named-herdr-session.md](vps-cli-named-herdr-session.md) can read it from there. |
| 17: CI rerun | Part 2 |
| Auto-mode answer race | Part 2: only the maestro posts externally |

Related, not folded in: [persistent-worker-pool-k8.md](persistent-worker-pool-k8.md) is a pool
of offload servers for single tasks. It is a different shape from long-lived ticket workers.

## Open questions for Jack

1. **ClickUp. Answered 2026-10-02.** The O.2: Tailoring list exists. Its tickets carry a `Profile`
   drop-down custom field with one option per profile (DigiSmith / Emma / Jazurite / Personal /
   Maestro), on the O: Profiling folder (`79f7fb3e-a2ea-4f63-a6aa-d37475cbd850`, created through the
   Frontdoor API). This build is DGS-139, with `Profile` = Maestro. It links to DGS-110 and DGS-127.
   They are links, not dependencies, because the order with DGS-127 is still open (question 5).
2. **Name. Answered 2026-10-02: `maestro`** (Jack). So: the role `maestro`, `digismith:maestro` and
   `DIGISMITH_MAESTRO`. The ClickUp lineage B.0 is also
   named "Maestro" (offload dispatch, old map letter K). It gets a new name: DGS-140.
3. **Activation. Answered 2026-10-02 (Jack):**
   - **Option A**, a maestro home folder. Later the same day maestro became a role, not a profile
     (see the two-axes decision), so there is no `profiles/maestro.yml`.
   - **Bound by working folder.** The maestro is a Desktop session opened in that folder. The
     profile is read from the session's working folder (`process.cwd()` in
     `scripts/session-init.ts`), not from the git repo, so the binding survives `/clear`, resume and
     restarts. Binding by session ID (lost on `/clear`) and by title (the hook cannot see titles)
     were rejected.
   - **Global folder: `~/.digismith-depot/maestro/`**, outside any repo, like `~/.claude`. It sits in
     the global folder DigiSmith already has, next to `.env`, the `workbox.json` roster and `captures/`.
   - **Picker at session start.** Today the first-use picker runs only inside `digismith:init`
     (`bootstrap` Step 0), and a maestro never runs `init` in its home folder. New: when a session
     opens in a folder with no `.digismith/profile`, DigiSmith asks for a profile once, maestro
     included. A "not a DigiSmith folder" answer is remembered, so the picker asks only once.
   - **No ticket repo can become a maestro.** First solved with a `home_only: true` field in
     `profiles/maestro.yml`. Under the two-axes decision this is automatic: the ticket-work picker
     lists profiles, and maestro is not a profile.
   - **The folder holds only live state:** the worker roster (live workers only), the runbook and
     the maestro's own handoff note. Worker briefs, designs, plans and reports stay in the worker's
     repo. Retro findings go to DigiSmith's `backlog/`. `captures/` is emptied right after the token
     import. `archive/<date>-<slug>/` has an age limit and a `prune` step that lists the old folders;
     Jack runs the delete.
4. **Toolkit form. Answered 2026-10-02 (Jack): staged.**
   - **Build 1:** the maestro role itself. That is the role mechanism, the session-start role
     question, the `digismith:maestro` playbook skill, the brief template and the worker banner. The
     herdr commands are prose in the skill for now.
   - **Build 2:** tested `dg workbox` commands (TypeScript, Vitest, per `toolchain.yml`) replace
     the prose, starting with the ones that hurt most: `read`, `start`, `prompt`.
5. **Order with DGS-127. Follows from 4:** build 1 does not need DGS-127. Build 2 builds on
   `packages/workbox`: after DGS-127 if that has shipped, or build 2 creates the package itself.
6. **RAM limit** for `start`: moved to build 2, where `start` is built. Today 1.5 GB is available
   with four Emma workers live.
7. **More than one maestro? Answered 2026-10-02 (Jack): one maestro per herdr session.**
   - `claims.json` in the maestro folder records, per herdr session (`DigiSmith`, `emma`), which
     maestro holds it. A maestro can hold more than one. A herdr session has at most one maestro.
     A maestro prompts only the workers in its own herdr sessions.
   - A claim is keyed by the Desktop session ID (`get_session self`). That ID survives `/clear`; the
     CLI session ID that the hook sees does not.
   - A stale claim (the holder is no longer running, per `list_sessions`) can be taken over after
     Jack confirms.
   - One handoff note per claimed herdr session (`.digismith/docs/<herdr session>/handoff.md` in the
     maestro folder), so two maestros never overwrite each other's note.
8. **Who pushes? Answered 2026-10-02 (Jack): the worker, on approval.** The maestro says
   "approved: push". The worker runs its own DigiSmith flow: push, draft PR,
   `capture-ephemeral-url`, then a JIRA draft with `generate-comment`, and it stops there. The
   maestro shows Jack the draft and posts it. The worker's finishing chain stays intact, and the
   worker never posts externally.

## Why not applied yet

All 8 questions were answered on 2026-10-02 in the brainstorm (Desktop session "Digi Smith maestro
orchestration"). Next: approaches and the design for build 1, then a plan.
