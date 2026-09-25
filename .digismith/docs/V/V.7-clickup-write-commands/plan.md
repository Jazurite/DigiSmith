# ClickUp Connector — Write Commands (V.7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `@digismith/clickup-client` and `dg clickup` real write capability — create a task, update a task, upload a file attachment — closing the gap V.6 deliberately left open (its CLI was read-only day one).

**Architecture:** Extends the existing `packages/clickup-client` package with one new client method (`uploadAttachment`) and one new write-body field (`priority`); `createTask`/`updateTask` already exist on `ClickUpClient` from V.6 and only need CLI wrapping. Three new leaf commands join the existing four in `packages/cli/src/clickup/`, following the exact same bucket-of-leaves shape. No new package, no new skill, no orchestration/sync script — the actual per-letter map sync stays a manual, ad hoc, agent-driven task built on top of these primitives, not code produced by this plan.

**Tech Stack:** TypeScript (NodeNext ESM), axios, Vitest, yargs. Node >=24. Same stack as V.6, no additions.

## Global Constraints

- No new skill, script, or lifecycle hook in this plan — only library and CLI code.
- Every new CLI command follows the exact shape already established by `get-lists.ts`/`list-tasks.ts`/`get-task.ts`: a `create<X>Command(clientFactory: () => ClickUpClient = createClient): CommandModule` factory (default-parameter injection point for tests), a try/catch handler that `console.log(JSON.stringify(result, null, 2))` on success with `process.exitCode = 0`, and `console.error(\`clickup <subcommand>: ${(err as Error).message}\`)` with `process.exitCode = 1` on failure.
- `priority` is ClickUp's 1–4 scale (1=urgent, 2=high, 3=normal, 4=low), passed through as a raw number — no validation or clamping in this build.
- `--start-date`/`--due-date` accept an ISO date string (e.g. `2026-08-28`), converted to epoch ms via `new Date(value).getTime()`. Yargs' default camelCase expansion means the kebab-case flag `--start-date` is read in code as `argv.startDate` — no manual bracket-key access.
- Test files are `*.test.ts` (Vitest), mirroring the exact mocking pattern each sibling file already uses (`vi.mock("axios")` + a shared `request` stub for `client.test.ts`; a fake object cast to `ClickUpClient` injected via `clientFactory` for CLI command tests).
- No AI attribution in commit messages (`scripts/git-hooks/commit-msg` enforces this).

---

### Task 1: Client package — `priority` field, `uploadAttachment()`, `ClickUpAttachment` type

**Files:**
- Modify: `packages/clickup-client/src/types.ts`
- Modify: `packages/clickup-client/src/client.ts`
- Modify: `packages/clickup-client/src/client.test.ts`

**Interfaces:**
- Consumes: nothing new — extends V.6's existing `ClickUpClient`/`ClickUpTaskWriteBody`.
- Produces: `ClickUpClient.uploadAttachment(taskId: string, filePath: string): Promise<ClickUpAttachment>`; `ClickUpAttachment` type; `ClickUpTaskWriteBody.priority?: number`. Task 2's `buildTaskWriteBody` consumes the `priority` field; Task 4's `upload-attachment` CLI command consumes `uploadAttachment`.

- [ ] **Step 1: Write the failing tests**

Add these imports to the top of `packages/clickup-client/src/client.test.ts` (alongside the existing three):
```ts
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
```

Append this new `describe` block at the end of `packages/clickup-client/src/client.test.ts`:
```ts
describe("ClickUpClient uploadAttachment", () => {
  beforeEach(() => {
    request.mockReset();
    vi.mocked(axios.create).mockReset();
  });

  it("POSTs multipart form data to the task attachment endpoint", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({
      data: {
        id: "att1",
        version: "1",
        date: 1790000000000,
        title: "report.pdf",
        extension: "pdf",
        thumbnail_small: null,
        thumbnail_large: null,
        url: "https://t.clickup.com/att1",
      },
    });

    const tmpDir = mkdtempSync(join(tmpdir(), "clickup-client-upload-"));
    const filePath = join(tmpDir, "report.pdf");
    writeFileSync(filePath, Buffer.from([1, 2, 3]));

    const result = await client.uploadAttachment("abc", filePath);

    expect(request).toHaveBeenCalledWith({
      method: "POST",
      url: "/task/abc/attachment",
      params: undefined,
      data: expect.any(FormData),
    });
    const sentForm = request.mock.calls[0][0].data as FormData;
    expect(sentForm.get("attachment")).toBeInstanceOf(Blob);
    expect(result.id).toBe("att1");
    expect(result.title).toBe("report.pdf");

    rmSync(tmpDir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run packages/clickup-client/src/client.test.ts`
