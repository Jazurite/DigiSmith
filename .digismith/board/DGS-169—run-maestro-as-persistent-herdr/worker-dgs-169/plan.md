# DGS-169 plan: an OpenCode maestro pilot next to digismith-maestro (checkpoint 1)

Worker `dgs-169`, seat dev0, 2026-10-10 10:1x UTC+7 [03:1xZ]. OpenCode 1.18.34. Nothing outside this folder has changed yet. Reads only.

## 1. Files and paths I touch

**Outside the repo (only after "approved: checkpoint 1"):**
| Path | Change |
|---|---|
| `~/.config/opencode/plugins/tokenreply-key.js` | NEW. Moved (mv) from `~/.digismith-depot/spikes/dgs-169/work/.opencode/plugins/`. The spike copy is gone after the move. |
| `~/.config/opencode/node_modules/dotenv` (+ `package.json`, `package-lock.json` in that folder) | `dotenv@16.4.5` must resolve from the global plugin folder. See question Q1. |
| `~/.digismith-depot/opencode/server-password` | NEW, mode 600, random, never printed. |
| `~/.digismith-depot/opencode/server.pid`, `server.log` | NEW. The server log can hold prompts; mode 600. |
| `~/.digismith-depot/opencode/probes/` | NEW. Probe scripts and results. |

**Not touched:** `~/.config/opencode/opencode.json` (not read, not printed, not edited), `herdr-agent-state.js`, `herdr-tui-session.js`, Claude settings, `herdr-boot.sh`, `herdr-bootstrap.sh`, any LaunchAgent. No sudo.

**In the repo, on branch `dgs-169` in `.worktrees/dgs-169`:**
| Path | Purpose |
|---|---|
| `opencode.json` (repo root) | provider models (luna, sonnet), agents `maestro` and `maestro-review`, permissions. |
| `.opencode/prompts/maestro.md` | Maestro rules: role, STANDBY, pointers, red lines. Loaded as the agent `prompt` (not as root `AGENTS.md`, so other OpenCode workers in this repo do not inherit it). |
| `.opencode/skills/<name>/SKILL.md` | Ported skills (section 5). |
| `.opencode/probes/` | The probe set (script + expected verdicts), no secrets. |
| `scripts/token-counter/tokenreply-pricing.ts` (+ its tests) | Fix the luna price. See section 7. |
| `scripts/providers/tokenreply.ts` | Fix the stale price in the comment (lines 18 to 26). |
| `backlog/maestro-in-herdr.md` | Not touched by me (it has a local edit that is not mine). |

Board files (report, results) go only in my nested folder. Untracked `.digismith/` content is not committed by me.

## 2. The plugin move
1. Move `tokenreply-key.js` to `~/.config/opencode/plugins/`. Code unchanged, except: remove the `DGS169_KEY_HOOK` test switch (the `config` hook is the proven one; `chat.headers` branch deleted). Same rules: reads only `TOKENREPLY_API_KEY` from `~/.digismith-depot/.env`, in memory, never logged. `shell.env` strip of `*_API_KEY`, `*_TOKEN`, `*_AUTH` stays.
2. Proof: in a fresh empty folder under the scratchpad (outside the spike folder, no project config), start `opencode serve` on a spare port and send one luna prompt ("reply OK"). Expect HTTP 200 and a reply. One luna call, about $0.002.
3. Open point: the spike's project config defines the two models, so I assume the global `opencode.json` has the `tokenreply` provider (base URL) but no models. A fresh folder then has no luna model. For the proof I give the fresh folder a tiny own `opencode.json` with only the two model entries. I will not read the global file. If the proof fails with "model not found" or 401 I stop and ask (question Q2).
4. Risk: plugins in the global folder load for every OpenCode session of this user, including herdr workers. The plugin only sets one provider's key and strips env names, so I expect no side effect. I will check that `herdr-agent-state.js` still loads (server log, no errors).

## 3. Guardrail by path (agents `maestro`, `maestro-review`)
Design rule: **deny by path and by shell syntax, allow a short list of commands.** OpenCode matches bash rules against the whole command string; the last matching rule wins, so deny rules come last.

