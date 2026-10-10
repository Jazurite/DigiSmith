# DGS-169 spike 2 report: OpenCode maestro on the Mac Workbox

Worker `dgs-169-spike`, run 2026-10-09 22:25 to 22:32 UTC+7 [15:25 to 15:32Z], OpenCode 1.18.34, macOS, 16 GB. Cost to TokenReply: **$0** (every model call failed with 401).

## Summary for Jack (10 lines)
1. **The model test did not run.** Every call to TokenReply returned `401 Token not provided`. The server I started had no TokenReply key in its environment. The key sits in `~/.digismith-depot/.env` (`TOKENREPLY_API_KEY`), and loading it means reading that file, which my rules forbid. I skipped the model arms (luna, sonnet) and did not work around it.
2. **No verdict on luna or sonnet.** The tool-call test, token counts and cost per model are still open. Spent: $0 of the $1 cap.
3. **Server and two clients work.** `opencode serve` on 127.0.0.1:4198 with a password: 401 without auth, 200 with. Two TUIs on one session see each other's messages live; one exits and the other keeps working.
4. **Restart persistence works.** I killed the server by PID and started it again: all 8 messages were still there, and the already-attached client reconnected by itself and kept working (10 messages after one more prompt). A new TUI with `-s <id>` replays the full history.
5. **The guardrail works for the agent's own tools, with three slips.** A project-level `maestro-guarded` agent with a bash allowlist denied every herdr, `bash -c`, `sh`, `python3`, `rm`, `git push`, `echo` and `$(...)` form I tried. Slips: `head`/`wc` read a `.env` or password file (only `cat` was denied), a pipe `cat x | head` passed, and a redirect `cat x > /tmp/file` wrote outside the allowed folder. Fixable: deny by path, not by command.
6. **Skills: OpenCode loads Claude-style skills, but not the DigiSmith plugin.** `opencode debug skill` lists project `.claude/skills` (my probe skill) and `~/.claude/skills`. The DigiSmith plugin skills live in the plugin cache and are not listed. The hooks (SessionStart banner, post-finish) do not exist in OpenCode.
7. **Memory is no longer a blocker on 16 GB, but it is big.** Server 935 MB at start (with a CPU spike), 1005 MB after clients, 665 MB after a restart; each TUI about 300 to 330 MB. System free memory stayed 85%.
8. **Recommendation (partial, until the model test runs):** OpenCode works as the persistent multi-client hub and the shape is sound. Do not adopt it for the maestro yet: the model question (does luna make real tool calls?) is the deciding one and is untested. Port: a permission config by path, the maestro note and rules as `AGENTS.md`, and a plugin-skill copy into `.claude/skills`.
9. **To unblock the model test (morning step 2):** start the server from a shell where you set `TOKENREPLY_API_KEY` yourself (I do not touch it), then tell me to rerun the arms.
10. **Cleanup done:** server stopped by PID, three tabs closed (t7, t8, t9), no process left, no real maestro or worker touched, nothing committed or pushed.

