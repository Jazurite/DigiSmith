# Inject the conversation voice at session start Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the conversation voice is on, the SessionStart hook prints one extra line with the 11 rule titles of the standard and its path.

**Architecture:** `scripts/voice-init.ts` reads the rule titles from `standards/global/ai-voice-conversational.md` and checks the voice state. `scripts/session-init.ts` loads that function the same way it already loads the voice summary (dynamic import of `voice-init.ts`, optional) and prints the result after the banner.

**Tech Stack:** TypeScript (Node, `--experimental-strip-types`), vitest. Package manager: pnpm only.

## Global Constraints

- Design: `.digismith/board/DGS-679—voice-hook/design.html`.
- The banner format (`formatBanner`) and the technical voice do not change.
- The digest must never change the hook's exit code and must never throw out of `main`: any problem means no line.
- No copied rule text in code: titles are read from the standard file at run time.
- Commit messages: title-only conventional commits, scope `dgs-679`, no AI attribution lines. Never commit to `main`. pnpm only. Run tests with `pnpm vitest run <file>`.

---

### Task 1: Read the rule titles and build the digest

**Files:**
- Modify: `scripts/voice-init.ts`
- Test: `scripts/voice-init.test.ts`

**Interfaces:**
- Consumes: `resolveAllVoices(dir)` and `DEFAULT_DIR` (already imported in `voice-init.ts`); `setVoice` (already imported in the test).
- Produces: `readRuleTitles(standardPath: string): string[]` and `conversationDigest(standardPath: string, dir?: string): Promise<string | null>`, both exported from `scripts/voice-init.ts`.

- [ ] **Step 1: Write the failing tests**

In `scripts/voice-init.test.ts` change the last import line to:

```typescript
import voiceInit, { conversationDigest, readRuleTitles } from "./voice-init.ts";
```

and append this block at the end of the file:

```typescript
const FIXTURE_STANDARD =
  "# Title\n\n## Rules\n\n### 1. Lead with the next action\n\ntext\n\n### 2. Number multi-step tasks\n\ntext\n\n## When to break the rules\n\n### 1. Not a rule title\n";

describe("readRuleTitles", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-rule-titles-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns the numbered headings under ## Rules only", () => {
    const file = path.join(tmpDir, "standard.md");
    fs.writeFileSync(file, FIXTURE_STANDARD);
    expect(readRuleTitles(file)).toEqual(["1. Lead with the next action", "2. Number multi-step tasks"]);
  });

  it("returns an empty list when the file does not exist", () => {
    expect(readRuleTitles(path.join(tmpDir, "missing.md"))).toEqual([]);
  });

  it("finds all 11 rules in the real standard", () => {
    const real = path.resolve(import.meta.dirname, "..", "standards", "global", "ai-voice-conversational.md");
    expect(readRuleTitles(real)).toHaveLength(11);
  });
});

describe("conversationDigest", () => {
  let tmpDir: string;
  let originalCwd: string;
  let standard: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-digest-test-"));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
    standard = path.join(tmpDir, "standard.md");
    fs.writeFileSync(standard, FIXTURE_STANDARD);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("lists the titles and the standard path when the conversation voice is on", async () => {
    const line = await conversationDigest(standard);
    expect(line).toContain("1. Lead with the next action; 2. Number multi-step tasks");
    expect(line).toContain("standards/global/ai-voice-conversational.md");
  });

  it("returns null when the conversation voice is off", async () => {
    setVoice("conversation", "off", ".digismith");
    await expect(conversationDigest(standard)).resolves.toBeNull();
  });

  it("still prints when only the technical voice is off", async () => {
    setVoice("technical", "off", ".digismith");
    await expect(conversationDigest(standard)).resolves.toContain("1. Lead with the next action");
  });

  it("returns null when the standard file is missing", async () => {
    await expect(conversationDigest(path.join(tmpDir, "missing.md"))).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run scripts/voice-init.test.ts`
Expected: FAIL (`readRuleTitles` and `conversationDigest` are not exported).

- [ ] **Step 3: Write the implementation**

Replace the whole content of `scripts/voice-init.ts` with:

