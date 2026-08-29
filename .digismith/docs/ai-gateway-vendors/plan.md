# Pluggable AI Gateway Vendors (K.3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize DigiSmith's two Chutes-hardcoded offload mechanisms (K.1's `scripts/model_offload.py` and K.2's `skills/offload-implementer`) into one pluggable-provider mechanism, so the user can choose Chutes, TokenReply, or a future gateway per-mechanism via profile fields.

**Architecture:** A Strategy pattern in TypeScript — one `GatewayProvider` interface (`scripts/providers/types.ts`), one concrete module per vendor (`chutes.ts`, `tokenreply.ts`), and a `resolveProvider()` factory (`registry.ts`). K.1's script is ported wholesale from Python to TypeScript and reads the registry generically; K.2's harness stays OpenCode, only its `opencode.json` provider block becomes data resolved via a new `print-config.ts` CLI instead of a hardcoded literal.

**Tech Stack:** TypeScript (Node 24 native type-stripping, no `ts-node`/`tsx`), Vitest, plain `process.env` credential lookup — no new npm dependencies.

**Spec:** [.digismith/docs/ai-gateway-vendors/design.html](.digismith/docs/ai-gateway-vendors/design.html)

## Global Constraints

- Node `>=24` only; every new/ported script runs directly via `node <file>.ts` — never add `ts-node`/`tsx`/a build step.
- ESM throughout: root `package.json` needs `"type": "module"` added (currently absent); every relative import in the new code uses an explicit `.ts` extension (`NodeNext` module resolution requires it — see `packages/jira-client` for the existing precedent).
- TypeScript `^5.7.0` and Vitest `^2.1.0` are already root `devDependencies`, but this worktree's `node_modules` may not have them materialized yet. If `node_modules/.bin/vitest` or `node_modules/.bin/tsc` are missing, run `pnpm install` once (confirmed live: this is a one-time per-worktree gap, not a lockfile problem — `pnpm install` reports "Already up to date" harmlessly if nothing was actually missing).
- **Windows CLI main-guard:** do **not** use the `import.meta.url === \`file://${process.argv[1]}\`` pattern from `packages/jira-client/src/cli.ts` — confirmed live on this machine that it always evaluates `false` on Windows (backslash vs. forward-slash path forms never match), so `main()` silently never runs when the script is invoked directly. Every new CLI entry point in this plan uses the verified-working form instead:
  ```ts
  import { pathToFileURL } from "node:url";
  if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    main();
  }
  ```
  (Worth fixing in `jira-client` too, but that's a separate, pre-existing bug — out of scope here.)
- **UTF-8 strictness:** `readFileSync(path, "utf-8")` is lossy in Node — it silently replaces invalid byte sequences instead of throwing, unlike Python's `open(..., encoding="utf-8")`. Anywhere the ported code must preserve `model_offload.py`'s "invalid encoding → treat as unreadable" behavior, decode via:
  ```ts
  new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(path))
  ```
  not plain `readFileSync(path, "utf-8")`.
- **Credentials are always a plain env var:** `process.env[provider.credentialEnv]` — never a subprocess call to an external credential-manager script. This is a deliberate behavior change from today's `model_offload.py`, which currently shells out to `~/.claude/skills/chutes-ai/scripts/manage_credentials.py` for the Chutes key; the design's scope decision ("same pattern Chutes already uses via `{env:...}`") applies that pattern to K.1 too, not just K.2.
- TokenReply's base URL is **confirmed**, not a placeholder: `https://api.tokenreply.com/v1`, per TokenReply's own docs (tokenreply.com, Quick Start: "set the API URL to `https://api.tokenreply.com/v1`"). This resolves the design doc's open question.

---

### Task 1: TypeScript scaffolding + shared CLI arg helper

**Files:**
- Create: `tsconfig.json` (repo root)
- Modify: `package.json` (repo root)
- Create: `scripts/cli-args.ts`
- Test: `scripts/cli-args.test.ts`

**Interfaces:**
- Produces: `parseArgs(argv: string[]): Record<string, string>`, `requireArgs(args: Record<string, string>, names: string[]): void` — used by every later CLI task in this plan (`print-config.ts`, `model_offload.ts`).

- [ ] **Step 1: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["scripts/**/*.ts"]
}
```

- [ ] **Step 2: Update root `package.json`**

Add `"type": "module"` and a `"scripts"` block. Result:

```json
{
  "name": "digismith",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=24"
  },
  "devEngines": {
    "runtime": {
      "name": "node",
      "version": ">=24",
      "onFail": "error"
    }
  },
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 3: Write the failing test for the CLI arg helper**

```ts
// scripts/cli-args.test.ts
import { describe, expect, it } from "vitest";
import { parseArgs, requireArgs } from "./cli-args.ts";

describe("parseArgs", () => {
  it("parses a single flag", () => {
    expect(parseArgs(["--role", "task"])).toEqual({ role: "task" });
  });

  it("parses multiple flags", () => {
    expect(parseArgs(["--provider", "chutes", "--role", "task"])).toEqual({
      provider: "chutes",
      role: "task",
    });
  });

  it("returns an empty object for no flags", () => {
    expect(parseArgs([])).toEqual({});
  });
});

describe("requireArgs", () => {
  it("does not throw when all required flags are present", () => {
    expect(() => requireArgs({ role: "task" }, ["role"])).not.toThrow();
  });

  it("throws naming a single missing flag", () => {
    expect(() => requireArgs({}, ["role"])).toThrow("missing required flag: --role");
  });

  it("throws naming multiple missing flags, pluralized", () => {
    expect(() => requireArgs({}, ["role", "provider"])).toThrow(
      "missing required flags: --role, --provider",
    );
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `node_modules/.bin/vitest run scripts/cli-args.test.ts`
Expected: FAIL — `scripts/cli-args.ts` does not exist yet (import error).

- [ ] **Step 5: Write `scripts/cli-args.ts`**

```ts
export function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      args[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }
  return args;
}

