# Voice Selection (T.7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a repo explicitly turn `technical_voice` (ASD-STE100 artifact style, T.1) and `conversation_voice` (live-conversation shape, T.5) on or off independently, persisted per repo, with an immediate felt effect and auto-inclusion at the triggers DigiSmith already has.

**Architecture:** Two new preference keys (`technical_voice`, `conversation_voice`, values `on`/`off`, missing = `on`) in the existing H-lineage store (`.digismith/preferences.yml`, via `digismith:preferences`). A new `scripts/voice.ts` wraps that store with axis-aware get/set and a small CLI. A new `digismith:voice` skill exposes view/set to the user, injecting the corresponding standard inline the moment an axis is switched on. `inject-standards` gains a Voice Gate that auto-includes whichever axis is on, unconditionally, in Scenario 1 only. `bootstrap`/`adopt` gain the same auto-inject at ticket start. `scripts/voice-init.ts` plugs into W.10's already-shipped `SessionStart` hook so every session — ticket, coding, or plain conversation — gets a one-line voice summary in its startup banner.

**Tech Stack:** TypeScript run via `node --experimental-strip-types` (no build step), Vitest for tests, no new dependencies.

**Update (same day, mid-plan):** W-lineage shipped W.10 (`hooks/hooks.json` + `scripts/session-init.ts`, real Claude Code `SessionStart` hook) while this plan was being written. It looks for a sibling `scripts/voice-init.ts` exporting `default (): Promise<string | null>` — missing file or `null` both mean "no voice segment" in its banner, a thrown error is caught non-blockingly. Task 5 below adds that file, closing the design's originally-deferred full-session-coverage gap immediately rather than waiting further.

## Global Constraints

- Every script runs via `node --experimental-strip-types <path>` — no compiled-JS step, matching every existing file under `scripts/`.
- Tests are Vitest, colocated as `<name>.test.ts` next to `<name>.ts`, run via `pnpm test` (root `vitest run`; worktree paths are already excluded in `vitest.config.ts`).
- No YAML library — `.digismith/preferences.yml` stays flat `key: value` text, read/written only through `scripts/preferences.ts`'s existing `getPreference`/`setPreference`.
- Commit messages: conventional-commit title only (`feat(...)`, `docs(...)`, etc.), no body, no AI attribution — matches this repo's own existing commit history.
- A missing or malformed `.digismith/preferences.yml`, or a key that was never set, always reads as `technical_voice`/`conversation_voice` = `on`. Only the literal stored value `off` means off.

---

### Task 1: `scripts/voice.ts` — axis-aware preference wrapper + CLI

**Files:**
- Create: `scripts/voice.ts`
- Test: `scripts/voice.test.ts`