```typescript
import * as fs from "node:fs";
import { AXES, resolveAllVoices } from "./voice.ts";
import { DEFAULT_DIR } from "./preferences.ts";

export default async function voiceInit(): Promise<string | null> {
  const state = resolveAllVoices(DEFAULT_DIR);
  const on = AXES.filter((axis) => state[axis] === "on");
  return on.length > 0 ? on.join("+") : null;
}

/** The "### N. title" headings under "## Rules" of the conversation standard; [] when the file is unreadable. */
export function readRuleTitles(standardPath: string): string[] {
  let text: string;
  try {
    text = fs.readFileSync(standardPath, "utf8");
  } catch {
    return [];
  }
  const afterRules = text.split(/^## Rules$/m)[1] ?? "";
  const rulesBody = afterRules.split(/^## /m)[0];
  return [...rulesBody.matchAll(/^### (\d+\. .+)$/gm)].map((match) => match[1].trim());
}

/** One line for the session start: the rule titles of the conversation voice, or null when it is off or unreadable. */
export async function conversationDigest(standardPath: string, dir: string = DEFAULT_DIR): Promise<string | null> {
  if (resolveAllVoices(dir).conversation !== "on") return null;
  const titles = readRuleTitles(standardPath);
  if (titles.length === 0) return null;
  return `DigiSmith conversation voice, every reply this session (rules and examples: standards/global/ai-voice-conversational.md): ${titles.join("; ")}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run scripts/voice-init.test.ts`
Expected: PASS (the three existing tests and the new ones).

- [ ] **Step 5: Commit**

```bash
git add scripts/voice-init.ts scripts/voice-init.test.ts
git commit -m "feat(dgs-679): build the conversation voice digest"
```

---

### Task 2: Print the digest at session start

**Files:**
- Modify: `scripts/session-init.ts` (the `VoiceInitModule` type near line 59, a new function after `loadVoiceSummary`, and `main`)
- Test: `scripts/session-init.test.ts`

**Interfaces:**
- Consumes: `conversationDigest(standardPath)` from Task 1 (an optional named export of `voice-init.ts`); `isFile` and `pathToFileURL` already in `session-init.ts`.
- Produces: `loadVoiceDigest(voiceInitPath: string, standardPath: string): Promise<string | null>`, exported from `scripts/session-init.ts`.

- [ ] **Step 1: Write the failing tests**

In `scripts/session-init.test.ts` add `loadVoiceDigest` to the existing import from `./session-init.ts` (the import that already names `loadVoiceSummary`). Then append this block at the end of the file:

```typescript
describe("loadVoiceDigest", () => {
  let tmpDir: string;
  let voiceInitPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-session-digest-test-"));
    voiceInitPath = path.join(tmpDir, "voice-init.ts");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns null when voice-init.ts doesn't exist", async () => {
    expect(await loadVoiceDigest(voiceInitPath, "std.md")).toBeNull();
  });

  it("returns null when voice-init.ts has no conversationDigest export (an older plugin file)", async () => {
    fs.writeFileSync(voiceInitPath, "export default async function (): Promise<string | null> { return 'x'; }\n");
    expect(await loadVoiceDigest(voiceInitPath, "std.md")).toBeNull();
  });

  it("returns the digest and passes the standard path through", async () => {
    fs.writeFileSync(
      voiceInitPath,
      "export default async function (): Promise<string | null> { return 'x'; }\n" +
        "export async function conversationDigest(p: string): Promise<string | null> { return 'digest for ' + p; }\n",
    );
    expect(await loadVoiceDigest(voiceInitPath, "std.md")).toBe("digest for std.md");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run scripts/session-init.test.ts -t "loadVoiceDigest"`
Expected: FAIL (`loadVoiceDigest` is not exported).

- [ ] **Step 3: Write the implementation**

In `scripts/session-init.ts` replace the type line

```typescript
type VoiceInitModule = { default: () => Promise<string | null> };
```

with:

```typescript
type VoiceInitModule = {
  default: () => Promise<string | null>;
  conversationDigest?: (standardPath: string) => Promise<string | null>;
};
```

Add after the `loadVoiceSummary` function:

```typescript
export async function loadVoiceDigest(voiceInitPath: string, standardPath: string): Promise<string | null> {
  if (!isFile(voiceInitPath)) return null;
  const mod = (await import(pathToFileURL(voiceInitPath).href)) as VoiceInitModule;
  return typeof mod.conversationDigest === "function" ? mod.conversationDigest(standardPath) : null;
}
```

In `main`, inside the existing banner block, replace `if (banner) console.log(banner);` with the block below. The digest prints only when the banner prints (a `.digismith` profile exists): without a profile the hook stays silent, as two existing tests require.

```typescript
    if (banner) {
      console.log(banner);
      try {
        const standardPath = path.join(scriptDir, "..", "standards", "global", "ai-voice-conversational.md");
        const digest = await loadVoiceDigest(path.join(scriptDir, VOICE_INIT_FILENAME), standardPath);
        if (digest) console.log(digest);
      } catch (err) {
        console.error(`session-init: voice digest failed (${(err as Error).message})`);
      }
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run scripts/session-init.test.ts scripts/voice-init.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the hook for real**

Run (in a directory whose `.digismith/config.yml` has a `profile`, such as this repo):

```bash
node --experimental-strip-types scripts/session-init.ts
```

Expected: the existing lines, the banner `DigiSmith: profile=..., voices=technical+conversation`, and then one line starting `DigiSmith conversation voice, every reply this session` that lists 11 numbered titles. Then check the size:

```bash
node --experimental-strip-types scripts/session-init.ts | tail -1 | wc -w
```

Expected: under 150 words.

- [ ] **Step 6: Commit**

```bash
git add scripts/session-init.ts scripts/session-init.test.ts
git commit -m "feat(dgs-679): print the conversation voice digest at session start"
```