export function requireArgs(args: Record<string, string>, names: string[]): void {
  const missing = names.filter((name) => args[name] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `missing required flag${missing.length > 1 ? "s" : ""}: ${missing.map((n) => `--${n}`).join(", ")}`,
    );
  }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `node_modules/.bin/vitest run scripts/cli-args.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 7: Type-check**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add tsconfig.json package.json scripts/cli-args.ts scripts/cli-args.test.ts
git commit -m "feat(ai-gateway-vendors): add TypeScript scaffolding and shared CLI arg helper"
```

---

### Task 2: Provider Strategy core — types, Chutes, TokenReply, registry

**Files:**
- Create: `scripts/providers/types.ts`
- Create: `scripts/providers/chutes.ts`
- Create: `scripts/providers/tokenreply.ts`
- Create: `scripts/providers/registry.ts`
- Test: `scripts/providers/registry.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces: `OffloadRole = "mechanical" | "task"`, `GatewayProvider { name, displayName, baseUrl, credentialEnv, contextWindow, model(role) }`, `chutes: GatewayProvider`, `tokenreply: GatewayProvider`, `resolveProvider(name: string): GatewayProvider | undefined` — consumed by Task 3 (`print-config.ts`) and Task 4 (`model_offload.ts`).

- [ ] **Step 1: Write `scripts/providers/types.ts`**

```ts
export type OffloadRole = "mechanical" | "task";

export interface GatewayProvider {
  name: string;
  displayName: string;
  baseUrl: string;
  credentialEnv: string;
  contextWindow: number;
  model(role: OffloadRole): string;
}
```

- [ ] **Step 2: Write `scripts/providers/chutes.ts`**

```ts
import type { GatewayProvider } from "./types.ts";

export const chutes: GatewayProvider = {
  name: "chutes",
  displayName: "Chutes",
  baseUrl: "https://llm.chutes.ai/v1",
  credentialEnv: "CHUTES_API_KEY",
  contextWindow: 1_048_576,
  model(role) {
    return role === "task" ? "moonshotai/Kimi-K3-TEE" : "google/gemma-4-31B-turbo-TEE";
  },
};
```

- [ ] **Step 3: Write `scripts/providers/tokenreply.ts`**

```ts
import type { GatewayProvider } from "./types.ts";

// Base URL confirmed against TokenReply's own docs (tokenreply.com, Quick Start
// section): "set the API URL to https://api.tokenreply.com/v1".
export const tokenreply: GatewayProvider = {
  name: "tokenreply",
  displayName: "TokenReply",
  baseUrl: "https://api.tokenreply.com/v1",
  credentialEnv: "TOKENREPLY_API_KEY",
  contextWindow: 200_000,
  model() {
    return "kimi-k2.7";
  },
};
```

- [ ] **Step 4: Write `scripts/providers/registry.ts`**

```ts
import type { GatewayProvider } from "./types.ts";
import { chutes } from "./chutes.ts";
import { tokenreply } from "./tokenreply.ts";

const providers: Record<string, GatewayProvider> = { chutes, tokenreply };

export function resolveProvider(name: string): GatewayProvider | undefined {
  return providers[name];
}
```

- [ ] **Step 5: Write the test**

```ts
// scripts/providers/registry.test.ts
import { describe, expect, it } from "vitest";
import { chutes } from "./chutes.ts";
import { tokenreply } from "./tokenreply.ts";
import { resolveProvider } from "./registry.ts";
import type { GatewayProvider } from "./types.ts";

function assertConforms(provider: GatewayProvider) {
  expect(typeof provider.name).toBe("string");
  expect(provider.name.length).toBeGreaterThan(0);
  expect(typeof provider.displayName).toBe("string");
  expect(provider.baseUrl.startsWith("https://")).toBe(true);
  expect(typeof provider.credentialEnv).toBe("string");
  expect(provider.contextWindow).toBeGreaterThan(0);
  expect(typeof provider.model("mechanical")).toBe("string");
  expect(provider.model("mechanical").length).toBeGreaterThan(0);
  expect(typeof provider.model("task")).toBe("string");
  expect(provider.model("task").length).toBeGreaterThan(0);
}

describe("chutes", () => {
  it("conforms to GatewayProvider", () => assertConforms(chutes));

  it("uses distinct models for mechanical vs. task roles", () => {
    expect(chutes.model("mechanical")).toBe("google/gemma-4-31B-turbo-TEE");
    expect(chutes.model("task")).toBe("moonshotai/Kimi-K3-TEE");
  });
});

describe("tokenreply", () => {
  it("conforms to GatewayProvider", () => assertConforms(tokenreply));

  it("uses the confirmed base URL", () => {
    expect(tokenreply.baseUrl).toBe("https://api.tokenreply.com/v1");
  });
});

describe("resolveProvider", () => {
  it("resolves a known provider by name", () => {
    expect(resolveProvider("chutes")).toBe(chutes);
    expect(resolveProvider("tokenreply")).toBe(tokenreply);
  });

  it("returns undefined for an unknown provider", () => {
    expect(resolveProvider("openai")).toBeUndefined();
    expect(resolveProvider("")).toBeUndefined();
  });
});
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node_modules/.bin/vitest run scripts/providers/registry.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 7: Type-check**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add scripts/providers/types.ts scripts/providers/chutes.ts scripts/providers/tokenreply.ts scripts/providers/registry.ts scripts/providers/registry.test.ts
git commit -m "feat(ai-gateway-vendors): add GatewayProvider Strategy core (Chutes, TokenReply, registry)"
```

---

### Task 3: `print-config.ts` CLI

**Files:**
- Create: `scripts/providers/print-config.ts`
- Test: `scripts/providers/print-config.test.ts`

**Interfaces:**
- Consumes: `resolveProvider` and `GatewayProvider`/`OffloadRole` from Task 2; `parseArgs`/`requireArgs` from Task 1.
- Produces: `buildOpencodeProviderBlock(provider: GatewayProvider, role: OffloadRole): Record<string, unknown>` (exported, pure — used directly by its own tests); CLI contract `node scripts/providers/print-config.ts <provider-name> --role <mechanical|task>` → prints the provider's `opencode.json` provider-block JSON to stdout and exits 0, or prints an error to stderr and exits 1 — consumed by Task 6 (`offload-implementer/SKILL.md`).

- [ ] **Step 1: Write the failing tests**

```ts
// scripts/providers/print-config.test.ts
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildOpencodeProviderBlock } from "./print-config.ts";
import { chutes } from "./chutes.ts";
import { tokenreply } from "./tokenreply.ts";

