# Claude Code's dimmed prompt suggestions look like typed input in `herdr agent read`

**Status:** Finding, confirmed live 3 times. No design yet.

**Source:** Live session 2026-10-02 (Claude desktop-app session "Main", manager mode: one Claude session managed herdr worker agents on EMKT-791 and EMKT-810). Full retro: [manager-mode-retro-2026-10-02.md](manager-mode-retro-2026-10-02.md).

## What's wrong

Claude Code shows a predicted next prompt in dim text in its input box (for example `go with A`,
`yes, continue to section 2`). `herdr agent read --source recent-unwrapped` returns plain text,
so the suggestion looks as if Jack had typed it. The manager checked with `--format ansi`: the
text was wrapped in `ESC[2m` (dim), so nothing had been sent.

## The idea

The manager's read wrapper uses `--format ansi` for the input line and strips dim text, or it
reports "input box: suggestion only". Check whether herdr or Claude Code has an option to turn the
suggestions off for worker sessions.

## Related

[manager-orchestrator-profile.md](manager-orchestrator-profile.md).