**Interfaces:**
- Consumes: `getPreference(key: string, filePath: string): string | undefined` and `setPreference(key: string, value: string, filePath: string): void` from `scripts/preferences.ts` (already shipped, unchanged).
- Produces (used by Task 2's `digismith:voice` skill and Task 5's `scripts/voice-init.ts`, and referenced by name in Tasks 3-4's SKILL.md prose, though those tasks shell out to the CLI rather than importing): `AXES`, `Axis`, `VoiceValue`, `isAxis(value: string): value is Axis`, `standardForAxis(axis: Axis): string`, `resolveVoice(axis: Axis, filePath: string): VoiceValue`, `resolveAllVoices(filePath: string): Record<Axis, VoiceValue>`, `setVoice(axis: Axis, value: VoiceValue, filePath: string): void`, and a CLI `main()` with actions `status` (default) and `set`. Task 5 specifically imports `AXES` and `resolveAllVoices` directly (not the CLI).

- [ ] **Step 1: Write the failing tests**

Create `scripts/voice.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  AXES,
  isAxis,
  standardForAxis,
  resolveVoice,
  resolveAllVoices,
  setVoice,
  main,
} from "./voice.ts";

describe("AXES / isAxis", () => {
  it("lists exactly the two known axes", () => {
    expect(AXES).toEqual(["technical", "conversation"]);
  });

  it("accepts only the two known axes", () => {
    expect(isAxis("technical")).toBe(true);
    expect(isAxis("conversation")).toBe(true);
    expect(isAxis("emotional")).toBe(false);
    expect(isAxis("")).toBe(false);
  });
});

describe("standardForAxis", () => {
  it("maps technical to ste100-writing", () => {
    expect(standardForAxis("technical")).toBe("global/ste100-writing");
  });

  it("maps conversation to ai-voice-conversational", () => {
    expect(standardForAxis("conversation")).toBe("global/ai-voice-conversational");
  });
});

describe("resolveVoice / resolveAllVoices", () => {
  let tmpDir: string;
  let prefsPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-voice-test-"));
    prefsPath = path.join(tmpDir, "preferences.yml");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("defaults both axes to on when the file doesn't exist", () => {
    expect(resolveVoice("technical", prefsPath)).toBe("on");
    expect(resolveVoice("conversation", prefsPath)).toBe("on");
    expect(resolveAllVoices(prefsPath)).toEqual({ technical: "on", conversation: "on" });
  });

  it("reads an explicit off", () => {
    fs.writeFileSync(prefsPath, "technical_voice: off\n");
    expect(resolveVoice("technical", prefsPath)).toBe("off");
    expect(resolveVoice("conversation", prefsPath)).toBe("on");
  });

  it("reads an explicit on", () => {
    fs.writeFileSync(prefsPath, "conversation_voice: on\n");
    expect(resolveVoice("conversation", prefsPath)).toBe("on");
  });

  it("treats any value other than the literal off as on", () => {
    fs.writeFileSync(prefsPath, "technical_voice: maybe\n");
    expect(resolveVoice("technical", prefsPath)).toBe("on");
  });

  it("keeps the two axes independent", () => {
    fs.writeFileSync(prefsPath, "technical_voice: off\nconversation_voice: off\n");
    expect(resolveAllVoices(prefsPath)).toEqual({ technical: "off", conversation: "off" });
  });
});

describe("setVoice", () => {
  let tmpDir: string;
  let prefsPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-voice-test-"));
    prefsPath = path.join(tmpDir, "preferences.yml");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes technical_voice under its own preference key", () => {
    setVoice("technical", "off", prefsPath);
    expect(fs.readFileSync(prefsPath, "utf8")).toContain("technical_voice: off");
  });

  it("writes conversation_voice under its own preference key, independently", () => {
    setVoice("technical", "off", prefsPath);
    setVoice("conversation", "off", prefsPath);
    const content = fs.readFileSync(prefsPath, "utf8");
    expect(content).toContain("technical_voice: off");
    expect(content).toContain("conversation_voice: off");
  });

  it("round-trips through resolveVoice", () => {
    setVoice("conversation", "off", prefsPath);
    expect(resolveVoice("conversation", prefsPath)).toBe("off");
    setVoice("conversation", "on", prefsPath);
    expect(resolveVoice("conversation", prefsPath)).toBe("on");
  });
});

describe("main (CLI)", () => {
  let tmpDir: string;
  let prefsPath: string;
  let originalArgv: string[];
  let logs: string[];
  let errors: string[];
  let originalLog: typeof console.log;
  let originalError: typeof console.error;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-voice-test-"));
    prefsPath = path.join(tmpDir, "preferences.yml");
    originalArgv = process.argv;
    logs = [];
    errors = [];
    originalLog = console.log;
    originalError = console.error;
    console.log = (msg: string) => logs.push(msg);
    console.error = (msg: string) => errors.push(msg);
  });

  afterEach(() => {
    process.argv = originalArgv;
    console.log = originalLog;
    console.error = originalError;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.exitCode = undefined;
  });

  it("status prints both axes as on by default", () => {
    process.argv = ["node", "voice.ts", "--action", "status", "--path", prefsPath];
    main();
    expect(logs).toEqual([
      "technical-voice: ON (global/ste100-writing)",
      "conversation-voice: ON (global/ai-voice-conversational)",
    ]);
  });

  it("status reflects an off axis with no standard name", () => {
    fs.writeFileSync(prefsPath, "technical_voice: off\n");
    process.argv = ["node", "voice.ts", "--action", "status", "--path", prefsPath];
    main();
    expect(logs[0]).toBe("technical-voice: OFF");
  });

  it("set writes the preference and confirms", () => {
    process.argv = [
      "node", "voice.ts", "--action", "set", "--axis", "technical", "--value", "off", "--path", prefsPath,
    ];
    main();
    expect(logs).toEqual(["voice: set technical=off"]);
    expect(resolveVoice("technical", prefsPath)).toBe("off");
  });

  it("set rejects an unknown axis", () => {
    process.argv = [
      "node", "voice.ts", "--action", "set", "--axis", "emotional", "--value", "off", "--path", prefsPath,
    ];
    main();
    expect(errors[0]).toContain("unknown axis: emotional");
    expect(errors[0]).toContain("technical, conversation");
    expect(process.exitCode).toBe(1);
  });

  it("set rejects an invalid value", () => {
    process.argv = [
      "node", "voice.ts", "--action", "set", "--axis", "technical", "--value", "maybe", "--path", prefsPath,
    ];
    main();
    expect(errors[0]).toContain('invalid value: maybe');
    expect(process.exitCode).toBe(1);
  });

  it("set without required flags fails clearly", () => {
    process.argv = ["node", "voice.ts", "--action", "set", "--path", prefsPath];
    main();
    expect(errors[0]).toContain("failed");
    expect(process.exitCode).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test scripts/voice.test.ts`
Expected: FAIL — `scripts/voice.ts` doesn't exist yet (`Cannot find module`/`ENOENT`-style error).

- [ ] **Step 3: Write the implementation**

Create `scripts/voice.ts`:

```ts
import { getPreference, setPreference, DEFAULT_PREFERENCES_PATH } from "./preferences.ts";
import { parseArgs, requireArgs } from "./cli-args.ts";

export const AXES = ["technical", "conversation"] as const;
export type Axis = (typeof AXES)[number];
export type VoiceValue = "on" | "off";

const AXIS_KEY: Record<Axis, string> = {
  technical: "technical_voice",
  conversation: "conversation_voice",
};

const AXIS_STANDARD: Record<Axis, string> = {
  technical: "global/ste100-writing",
  conversation: "global/ai-voice-conversational",
};

export function isAxis(value: string): value is Axis {
  return (AXES as readonly string[]).includes(value);
}

export function standardForAxis(axis: Axis): string {
  return AXIS_STANDARD[axis];
}

export function resolveVoice(axis: Axis, filePath: string): VoiceValue {
  return getPreference(AXIS_KEY[axis], filePath) === "off" ? "off" : "on";
}

export function resolveAllVoices(filePath: string): Record<Axis, VoiceValue> {
  const result = {} as Record<Axis, VoiceValue>;
  for (const axis of AXES) result[axis] = resolveVoice(axis, filePath);
  return result;
}

export function setVoice(axis: Axis, value: VoiceValue, filePath: string): void {
  setPreference(AXIS_KEY[axis], value, filePath);
}

export function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const filePath = args.path ?? DEFAULT_PREFERENCES_PATH;
  const action = args.action ?? "status";

  switch (action) {
    case "status": {
      for (const axis of AXES) {
        const value = resolveVoice(axis, filePath);
        console.log(
          value === "on"
            ? `${axis}-voice: ON (${standardForAxis(axis)})`
            : `${axis}-voice: OFF`,
        );
      }
      return;
    }
    case "set": {
      try {
        requireArgs(args, ["axis", "value"]);
      } catch (err) {
        console.error(`voice: failed (${(err as Error).message})`);
        process.exitCode = 1;
        return;
      }
      if (!isAxis(args.axis)) {
        console.error(`voice: failed (unknown axis: ${args.axis}; valid axes: ${AXES.join(", ")})`);
        process.exitCode = 1;
        return;
      }
      if (args.value !== "on" && args.value !== "off") {
        console.error(`voice: failed (invalid value: ${args.value}; must be "on" or "off")`);
        process.exitCode = 1;
        return;
      }
      setVoice(args.axis, args.value, filePath);
      console.log(`voice: set ${args.axis}=${args.value}`);
      return;
    }
    default:
      console.error(`voice: failed (unknown action: ${action})`);
      process.exitCode = 1;
  }
}

if (import.meta.filename === process.argv[1]) {
  main();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test scripts/voice.test.ts`
Expected: PASS, all cases green.

- [ ] **Step 5: Commit**

```bash
git add scripts/voice.ts scripts/voice.test.ts
git commit -m "feat(voice): add technical/conversation voice preference wrapper"
```

---

### Task 2: `digismith:voice` skill — view and set, with immediate inline injection

**Files:**
- Create: `skills/voice/SKILL.md`

**Interfaces:**
- Consumes: Task 1's `scripts/voice.ts` CLI (`--action status`, `--action set --axis <axis> --value <on|off>`), and `standards/index.yml`'s existing `global/ste100-writing` and `global/ai-voice-conversational` entries (including their `companions:` lists) for the inline-injection format.
- Produces: nothing another task's code imports — this is a leaf skill invoked directly by the user.

- [ ] **Step 1: Write the skill file**

Create `skills/voice/SKILL.md`:

```markdown
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
```

- [ ] **Step 2: Verify manually**

Run from DigiSmith's own repo root (this worktree):

```bash
node --experimental-strip-types scripts/voice.ts --action status
```

Expected: both axes print `ON` with their standard names (no
`.digismith/preferences.yml` exists yet in this worktree, so both default
on).

```bash
node --experimental-strip-types scripts/voice.ts --action set --axis technical --value off
node --experimental-strip-types scripts/voice.ts --action status
```

Expected: `voice: set technical=off`, then a status line reading
`technical-voice: OFF` and `conversation-voice: ON (...)`.

```bash
node --experimental-strip-types scripts/voice.ts --action set --axis technical --value on
```

Expected: `voice: set technical=on` — restores the default so this
worktree's `.digismith/preferences.yml` doesn't carry a stray override into
the merge. Delete the file if this created it fresh and it now only holds
the default:

```bash
git status --short .digismith/preferences.yml
```

If it shows as untracked and only contains `technical_voice: on`, remove
it — that's a value identical to the unset default, not worth persisting:

```bash
rm -f .digismith/preferences.yml
```

- [ ] **Step 3: Commit**

```bash
git add skills/voice/SKILL.md
git commit -m "feat(voice): add digismith:voice skill for view/set"
```

---

### Task 3: Voice Gate in `inject-standards`

**Files:**
- Modify: `skills/inject-standards/SKILL.md`

**Interfaces:**
- Consumes: the two preference keys `technical_voice`/`conversation_voice` (Task 1's semantics: missing or non-`off` = `on`), and the existing `standards/index.yml` entries `global/ste100-writing` (companions `ste100-word-swaps`, `ste100-use-cases`) and `global/ai-voice-conversational` (no companions).
- Produces: no new exported interface — this is a prose/process change to a skill file other tasks don't call into programmatically.

- [ ] **Step 1: Insert the Voice Gate step**

In `skills/inject-standards/SKILL.md`, immediately after the existing
"### Step 0: Profile Gate" section (ends right before "### Step 1: Check
the Index Exists"), insert:

```markdown
### Step 0.5: Voice Gate

Read `.digismith/preferences.yml`'s `technical_voice` and
`conversation_voice` keys (via `digismith:preferences`' `get` operation, or
`scripts/voice.ts --action status` — either resolves the same values). A
missing or malformed value reads as `on`, same as `digismith:preferences`'
own missing-key disposition — never an error, never a reason to skip this
gate.

Whichever axis reads `on` is auto-included in **Scenario 1 (Conversation)
only** — `technical_voice` → `global/ste100-writing` (with its
`companions:` `ste100-word-swaps` and `ste100-use-cases`, per Step 6's
companion rule), `conversation_voice` → `global/ai-voice-conversational` —
formatted exactly like any other Scenario 1 match (Step 6), but skipping
Step 4's suggestion/confirm prompt entirely for these two: the repo already
decided this explicitly, via `digismith:voice` or its own default, so
re-asking every time defeats the point.

This gate does not apply to Scenarios 2-4. Scenario 4 already excludes
every `kind: prose` entry regardless of this gate (Step 3's prose-exclusion
rule) — both voice entries are `kind: prose`, so Scenario 4 was already
excluding them before this step existed. Scenarios 2 and 3 are unaffected;
this gate is deliberately scoped to Scenario 1 only, where "every live
response" (the `ai-voice-conversational` standard's own persistence rule)
actually applies.
```

- [ ] **Step 2: Update the Quick Reference table**

In the same file's `## Quick Reference` table, insert a new row directly
after the existing `| 0 | Profile gate: ... |` row:

```markdown
| 0.5 | Voice gate: read `technical_voice`/`conversation_voice` (default `on` if unset); whichever is `on` auto-includes in Scenario 1 only, no suggestion prompt |
```

- [ ] **Step 3: Verify manually**

```bash
grep -n "Voice Gate" skills/inject-standards/SKILL.md
```

Expected: one match for the new `### Step 0.5: Voice Gate` heading, and a
second for its Quick Reference row.

- [ ] **Step 4: Commit**

```bash
git add skills/inject-standards/SKILL.md
git commit -m "feat(voice): add Voice Gate to inject-standards Scenario 1"
```

---

### Task 4: Auto-inject in `bootstrap` and `adopt`

**Files:**
- Modify: `skills/bootstrap/SKILL.md`
- Modify: `skills/adopt/SKILL.md`

**Interfaces:**
- Consumes: same two preference keys and the same Scenario-1-style inline announcement format referenced in Task 3.
- Produces: no new exported interface — prose/process change only.

- [ ] **Step 1: Add Step 0.7 to `bootstrap`**

In `skills/bootstrap/SKILL.md`, immediately after the existing "### Step
0.6: Resolve SSH Key Preference" section (ends right before "### Step 1:
Get a Real Ticket"), insert:

```markdown
### Step 0.7: Resolve Voice Preferences

**Only runs when Step 0 falls through to actual ticket work** — same guard
Steps 0.5 and 0.6 already apply.

Otherwise, read `technical_voice` and `conversation_voice` via
`digismith:preferences`' `get` operation (or `scripts/voice.ts --action
status`, which wraps the same read with the same missing-key-defaults-to-
`on` disposition `digismith:preferences` documents). Whichever axis reads
`on` — announce that standard inline, the same `--- Standard: ... ---`
block `digismith:inject-standards` Scenario 1 uses, including any
`companions:` from `standards/index.yml`. This is a plain read-and-
announce, never a prompt: unlike Step 0.6's `ssh_key` (which has no
default and must be asked once), both voice axes default to `on` and need
no first-use question.

This step needs no worktree-propagation step of its own beyond what
sub-step 8 of Step 2 already does — `technical_voice`/`conversation_voice`
live in the same `.digismith/preferences.yml` that sub-step already copies.
```

- [ ] **Step 2: Update `bootstrap`'s Quick Reference table**

In the same file's `## Quick Reference` table, insert a new row directly
after the existing `| 0.6 | ... |` row:

```markdown
| 0.7 | Skipped under the same condition as 0.5/0.6. Otherwise, read `technical_voice`/`conversation_voice` via `digismith:preferences` (default `on` if unset) and announce whichever is `on` inline — no prompt, unlike 0.6 |
```

- [ ] **Step 3: Reference Step 0.7 from `adopt`**

In `skills/adopt/SKILL.md`, immediately after the existing paragraph
"Then run `digismith:bootstrap`'s Step 0.6 exactly — check for a saved
`ssh_key` preference via `digismith:preferences`, asking once if unset. A
declined answer does not stop the flow either, same non-blocking
disposition." (directly before "### Step 3: Get the Ticket and Resolve the
Slug"), insert:

```markdown
Then run `digismith:bootstrap`'s Step 0.7 exactly — read the two voice
preferences and announce whichever is `on` inline. No prompt, so nothing
can be declined here.
```

- [ ] **Step 4: Update `adopt`'s Quick Reference table**

In the same file's `## Quick Reference` table, the existing row (currently
reading `| 2 | Resolve profile and ensure the DigiSmith runtime clone —
run \`digismith:bootstrap\` Step 0, then Step 0.5 (including its \`ticket:
true\` Jira credential check), then Step 0.6 (SSH key preference), exactly
|`) gets `, then Step 0.7 (voice preferences)` appended right before the
trailing `, exactly` — i.e. it reads `..., then Step 0.6 (SSH key
preference), then Step 0.7 (voice preferences), exactly |`.

- [ ] **Step 5: Verify manually**

```bash
grep -n "Step 0.7" skills/bootstrap/SKILL.md skills/adopt/SKILL.md
```

Expected: matches in `bootstrap/SKILL.md` (the new heading + its Quick
Reference row) and in `adopt/SKILL.md` (the new reference paragraph + its
Quick Reference row edit).

- [ ] **Step 6: Commit**

```bash
git add skills/bootstrap/SKILL.md skills/adopt/SKILL.md
git commit -m "feat(voice): auto-inject voice preferences at bootstrap/adopt ticket start"
```

---

### Task 5: `scripts/voice-init.ts` — plug into W.10's `SessionStart` hook

**Files:**
- Create: `scripts/voice-init.ts`
- Test: `scripts/voice-init.test.ts`

**Interfaces:**
- Consumes: Task 1's `AXES` and `resolveAllVoices(filePath: string): Record<Axis, VoiceValue>` from `scripts/voice.ts`, and `DEFAULT_PREFERENCES_PATH` from `scripts/preferences.ts`.
- Produces: a default export matching `scripts/session-init.ts`'s existing `VoiceInitModule` contract (already shipped on `main` as part of W.10): `export default function(): Promise<string | null>`. `session-init.ts` itself is not modified by this task — it already looks for this file by convention (`VOICE_INIT_FILENAME = "voice-init.ts"`, sibling to itself) and silently skips the voice segment of its banner if the file is absent.

- [ ] **Step 1: Write the failing tests**

Create `scripts/voice-init.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { setVoice } from "./voice.ts";
import voiceInit from "./voice-init.ts";

describe("voiceInit", () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-voice-init-test-"));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns both axis names joined when no preferences file exists (both default on)", async () => {
    await expect(voiceInit()).resolves.toBe("technical+conversation");
  });

  it("returns only the on axis when one is turned off", async () => {
    setVoice("technical", "off", ".digismith/preferences.yml");
    await expect(voiceInit()).resolves.toBe("conversation");
  });

  it("returns null when both axes are off", async () => {
    setVoice("technical", "off", ".digismith/preferences.yml");
    setVoice("conversation", "off", ".digismith/preferences.yml");
    await expect(voiceInit()).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test scripts/voice-init.test.ts`
Expected: FAIL — `scripts/voice-init.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `scripts/voice-init.ts`:

```ts
import { AXES, resolveAllVoices } from "./voice.ts";
import { DEFAULT_PREFERENCES_PATH } from "./preferences.ts";

export default async function voiceInit(): Promise<string | null> {
  const state = resolveAllVoices(DEFAULT_PREFERENCES_PATH);
  const on = AXES.filter((axis) => state[axis] === "on");
  return on.length > 0 ? on.join("+") : null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test scripts/voice-init.test.ts`
Expected: PASS, all three cases green.

- [ ] **Step 5: Verify the real `SessionStart` hook picks it up**

From DigiSmith's own repo root (this worktree), simulate what `session-init.ts` does:

```bash
node --experimental-strip-types scripts/session-init.ts
```

Expected: prints `DigiSmith: profile=digismith, voices=technical+conversation` (this worktree's
`.digismith/profile` already reads `digismith`, and no preferences override exists here yet, so
both axes default on).

- [ ] **Step 6: Commit**

```bash
git add scripts/voice-init.ts scripts/voice-init.test.ts
git commit -m "feat(voice): add voice-init.ts for the W.10 SessionStart hook"
```