const SCRIPT_PATH = fileURLToPath(new URL("./print-config.ts", import.meta.url));

describe("buildOpencodeProviderBlock", () => {
  it("builds the chutes task-role block", () => {
    expect(buildOpencodeProviderBlock(chutes, "task")).toEqual({
      chutes: {
        npm: "@ai-sdk/openai-compatible",
        name: "Chutes",
        options: {
          baseURL: "https://llm.chutes.ai/v1",
          apiKey: "{env:CHUTES_API_KEY}",
        },
        models: {
          "moonshotai/Kimi-K3-TEE": {
            name: "Chutes",
            limit: { context: 1_048_576, output: 65535 },
          },
        },
      },
    });
  });

  it("builds the chutes mechanical-role block with the mechanical model", () => {
    const block = buildOpencodeProviderBlock(chutes, "mechanical");
    expect(Object.keys(block.chutes.models)).toEqual(["google/gemma-4-31B-turbo-TEE"]);
  });

  it("builds the tokenreply task-role block", () => {
    expect(buildOpencodeProviderBlock(tokenreply, "task")).toEqual({
      tokenreply: {
        npm: "@ai-sdk/openai-compatible",
        name: "TokenReply",
        options: {
          baseURL: "https://api.tokenreply.com/v1",
          apiKey: "{env:TOKENREPLY_API_KEY}",
        },
        models: {
          "kimi-k2.7": {
            name: "TokenReply",
            limit: { context: 200_000, output: 65535 },
          },
        },
      },
    });
  });
});

