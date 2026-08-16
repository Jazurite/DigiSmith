# Getting Started — New Repo

Terse first-run walkthrough plus a profile/map-item reference. Philosophy
lives in [`MEMORY.md`](../MEMORY.md); live per-item status lives in
[`.digismith/history.html`](../.digismith/history.html). This doc doesn't
repeat either — just what to actually do and expect the first time
DigiSmith touches a new repo.

## 1. Install

```
/plugin marketplace add Jazurite/DigiSmith
/plugin install digismith@jazurite
```

Once per machine. After a change lands on DigiSmith's `main` (a new
profile, a fixed skill), pull it into an already-installed repo with
`/plugin marketplace update` (or reinstall) — installs otherwise pin to
whatever was published at install time.

## 2. Trigger

From a session rooted in the target repo:

```
/digismith:using-digismith
```

or naturally: "start work on this ticket" / "begin implementation" /
"let's build this now — [paste ticket or describe the need]".

Only want a ticket captured, no branch or build yet? Invoke
`digismith:jira-intake` directly instead.

## 3. Profile picker (first run only)

Asked once per repo, remembered in `.digismith/profile`. Change later
with "switch this repo's profile to X" — it states the behavioral delta
and confirms before writing.

| Profile | ticket | standards | ephemeral | reporting | publish_artifact | logging | Use for |
|---|---|---|---|---|---|---|---|
| `emma` | ✓ | global, shopify, team | ✓ | ✓ | ✓ | ✓ | Client Shopify theme repos |
| `personal` | – | – | – | ✓ | ✓ | – | Throwaway / scratch personal work |
| `jazurite` | – | – | – | ✓ | ✓ | ✓ | Your own branded projects — process worth a corpus, no client machinery |

Declining the picker stops everything — no branch or worktree gets
created until a profile is chosen.

## 4. What happens next

Ticket exists (Door 1) or gets drafted from a raw need (Door 2) →
`.digismith/docs/<slug>/ticket.md` → `<Key>__<slug>` (or `<slug>` alone
under `ticket: false`) branch/worktree → hands off into
`superpowers:brainstorming` with that ticket content preloaded. From
there Superpowers' own chain runs unmodified: `writing-plans` →
`subagent-driven-development`, with its own gates at each stage.

## 5. What fires automatically, and when

None of these need separate invocation — each hooks into its own
trigger point inside the chain above, gated by the active profile:

- **G — standards injection.** Every implementer subagent's brief,
  restricted to the profile's `standards` list (empty list = nothing
  injected).
- **M — ephemeral URL capture.** After
  `finishing-a-development-branch`'s "push and create PR" option, waits
  for the ephemeral-deploy CI check and reports the Preview/Theme Editor
  URLs from the bot's PR comment. Gated by `ephemeral`.
- **N — implementation report.** The moment a plan's final review comes
  back clean, before that plan's ledger gets deleted. Gated by
  `reporting`. Report/spec generation itself isn't gated by
  `publish_artifact` — the separate `Artifact`-publish step inside
  `report-implementation` and `enforcer` is.
- **P — telemetry.** At `finishing-a-development-branch`'s integration
  decision (merge, PR, or keep-as-is all count), commits this session's
  transcript slice back into DigiSmith's own repo. Gated by `logging`;
  the capture window starts wherever the marker gets written (normally
  `using-digismith` Step 1.5), not from true session start.

## 6. Known gaps — don't expect these yet

- **E.2 isn't built.** There's no full stage-order enforcement or
  resume-mid-flight logic. Starting real work without going through
  `using-digismith` first (already on a branch, already coding) means
  G/M/N still fire fine off their own hooks, but P only captures from
  wherever its marker ends up written, not from wherever the work
  actually started.
- **Backlog items aren't applied yet.** Check
  [`backlog/README.md`](../backlog/README.md) before assuming a stage is
  airtight — known open ones include a comment-fetch bug in M and no
  auto-recovery from a stale `.git/index.lock`.

## 7. Check status

[`.digismith/history.html`](../.digismith/history.html) — live progress
per map item and per tier.
