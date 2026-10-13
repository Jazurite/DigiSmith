# DGS-418 report: session hooks, write, close and sweep cards

Status: built and committed on branch dgs-418, merge-ready. Not merged, not pushed (waits for "go: merge" after DGS-417, 427, 422). No settings file changed; no real session was started by the tests.

- **Hooks** in the plugin's own `hooks/hooks.json` (no `.claude/settings.json` edit, so no settings diff): `SessionStart` runs the card writer first, then `session-init.ts`; ONE `UserPromptSubmit` command (`hook-cli.ts prompt`) runs a pre-prompt handler list (empty; DGS-428 plugs its idle check in) and then the throttled heartbeat (60 s) in one process; `SessionEnd` closes the card.
- **Fail safe:** the card comes only from an env allow-list (`DIGISMITH_ROLE`, `_ID`, `_NAME`, `_UNDER`, `_DOMAIN`, `_MANDATE`, `_STATE`, `_CREATED_BY`, `_MACHINE`, `_PROJECT`). Without a valid role and project, no card is written; a line break in a value or an invalid card also writes none. Every hook exits 0.
- **Close:** card gets `ended` and `result: ended (<reason>)` and is archived by `closeCard`; a handoff block (`## Session end <id> (<session>) <time UTC+7>`, `Result:`, `Handoff:`) is appended at the END of the state note, outside any marker block; a missing note folder skips the note, the card still closes.
- **Sweep** `scripts/session-cards/session-sweep.ts --project <p> [--apply] [--stale-min 30] [--json]`: `lost` only when the heartbeat is stale AND the herdr session is gone (`herdr-ws agent list`, read-only). Cards not on herdr, an unparseable `last_seen`, a failed read, an empty list or an agent without `agent_session` are `unverifiable` and never marked. Dry run by default. It never deletes (`markLost` archives).
- **Tests:** 35 new (temp depot, fake events over stdin, fake herdr list, symlinked entry); `packages/cli` untouched, no CLI rebuild.
- **Card API:** rebased on DGS-417 (aa9cc7c); the stub is gone and `scripts/session-cards/cards.ts` re-exports `../session-card.ts`. Full suite after the rebase: 121 files, 1732 tests (`FORCE_COLOR=1`), CLI build clean.

## Review (Claude subagent, whole branch)
Fixed with tests: the entry guard failed through a symlinked plugin root (compare realpaths); `--stale-min abc` or an unparseable `last_seen` made every card stale; an empty or partial herdr list counted live sessions as gone; env values with a line break could inject card fields.
Documented, not fixed:
- A nested `claude -p` inherits `DIGISMITH_*` and writes a second card with the same id; its end appends to the parent's note. The starter should unset the env for children; follow-up.
- `touchCard` racing `closeCard` can leave a ghost open card (narrow window); the fix belongs in 417's `touchCard` (touch only if the file still exists).
- Resuming a session whose card is already archived writes a new open card with the same file name; closing it overwrites the archived one (417's archive rename).
- `state` is not checked as a path; only the starter's own env can set it.
- The sweep ignores `machine`: a card from another machine is checked against this machine's herdr list.

## For DGS-430 (OpenCode adapter, design only)
Map `session.created` to `start`, `session.idle` to the heartbeat (`prompt` command's touch step), `session.deleted` to `end`, through the same `card-hook.ts` core. The registration file belongs in `.opencode/plugins/` and needs the Claude route and Jack's opencode-boot restart. DGS-431: a `dg sessions sweep` wrapper around the sweep script.

## Alignment (settled interfaces S1 to S12)
This report and the plan's "Revision after approval" follow the conductor's settled list: S1 and S2 (417's card API and archive for lost cards, plus `findCardBySession`), S3 (env), S4 (state note heading), S7 (one UserPromptSubmit entry with the handler list), S10 (OpenCode text only).

## First use (pending, after merge and push)
1. A throwaway herdr worker with `DIGISMITH_*` set by the conductor: its card is `open` at start and archived `closed` with a result and a handoff in its state note at exit.
2. A clearly fake stale card (`id: fake-dgs-418`, `runs_on: herdr w9:p9`) in the real depot, swept with `--apply`: `lost`, archived. I created it, so the ownership rule lets me archive it.
3. DGS-418 done with plain dates; clean up.
