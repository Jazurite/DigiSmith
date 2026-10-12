# DGS-224 report: claude-account switches the model source (seat or gateway)

Status: built, reviewed, merged. Ticket line: DGS-224. First use is Jack's (see probe.md); DGS-224 is not set done.

## Summary
`claude-account` now has two kinds of source. A seat is an OAuth token, as before. A gateway is data in `sources.conf`: base URL, the NAME of the key variable, the env file, and a model map. Izanami is the first entry (opus `claude-opus-5-5`, sonnet and haiku `claude-sonnet-5-5`). `claude-account use izanami` makes the next shell use Izanami; `use jack` goes back. The tool now lives in the repo at `scripts/claude-account/` with `install.sh` (mkdir and cp, dated backup of the old file).

## Built
- `env [name]`: a gateway unsets `CLAUDE_CODE_OAUTH_TOKEN` and `ANTHROPIC_API_KEY` and exports `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN` (read from the env file when `env` runs, never stored) and the three `ANTHROPIC_DEFAULT_*_MODEL`. A seat unsets those five and exports the token as before. `env <name>` never writes the `active` file. Unknown name or missing key: exit 1, empty stdout.
- Safe parsing: all values go through `printf %q`; the depot `.env` is parsed with awk (exact key line, `export `, quotes, CRLF, trailing text, control characters refused) and never sourced.
- `list` and `status` show the kind. `check izanami` is one `GET /v1/models`, key to curl on stdin, prints the status and model ids only. `next` skips gateways. `add` and `rename` refuse a gateway name. `use` warns when the key is missing.
- Per shell only: nothing writes `~/.claude/settings.json` or any other Claude config.
- Left out: TokenReply and Anthropic key entries (one block each later; Anthropic needs an `auth_var` field), spend caps, OpenCode switch, the VPS copy, the `~/.zshrc` line (Jack's file, not approved yet).

## Tests (written first, seen to fail: 57 of 91 failed)
`test-claude-account.sh` (97 checks, run with `/bin/bash` 3.2.57; also zsh for the eval checks), wrapped by `claude-account.test.ts` so `pnpm test` runs it. Temp HOME, fake `.env`, fake token folder, local fake HTTP server. Hostile fake key (space, quotes, dollar, backticks, semicolon, command substitutions): exact value after eval, marker files absent. `list`, `status`, `use`, `check` and every error: stdout and stderr grepped for the fake token and key.

## Review
Claude whole-branch review (subagent): no secret leak, injection or bash 3.2 break. Verified and fixed with tests: `status` with a stale `active` name said "seat"; `add`/`adopt` could create a name clash with a gateway (then `list` and `env` died); the `.env` parser kept trailing spaces and a trailing comment after a quoted value; `install.sh` overwrote local edits of `sources.conf` without a backup. Not changed: `read -t 0.5` in `add` fails on bash 3.2 (old code, unchanged, not a regression); the RETURN trap leaves nothing secret.

## Next
The conductor will switch its dispatch routine from `claude-account use <seat>` plus eval to `eval "$(claude-account env <seat>)"` after this merge, so a worker start never touches Jack's chosen default. Jack's first use: probe.md. The `~/.zshrc` line: `eval "$(claude-account env 2>/dev/null)"`, Jack adds it himself after approval.