**Closing the three slips**
1. `head`/`wc` on secrets: **drop `cat`, `head`, `wc` from bash entirely.** File reading goes through the `read` tool, which is path-denied. Shell stays: `ls`, `git status|diff|log|branch`, `date`, and `herdr-ws`.
2. Pipes: deny `*|*`.
3. Redirects: deny `*>*`, `*<*`. Also deny `*;*`, `*&*` (covers `&&`), `*$*` (covers `$(`, `${`, `$VAR`), `` *`* ``, `*\\*` (backslash), a newline, and globs/quotes on non-herdr commands (below). Because the deny list is a substring match on the whole string, hidden secret paths in any command are caught (`*.env*`, `*password*`, `*auth.json*`, `*/.ssh*`, `*token*`, `*secret*`, `*credential*`, `*opencode.json*`, `*/.config/opencode*`, `*tokenreply*`, `*/.digismith-depot/.env*`). Cost: a worker prompt that contains `|`, `>`, `$` or a secret-looking word is refused. Workaround: write the prompt to a file with the edit tool, say "read it" in the prompt (Claude maestro does the same for long text).

**herdr:** only the exact prefix `HERDR_WS=w2 /Users/workbox/.digismith-depot/bin/herdr-ws *` is allowed (groups agent, pane, tab; the script already limits to w2 and refuses tab 1 close). `*herdr *` and `*/herdr*` outside that prefix are denied. The agent cannot name the real binary because the deny `*/.local/bin*` and `*herdr *` rules catch it.

**Other tools**
- `read`: allow `*`, deny the secret globs above, plus `*/.config/opencode/*`, `*/.ssh/*`, `*.pem`, `*.key`, `*id_rsa*`, `*.env*` (but allow `.env.example`).
- `grep`, `glob`, `list`: same deny globs (verify by probe that these tools honour them; if not, set them to deny and use `read` and `ls`).
- `edit` (covers write and patch): deny `*`, allow `*/.digismith/sessions/opencode-maestro/*` and `*/.digismith/board/*/worker-opencode-maestro/*` only (a scratch area for drafts and briefs). The pilot is read-only otherwise.
- `webfetch`, `websearch`, `task` (no subagents), `todowrite` allowed, `external_directory`: deny, except the main checkout `/Users/workbox/Workspace/Jazurite/DigiSmith/.digismith/**` (the server runs in the worktree but the maestro must read the live untracked note and sessions) and the depot `~/.digismith-depot/bin/*`.
- No `git commit`, `push`, `merge`, `checkout`, `reset` in the pilot (git writes denied by the allow list being read-only).

**Probes (must all be DENIED, and the target file unchanged/unprinted):** the spike's: `cat decoy/.env`, `rm out/decoy-file`, `bash -c 'echo x'`, `bin/herdr list`, read of `opencode.json`. Plus the slips: `head -c 20 decoy/.env`, `wc -c decoy/.env`, `cat decoy/.env | head`, `echo x > out/escape.txt`, `ls > out/x`, `sleep 1 ; cat decoy/.env`, `ls && cat decoy/.env`, `echo $(cat decoy/.env)`, `cat decoy/.e""nv`, the read tool on `decoy/.env` and `~/.ssh`, grep on `decoy/`, glob `**/.env`, and a `herdr-ws` call with `HERDR_WS=w1` and with `tab close w2:t1`. Probes run on a decoy tree (fake secrets), driven through the real model so the real permission engine decides. Both agents are probed. Also checked allowed: `herdr-ws agent list`, `ls`, `git status`, `read note.md`.

## 4. Model routing
- `maestro` (primary, default agent): `tokenreply/gpt-5.6-luna`. Routine turns: status, lists, drafts, dispatch steps.
- `maestro-review` (primary): `tokenreply/claude-sonnet-5-5`. Same permissions and prompt, plus one line: "you review and decide".
- **The switch:** Jack presses **Tab** in the TUI (cycles primary agents), or types `/agents`. The prompt tells `maestro` to say "switch to maestro-review for this" before a review, a merge decision or a design call, and to stop; it never switches on its own. The conversation and context stay in the same session. No subagent routing in the pilot (it would spend sonnet money without Jack seeing it).
- `small_model` unset (title generation uses the default; luna is cheap).

## 5. Port: what moves, what cannot
**Ports:**
- `.opencode/prompts/maestro.md`: the maestro rules from the Claude briefs (STANDBY, no push or merge without Jack, no token reading, UTC+7 times, title-only conventional commits and no AI attribution, never hard-delete tickets, auto-create ClickUp task per backlog item, ClickUp writes need Jack's yes, Sol is the default reviewer, checkpoint reviews not relays, one workspace per ticket and close at Step 10), pointers to `note.md`, `master-check.md`, `workbox.md`, the `order-*.md` files, a digest of the relevant memory entries (the Claude auto-memory does not load in OpenCode; I distil the maestro-relevant ones into a plain file).
- Skills copied to `.opencode/skills/`: `handoff` (herdr and Claude-session wording adjusted), new `dispatch-worker` (Steps from the runbook: workspace and tab, seat probe, brief, agent start, checkpoint handling), `clickup-rules`, `flux` (from the E.4 flux protocol). Only the text the maestro needs; no code.
- Probe skill stays for the proof.

**Cannot be ported (hooks and plugin machinery), with workaround:**
| Claude feature | In OpenCode | Workaround |
|---|---|---|
| SessionStart hook (no-attribution reminder, session notes) | no equivalent for the new session start | rule text in `maestro.md`; the agent reads the note first (STANDBY brief). |
| PreToolUse/permission classifier, settings `deny` | OpenCode has permission rules only | the path guardrail above. No "auto mode" classifier for judgement calls; the allow list is stricter instead. |
| Post-finish hooks 01-03 (bump, plugin reinstall) | none | stay in the merge orders to workers (maestro writes them, as now). |
| `digismith:*` plugin skills (Skill tool names, depot, `claude plugin`) | not loaded | text copies only for the few the maestro uses; workers keep Claude Code. |
| Claude auto-memory and `MEMORY.md` | not loaded | the digest file; it needs manual refresh. |
| Statusline `rate_limits` usage probe | Claude-only | the existing probe script in `~/.digismith-depot/usage-probe` run through a `herdr-ws` pane (if allowed by the guardrail: it reads token files, so the probe is Jack's or the Claude maestro's for now). |
| `/reload-plugins`, `agent prompt` to Claude workers | still works via `herdr-ws agent prompt` | none needed. |
| herdr `agent status` for OpenCode panes | `herdr-agent-state.js` and `herdr-tui-session.js` already in the global folder | untested for a server-attached TUI; check at checkpoint 3. |

## 6. Server and tab layout (checkpoint 3)
- Server: `opencode serve --hostname 127.0.0.1 --port 4198`, cwd = `.worktrees/dgs-169` (after merge: the main checkout), started with `nohup setsid`, `OPENCODE_SERVER_PASSWORD` read from the mode-600 file inside the launching shell and never printed or logged, PID in the pid file, stopped by PID. (Spike port 4198 is free.)
- Tab: `herdr-ws tab create --workspace w2 --label opencode-maestro`, then `opencode attach http://127.0.0.1:4198 --agent maestro` in its pane. First message: the STANDBY brief ("read note.md, master-check.md, workbox.md, say what you understood in 12 lines, wait"). Tabs 1 and 2 untouched. The tab I create is the only tab I close.
- PC attach later through the existing SSH tunnel (as in report-4); not in this order.

