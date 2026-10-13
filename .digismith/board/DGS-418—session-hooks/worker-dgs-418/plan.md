# DGS-418 plan: session hooks, write, close and sweep cards

Worker dgs-418, 2026-10-13. Spec: design.md sections 8 and 9 (DGS-404). Uses DGS-417's card format. Read-only so far; DGS-417's plan.md did not exist yet when I wrote this (checked ~13:4x UTC+7), so every name marked **(stub)** is mine, to be replaced by 417's.

## The change
Three small pieces, one shared core:
1. **`card-hook.ts`** (core, `scripts/session-cards/`): `start`, `touch`, `end` functions that take the hook event JSON (stdin) plus env and the depot dir. Pure functions with an injected clock, fs root and herdr runner, so tests use a temp depot and fake events.
2. **Claude Code hooks**, in the plugin's own `hooks/hooks.json` (no `.claude/settings.json` edit): `SessionStart` (add the card writer FIRST in the list, before `session-init.ts`), `UserPromptSubmit` (heartbeat, throttled: skip if `last_seen` < 60 s old), `SessionEnd` (close and handoff). Each is a `node --experimental-strip-types` command like the existing one, always exit 0 (a hook must never break a session).
3. **`session-sweep.ts`**: the conductor's domain sweep. Reads open cards of one project, lists herdr agents through `herdr-ws agent list` (read-only), marks dead cards `lost`.

