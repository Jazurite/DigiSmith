# Shared OpenCode server safety layer — Implementation Report

Ticket: DGS-223, DGS-226. Date: 2026-10-10. Merged to main as f5152a7 (9 commits), plugin 0.89.0-beta.

## Summary
The shared OpenCode server now runs a three-layer safety layer, the same idea as Claude Code auto mode: ask prompts for herdr-ws change verbs, a reviewer plugin on tool.execute.before (fixed rules, then claude-haiku-5-5 for unclear calls, fail closed, every verdict logged), and the DGS-169 deny rules. The maestro config moved out of the repo root to .opencode/maestro/opencode.json and loads only through OPENCODE_CONFIG, so other OpenCode sessions in the repo keep the default agents.

## What was built
- `.opencode/safety/maestro-safety.js`: one export, active only with OPENCODE_SAFETY=1. Fixed rules block secrets, shell metacharacters, backslashes, paths outside the roots, writes outside the session folders, plain herdr, other workspaces and unknown tools. Writes and herdr-ws change verbs go to the reviewer. A reviewer ask on a herdr-ws change verb goes on to the config prompt; any other ask is a block "needs Jack". Log: ~/.digismith-depot/opencode/verdicts.jsonl (mode 600, redacted).
- `.opencode/maestro/opencode.json`: ask rules for herdr-ws create, start, prompt, run, close, stop, send, wait, rename, focus; denies for claude-accounts and the verdict log.
- `.opencode/safety/start-shared-server.py` (replaced by `opencode-boot`, DGS-334): starts the server detached with OPENCODE_CONFIG and OPENCODE_SAFETY=1, sends one request for the project (plugins load lazily), checks the plugin logged "loaded", else stops the server.
- Tests and tools in `.opencode/safety/`: test-rules.mjs, serve-safety.py (removed, DGS-334), run-steering.py, run-ask.py, run-outage.py, compare-reviewers.mjs, cost.py, verify-live.py, SAFETY.md.

## Tests
50/50 free hook calls; 32/32 model probes with only the plugin guarding; 4 forceful steering briefs on luna and on sonnet, all held; reviewer outage blocks reviewed calls and keeps rule-decided calls; the ask prompt pauses the session until answered; Haiku 10/11 against luna 8/11 on fixed reviewer inputs (all misses over-block). Live check through Tailscale Serve: 401 without auth, 200 with auth, maestro session still listed, a denied probe logged.

## Cost
About $0.19 of the $0.30 cap: luna turns $0.047, sonnet steering test $0.117, reviewer calls about $0.02. Haiku at $0.20 in and $1.00 out per 1M tokens costs about $0.0005 per reviewed call.

## Open items
Sessions without OPENCODE_SAFETY=1 (offload runners, the depot server, Jack's own TUI) are not guarded by the plugin. Never click Always in a prompt (pattern herdr-ws *). A LaunchAgent for reboots is not installed (text in SAFETY.md). The live server still reads the dgs-169 root opencode.json, so the new ask rules apply after a restart from the launcher. The dispatch plan (plan.md: start Claude Code agents from the OpenCode maestro) is on hold.
