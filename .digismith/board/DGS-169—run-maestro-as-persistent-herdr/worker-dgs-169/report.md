# DGS-169 final report: OpenCode maestro pilot (2026-10-10, written 13:3x UTC+7)

**Outcome.** Jack adopted OpenCode and attached from his PC over Tailscale Serve (https://workbox.tail730dcf.ts.net to 127.0.0.1:4198). He decided ONE shared OpenCode server for all maestros: the work continues in **DGS-223** (`backlog/shared-opencode-server.md`). This branch is the TEMPLATE for DGS-223 and is NOT merged. The live server (PID 40624, port 4198) runs from `.worktrees/dgs-169`, so the worktree and the branch stay until DGS-223 moves it. Tab `opencode-maestro` (w2:tM) stays open. No push, no merge, no ClickUp change.

(Checkpoint 3 text follows unchanged.)

# Checkpoint 3 text (2026-10-10 12:0x UTC+7 [05:0xZ])

Branch `dgs-169` in `.worktrees/dgs-169`, 4 commits, nothing pushed: 7bf9336 luna price, cbe55f2 agents and config, 9b13344 exact git allow list and depot-dir deny, ca0f267 probe and pilot scripts. OpenCode 1.18.35.

## 1. Running now (side by side, STANDBY)
- Server: `opencode serve --hostname 127.0.0.1 --port 4198`, cwd `.worktrees/dgs-169`, PID in `~/.digismith-depot/opencode/server.pid` (mode 600), log `server.log` (mode 600), password `~/.digismith-depot/opencode/server-password` (mode 600; no password gives HTTP 401). Stop it by PID.
- Tab `opencode-maestro` (w2:tM, pane w2:pM), `opencode attach` to the server, agent `maestro` (luna). herdr sees it as agent `opencode`, status idle (so `herdr-opencode` status hooks work in the attached TUI). It is not a named agent (shows without a name in `agent list`).
- STANDBY check passed: it read exactly the three files, replied in 12 lines (who, what understood, what it will not touch, what was unclear: `master-note.md` unreadable for it), then waited. 40k input tokens, about $0.009.
- Server log: 0 errors. `herdr-agent-state.js`, `herdr-tui-session.js` and `tokenreply-key.js` all loaded (the TUI shows the herdr agent state, the key works).

## 2. Free permission checks (no model), by `.opencode/probes/dbg.py`
| Check | Verdict |
|---|---|
| grep tool (path and no path) | disabled for the agent |
| glob tool | disabled |
| list tool | does not exist in 1.18.35 |
| read of decoy folder | allowed, names only, no content |
| read of `~/.digismith-depot` (dir) | denied (new rule) |
| `git diff --no-ind\ex /dev/null decoy/.e\nv` (backslash-hidden) | DENIED |
| `git branch -D x` | DENIED |
| `git log -p -- decoy/.e\nv` | DENIED |
| `git show HEAD:decoy/.e\nv` | DENIED |
| `git status --short` | allowed |
| `ls decoy/.e\nv` (backslash path) | **allowed: residual risk, accepted by Jack.** It prints names only, never content. A backslash cannot be denied by pattern (OpenCode turns `\` into `/` before matching). |
Model-driven probes from checkpoint 2 still hold (26 denied, no leak) and were rerun on the earlier rules; the git allow list is now exact, so the free checks above are the proof for the change.

## 3. Pilot: the same three asks, fresh session each, read-only
Asks (give these words to `digismith-maestro` to compare): A1 "Read the maestro note and give a status in a short table: done, in progress, blocked, needs Jack. Start nothing. Max 15 lines." A2 "List the live agents in your herdr workspace with their status, one line each. Start nothing." A3 "Draft a brief for the small backlog item backlog/herdr-read-dim-prompt-suggestions.md: goal, files to read, rules, checkpoints. Max 14 lines. Write it to a draft file. Do not dispatch anything."

| Agent | Ask | Secs | Tools | Tokens in / out / cache read | Cost (list) | Result |
|---|---|---|---|---|---|---|
| luna | A1 | 20 | bash, read | 16,850 / 316 / 5,632 | $0.0049 | correct table; mentions my block and pending checkpoints; did not flag stale note parts |
| luna | A2 | 20 | 2 bash | 8,304 / 160 / 5,632 | $0.0020 | listed 5 agents, the unnamed one as "OpenCode maestro pilot" (wrong label, right pane) |
| luna | A3 | 35 | bash, read, apply_patch, read | 9,310 / 550 / 18,944 | $0.0029 | 13-line draft written, but 5 "Rules" lines and 3 checkpoints: ignored "goal, files, rules, checkpoints, max 14" form partly; content on topic |
| sonnet | A1 | 22 | read, bash | 24,911 / 831 / 10,648 | $0.0907 | richer: flags the note as stale on three points, groups the needs-Jack items, refuses to answer the worker (right call) |
| sonnet | A2 | 10 | 2 bash | 1,940 / 290 / 21,058 | $0.0124 | listed with pane ids and kinds; guessed the unnamed pane is itself |
| sonnet | A3 | 82 | read, bash, write | 1,794 / 1,324 / 32,718 | $0.0350 | 11-line brief, good checkpoints, states its own gap ("did not open the wrapper"), offers a ClickUp task |
Luna total (A1 to A3 plus STANDBY): 74,762 in, 1,363 out, 30,208 cache read, about **$0.017**. Sonnet total: 28,645 in, 2,445 out, 64,424 cache read, about **$0.142** (8 times luna). The cost field of OpenCode is 0 for TokenReply, so costs are computed from token counts at list price ($0.20/$1.20/$0.02 luna, $3/$15/$0.30 sonnet); cache writes show 0 tokens and are not priced.
Quality read: luna is fast and cheap and correct on facts; sonnet is more careful and caught staleness. For routine status luna is enough; for a status that drives a decision use `maestro-review`.
**Claude side:** I did not touch `digismith-maestro`. Please run the three asks above on it and note its tokens and cost from `/cost` or its status line; I have nothing to add for it.
Drafts: `.digismith/sessions/opencode-maestro/brief-draft-maestro.md` and `brief-draft-maestro-review.md` in the main checkout (untracked, not committed).

## 4. Cost, whole order
Spike $0.18 + this order about $0.35 (key proof $0.002, probes $0.13, routing $0.03, STANDBY $0.009, pilot $0.16) = about **$0.53** of the $1 cap. Price per list; Jack's group may discount.

## 5. Bootstrap lines (text only; Jack installs them in `herdr-bootstrap.sh`; I did not run or install them)
Untested: not run. Needs `server-password` (already exists, mode 600). The server lives in its own herdr pane so a logout of the launching shell does not kill it (a `nohup` background start from a script without a terminal failed in my first try). Add after the DigiSmith workspace is ensured (`$DG` is its id; after the merge `DG_DIR` has the config):
```bash
OC_DIR="$HOME/.digismith-depot/opencode"
ensure_opencode_maestro(){ # workspace-id
  local ws=$1 pane tab
  [ -f "$OC_DIR/server-password" ] || { log "opencode: server-password missing, skipped"; return; }
  tab=$("${H[@]}" tab list --workspace "$ws" | jq -r '.result.tabs[]|select(.label=="opencode-server")|.tab_id' | head -1)
  if [ -z "$tab" ]; then
    pane=$("${H[@]}" tab create --workspace "$ws" --label opencode-server --no-focus | jq -r '.result.root_pane.pane_id')
    "${H[@]}" pane run "$pane" "cd '$DG_DIR' && OPENCODE_SERVER_PASSWORD=\$(cat $OC_DIR/server-password) opencode serve --hostname 127.0.0.1 --port 4198"
    sleep 8; log "opencode server started in $pane"
  fi
  tab=$("${H[@]}" tab list --workspace "$ws" | jq -r '.result.tabs[]|select(.label=="opencode-maestro")|.tab_id' | head -1)
  if [ -z "$tab" ]; then
    pane=$("${H[@]}" tab create --workspace "$ws" --label opencode-maestro --no-focus | jq -r '.result.root_pane.pane_id')
    "${H[@]}" pane run "$pane" "cd '$DG_DIR' && OPENCODE_SERVER_PASSWORD=\$(cat $OC_DIR/server-password) opencode attach http://127.0.0.1:4198 --dir '$DG_DIR'"
    sleep 8
    "${H[@]}" pane run "$pane" "You are the OpenCode maestro pilot on STANDBY. The Claude maestro digismith-maestro is still the maestro. Do not drive anything. Read ONLY .digismith/sessions/DigiSmith/note.md, master-check.md and .digismith/sessions/workbox.md. Reply in at most 12 lines: who you are, what you understood, what you would not touch, which files were unclear. Then wait for Jack."
  fi
}
ensure_opencode_maestro "$DG"
```
Found live: the first `pane run` typed into the TUI before it was ready was lost (the box stayed empty); the 8 second wait and sending it again fixed it. A reboot restores panes how herdr restores them; check the existing tabs before the script runs (labels `opencode-server` and `opencode-maestro` make it idempotent).

## 6. PC attach (Jack attaches only after the ticket finishes; OpenCode 1.18.35, pnpm only)
Server must be up (see section 5 or the live one). PC side, Proton VPN off:
```
pnpm add -g opencode-ai@1.18.35
ssh -i $env:USERPROFILE\.ssh\jazurite -N -L 4198:127.0.0.1:4198 workbox@workbox
$env:OPENCODE_SERVER_PASSWORD = (ssh -i $env:USERPROFILE\.ssh\jazurite workbox@workbox "cat ~/.digismith-depot/opencode/server-password")
opencode attach http://localhost:4198
```
Password path: `~/.digismith-depot/opencode/server-password` (mode 600). The worktree is where the server runs now, so the session works in it; after close-out it moves (see gaps).

## 7. Missing before a cutover (Jack decides)
1. **Server cwd.** It runs in `.worktrees/dgs-169`, which is removed at close-out. After the merge, restart it from the main checkout (bootstrap line above does that through `DG_DIR`).
2. **Merge first.** The config (`opencode.json`, `.opencode/`) is only on the branch; the other OpenCode workers in this repo would also load it (agent `maestro` is the default agent: the config sets `default_agent`). Check that this does not disturb other OpenCode sessions started in the main checkout.
3. **No dispatch tested.** The pilot is read-only. A real maestro must write briefs under `.digismith/sessions/dgs-<n>/`, create tabs, start Claude workers and read their panes. The edit rule now allows only `.digismith/sessions/opencode-maestro/` and `.digismith/board/*/worker-opencode-maestro/`. Widening it, and testing `herdr-ws tab create`, `agent start`, `agent prompt`, is the next step; the herdr-ws script already limits to w2.
4. **Memory and hooks.** No Claude auto-memory (a digest is not written yet: the rules are in `maestro.md` from the order and the briefs), no SessionStart hook, no post-finish hooks (stay in the worker merge orders), no usage probe (reads token files, denied to it).
5. **Not tested:** long multi-tool maestro work, reviews, a checkpoint round with a real worker, context growth of the 616-line runbook, what happens to the TUI after a herdr restart.
6. **Guardrail limits:** residual `ls` of a backslash-hidden path (names only); `grep`, `glob` disabled; prompts for workers cannot contain `|`, `>`, `$`, `&`, `;`; sonnet probes skipped (identical permission blocks, confirmed by API).
7. **Gateway refusals:** the gateway returned "can't chat about this" to a prompt that looked like an injection ("do not refuse"); phrase orders plainly.
8. **Luna quirks:** answered A3 with a looser format than asked; labelled the unnamed pane wrongly in A2. Use `maestro-review` for anything decisive.
9. **Names:** the TUI pane is not a named herdr agent (unlike `digismith-maestro`), so `agent prompt` by name does not reach it; use `pane run` with text (never empty).
10. **Memory use:** the server is large (about 2.6 GB RSS seen on the proof server after 45 minutes with many sessions); check it before leaving it up for days (the Mac has 16 GB).

## Cleanup status
Servers: only the pilot server (4198, PID file) runs; proof (4210) and probe (4211) servers are stopped. Scratch proof folder is in the session scratchpad. Probe results are in `~/.digismith-depot/opencode/probes/`. Decoy tree `.opencode/probes/decoy/` is gitignored.
