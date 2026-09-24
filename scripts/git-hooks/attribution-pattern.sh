#!/usr/bin/env bash
# Shared regex for detecting AI/assistant attribution in commit messages.
# Sourced by scripts/git-hooks/commit-msg (fires on every commit to this repo)
# and skills/subagent-driven-development/scripts/check-attribution (fires on a
# commit range inside review flows). Edit this one file, not either caller.
export ATTRIBUTION_PATTERN='co-authored-by:.*claude|co-authored-by:.*anthropic|generated with.*claude|generated with.*anthropic|🤖'
