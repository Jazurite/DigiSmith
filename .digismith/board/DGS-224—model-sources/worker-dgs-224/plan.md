# Plan: DGS-224, `claude-account` switches the model source (seat or gateway)

Worker `dgs-224`, 2026-10-12 UTC+7 [UTC after]. Tickets: DGS-224 (`14zcebrvcnk`), DGS-409 step 3 (`14zcebrvhfc`).
Read only so far. Nothing outside this folder changed.

## Goal
`claude-account use izanami` makes new shells use Izanami. `claude-account use jack` (or `dev0`) goes back to a seat.
Two kinds of source: **seat** (OAuth token, as today) and **gateway** (base URL + key variable + model map).

## 1. Where the code lives (repo)
```
scripts/claude-account/
  claude-account            the script (bash 3.2 safe; today's 8 KB copy, extended)
  sources.conf              gateway sources, DATA (Izanami first)
  install.sh                mkdir + cp only
  test-claude-account.sh    the tests (run with /bin/bash = 3.2)
  claude-account.test.ts    vitest wrapper: spawns /bin/bash on the test file, so `pnpm test` covers it
```
The first commit adds today's script UNCHANGED, so the diff shows exactly what I changed.

## 2. Data format of a source
`sources.conf`: one `name.field=value` per line, `#` comments. No bash 4 arrays, no code, parsed with `sed`.
```
# kind: gateway. key_var is the NAME of a variable in env_file; the key itself is never stored here.
izanami.kind=gateway
izanami.base_url=https://api.grok.coupons
izanami.key_var=IZANAMI_API_KEY
izanami.env_file=~/.digismith-depot/.env
izanami.model.opus=claude-opus-5-5
izanami.model.sonnet=claude-sonnet-5-5
izanami.model.haiku=claude-sonnet-5-5
```
- Seats are NOT in this file. They stay what they are: `~/.config/claude-accounts/<name>.token`.
- Where it lives: repo `scripts/claude-account/sources.conf`; install copies it to `~/.local/share/claude-account/sources.conf` (not the secrets folder). Override for tests: `CLAUDE_ACCOUNT_SOURCES`.
- Add TokenReply or an Anthropic API key later = one more block, no code (`anthropic.base_url=https://api.anthropic.com`, `key_var=ANTHROPIC_API_KEY`...). Not wired now. One caveat for later: a native Anthropic key wants `ANTHROPIC_API_KEY`, not `ANTHROPIC_AUTH_TOKEN`; I will add an optional `auth_var` field (default `ANTHROPIC_AUTH_TOKEN`) only when that entry comes.
- Model map choice for Izanami: opus -> `claude-opus-5-5`, sonnet -> `claude-sonnet-5-5`, haiku -> `claude-sonnet-5-5` (no Haiku there). Izanami's own setup script maps all three to Sonnet 5.5. I choose Opus 5.5 because `/v1/models` lists it; Jack's first use tests whether his group really gives it. If it does not, he changes one line.
- Names: a gateway name must not equal a seat name (error on `use`/`list`).

