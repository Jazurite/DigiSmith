# Real Claude Code SessionStart Hook to Init DigiSmith (W.10) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Claude Code plugin-bundled `SessionStart` hook that prints a terse "DigiSmith active" banner (repo profile + any active voice) into every session's context, closing the gap where a plain conversation with no ticket/task never sees DigiSmith at all.

**Architecture:** A `hooks/hooks.json` manifest at the plugin root registers a `SessionStart` command hook that runs `scripts/session-init.ts` via `node --experimental-strip-types`. The script reads `.digismith/profile` from the invoking session's cwd; if present, it also checks for `scripts/voice-init.ts` next to itself and, if that file exists, dynamically imports its default export (`() => Promise<string | null>`) to fold a voice summary into the same banner line. No `.digismith/profile` → silent exit, no output.

**Tech Stack:** TypeScript (`node --experimental-strip-types`, no build step — matches `.digismith/hooks/post-finish/scripts/*.ts`), Vitest, Node built-ins only (`node:fs`, `node:path`, `node:url`).

## Global Constraints

- Script language: TypeScript, run via `node --experimental-strip-types`, no compiled `dist/` — matches every other DigiSmith hook/script (`scripts/preferences.ts`, `.digismith/hooks/post-finish/scripts/*.ts`).
- Entry-point guard: `import.meta.filename === process.argv[1]` (the corrected form from map item I.5 — never the old, Windows-broken `import.meta.url === \`file://${process.argv[1]}\`` pattern).
- **Cross-lineage contract, frozen by this plan:** a future `voice-init.ts` placed at `scripts/voice-init.ts` (plugin root) must have a default export of type `() => Promise<string | null>`. Returning `null` means "no voice summary to show" and is treated identically to the file not existing at all. Any thrown error propagates up through `session-init.ts`'s own top-level try/catch as a non-blocking stderr warning. This file is NOT created by this plan — `digismith:voice`'s own future build owns it.
- Missing `.digismith/profile` is always silently benign (exit 0, no stdout, no stderr). This is the common case across most sessions a Jack-wide plugin install touches.
- Any other unexpected error (a real fs error reading `.digismith/profile`, or `voice-init.ts` existing but throwing) prints one line to stderr (`session-init: failed (<message>)`) and sets a non-zero exit code — never blocking, since `SessionStart` hooks can't block session start regardless of exit code.

---

## Task 1: session-init script + SessionStart hook wiring

**Files:**
- Create: `scripts/session-init.ts`
- Create: `scripts/session-init.test.ts`
- Create: `hooks/hooks.json`