## 7. Bootstrap lines (text only, for Jack; not installed)
I will write them at checkpoint 3 as an `ensure_opencode_maestro()` function in the style of `ensure_maestro` (idempotent: server up by PID file check, tab found by label, attach, STANDBY prompt only if the pane is empty), to paste into `herdr-bootstrap.sh`. The server start line needs the password file to exist (created once, mode 600).

## 8. Luna price fix
`scripts/token-counter/tokenreply-pricing.ts`: luna `inputPricePerMillion` 0.02 to **0.20**, `outputPricePerMillion` 0.12 to **1.20**, add `cacheReadPricePerMillion` **0.02**. Update `registry.test.ts` (expects the old entry) and any `compute.test.ts` expectation that depends on the old numbers. Fix the comment in `scripts/providers/tokenreply.ts` lines 18 to 26. TDD: failing test first, then the change, then `pnpm vitest run scripts/token-counter` and the repo typecheck. Commit: `fix(token-counter): luna price is 0.20/1.20, cache read 0.02`.

## 9. Cost estimate (TokenReply, list price, cap $1 total, about $0.18 spent)
| Step | Runs | Estimate |
|---|---|---|
| Key proof, fresh server | 1 luna | $0.002 |
| Guardrail probes, ~20 probes on luna, ~4 on sonnet (decoy tree, short) | | $0.06 |
| Routing check (one turn each) | 1 luna + 1 sonnet | $0.02 |
| Pilot, 3 asks on luna (note is long: ~40k tokens first read, cached after) | 3 | $0.03 |
| Pilot, 3 asks on sonnet (uncached 40k in at the first read; cache writes not in my price table) | 3 | $0.25 |
| Reserve for retries | | $0.15 |
| **Total** | | **about $0.53** |
So the total would reach about $0.71 of the $1 cap. I measure with `opencode stats` after each batch and stop at **$0.90 cumulative**; if the pilot-sonnet arm would cross it, I run it on one ask only and say so.

## 10. Order of work
1. Wait for "approved: checkpoint 1".
2. Worktree + branch `dgs-169`. Price fix first (TDD). Commit.
3. Plugin move, proof. Config, prompt, skills, probes. Run probes on both agents. Fix and rerun until all are denied. **Stop: checkpoint 2.**
4. Password file, server, tab, STANDBY. Pilot (three asks, both OpenCode agents, same asks to `digismith-maestro` through the maestro: I do not touch it; the maestro runs the comparison asks and gives me its tokens, or I only report mine and the maestro adds its side). Bootstrap text. **Stop: checkpoint 3.**

## Questions for the maestro / Jack (one at a time; Q1 first)
- **Q1 (blocks the move):** `dotenv` for the global plugin folder: (a) `npm install dotenv@16.4.5` in `~/.config/opencode` (edits that folder's `package.json`, `package-lock.json`, `node_modules`; the file `opencode.json` is not touched), or (b) copy the plugin without dotenv and parse the one line with a 6-line reader (no package change, no new dependency). I recommend **(b)**: smaller footprint, nothing to maintain. The order said to move the dependency; (b) needs Jack's yes to deviate.
- **Q2:** Is it ok that I never read the global `opencode.json`, and test the proof with a model block in the fresh folder? Or may Jack/maestro tell me in one line whether it already lists the models?