## 3. Behaviour
`env` (the line a shell evals; stderr carries errors, stdout carries only shell code):
- **seat** (as today, plus the unsets): `unset ANTHROPIC_BASE_URL ANTHROPIC_AUTH_TOKEN ANTHROPIC_DEFAULT_OPUS_MODEL ANTHROPIC_DEFAULT_SONNET_MODEL ANTHROPIC_DEFAULT_HAIKU_MODEL` then `export CLAUDE_CODE_OAUTH_TOKEN=...`.
- **gateway**: `unset CLAUDE_CODE_OAUTH_TOKEN ANTHROPIC_API_KEY`, then `export ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN` (read from `env_file` at that moment, never stored again), `ANTHROPIC_DEFAULT_OPUS_MODEL`, `_SONNET_MODEL`, `_HAIKU_MODEL`.
- Key missing (file absent, variable absent or empty): stderr `claude-account: izanami: IZANAMI_API_KEY is not set in <path>`, exit 1, **stdout empty** (so `eval "$(... 2>/dev/null)"` changes nothing and the shell keeps Claude Code's stored login).
- No active account, or the active name is unknown: prints nothing, exit 0 (as today).
- I do not unset `ANTHROPIC_MODEL` (Izanami's own script deletes it; I leave the user's variable alone).

`use <name>`: accepts a seat or a gateway. A gateway needs a complete entry (base_url, key_var, the 3 models); `use` does NOT require the key to be present (it tells you if it is missing, as a warning). Text says "New shells and panes will use it".
`list`: one line per source: `* izanami  gateway`, `  jack     seat`. Never a secret (no URL parameters, no key).
`status`: `active account: izanami (gateway)`; `this shell:` compares `ANTHROPIC_BASE_URL` with the source's base URL and says "matches" / "differs (holds ...)" / "no gateway variables; Claude Code uses its stored login". It compares the key silently (match or not) and never prints it. For a seat, today's text plus `(seat)`.
`check izanami`: one `GET <base_url>/v1/models` with the key; prints `HTTP <code>` and the model ids only. The header goes through `curl -K -` (config on stdin), so the key is not in `ps`, not in the output, no `-v`. A failure prints the status code only. `check <seat>` and `check` with no name for a seat: unchanged.
`add`, `adopt`, `rename`, `next`: seats only, unchanged. `next` cycles over seats only (a gateway is never picked by `next`: an accidental pay-per-token switch is worse than none). `rename` refuses a gateway name.
Never writes `~/.claude/settings.json` or any Claude config. The only file `use` writes is `active` (as today).

## 4. State: seat and gateway together
Same `~/.config/claude-accounts/active`, one line, a name. What `use` records: the NAME only. The kind is looked up when needed: `<name>.token` exists = seat; entry in `sources.conf` = gateway. No migration; Jack's existing `active` (`jack`) keeps working.

## 5. What stays identical for seats
`add`, `adopt`, `rename`, `next`, token cleaning, `check <seat>`, the files and modes, the `export CLAUDE_CODE_OAUTH_TOKEN=%q` line. Changes: `env` for a seat gets the `unset` line first; `list` and `status` add the kind word. Test: seat `env` output = old output + the unset line.

## 6. Tests (first, see them fail)
`test-claude-account.sh`, run with `/bin/bash` (3.2.57). TEMP `HOME`, FAKE `.env` (`IZANAMI_API_KEY=fake-key-...`), FAKE token folder (`CLAUDE_ACCOUNTS_DIR`, a fake `sk-ant-oat01-` token, 108 chars). Never the real files.
1. gateway `env` sets the 5 exports with the right values, unsets `CLAUDE_CODE_OAUTH_TOKEN` and `ANTHROPIC_API_KEY`; run through `eval` in a subshell that started with the seat variables set: they are gone.
2. seat `env` unsets every gateway variable and exports the token; the eval'd subshell had gateway variables set: gone.
3. `list` and `status` (seat active, gateway active, both with matching shell variables): output greps clean for the fake token and the fake key.
4. Missing key (no file, no variable, empty value): clear error, exit 1, stdout empty, no secret anywhere in stdout or stderr.
5. `check`: against a local fake HTTP server (python3 `http.server`, 127.0.0.1, random port; no real network): right path, right Bearer header seen by the server, prints the model ids only, grep for the key is clean; a 401 from the server prints the code and no key.
6. `use` accepts a gateway and a seat, rejects an unknown name, rejects a name clash; `next` skips gateways.
7. `install.sh` into a temp `HOME`: backup made with the dated suffix, file copied, `sources.conf` copied, nothing else touched; a second run does not overwrite the first backup.
8. bash 3.2: the whole file runs under `/bin/bash`; one test asserts `/bin/bash --version` is 3.x only as information, not as a failure on other machines.
No Node dependency beyond the vitest wrapper (pnpm only).

## 7. Install and backup
`sh scripts/claude-account/install.sh`: `mkdir -p ~/.local/bin ~/.local/share/claude-account`; if `~/.local/bin/claude-account` exists and `~/.local/bin/claude-account.before-dgs-224-20261012` does not, `cp -p` it to that name; then `cp` the script (chmod 755) and `sources.conf`. `HOME` honoured, so the test runs it in a temp HOME. No sudo, no LaunchAgent, no shell-rc edit. After the merge I run it for real, then only `claude-account list` and `status` (no secret by the tests above). I do not run `use`, `env`, `add` or `check`.

## 8. The `~/.zshrc` proposal (item 6) for Jack to approve and add HIMSELF
One line, after `~/.local/bin` is on PATH:
```
eval "$(claude-account env 2>/dev/null)"
```
What a new zsh does when the line runs:
- **Active account is a seat** (e.g. `jack`): exports that seat's OAuth token. This is a CHANGE for every new shell: today new shells use Claude Code's stored login, after the line they use the token of the active seat. Same account for `jack` if the stored login is the same one; check with `claude-account check jack` in his own terminal.
- **Active account is `izanami`**: unsets the OAuth token and `ANTHROPIC_API_KEY`, exports the Izanami variables. Every new shell, every herdr pane and every agent started from it goes through Izanami until `use jack`.
- **No active account** (no `active` file or empty): prints nothing, the shell is unchanged.
- **Key missing** for the active gateway: prints nothing to stdout, error hidden by `2>/dev/null`, shell unchanged (stored login). A one-time `claude-account status` shows the problem.
- Cost: one bash start per new shell (~tens of ms). Shells already open keep their variables: after `use`, open a new terminal or pane; running agents keep the old source.
- The line is Jack's to add; I never edit `~/.zshrc`. Optional alternative with less reach: no line; Jack runs `eval "$(claude-account env)"` by hand in the one terminal where he wants a source. I recommend the line.

## 9. First use (Jack, own terminal; I write `probe.md`)
1. `claude-account check izanami` (lists models, HTTP 200). 2. `claude-account use izanami`, new terminal, `claude`, `/status` shows `api.grok.coupons`. 3. `/model claude-opus-5-5`, one line. 4. Prompt caching: a second turn plus the Izanami dashboard (cache read tokens). 5. `claude-account use jack`, new terminal, `/status` shows the seat. DGS-224 is NOT set done by me; results go to DGS-409.

## 10. Left out, and why
- TokenReply and Anthropic API key entries: one block each later (needs `auth_var` for Anthropic, see 2). Not trivial enough to wire untested.
- OpenCode provider switch, spend caps, usage readout (DGS-224 open questions): out of this scope.
- VPS copy: out of scope (Mac only).
- Per-agent or per-workspace source: today it is per shell, through `env`.
- Remember to tell Jack: the gateway adds about 500 tokens of its own system prompt (DGS-409), and every prompt goes through their server: no client repos (Emma) on Izanami without his say.

## 11. Steps after approval
Branch `dgs-224` in `.worktrees/dgs-224` from origin/main (fetched 2026-10-12: `b397524`); commit 1 = old script unchanged; tests first; build; Claude whole-branch review; `plan.md` + `report.md` + `report.html` in one commit; rebase, `FORCE_COLOR=1 pnpm test`; merge with hooks 01-03; CLI rebuild not needed (CLI untouched); push; install (backup first); cleanup of my worktree and branch (`mv`, `git worktree remove` without `--force`, `git branch -d`).

## Addendum after approval (conductor, 2026-10-12)
1. Quoting and parsing: every exported value goes through `printf %q`; the depot `.env` is parsed (awk, exact key_var line, optional `export `, quotes, CRLF, control characters refused), never sourced. Tests use a hostile fake key and marker files, under bash and zsh.
2. `env [name]`: `env <name>` configures this shell for that source and never writes `active`. Unknown name: exit 1, empty stdout.
3. Every output shows names, kinds, base URLs and model ids only; the tests grep stdout AND stderr of every command for the fake secrets.
The `~/.zshrc` line (section 8) is NOT approved yet; Jack adds it himself after the Maestro takes it to him.