**Interfaces:**
- Consumes: nothing from earlier tasks (first and only task).
- Produces (for any future task/feature, including `digismith:voice`'s own build):
  - `DEFAULT_PROFILE_PATH: string` — `".digismith/profile"`
  - `VOICE_INIT_FILENAME: string` — `"voice-init.ts"`
  - `readProfile(filePath: string): string | undefined`
  - `loadVoiceSummary(voiceInitPath: string): Promise<string | null>`
  - `formatBanner(profile: string, voiceSummary: string | null): string`
  - `buildBanner(profilePath: string, voiceInitPath: string): Promise<string | null>`
  - `main(): Promise<void>`

### readProfile

- [ ] **Step 1: Write the failing tests**

Create `scripts/session-init.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  DEFAULT_PROFILE_PATH,
  VOICE_INIT_FILENAME,
  readProfile,
} from "./session-init.ts";

describe("constants", () => {
  it("locks the documented default profile path", () => {
    expect(DEFAULT_PROFILE_PATH).toBe(".digismith/profile");
  });

  it("locks the documented voice-init filename", () => {
    expect(VOICE_INIT_FILENAME).toBe("voice-init.ts");
  });
});

describe("readProfile", () => {
  let tmpDir: string;
  let profilePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-session-init-test-"));
    profilePath = path.join(tmpDir, "profile");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns undefined for a missing file", () => {
    expect(readProfile(profilePath)).toBeUndefined();
  });

  it("returns the trimmed content of an existing file", () => {
    fs.writeFileSync(profilePath, "emma\n");
    expect(readProfile(profilePath)).toBe("emma");
  });

  it("returns undefined for a whitespace-only file", () => {
    fs.writeFileSync(profilePath, "   \n");
    expect(readProfile(profilePath)).toBeUndefined();
  });

  it("throws on a genuine read error other than a missing file", () => {
    fs.writeFileSync(profilePath, Buffer.from([0xff, 0xfe]));
    expect(() => readProfile(profilePath)).toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run scripts/session-init.test.ts`
Expected: FAIL — `scripts/session-init.ts` doesn't exist yet (`Cannot find module`/`ENOENT`).

- [ ] **Step 3: Write the minimal implementation**

Create `scripts/session-init.ts`:

```typescript
import * as fs from "node:fs";

export const DEFAULT_PROFILE_PATH = ".digismith/profile";
export const VOICE_INIT_FILENAME = "voice-init.ts";

export function readProfile(filePath: string): string | undefined {
  let raw: Buffer;
  try {
    raw = fs.readFileSync(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
  const content = new TextDecoder("utf-8", { fatal: true }).decode(raw).trim();
  return content || undefined;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run scripts/session-init.test.ts`
Expected: PASS (6 tests)

### loadVoiceSummary

- [ ] **Step 5: Write the failing tests**

Append below the `readProfile` describe block in `scripts/session-init.test.ts`:

```typescript
describe("loadVoiceSummary", () => {
  let tmpDir: string;
  let voiceInitPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-session-init-test-"));
    voiceInitPath = path.join(tmpDir, "voice-init.ts");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns null when voice-init.ts doesn't exist", async () => {
    expect(await loadVoiceSummary(voiceInitPath)).toBeNull();
  });

  it("returns the resolved string from a real voice-init.ts default export", async () => {
    fs.writeFileSync(
      voiceInitPath,
      "export default async function (): Promise<string | null> { return 'conversational'; }\n",
    );
    expect(await loadVoiceSummary(voiceInitPath)).toBe("conversational");
  });

  it("returns null when the default export itself resolves null", async () => {
    fs.writeFileSync(voiceInitPath, "export default async function (): Promise<string | null> { return null; }\n");
    expect(await loadVoiceSummary(voiceInitPath)).toBeNull();
  });

  it("propagates an error when the default export throws", async () => {
    fs.writeFileSync(
      voiceInitPath,
      "export default async function (): Promise<string | null> { throw new Error('boom'); }\n",
    );
    await expect(loadVoiceSummary(voiceInitPath)).rejects.toThrow("boom");
  });
});
```

Update the import from `./session-init.ts` to include `loadVoiceSummary`:

```typescript
import {
  DEFAULT_PROFILE_PATH,
  VOICE_INIT_FILENAME,
  readProfile,
  loadVoiceSummary,
} from "./session-init.ts";
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `pnpm exec vitest run scripts/session-init.test.ts`
Expected: FAIL — `loadVoiceSummary` is not exported yet.

- [ ] **Step 7: Write the minimal implementation**

Add to `scripts/session-init.ts` (below `readProfile`):

```typescript
import { pathToFileURL } from "node:url";

type VoiceInitModule = { default: () => Promise<string | null> };

function isFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

export async function loadVoiceSummary(voiceInitPath: string): Promise<string | null> {
  if (!isFile(voiceInitPath)) return null;
  const mod = (await import(pathToFileURL(voiceInitPath).href)) as VoiceInitModule;
  return mod.default();
}
```

(Add the `import { pathToFileURL } from "node:url";` line alongside the existing `import * as fs from "node:fs";` at the top of the file, not inline where shown above.)

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm exec vitest run scripts/session-init.test.ts`
Expected: PASS (10 tests)

### formatBanner

- [ ] **Step 9: Write the failing tests**

Append to `scripts/session-init.test.ts`, and add `formatBanner` to the import block:

```typescript
describe("formatBanner", () => {
  it("formats profile only when there's no voice summary", () => {
    expect(formatBanner("emma", null)).toBe("DigiSmith: profile=emma");
  });

  it("appends the voice summary when present", () => {
    expect(formatBanner("emma", "conversational")).toBe("DigiSmith: profile=emma, voices=conversational");
  });
});
```

- [ ] **Step 10: Run the tests to verify they fail**

Run: `pnpm exec vitest run scripts/session-init.test.ts`
Expected: FAIL — `formatBanner` is not exported yet.

- [ ] **Step 11: Write the minimal implementation**

Add to `scripts/session-init.ts`:

```typescript
export function formatBanner(profile: string, voiceSummary: string | null): string {
  const parts = [`profile=${profile}`];
  if (voiceSummary) parts.push(`voices=${voiceSummary}`);
  return `DigiSmith: ${parts.join(", ")}`;
}
```

- [ ] **Step 12: Run the tests to verify they pass**

Run: `pnpm exec vitest run scripts/session-init.test.ts`
Expected: PASS (12 tests)

### buildBanner

- [ ] **Step 13: Write the failing tests**

Append to `scripts/session-init.test.ts`, and add `buildBanner` to the import block:

```typescript
describe("buildBanner", () => {
  let tmpDir: string;
  let profilePath: string;
  let voiceInitPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-session-init-test-"));
    profilePath = path.join(tmpDir, "profile");
    voiceInitPath = path.join(tmpDir, "voice-init.ts");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns null when there's no profile", async () => {
    expect(await buildBanner(profilePath, voiceInitPath)).toBeNull();
  });

  it("returns the profile-only banner when voice-init.ts doesn't exist", async () => {
    fs.writeFileSync(profilePath, "emma\n");
    expect(await buildBanner(profilePath, voiceInitPath)).toBe("DigiSmith: profile=emma");
  });

  it("includes the voice summary when voice-init.ts resolves one", async () => {
    fs.writeFileSync(profilePath, "emma\n");
    fs.writeFileSync(
      voiceInitPath,
      "export default async function (): Promise<string | null> { return 'conversational'; }\n",
    );
    expect(await buildBanner(profilePath, voiceInitPath)).toBe("DigiSmith: profile=emma, voices=conversational");
  });
});
```

- [ ] **Step 14: Run the tests to verify they fail**

Run: `pnpm exec vitest run scripts/session-init.test.ts`
Expected: FAIL — `buildBanner` is not exported yet.

- [ ] **Step 15: Write the minimal implementation**

Add to `scripts/session-init.ts`:

```typescript
export async function buildBanner(profilePath: string, voiceInitPath: string): Promise<string | null> {
  const profile = readProfile(profilePath);
  if (profile === undefined) return null;
  const voiceSummary = await loadVoiceSummary(voiceInitPath);
  return formatBanner(profile, voiceSummary);
}
```

- [ ] **Step 16: Run the tests to verify they pass**

Run: `pnpm exec vitest run scripts/session-init.test.ts`
Expected: PASS (15 tests)

### main (CLI entry point)

- [ ] **Step 17: Write the failing tests**

Append to `scripts/session-init.test.ts`, and add `main` to the import block:

```typescript
describe("main (CLI)", () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-session-init-test-"));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.exitCode = 0;
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("prints nothing when there's no .digismith/profile", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await main();

    expect(logSpy).not.toHaveBeenCalled();
  });

  it("prints the profile-only banner when .digismith/profile exists (the real scripts/voice-init.ts doesn't exist yet)", async () => {
    fs.mkdirSync(path.join(tmpDir, ".digismith"));
    fs.writeFileSync(path.join(tmpDir, ".digismith", "profile"), "emma\n");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await main();

    expect(logSpy).toHaveBeenCalledWith("DigiSmith: profile=emma");
  });

  it("surfaces a stderr warning and a non-zero exit code on an unexpected read error", async () => {
    fs.mkdirSync(path.join(tmpDir, ".digismith"));
    fs.writeFileSync(path.join(tmpDir, ".digismith", "profile"), Buffer.from([0xff, 0xfe]));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await main();

    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("session-init: failed"));
  });
});
```

- [ ] **Step 18: Run the tests to verify they fail**

Run: `pnpm exec vitest run scripts/session-init.test.ts`
Expected: FAIL — `main` is not exported yet.

- [ ] **Step 19: Write the minimal implementation**

Add to `scripts/session-init.ts`:

```typescript
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export async function main(): Promise<void> {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  try {
    const banner = await buildBanner(
      path.join(process.cwd(), DEFAULT_PROFILE_PATH),
      path.join(scriptDir, VOICE_INIT_FILENAME),
    );
    if (banner) console.log(banner);
  } catch (err) {
    console.error(`session-init: failed (${(err as Error).message})`);
    process.exitCode = 1;
  }
}

if (import.meta.filename === process.argv[1]) {
  await main();
}
```

(Add the `import * as path from "node:path";` and `import { fileURLToPath } from "node:url";` lines alongside the other imports at the top of the file — `path` is new, `pathToFileURL` from `node:url` is already imported from Step 7, so extend that line to `import { fileURLToPath, pathToFileURL } from "node:url";` instead of adding a second `node:url` import.)

- [ ] **Step 20: Run the tests to verify they pass**

Run: `pnpm exec vitest run scripts/session-init.test.ts`
Expected: PASS (18 tests)

### Hook wiring and final checks

- [ ] **Step 21: Create the hooks manifest**

Create `hooks/hooks.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node --experimental-strip-types \"${CLAUDE_PLUGIN_ROOT}/scripts/session-init.ts\""
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 22: Run the full test suite to confirm no regressions**

Run: `pnpm test`
Expected: PASS — all pre-existing tests plus the 18 new ones in `scripts/session-init.test.ts` (approx. 407 total).

- [ ] **Step 23: Commit**

```bash
git add scripts/session-init.ts scripts/session-init.test.ts hooks/hooks.json
git commit -m "feat(session-init): SessionStart hook to init DigiSmith (W.10)"
```
