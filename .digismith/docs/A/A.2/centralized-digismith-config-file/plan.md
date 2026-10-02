# Centralized DigiSmith Config File Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put every per-folder DigiSmith setting into one `.digismith/config.yml`, read by one shared reader that falls back to the old `.digismith/profile` and `.digismith/preferences.yml`.

**Architecture:** Three new modules in `scripts/`. `config-parse.ts` parses a small YAML subset with no library. `config-write.ts` edits the file text in place. `config.ts` reads layers (the new file, then the old files), writes atomically, guards writes in worktrees and tracked checkouts, migrates the old files, and has a CLI. `preferences.ts` becomes a thin wrapper that maps bare preference keys to `preferences.<key>`. The hook, `model_offload.ts`, and 12 skills move onto the new reader.

**Tech Stack:** TypeScript run with `node --experimental-strip-types`, Vitest, pnpm. No runtime dependencies.

**Design:** `.digismith/docs/A/A.2/centralized-digismith-config-file/design.html` (approved at `4a041aa`).

## Global Constraints

- No runtime dependencies. Only `node:` built-ins. The plugin cache has no `node_modules`.
- Scripts run with `node --experimental-strip-types`. Use only erasable TypeScript: no `enum`, no `namespace`, no parameter properties (`constructor(public x)`).
- File: `.digismith/config.yml`. Top level holds only the identity keys `profile` and `role`. Preference keys live under the `preferences:` heading, addressed as `preferences.<key>`.
- Keys match `[a-z0-9_]+`. Section keys are indented exactly 2 spaces. Array items are indented 2 spaces (top level) or 4 spaces (in a section). Every value is a string.
- Parse errors read `<file> line <n>: <reason>`. Read errors on invalid UTF-8 read `<file>: not valid UTF-8`.
- New-file header, verbatim: `# DigiSmith config for this checkout. Edit by hand or through digismith:preferences.`
- Migration commit message, verbatim: `chore(config): migrate to .digismith/config.yml`
- Presence sentence, verbatim: ``A profile is present when `.digismith/config.yml` has a `profile` key, or when `.digismith/profile` exists (A.2 fallback).``
- Read sentence, verbatim: ``Read `profile` from `.digismith/config.yml`, or from `.digismith/profile` when `config.yml` or its `profile` key is missing (A.2 fallback).``
- The string `(A.2 fallback)` appears in skills only inside those two sentences.
- Commits: title-only conventional commits. No body. No `Co-Authored-By` or any other AI attribution.
- Never delete a user file. Old files move aside to `*.migrated`.
- Test baseline at `a9fc18e`: 587 tests, 585 pass, 2 fail (DGS-117): `packages/cli/src/depot/process-lifecycle.test.ts` › "starts a real process, tracks its confirmed PID and port, reuses it, then stops it", and `packages/cli/src/index.e2e.test.ts` › "--help exits 0 with a single Usage line and a properly-closed colorized Domains header". Done means no other failure, and every new and changed test passes.

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `scripts/config-parse.ts` | Create | YAML-subset parser: `parseConfig`, `parseConfigDocument`, `splitConfigLines`, `ConfigError`, `KEY_PATTERN` |
| `scripts/config-parse.test.ts` | Create | Parser tests |
| `scripts/config-write.ts` | Create | Text edits: `HEADER`, `splitKey`, `formatScalar`, `setInText`, `clearInText` |
| `scripts/config-write.test.ts` | Create | Writer tests |
| `scripts/config.ts` | Create | Layers, `resolve`, git checks, `migrate`, `setKey`/`clearKey`, CLI |
| `scripts/config.test.ts` | Create | Reader, migrate, write-guard, CLI and repo-migration tests |
| `scripts/preferences.ts` | Rewrite | Wrapper: bare key → `preferences.<key>` |
| `scripts/preferences.test.ts` | Rewrite | Wrapper tests |
| `scripts/voice.ts`, `scripts/voice-init.ts` | Modify | Read through the `.digismith` folder |
| `scripts/voice.test.ts`, `scripts/voice-init.test.ts` | Modify | `--dir`, config file layout |
| `scripts/session-init.ts` (+ test) | Modify | Profile through `resolve`, warning on `ConfigError` |
| `scripts/model_offload.ts` (+ test) | Modify | Profile through `resolve`, `--dir` |
| `scripts/toolchain.ts` | Modify | One stale comment only |
| 12 `skills/*/SKILL.md`, `README.md` | Modify | Profile rules, copy step, migrate check, storage docs |
| `.digismith/config.yml`, `.digismith/profile`, `.digismith/preferences.yml` | Unchanged | DigiSmith's own repo migrates in the follow-up ticket DGS-142; this branch keeps reading through the fallback |

Task order matters within each group, but this branch never migrates DigiSmith's own repo (see Rollout note) — that move is DGS-142's job.

---

### Task 1: YAML-subset parser

**Files:**
- Create: `scripts/config-parse.ts`
- Test: `scripts/config-parse.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type ConfigValue = string | string[]`
  - `class ConfigError extends Error` (name `"ConfigError"`, message is user-facing)
  - `type ConfigEntry = { key: string; line: number; lastLine: number; comment: string; isArray: boolean }` (0-based line indexes; `lastLine` is the last item line of an array; `comment` is the inline comment with its leading spaces, or `""`)
  - `type ConfigSection = { name: string; line: number; lastLine: number }`
  - `type ConfigDocument = { lines: string[]; values: Map<string, ConfigValue>; entries: Map<string, ConfigEntry>; sections: Map<string, ConfigSection> }`
  - `const KEY_PATTERN: RegExp` (`/^[a-z0-9_]+$/`)
  - `splitConfigLines(text: string): string[]` (removes a leading BOM, a trailing CR per line, and the final empty line)
  - `parseConfigDocument(text: string, label = "config.yml"): ConfigDocument`
  - `parseConfig(text: string, label = "config.yml"): Map<string, ConfigValue>`

- [ ] **Step 1: Write the failing tests**

Create `scripts/config-parse.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ConfigError, parseConfig, parseConfigDocument, splitConfigLines } from "./config-parse.ts";

function errorOf(text: string): string {
  try {
    parseConfig(text);
  } catch (err) {
    expect(err).toBeInstanceOf(ConfigError);
    return (err as Error).message;
  }
  throw new Error("expected a ConfigError");
}

describe("parseConfig: valid input", () => {
  it("reads top-level keys and ignores blank lines and comments", () => {
    expect(parseConfig("# header\n\nprofile: digismith\nrole: worker\n")).toEqual(
      new Map([
        ["profile", "digismith"],
        ["role", "worker"],
      ]),
    );
  });

  it("reads keys under a heading as heading.key", () => {
    expect(parseConfig("preferences:\n  finish_option: merge_locally\n  ssh_key: /k\n")).toEqual(
      new Map([
        ["preferences.finish_option", "merge_locally"],
        ["preferences.ssh_key", "/k"],
      ]),
    );
  });

  it("reads a top-level array with 2-space items", () => {
    expect(parseConfig("urls:\n  - https://a.com\n  - b\n")).toEqual(new Map([["urls", ["https://a.com", "b"]]]));
  });

  it("reads an array inside a section with 4-space items", () => {
    expect(parseConfig("maestro:\n  poll: 60\n  sessions:\n    - DigiSmith\n    - emma\n  after: x\n")).toEqual(
      new Map<string, string | string[]>([
        ["maestro.poll", "60"],
        ["maestro.sessions", ["DigiSmith", "emma"]],
        ["maestro.after", "x"],
      ]),
    );
  });

  it("keeps every value a string", () => {
    expect(parseConfig("a: no\nb: 08\nc: true\n")).toEqual(
      new Map([
        ["a", "no"],
        ["b", "08"],
        ["c", "true"],
      ]),
    );
  });

  it("strips an inline comment that starts with space-hash", () => {
    expect(parseConfig("a: merge_locally   # note\n").get("a")).toBe("merge_locally");
  });

  it("keeps a # with no space before it", () => {
    expect(parseConfig("url: https://x.com/#a\n").get("url")).toBe("https://x.com/#a");
  });

  it("unwraps double and single quotes", () => {
    expect(parseConfig("a: \"x\"\nb: 'y'\n")).toEqual(
      new Map([
        ["a", "x"],
        ["b", "y"],
      ]),
    );
  });

  it("keeps space-hash inside quotes and strips the comment after them", () => {
    expect(parseConfig('a: "x # y"  # real\n').get("a")).toBe("x # y");
  });

  it("treats a backslash as a literal character", () => {
    expect(parseConfig(String.raw`a: "c:\temp\n"` + "\n").get("a")).toBe(String.raw`c:\temp\n`);
  });

  it("reads a quoted empty string as a value, not a heading", () => {
    expect(parseConfig('a: ""\n').get("a")).toBe("");
  });

  it("strips a trailing CR on each line", () => {
    expect(parseConfig("a: x\r\nb: y\r\n")).toEqual(
      new Map([
        ["a", "x"],
        ["b", "y"],
      ]),
    );
  });

  it("ignores a leading UTF-8 BOM", () => {
    expect(parseConfig("\uFEFFa: x\n").get("a")).toBe("x");
  });

  it("accepts text with no trailing newline", () => {
    expect(parseConfig("a: x").get("a")).toBe("x");
  });

  it("returns an empty map for empty text", () => {
    expect(parseConfig("")).toEqual(new Map());
  });

  it("reads today's flat preferences.yml unchanged", () => {
    const text =
      "# DigiSmith-managed. Settings decided through live interaction, not hand-authored.\nfinish_option: merge_locally\nclear_context: no\nssh_key: /root/.ssh/jazurite_github\n";
    expect(parseConfig(text)).toEqual(
      new Map([
        ["finish_option", "merge_locally"],
        ["clear_context", "no"],
        ["ssh_key", "/root/.ssh/jazurite_github"],
      ]),
    );
  });
});

describe("parseConfig: errors", () => {
  it.each([
    ["s:\n\tk: v\n", "config.yml line 2: tab in indentation; use spaces"],
    ["s:\n  k:\n    j: v\n", "config.yml line 3: a second level of headings is not supported"],
    ["  k: v\n", "config.yml line 1: indented line with no heading above it"],
    ["urls:\n- a\n", "config.yml line 2: array items must be indented 2 spaces"],
    ["s:\n  urls:\n  - a\n", "config.yml line 3: array items must be indented 4 spaces"],
    ["s:\nt: v\n", "config.yml line 1: 's:' has no value and no indented lines under it"],
    ["s:\n", "config.yml line 1: 's:' has no value and no indented lines under it"],
    ["s:\n   k: v\n", "config.yml line 2: expected an indent of 2 spaces"],
    ["s:\n  k: v\n    j: w\n", "config.yml line 3: keys must be indented 0 or 2 spaces"],
    ["a: [x, y]\n", "config.yml line 1: flow syntax ([...] or {...}) is not supported"],
    ["a: {x: y}\n", "config.yml line 1: flow syntax ([...] or {...}) is not supported"],
    ["a: |\n", "config.yml line 1: block scalars (| or >) are not supported"],
    ["a: >-\n", "config.yml line 1: block scalars (| or >) are not supported"],
    ['a: "x" y\n', "config.yml line 1: text after the closing quote"],
    ['a: "x\n', "config.yml line 1: missing closing quote"],
    ["a: x\na: y\n", "config.yml line 2: duplicate key 'a'"],
    ["s:\n  k: 1\n  k: 2\n", "config.yml line 3: duplicate key 's.k'"],
    ["s:\n  k: 1\ns:\n  j: 2\n", "config.yml line 3: duplicate key 's'"],
    ["Bad-Key: x\n", "config.yml line 1: invalid key 'Bad-Key' (use a-z, 0-9 and _)"],
    ["just text\n", "config.yml line 1: expected 'key: value'"],
    ["a:x\n", "config.yml line 1: expected a space after ':' or '-'"],
    ["- x\n", "config.yml line 1: array item with no array key above it"],
    ["urls:\n  -\n", "config.yml line 2: empty array item"],
  ])("%j fails with %j", (text, message) => {
    expect(errorOf(text)).toBe(message);
  });

  it("names the file label in the message", () => {
    expect(() => parseConfig("x\n", ".digismith/config.yml")).toThrow(
      ".digismith/config.yml line 1: expected 'key: value'",
    );
  });
});

describe("parseConfigDocument", () => {
  it("records entry lines, inline comments, arrays and section extents", () => {
    const doc = parseConfigDocument("# h\nprofile: x  # c\n\nprefs:\n  a: 1\n  list:\n    - q\n");
    expect(doc.entries.get("profile")).toEqual({ key: "profile", line: 1, lastLine: 1, comment: "  # c", isArray: false });
    expect(doc.entries.get("prefs.a")).toEqual({ key: "prefs.a", line: 4, lastLine: 4, comment: "", isArray: false });
    expect(doc.entries.get("prefs.list")).toEqual({ key: "prefs.list", line: 5, lastLine: 6, comment: "", isArray: true });
    expect(doc.sections.get("prefs")).toEqual({ name: "prefs", line: 3, lastLine: 6 });
    expect(doc.lines).toHaveLength(7);
  });
});

describe("splitConfigLines", () => {
  it("removes a BOM, trailing CRs and the final empty line", () => {
    expect(splitConfigLines("\uFEFFa\r\nb\n")).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run scripts/config-parse.test.ts`
Expected: FAIL, `Failed to load url ./config-parse.ts` (the module does not exist).

- [ ] **Step 3: Write the implementation**

Create `scripts/config-parse.ts`:

