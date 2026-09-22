---
name: voice
description: View or change this repo's technical-voice (ASD-STE100 artifact writing, T.1) and conversation-voice (live-conversation response shape, T.5) preferences. Use on explicit request — "what's my voice setting", "turn off technical voice", "enable conversation voice for this repo".
---

# Voice

## Overview

Map item **T.7**. Two independent per-repo on/off switches over standards
already shipped as content: `technical_voice`
(`standards/global/ste100-writing.md`, T.1) and `conversation_voice`
(`standards/global/ai-voice-conversational.md`, T.5). Persisted via the
existing H-lineage preference store (`digismith:preferences`) — no new
store, no named-voice registry (exactly one real standard exists per axis
today).

## Invoked By

Direct user request only, matched against the description above. Not
auto-triggered by another skill's own flow — `digismith:inject-standards`,
`digismith:bootstrap`, and `digismith:adopt` read the same two preference
keys directly in their own steps, rather than invoking this skill.

## Locating `scripts/voice.ts`

Same repo-resolution rule every other skill here uses: is the current
working directory itself the DigiSmith repo (`.claude-plugin/plugin.json`
with `"name": "digismith"`)? Use it directly. Otherwise ask the user for
DigiSmith's repo path this session and remember it. `.digismith/preferences.yml`
itself still lives in the repo currently being worked on — the same
cwd-relative default `digismith:preferences` documents.

## View Mode

No axis/value given:

```bash
node --experimental-strip-types <digismith-repo>/scripts/voice.ts --action status
```

Prints both axes, e.g.:

```
technical-voice: ON (global/ste100-writing)
conversation-voice: OFF
```

Relay this output plainly — don't reformat or summarize it away.

## Set Mode

An axis (`technical` or `conversation`) and a value (`on` or `off`) named:

```bash
node --experimental-strip-types <digismith-repo>/scripts/voice.ts --action set --axis <axis> --value <on|off>
```

**Turning an axis ON:** immediately read the corresponding standard file
(`standards/global/ste100-writing.md` for `technical`,
`standards/global/ai-voice-conversational.md` for `conversation`), plus any
`companions:` listed for it in `standards/index.yml`, and announce it
inline using the same `--- Standard: ... ---` block format
`digismith:inject-standards` Scenario 1 uses. The point is a felt effect
right away, not just at the next `bootstrap`/`inject-standards` trigger.

**Turning an axis OFF:** confirm the change; nothing further to inject.

## Error Handling

| Case | Disposition |
|---|---|
| Unknown axis | `voice.ts` reports it and lists the two valid axes — relay that message, don't guess a fix. |
| Value other than `on`/`off` | Same — relay the script's own error listing valid values. |
| `.digismith/preferences.yml` missing or malformed | Both axes read as `on` (existing store's own missing-key-defaults-safely behavior) — not an error. |

## Quick Reference

| Mode | Command | Effect |
|---|---|---|
| View | `--action status` | Prints both axes' effective state |
| Set | `--action set --axis <axis> --value <on\|off>` | Writes the preference; announces the standard inline when switching an axis on |