Expected: FAIL — `client.uploadAttachment is not a function`.

- [ ] **Step 3: Add the `priority` field and `ClickUpAttachment` type**

In `packages/clickup-client/src/types.ts`, change `ClickUpTaskWriteBody` to:
```ts
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
  priority?: number;
}
```

Add this new interface anywhere below it in the same file:
```ts
/** Response shape from POST /task/{task_id}/attachment. */
export interface ClickUpAttachment {
  id: string;
  version: string;
  date: number;
  title: string;
  extension: string;
  thumbnail_small: string | null;
  thumbnail_large: string | null;
  url: string;
}
```

- [ ] **Step 4: Add `uploadAttachment()` to `client.ts`**

In `packages/clickup-client/src/client.ts`, add these two imports at the top, alongside the existing `axios` import:
```ts
import { readFileSync } from "node:fs";
import { basename } from "node:path";
```

Change the existing `import type { ... } from "./types.ts"` block to:
```ts
import type {
  ClickUpAttachment,
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
```

Add this method to the `ClickUpClient` class, right after `setCustomField`:
```ts
  /** Multipart upload — ClickUp's attachment endpoint requires this content type. */
  async uploadAttachment(taskId: string, filePath: string): Promise<ClickUpAttachment> {
    const fileBytes = readFileSync(filePath);
    const form = new FormData();
    form.append("attachment", new Blob([fileBytes]), basename(filePath));
    return this.post<ClickUpAttachment>(`/task/${taskId}/attachment`, { data: form });
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run packages/clickup-client/src/client.test.ts`
Expected: PASS (17 tests — 16 existing + 1 new)

- [ ] **Step 6: Commit**

```bash
git add packages/clickup-client/src/types.ts packages/clickup-client/src/client.ts packages/clickup-client/src/client.test.ts
git commit -m "feat(clickup-client): add uploadAttachment and task priority"
```

---

### Task 2: `dg clickup create-task`

**Files:**
- Modify: `packages/cli/src/clickup/lib.ts`
- Modify: `packages/cli/src/clickup/lib.test.ts`
- Create: `packages/cli/src/clickup/create-task.ts`
- Create: `packages/cli/src/clickup/create-task.test.ts`
- Modify: `packages/cli/src/clickup/index.ts`

