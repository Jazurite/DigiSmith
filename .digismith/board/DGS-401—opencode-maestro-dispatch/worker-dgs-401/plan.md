# DGS-401 plan: let the OpenCode Maestro dispatch

Worker `dgs-401`, 2026-10-11 ~22:1x UTC+7 [~15:1x UTC]. Read only so far; nothing changed outside this folder.

## 1. Cause (with evidence)
The config is not the problem. The safety plugin blocks, and it does so after the config has allowed or Jack has approved.

Decision log `~/.digismith-depot/opencode/verdicts.jsonl`, the three refused calls (a `patch` call is how OpenCode 2.x writes a file):
- 21:37:23, 21:39:03, 21:40:43 (the two brief writes, three tries): `tool=patch step=model verdict=block reason="reviewer reply not valid: " tokens=2196/400`. The path is inside `opencode-maestro/`, so the fixed rules pass it to the Haiku reviewer. The reviewer used all 400 output tokens and returned no text, so the plugin cannot parse a verdict and fails closed (`maestro-safety.js:151`, `max_tokens: 400`; the reply check at line 158).
- 21:42:31 (`herdr-ws tab create`): `step=model verdict=block reason="reviewer: Creates a tab in workspace w2, which may belong to another agent, and no matching user request is visible."`.
- No call was blocked by a config deny. The config's `allow`/`ask` rules never decided.

Three defects:
1. **Every write goes to the model.** `fixed()` returns `review` for each write inside an allowed folder (`maestro-safety.js:123`). A write that the rules already allow depends on a flaky reviewer (empty reply at 400 tokens).
2. **The reviewer is blind in v2.** The v2 adapter stubs the session API (`maestro-safety-v2.js:18`: `messages: async () => ({data: []})`), so `lastUserText` is empty and the reviewer sees no user request. Its prompt says "block if unsure", so it blocks. It judged a tab create "with no matching user request".
3. **The edit check ignores the config.** `EDIT_OK` (`maestro-safety.js:25`) is a hard-coded list (`opencode-maestro/`, `board/*/worker-opencode-maestro/`). The config's edit allow globs are not read; a new allow in the config would still be blocked by the plugin.
Also: a reviewer `ask` on anything but a herdr verb becomes a block "needs Jack" (line 191), so an `ask` on a write could never reach a prompt.

I infer (not shown by the log) that in 2.x the plugin hook runs after the approval, which matches "blocked AFTER Jack approved". It does not change the fix.

**Rollout path matters.** `opencode-boot` rebuilds `~/.digismith-depot/opencode/v2/` (config, prompts, both plugin files) from the payload `~/.digismith-depot/opencode/boot/` on every start (`opencode-boot.py` `install_home()`). The payload comes from the repo through `sh scripts/opencode-boot/install.sh`. Editing the v2 copies by hand would be undone at the restart. So the change goes into the repo, then `install.sh`, then Jack's restart. (The payload equals the repo today, except `prompts/maestro.md`: the repo has the newer ClickUp line.)

## 2. The change (repo, branch `dgs-401`, worktree `.worktrees/dgs-401`)
**a. `.opencode/safety/maestro-safety.js` (rules; the v2 adapter needs no change)**
- `EDIT_OK` gets two more patterns: `.digismith/sessions/dgs-<n>/brief.md` (exact file name) and `.digismith/board/<any>/...`. The old two stay. Secret-path, outside-root, secret-text, delete checks stay as they are and run first. Also check `*** Move to:` paths in a patch (a move out of the allowed folders is a block).
- A write whose path passes all fixed rules is **allowed by the rules, no model** (`v: "allow"`). The model is no longer in the write path.
- `herdr-ws` verbs split in two sets. `DISPATCH = tab create, agent start, agent prompt, agent wait`: the rules allow them when the grammar holds (workspace in `SAFETY_ALLOWED_WS`, `--workspace` flag only w2, no metacharacter, no secret text, group is `agent`/`tab`; `tab create` and `agent start/prompt/wait` only with those groups). The config still decides the approval for each. `close, stop, run, send, rename, focus`: stay `review` -> config `ask`.
- Reviewer for the remaining verbs (close/stop/run/send/rename/focus): `max_tokens` 400 -> 1500 (an empty reply stops being the normal case); the prompt says the call goes to Jack's approval prompt next and that the reviewer sees no chat, so it blocks only when the call is clearly harmful (secret, delete, push, other workspace, another agent's tab). An invalid or missing reply and a down gateway still **fail closed** (block). I propose this middle way so the close in the first use does not depend on a blind "unsure".
- Not changed: secret paths, outside-root, `META` characters, `ls` and git grammar, key/log fail-closed, `permission.ask` log.

**b. `.opencode/maestro/opencode.json` (agent `maestro`, and `maestro-review` for parity; say if you want only `maestro`)**
- `edit`: add `"*/.digismith/sessions/dgs-*/brief.md": "allow"` and `"*/.digismith/board/*": "allow"`; keep `opencode-maestro/*`. They come after `"*": "deny"` (last match wins).
- `bash`: add four allows right AFTER the last `* focus *` ask line and BEFORE `ls`, so the later deny block (`*|*`, `*$*`, `*token*`, ...) still wins over them:
  `HERDR_WS=w2 /Users/workbox/.digismith-depot/bin/herdr-ws tab create *`, `... agent start *`, `... agent prompt *`, `... agent wait *` = allow.
  The ask lines for `close stop run send rename focus` stay as they are. (`create`, `start`, `prompt`, `wait` keep their generic ask lines for the no-argument and other-group forms.)
- I check the order after editing with a free script that evaluates the rules with last-match-wins for sample commands (no server).

