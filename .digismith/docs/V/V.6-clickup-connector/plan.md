# ClickUp Connector (V.6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Jack's existing, working ClickUp API client from his Soveron repo into a new published package, `@digismith/clickup-client`, and expose read-only `dg clickup` CLI commands built on top of it.

**Architecture:** A new `packages/clickup-client` workspace package holds the moved `ClickUpClient` class (axios, rate-limited), its types, and a new jira-client-style credential loader. Unlike `packages/jira-client` (workspace-private), this package is published to npm because `@digismith/cli` — itself published — needs a real dependency on it to power `dg clickup`. The CLI bucket lives in `packages/cli/src/clickup/`, mirroring the existing `depot`/`vps` bucket-of-leaves shape.

**Tech Stack:** TypeScript (NodeNext ESM), axios, Vitest, yargs (CLI only). Node >=24.

## Global Constraints

- Package name: `@digismith/clickup-client`. CLI package: `@digismith/cli` (existing).
- Credentials: `CLICKUP_API_TOKEN`, `CLICKUP_TEAM_ID` in `~/.digismith-depot/.env` — never `process.env` reads ad hoc.
- Relative imports use explicit `.ts` extensions (NodeNext ESM convention already used by `packages/jira-client` and `packages/cli`).
- Test files are named `*.test.ts` (not `*.spec.ts` — the Soveron source uses `.spec.ts`, this repo's convention is `.test.ts`).
- `packages/clickup-client`'s existing class-based/axios/`RateLimiter` shape is kept as-is — do not rewrite to jira-client's functional/zero-dep style.
- `packages/clickup-client` ships `"private": false` with `publishConfig.access: "public"`, matching `packages/cli`'s existing publish setup (license `MIT`, same `repository` block shape, same author block).
- Day-one `dg clickup` CLI surface is read-only only: `check-credentials`, `list-tasks`, `get-task`, `get-lists`. No `create-task`/`update-task`/`add-comment` CLI wrapper yet (the underlying class methods exist and are already covered by Task 3's tests; only the CLI wrapper is out of scope).
- No AI attribution in commit messages (this repo's standing policy, enforced by `scripts/git-hooks/commit-msg`).

---

### Task 1: Scaffold `packages/clickup-client` + move `RateLimiter`

**Files:**
- Create: `packages/clickup-client/package.json`
- Create: `packages/clickup-client/tsconfig.json`
- Create: `packages/clickup-client/tsconfig.build.json`
- Create: `packages/clickup-client/LICENSE`
- Create: `packages/clickup-client/src/rate-limiter.ts`
- Create: `packages/clickup-client/src/rate-limiter.test.ts`

**Interfaces:**
- Produces: `RateLimiter` class (`packages/clickup-client/src/rate-limiter.ts`) — `constructor(capacity: number, refillPerSec: number, now?: Clock, sleep?: Sleep)`, `msUntilAvailable(): number`, `acquire(): Promise<void>`. `Clock = () => number`, `Sleep = (ms: number) => Promise<void>`. Later tasks (Task 3) import this unchanged.

- [ ] **Step 1: Create the package scaffold**

`packages/clickup-client/package.json`:
```json
{
  "name": "@digismith/clickup-client",
  "version": "0.1.0",
  "description": "Generic ClickUp API client — tasks, lists, folders, custom fields",
  "license": "MIT",
  "type": "module",
  "engines": {
    "node": ">=24"
  },
  "dependencies": {
    "axios": "^1.18.0"
  },
  "files": [
    "dist"
  ],
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "publishConfig": {
    "access": "public"
  },
  "scripts": {
    "build": "node -e \"require('node:fs').rmSync('dist',{recursive:true,force:true})\" && tsc -p tsconfig.build.json",
    "prepack": "pnpm build",
    "test": "vitest run"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/Jazurite/DigiSmith.git",
    "directory": "packages/clickup-client"
  },
  "author": {
    "name": "Jack Huỳnh",
    "email": "jack@jazurite.com"
  }
}
```

`packages/clickup-client/tsconfig.json` (dev/editor config, mirrors `packages/jira-client/tsconfig.json`):
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

`packages/clickup-client/tsconfig.build.json` (build config, mirrors `packages/cli/tsconfig.build.json`):
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "allowImportingTsExtensions": true,
    "rewriteRelativeImportExtensions": true,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts"]
}
```

`packages/clickup-client/LICENSE` — copy `packages/cli/LICENSE` verbatim (MIT, same copyright line: `Copyright (c) 2026 Jack Huỳnh`).

- [ ] **Step 2: Write the failing test for `RateLimiter`**

`packages/clickup-client/src/rate-limiter.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { RateLimiter } from "./rate-limiter.ts";

describe("RateLimiter", () => {
  it("starts full: a token is available immediately", () => {
    const limiter = new RateLimiter(100, 100 / 60, () => 0);
    expect(limiter.msUntilAvailable()).toBe(0);
  });

  it("reports a wait once the bucket is drained, then refills over time", async () => {
    let clock = 0;
    const sleep = vi.fn(async () => {});
    const limiter = new RateLimiter(2, 1, () => clock, sleep); // 1 token/sec

    await limiter.acquire(); // 2 -> 1
    await limiter.acquire(); // 1 -> 0
    expect(sleep).not.toHaveBeenCalled();
    expect(limiter.msUntilAvailable()).toBe(1000); // need 1 token at 1/sec

    clock = 1000; // one second passes -> +1 token
    expect(limiter.msUntilAvailable()).toBe(0);
  });

  it("acquire waits for the computed delay when empty", async () => {
    let clock = 0;
    const sleep = vi.fn((ms: number): Promise<void> => {
      clock += ms; // simulate time passing during the sleep
      return Promise.resolve();
    });
    const limiter = new RateLimiter(1, 1, () => clock, sleep);

    await limiter.acquire(); // consumes the only token, no wait
    await limiter.acquire(); // empty -> must wait ~1000ms
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(1000);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm install` (registers the new workspace package), then `pnpm exec vitest run packages/clickup-client/src/rate-limiter.test.ts`
Expected: FAIL — `rate-limiter.ts` doesn't exist yet (module not found).

- [ ] **Step 4: Create `rate-limiter.ts`**

`packages/clickup-client/src/rate-limiter.ts` (moved verbatim from `E:\MEGA\Obsidian\Knowpolis\1. Soveron\Armory\clickup-envoy\packages\clickup-client\src\clickup\rate-limiter.ts`, no changes — it has no external imports):
```ts
export type Clock = () => number;
export type Sleep = (ms: number) => Promise<void>;

const realSleep: Sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * In-process token bucket. Capacity tokens, refilled at refillPerSec.
 * `now` and `sleep` are injectable so tests run without real time.
 */
export class RateLimiter {
  private tokens: number;
  private last: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
    private readonly now: Clock = Date.now,
    private readonly sleep: Sleep = realSleep,
  ) {
    this.tokens = capacity;
    this.last = now();
  }

  private refill(): void {
    const t = this.now();
    const elapsedSec = (t - this.last) / 1000;
    this.tokens = Math.min(
      this.capacity,
      this.tokens + elapsedSec * this.refillPerSec,
    );
    this.last = t;
  }

  msUntilAvailable(): number {
    this.refill();
    if (this.tokens >= 1) return 0;
    return Math.ceil(((1 - this.tokens) / this.refillPerSec) * 1000);
  }

  async acquire(): Promise<void> {
    const wait = this.msUntilAvailable();
    if (wait > 0) {
      await this.sleep(wait);
      this.refill();
    }
    this.tokens -= 1;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run packages/clickup-client/src/rate-limiter.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add packages/clickup-client/package.json packages/clickup-client/tsconfig.json packages/clickup-client/tsconfig.build.json packages/clickup-client/LICENSE packages/clickup-client/src/rate-limiter.ts packages/clickup-client/src/rate-limiter.test.ts pnpm-lock.yaml
git commit -m "feat(clickup-client): scaffold package and move RateLimiter"
```

---

### Task 2: Add credential handling (`credentials.ts`)

**Files:**
- Create: `packages/clickup-client/src/credentials.ts`
- Create: `packages/clickup-client/src/credentials.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `checkCredentials(envPath?: string): Credentials`, `CredentialsError extends Error`, `interface Credentials { teamId: string; apiToken: string }` (`packages/clickup-client/src/credentials.ts`). Task 3's `ClickUpClient` and Task 5's CLI `lib.ts` both import these.

- [ ] **Step 1: Write the failing tests**

`packages/clickup-client/src/credentials.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkCredentials, CredentialsError } from "./credentials.ts";

describe("checkCredentials", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns credentials when the env file has both values", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "clickup-client-test-"));
    const envPath = join(tmpDir, ".env");
    writeFileSync(envPath, "CLICKUP_API_TOKEN=tok_123\nCLICKUP_TEAM_ID=5738747\n");

    const creds = checkCredentials(envPath);

    expect(creds).toEqual({ teamId: "5738747", apiToken: "tok_123" });
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("strips surrounding quotes from values", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "clickup-client-test-"));
    const envPath = join(tmpDir, ".env");
    writeFileSync(envPath, 'CLICKUP_API_TOKEN="tok_123"\nCLICKUP_TEAM_ID=\'5738747\'\n');

    const creds = checkCredentials(envPath);

    expect(creds).toEqual({ teamId: "5738747", apiToken: "tok_123" });
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws CredentialsError when the file doesn't exist", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "clickup-client-test-"));
    const envPath = join(tmpDir, "missing.env");

    expect(() => checkCredentials(envPath)).toThrow(CredentialsError);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws CredentialsError when CLICKUP_TEAM_ID is missing", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "clickup-client-test-"));
    const envPath = join(tmpDir, ".env");
    writeFileSync(envPath, "CLICKUP_API_TOKEN=tok_123\n");

    expect(() => checkCredentials(envPath)).toThrow(
      /need CLICKUP_API_TOKEN, CLICKUP_TEAM_ID/
    );
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws CredentialsError when CLICKUP_API_TOKEN is missing", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "clickup-client-test-"));
    const envPath = join(tmpDir, ".env");
    writeFileSync(envPath, "CLICKUP_TEAM_ID=5738747\n");

    expect(() => checkCredentials(envPath)).toThrow(CredentialsError);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("ignores blank lines and comments", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "clickup-client-test-"));
    const envPath = join(tmpDir, ".env");
    writeFileSync(
      envPath,
      "# ClickUp\n\nCLICKUP_API_TOKEN=tok_123\n\n# team\nCLICKUP_TEAM_ID=5738747\n"
    );

    const creds = checkCredentials(envPath);

    expect(creds).toEqual({ teamId: "5738747", apiToken: "tok_123" });
    rmSync(tmpDir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run packages/clickup-client/src/credentials.test.ts`
Expected: FAIL — `credentials.ts` doesn't exist yet.

- [ ] **Step 3: Write `credentials.ts`**

`packages/clickup-client/src/credentials.ts` (mirrors `packages/jira-client/src/client.ts`'s `checkCredentials`/`CredentialsError`/`parseEnvFile`/`stripQuotes` pattern, renamed to ClickUp's two env keys):
```ts
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Credentials {
  teamId: string;
  apiToken: string;
}

export class CredentialsError extends Error {}

function defaultEnvPath(): string {
  return join(homedir(), ".digismith-depot", ".env");
}

function stripQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
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
    const value = stripQuotes(line.slice(eq + 1).trim());
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
  const { CLICKUP_API_TOKEN, CLICKUP_TEAM_ID } = vars;
  if (!CLICKUP_API_TOKEN || !CLICKUP_TEAM_ID) {
    throw new CredentialsError(
      `incomplete credentials in ${envPath} — need CLICKUP_API_TOKEN, CLICKUP_TEAM_ID`
    );
  }
  return { teamId: CLICKUP_TEAM_ID, apiToken: CLICKUP_API_TOKEN };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/clickup-client/src/credentials.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/clickup-client/src/credentials.ts packages/clickup-client/src/credentials.test.ts
git commit -m "feat(clickup-client): add credentials loader"
```

---

### Task 3: Move ClickUp types + `ClickUpClient`

**Files:**
- Create: `packages/clickup-client/src/types.ts`
- Create: `packages/clickup-client/src/client.ts`
- Create: `packages/clickup-client/src/client.test.ts`

**Interfaces:**
- Consumes: `RateLimiter` (Task 1, `./rate-limiter.ts`).
- Produces: `ClickUpClient` class and `ClickUpClientConfig`/`RequestOptions` interfaces (`packages/clickup-client/src/client.ts`); every `ClickUp*` type (`packages/clickup-client/src/types.ts`). Task 4's barrel and Task 5's CLI `lib.ts` both import `ClickUpClient`.

- [ ] **Step 1: Create `types.ts`**

`packages/clickup-client/src/types.ts` (moved verbatim from `E:\MEGA\Obsidian\Knowpolis\1. Soveron\Armory\types\src\clickup.ts` — self-contained, no external imports, no changes needed):
```ts
export interface ClickUpUser {
  id: number;
  username: string;
  color: string;
  email: string;
  profilePicture: string;
}

export interface ClickUpAssignee extends ClickUpUser {
  initials: string;
}

export interface ClickUpStatus {
  status: string;
  id: string;
  color: string;
  type: string;
  orderindex: number;
}

export interface ClickUpList {
  id: string;
  name: string;
  access: boolean;
}

export interface ClickUpFolder {
  id: string;
  name: string;
  hidden: boolean;
  access: boolean;
}

export interface ClickUpSpace {
  id: string;
}

export interface ClickUpSharing {
  public: boolean;
  public_share_expires_on: string | null;
  public_fields: string[];
  token: string | null;
  seo_optimized: boolean;
}

export interface ClickUpDropdownOption {
  id: string;
  name: string;
  color: string | null;
  orderindex: number;
}

export interface ClickUpLabelOption {
  id: string;
  label: string;
  color: string;
  orderindex: number;
}

interface CustomFieldBase {
  id: string;
  name: string;
  type: string;
  type_config: Record<string, unknown>;
  date_created: string;
  hide_from_guests: boolean;
  required: boolean;
}

export interface AutomaticProgressField extends CustomFieldBase {
  type: 'automatic_progress';
  type_config: {
    tracking: {
      subtasks: boolean;
      checklists: boolean;
      assigned_comments: boolean;
    };
    complete_on: number;
    subtask_rollup: boolean;
  };
  value: { percent_complete: number };
}

export interface CheckboxField extends CustomFieldBase {
  type: 'checkbox';
  type_config: Record<string, never>;
  value?: boolean;
}

export interface CurrencyField extends CustomFieldBase {
  type: 'currency';
  type_config: {
    default: null;
    precision: number;
    currency_type: string;
  };
  value?: string;
  value_richtext: null;
}

export interface DropdownField extends CustomFieldBase {
  type: 'drop_down';
  type_config: {
    default: number;
    sorting: string;
    placeholder: string | null;
    new_drop_down: boolean;
    options: ClickUpDropdownOption[];
  };
  value?: number;
  value_richtext: null;
}

export interface LabelsField extends CustomFieldBase {
  type: 'labels';
  type_config: {
    sorting: string;
    options: ClickUpLabelOption[];
  };
  value?: string[];
}

export type ClickUpCustomField =
  | AutomaticProgressField
  | CheckboxField
  | CurrencyField
  | DropdownField
  | LabelsField;

export interface ClickUpTask {
  id: string;
  custom_id: string | null;
  custom_item_id: number;
  name: string;
  text_content: string;
  description: string;
  status: ClickUpStatus;
  orderindex: string;
  date_created: string;
  date_updated: string;
  date_closed: string | null;
  date_done: string | null;
  archived: boolean;
  creator: ClickUpUser;
  assignees: ClickUpAssignee[];
  group_assignees: unknown[];
  watchers: ClickUpAssignee[];
  checklists: unknown[];
  tags: ClickUpTag[];
  parent: string | null;
  top_level_parent: string | null;
  priority: ClickUpPriority | null;
  due_date: string | null;
  start_date: string | null;
  points: number | null;
  time_estimate: number | null;
  custom_fields: ClickUpCustomField[];
  dependencies: unknown[];
  linked_tasks: unknown[];
  locations: unknown[];
  team_id: string;
  url: string;
  sharing: ClickUpSharing;
  permission_level: string;
  list: ClickUpList;
  project: ClickUpFolder;
  folder: ClickUpFolder;
  space: ClickUpSpace;
}

export interface ClickUpTag {
  name: string;
  tag_fg: string;
  tag_bg: string;
  creator: number;
}

export interface ClickUpPriority {
  id: string;
  priority: string;
  color: string;
  orderindex: string;
}

export interface ClickUpTasksResponse {
  tasks: ClickUpTask[];
}

/**
 * A ClickUp custom task type, returned by GET /team/{team_id}/custom_item.
 * ClickUp's UI calls these "task types"; the API path uses "custom_item".
 * Note: the default "Task" type (id 0) is NOT returned by this endpoint.
 */
export interface ClickUpTaskType {
  id: number;
  name: string;
  name_plural: string | null;
  description: string | null;
  avatar: { source: string | null; value: string | null } | null;
}

export interface ClickUpTaskTypesResponse {
  custom_items: ClickUpTaskType[];
}

export interface ClickUpListSummary { id: string; name: string; }
export interface ClickUpFolderWithLists { id: string; name: string; lists: ClickUpListSummary[]; }
export interface ClickUpFoldersResponse { folders: ClickUpFolderWithLists[]; }
export interface ClickUpListsResponse { lists: ClickUpListSummary[]; }
export interface ClickUpFieldsResponse { fields: ClickUpCustomField[]; }
export interface ClickUpListStatusOption {
  id: string;
  status: string;
  orderindex: number;
  color: string;
  type: string;
  status_group: string;
}

export interface ClickUpListDetail {
  id: string;
  name: string;
  statuses: ClickUpListStatusOption[];
}
export interface ClickUpTaskWriteBody {
  name?: string;
  description?: string;
  start_date?: number;
  start_date_time?: boolean;
  due_date?: number;
  due_date_time?: boolean;
  time_estimate?: number;
  custom_item_id?: number;
  status?: string;
}

export interface FrontdoorOptionAdd {
  name: string;
  color: string;
  orderindex: number;
}

/**
 * The full body ClickUp's own web app sends to its undocumented
 * PUT /customFields/v2/field/{id} endpoint. The public API never returns
 * enough to reconstruct this.
 */
export interface FrontdoorFieldPutBody {
  id: string;
  name: string;
  type: 'drop_down';
  type_config: {
    default: number;
    sorting: string;
    placeholder: string | null;
    new_drop_down: boolean;
    options: {
      add: FrontdoorOptionAdd[];
      update: [];
      rem: [];
    };
  };
  userid: string;
  date_created: string;
  hide_from_guests: boolean;
  team_id: string;
  deleted: false;
  date_deleted: null;
  required: boolean;
  required_on_subtasks: false;
  private: false;
  pinned: true;
  default_value: null;
  teams: { id: string; name: string; entity: 'team'; applied_objects: null }[];
  values_set: null;
  description: '';
  deleted_by: null;
  linked_subcategory: null;
  permission_level: null;
  type_id: 1;
  automation_count: 0;
  members: [];
  groups: [];
}
```

- [ ] **Step 2: Write the failing tests for `ClickUpClient`**

`packages/clickup-client/src/client.test.ts` (ported from Soveron's `clickup.client.spec.ts`: `jest.mock`/`jest.fn` → `vi.mock`/`vi.fn`, `jest.Mock` cast → `vi.mocked`, import from `@armory/types` dropped since types are now local):
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import { ClickUpClient, type ClickUpClientConfig } from "./client.ts";

vi.mock("axios");

const request = vi.fn();
const configStub: ClickUpClientConfig = {
  CLICKUP_TEAM_ID: "5738747",
  CLICKUP_API_TOKEN: "tok_123",
};

function makeClient(): ClickUpClient {
  vi.mocked(axios.create).mockReturnValue({ request } as unknown as ReturnType<typeof axios.create>);
  return new ClickUpClient(configStub);
}

describe("ClickUpClient core", () => {
  beforeEach(() => {
    request.mockReset();
    vi.mocked(axios.create).mockReset();
  });

  it("configures axios with the base URL and Authorization header", () => {
    makeClient();

    expect(vi.mocked(axios.create)).toHaveBeenCalledWith({
      baseURL: "https://api.clickup.com/api/v2",
      headers: { Authorization: "tok_123" },
    });
  });

  it("get() issues a GET and returns the response body", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: { hello: "world" } });

    const result = await client.get<{ hello: string }>("/ping", {
      params: { a: 1 },
    });

    expect(request).toHaveBeenCalledWith({
      method: "GET",
      url: "/ping",
      params: { a: 1 },
      data: undefined,
    });
    expect(result).toEqual({ hello: "world" });
  });

  it("paginate() walks pages until selectPage returns empty, concatenating results", async () => {
    const client = makeClient();
    request
      .mockResolvedValueOnce({ data: { items: ["a", "b"] } })
      .mockResolvedValueOnce({ data: { items: ["c"] } })
      .mockResolvedValueOnce({ data: { items: [] } });

    const select = (resp: unknown) => (resp as { items: string[] }).items;
    const all = await client.paginate<string>("/things", { params: { x: 9 } }, select);

    expect(all).toEqual(["a", "b", "c"]);
    expect(request).toHaveBeenCalledTimes(3);
    expect(request).toHaveBeenNthCalledWith(1, {
      method: "GET",
      url: "/things",
      params: { x: 9, page: 0 },
      data: undefined,
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      method: "GET",
      url: "/things",
      params: { x: 9, page: 1 },
      data: undefined,
    });
    expect(request).toHaveBeenNthCalledWith(3, {
      method: "GET",
      url: "/things",
      params: { x: 9, page: 2 },
      data: undefined,
    });
  });
});

describe("ClickUpClient domain methods", () => {
  beforeEach(() => {
    request.mockReset();
    vi.mocked(axios.create).mockReset();
  });

  it("getTaskTypes() GETs the team custom_item endpoint and returns custom_items", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({
      data: { custom_items: [{ id: 1007, name: "Expense" }] },
    });

    const types = await client.getTaskTypes();

    expect(request).toHaveBeenCalledWith({
      method: "GET",
      url: "/team/5738747/custom_item",
      params: undefined,
      data: undefined,
    });
    expect(types).toEqual([{ id: 1007, name: "Expense" }]);
  });

  it("getTaskTypes() throws when custom_items is missing", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: {} });

    await expect(client.getTaskTypes()).rejects.toThrow("custom_items");
  });

  it("getListTasks() paginates the list task endpoint", async () => {
    const client = makeClient();
    request
      .mockResolvedValueOnce({ data: { tasks: [{ id: "1" }] } })
      .mockResolvedValueOnce({ data: { tasks: [] } });

    const tasks = await client.getListTasks("901", { params: { subtasks: true } });

    expect(tasks).toEqual([{ id: "1" }]);
    expect(request).toHaveBeenNthCalledWith(1, {
      method: "GET",
      url: "/list/901/task",
      params: { subtasks: true, page: 0 },
      data: undefined,
    });
  });

  it("getAllListTasks requests closed tasks and subtasks", async () => {
    const client = new ClickUpClient({ CLICKUP_TEAM_ID: "t", CLICKUP_API_TOKEN: "k" });
    const get = vi.spyOn(client, "get").mockResolvedValue({ tasks: [] });

    await client.getAllListTasks("L1");

    expect(get).toHaveBeenCalledWith("/list/L1/task", {
      params: { include_closed: true, subtasks: true, page: 0 },
    });
  });
});

describe("ClickUpClient write support", () => {
  beforeEach(() => {
    request.mockReset();
    vi.mocked(axios.create).mockReset();
  });

  it("post() issues a POST with a JSON body", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: { id: "9" } });

    const result = await client.post<{ id: string }>("/list/1/task", {
      data: { name: "Breakfast" },
    });

    expect(request).toHaveBeenCalledWith({
      method: "POST",
      url: "/list/1/task",
      params: undefined,
      data: { name: "Breakfast" },
    });
    expect(result).toEqual({ id: "9" });
  });

  it("put() issues a PUT with a JSON body", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: { id: "9", status: "Done" } });

    await client.put("/task/9", { data: { status: "Done" } });

    expect(request).toHaveBeenCalledWith({
      method: "PUT",
      url: "/task/9",
      params: undefined,
      data: { status: "Done" },
    });
  });
});

