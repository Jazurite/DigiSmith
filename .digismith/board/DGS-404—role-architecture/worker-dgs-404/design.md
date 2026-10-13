# DGS-404: Role architecture (design)

Date: 2026-10-12. Ticket: DGS-404 (list I.6: Roles and Permissions), part of epic DGS-402. Related: DGS-411 (identity, list I.7), DGS-413 (continuous agentic work), DGS-401 (OpenCode dispatch). Status: approved by Jack 2026-10-13. Design only, no code.

Every decision below comes from Jack's words on DGS-402, DGS-404 and DGS-411 (2026-10-11 and 2026-10-12). Where Jack has not decided, the point is in "Open questions".

## 1. The idea in five lines

- Jack is the principal. Nobody else holds his authority: sessions only act for him inside written limits.
- Three levels do the work: **Maestro** (manual, outside herdr, top authority) > **Conductor** (persistent, automated, inside herdr) > **Worker** (one ticket).
- Scout, Reviewer and Observer are narrow helpers: they read and report, they never change anything.
- A role has a **fixed ceiling**. A written order (the **mandate**) can only narrow it, never widen it. Deletes follow a separate **ownership rule**.
- Every session knows its role at start from its **session card**. Its powers follow from role plus mandate.

## 2. The roles

| Role | What it is | Runs where | Who starts it | Lives |
|---|---|---|---|---|
| **Jack** (master) | The human principal. Gives the final decisions. | At a Maestro session | Himself | Always |
| **Maestro** | A session that represents Jack: a Claude Code Desktop session, the OpenCode app. A thin, start-anywhere client. Does everything a conductor does, and adds oversight of conductors and acting for Jack. | Outside herdr, on the Workbox (Desktop SSH session, OpenCode app). Opened from any machine: home PC, Gradion Mac. | Jack, by hand | Open on demand. Several live sessions of one Maestro identity may exist at once. |
| **Conductor** | The project's head butler. The persistent, fully automated agent. Holds the full state of its own domain and its own workers, and nothing outside it. | Inside herdr only: tab 1 of its project workspace. One per project. | The boot script (`herdr-bootstrap.sh`) | Persistent. Restored by herdr after a restart. |
| **Worker** | Builds one ticket: one brief, one tab, one worktree, one branch. | Inside herdr, one tab per ticket. | A conductor, or a Maestro directly | Until its ticket is merged and its workspace is cleaned up |
| **Scout** | A worker that only reads: surveys ClickUp, searches the repo, reads a pane. Returns a report, never a change. | Inside herdr, or a subagent | Conductor or Maestro | One job |
| **Reviewer** | An independent reader of a design, a plan or a branch. Returns findings with a failing scenario, and a verdict. Never reviews its own work. | Inside herdr, a subagent, or a gateway model | Conductor or Maestro | One review |
| **Observer** | A read-only client that watches a conductor without disturbing it. Reads panes and the conductor's state. Never types. | Anywhere that can read the depot and herdr | Jack, or a Maestro | While watching |

