# Code Comments

Default to none.

- Add one only when the WHY is genuinely non-obvious — a hidden constraint,
  a workaround, a subtle invariant
- Never reference a ticket key or "the current task" inline (no
  `// EMKT-756: ...` style comments)
- If a WHY needs recording, put it in the PR description, not the code

**Why:** ticket-key comments and over-commenting are AI tells — contributed
to a PR (emma-sleep/shopify-hub#63) being flagged and closed.