describe("print-config CLI", () => {
  it("prints valid provider JSON and exits 0 for a known provider", () => {
    const stdout = execFileSync("node", [SCRIPT_PATH, "chutes", "--role", "task"], {
      encoding: "utf-8",
    });
    const parsed = JSON.parse(stdout);
    expect(Object.keys(parsed)).toEqual(["chutes"]);
  });

  it("exits non-zero for an unknown provider", () => {
    expect(() =>
      execFileSync("node", [SCRIPT_PATH, "does-not-exist", "--role", "task"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    ).toThrow();
  });

  it("exits non-zero when --role is missing", () => {
    expect(() =>
      execFileSync("node", [SCRIPT_PATH, "chutes"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node_modules/.bin/vitest run scripts/providers/print-config.test.ts`
Expected: FAIL — `scripts/providers/print-config.ts` does not exist yet.

- [ ] **Step 3: Write `scripts/providers/print-config.ts`**

```ts
import { pathToFileURL } from "node:url";
import { parseArgs, requireArgs } from "../cli-args.ts";
import { resolveProvider } from "./registry.ts";
import type { GatewayProvider, OffloadRole } from "./types.ts";

const DEFAULT_OUTPUT_LIMIT = 65535;

export function buildOpencodeProviderBlock(
  provider: GatewayProvider,
  role: OffloadRole,
): Record<string, unknown> {
  const modelId = provider.model(role);
  return {
    [provider.name]: {
      npm: "@ai-sdk/openai-compatible",
      name: provider.displayName,
      options: {
        baseURL: provider.baseUrl,
        apiKey: `{env:${provider.credentialEnv}}`,
      },
      models: {
        [modelId]: {
          name: provider.displayName,
          limit: { context: provider.contextWindow, output: DEFAULT_OUTPUT_LIMIT },
        },
      },
    },
  };
}

function main(): void {
  const [providerName, ...rest] = process.argv.slice(2);
  if (!providerName) {
    console.error("print-config: missing required positional argument <provider-name>");
    process.exitCode = 1;
    return;
  }

  const args = parseArgs(rest);
  try {
    requireArgs(args, ["role"]);
  } catch (err) {
    console.error(`print-config: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  if (args.role !== "mechanical" && args.role !== "task") {
    console.error(`print-config: --role must be "mechanical" or "task", got ${JSON.stringify(args.role)}`);
    process.exitCode = 1;
    return;
  }

  const provider = resolveProvider(providerName);
  if (!provider) {
    console.error(`print-config: no such registered provider ${JSON.stringify(providerName)}`);
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify(buildOpencodeProviderBlock(provider, args.role)));
  process.exitCode = 0;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node_modules/.bin/vitest run scripts/providers/print-config.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Manually confirm the CLI contract end to end**

Run: `node scripts/providers/print-config.ts chutes --role task`
Expected stdout (single line, formatting may vary):
```json
{"chutes":{"npm":"@ai-sdk/openai-compatible","name":"Chutes","options":{"baseURL":"https://llm.chutes.ai/v1","apiKey":"{env:CHUTES_API_KEY}"},"models":{"moonshotai/Kimi-K3-TEE":{"name":"Chutes","limit":{"context":1048576,"output":65535}}}}}
```

- [ ] **Step 6: Type-check**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add scripts/providers/print-config.ts scripts/providers/print-config.test.ts
git commit -m "feat(ai-gateway-vendors): add print-config CLI for resolving a provider's opencode.json block"
```

---

### Task 4: Port `model_offload.py` to `scripts/model_offload.ts`

**Files:**
- Create: `scripts/model_offload.ts`
- Test: `scripts/model_offload.test.ts`
- (leave `scripts/model_offload.py` and `scripts/test_model_offload.py` in place for now — removed in Task 8, after every caller has migrated)

**Interfaces:**
- Consumes: `resolveProvider` from Task 2; `parseArgs`/`requireArgs` from Task 1.
- Produces: `isDigismithRepo(): boolean`, `parseFieldValue(line: string): string`, `readProfileProvider(profilePath: string): string | null`, `getCredential(provider: GatewayProvider): string | null`, `callProvider(provider: GatewayProvider, prompt: string, apiKey: string): Promise<string>`, `hasExpectedHtmlShape(content: string): boolean`, `offload(prompt: string, profilePath: string): Promise<[string | null, string]>`, `main(): Promise<void>` — `offload`'s stdout/exit-code contract is consumed operationally by `digismith:enforcer` and `digismith:report-implementation` (Task 7).

- [ ] **Step 1: Write the failing test file**

```ts
// scripts/model_offload.test.ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { offload, readProfileProvider } from "./model_offload.ts";

const VALID_HTML = '<!doctype html>\n<html lang="en"><body>ok</body>\n</html>';

function fakeJsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("readProfileProvider", () => {
  let tempRepoDir: string;
  let profileYml: string;
  let pointerFile: string;
  let originalCwd: string;

  beforeEach(() => {
    tempRepoDir = mkdtempSync(join(tmpdir(), "digismith-test-"));
    mkdirSync(join(tempRepoDir, ".claude-plugin"), { recursive: true });
    writeFileSync(join(tempRepoDir, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "digismith" }));

    mkdirSync(join(tempRepoDir, "profiles"), { recursive: true });
    profileYml = join(tempRepoDir, "profiles", "digismith.yml");
    writeFileSync(profileYml, "name: digismith\nmodel_offload_provider: chutes\n");

    pointerFile = join(tempRepoDir, "profile-pointer");
    writeFileSync(pointerFile, "digismith");

    originalCwd = process.cwd();
    process.chdir(tempRepoDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempRepoDir, { recursive: true, force: true });
  });

  it("returns null for a missing pointer file", () => {
    expect(readProfileProvider("/nonexistent/path/profile")).toBeNull();
  });

  it("returns the field value when present", () => {
    expect(readProfileProvider(pointerFile)).toBe("chutes");
  });

  it("returns null when the field is absent", () => {
    writeFileSync(profileYml, "name: digismith\n");
    expect(readProfileProvider(pointerFile)).toBeNull();
  });

  it("strips an inline comment", () => {
    writeFileSync(profileYml, "name: digismith\nmodel_offload_provider: chutes   # optional; absent = feature off\n");
    expect(readProfileProvider(pointerFile)).toBe("chutes");
  });

  it("unwraps a quoted value", () => {
    writeFileSync(profileYml, 'name: digismith\nmodel_offload_provider: "chutes"\n');
    expect(readProfileProvider(pointerFile)).toBe("chutes");
  });

  it("handles an indented, quoted value with a trailing comment", () => {
    writeFileSync(profileYml, "name: digismith\n  model_offload_provider: 'chutes' # on\n");
    expect(readProfileProvider(pointerFile)).toBe("chutes");
  });

  it("returns null for a non-UTF-8 profiles yml", () => {
    writeFileSync(profileYml, Buffer.from([0x6e, 0x61, 0x6d, 0x65, 0xff, 0xfe]));
    expect(readProfileProvider(pointerFile)).toBeNull();
  });

  it("returns null for a non-UTF-8 plugin.json", () => {
    writeFileSync(join(tempRepoDir, ".claude-plugin", "plugin.json"), Buffer.from([0x7b, 0xff, 0xfe]));
    expect(readProfileProvider(pointerFile)).toBeNull();
  });

  it("returns null outside DigiSmith's own repo", () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "digismith-empty-"));
    process.chdir(emptyDir);
    try {
      expect(readProfileProvider(pointerFile)).toBeNull();
    } finally {
      process.chdir(tempRepoDir);
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});

describe("offload", () => {
  let tempRepoDir: string;
  let profileYml: string;
  let profilePath: string;
  let originalCwd: string;

  beforeEach(() => {
    tempRepoDir = mkdtempSync(join(tmpdir(), "digismith-test-"));
    mkdirSync(join(tempRepoDir, ".claude-plugin"), { recursive: true });
    writeFileSync(join(tempRepoDir, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "digismith" }));
    mkdirSync(join(tempRepoDir, "profiles"), { recursive: true });
    profileYml = join(tempRepoDir, "profiles", "digismith.yml");
    writeFileSync(profileYml, "name: digismith\nmodel_offload_provider: chutes\n");
    profilePath = join(tempRepoDir, "profile-pointer");
    writeFileSync(profilePath, "digismith");
    originalCwd = process.cwd();
    process.chdir(tempRepoDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempRepoDir, { recursive: true, force: true });
    delete process.env.CHUTES_API_KEY;
    delete process.env.TOKENREPLY_API_KEY;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("skips when the provider isn't registered", async () => {
    writeFileSync(profileYml, "name: digismith\nmodel_offload_provider: openai\n");
    const [content, status] = await offload("hello", profilePath);
    expect(content).toBeNull();
    expect(status).toContain("skipped");
  });

  it("skips when there are no credentials", async () => {
    delete process.env.CHUTES_API_KEY;
    const [content, status] = await offload("hello", profilePath);
    expect(content).toBeNull();
    expect(status).toContain("no CHUTES_API_KEY credentials");
  });

  it("skips outside DigiSmith's own repo", async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "digismith-empty-"));
    process.chdir(emptyDir);
    try {
      const [content, status] = await offload("hello", profilePath);
      expect(content).toBeNull();
      expect(status).toContain("not DigiSmith's own repo");
    } finally {
      process.chdir(tempRepoDir);
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it("succeeds end to end against a mocked fetch", async () => {
    process.env.CHUTES_API_KEY = "cpk_fake";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(fakeJsonResponse(200, { choices: [{ message: { content: VALID_HTML } }] })),
    );
    const [content, status] = await offload("hello", profilePath);
    expect(content).toBe(VALID_HTML);
    expect(status).toContain("success");
  });

  it("succeeds against a second registered provider (tokenreply)", async () => {
    writeFileSync(profileYml, "name: digismith\nmodel_offload_provider: tokenreply\n");
    process.env.TOKENREPLY_API_KEY = "tr_fake";
    const fetchMock = vi
      .fn()
      .mockResolvedValue(fakeJsonResponse(200, { choices: [{ message: { content: VALID_HTML } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const [content, status] = await offload("hello", profilePath);
    expect(content).toBe(VALID_HTML);
    expect(status).toContain("success");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.tokenreply.com/v1/chat/completions",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("fails on an HTTP error", async () => {
    process.env.CHUTES_API_KEY = "cpk_fake";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeJsonResponse(429, {})));
    const [content, status] = await offload("hello", profilePath);
    expect(content).toBeNull();
    expect(status).toContain("failed");
  });

  it("fails on a network/timeout error", async () => {
    process.env.CHUTES_API_KEY = "cpk_fake";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("The read operation timed out")));
    const [content, status] = await offload("hello", profilePath);
    expect(content).toBeNull();
    expect(status).toContain("failed");
  });

  it("fails on an empty response", async () => {
    process.env.CHUTES_API_KEY = "cpk_fake";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(fakeJsonResponse(200, { choices: [{ message: { content: "   " } }] })),
    );
    const [content, status] = await offload("hello", profilePath);
    expect(content).toBeNull();
    expect(status).toContain("empty");
  });

  it("fails on an array response body", async () => {
    process.env.CHUTES_API_KEY = "cpk_fake";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeJsonResponse(200, [])));
    const [content, status] = await offload("hello", profilePath);
    expect(content).toBeNull();
    expect(status).toContain("failed");
  });

  it("fails when content is a list instead of a string", async () => {
    process.env.CHUTES_API_KEY = "cpk_fake";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeJsonResponse(200, {
          choices: [{ message: { content: [{ type: "text", text: "<!doctype html>" }] } }],
        }),
      ),
    );
    const [content, status] = await offload("hello", profilePath);
    expect(content).toBeNull();
    expect(status).toContain("failed");
  });

  it("rejects content missing the doctype", async () => {
    process.env.CHUTES_API_KEY = "cpk_fake";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeJsonResponse(200, { choices: [{ message: { content: "Here is your document:\n<html></html>" } }] }),
      ),
    );
    const [content, status] = await offload("hello", profilePath);
    expect(content).toBeNull();
    expect(status).toContain("malformed HTML shape");
  });

  it("rejects content not ending in </html>", async () => {
    process.env.CHUTES_API_KEY = "cpk_fake";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeJsonResponse(200, { choices: [{ message: { content: "<!doctype html>\n<html><body>truncated" } }] }),
      ),
    );
    const [content, status] = await offload("hello", profilePath);
    expect(content).toBeNull();
    expect(status).toContain("malformed HTML shape");
  });

  it("rejects content with an unsubstituted placeholder", async () => {
    process.env.CHUTES_API_KEY = "cpk_fake";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeJsonResponse(200, {
          choices: [{ message: { content: "<!doctype html>\n<html><body>{{BODY_SECTIONS}}</body></html>" } }],
        }),
      ),
    );
    const [content, status] = await offload("hello", profilePath);
    expect(content).toBeNull();
    expect(status).toContain("malformed HTML shape");
  });

  it("rejects content wrapped in a markdown code fence", async () => {
    process.env.CHUTES_API_KEY = "cpk_fake";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeJsonResponse(200, {
          choices: [{ message: { content: "```html\n<!doctype html>\n<html><body>ok</body></html>\n```" } }],
        }),
      ),
    );
    const [content, status] = await offload("hello", profilePath);
    expect(content).toBeNull();
    expect(status).toContain("malformed HTML shape");
  });

  it("accepts an uppercase doctype and trailing whitespace", async () => {
    process.env.CHUTES_API_KEY = "cpk_fake";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeJsonResponse(200, { choices: [{ message: { content: "<!DOCTYPE html>\n<html><body>ok</body></html>\n\n" } }] }),
      ),
    );
    const [content, status] = await offload("hello", profilePath);
    expect(content).not.toBeNull();
    expect(status).toContain("success");
  });
});

describe("main", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = 0;
  });

  it("reports a clear error when the prompt file is missing", async () => {
    const { main } = await import("./model_offload.ts");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const originalArgv = process.argv;
    process.argv = ["node", "model_offload.ts", "--prompt-file", "/nonexistent/path/file.txt"];
    try {
      await main();
      expect(process.exitCode).toBe(1);
      const errOutput = errorSpy.mock.calls.map((call) => call.join(" ")).join("\n");
      expect(errOutput).toContain("offload: failed");
      expect(errOutput).toContain("cannot read prompt file");
    } finally {
      process.argv = originalArgv;
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/vitest run scripts/model_offload.test.ts`
Expected: FAIL — `scripts/model_offload.ts` does not exist yet.

- [ ] **Step 3: Write `scripts/model_offload.ts`**

```ts
// Offload only activates from DigiSmith's own repo: profiles/<name>.yml lives
// there, and a non-interactive script has no way to ask for DigiSmith's path
// the way a conversational skill can. Run from anywhere else and the caller
// falls back to in-session generation.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs, requireArgs } from "./cli-args.ts";
import { resolveProvider } from "./providers/registry.ts";
import type { GatewayProvider } from "./providers/types.ts";

const TIMEOUT_MS = 60_000;

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function readUtf8Strict(path: string): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(path));
}

export function isDigismithRepo(): boolean {
  const pluginJsonPath = join(process.cwd(), ".claude-plugin", "plugin.json");
  if (!isFile(pluginJsonPath)) return false;
  try {
    const config = JSON.parse(readUtf8Strict(pluginJsonPath));
    return config?.name === "digismith";
  } catch {
    return false;
  }
}

export function parseFieldValue(line: string): string {
  const colonIndex = line.indexOf(":");
  const afterColon = colonIndex === -1 ? "" : line.slice(colonIndex + 1);
  const hashIndex = afterColon.indexOf("#");
  const beforeComment = hashIndex === -1 ? afterColon : afterColon.slice(0, hashIndex);
  return beforeComment.trim().replace(/^['"]+|['"]+$/g, "");
}

export function readProfileProvider(profilePath: string): string | null {
  if (!isFile(profilePath)) return null;

  let profileName: string;
  try {
    profileName = readUtf8Strict(profilePath).trim();
  } catch {
    return null;
  }
  if (!profileName) return null;

  if (!isDigismithRepo()) return null;

  const profilesFile = join(process.cwd(), "profiles", `${profileName}.yml`);
  if (!isFile(profilesFile)) return null;

  let content: string;
  try {
    content = readUtf8Strict(profilesFile);
  } catch {
    return null;
  }

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("model_offload_provider:")) {
      return parseFieldValue(line);
    }
  }
  return null;
}

export function getCredential(provider: GatewayProvider): string | null {
  const value = process.env[provider.credentialEnv];
  return value && value.trim() ? value.trim() : null;
}

export class HttpError extends Error {
  status: number;
  constructor(status: number) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

export async function callProvider(
  provider: GatewayProvider,
  prompt: string,
  apiKey: string,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: provider.model("mechanical"),
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new HttpError(response.status);
  }

  const payload: unknown = await response.json();
  const content = (payload as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message
    ?.content;
  if (typeof content !== "string") {
    throw new Error("malformed response: content is not a string");
  }
  return content;
}

export function hasExpectedHtmlShape(content: string): boolean {
  const text = content.trim();
  if (!text.toLowerCase().startsWith("<!doctype html")) return false;
  if (!text.endsWith("</html>")) return false;
  if (text.includes("{{")) return false;
  if (text.includes("```")) return false;
  return true;
}

export type OffloadResult = [string | null, string];

export async function offload(prompt: string, profilePath: string): Promise<OffloadResult> {
  const providerName = readProfileProvider(profilePath);
  const provider = providerName ? resolveProvider(providerName) : undefined;

  if (!provider) {
    if (!isDigismithRepo()) {
      return [null, "offload: skipped (not DigiSmith's own repo — offload only runs there)"];
    }
    return [
      null,
      `offload: skipped (model_offload_provider=${JSON.stringify(providerName)}, no such registered provider)`,
    ];
  }

  const apiKey = getCredential(provider);
  if (!apiKey) {
    return [null, `offload: skipped (no ${provider.credentialEnv} credentials found)`];
  }

  let content: string;
  try {
    content = await callProvider(provider, prompt, apiKey);
  } catch (err) {
    if (err instanceof HttpError) {
      return [null, `offload: failed (HTTP ${err.status})`];
    }
    if (err instanceof DOMException && err.name === "AbortError") {
      return [null, "offload: failed (network error: timed out)"];
    }
    return [null, `offload: failed (${err instanceof Error ? err.message : String(err)})`];
  }

  if (!content.trim()) {
    return [null, "offload: failed (empty response)"];
  }

  if (!hasExpectedHtmlShape(content)) {
    return [null, "offload: failed (malformed HTML shape)"];
  }

  return [content, `offload: success (${provider.name}/${provider.model("mechanical")})`];
}

export async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  try {
    requireArgs(args, ["prompt-file"]);
  } catch (err) {
    console.error(`offload: failed (${err instanceof Error ? err.message : String(err)})`);
    process.exitCode = 1;
    return;
  }

  const profilePath = args["profile-path"] ?? ".digismith/profile";

  let prompt: string;
  try {
    prompt = readFileSync(args["prompt-file"], "utf-8");
  } catch (err) {
    console.error(
      `offload: failed (cannot read prompt file: ${err instanceof Error ? err.message : String(err)})`,
    );
    process.exitCode = 1;
    return;
  }

  const [content, status] = await offload(prompt, profilePath);
  console.error(status);

  if (content === null) {
    process.exitCode = 1;
    return;
  }

  console.log(content);
  process.exitCode = 0;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
```

Note: `existsSync` is imported but unused if you follow this listing exactly — remove it from the import line (only `readFileSync` and `statSync` are used from `node:fs`).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node_modules/.bin/vitest run scripts/model_offload.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Manually confirm the CLI contract**

With `CHUTES_API_KEY` unset:
Run: `node scripts/model_offload.ts --prompt-file <any file> --profile-path .digismith/profile` (from the DigiSmith repo root)
Expected: exit code 1, stderr contains `offload: skipped (no CHUTES_API_KEY credentials found)` (assuming this worktree's `profiles/digismith.yml` still has `model_offload_provider: chutes`, which Task 5 leaves untouched).

- [ ] **Step 6: Type-check**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add scripts/model_offload.ts scripts/model_offload.test.ts
git commit -m "feat(ai-gateway-vendors): port model_offload.py to TypeScript, generalized over the provider registry"
```

---

### Task 5: Add `task_offload_provider` to every profile

**Files:**
- Modify: `profiles/digismith.yml`
- Modify: `profiles/emma.yml`
- Modify: `profiles/jazurite.yml`
- Modify: `profiles/personal.yml`

**Interfaces:**
- Consumes: nothing (data-only change).
- Produces: the `task_offload_provider` key, read as prose by the updated `offload-implementer/SKILL.md` in Task 6.

**Why every profile, defaulting to `chutes`:** `offload-implementer` (K.2) previously hardcoded Chutes for **every** profile unconditionally — it never read a profile field at all. Adding `task_offload_provider: chutes` to all four profiles preserves that exact behavior (still Chutes, for everyone, until someone opts a profile into `tokenreply`) while making the choice an explicit, visible, per-profile setting. This is different from `model_offload_provider` (K.1), which already had an opt-in per-profile default of "off" — that field is intentionally **left alone** for the three profiles that don't already have it (`emma.yml`, `jazurite.yml`, `personal.yml`), since adding it now would silently switch on a new automatic behavior (mechanical HTML-generation offload) those profiles never opted into. Only `profiles/digismith.yml` has `model_offload_provider` today, and it already reads `chutes` — no change needed there.

- [ ] **Step 1: Update `profiles/digismith.yml`**

```yaml
name: digismith
standards: [global]
ticket: false
ephemeral: false
reporting: true
publish_artifact: true
logging: true
model_offload_provider: chutes
task_offload_provider: chutes
```

- [ ] **Step 2: Update `profiles/emma.yml`**

```yaml
# `standards` is hand-maintained: keep it in sync with standards/'s
# top-level folder names — a new folder there is not picked up here
# automatically.
name: emma
standards: [global, shopify, team]
ticket: true
ephemeral: true
reporting: true
publish_artifact: true
logging: true
task_offload_provider: chutes
```

- [ ] **Step 3: Update `profiles/jazurite.yml`**

```yaml
name: jazurite
standards: [global]
ticket: false
ephemeral: false
reporting: true
publish_artifact: true
logging: true
task_offload_provider: chutes
```

- [ ] **Step 4: Update `profiles/personal.yml`**

```yaml
name: personal
standards: [global]
ticket: false
ephemeral: false
reporting: true
publish_artifact: true
logging: false
task_offload_provider: chutes
```

- [ ] **Step 5: Verify**

Run: `grep -L "task_offload_provider" profiles/*.yml`
Expected: no output (every profile now has the field).

- [ ] **Step 6: Commit**

```bash
git add profiles/digismith.yml profiles/emma.yml profiles/jazurite.yml profiles/personal.yml
git commit -m "feat(ai-gateway-vendors): add task_offload_provider to every profile, defaulting to chutes"
```

---

### Task 6: Generalize `skills/offload-implementer/SKILL.md`

**Files:**
- Modify: `skills/offload-implementer/SKILL.md`

**Interfaces:**
- Consumes: `node scripts/providers/print-config.ts <provider> --role task` (Task 3's CLI contract); `task_offload_provider` field (Task 5).
- Produces: nothing consumed by other tasks — this is the leaf skill file.

- [ ] **Step 1: Replace Step 1's hardcoded `opencode.json` block**

In `skills/offload-implementer/SKILL.md`, find:

```
### Step 1: Ensure `opencode.json` Exists in the Task's Worktree

Check for `opencode.json` in the worktree root. **Present** → continue.
**Missing** → write it:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "chutes": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Chutes",
      "options": {
        "baseURL": "https://llm.chutes.ai/v1",
        "apiKey": "{env:CHUTES_API_KEY}"
      },
      "models": {
        "moonshotai/Kimi-K3-TEE": {
          "name": "Kimi K3 (Chutes)",
          "limit": { "context": 1048576, "output": 65535 }
        }
      }
    }
  }
}
```
```

Replace it with:

```
### Step 1: Ensure `opencode.json` Exists in the Task's Worktree

Check for `opencode.json` in the worktree root. **Present** → continue.
**Missing** → write it. First resolve which provider this dispatch uses: read
`task_offload_provider` from the active profile (`profiles/<name>.yml`,
same file `digismith:inject-standards` already reads `standards:` from),
defaulting to `chutes` if the field is absent (matches every existing
profile — see K.3's design doc). Then run:

```bash
node scripts/providers/print-config.ts <resolved-provider> --role task
```

**Exit 0** → its stdout is a single-key JSON object keyed by the provider
name (e.g. `{"chutes": {...}}`). Write `opencode.json` as:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": <that object, verbatim>
}
```

**Non-zero exit** (unrecognized provider name) → stop here and report
`BLOCKED` — the same disposition as a missing `opencode` binary (see
Error Handling). Never write a config that can't authenticate.

Record the resolved provider name and the model ID `print-config.ts` chose
(the single key inside `.models` in its output) — Step 4 needs both to
build its `opencode run --model` argument.
```

- [ ] **Step 2: Replace Step 4's hardcoded `--model` argument**

Find, in the **fresh** dispatch code block:

```
opencode run --attach "http://127.0.0.1:<port>" \
  --model chutes/moonshotai/Kimi-K3-TEE --auto --format json \
  --dir "<task-worktree>" "$PROMPT" > "<workspace>/task-<N>-opencode-events.jsonl"
```

Replace with:

```
opencode run --attach "http://127.0.0.1:<port>" \
  --model <resolved-provider>/<resolved-model-id> --auto --format json \
  --dir "<task-worktree>" "$PROMPT" > "<workspace>/task-<N>-opencode-events.jsonl"
```

Find, in the **fix round** code block:

```
opencode run --attach "http://127.0.0.1:<port>" \
  --model chutes/moonshotai/Kimi-K3-TEE --auto --format json \
  --session "<captured sessionID>" \
  --dir "<task-worktree>" "$PROMPT" > "<workspace>/task-<N>-opencode-events-round<R>.jsonl"
```

Replace with:

```
opencode run --attach "http://127.0.0.1:<port>" \
  --model <resolved-provider>/<resolved-model-id> --auto --format json \
  --session "<captured sessionID>" \
  --dir "<task-worktree>" "$PROMPT" > "<workspace>/task-<N>-opencode-events-round<R>.jsonl"
```

Where `<resolved-provider>` and `<resolved-model-id>` are exactly what
Step 1 recorded — never re-derive them independently in Step 4.

- [ ] **Step 3: Update the Prerequisites section's credential line**

Find:

```
`opencode` on PATH (`pnpm add -g --allow-build=opencode-ai opencode-ai`
if missing — plain `pnpm add -g opencode-ai` alone installs a broken
binary, since pnpm skips postinstall scripts by default). A Chutes API
key available via `python3 ~/.claude/skills/chutes-ai/scripts/manage_credentials.py
get --field api_key`.
```

Replace with:

```
`opencode` on PATH (`pnpm add -g --allow-build=opencode-ai opencode-ai`
if missing — plain `pnpm add -g opencode-ai` alone installs a broken
binary, since pnpm skips postinstall scripts by default). Whichever
credential env var the resolved provider needs (`CHUTES_API_KEY` for
Chutes, `TOKENREPLY_API_KEY` for TokenReply — see `scripts/providers/`)
must already be set in the environment `opencode` runs in.
```

- [ ] **Step 4: Verify manually**

Run: `node scripts/providers/print-config.ts chutes --role task` and confirm the printed JSON matches what Step 1's new instructions expect to embed.

Read back `skills/offload-implementer/SKILL.md` in full and confirm no remaining literal occurrence of `chutes/moonshotai/Kimi-K3-TEE` or the old hardcoded JSON block survives outside of Step 1's own illustrative "e.g." example.

- [ ] **Step 5: Commit**

```bash
git add skills/offload-implementer/SKILL.md
git commit -m "feat(ai-gateway-vendors): generalize offload-implementer to resolve its provider via print-config.ts"
```

---

### Task 7: Point `enforcer` and `report-implementation` at `model_offload.ts`

**Files:**
- Modify: `skills/enforcer/SKILL.md`
- Modify: `skills/report-implementation/SKILL.md`

**Interfaces:**
- Consumes: `scripts/model_offload.ts`'s CLI contract from Task 4 (stdout/exit-code semantics are unchanged from the Python version, so this is a pure invocation-string swap).
- Produces: nothing consumed by other tasks.

- [ ] **Step 1: Update `skills/enforcer/SKILL.md`**

Find:

```
`python scripts/model_offload.py --prompt-file <prompt-file>
--profile-path .digismith/profile`. On exit 0, use its stdout as the
```

Replace with:

```
`node scripts/model_offload.ts --prompt-file <prompt-file>
--profile-path .digismith/profile`. On exit 0, use its stdout as the
```

- [ ] **Step 2: Update `skills/report-implementation/SKILL.md` (two occurrences)**

Find:

```
`python scripts/model_offload.py --prompt-file <prompt-file>
--profile-path .digismith/profile`. On exit 0, use its stdout as
```

Replace with:

```
`node scripts/model_offload.ts --prompt-file <prompt-file>
--profile-path .digismith/profile`. On exit 0, use its stdout as
```

Also find, in the Quick Reference table:

```
try `scripts/model_offload.py` first, but only in DigiSmith's own repo, and state which path produced the file
```

Replace with:

```
try `scripts/model_offload.ts` first, but only in DigiSmith's own repo, and state which path produced the file
```

- [ ] **Step 3: Verify**

Run: `grep -rn "model_offload.py" skills/enforcer/SKILL.md skills/report-implementation/SKILL.md`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add skills/enforcer/SKILL.md skills/report-implementation/SKILL.md
git commit -m "feat(ai-gateway-vendors): point enforcer and report-implementation at model_offload.ts"
```

---

### Task 8: Remove the legacy Python implementation

**Files:**
- Delete: `scripts/model_offload.py`
- Delete: `scripts/test_model_offload.py`

**Interfaces:**
- Consumes: confirmation that Tasks 4, 6, and 7 are all complete (every caller of `model_offload.py` has migrated to `model_offload.ts`).
- Produces: nothing — this is the plan's final task.

- [ ] **Step 1: Confirm no remaining references**

Run: `grep -rn "model_offload.py" --include="*.md" --include="*.ts" --include="*.py" . --exclude-dir=node_modules --exclude-dir=.git`
Expected: no output. If anything appears, stop and fix that reference before proceeding — do not delete the Python files while something still depends on them.

- [ ] **Step 2: Delete the legacy files**

```bash
git rm scripts/model_offload.py scripts/test_model_offload.py
```

- [ ] **Step 3: Run the full test suite**

Run: `node_modules/.bin/vitest run`
Expected: PASS — every test file under `scripts/` and `packages/jira-client/src/` passes (this also re-confirms Task 4's port didn't regress the pre-existing `jira-client` suite).

- [ ] **Step 4: Type-check the whole `scripts/` tree**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git commit -m "chore(ai-gateway-vendors): remove the legacy Python model_offload implementation"
```

---

## Self-Review Notes

- **Spec coverage:** every design.html section maps to a task — Architecture/Components → Tasks 1-4; K.2 data flow → Task 6; K.1 data flow → Task 4; error handling (K.1's fallback disposition, K.2's fail-fast disposition) → built into Task 4's `offload()` and Task 6's Step 1 replacement text; testing section → each task's own test file, including the explicit "at least two providers" requirement (Task 4, Step 1's `tokenreply` test); out-of-scope items (K.4-K.7, TokenReply account creation, auto-fallback) → untouched, no task references them.
- **Open question resolved during planning, not deferred:** TokenReply's base URL was confirmed live against `tokenreply.com`'s own docs (`https://api.tokenreply.com/v1`) rather than carried forward as a placeholder — Task 2 states this as fact, not a TODO.
- **New finding surfaced during planning, out of this plan's scope:** `packages/jira-client/src/cli.ts`'s `import.meta.url === \`file://${process.argv[1]}\`` main-guard is confirmed broken on Windows (verified live — always evaluates `false`). Flagged separately; not fixed here since it's a pre-existing, unrelated file.