```ts
export type ConfigValue = string | string[];

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export type ConfigEntry = { key: string; line: number; lastLine: number; comment: string; isArray: boolean };
export type ConfigSection = { name: string; line: number; lastLine: number };
export type ConfigDocument = {
  lines: string[];
  values: Map<string, ConfigValue>;
  entries: Map<string, ConfigEntry>;
  sections: Map<string, ConfigSection>;
};

export const KEY_PATTERN = /^[a-z0-9_]+$/;

export function splitConfigLines(text: string): string[] {
  const body = text.startsWith("\uFEFF") ? text.slice(1) : text;
  const lines = body.split("\n").map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

type Scalar = { value: string; quoted: boolean; comment: string };

function parseScalar(raw: string, err: (reason: string) => ConfigError): Scalar {
  if (raw !== "" && raw[0] !== " ") throw err("expected a space after ':' or '-'");
  const s = raw.trimStart();
  if (s.startsWith('"') || s.startsWith("'")) {
    const end = s.indexOf(s[0], 1);
    if (end === -1) throw err("missing closing quote");
    const after = s.slice(end + 1);
    if (after.trim() !== "" && !/^\s+#/.test(after)) throw err("text after the closing quote");
    return { value: s.slice(1, end), quoted: true, comment: after.includes("#") ? after : "" };
  }
  if (s.startsWith("#")) return { value: "", quoted: false, comment: s };
  const hash = s.indexOf(" #");
  const value = (hash === -1 ? s : s.slice(0, hash)).trimEnd();
  if (/^[[{]/.test(value)) throw err("flow syntax ([...] or {...}) is not supported");
  if (/^[|>][-+0-9]*$/.test(value)) throw err("block scalars (| or >) are not supported");
  return { value, quoted: false, comment: hash === -1 ? "" : s.slice(value.length) };
}

export function parseConfigDocument(text: string, label = "config.yml"): ConfigDocument {
  const lines = splitConfigLines(text);
  const values = new Map<string, ConfigValue>();
  const entries = new Map<string, ConfigEntry>();
  const sections = new Map<string, ConfigSection>();
  const topNames = new Set<string>();
  let section: ConfigSection | null = null;
  let array: { entry: ConfigEntry; itemIndent: number } | null = null;
  let pending: { key: string; name: string; line: number; level: 0 | 1 } | null = null;
  const errAt = (index: number, reason: string) => new ConfigError(`${label} line ${index + 1}: ${reason}`);
  const emptyOpener = (p: { name: string; line: number }) =>
    errAt(p.line, `'${p.name}:' has no value and no indented lines under it`);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const err = (reason: string) => errAt(i, reason);
    const indent = line.length - line.trimStart().length;
    if (line.slice(0, indent).includes("\t")) throw err("tab in indentation; use spaces");
    const content = line.slice(indent);
    const isItem = content === "-" || content.startsWith("- ");

    if (pending) {
      const childIndent = pending.level === 0 ? 2 : 4;
      if (indent === childIndent && isItem) {
        const entry: ConfigEntry = { key: pending.key, line: pending.line, lastLine: pending.line, comment: "", isArray: true };
        entries.set(pending.key, entry);
        values.set(pending.key, []);
        array = { entry, itemIndent: childIndent };
      } else if (indent === childIndent && pending.level === 0) {
        section = { name: pending.name, line: pending.line, lastLine: pending.line };
        sections.set(pending.name, section);
      } else if (indent === childIndent) {
        throw err("a second level of headings is not supported");
      } else if (indent < childIndent && isItem) {
        throw err(`array items must be indented ${childIndent} spaces`);
      } else if (indent < childIndent) {
        throw emptyOpener(pending);
      } else {
        throw err(`expected an indent of ${childIndent} spaces`);
      }
      pending = null;
    }

    if (isItem) {
      if (!array) throw err("array item with no array key above it");
      if (indent !== array.itemIndent) throw err(`array items must be indented ${array.itemIndent} spaces`);
      const item = parseScalar(content.slice(1), err);
      if (!item.quoted && item.value === "") throw err("empty array item");
      (values.get(array.entry.key) as string[]).push(item.value);
      array.entry.lastLine = i;
      if (section && array.entry.key.startsWith(`${section.name}.`)) section.lastLine = i;
      continue;
    }

    array = null;
    const colon = content.indexOf(":");
    if (colon === -1) throw err("expected 'key: value'");
    const name = content.slice(0, colon);
    if (!KEY_PATTERN.test(name)) throw err(`invalid key '${name}' (use a-z, 0-9 and _)`);
    const scalar = parseScalar(content.slice(colon + 1), err);
    let key: string;
    let level: 0 | 1;
    if (indent === 0) {
      section = null;
      if (topNames.has(name)) throw err(`duplicate key '${name}'`);
      topNames.add(name);
      key = name;
      level = 0;
    } else if (indent === 2) {
      if (!section) throw err("indented line with no heading above it");
      key = `${section.name}.${name}`;
      if (entries.has(key)) throw err(`duplicate key '${key}'`);
      section.lastLine = i;
      level = 1;
    } else {
      throw err("keys must be indented 0 or 2 spaces");
    }
    if (!scalar.quoted && scalar.value === "") {
      pending = { key, name, line: i, level };
      continue;
    }
    values.set(key, scalar.value);
    entries.set(key, { key, line: i, lastLine: i, comment: scalar.comment, isArray: false });
  }
  if (pending) throw emptyOpener(pending);
  return { lines, values, entries, sections };
}

export function parseConfig(text: string, label = "config.yml"): Map<string, ConfigValue> {
  return parseConfigDocument(text, label).values;
}
```

Check before you continue: `"s:\n  urls:\n  - a\n"`. Line 2 opens a pending array at level 1 (child indent 4). Line 3 has indent 2 and is an item, so the branch `indent < childIndent && isItem` gives "array items must be indented 4 spaces". The duplicate check for `"s:\n  k: 1\ns:\n  j: 2\n"` fires at line 3 because the top-level name `s` is already in `topNames`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run scripts/config-parse.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add scripts/config-parse.ts scripts/config-parse.test.ts
git commit -m "feat(config): add a YAML-subset parser for config.yml"
```

---

### Task 2: In-place text writer

**Files:**
- Create: `scripts/config-write.ts`
- Test: `scripts/config-write.test.ts`

**Interfaces:**
- Consumes (Task 1): `ConfigError`, `KEY_PATTERN`, `parseConfigDocument(text, label)`.
- Produces:
  - `const HEADER: string` (the new-file header from Global Constraints)
  - `splitKey(key: string): { section: string | null; name: string }` (throws `ConfigError("invalid key '<key>'")`)
  - `formatScalar(value: string): string`
  - `setInText(text: string, key: string, value: string, label = "config.yml"): string`
  - `clearInText(text: string, key: string, label = "config.yml"): string` (returns `text` unchanged when the key is absent)
  - Output text always ends in exactly one `\n`, uses LF line endings, and has no trailing blank lines.

- [ ] **Step 1: Write the failing tests**

Create `scripts/config-write.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ConfigError, parseConfig } from "./config-parse.ts";
import { HEADER, clearInText, formatScalar, setInText, splitKey } from "./config-write.ts";

describe("HEADER", () => {
  it("locks the new-file header", () => {
    expect(HEADER).toBe("# DigiSmith config for this checkout. Edit by hand or through digismith:preferences.");
  });
});

describe("splitKey", () => {
  it("splits a section key and keeps a top-level key whole", () => {
    expect(splitKey("preferences.ssh_key")).toEqual({ section: "preferences", name: "ssh_key" });
    expect(splitKey("profile")).toEqual({ section: null, name: "profile" });
  });

  it.each(["A", "a.b.c", "a.", "", "a-b"])("rejects %j", (key) => {
    expect(() => splitKey(key)).toThrow(`invalid key '${key}'`);
  });
});

describe("formatScalar", () => {
  it.each([
    ["merge_locally", "merge_locally"],
    ["", '""'],
    [" x", '" x"'],
    ["x ", '"x "'],
    ['"x', `'"x'`],
    ["'x", `"'x"`],
    ["a #b", '"a #b"'],
    ["#x", '"#x"'],
    ["[x", '"[x"'],
    ["{x", '"{x"'],
    ["|", '"|"'],
    [">", '">"'],
    ["it's", "it's"],
    ['say "hi"', 'say "hi"'],
    ["https://x.com/#a", "https://x.com/#a"],
  ])("formats %j as %j", (value, expected) => {
    expect(formatScalar(value)).toBe(expected);
  });

  it("rejects a value that needs quotes and contains both quote types", () => {
    expect(() => formatScalar(`'a" #`)).toThrow(ConfigError);
    expect(() => formatScalar(`'a" #`)).toThrow("contains both quote types");
  });

  it("rejects a line break", () => {
    expect(() => formatScalar("a\nb")).toThrow("a value cannot contain a line break");
  });

  it.each(["merge_locally", "", " x", '"x', "'x", "a #b", "#x", "[x", "|", "it's", 'say "hi"', "c:\\temp", "08"])(
    "round-trips %j through the parser",
    (value) => {
      expect(parseConfig(`k: ${formatScalar(value)}\n`).get("k")).toBe(value);
    },
  );
});

describe("setInText", () => {
  it("starts a new file with the header and a top-level key", () => {
    expect(setInText("", "profile", "digismith")).toBe(`${HEADER}\nprofile: digismith\n`);
  });

  it("starts a new file with the header, a blank line and a section", () => {
    expect(setInText("", "preferences.finish_option", "merge_locally")).toBe(
      `${HEADER}\n\npreferences:\n  finish_option: merge_locally\n`,
    );
  });

  it("replaces a top-level value and keeps its inline comment", () => {
    expect(setInText("a: x   # note\n", "a", "y")).toBe("a: y   # note\n");
  });

  it("replaces a section value and keeps its inline comment", () => {
    expect(setInText("s:\n  k: 1  # c\n", "s.k", "2")).toBe("s:\n  k: 2  # c\n");
  });

  it("adds a top-level key after the last top-level key, before the first heading", () => {
    expect(setInText("# h\nprofile: p\n\npreferences:\n  a: 1\n", "role", "w")).toBe(
      "# h\nprofile: p\nrole: w\n\npreferences:\n  a: 1\n",
    );
  });

  it("adds a top-level key before the first heading when there is no top-level key", () => {
    expect(setInText("# h\npreferences:\n  a: 1\n", "profile", "p")).toBe("# h\nprofile: p\n\npreferences:\n  a: 1\n");
  });

  it("adds a section key at the end of its section, before the next heading", () => {
    expect(setInText("s:\n  a: 1\n\nt:\n  b: 2\n", "s.c", "3")).toBe("s:\n  a: 1\n  c: 3\n\nt:\n  b: 2\n");
  });

  it("adds a section key after an array that ends the section", () => {
    expect(setInText("s:\n  l:\n    - x\n", "s.k", "v")).toBe("s:\n  l:\n    - x\n  k: v\n");
  });

  it("adds a missing section at the end of the file after a blank line", () => {
    expect(setInText("profile: p\n", "preferences.a", "1")).toBe("profile: p\n\npreferences:\n  a: 1\n");
  });

  it("keeps comments and blank lines elsewhere", () => {
    expect(setInText("# one\n\n# two\na: 1\n", "a", "2")).toBe("# one\n\n# two\na: 2\n");
  });

  it("quotes a value that needs quotes", () => {
    expect(setInText("", "a", "x #y")).toBe(`${HEADER}\na: "x #y"\n`);
  });

  it("writes LF line endings for CRLF input", () => {
    expect(setInText("a: x\r\n", "b", "y")).toBe("a: x\nb: y\n");
  });

  it("refuses to overwrite an array", () => {
    expect(() => setInText("l:\n  - x\n", "l", "y")).toThrow("'l' is an array; edit it by hand");
  });

  it("refuses to write a heading name as a key", () => {
    expect(() => setInText("s:\n  a: 1\n", "s", "x")).toThrow("'s' is a heading, not a key");
  });

  it("refuses to write under a top-level scalar", () => {
    expect(() => setInText("s: x\n", "s.a", "1")).toThrow("'s' is a key, not a heading");
  });

  it("passes a parse error through with its label", () => {
    expect(() => setInText("x\n", "a", "1", ".digismith/config.yml")).toThrow(
      ".digismith/config.yml line 1: expected 'key: value'",
    );
  });
});