**c. `.opencode/prompts/maestro.md`: draft part 2, with the new role words**
- "You are on STANDBY..." -> "You are the Maestro on OpenCode (a session outside herdr that represents Jack). You take Jack's orders, dispatch herdr workers (one tab and agent `dgs-<n>` per ticket), act at their checkpoints and report. Start nothing without an order from Jack or the Claude Maestro."
- The pilot "dispatch nothing" line -> dispatch per the runbook's "Start of a ticket": new tab in w2, agent `dgs-<n>`, brief at `.digismith/sessions/dgs-<n>/brief.md`, then "Read <brief> and follow it."; spread workers over the seats Jack names. Tab create, agent start/prompt/wait run without a prompt; close, stop, run, send, rename, focus need Jack's approval.
- Edit scope line: briefs in `.digismith/sessions/dgs-*/brief.md`, board folders `.digismith/board/*/`, notes in `opencode-maestro/`.
- ClickUp line: keep the repo's newer text (ClickUp only tracker; no backlog files).
- Add the rules: deletes need Jack; parallel by default (merges one at a time); every merge writes report.html and commits plan.md, `.digismith/history.html` frozen; never `git commit` in main without a pathspec; merge orders include hooks 01-03 and a CLI rebuild, push after the merge.
- Conductors: `digismith-maestro`, `d3-maestro` (and `emma-maestro`, `soveron-maestro`) and their workers are never prompted by it; coordinate through Jack or the Claude Maestro.
- Keep: second-model rule, no secrets, no AI attribution, denied call = stop.

**d. Tests** `.opencode/safety/test-rules.mjs` (free, dead reviewer URL): new cases first, see them fail, then fix: brief write `dgs-401/brief.md` = allow, `board/DGS-401—x/worker-dgs-401/plan.md` = allow, `opencode-maestro/briefs/dgs-346.md` and the flat `brief-dgs-346.md` = allow, `tab create`/`agent start`/`agent prompt`/`agent wait` in w2 = allow, in w3 or with `--workspace w3` = block; `tab close`, `agent stop`, `pane run`, `agent send` still reach the reviewer (= block-review with a dead gateway); a write to `.env`, `*password*`, outside the roots, `dgs-1/notes.md` (not brief.md), `.digismith/board/../../x`, a delete patch, a `Move to:` out of the folders = block. Plus a small `test-config-order.mjs`: effective permission for sample calls (last match wins) = allow/ask/deny as intended.

## 3. Backups (before any edit outside the repo; copy with `cp -p`, suffix `.before-dgs-401-20261011`)
- `~/.digismith-depot/opencode/boot/opencode.json`, `maestro-safety.js`, `maestro-safety-v2.js`, `prompts/maestro.md`, `project`
- `~/.digismith-depot/opencode/v2/maestro/opencode.json`, `plugin-safety/maestro-safety.js`, `plugin-safety/server.js`, `prompts/maestro.md`
- `~/.digismith-depot/bin/opencode-boot` (install.sh overwrites it with the same file; backed up anyway)
The repo files are in git (the worktree is the backup).

## 4. Live rollout and restore
1. Branch work, review, merge, then in the main checkout `sh scripts/opencode-boot/install.sh` (writes the payload and `bin/opencode-boot`; the Claude classifier may block it as a safety-layer edit: then I stop, say what was blocked, and leave the exact commands for Jack in this folder, no reroute).
2. I ask you at the restart step. Jack runs `~/.digismith-depot/bin/opencode-boot`; a `loaded` line must show in `verdicts.jsonl`.
3. **Restore** if the server breaks (Jack runs the restart again after):
   `cd ~/.digismith-depot/opencode/boot && for f in opencode.json maestro-safety.js maestro-safety-v2.js prompts/maestro.md; do cp -p $f.before-dgs-401-20261011 $f; done` and the same for the `v2/` files, then `~/.digismith-depot/bin/opencode-boot`. (The restart rebuilds v2 from the payload, so restoring the payload is enough.)

## 5. Probes on 4198 (harmless; after Jack's restart)
- I cannot send a request as the OpenCode Maestro's session. Without the restart, I verify for free: the rules function with the three real call shapes (patch to `opencode-maestro/briefs/dgs-346.md`, the flat `brief-dgs-346.md`, `tab create ... --workspace w2`) = allow with no model; the config order test; the DGS-226 deny set in `test-rules.mjs` (still all block).
- Steps for Jack and the OpenCode Maestro after the restart: (1) ask it to write a dummy file `.digismith/sessions/dgs-401/brief.md` (the write must pass without a prompt; I write nothing there myself, the dummy text is "probe"); (2) `ls /etc` must be blocked; (3) read of `.env` blocked; (4) `tab create` in w2 passes without a prompt (the first use: ONE tab, then `tab close`, which prompts; Jack approves).
- DGS-346 stays its own ticket; I run only what shows the deny set holds.

## 6. After that
Claude whole-branch review, fix verified findings, `plan.md` + `report.md` + `report.html` committed together, rebase, `FORCE_COLOR=1 pnpm test`, hooks 01-03, CLI rebuild, push. `done` only after the first use.

## Questions for you
1. Rules-only for the four dispatch verbs and for writes (my recommendation), reviewer kept for close/stop/run/send/rename/focus with the fixed prompt and budget: OK?
2. Also change `maestro-review`: yes (parity) unless you say no.
3. `install.sh` as the rollout step (the v2 copies are rebuilt by the boot script): OK?

## Outcome (2026-10-11)
Approved by the conductor with two changes: Q2 became YES (`maestro-review` gets the same grant) and the install ran before the review. Built as planned. Live proof: Jack's probes a-f passed. The review found two more bugs (dangling symlink, duplicate `--workspace`/`--pane` flags), both fixed with tests. See report.md.
