#!/usr/bin/env bash
# Shared regex for detecting AI/assistant attribution in commit messages.
# Sourced by scripts/git-hooks/commit-msg (fires on every commit to this repo)
# and skills/subagent-driven-development/scripts/check-attribution (fires on a
# commit range inside review flows). Edit this one file, not either caller.
export ATTRIBUTION_PATTERN='co-authored-by:.*claude|co-authored-by:.*anthropic|generated with.*claude|generated with.*anthropic|🤖'

# Case-insensitive match against $ATTRIBUTION_PATTERN, locale-independent.
# Git for Windows runs hooks with LC_CTYPE=C.UTF-8, under which GNU grep's -i
# flag fails to case-fold the 4-byte robot-emoji alternative (confirmed live:
# an emoji-only message passes undetected under C.UTF-8, correctly caught
# under C — every other alternative in the pattern is plain ASCII, so C-locale
# matching is correct for the whole pattern, not just the emoji). Forcing
# LC_ALL=C for the match itself sidesteps this regardless of the caller's own
# ambient locale.
# Usage: printf '%s\n' "$text" | attribution_matches
# Prints the matching line(s) to stdout; exits 0 if matched, 1 if not.
attribution_matches() {
  LC_ALL=C grep -iE "$ATTRIBUTION_PATTERN"
}