describe("clearInText", () => {
  it("removes a top-level key line", () => {
    expect(clearInText("a: 1\nb: 2\n", "a")).toBe("b: 2\n");
  });

  it("removes an array with its item lines", () => {
    expect(clearInText("l:\n  - x\n  - y\nb: 2\n", "l")).toBe("b: 2\n");
  });

  it("removes the heading when its last key goes, and trailing blank lines", () => {
    expect(clearInText("p: 1\n\ns:\n  a: 1\n", "s.a")).toBe("p: 1\n");
  });

  it("keeps the heading while other keys remain", () => {
    expect(clearInText("s:\n  a: 1\n  b: 2\n", "s.a")).toBe("s:\n  b: 2\n");
  });

  it("returns the text unchanged when the key is absent", () => {
    const text = "a: 1\r\n";
    expect(clearInText(text, "b")).toBe(text);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run scripts/config-write.test.ts`
Expected: FAIL, `Failed to load url ./config-write.ts`.

- [ ] **Step 3: Write the implementation**

Create `scripts/config-write.ts`:

```ts
import { ConfigError, KEY_PATTERN, parseConfigDocument } from "./config-parse.ts";

export const HEADER = "# DigiSmith config for this checkout. Edit by hand or through digismith:preferences.";

export function splitKey(key: string): { section: string | null; name: string } {
  const parts = key.split(".");
  if (parts.length > 2 || !parts.every((part) => KEY_PATTERN.test(part))) {
    throw new ConfigError(`invalid key '${key}'`);
  }
  return parts.length === 2 ? { section: parts[0], name: parts[1] } : { section: null, name: parts[0] };
}

// Quote only when a plain value would read back differently: empty, padded,
// or starting with a character the parser treats as syntax.
export function formatScalar(value: string): string {
  if (/[\r\n]/.test(value)) throw new ConfigError("a value cannot contain a line break");
  const needsQuotes = value === "" || value !== value.trim() || /^["'#[{|>]/.test(value) || value.includes(" #");
  if (!needsQuotes) return value;
  if (!value.includes('"')) return `"${value}"`;
  if (!value.includes("'")) return `'${value}'`;
  throw new ConfigError(`the value contains both quote types and cannot be written: ${value}`);
}

function joinLines(lines: string[]): string {
  const out = [...lines];
  while (out.length > 0 && out[out.length - 1].trim() === "") out.pop();
  return out.join("\n") + "\n";
}

export function setInText(text: string, key: string, value: string, label = "config.yml"): string {
  const { section, name } = splitKey(key);
  const formatted = formatScalar(value);
  const doc = parseConfigDocument(text, label);
  const lines = doc.lines.every((line) => line.trim() === "") ? [HEADER] : [...doc.lines];

  const entry = doc.entries.get(key);
  if (entry) {
    if (entry.isArray) throw new ConfigError(`'${key}' is an array; edit it by hand`);
    lines[entry.line] = `${section ? "  " : ""}${name}: ${formatted}${entry.comment}`;
    return joinLines(lines);
  }

  if (section === null) {
    if (doc.sections.has(name)) throw new ConfigError(`'${key}' is a heading, not a key`);
    const keyLine = `${name}: ${formatted}`;
    const topEntries = [...doc.entries.values()].filter((e) => !e.key.includes("."));
    if (topEntries.length > 0) {
      lines.splice(Math.max(...topEntries.map((e) => e.lastLine)) + 1, 0, keyLine);
    } else if (doc.sections.size > 0) {
      lines.splice(Math.min(...[...doc.sections.values()].map((s) => s.line)), 0, keyLine, "");
    } else {
      lines.push(keyLine);
    }
    return joinLines(lines);
  }

  if (doc.entries.has(section)) throw new ConfigError(`'${section}' is a key, not a heading`);
  const keyLine = `  ${name}: ${formatted}`;
  const existing = doc.sections.get(section);
  if (existing) {
    lines.splice(existing.lastLine + 1, 0, keyLine);
    return joinLines(lines);
  }
  if (lines[lines.length - 1].trim() !== "") lines.push("");
  lines.push(`${section}:`, keyLine);
  return joinLines(lines);
}

export function clearInText(text: string, key: string, label = "config.yml"): string {
  const { section } = splitKey(key);
  const doc = parseConfigDocument(text, label);
  const entry = doc.entries.get(key);
  if (!entry) return text;
  const lines = [...doc.lines];
  lines.splice(entry.line, entry.lastLine - entry.line + 1);
  const heading = section === null ? undefined : doc.sections.get(section);
  const lastInSection = heading && ![...doc.entries.keys()].some((k) => k !== key && k.startsWith(`${section}.`));
  if (heading && lastInSection) lines.splice(heading.line, 1);
  return joinLines(lines);
}
```

The heading line is always above the removed entry, so removing the entry first does not move the heading's index.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run scripts/config-write.test.ts scripts/config-parse.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/config-write.ts scripts/config-write.test.ts
git commit -m "feat(config): add an in-place writer for config.yml"
```

---

### Task 3: Layered reader with the fallback

**Files:**
- Create: `scripts/config.ts`
- Test: `scripts/config.test.ts`

**Interfaces:**
- Consumes (Task 1): `ConfigError`, `ConfigValue`, `parseConfig`.
- Produces (in `scripts/config.ts`):
  - Constants: `DEFAULT_DIR = ".digismith"`, `CONFIG_FILE = "config.yml"`, `LEGACY_PROFILE_FILE = "profile"`, `LEGACY_PREFERENCES_FILE = "preferences.yml"`, `PREFERENCES_SECTION = "preferences"`, `MIGRATED_SUFFIX = ".migrated"`, `MIGRATE_COMMIT_MESSAGE`
  - `type Resolved = { value: ConfigValue; source: string }` (`source` is `path.join(dir, <file>)`)
  - `readTextIfPresent(filePath: string): string | undefined` (exported for Tasks 4-5; ENOENT → `undefined`; invalid UTF-8 → `ConfigError("<file>: not valid UTF-8")`; other errors rethrown)
  - `readConfig(dir = DEFAULT_DIR): Map<string, ConfigValue>`
  - `readLegacyProfile(dir = DEFAULT_DIR): string | undefined`
  - `readLegacyPreferences(dir = DEFAULT_DIR): Map<string, ConfigValue>` (keys are `preferences.<key>`)
  - `resolve(key: string, dir = DEFAULT_DIR): Resolved | undefined`

- [ ] **Step 1: Write the failing tests**

Create `scripts/config.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ConfigError } from "./config-parse.ts";
import {
  DEFAULT_DIR,
  MIGRATE_COMMIT_MESSAGE,
  readConfig,
  readLegacyPreferences,
  readLegacyProfile,
  resolve,
} from "./config.ts";

let tmpDir: string;
let dir: string;

function write(name: string, content: string | Buffer): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), content);
}

function setUpTmp(): void {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-config-test-"));
  dir = path.join(tmpDir, ".digismith");
  process.env.GIT_CEILING_DIRECTORIES = fs.realpathSync.native(path.dirname(tmpDir));
}

function tearDownTmp(): void {
  delete process.env.GIT_CEILING_DIRECTORIES;
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

describe("constants", () => {
  it("locks the default folder and the migration commit message", () => {
    expect(DEFAULT_DIR).toBe(".digismith");
    expect(MIGRATE_COMMIT_MESSAGE).toBe("chore(config): migrate to .digismith/config.yml");
  });
});

describe("readConfig", () => {
  beforeEach(setUpTmp);
  afterEach(tearDownTmp);

  it("returns an empty map when config.yml is missing", () => {
    expect(readConfig(dir)).toEqual(new Map());
  });

  it("parses config.yml", () => {
    write("config.yml", "profile: emma\npreferences:\n  ssh_key: /k\n");
    expect(readConfig(dir)).toEqual(
      new Map([
        ["profile", "emma"],
        ["preferences.ssh_key", "/k"],
      ]),
    );
  });

  it("labels a parse error with the file path", () => {
    write("config.yml", "oops\n");
    expect(() => readConfig(dir)).toThrow(`${path.join(dir, "config.yml")} line 1: expected 'key: value'`);
  });

  it("reports invalid UTF-8 as a ConfigError", () => {
    write("config.yml", Buffer.from([0x61, 0x3a, 0x20, 0xff]));
    expect(() => readConfig(dir)).toThrow(ConfigError);
    expect(() => readConfig(dir)).toThrow(`${path.join(dir, "config.yml")}: not valid UTF-8`);
  });
});

describe("readLegacyProfile", () => {
  beforeEach(setUpTmp);
  afterEach(tearDownTmp);

  it("returns undefined for a missing file", () => {
    expect(readLegacyProfile(dir)).toBeUndefined();
  });

  it("returns the trimmed content", () => {
    write("profile", "emma\n");
    expect(readLegacyProfile(dir)).toBe("emma");
  });

  it("treats a whitespace-only file as unset", () => {
    write("profile", "   \n");
    expect(readLegacyProfile(dir)).toBeUndefined();
  });

  it("reports invalid UTF-8 as a ConfigError", () => {
    write("profile", Buffer.from([0xff, 0xfe]));
    expect(() => readLegacyProfile(dir)).toThrow(`${path.join(dir, "profile")}: not valid UTF-8`);
  });
});

describe("readLegacyPreferences", () => {
  beforeEach(setUpTmp);
  afterEach(tearDownTmp);

  it("maps each flat key to preferences.<key>", () => {
    write("preferences.yml", "# old header\nfinish_option: merge_locally\nssh_key: /k\n");
    expect(readLegacyPreferences(dir)).toEqual(
      new Map([
        ["preferences.finish_option", "merge_locally"],
        ["preferences.ssh_key", "/k"],
      ]),
    );
  });

  it("rejects a heading in the old file", () => {
    write("preferences.yml", "s:\n  a: 1\n");
    expect(() => readLegacyPreferences(dir)).toThrow("expected flat 'key: value' lines only");
  });
});

describe("resolve", () => {
  beforeEach(setUpTmp);
  afterEach(tearDownTmp);

  it("returns undefined when no layer has the key", () => {
    expect(resolve("profile", dir)).toBeUndefined();
  });

  it("prefers config.yml over the old files and names the source", () => {
    write("config.yml", "profile: emma\n");
    write("profile", "digismith\n");
    expect(resolve("profile", dir)).toEqual({ value: "emma", source: path.join(dir, "config.yml") });
  });

  it("falls back to .digismith/profile for profile", () => {
    write("profile", "digismith\n");
    expect(resolve("profile", dir)).toEqual({ value: "digismith", source: path.join(dir, "profile") });
  });

  it("falls back per key: profile from config.yml, a preference from preferences.yml", () => {
    write("config.yml", "profile: emma\n");
    write("preferences.yml", "finish_option: pr\n");
    expect(resolve("preferences.finish_option", dir)).toEqual({
      value: "pr",
      source: path.join(dir, "preferences.yml"),
    });
  });

  it("does not read an old preference as a top-level key", () => {
    write("preferences.yml", "finish_option: pr\n");
    expect(resolve("finish_option", dir)).toBeUndefined();
  });

  it("has no old source for role", () => {
    write("profile", "digismith\n");
    expect(resolve("role", dir)).toBeUndefined();
  });

  it("reads profile without touching a broken preferences.yml", () => {
    write("profile", "digismith\n");
    write("preferences.yml", Buffer.from([0xff]));
    expect(resolve("profile", dir)?.value).toBe("digismith");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run scripts/config.test.ts`
Expected: FAIL, `Failed to load url ./config.ts`.

- [ ] **Step 3: Write the implementation**

Create `scripts/config.ts`:

```ts
import * as fs from "node:fs";
import * as path from "node:path";
import { ConfigError, parseConfig, type ConfigValue } from "./config-parse.ts";

export const DEFAULT_DIR = ".digismith";
export const CONFIG_FILE = "config.yml";
export const LEGACY_PROFILE_FILE = "profile";
export const LEGACY_PREFERENCES_FILE = "preferences.yml";
export const PREFERENCES_SECTION = "preferences";
export const MIGRATED_SUFFIX = ".migrated";
export const MIGRATE_COMMIT_MESSAGE = "chore(config): migrate to .digismith/config.yml";

export type Resolved = { value: ConfigValue; source: string };

export function readTextIfPresent(filePath: string): string | undefined {
  let raw: Buffer;
  try {
    raw = fs.readFileSync(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    throw new ConfigError(`${filePath}: not valid UTF-8`);
  }
}

export function readConfig(dir = DEFAULT_DIR): Map<string, ConfigValue> {
  const file = path.join(dir, CONFIG_FILE);
  const text = readTextIfPresent(file);
  return text === undefined ? new Map() : parseConfig(text, file);
}

export function readLegacyProfile(dir = DEFAULT_DIR): string | undefined {
  const trimmed = readTextIfPresent(path.join(dir, LEGACY_PROFILE_FILE))?.trim();
  return trimmed ? trimmed : undefined;
}

export function readLegacyPreferences(dir = DEFAULT_DIR): Map<string, ConfigValue> {
  const file = path.join(dir, LEGACY_PREFERENCES_FILE);
  const text = readTextIfPresent(file);
  const result = new Map<string, ConfigValue>();
  if (text === undefined) return result;
  for (const [key, value] of parseConfig(text, file)) {
    if (key.includes(".") || Array.isArray(value)) {
      throw new ConfigError(`${file}: expected flat 'key: value' lines only`);
    }
    result.set(`${PREFERENCES_SECTION}.${key}`, value);
  }
  return result;
}

type Layer = (key: string, dir: string) => Resolved | undefined;

function configLayer(key: string, dir: string): Resolved | undefined {
  const value = readConfig(dir).get(key);
  return value === undefined ? undefined : { value, source: path.join(dir, CONFIG_FILE) };
}

// A.2 fallback: the old files, until the follow-up removal ticket.
function legacyLayer(key: string, dir: string): Resolved | undefined {
  if (key === "profile") {
    const value = readLegacyProfile(dir);
    return value === undefined ? undefined : { value, source: path.join(dir, LEGACY_PROFILE_FILE) };
  }
  if (key.startsWith(`${PREFERENCES_SECTION}.`)) {
    const value = readLegacyPreferences(dir).get(key);
    return value === undefined ? undefined : { value, source: path.join(dir, LEGACY_PREFERENCES_FILE) };
  }
  return undefined;
}

// First layer with the key wins. A global layer goes at the end of this list.
const LAYERS: Layer[] = [configLayer, legacyLayer];

export function resolve(key: string, dir = DEFAULT_DIR): Resolved | undefined {
  for (const layer of LAYERS) {
    const hit = layer(key, dir);
    if (hit) return hit;
  }
  return undefined;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run scripts/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/config.ts scripts/config.test.ts
git commit -m "feat(config): add the layered config reader with the old-file fallback"
```

---

### Task 4: `migrate` and its report

**Files:**
- Modify: `scripts/config.ts` (append)
- Test: `scripts/config.test.ts` (append)

**Interfaces:**
- Consumes: Task 2 `setInText`; Task 3 constants, `readTextIfPresent`, `readLegacyProfile`, `readLegacyPreferences`; `resolveMainRoot(cwd: string): string` from `scripts/lineage-handoff.ts`.
- Produces (in `scripts/config.ts`):
  - `isLinkedWorktree(cwd: string): boolean`
  - `writeAtomic(filePath: string, content: string): void` (exported for Task 5)
  - `commitCommands(dir: string, moved: string[]): string[]`
  - `migrateCommand(dir: string): string`
  - `worktreeMessage(root: string): string`
  - `type MigrateConflict = { key: string; kept: ConfigValue; old: ConfigValue; file: string }`
  - `type MigrateReport = { moved: string[]; added: string[]; conflicts: MigrateConflict[]; commit: string[] | null }` (`moved` holds old file names such as `"profile"`)
  - `migrate(dir = DEFAULT_DIR): MigrateReport`
  - `formatMigrateReport(report: MigrateReport, dir = DEFAULT_DIR): string[]`

- [ ] **Step 1: Write the failing tests**

Add these imports at the top of `scripts/config.test.ts`:

```ts
import { spawnSync } from "node:child_process";
import { HEADER } from "./config-write.ts";
import { formatMigrateReport, migrate } from "./config.ts";
```

Append to `scripts/config.test.ts`:

```ts
function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout;
}

function initRepo(root: string): void {
  fs.mkdirSync(root, { recursive: true });
  git(root, "init", "-q");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "Test");
  fs.writeFileSync(path.join(root, "README.md"), "base\n");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "base");
}

const OLD_PREFS = "# DigiSmith-managed. Settings decided through live interaction, not hand-authored.\nfinish_option: merge_locally\nclear_context: no\n";

describe("migrate", () => {
  beforeEach(setUpTmp);
  afterEach(tearDownTmp);

  it("reports nothing to migrate when no old file exists", () => {
    const report = migrate(dir);
    expect(report).toEqual({ moved: [], added: [], conflicts: [], commit: null });
    expect(formatMigrateReport(report, dir)).toEqual(["config: nothing to migrate"]);
  });

  it("merges both untracked old files into config.yml and moves them aside", () => {
    write("profile", "digismith\n");
    write("preferences.yml", OLD_PREFS);

    const report = migrate(dir);

    expect(fs.readFileSync(path.join(dir, "config.yml"), "utf8")).toBe(
      `${HEADER}\nprofile: digismith\n\npreferences:\n  finish_option: merge_locally\n  clear_context: no\n`,
    );
    expect(fs.existsSync(path.join(dir, "profile"))).toBe(false);
    expect(fs.readFileSync(path.join(dir, "profile.migrated"), "utf8")).toBe("digismith\n");
    expect(fs.readFileSync(path.join(dir, "preferences.yml.migrated"), "utf8")).toBe(OLD_PREFS);
    expect(report).toEqual({
      moved: ["profile", "preferences.yml"],
      added: ["profile", "preferences.finish_option", "preferences.clear_context"],
      conflicts: [],
      commit: null,
    });
  });

  it("keeps a config.yml value on conflict and reports it", () => {
    write("config.yml", "profile: emma\n");
    write("profile", "digismith\n");

    const report = migrate(dir);

    expect(fs.readFileSync(path.join(dir, "config.yml"), "utf8")).toBe("profile: emma\n");
    expect(report.conflicts).toEqual([{ key: "profile", kept: "emma", old: "digismith", file: "profile" }]);
    expect(fs.existsSync(path.join(dir, "profile.migrated"))).toBe(true);
  });

  it("reports no conflict and writes nothing when the values are equal", () => {
    write("config.yml", "profile: digismith\n");
    write("profile", "digismith\n");

    const report = migrate(dir);

    expect(report.conflicts).toEqual([]);
    expect(report.added).toEqual([]);
    expect(fs.readFileSync(path.join(dir, "config.yml"), "utf8")).toBe("profile: digismith\n");
  });

  it("skips a file that is already moved aside and migrates the other one", () => {
    write("profile.migrated", "digismith\n");
    write("preferences.yml", "finish_option: pr\n");

    const report = migrate(dir);

    expect(report.moved).toEqual(["preferences.yml"]);
    expect(fs.readFileSync(path.join(dir, "config.yml"), "utf8")).toBe(`${HEADER}\n\npreferences:\n  finish_option: pr\n`);
  });

  it("finishes a run that stopped between the two renames", () => {
    write("profile", "digismith\n");
    write("preferences.yml", OLD_PREFS);
    migrate(dir);
    fs.renameSync(path.join(dir, "preferences.yml.migrated"), path.join(dir, "preferences.yml"));

    const report = migrate(dir);

    expect(report.moved).toEqual(["preferences.yml"]);
    expect(report.conflicts).toEqual([]);
    expect(fs.existsSync(path.join(dir, "preferences.yml.migrated"))).toBe(true);
  });

  it("stops and changes nothing when an original and its .migrated copy both exist", () => {
    write("profile", "digismith\n");
    write("profile.migrated", "old\n");

    expect(() => migrate(dir)).toThrow("both exist");
    expect(fs.existsSync(path.join(dir, "config.yml"))).toBe(false);
    expect(fs.readFileSync(path.join(dir, "profile"), "utf8")).toBe("digismith\n");
  });

  it("stops and changes nothing when an old file is not valid UTF-8", () => {
    write("profile", "digismith\n");
    write("preferences.yml", Buffer.from([0xff]));

    expect(() => migrate(dir)).toThrow("not valid UTF-8");
    expect(fs.existsSync(path.join(dir, "config.yml"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "profile"))).toBe(true);
  });

  it("prints commit commands for both moved files when git tracks them", () => {
    const repo = path.join(tmpDir, "repo");
    initRepo(repo);
    dir = path.join(repo, ".digismith");
    write("profile", "digismith\n");
    write("preferences.yml", OLD_PREFS);
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "old files");

    const report = migrate(dir);

    expect(report.commit).toEqual([
      "git add .digismith/config.yml .digismith/profile .digismith/profile.migrated .digismith/preferences.yml .digismith/preferences.yml.migrated",
      'git commit -m "chore(config): migrate to .digismith/config.yml"',
    ]);
  });

  it("prints commit commands for only the moved file", () => {
    const repo = path.join(tmpDir, "repo");
    initRepo(repo);
    dir = path.join(repo, ".digismith");
    write("profile", "digismith\n");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "old profile");

    expect(migrate(dir).commit).toEqual([
      "git add .digismith/config.yml .digismith/profile .digismith/profile.migrated",
      'git commit -m "chore(config): migrate to .digismith/config.yml"',
    ]);
  });

  it("stops in a linked worktree and names the main checkout", () => {
    const repo = path.join(tmpDir, "repo");
    initRepo(repo);
    fs.mkdirSync(path.join(repo, ".digismith"));
    fs.writeFileSync(path.join(repo, ".digismith", "profile"), "digismith\n");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "old profile");
    const wt = path.join(tmpDir, "wt");
    git(repo, "worktree", "add", "-q", "-b", "wt", wt);
    dir = path.join(wt, ".digismith");

    expect(() => migrate(dir)).toThrow(
      `this worktree still has .digismith/profile or preferences.yml. Run migrate in the main checkout ${fs.realpathSync(repo)}, then remove or recreate this worktree`,
    );
    expect(fs.existsSync(path.join(dir, "profile"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "config.yml"))).toBe(false);
  });

  it("formats a full report with a conflict and commit commands", () => {
    const lines = formatMigrateReport(
      {
        moved: ["profile", "preferences.yml"],
        added: ["preferences.finish_option"],
        conflicts: [{ key: "profile", kept: "emma", old: "digismith", file: "profile" }],
        commit: ["git add a", 'git commit -m "m"'],
      },
      ".digismith",
    );
    expect(lines).toEqual([
      "config: migrated .digismith/profile, .digismith/preferences.yml into .digismith/config.yml",
      "config: added preferences.finish_option",
      'config: conflict on profile: kept "emma" from config.yml, the old value "digismith" stays in profile.migrated',
      "config: moved aside profile -> profile.migrated, preferences.yml -> preferences.yml.migrated",
      "config: if a branch from before this migration changes an old file, apply that change again with set",
      "config: commit needed:",
      "  git add a",
      '  git commit -m "m"',
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run scripts/config.test.ts`
Expected: FAIL, `migrate is not a function` (or a missing-export error).

- [ ] **Step 3: Write the implementation**

Add these imports at the top of `scripts/config.ts`:

```ts
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setInText } from "./config-write.ts";
import { resolveMainRoot } from "./lineage-handoff.ts";
```

Append to `scripts/config.ts`:

```ts
const LEGACY_FILES = [LEGACY_PROFILE_FILE, LEGACY_PREFERENCES_FILE];
const SCRIPT_PATH = fileURLToPath(import.meta.url);

function git(cwd: string, args: string[]) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

function checkoutRoot(dir: string): string {
  return path.dirname(path.resolve(dir));
}

export function isLinkedWorktree(cwd: string): boolean {
  const gitDir = git(cwd, ["rev-parse", "--path-format=absolute", "--git-dir"]);
  const commonDir = git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (gitDir.status !== 0 || commonDir.status !== 0) return false;
  return path.resolve(gitDir.stdout.trim()) !== path.resolve(commonDir.stdout.trim());
}

function isTracked(root: string, filePath: string): boolean {
  return git(root, ["ls-files", "--error-unmatch", "--", filePath]).status === 0;
}

export function writeAtomic(filePath: string, content: string): void {
  const folder = path.dirname(filePath);
  fs.mkdirSync(folder, { recursive: true });
  const tmp = path.join(folder, `.${path.basename(filePath)}.${process.pid}.tmp`);
  try {
    fs.writeFileSync(tmp, content);
    fs.renameSync(tmp, filePath);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

export function worktreeMessage(root: string): string {
  return `this worktree still has .digismith/profile or preferences.yml. Run migrate in the main checkout ${resolveMainRoot(root)}, then remove or recreate this worktree`;
}

export function migrateCommand(dir: string): string {
  return `node --experimental-strip-types ${SCRIPT_PATH} --action migrate --dir ${dir}`;
}

export function commitCommands(dir: string, moved: string[]): string[] {
  const root = checkoutRoot(dir);
  const rel = (file: string) => path.relative(root, path.join(path.resolve(dir), file)).split(path.sep).join("/");
  const paths = [rel(CONFIG_FILE), ...moved.flatMap((file) => [rel(file), rel(file + MIGRATED_SUFFIX)])];
  return [`git add ${paths.join(" ")}`, `git commit -m "${MIGRATE_COMMIT_MESSAGE}"`];
}

export type MigrateConflict = { key: string; kept: ConfigValue; old: ConfigValue; file: string };
export type MigrateReport = { moved: string[]; added: string[]; conflicts: MigrateConflict[]; commit: string[] | null };

export function migrate(dir = DEFAULT_DIR): MigrateReport {
  const root = checkoutRoot(dir);
  if (isLinkedWorktree(root)) throw new ConfigError(worktreeMessage(root));

  const toMove: string[] = [];
  for (const file of LEGACY_FILES) {
    const original = fs.existsSync(path.join(dir, file));
    const copy = fs.existsSync(path.join(dir, file + MIGRATED_SUFFIX));
    if (original && copy) {
      throw new ConfigError(
        `${path.join(dir, file)} and ${path.join(dir, file + MIGRATED_SUFFIX)} both exist. Move one of them out of ${dir}, then run migrate again`,
      );
    }
    if (original) toMove.push(file);
  }
  if (toMove.length === 0) return { moved: [], added: [], conflicts: [], commit: null };

  const tracked = toMove.some((file) => isTracked(root, path.join(path.resolve(dir), file)));
  const old: { key: string; value: ConfigValue; file: string }[] = [];
  if (toMove.includes(LEGACY_PROFILE_FILE)) {
    const value = readLegacyProfile(dir);
    if (value !== undefined) old.push({ key: "profile", value, file: LEGACY_PROFILE_FILE });
  }
  if (toMove.includes(LEGACY_PREFERENCES_FILE)) {
    for (const [key, value] of readLegacyPreferences(dir)) old.push({ key, value, file: LEGACY_PREFERENCES_FILE });
  }

  const configPath = path.join(dir, CONFIG_FILE);
  let text = readTextIfPresent(configPath) ?? "";
  const current = parseConfig(text, configPath);
  const added: string[] = [];
  const conflicts: MigrateConflict[] = [];
  for (const { key, value, file } of old) {
    const existing = current.get(key);
    if (existing === undefined) {
      text = setInText(text, key, value as string, configPath);
      added.push(key);
    } else if (JSON.stringify(existing) !== JSON.stringify(value)) {
      conflicts.push({ key, kept: existing, old: value, file });
    }
  }

  if (added.length > 0) writeAtomic(configPath, text);
  for (const file of toMove) fs.renameSync(path.join(dir, file), path.join(dir, file + MIGRATED_SUFFIX));
  return { moved: toMove, added, conflicts, commit: tracked ? commitCommands(dir, toMove) : null };
}

export function formatMigrateReport(report: MigrateReport, dir = DEFAULT_DIR): string[] {
  if (report.moved.length === 0) return ["config: nothing to migrate"];
  const lines = [
    `config: migrated ${report.moved.map((file) => path.join(dir, file)).join(", ")} into ${path.join(dir, CONFIG_FILE)}`,
  ];
  if (report.added.length > 0) lines.push(`config: added ${report.added.join(", ")}`);
  for (const c of report.conflicts) {
    lines.push(
      `config: conflict on ${c.key}: kept ${JSON.stringify(c.kept)} from ${CONFIG_FILE}, the old value ${JSON.stringify(c.old)} stays in ${c.file}${MIGRATED_SUFFIX}`,
    );
  }
  lines.push(`config: moved aside ${report.moved.map((file) => `${file} -> ${file}${MIGRATED_SUFFIX}`).join(", ")}`);
  lines.push("config: if a branch from before this migration changes an old file, apply that change again with set");
  if (report.commit) {
    lines.push("config: commit needed:");
    for (const command of report.commit) lines.push(`  ${command}`);
  }
  return lines;
}
```

Every read and parse runs before the first write, so a `ConfigError` leaves the folder unchanged. Legacy values are always strings, because `readLegacyPreferences` rejects arrays.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run scripts/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/config.ts scripts/config.test.ts
git commit -m "feat(config): add migrate for the old profile and preferences files"
```

---

### Task 5: Guarded writes and the `config.ts` CLI

**Files:**
- Modify: `scripts/config.ts` (append)
- Test: `scripts/config.test.ts` (append)

**Interfaces:**
- Consumes: Task 2 `splitKey`, `formatScalar`, `setInText`, `clearInText`; Task 4 `isLinkedWorktree`, `writeAtomic`, `worktreeMessage`, `migrateCommand`, `commitCommands`, `migrate`, `formatMigrateReport`; `parseArgs`, `requireArgs` from `scripts/cli-args.ts`.
- Produces (in `scripts/config.ts`):
  - `type WriteCheck = { kind: "write" } | { kind: "migrate" } | { kind: "stop"; message: string }`
  - `checkWrite(dir = DEFAULT_DIR): WriteCheck`
  - `type WriteResult = { migration: MigrateReport | null }`
  - `setKey(key: string, value: string, dir = DEFAULT_DIR): WriteResult`
  - `clearKey(key: string, dir = DEFAULT_DIR): WriteResult`
  - `main(): void` (CLI: `--action get|set|clear|migrate`, `--key`, `--value`, `--dir`)

- [ ] **Step 1: Write the failing tests**

Add to the `./config.ts` import in `scripts/config.test.ts`: `checkWrite, clearKey, main, setKey`. Add `vi` to the vitest import.

Append to `scripts/config.test.ts`:

```ts
describe("setKey / clearKey", () => {
  beforeEach(setUpTmp);
  afterEach(tearDownTmp);

  it("writes config.yml when no old file exists", () => {
    expect(checkWrite(dir)).toEqual({ kind: "write" });
    const result = setKey("profile", "emma", dir);
    expect(result.migration).toBeNull();
    expect(fs.readFileSync(path.join(dir, "config.yml"), "utf8")).toBe(`${HEADER}\nprofile: emma\n`);
  });

  it("leaves no temporary file behind", () => {
    setKey("profile", "emma", dir);
    expect(fs.readdirSync(dir).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("migrates untracked old files first, then writes", () => {
    write("profile", "digismith\n");
    expect(checkWrite(dir)).toEqual({ kind: "migrate" });

    const result = setKey("preferences.finish_option", "pr", dir);

    expect(result.migration?.moved).toEqual(["profile"]);
    expect(fs.readFileSync(path.join(dir, "config.yml"), "utf8")).toBe(
      `${HEADER}\nprofile: digismith\n\npreferences:\n  finish_option: pr\n`,
    );
  });

  it("does not let a cleared key come back through the fallback", () => {
    write("preferences.yml", "finish_option: pr\n");

    clearKey("preferences.finish_option", dir);

    expect(resolve("preferences.finish_option", dir)).toBeUndefined();
    expect(fs.existsSync(path.join(dir, "preferences.yml.migrated"))).toBe(true);
  });

  it("validates the value before it migrates anything", () => {
    write("profile", "digismith\n");
    expect(() => setKey("role", `'a" #`, dir)).toThrow("contains both quote types");
    expect(fs.existsSync(path.join(dir, "profile"))).toBe(true);
  });

  it("stops in a main checkout where git tracks an old file, and changes nothing", () => {
    const repo = path.join(tmpDir, "repo");
    initRepo(repo);
    dir = path.join(repo, ".digismith");
    write("profile", "digismith\n");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "old profile");

    const check = checkWrite(dir);
    expect(check.kind).toBe("stop");
    expect(() => setKey("role", "worker", dir)).toThrow(ConfigError);
    try {
      setKey("role", "worker", dir);
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain(`git tracks ${path.join(dir, "profile")}`);
      expect(message).toContain("--action migrate --dir");
      expect(message).toContain("  git add .digismith/config.yml .digismith/profile .digismith/profile.migrated");
      expect(message).toContain('  git commit -m "chore(config): migrate to .digismith/config.yml"');
    }
    expect(fs.existsSync(path.join(dir, "config.yml"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "profile"))).toBe(true);
  });

  it("stops in a linked worktree that still has an old file, and changes nothing", () => {
    const repo = path.join(tmpDir, "repo");
    initRepo(repo);
    fs.mkdirSync(path.join(repo, ".digismith"));
    fs.writeFileSync(path.join(repo, ".digismith", "profile"), "digismith\n");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "old profile");
    const wt = path.join(tmpDir, "wt");
    git(repo, "worktree", "add", "-q", "-b", "wt", wt);
    dir = path.join(wt, ".digismith");

    expect(() => clearKey("preferences.finish_option", dir)).toThrow("Run migrate in the main checkout");
    expect(fs.existsSync(path.join(dir, "config.yml"))).toBe(false);
  });

  it("writes in a linked worktree that has no old file", () => {
    const repo = path.join(tmpDir, "repo");
    initRepo(repo);
    const wt = path.join(tmpDir, "wt");
    git(repo, "worktree", "add", "-q", "-b", "wt", wt);
    dir = path.join(wt, ".digismith");

    setKey("preferences.finish_option", "pr", dir);

    expect(resolve("preferences.finish_option", dir)?.value).toBe("pr");
  });

  it("clear is a no-op when config.yml does not exist", () => {
    clearKey("profile", dir);
    expect(fs.existsSync(path.join(dir, "config.yml"))).toBe(false);
  });
});

describe("main (CLI)", () => {
  let originalArgv: string[];
  let logs: string[];
  let errors: string[];

  beforeEach(() => {
    setUpTmp();
    originalArgv = process.argv;
    logs = [];
    errors = [];
    vi.spyOn(console, "log").mockImplementation((msg: string) => void logs.push(msg));
    vi.spyOn(console, "error").mockImplementation((msg: string) => void errors.push(msg));
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.exitCode = 0;
    vi.restoreAllMocks();
    tearDownTmp();
  });

  function run(...args: string[]): void {
    process.argv = ["node", "config.ts", ...args, "--dir", dir];
    main();
  }

  it("prints unset for a missing key", () => {
    run("--action", "get", "--key", "profile");
    expect(logs).toEqual(["unset"]);
  });

  it("sets, gets and clears a key", () => {
    run("--action", "set", "--key", "profile", "--value", "emma");
    run("--action", "get", "--key", "profile");
    run("--action", "clear", "--key", "profile");
    expect(logs).toEqual(["config: set profile=emma", "emma", "config: cleared profile"]);
  });

  it("prints each array item on its own line", () => {
    write("config.yml", "urls:\n  - a\n  - b\n");
    run("--action", "get", "--key", "urls");
    expect(logs).toEqual(["a", "b"]);
  });

  it("prints the migration lines before the set confirmation", () => {
    write("profile", "digismith\n");
    run("--action", "set", "--key", "role", "--value", "worker");
    expect(logs[0]).toBe(`config: migrated ${path.join(dir, "profile")} into ${path.join(dir, "config.yml")}`);
    expect(logs[logs.length - 1]).toBe("config: set role=worker");
  });

  it("runs migrate", () => {
    run("--action", "migrate");
    expect(logs).toEqual(["config: nothing to migrate"]);
  });

  it("fails clearly on a missing action, a missing key, an unknown action and a parse error", () => {
    run();
    run("--action", "get");
    run("--action", "list");
    write("config.yml", "oops\n");
    run("--action", "get", "--key", "profile");
    expect(errors).toEqual([
      "config: failed (missing required flag: --action)",
      "config: failed (missing required flag: --key)",
      "config: failed (unknown action: list)",
      `config: failed (${path.join(dir, "config.yml")} line 1: expected 'key: value')`,
    ]);
    expect(process.exitCode).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run scripts/config.test.ts`
Expected: FAIL, `setKey is not a function` (or a missing-export error).

- [ ] **Step 3: Write the implementation**

Add these imports at the top of `scripts/config.ts`:

```ts
import { parseArgs, requireArgs } from "./cli-args.ts";
import { clearInText, formatScalar, splitKey } from "./config-write.ts";
```

(Merge `clearInText`, `formatScalar` and `splitKey` into the existing `./config-write.ts` import line.)

Append to `scripts/config.ts`:

```ts
export type WriteCheck = { kind: "write" } | { kind: "migrate" } | { kind: "stop"; message: string };
export type WriteResult = { migration: MigrateReport | null };

export function checkWrite(dir = DEFAULT_DIR): WriteCheck {
  const present = LEGACY_FILES.filter((file) => fs.existsSync(path.join(dir, file)));
  if (present.length === 0) return { kind: "write" };
  const root = checkoutRoot(dir);
  if (isLinkedWorktree(root)) return { kind: "stop", message: worktreeMessage(root) };
  const tracked = present.filter((file) => isTracked(root, path.join(path.resolve(dir), file)));
  if (tracked.length === 0) return { kind: "migrate" };
  const message = [
    `git tracks ${tracked.map((file) => path.join(dir, file)).join(", ")}, so this write needs a migration commit first. Run these in ${root}, then try again:`,
    `  ${migrateCommand(dir)}`,
    ...commitCommands(dir, present).map((command) => `  ${command}`),
  ].join("\n");
  return { kind: "stop", message };
}

function prepareWrite(dir: string): MigrateReport | null {
  const check = checkWrite(dir);
  if (check.kind === "stop") throw new ConfigError(check.message);
  return check.kind === "migrate" ? migrate(dir) : null;
}

export function setKey(key: string, value: string, dir = DEFAULT_DIR): WriteResult {
  splitKey(key);
  formatScalar(value);
  const migration = prepareWrite(dir);
  const file = path.join(dir, CONFIG_FILE);
  writeAtomic(file, setInText(readTextIfPresent(file) ?? "", key, value, file));
  return { migration };
}

export function clearKey(key: string, dir = DEFAULT_DIR): WriteResult {
  splitKey(key);
  const migration = prepareWrite(dir);
  const file = path.join(dir, CONFIG_FILE);
  const text = readTextIfPresent(file);
  if (text !== undefined) {
    const next = clearInText(text, key, file);
    if (next !== text) writeAtomic(file, next);
  }
  return { migration };
}

export function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const dir = args.dir ?? DEFAULT_DIR;
  try {
    requireArgs(args, ["action"]);
    switch (args.action) {
      case "get": {
        requireArgs(args, ["key"]);
        const hit = resolve(args.key, dir);
        if (!hit) console.log("unset");
        else if (Array.isArray(hit.value)) for (const item of hit.value) console.log(item);
        else console.log(hit.value);
        return;
      }
      case "set": {
        requireArgs(args, ["key", "value"]);
        const { migration } = setKey(args.key, args.value, dir);
        if (migration) for (const line of formatMigrateReport(migration, dir)) console.log(line);
        console.log(`config: set ${args.key}=${args.value}`);
        return;
      }
      case "clear": {
        requireArgs(args, ["key"]);
        const { migration } = clearKey(args.key, dir);
        if (migration) for (const line of formatMigrateReport(migration, dir)) console.log(line);
        console.log(`config: cleared ${args.key}`);
        return;
      }
      case "migrate":
        for (const line of formatMigrateReport(migrate(dir), dir)) console.log(line);
        return;
      default:
        throw new ConfigError(`unknown action: ${args.action}`);
    }
  } catch (err) {
    console.error(`config: failed (${(err as Error).message})`);
    process.exitCode = 1;
  }
}

if (import.meta.filename === process.argv[1]) {
  main();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run scripts/config.test.ts scripts/config-write.test.ts scripts/config-parse.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/config.ts scripts/config.test.ts
git commit -m "feat(config): add guarded writes and the config CLI"
```

---

### Task 6: `preferences.ts` wrapper and the voice scripts

**Files:**
- Rewrite: `scripts/preferences.ts`, `scripts/preferences.test.ts`
- Modify: `scripts/voice.ts`, `scripts/voice-init.ts`, `scripts/voice.test.ts`, `scripts/voice-init.test.ts`

**Interfaces:**
- Consumes (Tasks 3-5): `DEFAULT_DIR`, `PREFERENCES_SECTION`, `resolve`, `setKey`, `clearKey`, `migrate`, `formatMigrateReport`, `WriteResult`.
- Produces (in `scripts/preferences.ts`):
  - `DEFAULT_DIR` (re-export)
  - `getPreference(key: string, dir = DEFAULT_DIR): string | undefined` (reads `preferences.<key>`)
  - `setPreference(key: string, value: string, dir = DEFAULT_DIR): WriteResult`
  - `clearPreference(key: string, dir = DEFAULT_DIR): WriteResult`
  - `main(): void` (`--key`, `--action get|set|clear|migrate`, `--value`, `--dir`)
  - Removed: `DEFAULT_PREFERENCES_PATH`, `readPreferences`.
- `voice.ts` functions keep their names and signatures, but the second parameter is now the `.digismith` folder (`dir`), not a file path. `voice.ts --path` becomes `--dir`.

- [ ] **Step 1: Write the failing tests**

Replace `scripts/preferences.test.ts` with:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { HEADER } from "./config-write.ts";
import { DEFAULT_DIR, clearPreference, getPreference, main, setPreference } from "./preferences.ts";

let tmpDir: string;
let dir: string;
let configPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-prefs-test-"));
  dir = path.join(tmpDir, ".digismith");
  configPath = path.join(dir, "config.yml");
  process.env.GIT_CEILING_DIRECTORIES = fs.realpathSync.native(path.dirname(tmpDir));
});

afterEach(() => {
  delete process.env.GIT_CEILING_DIRECTORIES;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function write(name: string, content: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), content);
}

describe("DEFAULT_DIR", () => {
  it("locks the documented default folder", () => {
    expect(DEFAULT_DIR).toBe(".digismith");
  });
});

describe("getPreference", () => {
  it("returns undefined when nothing is set", () => {
    expect(getPreference("finish_option", dir)).toBeUndefined();
  });

  it("reads preferences.<key> from config.yml", () => {
    write("config.yml", "preferences:\n  finish_option: merge_locally\n");
    expect(getPreference("finish_option", dir)).toBe("merge_locally");
  });

  it("falls back to the flat key in the old preferences.yml", () => {
    write("preferences.yml", "finish_option: pr\n");
    expect(getPreference("finish_option", dir)).toBe("pr");
  });

  it("ignores a top-level key of the same name in config.yml", () => {
    write("config.yml", "finish_option: pr\n");
    expect(getPreference("finish_option", dir)).toBeUndefined();
  });
});

describe("setPreference / clearPreference", () => {
  it("writes the key under the preferences heading", () => {
    setPreference("finish_option", "merge_locally", dir);
    expect(fs.readFileSync(configPath, "utf8")).toBe(`${HEADER}\n\npreferences:\n  finish_option: merge_locally\n`);
  });

  it("updates in place and keeps other keys", () => {
    setPreference("finish_option", "merge_locally", dir);
    setPreference("ssh_key", "/k", dir);
    setPreference("finish_option", "pr", dir);
    expect(getPreference("finish_option", dir)).toBe("pr");
    expect(getPreference("ssh_key", dir)).toBe("/k");
  });

  it("clears a key and leaves the others", () => {
    setPreference("finish_option", "pr", dir);
    setPreference("ssh_key", "/k", dir);
    clearPreference("finish_option", dir);
    expect(getPreference("finish_option", dir)).toBeUndefined();
    expect(getPreference("ssh_key", dir)).toBe("/k");
  });

  it("clear is a no-op when no file exists", () => {
    clearPreference("finish_option", dir);
    expect(fs.existsSync(configPath)).toBe(false);
  });

  it("migrates an untracked old preferences.yml before it writes", () => {
    write("preferences.yml", "ssh_key: /k\n");
    const result = setPreference("finish_option", "pr", dir);
    expect(result.migration?.moved).toEqual(["preferences.yml"]);
    expect(getPreference("ssh_key", dir)).toBe("/k");
    expect(fs.existsSync(path.join(dir, "preferences.yml.migrated"))).toBe(true);
  });
});

describe("main (CLI)", () => {
  let originalArgv: string[];

  beforeEach(() => {
    originalArgv = process.argv;
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  function run(...args: string[]): void {
    process.argv = ["node", "preferences.ts", ...args, "--dir", dir];
    main();
  }

  it('prints "unset" for a get on a key that was never set', () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    run("--key", "finish_option", "--action", "get");
    expect(logSpy).toHaveBeenCalledWith("unset");
  });

  it("writes the value and prints a confirmation for set", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    run("--key", "finish_option", "--action", "set", "--value", "merge_locally");
    expect(logSpy).toHaveBeenCalledWith("preferences: set finish_option=merge_locally");
    expect(getPreference("finish_option", dir)).toBe("merge_locally");
  });

  it("prints the set value back on a subsequent get", () => {
    setPreference("finish_option", "pr", dir);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    run("--key", "finish_option", "--action", "get");
    expect(logSpy).toHaveBeenCalledWith("pr");
  });

  it("clears a key and prints a confirmation", () => {
    setPreference("finish_option", "pr", dir);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    run("--key", "finish_option", "--action", "clear");
    expect(logSpy).toHaveBeenCalledWith("preferences: cleared finish_option");
    expect(getPreference("finish_option", dir)).toBeUndefined();
  });

  it("runs migrate without --key", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    run("--action", "migrate");
    expect(logSpy).toHaveBeenCalledWith("config: nothing to migrate");
  });

  it("fails clearly when --value is missing for a set action", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    run("--key", "finish_option", "--action", "set");
    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith("preferences: failed (missing required flag: --value)");
  });

  it("fails clearly when a required flag is missing", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    run("--action", "get");
    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith("preferences: failed (missing required flag: --key)");
  });

  it("fails clearly on an unknown action", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    run("--key", "finish_option", "--action", "list");
    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith("preferences: failed (unknown action: list)");
  });

  it("fails clearly on a config.yml parse error", () => {
    write("config.yml", "oops\n");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    run("--key", "finish_option", "--action", "get");
    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(`preferences: failed (${configPath} line 1: expected 'key: value')`);
  });
});
```

In `scripts/voice.test.ts`, make these changes:

1. In every `describe` block, replace `prefsPath = path.join(tmpDir, "preferences.yml");` with `dir = path.join(tmpDir, ".digismith");`, and rename the `let prefsPath: string;` declarations to `let dir: string;`. Replace every other use of `prefsPath` with `dir`.
2. Add this helper after the imports:

```ts
function writeConfig(dir: string, body: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.yml"), `preferences:\n${body}`);
}
```

3. Replace each `fs.writeFileSync(prefsPath, "<lines>")` with `writeConfig(dir, "<lines, each indented 2 spaces>")`. For example, `fs.writeFileSync(prefsPath, "technical_voice: off\nconversation_voice: off\n")` becomes `writeConfig(dir, "  technical_voice: off\n  conversation_voice: off\n")`.
4. In the `setVoice` block, replace `fs.readFileSync(prefsPath, "utf8")` with `fs.readFileSync(path.join(dir, "config.yml"), "utf8")`. The `toContain("technical_voice: off")` checks stay as they are.
5. In the `main (CLI)` block, replace every `"--path", prefsPath` with `"--dir", dir`.
6. Add this test to the `resolveVoice / resolveAllVoices` block:

```ts
  it("still reads an old flat preferences.yml", () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "preferences.yml"), "technical_voice: off\n");
    expect(resolveVoice("technical", dir)).toBe("off");
  });
```

7. Add this test to the `main (CLI)` block:

```ts
  it("status fails clearly on a config.yml parse error", () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "config.yml"), "oops\n");
    process.argv = ["node", "voice.ts", "--action", "status", "--dir", dir];
    main();
    expect(errors).toEqual([`voice: failed (${path.join(dir, "config.yml")} line 1: expected 'key: value')`]);
    expect(process.exitCode).toBe(1);
  });
```

In `scripts/voice-init.test.ts`, replace each `setVoice(..., ".digismith/preferences.yml")` with `setVoice(..., ".digismith")`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run scripts/preferences.test.ts scripts/voice.test.ts scripts/voice-init.test.ts`
Expected: FAIL. `preferences.test.ts` fails on the `DEFAULT_DIR` import, and `voice.test.ts` fails because `--dir` is not read yet.

- [ ] **Step 3: Write the implementation**

Replace `scripts/preferences.ts` with:

```ts
import { parseArgs, requireArgs } from "./cli-args.ts";
import {
  DEFAULT_DIR,
  PREFERENCES_SECTION,
  clearKey,
  formatMigrateReport,
  migrate,
  resolve,
  setKey,
  type WriteResult,
} from "./config.ts";

export { DEFAULT_DIR };

// Callers keep bare names: --key finish_option means preferences.finish_option.
function address(key: string): string {
  return `${PREFERENCES_SECTION}.${key}`;
}

export function getPreference(key: string, dir = DEFAULT_DIR): string | undefined {
  const hit = resolve(address(key), dir);
  return typeof hit?.value === "string" ? hit.value : undefined;
}

export function setPreference(key: string, value: string, dir = DEFAULT_DIR): WriteResult {
  return setKey(address(key), value, dir);
}

export function clearPreference(key: string, dir = DEFAULT_DIR): WriteResult {
  return clearKey(address(key), dir);
}

function printMigration(result: WriteResult, dir: string): void {
  if (result.migration) for (const line of formatMigrateReport(result.migration, dir)) console.log(line);
}

export function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const dir = args.dir ?? DEFAULT_DIR;

  try {
    requireArgs(args, args.action === "migrate" ? ["action"] : ["key", "action"]);
    switch (args.action) {
      case "get": {
        const value = getPreference(args.key, dir);
        console.log(value === undefined ? "unset" : value);
        return;
      }
      case "set": {
        requireArgs(args, ["value"]);
        printMigration(setPreference(args.key, args.value, dir), dir);
        console.log(`preferences: set ${args.key}=${args.value}`);
        return;
      }
      case "clear": {
        printMigration(clearPreference(args.key, dir), dir);
        console.log(`preferences: cleared ${args.key}`);
        return;
      }
      case "migrate":
        for (const line of formatMigrateReport(migrate(dir), dir)) console.log(line);
        return;
      default:
        throw new Error(`unknown action: ${args.action}`);
    }
  } catch (err) {
    console.error(`preferences: failed (${(err as Error).message})`);
    process.exitCode = 1;
  }
}

if (import.meta.filename === process.argv[1]) {
  main();
}
```

In `scripts/voice.ts`:

1. Change the first import to `import { getPreference, setPreference, DEFAULT_DIR } from "./preferences.ts";`.
2. Rename the `filePath: string` parameter of `resolveVoice`, `resolveAllVoices` and `setVoice` to `dir: string`, and pass `dir` through.
3. In `main()`, replace `const filePath = args.path ?? DEFAULT_PREFERENCES_PATH;` with `const dir = args.dir ?? DEFAULT_DIR;`, and use `dir` in place of `filePath`.
4. Wrap the whole `switch` in `main()` in a `try`/`catch` that prints `voice: failed (<message>)` and sets `process.exitCode = 1`:

```ts
  try {
    switch (action) {
      // existing cases, unchanged apart from filePath -> dir
    }
  } catch (err) {
    console.error(`voice: failed (${(err as Error).message})`);
    process.exitCode = 1;
  }
```

In `scripts/voice-init.ts`, replace the body with:

```ts
import { AXES, resolveAllVoices } from "./voice.ts";
import { DEFAULT_DIR } from "./preferences.ts";

export default async function voiceInit(): Promise<string | null> {
  const state = resolveAllVoices(DEFAULT_DIR);
  const on = AXES.filter((axis) => state[axis] === "on");
  return on.length > 0 ? on.join("+") : null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run scripts/preferences.test.ts scripts/voice.test.ts scripts/voice-init.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/preferences.ts scripts/preferences.test.ts scripts/voice.ts scripts/voice-init.ts scripts/voice.test.ts scripts/voice-init.test.ts
git commit -m "refactor(preferences): store preferences under the preferences heading in config.yml"
```

---

### Task 7: SessionStart hook reads the profile through the shared reader

**Files:**
- Modify: `scripts/session-init.ts`
- Test: `scripts/session-init.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_DIR`, `resolve` (Task 3); `ConfigError` (Task 1).
- Produces:
  - `readProfile(dir: string): string | undefined` (parameter is now the `.digismith` folder)
  - `buildBanner(dir: string, voiceInitPath: string): Promise<string | null>`
  - Removed: `DEFAULT_PROFILE_PATH`.
  - `main()` prints `DigiSmith: warning: <ConfigError message>` on a config error, skips the banner, keeps the other output, and leaves `process.exitCode` unset. Any other error keeps today's `session-init: failed (...)` on stderr with exit code 1.

- [ ] **Step 1: Write the failing tests**

In `scripts/session-init.test.ts`:

1. Remove `DEFAULT_PROFILE_PATH` from the import list. Replace the `constants` block's first test with nothing (keep the `VOICE_INIT_FILENAME` test).
2. Replace the whole `describe("readProfile", ...)` block with:

```ts
describe("readProfile", () => {
  let tmpDir: string;
  let dir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-session-init-test-"));
    dir = path.join(tmpDir, ".digismith");
    fs.mkdirSync(dir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns undefined when no profile is set", () => {
    expect(readProfile(dir)).toBeUndefined();
  });

  it("reads profile from config.yml", () => {
    fs.writeFileSync(path.join(dir, "config.yml"), "profile: emma\n");
    expect(readProfile(dir)).toBe("emma");
  });

  it("falls back to the trimmed content of .digismith/profile", () => {
    fs.writeFileSync(path.join(dir, "profile"), "emma\n");
    expect(readProfile(dir)).toBe("emma");
  });

  it("returns undefined for a whitespace-only old profile file", () => {
    fs.writeFileSync(path.join(dir, "profile"), "   \n");
    expect(readProfile(dir)).toBeUndefined();
  });

  it("throws a ConfigError for an old profile file that is not UTF-8", () => {
    fs.writeFileSync(path.join(dir, "profile"), Buffer.from([0xff, 0xfe]));
    expect(() => readProfile(dir)).toThrow(ConfigError);
  });
});
```

Add `import { ConfigError } from "./config-parse.ts";` to the imports.

3. In `describe("buildBanner", ...)`, replace `profilePath = path.join(tmpDir, "profile");` with `dir = path.join(tmpDir, ".digismith"); fs.mkdirSync(dir);` (rename the variable), replace `fs.writeFileSync(profilePath, "emma\n")` with `fs.writeFileSync(path.join(dir, "config.yml"), "profile: emma\n")`, and pass `dir` to `buildBanner`.

4. In `describe("main (CLI)", ...)`, replace the test "surfaces a stderr warning and a non-zero exit code on an unexpected read error" with these three tests:

```ts
  it("prints the banner from config.yml", async () => {
    fs.mkdirSync(path.join(tmpDir, ".digismith"));
    fs.writeFileSync(path.join(tmpDir, ".digismith", "config.yml"), "profile: emma\n");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await main();

    expect(logSpy).toHaveBeenCalledWith("DigiSmith: profile=emma, voices=technical+conversation");
  });

  it("prints one warning line and exits 0 on a config.yml parse error", async () => {
    fs.mkdirSync(path.join(tmpDir, ".digismith"));
    fs.writeFileSync(path.join(tmpDir, ".digismith", "config.yml"), "profile digismith\n");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await main();

    expect(logSpy).toHaveBeenCalledWith(
      "DigiSmith: warning: .digismith/config.yml line 1: expected 'key: value'",
    );
    expect(logSpy.mock.calls.flat().some((line) => String(line).startsWith("DigiSmith: profile="))).toBe(false);
    expect(process.exitCode).not.toBe(1);
  });

  it("keeps a stderr failure and exit code 1 for an error that is not a config error", async () => {
    fs.mkdirSync(path.join(tmpDir, ".digismith", "config.yml"), { recursive: true });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await main();

    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("session-init: failed"));
  });
```

(`config.yml` as a folder makes `readFileSync` fail with `EISDIR`, which is not a `ConfigError`.)

5. Replace the test "still prints the attribution reminder when buildBanner throws, in DigiSmith's own repo" with:

```ts
  it("still prints the attribution reminder and the lineage pointer on a config error", async () => {
    fs.mkdirSync(path.join(tmpDir, ".claude-plugin"));
    fs.writeFileSync(
      path.join(tmpDir, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "digismith", version: "1.0.0" }),
    );
    writeNote(tmpDir, ".digismith/docs/A/A.0/handoff.md");
    fs.writeFileSync(path.join(tmpDir, ".digismith", "profile"), Buffer.from([0xff, 0xfe]));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await main();

    expect(logSpy).toHaveBeenCalledWith("DigiSmith: no AI attribution in commits or PRs — no exceptions");
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("DigiSmith: lineage handoff notes in"));
    expect(logSpy).toHaveBeenCalledWith("DigiSmith: warning: .digismith/profile: not valid UTF-8");
    expect(process.exitCode).not.toBe(1);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run scripts/session-init.test.ts`
Expected: FAIL. `readProfile` still reads a file path, and `main` still prints `session-init: failed` for the UTF-8 case.

- [ ] **Step 3: Write the implementation**

In `scripts/session-init.ts`:

1. Remove `export const DEFAULT_PROFILE_PATH = ".digismith/profile";`.
2. Add the imports:

```ts
import { DEFAULT_DIR, resolve } from "./config.ts";
import { ConfigError } from "./config-parse.ts";
```

3. Replace `readProfile` with:

```ts
export function readProfile(dir: string): string | undefined {
  const value = resolve("profile", dir)?.value;
  return typeof value === "string" && value.trim() ? value : undefined;
}
```

4. Replace `buildBanner` with:

```ts
export async function buildBanner(dir: string, voiceInitPath: string): Promise<string | null> {
  const profile = readProfile(dir);
  if (profile === undefined) return null;
  const voiceSummary = await loadVoiceSummary(voiceInitPath);
  return formatBanner(profile, voiceSummary);
}
```

5. In `main()`, replace the banner `try`/`catch` with:

```ts
  try {
    const banner = await buildBanner(DEFAULT_DIR, path.join(scriptDir, VOICE_INIT_FILENAME));
    if (banner) console.log(banner);
  } catch (err) {
    if (err instanceof ConfigError) {
      console.log(`DigiSmith: warning: ${err.message}`);
    } else {
      console.error(`session-init: failed (${(err as Error).message})`);
      process.exitCode = 1;
    }
  }
```

`DEFAULT_DIR` is relative, so it resolves against `process.cwd()` exactly as `path.join(process.cwd(), ".digismith/profile")` did. The relative path also gives the `.digismith/config.yml line <n>` message shape from the design.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run scripts/session-init.test.ts scripts/voice-init.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/session-init.ts scripts/session-init.test.ts
git commit -m "refactor(session-init): read the profile through the shared config reader"
```

---

### Task 8: `model_offload.ts` reads the profile through the shared reader

**Files:**
- Modify: `scripts/model_offload.ts`, `scripts/model_offload.test.ts`
- Modify: `skills/report-implementation/SKILL.md` (the `--profile-path` line in Step 3)

**Interfaces:**
- Consumes: `resolve` (Task 3).
- Produces: `readProfileProvider(dir: string): string | null` and `offload(prompt: string, dir: string)`. The CLI flag `--profile-path` is replaced by `--dir` (default `.digismith`).

- [ ] **Step 1: Write the failing tests**

In `scripts/model_offload.test.ts`:

1. In `describe("readProfileProvider", ...)`, replace

```ts
    pointerFile = join(tempRepoDir, "profile-pointer");
    writeFileSync(pointerFile, "digismith");
```

with

```ts
    pointerFile = join(tempRepoDir, ".digismith");
    mkdirSync(pointerFile);
    writeFileSync(join(pointerFile, "profile"), "digismith");
```

(`pointerFile` now names the `.digismith` folder. Keep the variable name so the other tests in the block stay unchanged.) Replace `readProfileProvider("/nonexistent/path/profile")` with `readProfileProvider("/nonexistent/path/.digismith")`.

2. Add these tests to the same block:

```ts
  it("reads the profile from config.yml", () => {
    writeFileSync(join(pointerFile, "profile"), "other");
    writeFileSync(join(pointerFile, "config.yml"), "profile: digismith\n");
    expect(readProfileProvider(pointerFile)).toBe("chutes");
  });

  it("returns null when config.yml does not parse", () => {
    writeFileSync(join(pointerFile, "config.yml"), "oops\n");
    expect(readProfileProvider(pointerFile)).toBeNull();
  });
```

3. In `describe("offload", ...)`, replace

```ts
    profilePath = join(tempRepoDir, "profile-pointer");
    writeFileSync(profilePath, "digismith");
```

with

```ts
    profilePath = join(tempRepoDir, ".digismith");
    mkdirSync(profilePath);
    writeFileSync(join(profilePath, "config.yml"), "profile: digismith\n");
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run scripts/model_offload.test.ts`
Expected: FAIL. `readProfileProvider` treats the folder as a file and returns `null`.

- [ ] **Step 3: Write the implementation**

In `scripts/model_offload.ts`:

1. Add `import { resolve } from "./config.ts";`.
2. Replace the start of `readProfileProvider` (from the signature through `if (!profileName) return null;`) with:

```ts
export function readProfileProvider(dir: string): string | null {
  let profileName: string | undefined;
  try {
    const value = resolve("profile", dir)?.value;
    profileName = typeof value === "string" ? value : undefined;
  } catch {
    return null;
  }
  if (!profileName) return null;
```

The rest of the function stays the same.

3. Rename `offload`'s second parameter from `profilePath` to `dir` and pass it to `readProfileProvider(dir)`.
4. In `main()`, replace `const profilePath = args["profile-path"] ?? ".digismith/profile";` with `const dir = args.dir ?? ".digismith";` and call `offload(prompt, dir)`.

In `skills/report-implementation/SKILL.md` Step 3, replace

```
`node scripts/model_offload.ts --prompt-file <prompt-file>
--profile-path .digismith/profile`.
```

with

```
`node scripts/model_offload.ts --prompt-file <prompt-file>
--dir .digismith`.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run scripts/model_offload.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/model_offload.ts scripts/model_offload.test.ts skills/report-implementation/SKILL.md
git commit -m "refactor(model-offload): read the profile through the shared config reader"
```

---

### Task 9: Profile rules in the reading skills

**Files (all `skills/<name>/SKILL.md`):** `init`, `capture-ephemeral-url`, `inject-standards`, `jira-progress-write-back`, `report-implementation`, `brainstorming`, `writing-plans`.

**Interfaces:**
- Consumes: the two exact sentences in Global Constraints. Below, **P** is the presence sentence and **R** is the read sentence. Copy them character for character, including backticks and the final period.

- [ ] **Step 1: Record the current mentions**

Run: `grep -n "\.digismith/profile" skills/init/SKILL.md skills/capture-ephemeral-url/SKILL.md skills/inject-standards/SKILL.md skills/jira-progress-write-back/SKILL.md skills/report-implementation/SKILL.md skills/brainstorming/SKILL.md skills/writing-plans/SKILL.md`
Expected: the lines listed in Step 2 below.

- [ ] **Step 2: Edit each skill**

`skills/capture-ephemeral-url/SKILL.md`, Step 0:
- Replace `Check for \`.digismith/profile\` in the repo the PR was opened in.` with `Check for a profile in the repo the PR was opened in. ` + **P**
- Replace `**Present** → read its one-line content as the active profile name.` with `**Present** → ` + **R** + ` Use that value as the active profile name.`
- Replace `as if \`.digismith/profile\` were missing — continue to Step 1.` with `as if no profile were present — continue to Step 1.`
- Quick Reference row 0: replace `` `.digismith/profile` present `` with `profile present (Step 0 rule)`.

`skills/inject-standards/SKILL.md`, Step 0:
- Replace `Check for \`.digismith/profile\` in the repo currently being worked in` with `Check for a profile in the repo currently being worked in`, and after the sentence that ends `themselves live).` add a new sentence: **P**
- Replace `**Present** → read its one-line content as the active profile name.` with `**Present** → ` + **R** + ` Use that value as the active profile name.`
- Replace `as if \`.digismith/profile\` were missing (the "Missing" branch above)` with `as if no profile were present (the "Missing" branch above)`.
- Replace `skill doesn't rewrite \`.digismith/profile\` itself.` with `skill doesn't rewrite the profile itself.`
- Step 0.5: replace ``Read `.digismith/preferences.yml`'s `technical_voice` and`` with ``Read the `technical_voice` and``. Replace `A missing or malformed value reads as \`on\`` with `A missing value, or a read that fails because \`.digismith/config.yml\` does not parse, reads as \`on\``.
- Quick Reference row 0: replace `` `.digismith/profile` present `` with `profile present (Step 0 rule)`.

`skills/jira-progress-write-back/SKILL.md`, Step 0:
- Replace `Check for \`.digismith/profile\` in the repo currently being worked in.` with `Check for a profile in the repo currently being worked in. ` + **P**
- Replace `**Present** → read its one-line content as the active profile name.` with `**Present** → ` + **R** + ` Use that value as the active profile name.`
- Replace `proceed as if \`.digismith/profile\` were\nmissing` (the sentence that spans two lines) with `proceed as if no profile were\npresent`.

`skills/report-implementation/SKILL.md`:
- Prerequisites: replace `Check for\n\`.digismith/profile\` in the repo currently being worked in (never\nDigiSmith's own repo, which only hosts this skill).` with `Check for a\nprofile in the repo currently being worked in (never DigiSmith's own\nrepo, which only hosts this skill). ` + **P**
- Prerequisites, the **Present** bullet: replace `read its one-line content as the active profile name,` with **R** + ` Use that value as the active profile name,`.
- Step 1 item 5: replace `Then check for\n   \`.digismith/profile\` in the repo currently being worked in` with `Then check for\n   a profile in the repo currently being worked in`. Replace `Present → read its one-line content as the\n   active profile name,` with `Present → use the profile name Prerequisites read,`.
- Error Handling: replace `(No \`.digismith/profile\`, a stale one,` with `(No profile present, a stale one,`.

`skills/init/SKILL.md`:
- Step 0, first paragraph: replace `` `.digismith/profile` is repo-level config, chosen once and persisted in the `` with `The profile is repo-level config, chosen once and persisted in the`. After that paragraph, add a new paragraph: **P**
- Item 1: replace `regardless of whether \`.digismith/profile\` exists here. The profile\n   file living in the original checkout` with `regardless of whether a profile is present here. The profile\n   living in the original checkout`.
- Item 2: replace `**Not on the base branch, and \`.digismith/profile\` is present**` with `**Not on the base branch, and a profile is present**`. Replace `Read the profile's one-line content as\n     \`<name>\` and report plainly:` with **R** + ` Use that value as\n     \`<name>\` and report plainly:`. Replace `→ the profile file is present (inherited from the` with `→ a profile is present (inherited from the`.
- Item 3: replace `` **Not on the base branch, `.digismith/profile` absent** `` with `**Not on the base branch, no profile present**`.
- Error Handling first bullet: replace `` **`.digismith/profile` present, not on the base branch, and `` with `**A profile present, not on the base branch, and`.

`skills/brainstorming/SKILL.md` and `skills/writing-plans/SKILL.md`, the "DigiSmith-tracked work" bullet:
- Replace `` or `.digismith/profile` is present) `` with `or a profile is present)`.
- Add **P** as its own paragraph directly above that bullet: between the `**Documentation:**` line and the bullet in brainstorming, and between the `**Save plans to:**` line and the bullet in writing-plans. Leave one blank line above and below it.

- [ ] **Step 3: Verify the edits**

Run:

```bash
grep -rn "\.digismith/profile" skills/init skills/capture-ephemeral-url skills/inject-standards skills/jira-progress-write-back skills/report-implementation skills/brainstorming skills/writing-plans | grep -v "(A.2 fallback)"
```

Expected: no output.

Run:

```bash
grep -rhoF 'A profile is present when `.digismith/config.yml` has a `profile` key, or when `.digismith/profile` exists (A.2 fallback).' skills | wc -l
grep -rhoF 'Read `profile` from `.digismith/config.yml`, or from `.digismith/profile` when `config.yml` or its `profile` key is missing (A.2 fallback).' skills | wc -l
grep -rn "(A.2 fallback)" skills | wc -l
```

Expected: `7`, `5`, `12`. (P in all 7 skills. R in capture-ephemeral-url, inject-standards, jira-progress-write-back, report-implementation, init. Every `(A.2 fallback)` is inside one of the two sentences.)

- [ ] **Step 4: Commit**

```bash
git add skills/init/SKILL.md skills/capture-ephemeral-url/SKILL.md skills/inject-standards/SKILL.md skills/jira-progress-write-back/SKILL.md skills/report-implementation/SKILL.md skills/brainstorming/SKILL.md skills/writing-plans/SKILL.md
git commit -m "docs(skills): read the profile from config.yml with the A.2 fallback"
```

---

### Task 10: `bootstrap` and `adopt`: migrate check, profile write, one copy step

**Files:**
- Modify: `skills/bootstrap/SKILL.md`, `skills/adopt/SKILL.md`

**Interfaces:**
- Consumes: P and R (Global Constraints); `config.ts --action migrate` and `--action set --key profile` (Task 5).

- [ ] **Step 1: Edit `skills/bootstrap/SKILL.md`**

Step 0:
- Replace `Check for \`.digismith/profile\` in the repo currently being worked in\n(never DigiSmith's own repo).` with `Check for a profile in the repo currently being worked in (never\nDigiSmith's own repo). ` + **P**
- Directly after that paragraph, add:

```markdown
**Old config files.** If `.digismith/profile` or `.digismith/preferences.yml`
exists here, check each one with `git ls-files --error-unmatch -- <file>`
(exit 0 means git tracks it). Locate DigiSmith's own repo the same way
`digismith:preferences` does under Operations.

- **Git tracks neither** (gitignored, untracked, or not a git repo) → run
  `node --experimental-strip-types <digismith-repo>/scripts/config.ts --action migrate`
  here and show its output. This is a plain file move, never a commit.
  If the command fails (for example, this is a linked worktree), show its
  message and continue on the fallback.
- **Git tracks one or both** → do not migrate, and never commit on the
  base branch. Tell the user to run, in this checkout: the same
  `config.ts --action migrate` command, then
  `git add .digismith/config.yml` plus each moved old path and its
  `.migrated` path, then
  `git commit -m "chore(config): migrate to .digismith/config.yml"`.
  Continue the ticket flow. The old files stay readable through the
  fallback.
```

- Replace `**Present** → read its one-line content as the active profile name.` with `**Present** → ` + **R** + ` Use that value as the active profile name.`
- Item 5: replace `Write the chosen profile's \`name\` field, and only that, as the sole\n   line of \`.digismith/profile\` in the repo being worked in.` with:

```markdown
5. Write the chosen profile's `name` field with
   `node --experimental-strip-types <digismith-repo>/scripts/config.ts --action set --key profile --value <name>`.
   It goes to `.digismith/config.yml`. If the command stops because git
   tracks an old config file, show its message and stop: this checkout
   must be migrated first.
```

- Replace the heading `` **`.digismith/profile` is config, not generated docs output.** `` with `` **`.digismith/config.yml` is config, not generated docs output.** ``. In that paragraph and its two bullets, replace each remaining `.digismith/profile` with `.digismith/config.yml`.
- Profile switch: replace `on confirmation overwrite\n\`.digismith/profile\` with the new name.` with `on confirmation run\n\`config.ts --action set --key profile --value <X>\` (same command as item 5).`

Steps 0.5 to 1.5:
- Replace `unrelated to \`.digismith/profile\` (Step 0)` with `unrelated to \`.digismith/config.yml\` (Step 0)`.
- Replace `Unlike \`.digismith/profile\` (Step 2.6)` with `Unlike \`.digismith/config.yml\` (Step 2.6)`.
- Step 0.6: replace `it lives only in this repo's own \`.digismith/preferences.yml\`, exactly\nwhere H's existing worktree-propagation copy step (sub-step 8 of Step 2)` with `it lives only in this repo's own \`.digismith/config.yml\` (under\n\`preferences:\`), exactly where the worktree copy step (sub-step 6 of Step 2)`.
- Step 0.7: replace `live in the same \`.digismith/preferences.yml\` that sub-step already copies.` with `live in the same \`.digismith/config.yml\` that sub-step 6 already copies.` and replace `beyond what\nsub-step 8 of Step 2 already does` with `beyond what\nsub-step 6 of Step 2 already does`.
- Step 1.5: replace `` `.digismith/profile` at all, skip the rest `` with `profile present at all, skip the rest`.

Step 2:
- Replace the whole of sub-step 6 (from `6. **Make \`.digismith/profile\` visible inside the worktree.**` to the end of that item) with:

```markdown
6. **Make the config files visible inside the worktree.** Whichever of
   2.3 or 2.5 produced the worktree you're now in, copy each of
   `.digismith/config.yml`, `.digismith/profile` and
   `.digismith/preferences.yml` that exists in the checkout Step 0 ran in
   but not in `<worktree-path>/.digismith/`: a plain file copy (create
   `<worktree-path>/.digismith/` first if needed), **not** `git add`,
   **not** `git add -f`, **not** a commit. A worktree checks out only
   committed files, and in a repo whose `.gitignore` carries a bare
   `.digismith/` line these files never arrive by git at all. If no
   profile is present in the worktree after the copy, run
   `config.ts --action set --key profile --value <name>` from inside it.
   If that command stops (the worktree guard: this worktree still has an
   old `.digismith/profile` or `.digismith/preferences.yml` that the copy
   just brought in), show its message and continue — the worktree keeps
   reading the profile through the fallback, same as any other
   pre-migration worktree. Do this **before** Step 3 hands off: a missing
   profile silently turns profiling off for the whole build.
```

- Replace the whole of sub-step 8 with:

```markdown
8. **`.digismith/preferences.yml`.** Nothing more to do: sub-step 6
   already copies it with the other config files when the original
   checkout still has one.
```

Error Handling and Quick Reference:
- Replace `` **`.digismith/profile` names a profile with no matching `` with `**The profile names a profile with no matching`.
- Replace the bullet that starts `` **`.digismith/profile` absent inside the worktree Step 2 produced** `` and the bullet that starts `` **`.digismith/preferences.yml` absent inside the worktree Step 2 `` with one bullet:

```markdown
- **Config files absent inside the worktree Step 2 produced** → expected,
  not an error: a worktree checks out only committed files. Copy them in
  from the original checkout (Step 2.6). Never resolve this with
  `git add -f` — the repo's `.digismith/` gitignore choice, if it has one,
  stands.
```

- Add this bullet to Error Handling:

```markdown
- **Git tracks an old config file in the original checkout** → don't
  migrate and don't commit on the base branch. Show the user the migrate
  and commit commands (Step 0), and continue the ticket flow on the
  fallback.
```

- Quick Reference row 0: replace `` Resolve `.digismith/profile` `` with ``Run the old-config-file check, then resolve the profile from `.digismith/config.yml` (fallback rule in Step 0)``. Keep the rest of the row. The string `(A.2 fallback)` must appear only in P and R.
- Quick Reference row 0.6: replace `` only to `.digismith/preferences.yml` `` with `` only to `.digismith/config.yml` under `preferences:` ``.
- Quick Reference row 2: replace `then **2.6** copy \`.digismith/profile\`,` with `then **2.6** copy \`.digismith/config.yml\`, \`.digismith/profile\` and \`.digismith/preferences.yml\` when present,` and remove `, and **2.8** copy \`.digismith/preferences.yml\` if the original checkout has one`.

- [ ] **Step 2: Edit `skills/adopt/SKILL.md`**

- Step 2: replace `the active profile and ensures \`.digismith/profile\` exists with the chosen\nname.` with `the active profile and ensures a profile is present with the chosen name,\nin \`.digismith/config.yml\`. ` + **P** + ` ` + **R**
- Add this sentence at the end of that paragraph: `It also runs bootstrap's old-config-file check (migrate where git does not track the old files, commands only where it does).`
- Step 5: replace the **Profile.** paragraph and the **Preferences.** paragraph with:

```markdown
**Config files.** Copy each of `.digismith/config.yml`,
`.digismith/profile` and `.digismith/preferences.yml` that exists in the
checkout Step 2 ran in but not in the worktree Step 4 left you in: a plain
file copy, never `git add`, never `git add -f`, never a commit — mirrors
`digismith:bootstrap` Step 2.6 exactly, same reasoning (a worktree checks
out only committed files).
```

- In the **Ticket docs.** paragraph, replace `Same reasoning\nas the profile copy above` with `Same reasoning\nas the config copy above`.
- Quick Reference row 5: replace `` Copy `.digismith/profile`, `.digismith/preferences.yml` (if the original checkout has one), `` with `` Copy `.digismith/config.yml`, `.digismith/profile` and `.digismith/preferences.yml` (each when present), ``.

- [ ] **Step 3: Verify the edits**

Run:

```bash
grep -n "\.digismith/profile\|preferences\.yml" skills/bootstrap/SKILL.md skills/adopt/SKILL.md
```

Expected: every remaining line is one of: the P or R sentence; the "Old config files" paragraph; the copy-step lists (`config.yml`, `profile` and `preferences.yml`); sub-step 8's heading; or the `git add` and `ls-files` commands.

Run: `grep -rn "(A.2 fallback)" skills | wc -l`
Expected: `16`. P is in 9 skills (Task 9's 7, plus bootstrap and adopt). R is in 7 skills (capture-ephemeral-url, inject-standards, jira-progress-write-back, report-implementation, init, bootstrap, adopt).

- [ ] **Step 4: Commit**

```bash
git add skills/bootstrap/SKILL.md skills/adopt/SKILL.md
git commit -m "docs(bootstrap): migrate old config files and copy config.yml into worktrees"
```

---

### Task 11: Storage docs: `digismith:preferences`, voice, toolchain, offload-implementer, README

**Files:**
- Modify: `skills/preferences/SKILL.md`, `skills/voice/SKILL.md`, `skills/toolchain/SKILL.md`, `skills/offload-implementer/SKILL.md`, `README.md`, `scripts/toolchain.ts` (comment only)

- [ ] **Step 1: Edit `skills/preferences/SKILL.md`**

- Frontmatter `description`: replace `persisted in \`.digismith/preferences.yml\`` with ``persisted under the `preferences:` heading of `.digismith/config.yml` ``.
- Replace the whole `## Storage` section body with:

````markdown
`.digismith/config.yml`, one per checkout (DigiSmith's own repo included,
no special-casing). Preference keys live under the `preferences:` heading.
The top level holds only the identity keys `profile` and `role`, which
belong to other skills:

```
# DigiSmith config for this checkout. Edit by hand or through digismith:preferences.
profile: digismith

preferences:
  finish_option: merge_locally
  ssh_key: /root/.ssh/jazurite_github
```

This skill's operations keep the bare key names: `--key finish_option`
reads and writes `preferences.finish_option`.

The file is a YAML subset read by a hand-written parser with no library:
top-level `key: value` lines, one level of headings with keys indented
exactly 2 spaces, string arrays as `- item` lines, and `#` comments. Every
value is a string. Anything outside the subset fails with
`<file> line <n>: <reason>`.

**Old files (A.2).** A checkout that is not migrated yet still has
`.digismith/preferences.yml` (flat `key: value`) and `.digismith/profile`.
Reads fall back to them one key at a time. A write in such a checkout
migrates it first when git does not track the old files, and stops with
the migrate and commit commands when git does. In a linked worktree that
still has an old file, a write stops and asks you to migrate the main
checkout.

Per-checkout scope only — no global tier yet. Where a repo's `.digismith/`
isn't gitignored, committing this file along with the rest of the work is
fine; where it is, it's written but never force-added. This skill never
runs `git add`/`git commit`/`git add -f` itself.
````

- Operations, `get`: replace the sentence that starts `Prints the value on stdout, or the literal \`unset\` if the key was never set,` and its continuation with: `Prints the value on stdout, or the literal \`unset\` if the key was never set or no file exists. If \`.digismith/config.yml\` does not parse, it fails with \`preferences: failed (<file> line <n>: <reason>)\` and exit 1.`
- Operations, `set`: replace `Writes \`<key>: <value>\` into \`.digismith/preferences.yml\`, creating the file\n(with the header comment) and its parent directory if either doesn't exist\nyet, and preserving every other key already set.` with `Writes \`<value>\` to \`preferences.<key>\` in \`.digismith/config.yml\`, creating the file (with the header comment), its folder and the \`preferences:\` heading when needed. It edits in place, so other keys, comments and order stay. If a migration ran first, its report lines print before the confirmation.`
- Replace the paragraph that starts `` `--path <path>` overrides the default `` with:

```markdown
`--dir <folder>` points every operation at a specific `.digismith` folder
when the caller's own cwd isn't the repo being worked in. A normal
invocation from inside that repo never needs it.

### `migrate`

```bash
node --experimental-strip-types <digismith-repo>/scripts/preferences.ts --action migrate
```

Merges `.digismith/profile` and `.digismith/preferences.yml` into
`.digismith/config.yml` and moves them aside to `*.migrated`. Run it in the
main checkout, never a linked worktree. It never commits. Where git tracks
the old files, it prints the exact `git add` and `git commit` commands.
```

- `## Worktree Propagation`: replace the paragraph with: `Copying \`.digismith/config.yml\` (and any old \`.digismith/profile\` or \`.digismith/preferences.yml\`) into a freshly created worktree is \`digismith:bootstrap\` Step 2 (sub-step 6) and \`digismith:adopt\` Step 5's job — this skill has no worktree-creation logic of its own.`
- `## Error Handling` table: replace the rows for `` `.digismith/preferences.yml` missing `` and `File present but malformed/unparseable (e.g. non-UTF-8)` with:

```markdown
| `.digismith/config.yml` and the old files missing | Every key reads as `unset`; not an error. |
| `.digismith/config.yml` does not parse, or is not UTF-8 | Fails with `preferences: failed (<file> line <n>: <reason>)` or `(<file>: not valid UTF-8)`, exit 1. Relay the message; don't guess a fix. |
| Write in a linked worktree that still has an old file | Fails and names the main checkout to migrate. Nothing changes. |
| Write where git tracks an old file | Fails and prints the migrate and commit commands. Nothing changes. |
```

- `## Out of Scope`: replace the first bullet with `- A global-to-you tier spanning all repos — deferred. \`scripts/config.ts\` keeps an ordered layer list so one can be added later.` In the `Any git add/commit logic` bullet, replace `same as\n  \`.digismith/profile\`.` with `same as the rest of\n  \`.digismith/config.yml\`.`
- Quick Reference table: add a row: ``| `migrate` | `node --experimental-strip-types <digismith-repo>/scripts/preferences.ts --action migrate` | Merges the old files into `config.yml` and moves them aside; prints commit commands where git tracks them |``.

- [ ] **Step 2: Edit the other files**

- `skills/voice/SKILL.md` "Locating `scripts/voice.ts`": replace ``. `.digismith/preferences.yml`\nitself still lives in the repo currently being worked on`` with ``. `.digismith/config.yml`\nitself still lives in the repo currently being worked on``. Error table: replace the row `` `.digismith/preferences.yml` missing or malformed `` with two rows:

```markdown
| `.digismith/config.yml` missing, or a voice key unset | Both axes read as `on` — not an error. |
| `.digismith/config.yml` does not parse | `voice.ts` fails with the file and line — relay that message, don't guess a fix. |
```

- `skills/toolchain/SKILL.md`: replace both `` `.digismith/preferences.yml` `` mentions with `` `.digismith/config.yml` ``.
- `skills/offload-implementer/SKILL.md` (around the `info/exclude` paragraph): replace ``the same class of file as\n`.digismith/profile`/`.digismith/telemetry-marker` (see `MEMORY.md`'s\n"`.digismith/profile` is config, not generated docs output" convention),`` with ``the same class of file as\n`.digismith/config.yml`/`.digismith/telemetry-marker` (see\n`digismith:bootstrap` Step 0's "config, not generated docs output" note),``.
- `README.md`: replace `` remembered in `.digismith/profile` in that repo `` with `` remembered in `.digismith/config.yml` in that repo ``. In the `init` table row, replace `` The current worktree already has `.digismith/profile`, `` with `The current worktree already has a profile,`.
- `scripts/toolchain.ts`: in the comment above `parseFieldValue`, replace `shape as scripts/preferences.ts's parseFieldValue` with `shape as scripts/model_offload.ts's parseFieldValue`. No code change.

- [ ] **Step 3: Verify the edits**

Run:

```bash
grep -rn "\.digismith/preferences\.yml\|\.digismith/profile" skills README.md | grep -v "(A.2 fallback)"
```

Expected: only lines in `skills/bootstrap/SKILL.md` (old-config-file check, copy step, sub-step 8), `skills/adopt/SKILL.md` (copy step), and `skills/preferences/SKILL.md` ("Old files (A.2)" paragraph, `migrate`, Worktree Propagation). Every one of them names an old file on purpose.

Run: `pnpm vitest run scripts/toolchain.test.ts`
Expected: PASS (comment-only change).

- [ ] **Step 4: Commit**

```bash
git add skills/preferences/SKILL.md skills/voice/SKILL.md skills/toolchain/SKILL.md skills/offload-implementer/SKILL.md README.md scripts/toolchain.ts
git commit -m "docs(preferences): describe config.yml storage and the migrate operation"
```

---

### Task 12: Full suite against the baseline

- [ ] **Step 1: Run the full suite**

Run: `pnpm test 2>&1 | tail -15` and `pnpm test 2>&1 | grep -E "^ FAIL " | sort -u`
Expected: the only `FAIL` lines are the two DGS-117 tests named in Global Constraints. The test count is higher than 587, and the pass count is the total minus 2.

- [ ] **Step 2: Record the result**

Write the totals (files, tests, passed, failed) and the two failure names into the report for the test-results checkpoint. No commit.

---

## Rollout note

This branch does not migrate DigiSmith's own repo. `.digismith/profile` and `.digismith/preferences.yml` stay in place here, and every reader in this branch reaches them through the fallback, so old and new plugin versions keep working side by side. DigiSmith's own migration (the committed `.digismith/config.yml`, `git mv` of the two old files to `*.migrated`, and its own test that the result equals `migrate`'s output) is the follow-up ticket DGS-142 (A.2: Configuration). Consumer repos (Emma, Soveron) are unaffected either way: their old files stay in place until `bootstrap` from a release carrying this branch migrates them.
