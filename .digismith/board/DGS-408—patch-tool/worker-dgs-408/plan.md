# DGS-408 plan: OpenCode Maestro edits broadly, deletes go to Jack's prompt (checkpoint 1)

Target is the Maestro's CHANGE section (Jack: "yes change DGS-408 to that"): it replaces the path list in my first brief. Read only so far; nothing changed outside this folder.

## 1. Cause, with evidence (OpenCode 2.0.26, read from the installed binary's embedded source; no guessing)
- The agent `maestro` (gpt-5.6-luna) gets the `patch` tool; `edit` and `write` are removed for `gpt-` models. `maestro-review` (sonnet) gets `edit` and `write`, and `patch` is removed. So both agents must be covered, and all three tools ask the **same** permission.
- `patch`, `edit` and `write` each call `permission.assert({action: "edit", resources: [...]})`. The key is `edit` (there is no `patch` key). `patch` sends one resource per touched file (the target, and the move destination too).
- **Path form: the resource is relative to the project directory, with `/` separators, and has no leading slash**: `.digismith/sessions/dgs-404/brief.md`. It is absolute only when the file is outside the directory (then `external_directory` is asked as well).
- **Glob dialect** (the function `l$`): `\` becomes `/`, `*` becomes `.*` and DOES cross `/`, `?` is one char, a trailing ` *` is optional, whole-string match. **The last matching rule wins** (`findLast`); no match = ask.
- **Why DGS-408 happened**: our config rules start with `*/.digismith/...`. That needs a `/` before `.digismith`; a relative resource has none. No allow matched, `"*": "deny"` won, message `Permission denied: edit`. The safety plugin logged allow (22:27 [15:27 UTC]) because the plugin is a separate layer; the config denied afterwards. Same root cause for `*/.digismith/board/*`.
- **DGS-401 probe (a)**: the live log `verdicts.jsonl` has no `dgs-999` entry and `.digismith/sessions/dgs-999/` does not exist. The only live brief write ever logged is the failed 22:27 one. The log lines from 22:06 with session `t` are our own test scripts (test-rules writes to the live log when `SAFETY_LOG` is unset). So probe (a) "passed" has no evidence in the log; I cannot tell which agent or tool it used. The plan covers all three tools with tests. (Side fix: my tests set `SAFETY_LOG` to a temp file.)

## 2. How a Delete or a move-drop can reach ASK (your item b): it CAN be forced
Evidence from the plugin API (`@opencode/plugin` 2.0.26, `permission.d.ts`) and the binary: `ctx.permission.hook("evaluate", cb)`. The flow in the server: rules are evaluated; **a deny from the rules returns at once** (a plugin cannot override it); otherwise effect = ask or allow from the rules, then the `evaluate` hook runs with `{sessionID, action, resources, metadata, source, effect}` and the callback may **set `effect` and `message`**; `allow` goes ahead, `deny` throws, `ask` opens the prompt in Jack's app and the tool waits. For `patch` the assert comes before any file is written, so a patch with one delete hunk asks once for all its resources; a mixed add+delete patch writes nothing until Jack answers.
Design (all three signals can only escalate to ask, never to allow):
1. `tool.execute.before` (patch text visible) detects a Delete File or a Move to hunk. If all its paths pass the path rules, it records the call id and the session id with a 120 s timestamp and lets the call go on. If a path is denied: BLOCK (never ask).
2. The `evaluate` hook, for action `edit`, sets `effect = "ask"` and `message = "Delete or move: needs Jack"` when the call id matches, OR the session mark is fresh, OR `metadata.files` contains a deleted entry. It never sets allow.
3. Fail-safe: if the evaluate hook is not registered (the v1.18.35 fallback server, or a registration error), the plugin BLOCKS every delete or move with "needs Jack". The adapter passes `canAsk: true` only after `ctx.permission.hook` returned.
Not provable without a model/server: that `source.id` equals the tool call id (signals 2 and 3 cover it) and the exact `status` word in `metadata.files` for a delete. The first use (Jack watches) proves it live: a Delete File on a dummy file must open a prompt. I test the hook logic with fake inputs.

## 3. Config changes (`.opencode/maestro/opencode.json`, both agents; one broad rule, deny rules after it)
`edit` block, in this order (last match wins; checked by the config-order test with a copy of the server's `l$`/`findLast`):
```
"*": allow                         every path inside the directory (resources are relative)
"/*": deny                         absolute = outside the directory (~/.digismith-depot, ~/.config, ...)
"../*": deny                       outside the directory but inside the project
.git deny set: ".git", ".git/*", "*/.git", "*/.git/*"        (my addition a)
node_modules: "node_modules/*", "*/node_modules/*"            (my addition a)
secrets: "*.env*", then allow "*.env.example", then *.pem, *.key, *id_rsa*, *id_ed25519*, *auth.json*, *token*, *secret*, *credential*, *password*, *passwd*, *.ssh*, *tokenreply*, *claude-accounts*, *verdicts.jsonl*
self-config: "*opencode.json*", "*.opencode/maestro/*", "*.opencode/safety/*", "*.claude/settings*.json"
```
(Plus `.digismith/sessions/DigiSmith/order-x.md`, any README, any worktree path: all fall under `"*": allow`.) `.git` as a segment only: `.gitignore` and `.github/` stay allowed. The `*.env.example` allow sits before the later secret denies, so `token.env.example` is still denied. `.opencode/prompts/maestro.md`: update the "You may write ONLY..." line to the new rule and say deletes ask Jack.

## 4. Plugin changes (`.opencode/safety/maestro-safety.js`, `maestro-safety-v2.js`)
- Write rule (replaces `EDIT_OK`): real path (`..` refused, symlinks resolved, dangling symlink refused) must be inside a project root (never the depot bin), and neither the given nor the real path may be a secret path, a self-config path (`.opencode/maestro/`, `.opencode/safety/`, `opencode.json`, `.claude/settings*.json`, anywhere in the tree), have a `.git` segment, or a `node_modules` segment. Then allow by rule, no model. Secret text in a write still blocks.
- Patch parsing mirrors OpenCode's parser (lines trimmed, `\r` stripped, `*** Add|Update|Delete File: <p>` and `*** Move to: <p>`) PLUS a looser case-insensitive, any-spacing scan, so a marker the server would accept can never slip past the plugin. Paths from either scan are all checked. A marker line starting with `+` (added content) is content; a context line (leading space) that looks like a marker counts as a marker (unsure = ask/block).
- Delete/move guard as in section 2, independent of the path allow; only for tools `patch`/`apply_patch`, and only the patch text (a `write` whose content mentions the marker is fine).
- v2 adapter: registers the `permission.evaluate` hook, passes `canAsk`, logs each ask (`event: "evaluate"`).
- `SAFETY.md` updated to the new shape.

## 5. Tests (first; run against the OLD plugin/config to see them fail)
- `test-config-order.mjs`: rewritten with the server's `l$`/`findLast` and RELATIVE resources. Allow: `.digismith/sessions/dgs-404/brief.md` (the free no-model check), `order-x.md`, `README.md`, `.worktrees/dgs-408/packages/cli/x.ts`, `.gitignore`, `.github/x.yml`, `x.env.example`. Deny: each class (secret names, self-config files, `.git`, `a/.git/config`, a worktree `.git` file, `node_modules`, absolute outside path, `../x`). The old config fails the allow cases.
- `test-dgs-401.mjs` and `test-rules.mjs`: expectations moved to the new shape (repo edits allowed; traversal, symlink out, dangling symlink, secrets, self-config, `.git` still blocked).
- New `test-dgs-408.mjs`: delete of an allowed path = ask (`canAsk`) / block (no `canAsk`); delete of a denied path = block; move-drop allowed to allowed = ask; update-with-move; mixed add+delete = ask for the whole patch; odd casing, leading/trailing spaces, tabs, CRLF, no-space markers; marker inside `+` content = allowed; marker as context line = ask; the `evaluate` function: ask on call id, ask on session mark, ask on deleted metadata, never returns allow, leaves normal edits alone; a stale mark (>120 s) is ignored.
- Both `edit`/`write` (maestro-review) and `patch` (maestro) covered.
- Free "OpenCode's own evaluation" check: `opencode debug agents` could print the resolved permission rules, but it talks to a "background service" and may start a process; I will NOT run it unless you say so. Otherwise: the copied evaluator (source line quoted in the test) is the proof, and I say plainly it is not OpenCode's own run; the live first use is the real proof.

## 6. Backups, install, restore, first use
- Backups FIRST with `.before-dgs-408-20261011`: payload `boot/opencode.json`, `boot/maestro-safety.js`, `boot/maestro-safety-v2.js`, `boot/prompts/maestro.md`, `boot/project`; `v2/maestro/opencode.json`, `v2/plugin-safety/maestro-safety.js`, `v2/plugin-safety/server.js`, `v2/prompts/maestro.md`; `bin/opencode-boot`. (`cp -p`, no delete.)
- Branch `dgs-408` in `.worktrees/dgs-408` from origin/main (9d0b95a now). `install.sh` is `mkdir` and `cp` only (read: it copies the config, prompts, the three plugin files, writes `project`, and the boot script). Jack runs `~/.digismith-depot/bin/opencode-boot`, via you. I never touch the server.
- `restore.md` and `probe.md` in this folder like DGS-401. Probes: (a) maestro `patch` Add `.digismith/sessions/dgs-404/brief.md`, no prompt; (b) a README-like repo file and `order-x.md` allowed; (c) Add File `.git/x`, `.opencode/safety/x.js`, `.claude/settings.json`, `~/.digismith-depot/x`: blocked; (d) Add a dummy file, then `*** Delete File` of it: a PROMPT opens, Jack answers (the dummy stays unless he approves); a move-drop: prompt; (e) the DGS-401 probes b-f again. Then the OpenCode Maestro dispatches `dgs-404`.
- Claude whole-branch review, report.md + report.html + plan.md in one commit, merge with hooks 01-03, push, compare the installed files with main and re-run install only if they differ.

## 7. My two additions: for you to overrule
(a) deny any `.git` segment and `node_modules`: kept as in your note. Not added, but worth your call because they run code or widen powers too: `.claude/hooks/**`, `.husky`/`.githooks`, `scripts/opencode-boot/**` (source of what `install.sh` installs, but Jack still runs the install), `.opencode/prompts/**` (the agent's own system prompt), `.opencode/skills/**`. I did NOT add them (your list is the order); say the word and they are one more deny line each.
(b) delete-to-ask: as in section 2, with the safe fallback block "needs Jack" if the hook is missing.

Risks: a broad allow means a wrong patch to any repo file lands with no prompt (git shows it). `*` in the config crosses `/`, so the config is looser than the plugin in places; the plugin is the exact layer and throws first.

Waiting for approved: plan.

## FINAL deny list (Maestro's correction, replaces my section 3/4 deny lists where they differ)
Edit denies, config AND plugin, both agents: secret-like names; `opencode.json` anywhere; `.opencode/maestro/**`; `.opencode/safety/**`; `.claude/settings*.json`; `.git` at any depth; `node_modules/**`; `.opencode/prompts/**`; `scripts/opencode-boot/**`; `.claude/hooks/**`. NOT denied: the rest of `.claude/` (commands, agents), `.husky/**`, `.githooks/**`. Plugin checks are case-insensitive (macOS); the plugin allows only inside the realpath of the repo root, normalized, fail closed. `opencode debug agents` is not run. Delete/move: ask through `permission.evaluate`, block "needs Jack" when the hook is absent.

## What changed after the approval (all from the Maestro's orders; details in report.md)
- Second install: the six herdr verbs skip the reviewer; third install (DGS-408c): the delete/move ask route and the six-verb ask route FAILED OPEN live on probe e and were removed: deletes, moves and the six verbs are BLOCKED "needs Jack" by the plugin alone, no evaluate hook.
- `herdr-ws` runs herdr with the real `XDG_CONFIG_HOME` (the dispatch failed with `server_not_running`).
- Review (DGS-408d): deny all of `.opencode/**`, `AGENTS.md` and `CLAUDE.md` anywhere; check every path inside a `multiedit`.
