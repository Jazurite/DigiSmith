# DGS-223 step 2 plan (checkpoint 1), worker dgs-223, 2026-10-10 (UTC+7)

Read only so far. Nothing changed outside this folder. Branch `dgs-223` is not made yet.

## 1. Brief writing: permission change (both agents `maestro`, `maestro-review`)
Replace the `edit` block with:
- `*`: deny
- `*/.digismith/sessions/*/*`: allow  (a brief or draft in any agent's session folder: `.digismith/sessions/<agent>/...`)
- `*/.digismith/board/*/worker-*/*`: allow  (board folders, worker sub-folders)
- Nothing else: ticket-folder files outside `worker-*/` stay denied.
Every other guardrail stays: the bash deny list, read/list deny, grep and glob off, no `task`, external_directory.
Limit: `*` in OpenCode globs also matches `/`, so `sessions/*/*` allows deeper paths and also `.digismith/sessions/DigiSmith/note.md`
(the Master's note). To stop that I add deny lines after the allow lines (last match wins): `*/.digismith/sessions/DigiSmith/*`,
`*/.digismith/sessions/b3-maestro/*`, `*/.digismith/sessions/d3-maestro/*`, and `*/.digismith/sessions/workbox*.md` (other maestros' files and the runbook).
Maestro's own folder `sessions/opencode-maestro/` stays allowed. Free test (no model): dbg-style permission checks, as in DGS-169.

## 2. Starting a Claude Code agent on seat `jack` with Opus
Why the plain way fails for the maestro: the pane shell needs the seat's token in its environment BEFORE `agent start`
(`claude-account env` prints it, and takes no seat name; `claude-account use` changes the VPS-wide default for every new pane, so it is not acceptable
as a per-agent choice). The maestro bash rules also deny `$`, `;`, `&`, `*token*`, so `eval "$(claude-account env)"` cannot be sent by it, and it must not.

**Proposal: one wrapper script, `start-claude-agent`, source in the repo (`.opencode/bin/start-claude-agent`, python, same style as `herdr-ws`),
Jack copies it to `~/.digismith-depot/bin/` (like `herdr-ws`).** The maestro runs only:
`HERDR_WS=w2 /Users/workbox/.digismith-depot/bin/start-claude-agent <seat> <agent> <label> <model>`
The script (not the maestro) does:
1. Checks: seat in a fixed list (`jack`, `dev0`); agent matches `dgs-[0-9]+[a-z0-9-]*`; model in (`opus`, `sonnet`); label plain text.
2. Through `herdr-ws` only: `tab create --workspace $HERDR_WS --cwd <main checkout> --label <label> --no-focus`, takes the new pane id.
3. `pane run <pane>` with ONE fixed command that loads the seat inside the pane shell: it reads `<seat>.token` from the accounts folder
   and exports it as the pane's `CLAUDE_CODE_OAUTH_TOKEN`. The value goes from file to pane environment inside the pane. It is never in
   the script's output, in the maestro's command, or in the herdr command line; the typed text names the file, not the value. Then
   `claude-account status` in the pane (prints the seat name only) and the script reads it back with `pane read` and prints `seat: matches <name>` or fails.
4. `agent start <agent> --kind claude --pane <pane> --timeout 120000 -- --model <opus|sonnet> --name <label> --permission-mode auto`
5. Prints: tab id, pane id, agent name, seat. No secret.
The script holds the only token-file read, by design. I will not read or run it with a real token as the worker: the first live run IS the
end-to-end test, started by the maestro agent (luna) on the throwaway server. The maestro itself can still not read the folder (`*token*` and
`*.config/*` deny stay).
**Risk:** the auto-mode classifier may block a script that reads the accounts folder (the runbook warns about it). If it blocks, I stop and
report. Fallback options, both need Jack: (a) `claude-account use jack` before each start (changes the VPS default; races other starts);
(b) a new `claude-account env <name>` verb (edit of an installed tool, Jack's call). I will not try either on my own.

## 3. Reading the result back and closing the tab
- Brief file: the maestro writes `.digismith/sessions/<agent>/brief.md` (edit rule above). Last line: "write your answer to `.digismith/sessions/<agent>/report.md`".
- Maestro sends one short prompt: `herdr-ws agent prompt <agent> "Read .digismith/sessions/<agent>/brief.md and follow it." --wait`.
- Reads the answer with the read tool from `report.md`; fallback `herdr-ws pane read <pane> --source recent --lines 40`.
- Closes: `herdr-ws agent prompt <agent> "/exit"`, then `herdr-ws tab close <tab>` (the tab id the script printed; tab 1 is already refused by `herdr-ws`).
- Skill `dispatch-worker` (in DGS-169 `.opencode/skills/`) gets a section "Claude agent" with these four steps; the prompt rules (no `| > $ & ;`) stay.

## 4. Test design (throwaway server, spare port, stopped by PID)
- Port: pick from 4213 up, check it is free with a connect test first (4198 live, 4210 to 4212 used before).
- Server: `serve-dgs223.py <port>` (like `serve-terra.py`): cwd = `.worktrees/dgs-223`, config only from `opencode.json` on branch `dgs-223`
  (which has the new edit rule and the wrapper permission) plus `OPENCODE_CONFIG_CONTENT` only if a model must be registered. Password from the file, never printed.
- Permission for the maestro bash: add `HERDR_WS=w2 /Users/workbox/.digismith-depot/bin/start-claude-agent *`: allow. (Needs the installed copy: before the test I
  copy the script to the depot bin with `cp`. This is a new file in a folder I may not own: I ask the maestro first, at the end of the plan approval.)
- Run: ONE ask to agent `maestro` (luna): "Write a 5-line brief for agent dgs-223-probe: list the files in backlog/ that mention DGS-223 (read only).
  Save it under .digismith/sessions/dgs-223-probe/. Start a Claude Code agent dgs-223-probe on seat jack with model opus, ask it to follow the brief, read its
  report, close the tab." (Plain wording, no "do not".)
- Record: each tool call, the seat check line, seconds, luna tokens and cost, the Claude agent's usage from the maestro-requested probe.
- Cleanup: tab closed by the maestro; I check `herdr-ws tab list`, stop the server by PID, check the port free, remove the probe session folder note (keep the report in my board folder).

## 5. Cost estimate
- TokenReply (luna, $0.20 in / $1.20 out / $0.02 cache read per 1M; DGS-169 A3 asks of 9 to 16k input cost $0.003): this test needs about 8 to 12 tool steps,
  input about 12k per step, total about 120k in, 3k out, 100k cache read: about **$0.03 to $0.05**. Hard stop at $0.20; one retry at most (about $0.05).
  If luna fumbles the wrapper, I do not switch to sonnet (about $0.10) without asking.
- Claude side (jack seat, Opus): one tiny job, about 15k tokens in, under 1k out. I ask the maestro for a usage probe BEFORE and AFTER (jack 5h, weekly). Last probe: 5h 29%, weekly 18%.

## 6. Files on branch `dgs-223` (after approval)
`opencode.json` (edit rule, wrapper allow, deny lines), `.opencode/bin/start-claude-agent`, `.opencode/skills/dispatch-worker/SKILL.md` (section Claude agent),
`.opencode/prompts/maestro.md` (the "dispatch nothing" line replaced), and a free permission check script `.opencode/probes/dbg-dispatch.py`. Commits title-only, no push.

## Questions for the maestro (one at a time)
1. Is a wrapper that reads the seat's token file inside the script acceptable (the maestro and I never see the value), or do you prefer fallback (a) or (b)?
2. May I copy the wrapper to `~/.digismith-depot/bin/` for the test (one `cp`), or will you or Jack do it?