**Interfaces:**
- Consumes: `ClickUpClient.createTask` (existing, V.6), `ClickUpTaskWriteBody` (Task 1's `priority` addition).
- Produces: `buildTaskWriteBody(argv: TaskFieldArgv): ClickUpTaskWriteBody` and `TaskFieldArgv` interface (`packages/cli/src/clickup/lib.ts`) — Task 3's `update-task.ts` imports both unchanged. `createTaskCommand: CommandModule` (`packages/cli/src/clickup/create-task.ts`).

- [ ] **Step 1: Write the failing tests for `buildTaskWriteBody`**

Add this import to the top of `packages/cli/src/clickup/lib.test.ts`, alongside the existing ones:
```ts
import type { ClickUpTaskWriteBody } from "@digismith/clickup-client";
```

Change the `import { createClient } from "./lib.ts";` line to:
```ts
import { createClient, buildTaskWriteBody } from "./lib.ts";
```

Append this new `describe` block at the end of `packages/cli/src/clickup/lib.test.ts`:
```ts
describe("buildTaskWriteBody", () => {
  it("maps every provided field, converting dates to epoch ms", () => {
    const body = buildTaskWriteBody({
      name: "V.1 — OpenCode server management",
      description: "Extends Depot to also manage a second machine-wide resource.",
      status: "done",
      startDate: "2026-08-20",
      dueDate: "2026-08-28",
      priority: 3,
    });

    const expected: ClickUpTaskWriteBody = {
      name: "V.1 — OpenCode server management",
      description: "Extends Depot to also manage a second machine-wide resource.",
      status: "done",
      start_date: new Date("2026-08-20").getTime(),
      due_date: new Date("2026-08-28").getTime(),
      priority: 3,
    };
    expect(body).toEqual(expected);
  });

  it("omits fields that weren't provided", () => {
    const body = buildTaskWriteBody({ name: "Just a name" });

    expect(body).toEqual({ name: "Just a name" });
  });

  it("returns an empty body when nothing was provided", () => {
    expect(buildTaskWriteBody({})).toEqual({});
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run packages/cli/src/clickup/lib.test.ts`
Expected: FAIL — `buildTaskWriteBody` is not exported.

- [ ] **Step 3: Write `buildTaskWriteBody` in `lib.ts`**

Add this import to the top of `packages/cli/src/clickup/lib.ts`:
```ts
import type { ClickUpTaskWriteBody } from "@digismith/clickup-client";
```

Append to `packages/cli/src/clickup/lib.ts`:
```ts
export interface TaskFieldArgv {
  name?: string;
  description?: string;
  status?: string;
  startDate?: string;
  dueDate?: string;
  priority?: number;
}

export function buildTaskWriteBody(argv: TaskFieldArgv): ClickUpTaskWriteBody {
  const body: ClickUpTaskWriteBody = {};
  if (argv.name !== undefined) body.name = argv.name;
  if (argv.description !== undefined) body.description = argv.description;
  if (argv.status !== undefined) body.status = argv.status;
  if (argv.startDate !== undefined) body.start_date = new Date(argv.startDate).getTime();
  if (argv.dueDate !== undefined) body.due_date = new Date(argv.dueDate).getTime();
  if (argv.priority !== undefined) body.priority = argv.priority;
  return body;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/cli/src/clickup/lib.test.ts`
Expected: PASS (5 tests — 2 existing + 3 new)

- [ ] **Step 5: Write the failing test for `create-task`**

`packages/cli/src/clickup/create-task.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import type { ClickUpClient, ClickUpTask } from "@digismith/clickup-client";
import { createCreateTaskCommand } from "./create-task.ts";

describe("createCreateTaskCommand", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("creates a task on the given list and prints it as JSON", async () => {
    const task = { id: "abc", name: "V.1" } as unknown as ClickUpTask;
    const createTask = vi.fn().mockResolvedValue(task);
    const fakeClient = { createTask } as unknown as ClickUpClient;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const command = createCreateTaskCommand(() => fakeClient);

    await (
      command.handler as (argv: {
        list: string;
        name: string;
        status?: string;
      }) => Promise<void>
    )({ list: "901", name: "V.1", status: "done" });

    expect(createTask).toHaveBeenCalledWith("901", { name: "V.1", status: "done" });
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify(task, null, 2));
    expect(process.exitCode).toBe(0);
  });

  it("errors and sets exitCode 1 when the client throws", async () => {
    const createTask = vi.fn().mockRejectedValue(new Error("HTTP 400"));
    const fakeClient = { createTask } as unknown as ClickUpClient;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const command = createCreateTaskCommand(() => fakeClient);

    await (
      command.handler as (argv: { list: string; name: string }) => Promise<void>
    )({ list: "901", name: "V.1" });

    expect(errorSpy).toHaveBeenCalledWith("clickup create-task: HTTP 400");
    expect(process.exitCode).toBe(1);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm exec vitest run packages/cli/src/clickup/create-task.test.ts`
Expected: FAIL — `create-task.ts` doesn't exist yet.

- [ ] **Step 7: Write `create-task.ts`**

`packages/cli/src/clickup/create-task.ts`:
```ts
import type { CommandModule } from "yargs";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createClient, buildTaskWriteBody } from "./lib.ts";

export function createCreateTaskCommand(
  clientFactory: () => ClickUpClient = createClient
): CommandModule {
  return {
    command: "create-task",
    describe: "create a new ClickUp task on a list",
    builder: (y) =>
      y
        .option("list", {
          type: "string",
          requiresArg: true,
          demandOption: true,
          describe: "ClickUp list ID",
        })
        .option("name", {
          type: "string",
          requiresArg: true,
          demandOption: true,
          describe: "task name",
        })
        .option("description", { type: "string", requiresArg: true, describe: "task description" })
        .option("status", { type: "string", requiresArg: true, describe: "status (must exist on the list)" })
        .option("start-date", { type: "string", requiresArg: true, describe: "start date, e.g. 2026-08-28" })
        .option("due-date", { type: "string", requiresArg: true, describe: "due date, e.g. 2026-08-28" })
        .option("priority", {
          type: "number",
          requiresArg: true,
          describe: "1=urgent, 2=high, 3=normal, 4=low",
        }),
    handler: async (argv) => {
      try {
        const client = clientFactory();
        const body = buildTaskWriteBody(argv as unknown as Parameters<typeof buildTaskWriteBody>[0]);
        const task = await client.createTask(argv.list as string, body);
        console.log(JSON.stringify(task, null, 2));
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup create-task: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const createTaskCommand: CommandModule = createCreateTaskCommand();
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm exec vitest run packages/cli/src/clickup/create-task.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 9: Register the command in `index.ts`**

In `packages/cli/src/clickup/index.ts`, add the import:
```ts
import { createTaskCommand } from "./create-task.ts";
```

And add `.command(createTaskCommand)` to the builder chain, right after `.command(getListsCommand)`.

- [ ] **Step 10: Commit**

```bash
git add packages/cli/src/clickup/lib.ts packages/cli/src/clickup/lib.test.ts packages/cli/src/clickup/create-task.ts packages/cli/src/clickup/create-task.test.ts packages/cli/src/clickup/index.ts
git commit -m "feat(cli): add dg clickup create-task"
```

---

### Task 3: `dg clickup update-task`

**Files:**
- Create: `packages/cli/src/clickup/update-task.ts`
- Create: `packages/cli/src/clickup/update-task.test.ts`
- Modify: `packages/cli/src/clickup/index.ts`

**Interfaces:**
- Consumes: `buildTaskWriteBody`, `TaskFieldArgv` (Task 2, `./lib.ts`), `ClickUpClient.updateTask` (existing, V.6).
- Produces: `updateTaskCommand: CommandModule`. Nothing downstream in this plan consumes it further.

- [ ] **Step 1: Write the failing test**

`packages/cli/src/clickup/update-task.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import type { ClickUpClient, ClickUpTask } from "@digismith/clickup-client";
import { createUpdateTaskCommand } from "./update-task.ts";

describe("createUpdateTaskCommand", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("updates the given task and prints the result as JSON", async () => {
    const task = { id: "abc", status: { status: "done" } } as unknown as ClickUpTask;
    const updateTask = vi.fn().mockResolvedValue(task);
    const fakeClient = { updateTask } as unknown as ClickUpClient;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const command = createUpdateTaskCommand(() => fakeClient);

    await (
      command.handler as (argv: { task: string; status?: string }) => Promise<void>
    )({ task: "abc", status: "done" });

    expect(updateTask).toHaveBeenCalledWith("abc", { status: "done" });
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify(task, null, 2));
    expect(process.exitCode).toBe(0);
  });

  it("errors and sets exitCode 1 when the client throws", async () => {
    const updateTask = vi.fn().mockRejectedValue(new Error("HTTP 404"));
    const fakeClient = { updateTask } as unknown as ClickUpClient;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const command = createUpdateTaskCommand(() => fakeClient);

    await (command.handler as (argv: { task: string }) => Promise<void>)({ task: "abc" });

    expect(errorSpy).toHaveBeenCalledWith("clickup update-task: HTTP 404");
    expect(process.exitCode).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run packages/cli/src/clickup/update-task.test.ts`
Expected: FAIL — `update-task.ts` doesn't exist yet.

- [ ] **Step 3: Write `update-task.ts`**

`packages/cli/src/clickup/update-task.ts`:
```ts
import type { CommandModule } from "yargs";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createClient, buildTaskWriteBody } from "./lib.ts";

export function createUpdateTaskCommand(
  clientFactory: () => ClickUpClient = createClient
): CommandModule {
  return {
    command: "update-task",
    describe: "update an existing ClickUp task",
    builder: (y) =>
      y
        .option("task", {
          type: "string",
          requiresArg: true,
          demandOption: true,
          describe: "ClickUp task ID",
        })
        .option("name", { type: "string", requiresArg: true, describe: "task name" })
        .option("description", { type: "string", requiresArg: true, describe: "task description" })
        .option("status", { type: "string", requiresArg: true, describe: "status (must exist on the list)" })
        .option("start-date", { type: "string", requiresArg: true, describe: "start date, e.g. 2026-08-28" })
        .option("due-date", { type: "string", requiresArg: true, describe: "due date, e.g. 2026-08-28" })
        .option("priority", {
          type: "number",
          requiresArg: true,
          describe: "1=urgent, 2=high, 3=normal, 4=low",
        }),
    handler: async (argv) => {
      try {
        const client = clientFactory();
        const body = buildTaskWriteBody(argv as unknown as Parameters<typeof buildTaskWriteBody>[0]);
        const task = await client.updateTask(argv.task as string, body);
        console.log(JSON.stringify(task, null, 2));
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup update-task: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const updateTaskCommand: CommandModule = createUpdateTaskCommand();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/cli/src/clickup/update-task.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Register the command in `index.ts`**

In `packages/cli/src/clickup/index.ts`, add the import:
```ts
import { updateTaskCommand } from "./update-task.ts";
```

And add `.command(updateTaskCommand)` right after `.command(createTaskCommand)`.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/clickup/update-task.ts packages/cli/src/clickup/update-task.test.ts packages/cli/src/clickup/index.ts
git commit -m "feat(cli): add dg clickup update-task"
```

---

### Task 4: `dg clickup upload-attachment`

**Files:**
- Create: `packages/cli/src/clickup/upload-attachment.ts`
- Create: `packages/cli/src/clickup/upload-attachment.test.ts`
- Modify: `packages/cli/src/clickup/index.ts`

**Interfaces:**
- Consumes: `ClickUpClient.uploadAttachment` (Task 1).
- Produces: `uploadAttachmentCommand: CommandModule`. Terminal task — nothing downstream in this plan.

- [ ] **Step 1: Write the failing test**

`packages/cli/src/clickup/upload-attachment.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import type { ClickUpClient, ClickUpAttachment } from "@digismith/clickup-client";
import { createUploadAttachmentCommand } from "./upload-attachment.ts";

describe("createUploadAttachmentCommand", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("uploads the given file to the given task and prints the result as JSON", async () => {
    const attachment = { id: "att1", title: "report.pdf" } as unknown as ClickUpAttachment;
    const uploadAttachment = vi.fn().mockResolvedValue(attachment);
    const fakeClient = { uploadAttachment } as unknown as ClickUpClient;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const command = createUploadAttachmentCommand(() => fakeClient);

    await (
      command.handler as (argv: { task: string; file: string }) => Promise<void>
    )({ task: "abc", file: "/tmp/report.pdf" });

    expect(uploadAttachment).toHaveBeenCalledWith("abc", "/tmp/report.pdf");
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify(attachment, null, 2));
    expect(process.exitCode).toBe(0);
  });

  it("errors and sets exitCode 1 when the client throws", async () => {
    const uploadAttachment = vi.fn().mockRejectedValue(new Error("ENOENT: no such file"));
    const fakeClient = { uploadAttachment } as unknown as ClickUpClient;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const command = createUploadAttachmentCommand(() => fakeClient);

    await (
      command.handler as (argv: { task: string; file: string }) => Promise<void>
    )({ task: "abc", file: "/tmp/missing.pdf" });

    expect(errorSpy).toHaveBeenCalledWith("clickup upload-attachment: ENOENT: no such file");
    expect(process.exitCode).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run packages/cli/src/clickup/upload-attachment.test.ts`
Expected: FAIL — `upload-attachment.ts` doesn't exist yet.

- [ ] **Step 3: Write `upload-attachment.ts`**

`packages/cli/src/clickup/upload-attachment.ts`:
```ts
import type { CommandModule } from "yargs";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createClient } from "./lib.ts";

export function createUploadAttachmentCommand(
  clientFactory: () => ClickUpClient = createClient
): CommandModule {
  return {
    command: "upload-attachment",
    describe: "upload a local file as an attachment on a ClickUp task",
    builder: (y) =>
      y
        .option("task", {
          type: "string",
          requiresArg: true,
          demandOption: true,
          describe: "ClickUp task ID",
        })
        .option("file", {
          type: "string",
          requiresArg: true,
          demandOption: true,
          describe: "local file path to upload",
        }),
    handler: async (argv) => {
      try {
        const client = clientFactory();
        const attachment = await client.uploadAttachment(argv.task as string, argv.file as string);
        console.log(JSON.stringify(attachment, null, 2));
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup upload-attachment: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const uploadAttachmentCommand: CommandModule = createUploadAttachmentCommand();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/cli/src/clickup/upload-attachment.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Register the command in `index.ts`**

In `packages/cli/src/clickup/index.ts`, add the import:
```ts
import { uploadAttachmentCommand } from "./upload-attachment.ts";
```

And add `.command(uploadAttachmentCommand)` right after `.command(updateTaskCommand)`.

- [ ] **Step 6: Run the full `clickup-client` + `cli` suites once more**

Run: `pnpm --filter @digismith/clickup-client test && pnpm --filter @digismith/cli test`
Expected: PASS, no regressions in any of V.6's or this plan's tests.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/clickup/upload-attachment.ts packages/cli/src/clickup/upload-attachment.test.ts packages/cli/src/clickup/index.ts
git commit -m "feat(cli): add dg clickup upload-attachment"
```
