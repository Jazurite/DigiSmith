# Jira REST Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Atlassian MCP connector as `jira-progress-write-back`
(map item **I.1**)'s Jira transport with `packages/jira-client`, a
zero-dependency TypeScript package calling Jira's REST API v3 directly —
fixing the lossy-description-ADF bug found live on EMKT-756.

**Architecture:** A new pnpm workspace package (`packages/jira-client`)
exposes five functions (`checkCredentials`, `getIssue`,
`updateDescription`, `addComment`, `getAttachmentContent`) as a thin
library, plus a `cli.ts` subcommand wrapper the skill invokes via
`node`. Credentials live at `~/.digismith/.env` — outside every git
repo, bootstrapped conversationally on first use. `jira-progress-write-back`'s
own ADF business logic (description-delta splicing, comment
date-matching, the confirm-before-write gate) is completely unchanged;
only its transport calls and step numbering change, since removing the
old `cloudId`-resolution step shifts every step after it.

**Tech Stack:** TypeScript, run directly by Node 24's native
`.ts`-execution (no build step, no `tsc` compile — verified on this
machine: import specifiers must use the literal `.ts` extension, e.g.
`from "./client.ts"`, not `.js` — Node's native loader does not do
TypeScript-style extension substitution). Vitest for `client.ts`'s unit
tests (verified: Vitest resolves `.ts`-extension imports correctly too).
pnpm workspaces. Zero runtime npm dependencies — only `typescript` and
`vitest` as devDependencies.