## Answers to the seven questions
1. **Start: works.** `opencode serve --hostname 127.0.0.1 --port 4198`, password from the mode-600 file `~/.digismith-depot/spikes/dgs-169/.server-password`. Plain `serve`, not `dg depot opencode ensure` (random port, no password; `dg` not on PATH in the pane). `curl` 401 without auth, 200 with; `lsof` shows only 127.0.0.1.
2. **Attach, simulated: works.** Client 1 (herdr agent `dgs169-maestro`) and client 2 (`dgs169-client2`) on one session. A prompt sent to client 1 showed in client 2; one sent from client 2 showed in client 1 (message count 4 to 8). `/exit` on client 2 left client 1 working. The real attach from Jack's PC is a morning step.
3. **Models: blocked, not run.** One smoke run per arm of the pipeline: 401 from `api.tokenreply.com/v1/chat/completions`, "Token not provided". The local no-config run of the same model also failed (a different, unspecific error). Cost $0. I did not read `~/.digismith-depot/.env`, the global OpenCode config or any key.
4. **Plugin: skills yes, DigiSmith plugin no.** `opencode debug skill` (11 skills): the project probe skill, ten global ones (`~/.claude/skills/synced/...`), one built in. No `digismith:*` skill. Model use of a skill was not tested (no model). Needs porting: skills (copy into `.claude/skills` or an `AGENTS.md`), hooks, the Skill tool names, the flux and handoff protocol text.
5. **Guardrail: works with three slips** (see summary 5). Tested without any model, by `opencode debug agent maestro-guarded --tool bash --params ...`, which applies the agent's permission rules. Allowed: `HERDR_WS=w2 .../herdr-ws agent list`, `date`, `ls`, `git status`, `head`/`wc` on any file, `cat x | head`, `cat x > any path`. Denied: `bin/herdr list`, `./bin/herdr list`, `env X=1 ./bin/herdr list`, `sh bin/herdr`, `sh bin/runit`, `bash -c`, `echo`, `python3 -c`, `rm`, `git push --dry-run`, `cat decoy/.env`, `cat decoy/password.txt`, `cat a; echo x`, `ls && echo x`, `cat $(...)`, `cat ../opencode.json`; the `read` tool denied `.env`, `password*`, `auth.json`; `apply_patch` (the edit tool for the GPT models) allowed only under `work/out/`. Only decoys and a fake `herdr` script were used. Rules are matched per sub-command (a pipe is split), so `*|*` never fires. Fix: allow `head`/`wc` only with path rules, and add `*>*`.
6. **Persistence: works.** Client exit then re-attach with `-s <id>`: history replayed. Server kill by PID then restart, same command: 8 of 8 messages kept; an attached client reconnected without a restart and the next prompt worked. After a reboot you must redo: start the server (password env, key env, port), then `herdr agent start <name> --pane <p> --kind opencode -- attach <url> -s <id>`. The herdr agent entry does not survive a TUI exit (as in the 2026-10-04 spike).
7. **Memory:** table.

| Point | Server RSS | Each TUI | System free |
|---|---|---|---|
| started, idle (first look) | 935 MB (CPU 208% at start) | - | - |
| server + 2 TUIs | 1005 MB | 311 and 309 MB | 85% |
| after restart, 1 TUI replaying | 665 MB | 330 and 297 MB | 85% |

Only about ten messages, no model turns, so the growth over ten turns is still unmeasured.

## Not done and why
- Model arms luna and sonnet: 401, no key in the server environment (no workaround attempted).
- Plugin and guardrail probes through a model: need a model; replaced by `debug skill` and `debug agent --tool`.
- Real attach from the PC: morning step.

## Morning steps for Jack
1. Read the summary above.
2. **To run the model test:** in a Workbox shell where you export `TOKENREPLY_API_KEY` yourself, start the spike server: `cd ~/.digismith-depot/spikes/dgs-169/work && export OPENCODE_SERVER_PASSWORD="$(cat ../.server-password)" && opencode serve --hostname 127.0.0.1 --port 4198`. Then tell the maestro; the arms need about $0.41 (cap $1). (Or tell me another way you want the key to reach the server.)
3. **Real attach from the PC** (needs the server up from step 2). Turn Proton VPN off. Install: `npm install -g opencode-ai@1.18.34`. Tunnel (terminal 1): `ssh -i $env:USERPROFILE\.ssh\jazurite -N -L 4198:127.0.0.1:4198 workbox@workbox`. Terminal 2: `$env:OPENCODE_SERVER_PASSWORD = (ssh -i $env:USERPROFILE\.ssh\jazurite workbox@workbox "cat ~/.digismith-depot/spikes/dgs-169/.server-password")`, then `opencode attach http://localhost:4198`. If `workbox` does not resolve, use 100.108.1.19.
4. Decide: rerun the model arms, and whether to tighten the guardrail by path.

Raw material: `~/.digismith-depot/spikes/dgs-169/logs/` (`guardrail.json`, `skills.json`, `agent.json`, `samples.txt`).