**The Representative is not a role.** DGS-203 (an agent that decides for Jack within a written mandate) is the Conductor: it is the one that runs on its own. A conductor decides for Jack inside its mandate (the Maestro's written order plus the standing rules) and reports back, as on the 2026-10-11 night runs. The final decisions stay with Jack through a Maestro. DGS-203 is merged into this ticket.

### Role details

**Maestro.**
- Is thin: it does not hold the project's state. It asks the conductor for the full picture, then gives orders and final decisions. A new Maestro session opened on any machine consults the conductor for context.
- May do everything a conductor does: create tabs, start and brief workers, act at checkpoints, merge. It adds orders to conductors and the final decision at Jack's word.
- Several sessions of one identity can be live together (office and home). Jack types in one at a time. No takeover, no handoff: every order and decision is written to shared state, and a session re-reads that state when Jack types in it again.
- A Maestro tracks only workers it started itself (their cards say `under: <maestro id>`). The conductor does not track those.

**Conductor.**
- Owns its domain: its permissions, its workers, their branches and merges, its state note. It runs its order alone and answers its workers.
- Keeps an always-current, queryable state, so a Maestro can ask "what is going on" and get one answer.
- Watches its workers and re-arms its own monitors. Reports at the end of each ticket and each night run. It asks only for decisions that are Jack's.
- Never writes code or builds itself (DGS-146). It never tracks anything outside its domain.

**Worker.**
- Works inside its brief and its worktree. Writes plan.md first and stops at checkpoints. Never merges, pushes or widens its scope alone.
- When it is done, its workspace goes (tab, worktree, branch, scratch). Its record stays (report, plan, ticket, history, merged code).

**Scout, Reviewer, Observer.** Read-only. A Scout and a Reviewer write one report file in their own scratch folder, nothing else. An Observer writes nothing.

## 3. Authority: a ceiling per role, narrowed by a mandate

- Each role has a **fixed ceiling**: the most it may ever do. The ceiling is in this design and in the tooling, not in a prompt alone.
- The **mandate** is the written order that grants a session its authority: for a conductor, the Maestro's order plus the standing rules; for a worker, its brief. A mandate can only **narrow** the ceiling. A mandate that tries to widen it is void for that point.
- **Autonomy is on the loop**: a conductor decides inside its mandate, logs each decision (question, answer, the mandate line that allowed it), and Jack reviews afterwards and can overturn any decision. An overturn becomes a changed mandate line.
- **Separation of duties**: a session never approves its own work. A conductor never builds. A reviewer never reviews its own output.
- **Deletes are the one exception to "an order can grant it":** deletes follow the ownership rule (section 4), and no order or night run changes that.

## 4. The authority ladder

Read each row as: what the role may do **alone**, what **needs the role above**, and what **always needs Jack**.

| Role | Alone (inside its ceiling and mandate) | Needs the role above | Always needs Jack |
|---|---|---|---|
| **Maestro** | Everything a conductor does. Write orders and mandates. Answer what an order or a standing rule already decides (night runs). Start conductors' work, create tabs, start and brief workers. Merge and push per Jack's saved preferences. Delete what it or its own workers created, once done. | Nothing above it except Jack. | Design approvals. Policy and new rules. A new project, clan or conductor. Raising any ceiling. Spending beyond a stated cap. Secrets and keys. Any delete outside the ownership rule. ClickUp deletes (tickets are discarded instead). |
| **Conductor** | Run its order. Start and brief workers in its domain. Answer its workers' routine prompts. Verify review findings and fix the verified ones. Merge locally with the post-finish hooks, push, set the ticket done after merge and first use, per Jack's saved preferences. Routine ClickUp writes through `dg` that the order names. Delete what it or its own workers created, once done. | Design approvals. Policy. Work outside its mandate. A new project or clan. A ClickUp status change or comment the order does not name. Anything touching another conductor's domain. | The same list as the Maestro, in full. A conductor never answers a delete prompt. |
| **Worker** | Everything inside its brief: edit in its own worktree, commit on its own branch, run tests, use its own subagents. Clean up its own scratch. | Merge. Push. A scope or plan change. A dependency or permission outside the brief. Any ClickUp write. Anything outside its worktree. | Any delete outside its own scratch. |
| **Scout** | Read what the brief names. Write one report in its scratch. | A wider read scope. | Anything that changes something. |
| **Reviewer** | Read the target. Write findings and a verdict. | A wider read scope. | Anything that changes something. |
| **Observer** | Read panes, cards and state notes. | None: it never types. | None: it never types. |

### The ownership rule for deletes (Jack, 2026-10-12)

- A Maestro or conductor may delete what it or its **own** workers created, once the work is done: the worker agent and tab, its worktree (untracked files included), its branch, its scratch files.
- It may **never** delete Jack's files, files created by anyone else, shared data, or a ClickUp ticket (discard instead). Those need Jack's word for the exact target (its id, in his own words).
- No order, brief, night run or standing approval widens this. A delete command is built and tested with mocks only; never `--yes` against a real target.
- Why: worker dgs-83 deleted the real D.3 list under a night order that pre-approved deletes (2026-10-11).
- To check "created by" the system must record who created each thing. The `created_by` field on the card and on the worktree marker is how (see follow-up F5).

## 5. The session card

Every session reads or writes its card **first**, so it knows its role before it acts. The card sits on top of the engine's own session data (Claude Code: session id, folder, transcript; OpenCode: its session id). It adds what the engine does not know. It works the same for Claude and OpenCode sessions.

```yaml
name:      digismith-maestro          # display name
role:      conductor                  # maestro | conductor | worker | scout | reviewer | observer
id:        dsm-conductor-01           # stable identity (survives restarts)
session:   <engine session id>        # this run's session id
under:     <id it answers to>         # worker -> its conductor or Maestro; conductor -> its Maestro
domain:    DigiSmith                  # the project it owns, or the ticket for a worker
mandate:   <path of the written order that grants its authority>
state:     <path of its living note / handoff; the flux reads and writes it>
runs_on:   herdr w2:p1                # herdr pane, or the Workbox over SSH
machine:   <where Jack sits>          # Maestros only
created_by: <id>                      # who made this session (for the ownership rule)
started:   2026-10-12T22:40+07:00
last_seen: 2026-10-12T22:55+07:00
status:    open                       # open | closed | lost
```

- Where each card comes from: a worker's from its brief, a conductor's from the boot script, a Maestro's from its identity record.
- The `id` and `under` fields form a tree: Maestro -> conductor -> worker.
- The card holds no secrets.

### Maestro identity (DGS-411)

- One identity record per Maestro: `~/.digismith-depot/identities/<name>.yml` (stable id, name, owner, project folder, the conductors it oversees, its authority rung, created date).
- Same `maestro_id` means the same Maestro. "Who else is open" = other open cards with that id and a recent `last_seen`, shown at session start.
- Two live sessions of one identity are normal. Neither is "superseded". Any live session may give orders. Because each session only remembers what was typed into it, every order and decision goes into shared state (the conductor and the depot).

## 6. How roles talk

```
Jack
 └─ Maestro (any machine, manual)  ── asks ──►  Conductor (herdr, persistent)  ── briefs ──►  Worker
        ▲  final decisions                         ▲  state, reports                              │
        └──────────── questions, reports ──────────┴──────────── questions, reports ◄─────────────┘
```

- **Down**: orders and mandates (Maestro to conductor), briefs (conductor or Maestro to worker). Live prompts go through `herdr-ws`, which pins the session and workspace.
- **Up**: the state note and the question queue (worker to conductor, conductor to Maestro), reports at the end of each ticket. A conductor asks a Maestro only for decisions that are Jack's.
- **Consult**: a new Maestro session asks the conductor for the full picture. On another machine it reaches herdr over SSH (`herdr --remote <ssh-target>`, over Tailscale).
- **Never across lines**: a conductor never orders another conductor's workers. A worker never takes an order from a session that is not its `under`. A conductor never acts on a typed order it cannot tie to its Maestro (see Open question 3).
- **Maestro to a worker directly**: allowed only for a worker the Maestro started itself (`under` = that Maestro). The conductor does not track it.
- **Observer**: reads cards, state notes and panes. It never writes.
- **Maestro to Maestro** (two different identities): an open idea with no ticket yet. Same-identity sessions share state through the depot already.

## 7. Catch-up

Jack's case: he gives the conductor its mandate, commutes, opens a new Maestro client on another machine (for example the Gradion Mac) and asks to be caught up ("catch me up", "how is it going?"). The Maestro is thin and remembers nothing, so the conductor tells it everything that happened, in a fixed shape.

**1. Trigger.** Either of two:
- **By intent, not by command.** Any message from Jack whose intent is "I want to catch up" triggers it, in his own words: "catch me up", "hey, how is it going?", "what is the update?", "status?", "what did I miss?". There is no fixed phrase and no keyword list. The Maestro recognises the intent, asks the conductor, and answers with the template. A message that only mentions a status inside another task ("merge it and tell me the status of DGS-12") is not a catch-up.
- Automatic, as a second trigger: Jack types in a Maestro session that has been idle. "Idle" means its own `last_seen` is older than the newest `last_seen` among its identity's cards. The session then catches up before it answers.

**2. Window.** Everything since that Maestro identity's last activity: the newest `last_seen` across all its session cards (open, closed or lost). A brand-new identity with no cards gets the last 24 hours. The catch-up names the window in its first line (from and to, UTC+7).

**3. What the conductor returns.** Always the same sections, in this order, so Jack learns where to look:

| # | Section | What it holds |
|---|---|---|
| 1 | **Done** | Per ticket: the ticket key, one line, a link to its `report.html` |
| 2 | **Running** | Per worker: worker, ticket, stage, since |
| 3 | **Waiting for Jack** | Per question: the question, since, which pane |
| 4 | **Decided under the mandate** | Per decision: the decision, why, which order allowed it |
| 5 | **Parked or failed** | Per item: what, why, the next step |
| 6 | **Next** | The next 3 steps |
| 7 | **Health** | Seats and usage, the herdr server, open tabs |

A section with nothing in it says "none". It is never left out.

**4. Where the conductor reads from, and where it writes.**
- Its state note (roster, waiting questions, decision log, next steps).
- The session cards of its domain (who is open, closed or lost, and since when).
- `git log origin/main` since the window start (what merged and pushed).
- ClickUp (ticket status and comments) through `dg clickup`.
- It also writes the finished catch-up into its own state note, with its window. Another Maestro session of the same identity, opened later, reads that note and does not ask the conductor again.
- It reads only its own domain. Anything outside it (another conductor's work, a worker a Maestro started directly) is not in its catch-up.

**5. The template.** Times are UTC+7 first; UTC in brackets only when the time came from a tool.

```
# Catch-up: <conductor name>
Window: <from> to <to> (UTC+7)   Maestro identity: <id>   Asked by: <session id>

## Done
- <KEY>: <one line>. Report: <link to report.html>

## Running
- <worker> | <KEY> | <stage> | since <time>

## Waiting for Jack
- <question> | since <time> | pane <w:p>

## Decided under the mandate
- <decision> | why: <reason> | allowed by: <order or standing rule>

## Parked or failed
- <what> | why: <reason> | next step: <step>

## Next
1. <step>
2. <step>
3. <step>

## Health
- Seats and usage: <seat: 5h %, weekly %>
- Server: <herdr session state>
- Open tabs: <count, names>
```

The template is a report format, so its ticket sits in the templates lineage, E.5: Templates (E: Methodology, DGS-414), the home of all templates (F11a). The behaviour (the command, the intent recognition, the idle trigger, the state-note write) stays with the role work in I.6 (F11b). The two tickets are linked.

## 8. Where state lives

The repo is the factory: code and formats only. The global depot runs things (DGS-265).

| What | Where | Owner |
|---|---|---|
| Session cards, registry, closed-card archive | `~/.digismith-depot/sessions/<project>/` | The session's owner (section 9) |
| Maestro identity records | `~/.digismith-depot/identities/<name>.yml` | Jack, the Maestro |
| Conductor state note (roster, waiting questions, decision log, next steps) | `~/.digismith-depot/sessions/<project>/<conductor>/note.md` | The conductor |
| Orders and mandates | `~/.digismith-depot/sessions/<project>/orders/` | The Maestro that wrote them |
| Worker briefs | The ticket folder's `worker-*/brief.md`, or the depot sessions folder | The role that started the worker |
| Ticket records: plan.md, report.md, report.html, design.* | `.digismith/board/<KEY>—<slug>/worker-<agent>/` in the repo | The worker |
| Tickets, status, comments | ClickUp (the only tracker) | Via `dg clickup` |
| Card format and hooks | The repo (code) | The plugin |

## 9. Lifecycle and cleanup

- **Per card:** `open` (heartbeat refreshes `last_seen`), `closed` (ended, with a result), `lost` (stale heartbeat and the engine session is gone).
- **How:** a SessionStart hook writes the card. A SessionEnd hook closes it and writes a short handoff into its state note. OpenCode plugin events do the same. Fallback: the next session of the same identity, or the conductor's domain sweep (cards against herdr agents), marks a dead card `lost` and takes over its state.
- **Who cleans:** the owner. A conductor closes its workers' cards and sweeps its own domain. A Maestro closes its own card and those of workers it started. Nobody touches another domain.
- **Worker done:** the tab, worktree, branch and scratch go (ownership rule). The report, plan, ticket, history and merged code stay.
- **Closed cards are archived, not deleted.** They are the session history. Pruning the archive needs Jack's word. Archiving a Desktop session and its transcript stays Jack's.
- **Cleanup covers** Maestro and conductor session data and their workers': cards, registry entries, handoff notes, orders, briefs.
- **Today's pile:** `.digismith/sessions/` holds about 45 old per-agent folders from before this design. Migrating or archiving them is a later step; anything the cleaning role did not create needs Jack's word.

## 10. Enforcement

A prompt alone does not hold a ceiling. The card's role selects a permission profile that the tooling enforces: the `herdr-ws` wrapper (pins session and workspace), the `disallowedTools` and `allowedTools` flags, and the OpenCode safety rules from DGS-401. A role's profile is the ceiling. A mandate narrows it by adding denies, never allows.

## 11. Open questions

1. **Maestro to Maestro** (different identities): how do they talk? Through shared depot state, or a message queue? No ticket yet.
2. **Workers that start workers.** Jack has said a Maestro and a conductor may open workers. May a worker open a sub-worker? Proposed default: no, subagents only.
3. **Telling a Maestro's order from a worker's typed text.** Live risk accepted in DGS-176: a typed order in a pane cannot be told from a worker's herdr prompt. Needs the stronger layers deferred in DGS-177 (Tailscale, signed orders) before a conductor acts on escalating orders.
4. **Mandate format and expiry.** Plain file or structured; does it expire; who writes it (Jack or the Maestro)?
5. **Reviewer model family.** A different family than the author by rule? (The Sol default is paused.)
6. **Observer host.** Anywhere that reads the depot, or only on the Workbox?
7. **Conductor failure.** What if a conductor stops (usage limit, crash)? A Maestro takes over its domain through its card and note. The full always-on design is DGS-413.
8. **List names.** The ticket says I.6 Roles and Permissions and I.7 Identity, while the brief says B.5. Follow-up tickets go to I.6 and I.7.

## 12. Follow-up tickets (created 2026-10-13 after Jack's yes, each linked to DGS-402 and DGS-404)

| # | Ticket | List |
|---|---|---|
| F1 (DGS-417) | Session card format and depot layout (the format in section 5, extends DGS-411) | I.7 |
| F2 (DGS-418) | SessionStart and SessionEnd hooks and OpenCode plugin events: write, close and sweep cards (open, closed, lost) | I.7 |
| F3 (DGS-419) | Role permission profiles: the ceiling per role in tooling (`herdr-ws`, tool flags, OpenCode rules), selected by the card | I.6 |
| F4 (DGS-420) | Mandate file format, decision log and review digest (from DGS-203) | I.6 |
| F5 (DGS-421) | Ownership delete check: record `created_by` on workers, worktrees and scratch; the delete tool checks it | I.6 |
| F6 (DGS-422) | Conductor queryable state and the Maestro "consult" flow, including remote herdr | I.6 |
| F7 (DGS-423) | Maestro-to-Maestro messaging (open idea) | I.6 |
| F8 (DGS-424) | Migrate and archive the ~45 old `.digismith/sessions/` folders into the depot | I.7 |
| F9 (DGS-425) | Close out the superseded role tickets (DGS-170, DGS-171, DGS-175, DGS-176, DGS-139, DGS-145) by pointing them at this design | I.6 |
| F10 (DGS-426) | Authenticate orders: tell a Maestro's order from a worker's typed text (links DGS-177) | I.6 |
| F11a (DGS-427) | Catch-up template: the fixed headings and layout in section 7, kept with the other templates (DGS-414). Linked to F11b | E.5: Templates (`1301150000003808`) |
| F11b (DGS-428) | Catch-up behaviour: the conductor command that fills the template, the intent recognition in the Maestro session (no fixed phrase), the idle trigger as a second trigger, and the write into the state note. Linked to F11a | I.6 |

F11a and F11b are one idea split by aspect (cross-clan rule): the template is a report format and lives with the other templates; the behaviour is role work. Both link to DGS-402.