**Spec:** `.digismith/docs/jira-rest-migration/design.html`
(published: https://claude.ai/code/artifact/08878865-41b9-45b9-97c9-62240fc90d64)

## Global Constraints

- **Base URL:** `https://${JIRA_SITE}/rest/api/3` — never
  `api.atlassian.com/ex/jira/{cloudId}/...` (OAuth-app-only, 403s for a
  personal token).
- **Auth:** HTTP Basic, `base64(email:token)`, built inside `client.ts`
  from `~/.digismith/.env` — the token never touches `argv`, the process
  list, or shell history. Only non-secret values (issue keys, file
  paths) are ever CLI arguments.
- **No `responseContentFormat`/`contentFormat` parameter anywhere** —
  REST API v3's description/comment bodies are ADF by default. This
  parameter was purely an MCP-connector concept; do not reintroduce it.
- **Credentials file:** `~/.digismith/.env`, hand-parsed (`KEY=VALUE`
  lines, `#`-prefixed comments and blank lines skipped) — no `dotenv`
  npm package. Missing/incomplete → the skill (not the client) prompts
  via `AskUserQuestion` and writes the file; the client only ever
  fails fast and reports which value is missing.
- **Zero runtime dependencies.** `typescript` and `vitest` are
  devDependencies only. `client.ts`/`cli.ts` use only Node built-ins
  (`node:fs`, `node:os`, `node:path`) and the global `fetch`.
  **No build step.** Nothing is compiled to `dist/`; `cli.ts` is
  invoked directly as `node .../cli.ts <subcommand> ...`.
- **ADF payloads passed via `--file`**, not inline as CLI arguments —
  the skill writes the composed JSON document to a scratch file first.
  Matches K.1's `model_offload.py --prompt-file` pattern.
- **Exit codes:** `0` success, `1` failure. Status/error detail to
  stderr; data (JSON, a saved file path) to stdout on success only.
- **`jira-progress-write-back`'s ADF business logic is untouched.**
  Only Steps 2 (replaced), 3 (removed), 4→3 (transport call changed),
  14→13 and 15→14 (transport calls changed) change. Steps 5-13→4-12 are
  copied forward **verbatim** except for step-number cross-references,
  which must be updated to match the new numbering everywhere they
  appear in the file.
- **Out of scope, already decided — do not build these:** the
  Track-section Deliverable/Per-Market template
  (`backlog/track-section-template.md`, I.2-shaped); publishing
  `jira-client` as a real npm package; wiring `get-attachment` into any
  current `jira-progress-write-back` step (the function exists on the
  client; no step calls it yet).

---

### Task 1: `packages/jira-client` — Workspace Scaffold + `client.ts`

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `package.json` (repo root)
- Create: `packages/jira-client/package.json`
- Create: `packages/jira-client/tsconfig.json`
- Create: `packages/jira-client/src/client.ts`
- Create: `packages/jira-client/src/client.test.ts`

**Interfaces:**
- Consumes: nothing from an earlier task (first task in this plan).
- Produces: `client.ts` exports `Credentials` (interface: `{ email:
  string; token: string; site: string }`), `CredentialsError` (class
  extends `Error`), `checkCredentials(envPath?: string): Credentials`,
  `getIssue(key: string, fields: string[], creds: Credentials):
  Promise<unknown>`, `updateDescription(key: string, adfDoc: unknown,
  creds: Credentials): Promise<void>`, `addComment(key: string, adfDoc:
  unknown, creds: Credentials, commentId?: string): Promise<{id:
  string}>`, `getAttachmentContent(attachmentId: string, outPath:
  string, creds: Credentials): Promise<string>`. Task 2's `cli.ts`
  imports all of these from `./client.ts`.

- [ ] **Step 1: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
```

- [ ] **Step 2: Create the root `package.json`**

```json
{
  "name": "digismith",
  "private": true,
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 3: Create `packages/jira-client/package.json`**

```json
{
  "name": "@digismith/jira-client",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "vitest run"
  }
}
```

- [ ] **Step 4: Create `packages/jira-client/tsconfig.json`**

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
  "include": ["src/**/*.ts"]
}
```

This file is for editor type-checking only — nothing compiles it. Node
runs `src/*.ts` directly (native type-stripping) and Vitest transpiles
`client.test.ts` on the fly.

- [ ] **Step 5: Run `pnpm install` at the repo root**

```bash
pnpm install
```

Run: `pnpm install`
Expected: installs `typescript` and `vitest` into the workspace root,
links `packages/jira-client` into the workspace. No errors.

- [ ] **Step 6: Write the failing tests for `checkCredentials`**

Create `packages/jira-client/src/client.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkCredentials,
  CredentialsError,
  getIssue,
  updateDescription,
  addComment,
  getAttachmentContent,
} from "./client.ts";

describe("checkCredentials", () => {
  it("returns credentials when the env file has all three values", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "jira-client-test-"));
    const envPath = join(tmpDir, ".env");
    writeFileSync(
      envPath,
      "JIRA_EMAIL=jack@example.com\nJIRA_API_TOKEN=abc123\nJIRA_SITE=example.atlassian.net\n"
    );
    const creds = checkCredentials(envPath);
    expect(creds).toEqual({
      email: "jack@example.com",
      token: "abc123",
      site: "example.atlassian.net",
    });
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws CredentialsError when the file doesn't exist", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "jira-client-test-"));
    const envPath = join(tmpDir, "missing.env");
    expect(() => checkCredentials(envPath)).toThrow(CredentialsError);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws CredentialsError when a required key is missing", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "jira-client-test-"));
    const envPath = join(tmpDir, ".env");
    writeFileSync(
      envPath,
      "JIRA_EMAIL=jack@example.com\nJIRA_SITE=example.atlassian.net\n"
    );
    expect(() => checkCredentials(envPath)).toThrow(CredentialsError);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("ignores comment lines and blank lines", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "jira-client-test-"));
    const envPath = join(tmpDir, ".env");
    writeFileSync(
      envPath,
      "# a comment\n\nJIRA_EMAIL=jack@example.com\nJIRA_API_TOKEN=abc123\nJIRA_SITE=example.atlassian.net\n"
    );
    const creds = checkCredentials(envPath);
    expect(creds.email).toBe("jack@example.com");
    rmSync(tmpDir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `cd packages/jira-client && npx vitest run`
Expected: FAIL — `client.ts` does not exist yet, so the import fails to
resolve (`Cannot find module './client.ts'` or similar).

- [ ] **Step 8: Write `client.ts` to make the `checkCredentials` tests pass**

Create `packages/jira-client/src/client.ts`:

```typescript
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Credentials {
  email: string;
  token: string;
  site: string;
}

export class CredentialsError extends Error {}

function defaultEnvPath(): string {
  return join(homedir(), ".digismith", ".env");
}

function parseEnvFile(path: string): Record<string, string> {
  const content = readFileSync(path, "utf-8");
  const result: Record<string, string> = {};
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    result[key] = value;
  }
  return result;
}

export function checkCredentials(envPath: string = defaultEnvPath()): Credentials {
  let vars: Record<string, string>;
  try {
    vars = parseEnvFile(envPath);
  } catch {
    throw new CredentialsError(`no credentials file found at ${envPath}`);
  }
  const { JIRA_EMAIL, JIRA_API_TOKEN, JIRA_SITE } = vars;
  if (!JIRA_EMAIL || !JIRA_API_TOKEN || !JIRA_SITE) {
    throw new CredentialsError(
      `incomplete credentials in ${envPath} — need JIRA_EMAIL, JIRA_API_TOKEN, JIRA_SITE`
    );
  }
  return { email: JIRA_EMAIL, token: JIRA_API_TOKEN, site: JIRA_SITE };
}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd packages/jira-client && npx vitest run`
Expected: PASS — all 4 `checkCredentials` tests green.

- [ ] **Step 10: Write the failing tests for `getIssue`**

Append to `packages/jira-client/src/client.test.ts`:

```typescript
const CREDS: import("./client.ts").Credentials = {
  email: "jack@example.com",
  token: "abc123",
  site: "example.atlassian.net",
};

describe("getIssue", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("calls the correct URL with Basic auth and returns parsed JSON", async () => {
    const mockJson = { fields: { summary: "Test issue" } };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockJson),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getIssue("EMKT-1", ["summary", "description"], CREDS);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.atlassian.net/rest/api/3/issue/EMKT-1?fields=summary,description",
      {
        headers: {
          Authorization:
            "Basic " + Buffer.from("jack@example.com:abc123").toString("base64"),
        },
      }
    );
    expect(result).toEqual(mockJson);
  });

  it("throws when the response is not ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve("Issue not found"),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getIssue("EMKT-999", ["summary"], CREDS)).rejects.toThrow(/404/);
  });
});
```

- [ ] **Step 11: Run tests to verify they fail**

Run: `cd packages/jira-client && npx vitest run`
Expected: FAIL — `getIssue` is not exported from `client.ts` yet.

- [ ] **Step 12: Add `getIssue` to `client.ts`**

Append to `packages/jira-client/src/client.ts`:

```typescript
function authHeader(creds: Credentials): string {
  return "Basic " + Buffer.from(`${creds.email}:${creds.token}`).toString("base64");
}

function baseUrl(creds: Credentials): string {
  return `https://${creds.site}/rest/api/3`;
}

export async function getIssue(
  key: string,
  fields: string[],
  creds: Credentials
): Promise<unknown> {
  const url = `${baseUrl(creds)}/issue/${key}?fields=${fields.join(",")}`;
  const res = await fetch(url, { headers: { Authorization: authHeader(creds) } });
  if (!res.ok) {
    throw new Error(`getIssue failed: HTTP ${res.status} ${await res.text()}`);
  }
  return res.json();
}
```

- [ ] **Step 13: Run tests to verify they pass**

Run: `cd packages/jira-client && npx vitest run`
Expected: PASS — all `getIssue` tests green, `checkCredentials` tests
still green.

- [ ] **Step 14: Write the failing tests for `updateDescription`**

Append to `packages/jira-client/src/client.test.ts`:

```typescript
describe("updateDescription", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("PUTs the description field wrapped in fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve("") });
    vi.stubGlobal("fetch", fetchMock);

    const adfDoc = { type: "doc", version: 1, content: [] };
    await updateDescription("EMKT-1", adfDoc, CREDS);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.atlassian.net/rest/api/3/issue/EMKT-1",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ fields: { description: adfDoc } }),
      })
    );
  });

  it("throws when the response is not ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve("bad request"),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(updateDescription("EMKT-1", {}, CREDS)).rejects.toThrow(/400/);
  });
});
```

- [ ] **Step 15: Run tests to verify they fail**

Run: `cd packages/jira-client && npx vitest run`
Expected: FAIL — `updateDescription` is not exported yet.

- [ ] **Step 16: Add `updateDescription` to `client.ts`**

Append to `packages/jira-client/src/client.ts`:

```typescript
export async function updateDescription(
  key: string,
  adfDoc: unknown,
  creds: Credentials
): Promise<void> {
  const url = `${baseUrl(creds)}/issue/${key}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: authHeader(creds),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields: { description: adfDoc } }),
  });
  if (!res.ok) {
    throw new Error(`updateDescription failed: HTTP ${res.status} ${await res.text()}`);
  }
}
```

- [ ] **Step 17: Run tests to verify they pass**

Run: `cd packages/jira-client && npx vitest run`
Expected: PASS — all tests so far green.

- [ ] **Step 18: Write the failing tests for `addComment`**

Append to `packages/jira-client/src/client.test.ts`:

```typescript
describe("addComment", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("POSTs a new comment when no commentId is given", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: "123" }) });
    vi.stubGlobal("fetch", fetchMock);

    const adfDoc = { type: "doc", version: 1, content: [] };
    const result = await addComment("EMKT-1", adfDoc, CREDS);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.atlassian.net/rest/api/3/issue/EMKT-1/comment",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ body: adfDoc }) })
    );
    expect(result).toEqual({ id: "123" });
  });

  it("PUTs to the existing comment when commentId is given", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: "456" }) });
    vi.stubGlobal("fetch", fetchMock);

    const adfDoc = { type: "doc", version: 1, content: [] };
    await addComment("EMKT-1", adfDoc, CREDS, "456");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.atlassian.net/rest/api/3/issue/EMKT-1/comment/456",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ body: adfDoc }) })
    );
  });

  it("throws when the response is not ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.resolve("forbidden"),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(addComment("EMKT-1", {}, CREDS)).rejects.toThrow(/403/);
  });
});
```

- [ ] **Step 19: Run tests to verify they fail**

Run: `cd packages/jira-client && npx vitest run`
Expected: FAIL — `addComment` is not exported yet.

- [ ] **Step 20: Add `addComment` to `client.ts`**

Append to `packages/jira-client/src/client.ts`:

```typescript
export async function addComment(
  key: string,
  adfDoc: unknown,
  creds: Credentials,
  commentId?: string
): Promise<{ id: string }> {
  const url = commentId
    ? `${baseUrl(creds)}/issue/${key}/comment/${commentId}`
    : `${baseUrl(creds)}/issue/${key}/comment`;
  const method = commentId ? "PUT" : "POST";
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader(creds),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ body: adfDoc }),
  });
  if (!res.ok) {
    throw new Error(`addComment failed: HTTP ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<{ id: string }>;
}
```

- [ ] **Step 21: Run tests to verify they pass**

Run: `cd packages/jira-client && npx vitest run`
Expected: PASS — all tests so far green.

- [ ] **Step 22: Write the failing test for `getAttachmentContent`**

Append to `packages/jira-client/src/client.test.ts`:

```typescript
describe("getAttachmentContent", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("downloads bytes, writes them to outPath, and returns outPath", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(bytes.buffer),
    });
    vi.stubGlobal("fetch", fetchMock);

    const tmpDir = mkdtempSync(join(tmpdir(), "jira-client-attach-"));
    const outPath = join(tmpDir, "screenshot.png");

    const result = await getAttachmentContent("att-1", outPath, CREDS);

    expect(result).toBe(outPath);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.atlassian.net/rest/api/3/attachment/content/att-1",
      expect.objectContaining({ redirect: "follow" })
    );
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws when the response is not ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve("not found"),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAttachmentContent("att-x", "/tmp/x", CREDS)).rejects.toThrow(/404/);
  });
});
```

- [ ] **Step 23: Run tests to verify they fail**

Run: `cd packages/jira-client && npx vitest run`
Expected: FAIL — `getAttachmentContent` is not exported yet.

- [ ] **Step 24: Add `getAttachmentContent` to `client.ts`**

Append to `packages/jira-client/src/client.ts`:

```typescript
import { writeFileSync } from "node:fs";

export async function getAttachmentContent(
  attachmentId: string,
  outPath: string,
  creds: Credentials
): Promise<string> {
  const url = `${baseUrl(creds)}/attachment/content/${attachmentId}`;
  const res = await fetch(url, {
    headers: { Authorization: authHeader(creds) },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`getAttachmentContent failed: HTTP ${res.status} ${await res.text()}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(outPath, buf);
  return outPath;
}
```

Move this new `import { writeFileSync } from "node:fs";` line up to join
the existing `import { readFileSync } from "node:fs";` line at the top
of the file as a single combined import
(`import { readFileSync, writeFileSync } from "node:fs";`) rather than
leaving two separate `node:fs` imports in the file.

- [ ] **Step 25: Run the full test suite to verify everything passes**

Run: `cd packages/jira-client && npx vitest run`
Expected: PASS — all tests across all five functions green, pristine
output (no warnings).

- [ ] **Step 26: Commit**

```bash
git add pnpm-workspace.yaml package.json packages/jira-client
git commit -m "feat(jira-client): add pnpm workspace and REST client with full test coverage"
```

---

### Task 2: `cli.ts` — Subcommand Dispatcher

**Files:**
- Create: `packages/jira-client/src/cli.ts`

**Interfaces:**
- Consumes: all five functions exported from `packages/jira-client/src/client.ts`
  (Task 1) — `checkCredentials`, `getIssue`, `updateDescription`,
  `addComment`, `getAttachmentContent`, plus the `CredentialsError` class.
- Produces: `node packages/jira-client/src/cli.ts <subcommand> [flags]`,
  the exact invocation Task 3's migrated skill steps call.

- [ ] **Step 1: Write `cli.ts`**

Create `packages/jira-client/src/cli.ts`:

```typescript
import { readFileSync } from "node:fs";
import {
  checkCredentials,
  CredentialsError,
  getIssue,
  updateDescription,
  addComment,
  getAttachmentContent,
} from "./client.ts";

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      args[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }
  return args;
}

async function main() {
  const [subcommand, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  try {
    switch (subcommand) {
      case "check-credentials": {
        checkCredentials();
        console.error("check-credentials: ok");
        break;
      }
      case "get-issue": {
        const creds = checkCredentials();
        const fields = args.fields.split(",");
        const result = await getIssue(args.key, fields, creds);
        console.log(JSON.stringify(result));
        break;
      }
      case "update-description": {
        const creds = checkCredentials();
        const adfDoc = JSON.parse(readFileSync(args.file, "utf-8"));
        await updateDescription(args.key, adfDoc, creds);
        console.error("update-description: ok");
        break;
      }
      case "add-comment": {
        const creds = checkCredentials();
        const adfDoc = JSON.parse(readFileSync(args.file, "utf-8"));
        const result = await addComment(args.key, adfDoc, creds, args["comment-id"]);
        console.log(JSON.stringify(result));
        break;
      }
      case "get-attachment": {
        const creds = checkCredentials();
        const savedPath = await getAttachmentContent(args.id, args.out, creds);
        console.log(savedPath);
        break;
      }
      default:
        console.error(`unknown subcommand: ${subcommand}`);
        process.exit(1);
    }
    process.exit(0);
  } catch (err) {
    if (err instanceof CredentialsError) {
      console.error(`no credentials: ${err.message}`);
    } else {
      console.error(`failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    process.exit(1);
  }
}

main();
```

- [ ] **Step 2: Dogfood — `check-credentials`, real execution against a temp HOME (missing case)**

There is no automated test file for `cli.ts` (it's a thin dispatcher —
the design spec's own Testing section keeps unit tests scoped to
`client.ts`'s functions). Instead, actually run it — safely, against a
temporary fake home directory, never the real
`~/.digismith/.env` and never a real network call.

```bash
TMPHOME=$(mktemp -d)
USERPROFILE="$TMPHOME" HOME="$TMPHOME" node packages/jira-client/src/cli.ts check-credentials
echo "exit code: $?"
```

Run this and record the actual output and exit code.
Expected: stderr prints something like `no credentials: no credentials
file found at <TMPHOME>/.digismith/.env`, exit code `1`.

- [ ] **Step 3: Dogfood — `check-credentials`, real execution against a temp HOME (success case)**

```bash
TMPHOME=$(mktemp -d)
mkdir -p "$TMPHOME/.digismith"
cat > "$TMPHOME/.digismith/.env" <<'EOF'
JIRA_EMAIL=dogfood@example.com
JIRA_API_TOKEN=dogfood-token
JIRA_SITE=dogfood.atlassian.net
EOF
USERPROFILE="$TMPHOME" HOME="$TMPHOME" node packages/jira-client/src/cli.ts check-credentials
echo "exit code: $?"
rm -rf "$TMPHOME"
```

Run this and record the actual output and exit code.
Expected: stderr prints `check-credentials: ok`, exit code `0`.

- [ ] **Step 4: Dogfood — the other four subcommands' dispatch, by reading the code (reasoning only)**

Do NOT run `get-issue`, `update-description`, `add-comment`, or
`get-attachment` for real — they would make an actual HTTP call to Jira,
and no real ticket/credentials exist for this task. Instead, verify each
subcommand's dispatch logic by reading `cli.ts` against `client.ts`'s
actual exported signatures (Task 1):

- `get-issue --key <K> --fields <csv>` → `args.fields.split(",")`
  produces a string array, passed positionally to `getIssue(key: string,
  fields: string[], creds: Credentials)` in the same order. Matches.
- `update-description --key <K> --file <path>` → `JSON.parse(readFileSync(args.file, "utf-8"))`
  produces the ADF document, passed to `updateDescription(key: string,
  adfDoc: unknown, creds: Credentials)` in the same order. Matches.
- `add-comment --key <K> --file <path> [--comment-id <id>]` → `args["comment-id"]`
  is `undefined` when the flag is absent (per `parseArgs`, an unset key
  is simply never assigned), which matches `addComment`'s optional
  fourth parameter exactly — an absent flag correctly becomes "create
  new" (no `commentId`), not an accidental empty-string `commentId`.
  Confirm this by reading `parseArgs` itself, not by assuming it.
- `get-attachment --id <ID> --out <path>` → `args.id`/`args.out` map
  directly to `getAttachmentContent(attachmentId: string, outPath:
  string, creds: Credentials)` in the same order. Matches.

Record the actual conclusion for each of the four — confirmed matching,
or a real mismatch found and then fixed in Step 5.

- [ ] **Step 5: If Step 4 surfaced a real mismatch, fix it now**

Only if a real gap was found — don't invent one. If Steps 2-4 all
confirmed correctly, record that plainly instead.

- [ ] **Step 6: Commit**

```bash
git add packages/jira-client/src/cli.ts
git commit -m "feat(jira-client): add cli.ts subcommand dispatcher"
```

---

### Task 3: Migrate `jira-progress-write-back`'s `SKILL.md`

**Files:**
- Modify: `skills/jira-progress-write-back/SKILL.md` (entire file
  rewritten in place — the step renumbering after removing the old
  `cloudId` step touches every step from the old Step 3 onward, plus
  several cross-references and the Quick Reference table)

**Interfaces:**
- Consumes: `node packages/jira-client/src/cli.ts <subcommand>` (Tasks
  1-2) as the new transport for every Jira call this skill makes.
- Produces: nothing consumed elsewhere in this plan — Task 4 only
  documents that this happened, it doesn't depend on any new interface
  this task produces.

- [ ] **Step 1: Replace the entire content of `skills/jira-progress-write-back/SKILL.md`**

```markdown
---
name: jira-progress-write-back
description: Use right after digismith:capture-ephemeral-url succeeds, or when explicitly asked to post or update the JIRA progress update for the current ticket — posts real JIRA ADF formatting (status lozenges, emoji, a dated progress comment) instead of a markdown approximation, for a single repo/ticket at a time.
---

# JIRA Progress Write-back

## Overview

DigiSmith's map item **I.1**. Posts/updates a JIRA ticket's description
(a "🔗 Materials & Links" entry, and — only if already present — the
"📦 Track" checklist's Technical Development line) and a dated "📣
Progress Update" comment, using real ADF nodes (status lozenges, emoji,
mentions) instead of a markdown approximation that would round-trip as
broken literal text. Consumes map item **M**'s captured URLs. Single
repo/ticket at a time — no cross-repo awareness; that's map item **I.2**,
not this skill.

## When to Use

Right after `digismith:capture-ephemeral-url` reports its two URLs, or
whenever explicitly asked to post/update the JIRA progress update for the
current ticket.

## Prerequisites

A working `digismith:depot`-provisioned Jira client at
`~/.digismith/repo/packages/jira-client/src/cli.ts`, and complete
credentials at `~/.digismith/.env` (see Step 2, which provisions both if
missing). The active profile's `ticket` field must be `true` (see Step
0) — if it's `false`, there's no ticket key to write to and this skill
has nothing to do.

## Process

### Step 0: Profile Pre-Check

Check for `.digismith/profile` in the repo currently being worked in.

**Missing** → proceed to Step 1.

**Present** → read its one-line content as the active profile name.
Locate DigiSmith's own repo — same rule `digismith:inject-standards` uses
for `standards/`: is the current working directory itself the DigiSmith
repo (`.claude-plugin/plugin.json` with `"name": "digismith"`)? Use it
directly. Otherwise ask the user for DigiSmith's repo path this session
and remember it. Never read `profiles/` under a plugin cache path — a
stale, version-locked snapshot. Read `profiles/<name>.yml` there. No
matching file → treat as stale, proceed as if `.digismith/profile` were
missing — continue to Step 1.

Otherwise, if that profile's `ticket` field is `false`, stop here: report
one line — "skipping JIRA write-back — no ticket tracking in `<name>`
profile" — and don't do anything else in this skill. If `ticket` is
`true`, continue to Step 1.

### Step 1: Resolve the Ticket Key

```bash
git branch --show-current
```

Parse `<Key>` from the current branch name against `^([A-Z]+-\d+)__`
(e.g. `EMKT-9001__fix-cart-drawer-padding-mobile` → `EMKT-9001`). If the
branch name doesn't match, ask directly for the ticket key instead of
guessing.

### Step 2: Ensure the Jira Client Is Available

Defensively invoke `digismith:depot`'s `ensure` operation — `bootstrap`/
`adopt` normally already did this at ticket start, but this skill can
also run standalone in a session that skipped them. Same disposition as
`digismith:depot`'s own Error Handling: if `ensure` fails, stop here,
report the error plainly, don't fabricate a write.

Then check credentials:

```bash
node ~/.digismith/repo/packages/jira-client/src/cli.ts check-credentials
```

**Exit 0** → credentials are present and complete, continue to Step 3.

**Exit 1** → `~/.digismith/.env` is missing or incomplete. Ask via
`AskUserQuestion` for the three values, mentioning where to generate a
token (`id.atlassian.com/manage-profile/security/api-tokens`):

- Jira account email
- Jira API token
- Jira site hostname (e.g. `your-org.atlassian.net`)

Write them to `~/.digismith/.env` (create `~/.digismith/` first if it
doesn't exist):

```
JIRA_EMAIL=<email>
JIRA_API_TOKEN=<token>
JIRA_SITE=<site>
```

Then re-run `check-credentials` to confirm before continuing to Step 3.
This only ever happens once per machine — every future session finds the
file already there.

### Step 3: Fetch the Current Ticket

```bash
node ~/.digismith/repo/packages/jira-client/src/cli.ts get-issue --key <Key> --fields summary,description,comment
```

This isn't a display fetch: whatever comes back gets spliced and written
straight back in Step 7/11, and the response is real, structured ADF for
every field by construction — no `responseContentFormat` parameter to
get wrong, no lossy rendered-markdown hybrid to guard against, unlike the
MCP connector this replaced. Keep the raw `description` ADF document and
the `comment.comments` array in memory for the rest of this process.

### Step 4: Determine This Repo's Row Label

From the current repo's directory name: if it matches
`shopify-template-<code>`, the label is `<code>` uppercased (e.g.
`shopify-template-jp` → `JP`). Otherwise, the label is the repo directory
name as-is (e.g. `shopify-hub`). This is a label only — nothing branches
on whether it "counts" as a market; the description write below treats
every repo the same way.

### Step 5: Draft the Materials & Links Delta

Search the fetched `description` document's top-level `content` array
for a heading node whose text contains "Materials & Links".

**Not found (most common — first write on this ticket)** → the delta is
a fresh heading + bullet list, to be inserted (Step 7 decides where):

```json
{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"🔗 Materials & Links:"}]}
```
```json
{"type":"bulletList","content":[
  {"type":"listItem","content":[{"type":"paragraph","content":[
    {"type":"text","text":"Preview Theme","marks":[{"type":"strong"}]},
    {"type":"text","text":": "},
    {"type":"text","text":"Link","marks":[{"type":"link","attrs":{"href":"<preview-theme-url>"}}]}
  ]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[
    {"type":"text","text":"Customize","marks":[{"type":"strong"}]},
    {"type":"text","text":": "},
    {"type":"text","text":"Link","marks":[{"type":"link","attrs":{"href":"<customize-url>"}}]}
  ]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[
    {"type":"text","text":"Pull Request","marks":[{"type":"strong"}]},
    {"type":"text","text":": "},
    {"type":"text","text":"Link","marks":[{"type":"link","attrs":{"href":"<pr-url>"}}]}
  ]}]}
]}
```

No country/market label on the bullets — single-repo scope means there's
only ever one entry in view.

**Found, and it's followed by a `bulletList`** (this skill's own earlier
write) → the delta is: replace that bullet list's three `href` values
in place (same three listItems, same order, just new link targets).

**Found, and it's followed by a `table`** (pre-existing multi-market
history — human-authored, or a future I.2) → don't restructure it. The
delta is a table-row upsert instead: the table's header row tells you
column order (expect `Country | Preview Theme | Customize | Pull
Request`, but read the actual header cells rather than assuming). Search
the table's row nodes for one whose first cell's text matches this
repo's label (Step 4). Found → replace that row's link cells. Not found
→ append a new row with this repo's label and links, same cell shape as
the existing rows.

**Found, but followed by neither a `bulletList` nor a `table`**
(unrecognized shape) → this is **not** the same as "not found": a
heading already exists, so do not append a second one. Produce no delta
at all — the existing Materials & Links section (heading and whatever
follows it) is left exactly as fetched, completely untouched. Report why
in Step 15. Never guess at a risky edit against an unfamiliar structure.

### Step 6: Draft the Track Checklist Delta

Search the same `description` document for a heading node whose text
contains "Track" (expect "📦 Track:"). **Not found** → no delta; the
Track checklist is untouched, note this for the final report (see Step
15 / Error Handling — never scaffold one from nothing).

**Found** → scan the nodes immediately following that heading (up to the
next heading node or end of document) for a paragraph whose content
starts with bold text reading "Technical Development" (matching the real
example's `**Technical Development -**` shape, tolerant of the exact
trailing punctuation). That paragraph must contain one `status`-type
node — this is the node whose `attrs` this step changes: set
`attrs.text` to `"DONE"` and `attrs.color` to `"green"`, regardless of
its current value. (Single-repo scope, per the design spec: this skill
has no visibility into other repos, so completing this one *is* the
whole of what it's tracking — see design spec's "Marking it done"
section.)

Then scan the paragraphs after that Technical Development paragraph,
stopping at whichever comes first — the next stage's own bold-labeled
paragraph, the next heading, or end of document — for one whose content
is exactly an `emoji` node (short name `:check_mark:`) followed by this
repo's label (Step 4) in bold text. **Already present**
→ no further change, idempotent. **Not present** → the delta also
includes a new paragraph node to insert immediately after the last
existing checkmark paragraph under Technical Development (or immediately
after the Technical Development status paragraph itself, if it has no
checkmarks yet):

```json
{"type":"paragraph","content":[
  {"type":"emoji","attrs":{"shortName":":check_mark:","text":"✅"}},
  {"type":"text","text":" "},
  {"type":"text","text":"<label>","marks":[{"type":"strong"}]}
]}
```

**If the structure under the Track heading doesn't clearly match this
shape** (e.g. no paragraph starts with bold "Technical Development" at
all) → treat it the same as "not found": no delta, report why in Step
15. Never guess at a risky edit against an unfamiliar structure.

### Step 7: Compose the Full New Description Document

Take the `description` document fetched in Step 3 and produce a complete
new document with Step 5's delta and (if any) Step 6's delta spliced in,
every other node untouched:

- Materials & Links: if Step 5 found nothing, append the new heading +
  bullet list to the end of the top-level `content` array. If Step 5
  found an existing section (bullets or table), replace only that
  section's content nodes in place, at the same position. If Step 5
  found a heading but produced no delta (unrecognized shape — neither
  bullets nor a table), the description's Materials & Links section is
  left exactly as fetched, untouched — do not append a second heading.
- Track checklist: if Step 6 produced a delta, splice the changed
  `status` node's attrs and (if applicable) the new checkmark paragraph
  into their exact positions within the existing node sequence. If Step
  6 found nothing, the document is unchanged from Step 3 in this regard.

This composed document is the exact value Step 13 sends back — hold it
in memory, don't write yet.

### Step 8: Find Today's Existing Progress Comment

Compute today's date in `D/M` form (day and month, no leading zeros, no
year — e.g. `26/8`):

```bash
date +%-d/%-m
```

Search the `comment.comments` array fetched in Step 3 for one whose body
document's first node is a heading whose text starts with "📣 Progress
Update – " followed by that exact `D/M` string — but a plain
string-prefix check is not enough by itself: since `D/M` has no leading
zeros or fixed width, a shorter day/month string can prefix-collide with
a longer one from an unrelated date. For example, if today is `3/1` (3
January) and an old comment is headed "📣 Progress Update – 3/12" (3
December), that heading literally starts with the string for `3/1`, so a
naive prefix check would wrongly match it and silently overwrite the
December comment. Guard against this with a boundary check instead of a
plain prefix check: the heading matches only if it starts with "📣
Progress Update – <D/M>" **and** the character immediately after that
matched substring is either absent (the heading ends there) or a
non-digit. That boundary correctly rejects the `3/12`-vs-`3/1` case
(the next character after the match is `2`, a digit) while still
correctly matching a heading with legitimate trailing content, e.g. "📣
Progress Update – 26/8 (week 2)" against a search for `26/8` (the next
character is a space, a non-digit) — do not require full-string equality
on the whole heading instead, since that would break matching those
legitimately-suffixed headings. **Found** → remember its `id` as
`commentId` for Step 14. **Not found** → Step 14 creates a new comment
instead.

### Step 9: Draft "What's Done"

Check whether this session already has
`.digismith/docs/<slug>/report.html` from map item **N**
(`digismith:report-implementation`) — the same slug this ticket's work
used. **Present** → read it and draft 1-4 short bullets summarizing the
delivered work section, in the same tone as a real example:

> Trial/Returns banner implemented and verified live on JP, PH, and KR —
> icon + editable text, shown only on product pages, correct
> desktop/mobile ordering next to breadcrumbs.

**Not present** (N hasn't run this session, e.g. this plan used
`superpowers:executing-plans` instead of `subagent-driven-development`,
or the skill is invoked standalone) → draft the same style of bullets
directly from the session's actual work instead — never fabricate
specifics not actually done this session.

Always end the "What's done" block with this fixed line:

```
👆 All links (Preview Theme, Customize, Pull Request) are in the ticket description above.
```

### Step 10: Draft "Next Steps"

Ask the user, via `AskUserQuestion`, which roles need a ping on this
update and who for each (e.g. code review, design approval, QA) — there
is no automatic source for this (this repo's `CODEOWNERS`, where one
exists, only names a team, never individuals). Skip a role entirely if
the user says no one needs tagging for it; never invent a placeholder
mention.

For each name given, resolve a JIRA `accountId` by searching for that
name. **Exactly one clear match** → use it. **No match, or the user
declines to clarify an ambiguous multi-match** → stop and ask directly
rather than guessing an ID; an unresolved or wrong `accountId` produces
either a broken mention or a silent wrong tag, both worse than asking.

Draft one bullet per role-with-a-person, matching the real shape:

```
**<emoji> <Role> Needed >** (<mention>, <mention>) — <ask, plain text, one sentence>
```

### Step 11: Compose the Full Comment Document

```json
{"type":"doc","version":1,"content":[
  {"type":"heading","attrs":{"level":3},"content":[{"type":"text","text":"📣 Progress Update – <D/M>"}]},
  {"type":"rule"},
  {"type":"heading","attrs":{"level":4},"content":[{"type":"text","text":"✅ What's done"}]},
  {"type":"bulletList","content":[
    {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"<bullet 1>"}]}]}
  ]},
  {"type":"paragraph","content":[{"type":"text","text":"👆 All links (Preview Theme, Customize, Pull Request) are in the ticket description above."}]},
  {"type":"heading","attrs":{"level":4},"content":[{"type":"text","text":"🎯 Next Steps:"}]},
  {"type":"bulletList","content":[
    {"type":"listItem","content":[{"type":"paragraph","content":[
      {"type":"text","text":"<emoji> <Role> Needed >","marks":[{"type":"strong"}]},
      {"type":"text","text":" ("},
      {"type":"mention","attrs":{"id":"<accountId>"}},
      {"type":"text","text":") — <ask>"}
    ]}]}
  ]}
]}
```

One `listItem` per bullet from Steps 9 and 10 — the shape above shows
one of each for clarity; repeat the pattern for every bullet actually
drafted.

### Step 12: Confirm With the User

Render the description delta (in the human-readable terms of what's
changing — "adding a Materials & Links entry with these three links" /
"marking Technical Development done with a JP checkmark" / "Track
section not found, skipping" as applicable) and the full comment text.
Alongside the comment text, state plainly whether this write will
**create a new comment** or **replace the existing comment Step 8
found** (name its `commentId` when replacing), so the user can catch and
cancel a wrong match before it lands. Then ask via `AskUserQuestion`:
post as drafted, let the user revise first, or cancel. **Revise** →
incorporate the requested change and re-present before proceeding.
**Cancel** → stop here, nothing is written. Only **post as drafted**
continues to Step 13. This applies every time this skill runs, not just
the first — both writes are team-visible external side effects, and
JIRA's own edit history is visible to the whole team.

### Step 13: Write the Description

Write Step 7's composed document to a scratch file (e.g.
`/tmp/jira-description-<Key>.json`), then:

```bash
node ~/.digismith/repo/packages/jira-client/src/cli.ts update-description --key <Key> --file /tmp/jira-description-<Key>.json
```

### Step 14: Write the Comment

Write Step 11's composed document to a scratch file (e.g.
`/tmp/jira-comment-<Key>.json`), then:

```bash
node ~/.digismith/repo/packages/jira-client/src/cli.ts add-comment --key <Key> --file /tmp/jira-comment-<Key>.json
```

Only if Step 8 found an existing comment, add `--comment-id <id>` to the
same command — this updates the existing comment in place instead of
creating a new one.

### Step 15: Report

Confirm what was written: the ticket key, whether the description's
Materials & Links entry was created or updated (and the Track line, if
touched, or a note that it was skipped and why), and whether the comment
was created or updated (with a link to the ticket). This skill's job
ends here.

## Error Handling

- **No credentials, and the user declines to provide them at Step 2** →
  stop, say so plainly. Don't fabricate a write.
- **`digismith:depot`'s `ensure` operation fails at Step 2** → stop, say
  so plainly (see that skill's own Error Handling for the exact
  disposition). Don't fabricate a write.
- **Branch doesn't match `<Key>__<slug>`** → ask directly for the ticket
  key rather than guessing.
- **Track section absent, or present but not in the expected shape** →
  skip the Track delta entirely (Step 6), report plainly in Step 15.
  Never scaffold or force an edit against an unfamiliar structure.
- **Materials & Links section already exists as neither bullets nor a
  table** (unrecognized shape) → same disposition as the Track case:
  skip that part of the delta, report why, don't force an edit.
- **A mentioned name doesn't resolve to exactly one JIRA account** → stop
  and ask for clarification. Never guess an `accountId`.
- **Custom, site-uploaded emoji needed with no resolvable `id`** → skip
  the icon, plain text/status pill only. No tool in this session's
  toolset enumerates site-specific emoji.
- **Mistaken or duplicate comment already posted** → no delete
  capability exists — edit it via `--comment-id` instead of creating a
  corrective second comment.
- **User cancels at Step 12** → stop, nothing written, no partial write
  of just the description or just the comment.
- **The `update-description` or `add-comment` CLI call fails** (HTTP
  error, network error) → report the failure plainly with whatever
  error detail it printed to stderr; don't retry silently or fall back
  to a markdown write.

## Quick Reference

| Step | Action |
|---|---|
| 0 | Profile pre-check — skip entirely if `ticket: false` |
| 1 | Resolve `<Key>` from branch name |
| 2 | Ensure the Jira client is available: defensive `digismith:depot` `ensure` check, then `check-credentials` — bootstrap via `AskUserQuestion` if incomplete |
| 3 | Fetch description + comments via `get-issue` — real ADF for every field, no format parameter needed |
| 4 | Derive this repo's row label |
| 5 | Draft Materials & Links delta — bullets by default, table-row upsert if a table already exists, no delta (section left untouched) if it's neither |
| 6 | Draft Track checklist delta — Technical Development line only, only if the section already exists |
| 7 | Compose the full new description document (whole-field replace) |
| 8 | Find today's existing Progress Update comment, if any |
| 9 | Draft "What's done" — prefer N's report, else session summary |
| 10 | Draft "Next Steps" — ask roles/people, resolve via account lookup |
| 11 | Compose the full comment document |
| 12 | Confirm full draft with the user — post / revise / cancel |
| 13 | Write the description via `update-description` |
| 14 | Write the comment via `add-comment` (create, or update via `--comment-id`) |
| 15 | Report what was written |
```

- [ ] **Step 2: Dogfood — reasoning walkthrough of the renumbered file (reasoning only)**

Read the file just written in full, checking specifically for the things
a renumbering pass is most likely to get wrong:

1. Every `### Step N:` heading is sequential with no gaps and no
   duplicates, from 0 through 15.
2. Every cross-reference to another step by number (Step 3 mentions
   "Step 7/11"; Step 7 mentions "Step 13"; Step 8 mentions "Step 14";
   Step 9 references N's report by folder convention, not a step
   number; Step 11 mentions "Steps 9 and 10"; Step 12 mentions "Step 8"
   and "Step 13") actually points at the step that now holds the content
   the old reference meant — not the old number carried over unchanged.
3. Nothing anywhere in the file still says `responseContentFormat`,
   `contentFormat`, `cloudId`, `getJiraIssue`, `editJiraIssue`,
   `addCommentToJiraIssue`, or `lookupJiraAccountId` — all MCP-connector
   vocabulary should be gone, replaced by the `cli.ts` subcommands or
   generic language ("resolve a JIRA accountId by searching for that
   name", not naming a specific tool).
4. The Quick Reference table has exactly 16 rows (0-15), matching the
   16 `### Step` headings exactly in content, not just in count.

Record the actual conclusion for each of the four checks.

- [ ] **Step 3: If Step 2 surfaced a real gap, fix it now**

Only if a real inconsistency was found — don't invent one.

- [ ] **Step 4: Commit**

```bash
git add skills/jira-progress-write-back/SKILL.md
git commit -m "feat(jira-progress-write-back): migrate to direct Jira REST API v3"
```

---

### Task 4: Roadmap Update + Retire the Applied Backlog Item

**Files:**
- Modify: `MEMORY.md` (the `I` row's description)
- Modify: `.digismith/history.html` (a new timeline entry; the `I.1`
  paragraph-link block gets a short added note)
- Delete: `backlog/jira-rest-graphql-direct-api.md`
- Modify: `backlog/README.md` (remove that item's index line)

**Interfaces:**
- Consumes: nothing from earlier tasks beyond the fact that the
  migration shipped — this task only updates documentation.
- Produces: nothing consumed elsewhere in this plan; this is the closing
  task.

- [ ] **Step 1: Update `MEMORY.md`'s `I` row**

Find the `| **I** | QA handoff | ...` row. Its `I.1` clause currently
reads (in part): "...including real ADF formatting (status lozenges,
emoji) so the update reads native, not markdown-approximated — no status
transition, that stays manual by design. Shipped 2026-08-26:
`digismith:jira-progress-write-back` skill, single repo/ticket at a
time". Append a new sentence directly after that clause, before the
` · **I.2**` that follows it:

```
Migrated 2026-08-27 off the Atlassian MCP connector onto direct Jira REST API v3 calls (`packages/jira-client`, provisioned via **V**) after the connector's first live run (EMKT-756) returned lossy, non-ADF `description` content despite requesting ADF — see `backlog/jira-rest-graphql-direct-api.md`'s history for the root cause (now resolved and retired from the backlog, see Task 4 of this migration's own plan).
```

- [ ] **Step 2: Add a short note to `.digismith/history.html`'s `I.1` paragraph-link block**

Find:

```html
<p style="font-size:.88rem; color:var(--muted);">
  <strong>I.1 — JIRA progress write-back:</strong> <code>jira-progress-write-back</code> skill —
  <a href="docs/jira-progress-write-back/design.html">design spec</a> ·
  <a href="docs/jira-progress-write-back/plan.md">implementation plan</a>
</p>
```

Change it to:

```html
<p style="font-size:.88rem; color:var(--muted);">
  <strong>I.1 — JIRA progress write-back:</strong> <code>jira-progress-write-back</code> skill —
  <a href="docs/jira-progress-write-back/design.html">design spec</a> ·
  <a href="docs/jira-progress-write-back/plan.md">implementation plan</a> ·
  migrated to direct REST 2026-08-27, see
  <a href="docs/jira-rest-migration/design.html">migration spec</a> ·
  <a href="docs/jira-rest-migration/plan.md">migration plan</a>
</p>
```

- [ ] **Step 3: Add a timeline entry to `.digismith/history.html`**

Immediately before the closing `</div>` of `<div class="timeline">`
(after the most recent existing entry), add:

```html
<div class="event">
  <div class="date">2026-08-27</div>
  <h4>I.1 migrated off the MCP connector to direct Jira REST — 4 tasks, subagent-driven-development</h4>
  <p>The bug found live on EMKT-756 (the MCP connector's <code>getJiraIssue</code>
  returning lossy, non-ADF content for the <code>description</code> field) is now
  fixed at the root: <code>packages/jira-client</code>, a new pnpm-workspace
  package with zero runtime dependencies, calls Jira's REST API v3 directly
  with a personal API token, provisioned onto consumer machines by
  <strong>V</strong> (<code>digismith:depot</code>). Task 1 built and
  fully unit-tested (Vitest) all five client functions
  (<code>checkCredentials</code>, <code>getIssue</code>,
  <code>updateDescription</code>, <code>addComment</code>,
  <code>getAttachmentContent</code>). Task 2 built the thin
  <code>cli.ts</code> dispatcher and dogfooded it for real against a
  temporary fake home directory (never the real
  <code>~/.digismith/.env</code>, never a live network call). Task 3
  migrated <code>jira-progress-write-back</code>'s <code>SKILL.md</code>
  wholesale — removing the old <code>cloudId</code>-resolution step
  entirely and renumbering every step after it, while leaving the ADF
  business logic (description-delta splicing, comment date-matching, the
  confirm-before-write gate) completely untouched. Task 4 is this
  <code>history.html</code> and <code>MEMORY.md</code> update, and
  retires <code>backlog/jira-rest-graphql-direct-api.md</code> now that
  its proposal is actually built.</p>
</div>
```

- [ ] **Step 4: Delete the now-applied backlog item**

Per `backlog/README.md`'s own convention ("Delete an item's file once
it's been applied"):

```bash
rm backlog/jira-rest-graphql-direct-api.md
```

- [ ] **Step 5: Remove its line from `backlog/README.md`'s index**

Find and delete this line from the `## Items` list:

```
- [Jira: stop depending on the Atlassian MCP connector, call REST/GraphQL directly](jira-rest-graphql-direct-api.md) — MCP's `description` field came back lossy (not real ADF), no attachment-content download, and the connector itself dropped mid-session; per-user API token instead
```

- [ ] **Step 6: Commit**

```bash
git add MEMORY.md .digismith/history.html backlog/README.md
git add backlog/jira-rest-graphql-direct-api.md
git commit -m "docs(jira-rest-migration): update roadmap, retire applied backlog item"
```

(The second `git add` stages the deletion — `git add` on a path that no
longer exists on disk stages its removal, same as `git rm` would.)

---

## Closing Note

This plan does not touch `backlog/track-section-template.md` — that
item's own "Tension with I.1's current scope" section is a separate,
larger design question (I.2-shaped) that this migration deliberately
leaves for its own future brainstorm. It also does not wire
`get-attachment` into any `jira-progress-write-back` step — the function
exists on the client for future use, but no current step calls it.
