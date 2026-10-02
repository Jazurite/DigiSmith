# The plugin-cache copy of the DigiSmith CLI cannot run (no `node_modules`)

**Status:** Finding, confirmed live. No design yet.

**Source:** Live session 2026-10-02 (Claude desktop-app session "Main", manager mode: one Claude session managed herdr worker agents on EMKT-791 and EMKT-810). Full retro: [manager-mode-retro-2026-10-02.md](manager-mode-retro-2026-10-02.md).

## What's wrong

`node /root/.claude/plugins/cache/jazurite/digismith/<version>/packages/cli/src/index.ts vps status`
fails with `ERR_MODULE_NOT_FOUND: Cannot find package 'yargs'`. The plugin cache has no
`node_modules`. The depot skill says it "always uses the checkout form", but a session that starts
from the plugin's base directory reaches for the cache copy first. The workaround was to run the
same command from `/root/Workspace/Jazurite/DigiSmith`.

## The idea

Either the skill resolves a real checkout (or `~/.digismith-depot/repo`) before it runs the CLI
and says so in its text, or the plugin ships the CLI bundled with its dependencies. Add a clear
error that names the fix when `yargs` is missing.
