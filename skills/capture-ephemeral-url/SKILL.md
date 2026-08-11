---
name: capture-ephemeral-url
description: Use when a pull request was just created for an Emma Shopify theme repo and its ephemeral-deploy Preview Theme and Theme Editor URLs need to be captured — right after superpowers:finishing-a-development-branch's "push and create PR" option, or when explicitly asked to capture the ephemeral URLs for a given PR.
---

# Capture Ephemeral URL

## Overview

DigiSmith's map item **M**. Waits for Emma's ephemeral-deploy GitHub
Actions check to finish on an open PR, then extracts the Shopify Preview
Theme URL and Theme Editor URL from the `github-actions` bot's PR comment
and reports them. Does not create the PR (that's
`superpowers:finishing-a-development-branch`'s job) and does not write to
JIRA (that's a separate, later map item, **I.1**) — this skill's job ends
at reporting the two URLs.

## When to Use

Right after a PR is pushed and created for an Emma theme repo — typically
immediately following `superpowers:finishing-a-development-branch`'s
"push and create PR" option — or whenever explicitly asked to capture the
ephemeral URLs for a given PR.

## Prerequisites

`gh` CLI installed and authenticated against the account that has access
to the PR's repo. Missing or unauthenticated → stop and say so plainly;
don't fabricate URLs.

## Process

### Step 0: Profile Pre-Check

Check for `.digismith/profile` in the repo the PR was opened in.

**Missing** → unchanged, existing behavior; continue to Step 1.

**Present** → read its one-line content as the active profile name.
Locate DigiSmith's own repo — same rule `digismith:inject-standards`
uses for `standards/`: is the current working directory itself the
DigiSmith repo (`.claude-plugin/plugin.json` with
`"name": "digismith"`)? Use it directly. Otherwise ask the user for
DigiSmith's repo path this session and remember it. Read
`profiles/<name>.yml` there. No matching file → treat as stale; proceed
as if `.digismith/profile` were missing — continue to Step 1.

Otherwise, if that profile's `ephemeral` field is `false`, stop here:
report one line — "skipping ephemeral capture — `<name>` profile" — and
don't poll CI or do anything else in this skill. If `ephemeral` is
`true`, continue to Step 1 exactly as today.

### Step 1: Resolve the Ticket Key

```bash
git branch --show-current
```

Parse `<Key>` from the current branch name, matching the
`<Key>__<slug>` convention (e.g. `EMKT-9001__fix-cart-drawer-padding-mobile`
→ `EMKT-9001` — pattern `^([A-Z]+-\d+)__`). If the branch name doesn't
match, ask directly for the ticket key instead of guessing — it's used
only in the final report, not looked up anywhere.

### Step 2: Identify the PR

```bash
gh pr view --json number -q .number
```

against the current branch. If no PR is found, stop and report that
plainly — don't guess a PR number or wait on a check that may not exist.

### Step 3: Poll the Ephemeral-Deploy Check

Poll for the exact check named
`Continuous Integration / Ephemeral / Comment Ephemeral Information`:

```bash
gh pr checks <PR> --json name,bucket \
  --jq '.[] | select(.name=="Continuous Integration / Ephemeral / Comment Ephemeral Information") | .bucket'
```

Ignore this command's exit code entirely — `gh pr checks` exits non-zero
(`8` while any check is pending; `1` if no checks are reported yet or some
other check has failed) on almost every poll before the deploy finishes,
so a non-zero exit here is normal and does **not** mean the command
failed. Branch only on the `bucket` value the `--jq` filter prints for the
named check. Empty output means the named check hasn't appeared in the
list yet — keep polling.

Poll every ~30–60 seconds, for up to **20 minutes**. Use whatever
background-polling primitive the current session has (e.g. an until-loop
run in the background); a plain sleep-and-recheck loop works too if
nothing more specific is available.

Branch on the returned `bucket` value:
- `pass` → continue to Step 4.
- `fail` or `cancel` → stop; report the failure/cancellation. Don't
  attempt extraction — there's nothing to extract.
- `skipping` → stop; report that the check was skipped.
- `pending`, or no output yet (check hasn't appeared in the list) → keep
  polling.
- 20 minutes elapse with no terminal `bucket` value → stop; report the
  timeout plainly. Don't hang indefinitely.

### Step 4: Extract the URLs

```bash
gh pr view <PR> --json comments \
  --jq '[.comments[] | select(.author.login=="github-actions") | .body | select(contains("Ephemeral Theme Deployed Successfully"))] | last // empty'
```

This filters to `github-actions` comments whose body contains "Ephemeral
Theme Deployed Successfully" and takes the **last** one — i.e. the most
recent deploy comment, not an earlier one left over from a prior push to
the same PR. The trailing `// empty` matters: without it, `last` on an
empty list (no matching comment posted yet) prints the literal text
`null` instead of nothing, which would be mistaken for a malformed
comment body instead of triggering the "not found yet, retry" path below.
Extract both URLs from that comment's body with:

```
Preview Theme:\**\s*(https://\S+?preview_theme_id=\d+)
Customize your Theme:\**\s*(https://\S+?/editor)
```

These anchor on Shopify's own URL structure rather than capturing up to
the next whitespace, so they work even if the comment's raw text has no
space or line break between a URL and the sentence that follows it.

If the check succeeded but no matching comment is found yet, wait up to
an additional 60 seconds and check once more (a brief posting lag is
expected) before giving up.

If a comment is found but **either** regex fails to match — including a
partial match where only one of the two URLs is found — don't fail
silently and don't treat it as partial success; report the raw comment
body so the format drift is visible.

### Step 5: Report

Tell the user the resolved ticket key (if any), the Preview Theme URL,
and the Theme Editor URL. Nothing is written to a file or to JIRA.

## Error Handling

- **`gh` missing or unauthenticated** → stop, say so plainly.
- **Branch doesn't match `<Key>__<slug>`** → ask directly for the ticket
  key.
- **No PR found for the current branch** → stop, report plainly.
- **Check's `bucket` reaches `fail` or `cancel`** → stop, report it, skip
  extraction.
- **Check's `bucket` is `skipping`** → stop, report it, skip extraction.
- **20-minute timeout with no terminal `bucket` value** → stop, report
  the timeout.
- **Check passed but comment not found after the retry** → report "check
  passed but comment not found."
- **Comment found but either URL regex fails to match (including a
  partial match with only one URL found)** → report the raw comment
  body.
- **Active profile has `ephemeral: false`** → stop at Step 0, report one
  line, don't poll CI or attempt extraction.

## Quick Reference

| Step | Action |
|---|---|
| 0 | Profile pre-check: `.digismith/profile` present and its `ephemeral` is `false` → report one line and stop; otherwise (missing, stale, or `ephemeral: true`) continue |
| 1 | Resolve `<Key>` from branch name; ask if it doesn't match |
| 2 | `gh pr view --json number` for the current branch; stop if none found |
| 3 | Poll `gh pr checks` for the named check's `bucket` (ignore its exit code), ~30–60s interval, 20-min timeout |
| 4 | Fetch PR comments, take the most recent `github-actions` deploy comment, extract both URLs via the anchored regexes; fall back to raw body if either regex fails to match |
| 5 | Report both URLs (and the ticket key, if resolved) — no file write, no JIRA |