## Decisions I make (tell me if you disagree)
- **Plugin hooks, not settings.json.** The plugin mechanism does the whole job (SessionStart, UserPromptSubmit, SessionEnd are all plugin hook events), applies to every repo with the plugin, and needs no change Jack must approve. So **no settings diff to show**.
- **Role source (never guessed):** env vars the starter sets: `DIGISMITH_ROLE` (required), `DIGISMITH_ID`, `DIGISMITH_NAME`, `DIGISMITH_UNDER`, `DIGISMITH_DOMAIN`, `DIGISMITH_MANDATE`, `DIGISMITH_STATE`, `DIGISMITH_CREATED_BY`, `DIGISMITH_MACHINE`, `DIGISMITH_PROJECT`. A starter that cannot export env (a Maestro on Desktop) may instead point `DIGISMITH_CARD_SEED` at a YAML file with the same keys. Hook reads from these, plus the event (`session_id`, `cwd`, `source`/`reason`) and herdr env (`HERDR_WORKSPACE_ID`, `HERDR_PANE_ID` → `runs_on: herdr w2:p3Z`; absent → `runs_on` omitted).
- **Fail SAFE = no card.** No `DIGISMITH_ROLE` (or a role outside the enum) means write nothing, print one line to stderr, exit 0. I do not write a card "marked unknown": the enum has no such role and a fake `unknown` card would pollute the sweep and the archive. (Today no starter sets the env yet; wiring the boot script and the worker start command is OUT of scope here and listed as a follow-up, so until then real sessions write no card; first use sets the env by hand.)
- **Project folder:** `DIGISMITH_PROJECT`, else none → no card (again explicit, not guessed from the cwd).
- **Close:** `status: closed`, `last_seen: now`, `result: <short text>`. Claude Code gives only `reason` (`clear`, `logout`, `prompt_input_exit`, `other`), so `result: ended (<reason>)`; a role that knows more writes it into its own note. Plus a handoff block appended to `card.state` (if set and its parent exists; else skipped, said in stderr): heading `## Session end <time UTC+7>`, 3 lines: card id, reason, last_seen. A `clear` reason re-opens on the next SessionStart with the same id, so it closes as `closed` but a new card for the new session id is written by start.
- **Same identity, new session:** `start` writes a new card per engine session id and marks any older `open` card of the same `id` whose session is not the new one as `lost`? **No**: that is the sweep's job (it can check herdr). `start` only writes its own card.
- **Sweep rule:** a card is marked `lost` only when BOTH hold: `last_seen` older than `stale` (default 30 min, `--stale-min`) AND the card is verifiable and the engine session is not in the live list. Verifiable = `runs_on` starts with `herdr`; the live list is the set of `agent_session.value` from `agent list` (the card's `session` field). Cards not on herdr (Maestros) are reported `unverifiable`, never marked. A herdr failure (error, not JSON, empty server) marks NOTHING (fail safe). It never deletes, never touches `closed` or `lost` cards, and only the project named. Output: one line per card (`kept`, `lost`, `unverifiable`) and a JSON summary with `--json`. Dry run default: `--apply` writes.
- **Archive** of closed cards stays 417's API (`archiveCard`); my first use calls it for my own fake card.
- **OpenCode plugin events:** I ship the shared core and a 20-line adapter file `scripts/session-cards/opencode-adapter.ts` (maps `session.created` / `session.idle` / `session.deleted` to start/touch/end). **The file that registers it lives in `.opencode/plugins/` and I will NOT write it**: I show the exact file at checkpoint 1 for Jack to place (`.opencode/**` is denied to me anyway). Question for the conductor: OK, or drop OpenCode from this ticket and make it a follow-up?

## Files
- `scripts/session-cards/card-hook.ts` + `.test.ts` (core: start, touch, end, env parse, fail-safe)
- `scripts/session-cards/hook-cli.ts` + `.test.ts` (reads stdin JSON, dispatches `start|touch|end`, always exit 0)
- `scripts/session-cards/session-sweep.ts` + `.test.ts` (sweep with injected herdr runner)
- `scripts/session-cards/card-stub.ts` (**stub** until 417 merges: `depotDir()`, `readCard`, `writeCard`, `cardPath`, `archiveCard`; deleted at rebase, imports switched to 417's module)
- `hooks/hooks.json` (add SessionStart card writer first, UserPromptSubmit, SessionEnd)
- `scripts/session-cards/opencode-adapter.ts` (+ shown-only registration file)
- docs: a short section in `docs/` on the env vars and the sweep (if a docs page for sessions exists after 417; else the plan/report only)

## Tests (TDD, temp depot via `DIGISMITH_DEPOT_DIR`, fake events, no real session)
1. start: env + event → card file with every field (role, id, session, runs_on from herdr env, status open, started = last_seen).
2. start without `DIGISMITH_ROLE`, with a bad role, or without project: no file, exit 0, stderr line.
3. start never writes env values that are secrets: card keys are an allow-list (a `TOKEN=...` env var never appears).
4. touch: throttled (<60 s no write), else updates only `last_seen`; touch with no card does nothing.
5. end: status closed + result + `last_seen`; handoff appended to the state note; missing note path is skipped, card still closed; end twice is idempotent.
6. hook-cli: feeds event JSON on stdin for each event name; garbage JSON exits 0.
7. sweep: stale + gone → `lost`; stale + alive → kept; fresh + gone → kept; non-herdr → `unverifiable`; herdr runner error → nothing marked; closed/lost cards untouched; dry run writes nothing; other project untouched.
8. hooks.json: SessionStart order (card writer before session-init), SessionEnd and UserPromptSubmit present, commands resolve under `${CLAUDE_PLUGIN_ROOT}`.

## First use (after merge and push)
1. A NEW Claude Code session in the repo, started by hand outside herdr (or a throwaway worker) with the env set (`DIGISMITH_ROLE=worker` etc. and a temp-free real depot project `digismith`): card exists, `open`, at start; closed with a result and a handoff note at exit.
2. Create a clearly fake card (`id: fake-dgs-418`, `runs_on: herdr w9:p9`, `last_seen` 2026-01-01) in the real depot myself, run `session-sweep --apply`, see `lost`, then archive it (I created it).
3. Set DGS-418 done (plain dates), clean up what I created.

## Left out, and why
- Wiring the boot script / worker starter to set the env: belongs to the starters (conductor boot script, the Maestro identity record); a follow-up ticket. Without it hooks are inert on real sessions, which is the safe default.
- A `dg sessions sweep` CLI command: the sweep is a script the conductor calls; a CLI wrapper can follow once 422's consult flow shows how the conductor calls it. Say if you want it now.
- Taking over the dead session's state ("takes over its state", design section 9): the sweep only marks; the takeover is 422's flow.

## Revision after approval (conductor's settled interfaces S1-S12 replace anything above that differs)
- **OpenCode adapter OUT** (S10): no `opencode-adapter.ts`, no registration file. The events (`session.created`, `session.idle`, `session.deleted`) are the design for DGS-430, written in the report. The sweep CLI `dg sessions sweep` is DGS-431; the sweep stays the script `scripts/session-cards/session-sweep.ts`.
- **Card API = 417's** (S1): files `cards/<id>--<session>.yml`; `cardPath(card)`; `closeCard` and `markLost` archive (no `archiveCard`; lost cards go to `archive/`, S2); `listCards` returns `{card, path}[]`; new `findCardBySession(session, project?)`. The stub `card-stub.ts` copies that API; `cards.ts` is the one import point and switches to `../session-card.ts` at the rebase. The closed card carries `ended` and `result` (`ended (<reason>)`); my `closeCard(ref, {result})` option is an addition 417's `closeCard` must accept: **to relay to 417**.
- **State note** (S4): `## Session end <card id> (<session id>) <ended UTC+7>`, `Result:`, `Handoff:`, appended at the END, never inside a marker block.
- **Hooks** (S7): I own `hooks/hooks.json`: ONE `UserPromptSubmit` command (`hook-cli.ts prompt`): pre-prompt handler list (`PRE_PROMPT_HANDLERS`, empty), then the throttled heartbeat, one process. 428 registers its idle check in that list and does not touch hooks.json.
- **Env** (S3): `DIGISMITH_ROLE`, `_ID`, `_NAME`, `_UNDER`, `_DOMAIN`, `_MANDATE`, `_STATE`, `_CREATED_BY`, `_MACHINE`, `_PROJECT`. `_PROJECT` and `_ROLE` required. The card's `domain` = `DIGISMITH_DOMAIN`, else `DIGISMITH_PROJECT`; the depot folder is the card's `domain` (S1), so a starter must set `_DOMAIN` equal to `_PROJECT` or leave it out. `_CARD_SEED` dropped (not in S3). `DIGISMITH_ID` is also needed for a valid card (no id: no card).
- `runs_on` = `herdr <HERDR_PANE_ID>` (value like `w2:p3Z`), else `workbox`.

## Alignment (interfaces shared with the other four)
Based on the common brief only; the other plans were not there yet. **To fill after reading them.**

| Interface | Owner | Name I use | Status |
|---|---|---|---|
| Depot root helper | 417 | `depotDir()` (env `DIGISMITH_DEPOT_DIR`, default `~/.digismith-depot`) | **stub**, switch at rebase |
| Card file path | 417 | `<depot>/sessions/<project>/cards/<id>.yml` | **stub**, 417 decides; I call `cardPath(project, id)` |
| Card read/write/archive API | 417 | `readCard`, `writeCard`, `listCards(project)`, `archiveCard` | **stub**, names to confirm |
| Card fields | 417 | design section 5 exactly, plus `result` (closed cards) | **to confirm**: is `result` in 417's format? |
| Start env vars | 418 (me) | `DIGISMITH_ROLE`, `_ID`, `_NAME`, `_UNDER`, `_DOMAIN`, `_MANDATE`, `_STATE`, `_CREATED_BY`, `_MACHINE`, `_PROJECT`, `_CARD_SEED` | 422/428 read cards, not env; boot-script change is a follow-up |
| State note path | 422 | card field `state` = `<depot>/sessions/<project>/<conductor>/note.md` | I only APPEND a `## Session end` block; **to confirm with 422** that appending is safe and what heading it expects |
| Sweep entry point | 418 (me) | `scripts/session-cards/session-sweep.ts --project <p> [--apply] [--stale-min 30] [--json]` | 422's consult flow may call it |
| Catch-up window | 428 | reads `last_seen` of all cards of an identity | my `touch` keeps it current; `closed` sets `last_seen` = end time |
| Heartbeat throttle | 418 | 60 s | 428's idle test uses `last_seen`; fine at that resolution |

Disagreements found: none yet (nothing to compare with). Open for the conductor: OpenCode adapter in or out; `unknown` card vs no card (I chose no card); whether a `dg sessions sweep` command is wanted now.

Waiting for approved: plan