describe("ClickUpClient domain write/read methods", () => {
  beforeEach(() => {
    request.mockReset();
    vi.mocked(axios.create).mockReset();
  });

  it("createTask() POSTs the task body to the list task endpoint", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: { id: "abc" } });

    const task = await client.createTask("901", { name: "Breakfast", time_estimate: 600000 });

    expect(request).toHaveBeenCalledWith({
      method: "POST",
      url: "/list/901/task",
      params: undefined,
      data: { name: "Breakfast", time_estimate: 600000 },
    });
    expect(task).toEqual({ id: "abc" });
  });

  it("updateTask() PUTs the body to the task endpoint", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: { id: "abc", status: "Done" } });

    await client.updateTask("abc", { status: "Done" });

    expect(request).toHaveBeenCalledWith({
      method: "PUT",
      url: "/task/abc",
      params: undefined,
      data: { status: "Done" },
    });
  });

  it("setCustomField() POSTs { value } to the field endpoint", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: {} });

    await client.setCustomField("abc", "field-uuid", "option-uuid");

    expect(request).toHaveBeenCalledWith({
      method: "POST",
      url: "/task/abc/field/field-uuid",
      params: undefined,
      data: { value: "option-uuid" },
    });
  });

  it("getSpaceFolders() returns folders with their lists", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({
      data: {
        folders: [
          { id: "f1", name: "Weeks", lists: [{ id: "l1", name: "CW-30: 20/7 - 26/7" }] },
        ],
      },
    });

    const folders = await client.getSpaceFolders("90165960730");

    expect(request).toHaveBeenCalledWith({
      method: "GET",
      url: "/space/90165960730/folder",
      params: undefined,
      data: undefined,
    });
    expect(folders[0].lists[0].name).toBe("CW-30: 20/7 - 26/7");
  });

  it("getFolderlessLists() returns the lists array", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: { lists: [{ id: "l9", name: "Workflows" }] } });

    const lists = await client.getFolderlessLists("90165960730");

    expect(request).toHaveBeenCalledWith({
      method: "GET",
      url: "/space/90165960730/list",
      params: undefined,
      data: undefined,
    });
    expect(lists).toEqual([{ id: "l9", name: "Workflows" }]);
  });

  it("getListFields() returns the fields array", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({
      data: { fields: [{ id: "cf1", name: "Activity", type: "drop_down" }] },
    });

    const fields = await client.getListFields("901");

    expect(request).toHaveBeenCalledWith({
      method: "GET",
      url: "/list/901/field",
      params: undefined,
      data: undefined,
    });
    expect(fields[0].name).toBe("Activity");
  });

  it("getListStatuses() returns the status name strings from a list", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({
      data: { id: "901", name: "CW-30", statuses: [{ status: "to do" }, { status: "done" }] },
    });

    const statuses = await client.getListStatuses("901");

    expect(request).toHaveBeenCalledWith({
      method: "GET",
      url: "/list/901",
      params: undefined,
      data: undefined,
    });
    expect(statuses).toEqual(["to do", "done"]);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm exec vitest run packages/clickup-client/src/client.test.ts`
Expected: FAIL — `client.ts` doesn't exist yet.

- [ ] **Step 4: Create `client.ts`**

`packages/clickup-client/src/client.ts` (moved from Soveron's `clickup.client.ts`; only change is the two import paths — `@armory/types` → `./types.ts`, and `./rate-limiter` → `./rate-limiter.ts`):
```ts
import axios, { AxiosInstance } from "axios";
import type {
  ClickUpCustomField,
  ClickUpFolderWithLists,
  ClickUpFoldersResponse,
  ClickUpFieldsResponse,
  ClickUpListDetail,
  ClickUpListSummary,
  ClickUpListsResponse,
  ClickUpTask,
  ClickUpTasksResponse,
  ClickUpTaskType,
  ClickUpTaskTypesResponse,
  ClickUpTaskWriteBody,
} from "./types.ts";
import { RateLimiter } from "./rate-limiter.ts";

const BASE_URL = "https://api.clickup.com/api/v2";
const RATE_LIMIT = 100; // requests
const RATE_WINDOW_SEC = 60;

export interface RequestOptions {
  params?: Record<string, unknown>;
  data?: unknown;
}

export interface ClickUpClientConfig {
  CLICKUP_TEAM_ID: string;
  CLICKUP_API_TOKEN: string;
}

export class ClickUpClient {
  protected readonly teamId: string;
  private readonly http: AxiosInstance;
  private readonly limiter: RateLimiter;

  constructor(config: ClickUpClientConfig) {
    this.teamId = config.CLICKUP_TEAM_ID;
    const token = config.CLICKUP_API_TOKEN;
    this.http = axios.create({
      baseURL: BASE_URL,
      headers: { Authorization: token },
    });
    this.limiter = new RateLimiter(RATE_LIMIT, RATE_LIMIT / RATE_WINDOW_SEC);
  }

  async request<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    opts: RequestOptions = {},
  ): Promise<T> {
    await this.limiter.acquire();
    const { data } = await this.http.request<T>({
      method,
      url: path,
      params: opts.params,
      data: opts.data,
    });
    return data;
  }

  get<T>(path: string, opts?: RequestOptions): Promise<T> {
    return this.request<T>("GET", path, opts);
  }

  post<T>(path: string, opts?: RequestOptions): Promise<T> {
    return this.request<T>("POST", path, opts);
  }

  put<T>(path: string, opts?: RequestOptions): Promise<T> {
    return this.request<T>("PUT", path, opts);
  }

  delete<T>(path: string, opts?: RequestOptions): Promise<T> {
    return this.request<T>("DELETE", path, opts);
  }

  async paginate<T>(
    path: string,
    opts: RequestOptions,
    selectPage: (resp: unknown) => T[],
  ): Promise<T[]> {
    const all: T[] = [];
    let page = 0;
    for (;;) {
      const resp = await this.get<unknown>(path, {
        params: { ...opts.params, page },
      });
      const batch = selectPage(resp);
      if (batch.length === 0) break;
      all.push(...batch);
      page++;
    }
    return all;
  }

  async getTaskTypes(): Promise<ClickUpTaskType[]> {
    const data = await this.get<ClickUpTaskTypesResponse>(`/team/${this.teamId}/custom_item`);
    if (!data || !Array.isArray(data.custom_items)) {
      throw new Error("ClickUp response missing custom_items array");
    }
    return data.custom_items;
  }

  getListTasks(listId: string, opts: RequestOptions = {}): Promise<ClickUpTask[]> {
    return this.paginate<ClickUpTask>(
      `/list/${listId}/task`,
      opts,
      (resp) => (resp as ClickUpTasksResponse).tasks ?? [],
    );
  }

  /** Every task on the list, closed and subtasks included — what every sync path wants. */
  getAllListTasks(listId: string): Promise<ClickUpTask[]> {
    return this.getListTasks(listId, {
      params: { include_closed: true, subtasks: true },
    });
  }

  createTask(listId: string, body: ClickUpTaskWriteBody): Promise<ClickUpTask> {
    return this.post<ClickUpTask>(`/list/${listId}/task`, { data: body });
  }

  updateTask(taskId: string, body: ClickUpTaskWriteBody): Promise<ClickUpTask> {
    return this.put<ClickUpTask>(`/task/${taskId}`, { data: body });
  }

  async deleteTask(taskId: string): Promise<void> {
    await this.delete(`/task/${taskId}`);
  }

  async setCustomField(taskId: string, fieldId: string, value: unknown): Promise<void> {
    await this.post(`/task/${taskId}/field/${fieldId}`, { data: { value } });
  }

  async getSpaceFolders(spaceId: string): Promise<ClickUpFolderWithLists[]> {
    const data = await this.get<ClickUpFoldersResponse>(`/space/${spaceId}/folder`);
    return data.folders ?? [];
  }

  async getFolderlessLists(spaceId: string): Promise<ClickUpListSummary[]> {
    const data = await this.get<ClickUpListsResponse>(`/space/${spaceId}/list`);
    return data.lists ?? [];
  }

  async getListFields(listId: string): Promise<ClickUpCustomField[]> {
    const data = await this.get<ClickUpFieldsResponse>(`/list/${listId}/field`);
    return data.fields ?? [];
  }

  async getListStatuses(listId: string): Promise<string[]> {
    const data = await this.get<ClickUpListDetail>(`/list/${listId}`);
    return (data.statuses ?? []).map((s) => s.status);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run packages/clickup-client/src/client.test.ts`
Expected: PASS (16 tests)

- [ ] **Step 6: Commit**

```bash
git add packages/clickup-client/src/types.ts packages/clickup-client/src/client.ts packages/clickup-client/src/client.test.ts
git commit -m "feat(clickup-client): move ClickUpClient and its types"
```

---

### Task 4: Publish-ready barrel export + build verification

**Files:**
- Create: `packages/clickup-client/src/index.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–3.
- Produces: the package's public surface — `ClickUpClient`, `ClickUpClientConfig`, `RequestOptions`, `RateLimiter`, `checkCredentials`, `CredentialsError`, `Credentials`, and every `ClickUp*` type. Task 5's CLI `lib.ts` imports from `@digismith/clickup-client` (this barrel, once published/linked).

- [ ] **Step 1: Write the barrel**

`packages/clickup-client/src/index.ts`:
```ts
export { ClickUpClient } from "./client.ts";
export type { ClickUpClientConfig, RequestOptions } from "./client.ts";
export { RateLimiter } from "./rate-limiter.ts";
export type { Clock, Sleep } from "./rate-limiter.ts";
export { checkCredentials, CredentialsError } from "./credentials.ts";
export type { Credentials } from "./credentials.ts";
export * from "./types.ts";
```

- [ ] **Step 2: Verify the package builds cleanly**

Run: `pnpm --filter @digismith/clickup-client build`
Expected: exits 0, `packages/clickup-client/dist/index.js` and `dist/index.d.ts` exist.

- [ ] **Step 3: Run the full package test suite once more**

Run: `pnpm --filter @digismith/clickup-client test`
Expected: PASS (all tests from Tasks 1–3, 25 total)

- [ ] **Step 4: Commit**

```bash
git add packages/clickup-client/src/index.ts
git commit -m "feat(clickup-client): add public barrel export"
```

---

### Task 5: `dg clickup` CLI — `lib.ts`, `check-credentials`, `list-tasks`

**Files:**
- Modify: `packages/cli/package.json` (add `@digismith/clickup-client` dependency)
- Create: `packages/cli/src/clickup/lib.ts`
- Create: `packages/cli/src/clickup/lib.test.ts`
- Create: `packages/cli/src/clickup/check-credentials.ts`
- Create: `packages/cli/src/clickup/check-credentials.test.ts`
- Create: `packages/cli/src/clickup/list-tasks.ts`
- Create: `packages/cli/src/clickup/list-tasks.test.ts`

**Interfaces:**
- Consumes: `ClickUpClient`, `checkCredentials`, `CredentialsError` from `@digismith/clickup-client` (Task 4's barrel).
- Produces: `createClient(envPath?: string): ClickUpClient` (`packages/cli/src/clickup/lib.ts`) — Task 6's `get-task.ts`/`get-lists.ts` both import this. `checkCredentialsCommand`, `listTasksCommand: CommandModule` — Task 6's `index.ts` composes these alongside its own two commands.

- [ ] **Step 1: Add the workspace dependency**

Edit `packages/cli/package.json`'s `dependencies`:
```json
  "dependencies": {
    "@digismith/clickup-client": "workspace:^",
    "yargs": "^17.7.3",
    "picocolors": "^1.1.1"
  },
```

Run: `pnpm install`
Expected: exits 0, `packages/cli/node_modules/@digismith/clickup-client` resolves to the workspace package (symlink), `pnpm-lock.yaml` updated.

- [ ] **Step 2: Write the failing test for `lib.ts`**

`packages/cli/src/clickup/lib.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClickUpClient } from "@digismith/clickup-client";
import { createClient } from "./lib.ts";

describe("createClient", () => {
  it("builds a ClickUpClient from a valid credentials file", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "dg-clickup-lib-test-"));
    const envPath = join(tmpDir, ".env");
    writeFileSync(envPath, "CLICKUP_API_TOKEN=tok_123\nCLICKUP_TEAM_ID=5738747\n");

    const client = createClient(envPath);

    expect(client).toBeInstanceOf(ClickUpClient);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("propagates CredentialsError when the file is missing", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "dg-clickup-lib-test-missing-"));
    const envPath = join(tmpDir, "missing.env");

    expect(() => createClient(envPath)).toThrow();
    rmSync(tmpDir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm exec vitest run packages/cli/src/clickup/lib.test.ts`
Expected: FAIL — `lib.ts` doesn't exist yet.

- [ ] **Step 4: Write `lib.ts`**

`packages/cli/src/clickup/lib.ts`:
```ts
import { ClickUpClient, checkCredentials } from "@digismith/clickup-client";

export function createClient(envPath?: string): ClickUpClient {
  const creds = checkCredentials(envPath);
  return new ClickUpClient({
    CLICKUP_TEAM_ID: creds.teamId,
    CLICKUP_API_TOKEN: creds.apiToken,
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run packages/cli/src/clickup/lib.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Write the failing test for `check-credentials`**

`packages/cli/src/clickup/check-credentials.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCheckCredentialsCommand } from "./check-credentials.ts";

describe("createCheckCredentialsCommand", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("prints ok when credentials are present and complete", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "dg-clickup-check-creds-"));
    const envPath = join(tmpDir, ".env");
    writeFileSync(envPath, "CLICKUP_API_TOKEN=tok_123\nCLICKUP_TEAM_ID=5738747\n");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const command = createCheckCredentialsCommand(envPath);

    (command.handler as () => void)();

    expect(logSpy).toHaveBeenCalledWith("clickup check-credentials: ok");
    expect(process.exitCode).toBe(0);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("errors and sets exitCode 1 when credentials are missing", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "dg-clickup-check-creds-missing-"));
    const envPath = join(tmpDir, "missing.env");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const command = createCheckCredentialsCommand(envPath);

    (command.handler as () => void)();

    expect(errorSpy).toHaveBeenCalledWith(
      `clickup check-credentials: no credentials file found at ${envPath}`
    );
    expect(process.exitCode).toBe(1);
    rmSync(tmpDir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `pnpm exec vitest run packages/cli/src/clickup/check-credentials.test.ts`
Expected: FAIL — `check-credentials.ts` doesn't exist yet.

- [ ] **Step 8: Write `check-credentials.ts`**

`packages/cli/src/clickup/check-credentials.ts`:
```ts
import type { CommandModule } from "yargs";
import { checkCredentials } from "@digismith/clickup-client";

export function createCheckCredentialsCommand(envPath?: string): CommandModule {
  return {
    command: "check-credentials",
    describe: "verify ClickUp credentials are present and complete in ~/.digismith-depot/.env",
    handler: () => {
      try {
        checkCredentials(envPath);
        console.log("clickup check-credentials: ok");
      } catch (err) {
        console.error(`clickup check-credentials: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const checkCredentialsCommand: CommandModule = createCheckCredentialsCommand();
```

- [ ] **Step 9: Run test to verify it passes**

Run: `pnpm exec vitest run packages/cli/src/clickup/check-credentials.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 10: Write the failing test for `list-tasks`**

`packages/cli/src/clickup/list-tasks.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import type { ClickUpClient, ClickUpTask } from "@digismith/clickup-client";
import { createListTasksCommand } from "./list-tasks.ts";

describe("createListTasksCommand", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("prints the task list as JSON on success", async () => {
    const tasks = [{ id: "1", name: "Breakfast" }] as unknown as ClickUpTask[];
    const getAllListTasks = vi.fn().mockResolvedValue(tasks);
    const fakeClient = { getAllListTasks } as unknown as ClickUpClient;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const command = createListTasksCommand(() => fakeClient);

    await (command.handler as (argv: { list: string }) => Promise<void>)({ list: "901" });

    expect(getAllListTasks).toHaveBeenCalledWith("901");
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify(tasks, null, 2));
    expect(process.exitCode).toBe(0);
  });

  it("errors and sets exitCode 1 when the client throws", async () => {
    const getAllListTasks = vi.fn().mockRejectedValue(new Error("HTTP 401"));
    const fakeClient = { getAllListTasks } as unknown as ClickUpClient;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const command = createListTasksCommand(() => fakeClient);

    await (command.handler as (argv: { list: string }) => Promise<void>)({ list: "901" });

    expect(errorSpy).toHaveBeenCalledWith("clickup list-tasks: HTTP 401");
    expect(process.exitCode).toBe(1);
  });
});
```

- [ ] **Step 11: Run it to verify it fails**

Run: `pnpm exec vitest run packages/cli/src/clickup/list-tasks.test.ts`
Expected: FAIL — `list-tasks.ts` doesn't exist yet.

- [ ] **Step 12: Write `list-tasks.ts`**

`packages/cli/src/clickup/list-tasks.ts`:
```ts
import type { CommandModule } from "yargs";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createClient } from "./lib.ts";

export function createListTasksCommand(
  clientFactory: () => ClickUpClient = createClient
): CommandModule {
  return {
    command: "list-tasks",
    describe: "list every task on a ClickUp list, including closed and subtasks",
    builder: (y) =>
      y.option("list", {
        type: "string",
        requiresArg: true,
        demandOption: true,
        describe: "ClickUp list ID",
      }),
    handler: async (argv) => {
      try {
        const client = clientFactory();
        const tasks = await client.getAllListTasks(argv.list as string);
        console.log(JSON.stringify(tasks, null, 2));
      } catch (err) {
        console.error(`clickup list-tasks: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const listTasksCommand: CommandModule = createListTasksCommand();
```

- [ ] **Step 13: Run test to verify it passes**

Run: `pnpm exec vitest run packages/cli/src/clickup/list-tasks.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 14: Commit**

```bash
git add packages/cli/package.json pnpm-lock.yaml packages/cli/src/clickup/lib.ts packages/cli/src/clickup/lib.test.ts packages/cli/src/clickup/check-credentials.ts packages/cli/src/clickup/check-credentials.test.ts packages/cli/src/clickup/list-tasks.ts packages/cli/src/clickup/list-tasks.test.ts
git commit -m "feat(cli): add dg clickup check-credentials and list-tasks"
```

---

### Task 6: `dg clickup` CLI — `get-task`, `get-lists`, wire into the root dispatcher

**Files:**
- Create: `packages/cli/src/clickup/get-task.ts`
- Create: `packages/cli/src/clickup/get-task.test.ts`
- Create: `packages/cli/src/clickup/get-lists.ts`
- Create: `packages/cli/src/clickup/get-lists.test.ts`
- Create: `packages/cli/src/clickup/index.ts`
- Modify: `packages/cli/src/index.ts:8-9,26-27` (add the `clickup` bucket, mirroring `depotCommand`)

**Interfaces:**
- Consumes: `createClient` (Task 5, `./lib.ts`); `checkCredentialsCommand`, `listTasksCommand` (Task 5).
- Produces: `clickupCommand: CommandModule` (`packages/cli/src/clickup/index.ts`), composed into the root `digismith`/`dg` dispatcher.

- [ ] **Step 1: Write the failing test for `get-task`**

`packages/cli/src/clickup/get-task.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import type { ClickUpClient, ClickUpTask } from "@digismith/clickup-client";
import { createGetTaskCommand } from "./get-task.ts";

describe("createGetTaskCommand", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("prints the task as JSON on success", async () => {
    const task = { id: "abc", name: "Breakfast" } as unknown as ClickUpTask;
    const get = vi.fn().mockResolvedValue(task);
    const fakeClient = { get } as unknown as ClickUpClient;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const command = createGetTaskCommand(() => fakeClient);

    await (command.handler as (argv: { task: string }) => Promise<void>)({ task: "abc" });

    expect(get).toHaveBeenCalledWith("/task/abc");
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify(task, null, 2));
    expect(process.exitCode).toBe(0);
  });

  it("errors and sets exitCode 1 when the client throws", async () => {
    const get = vi.fn().mockRejectedValue(new Error("HTTP 404"));
    const fakeClient = { get } as unknown as ClickUpClient;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const command = createGetTaskCommand(() => fakeClient);

    await (command.handler as (argv: { task: string }) => Promise<void>)({ task: "abc" });

    expect(errorSpy).toHaveBeenCalledWith("clickup get-task: HTTP 404");
    expect(process.exitCode).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run packages/cli/src/clickup/get-task.test.ts`
Expected: FAIL — `get-task.ts` doesn't exist yet.

- [ ] **Step 3: Write `get-task.ts`**

`packages/cli/src/clickup/get-task.ts`:
```ts
import type { CommandModule } from "yargs";
import type { ClickUpClient, ClickUpTask } from "@digismith/clickup-client";
import { createClient } from "./lib.ts";

export function createGetTaskCommand(
  clientFactory: () => ClickUpClient = createClient
): CommandModule {
  return {
    command: "get-task <task>",
    describe: "fetch a single ClickUp task by ID",
    builder: (y) =>
      y.positional("task", {
        type: "string",
        describe: "ClickUp task ID",
        demandOption: true,
      }),
    handler: async (argv) => {
      try {
        const client = clientFactory();
        const task = await client.get<ClickUpTask>(`/task/${argv.task as string}`);
        console.log(JSON.stringify(task, null, 2));
      } catch (err) {
        console.error(`clickup get-task: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const getTaskCommand: CommandModule = createGetTaskCommand();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/cli/src/clickup/get-task.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Write the failing test for `get-lists`**

`packages/cli/src/clickup/get-lists.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import type { ClickUpClient, ClickUpFolderWithLists, ClickUpListSummary } from "@digismith/clickup-client";
import { createGetListsCommand } from "./get-lists.ts";

describe("createGetListsCommand", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("prints combined folders and folderless lists as JSON on success", async () => {
    const folders = [{ id: "f1", name: "Weeks", lists: [] }] as unknown as ClickUpFolderWithLists[];
    const lists = [{ id: "l9", name: "Workflows" }] as unknown as ClickUpListSummary[];
    const getSpaceFolders = vi.fn().mockResolvedValue(folders);
    const getFolderlessLists = vi.fn().mockResolvedValue(lists);
    const fakeClient = { getSpaceFolders, getFolderlessLists } as unknown as ClickUpClient;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const command = createGetListsCommand(() => fakeClient);

    await (command.handler as (argv: { space: string }) => Promise<void>)({ space: "90165960730" });

    expect(getSpaceFolders).toHaveBeenCalledWith("90165960730");
    expect(getFolderlessLists).toHaveBeenCalledWith("90165960730");
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify({ folders, lists }, null, 2));
    expect(process.exitCode).toBe(0);
  });

  it("errors and sets exitCode 1 when the client throws", async () => {
    const getSpaceFolders = vi.fn().mockRejectedValue(new Error("HTTP 403"));
    const getFolderlessLists = vi.fn().mockResolvedValue([]);
    const fakeClient = { getSpaceFolders, getFolderlessLists } as unknown as ClickUpClient;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const command = createGetListsCommand(() => fakeClient);

    await (command.handler as (argv: { space: string }) => Promise<void>)({ space: "90165960730" });

    expect(errorSpy).toHaveBeenCalledWith("clickup get-lists: HTTP 403");
    expect(process.exitCode).toBe(1);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm exec vitest run packages/cli/src/clickup/get-lists.test.ts`
Expected: FAIL — `get-lists.ts` doesn't exist yet.

- [ ] **Step 7: Write `get-lists.ts`**

`packages/cli/src/clickup/get-lists.ts`:
```ts
import type { CommandModule } from "yargs";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createClient } from "./lib.ts";

export function createGetListsCommand(
  clientFactory: () => ClickUpClient = createClient
): CommandModule {
  return {
    command: "get-lists",
    describe: "list a ClickUp space's folders (with their lists) and folderless lists",
    builder: (y) =>
      y.option("space", {
        type: "string",
        requiresArg: true,
        demandOption: true,
        describe: "ClickUp space ID",
      }),
    handler: async (argv) => {
      try {
        const client = clientFactory();
        const spaceId = argv.space as string;
        const [folders, lists] = await Promise.all([
          client.getSpaceFolders(spaceId),
          client.getFolderlessLists(spaceId),
        ]);
        console.log(JSON.stringify({ folders, lists }, null, 2));
      } catch (err) {
        console.error(`clickup get-lists: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const getListsCommand: CommandModule = createGetListsCommand();
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm exec vitest run packages/cli/src/clickup/get-lists.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 9: Wire the bucket together**

`packages/cli/src/clickup/index.ts`:
```ts
import type { CommandModule } from "yargs";
import { checkCredentialsCommand } from "./check-credentials.ts";
import { listTasksCommand } from "./list-tasks.ts";
import { getTaskCommand } from "./get-task.ts";
import { getListsCommand } from "./get-lists.ts";

const clickupCommand: CommandModule = {
  command: "clickup",
  describe: "read ClickUp tasks, lists, and folders",
  builder: (y) =>
    y
      .command(checkCredentialsCommand)
      .command(listTasksCommand)
      .command(getTaskCommand)
      .command(getListsCommand)
      .demandCommand(1, ""),
  handler: () => {},
};

export default clickupCommand;
```

Edit `packages/cli/src/index.ts` — add the import alongside the two existing bucket imports, and add `.command(clickupCommand)` alongside `.command(depotCommand)`:
```ts
import vpsCommand from "./vps/index.ts";
import depotCommand from "./depot/index.ts";
import clickupCommand from "./clickup/index.ts";
```
```ts
    .command(vpsCommand)
    .command(depotCommand)
    .command(clickupCommand)
```

- [ ] **Step 10: Manually verify the wired CLI**

Run: `pnpm --filter @digismith/cli build`
Run: `node packages/cli/dist/index.js clickup --help`
Expected: lists `check-credentials`, `list-tasks`, `get-task`, `get-lists` as subcommands under `clickup`.

- [ ] **Step 11: Run the full test suite**

Run: `pnpm test` (repo root)
Expected: PASS — every test across `packages/clickup-client` and `packages/cli`, including the 4 new files in this task and Task 5's 3 files.

- [ ] **Step 12: Commit**

```bash
git add packages/cli/src/clickup/get-task.ts packages/cli/src/clickup/get-task.test.ts packages/cli/src/clickup/get-lists.ts packages/cli/src/clickup/get-lists.test.ts packages/cli/src/clickup/index.ts packages/cli/src/index.ts
git commit -m "feat(cli): add dg clickup get-task, get-lists, and wire the bucket in"
```

---

## Out of scope (see design doc + backlog)

- CLI wrappers for `createTask`/`updateTask`/`deleteTask`/`setCustomField` — the underlying `ClickUpClient` methods exist and are tested (Task 3), just not exposed as `dg clickup` subcommands yet.
- Publishing `@digismith/clickup-client` to npm for real (`pnpm publish`) — this plan gets the package build-ready; the actual first publish (matching how `@digismith/cli`'s `0.1.0-beta` first publish was its own manual step, per map item V.4) is a follow-up action, not a task here. When that follow-up happens: publish `@digismith/clickup-client` before publishing any `@digismith/cli` version that depends on it, and always use `pnpm publish` (never plain `npm publish`) for both packages — only `pnpm publish` rewrites the `workspace:^` specifier to a real version range.
- Any consumer wiring (DigiSmith's own map-flow, ticket write-back, Soveron's cutover) — see `backlog/clickup-backlog-map-flow-wiring.md`, `backlog/clickup-ticket-writeback-i1-analog.md`, `backlog/clickup-soveron-cutover.md`.
