# dg clickup move-task Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `dg clickup move-task`, which changes a ClickUp task's home List through ClickUp's public API v3.

**Architecture:** `ClickUpClient.moveTask` sends `PUT` to an absolute v3 URL, so the existing axios instance (v2 base URL, shared `Authorization` header, shared rate limiter) is reused with no second instance. The CLI command follows the `create-list` pattern: a `createMoveTaskCommand(clientFactory)` factory, JSON on stdout, `clickup move-task: <message>` on stderr with exit code 1.

**Tech Stack:** TypeScript (ESM, `.ts` import extensions, Node >=24), axios, yargs, vitest. pnpm workspace with `packages/clickup-client` and `packages/cli`.

Design: `.digismith/docs/D/D.3/add-dg-clickup-move-task-command/design.html`.

## Global Constraints

- The v3 endpoint is `PUT https://api.clickup.com/api/v3/workspaces/{workspace_id}/tasks/{task_id}/home_list/{list_id}`. The workspace id is the existing `CLICKUP_TEAM_ID` (`this.teamId`).
- Body keys are snake_case, exactly as ClickUp names them: `status_mappings` (`{source_status, destination_status}[]`, by status id), `move_custom_fields`, `custom_fields_to_move`.
- The command does NOT expose `--custom-field`. `custom_fields_to_move` stays only in the client options type.
- The command never sends `move_custom_fields` when `--move-custom-fields` is absent.
- Edits stay additive, because a second worker builds `dg clickup update-list` (DGS-137) in parallel. Place `moveTask` right after `deleteTask` in `client.ts`, its types right after `ClickUpTaskWriteBody` in `types.ts`, its client tests right after the `updateTask()` test in `client.test.ts`, and register the command right after `updateTaskCommand` in `index.ts`.
- All tests use mocks. No test and no step in this plan calls real ClickUp. Do not read or print the ClickUp token.
- Commits are title-only conventional commits. No `Co-Authored-By` and no AI attribution lines.
- Run every command from the worktree root `/root/Workspace/Jazurite/DigiSmith/.worktrees/add-dg-clickup-move-task-command`.

---

### Task 1: Client `moveTask` and its types

**Files:**
- Modify: `packages/clickup-client/src/types.ts` (insert after `ClickUpTaskWriteBody`, which ends at line 238)
- Modify: `packages/clickup-client/src/client.ts` (import list at lines 4-19, `BASE_URL` at line 21, insert method after `deleteTask`)
- Test: `packages/clickup-client/src/client.test.ts` (insert after the `updateTask() PUTs the body to the task endpoint` test)

**Interfaces:**
- Produces (types, exported from `@digismith/clickup-client` through the existing `export * from "./types.ts"`):
  - `ClickUpMoveTaskStatusMapping { source_status: string; destination_status: string }`
  - `ClickUpMoveTaskOptions { status_mappings?: ClickUpMoveTaskStatusMapping[]; move_custom_fields?: boolean; custom_fields_to_move?: string[] }`
  - `ClickUpMoveTaskResponse { data: { task_id: string; new_list_id: string } }`
- Produces (method): `ClickUpClient#moveTask(taskId: string, listId: string, options?: ClickUpMoveTaskOptions): Promise<ClickUpMoveTaskResponse>`

- [ ] **Step 1: Write the failing client tests**

In `packages/clickup-client/src/client.test.ts`, insert these two tests inside `describe("ClickUpClient domain write/read methods", ...)`, directly after the `updateTask() PUTs the body to the task endpoint` test (the one that ends with `data: { status: "Done" },` and `});` then `});`):

```ts
  it("moveTask() PUTs the options to the absolute v3 home_list URL", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({
      data: { data: { task_id: "14zcebru2p7", new_list_id: "1301150000002300" } },
    });

    const result = await client.moveTask("14zcebru2p7", "1301150000002300", {
      move_custom_fields: true,
      status_mappings: [{ source_status: "s1", destination_status: "s2" }],
    });

    expect(request).toHaveBeenCalledWith({
      method: "PUT",
      url: "https://api.clickup.com/api/v3/workspaces/5738747/tasks/14zcebru2p7/home_list/1301150000002300",
      params: undefined,
      data: {
        move_custom_fields: true,
        status_mappings: [{ source_status: "s1", destination_status: "s2" }],
      },
    });
    expect(result).toEqual({
      data: { task_id: "14zcebru2p7", new_list_id: "1301150000002300" },
    });
  });

  it("moveTask() sends an empty body when no options are given", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: { data: { task_id: "t1", new_list_id: "l1" } } });

    await client.moveTask("t1", "l1");

    expect(request).toHaveBeenCalledWith({
      method: "PUT",
      url: "https://api.clickup.com/api/v3/workspaces/5738747/tasks/t1/home_list/l1",
      params: undefined,
      data: {},
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/clickup-client/src/client.test.ts -t moveTask`
Expected: FAIL with `client.moveTask is not a function`.

- [ ] **Step 3: Add the types**

In `packages/clickup-client/src/types.ts`, insert directly after the closing `}` of `ClickUpTaskWriteBody` (after line 238) and before the `/** Response shape from POST /task/{task_id}/attachment. */` comment:

```ts

/** One entry of `status_mappings` for the v3 move-task call. Both values are status ids. */
export interface ClickUpMoveTaskStatusMapping {
  source_status: string;
  destination_status: string;
}

/** Optional body for PUT /api/v3/workspaces/{ws}/tasks/{task}/home_list/{list}. */
export interface ClickUpMoveTaskOptions {
  status_mappings?: ClickUpMoveTaskStatusMapping[];
  move_custom_fields?: boolean;
  custom_fields_to_move?: string[];
}

/** Response shape from the v3 move-task call. */
export interface ClickUpMoveTaskResponse {
  data: { task_id: string; new_list_id: string };
}
```

- [ ] **Step 4: Add the method**

In `packages/clickup-client/src/client.ts`:

1. In the `import type { ... } from "./types.ts";` list, add these three names in alphabetical position (after `ClickUpListsResponse`, before `ClickUpTask`):

```ts
  ClickUpMoveTaskOptions,
  ClickUpMoveTaskResponse,
```

2. Directly after the line `const BASE_URL = "https://api.clickup.com/api/v2";`, add:

```ts
const BASE_URL_V3 = "https://api.clickup.com/api/v3";
```

3. Directly after the `deleteTask` method (the one ending with `await this.delete(`/task/${taskId}`);` and `}`), add:

```ts

  /** Changes the task's home List. v3 URL is absolute, so it overrides axios's v2 baseURL. */
  moveTask(
    taskId: string,
    listId: string,
    options: ClickUpMoveTaskOptions = {},
  ): Promise<ClickUpMoveTaskResponse> {
    return this.put<ClickUpMoveTaskResponse>(
      `${BASE_URL_V3}/workspaces/${this.teamId}/tasks/${taskId}/home_list/${listId}`,
      { data: options },
    );
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run packages/clickup-client`
Expected: PASS, all client tests green (the two new `moveTask()` tests included).

- [ ] **Step 6: Typecheck the client package**

Run: `cd packages/clickup-client && npx tsc -p tsconfig.build.json --noEmit; cd ../..`
Expected: no output (0 errors).

- [ ] **Step 7: Commit**

```bash
git add packages/clickup-client/src/types.ts packages/clickup-client/src/client.ts packages/clickup-client/src/client.test.ts
git commit -m "feat(clickup-client): add moveTask on the v3 home_list endpoint"
```

---

### Task 2: `dg clickup move-task` command

**Files:**
- Create: `packages/cli/src/clickup/move-task.ts`
- Create: `packages/cli/src/clickup/move-task.test.ts`
- Modify: `packages/cli/src/clickup/index.ts` (import after the `updateTaskCommand` import, registration after `.command(updateTaskCommand)`)
- Modify: `packages/cli/README.md` (command list, after the `update-task` line)

**Interfaces:**
- Consumes: `ClickUpClient#moveTask(taskId, listId, options?)` and the types `ClickUpMoveTaskOptions`, `ClickUpMoveTaskStatusMapping` from `@digismith/clickup-client` (Task 1). `createClient` from `./lib.ts`.
- Produces: `createMoveTaskCommand(clientFactory?: () => ClickUpClient): CommandModule` and `moveTaskCommand: CommandModule`.
- argv shape the handler reads: `{ task: string; list: string; statusMap?: string[]; moveCustomFields?: boolean }`. yargs maps `--status-map` to `statusMap` and `--move-custom-fields` to `moveCustomFields`.

- [ ] **Step 1: Write the failing command tests**

Create `packages/cli/src/clickup/move-task.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createMoveTaskCommand } from "./move-task.ts";

type Argv = { task: string; list: string; statusMap?: string[]; moveCustomFields?: boolean };

function run(command: ReturnType<typeof createMoveTaskCommand>, argv: Argv): Promise<void> {
  return (command.handler as (argv: Argv) => Promise<void>)(argv);
}

describe("createMoveTaskCommand", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("moves the task and prints the response as JSON", async () => {
    const response = { data: { task_id: "t1", new_list_id: "l1" } };
    const moveTask = vi.fn().mockResolvedValue(response);
    const fakeClient = { moveTask } as unknown as ClickUpClient;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const command = createMoveTaskCommand(() => fakeClient);

    await run(command, { task: "t1", list: "l1" });

    expect(moveTask).toHaveBeenCalledWith("t1", "l1", {});
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify(response, null, 2));
    expect(process.exitCode).toBe(0);
  });

  it("sends move_custom_fields: true only when --move-custom-fields is set", async () => {
    const moveTask = vi.fn().mockResolvedValue({});
    const fakeClient = { moveTask } as unknown as ClickUpClient;
    vi.spyOn(console, "log").mockImplementation(() => {});
    const command = createMoveTaskCommand(() => fakeClient);

    await run(command, { task: "t1", list: "l1", moveCustomFields: true });
    expect(moveTask).toHaveBeenLastCalledWith("t1", "l1", { move_custom_fields: true });

    await run(command, { task: "t1", list: "l1", moveCustomFields: false });
    expect(moveTask).toHaveBeenLastCalledWith("t1", "l1", {});
  });

  it("parses repeated --status-map values into status_mappings", async () => {
    const moveTask = vi.fn().mockResolvedValue({});
    const fakeClient = { moveTask } as unknown as ClickUpClient;
    vi.spyOn(console, "log").mockImplementation(() => {});
    const command = createMoveTaskCommand(() => fakeClient);

    await run(command, { task: "t1", list: "l1", statusMap: ["a=b", "c=d=e"] });

    expect(moveTask).toHaveBeenCalledWith("t1", "l1", {
      status_mappings: [
        { source_status: "a", destination_status: "b" },
        { source_status: "c", destination_status: "d=e" },
      ],
    });
  });

  it.each([
    ["an empty --task", { task: "", list: "l1" }, "--task needs a task ID"],
    ["a whitespace-only --task", { task: "  ", list: "l1" }, "--task needs a task ID"],
    ["an empty --list", { task: "t1", list: "" }, "--list needs a list ID"],
    ["a whitespace-only --list", { task: "t1", list: "  " }, "--list needs a list ID"],
    [
      "a --status-map with no =",
      { task: "t1", list: "l1", statusMap: ["abc"] },
      '--status-map "abc" must look like <sourceStatusId>=<destinationStatusId>',
    ],
    [
      "a --status-map with an empty source",
      { task: "t1", list: "l1", statusMap: ["=b"] },
      '--status-map "=b" must look like <sourceStatusId>=<destinationStatusId>',
    ],
    [
      "a --status-map with an empty destination",
      { task: "t1", list: "l1", statusMap: ["a="] },
      '--status-map "a=" must look like <sourceStatusId>=<destinationStatusId>',
    ],
  ] as [string, Argv, string][])(
    "rejects %s and does not call the client factory",
    async (_label, argv, message) => {
      const clientFactory = vi.fn();
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const command = createMoveTaskCommand(clientFactory);

      await run(command, argv);

      expect(errorSpy).toHaveBeenCalledWith(`clickup move-task: ${message}`);
      expect(process.exitCode).toBe(1);
      expect(clientFactory).not.toHaveBeenCalled();
    },
  );

  it("errors and sets exitCode 1 when the move throws", async () => {
    const moveTask = vi.fn().mockRejectedValue(new Error("HTTP 400"));
    const fakeClient = { moveTask } as unknown as ClickUpClient;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const command = createMoveTaskCommand(() => fakeClient);

    await run(command, { task: "t1", list: "l1" });

    expect(errorSpy).toHaveBeenCalledWith("clickup move-task: HTTP 400");
    expect(process.exitCode).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/cli/src/clickup/move-task.test.ts`
Expected: FAIL with an import error: `Failed to resolve import "./move-task.ts"`.

- [ ] **Step 3: Write the command**

Create `packages/cli/src/clickup/move-task.ts`:

```ts
import type { CommandModule } from "yargs";
import type {
  ClickUpClient,
  ClickUpMoveTaskOptions,
  ClickUpMoveTaskStatusMapping,
} from "@digismith/clickup-client";
import { createClient } from "./lib.ts";

function parseStatusMap(values: string[]): ClickUpMoveTaskStatusMapping[] {
  return values.map((value) => {
    const at = value.indexOf("=");
    const source = at === -1 ? "" : value.slice(0, at).trim();
    const destination = at === -1 ? "" : value.slice(at + 1).trim();
    if (source === "" || destination === "") {
      throw new Error(
        `--status-map "${value}" must look like <sourceStatusId>=<destinationStatusId>`,
      );
    }
    return { source_status: source, destination_status: destination };
  });
}

export function createMoveTaskCommand(
  clientFactory: () => ClickUpClient = createClient,
): CommandModule {
  return {
    command: "move-task",
    describe: "move a ClickUp task to another List (public API v3)",
    builder: (y) =>
      y
        .option("task", {
          type: "string",
          requiresArg: true,
          demandOption: true,
          describe: "ClickUp task ID",
        })
        .option("list", {
          type: "string",
          requiresArg: true,
          demandOption: true,
          describe: "ClickUp ID of the destination List",
        })
        .option("status-map", {
          type: "string",
          array: true,
          requiresArg: true,
          describe:
            "<sourceStatusId>=<destinationStatusId>, repeatable, for a destination List that lacks the task's status",
        })
        .option("move-custom-fields", {
          type: "boolean",
          describe: "move the task's custom fields to the destination List",
        }),
    handler: async (argv) => {
      try {
        const taskId = (argv.task as string).trim();
        const listId = (argv.list as string).trim();
        if (taskId === "") throw new Error("--task needs a task ID");
        if (listId === "") throw new Error("--list needs a list ID");

        const options: ClickUpMoveTaskOptions = {};
        const statusMap = (argv.statusMap as string[] | undefined) ?? [];
        if (statusMap.length > 0) options.status_mappings = parseStatusMap(statusMap);
        if (argv.moveCustomFields === true) options.move_custom_fields = true;

        const result = await clientFactory().moveTask(taskId, listId, options);
        console.log(JSON.stringify(result, null, 2));
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup move-task: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const moveTaskCommand: CommandModule = createMoveTaskCommand();
```

- [ ] **Step 4: Run the command tests to verify they pass**

Run: `npx vitest run packages/cli/src/clickup/move-task.test.ts`
Expected: PASS (all cases green, including the 7 rejection cases).

- [ ] **Step 5: Register the command**

In `packages/cli/src/clickup/index.ts`:

1. After the line `import { updateTaskCommand } from "./update-task.ts";`, add:

```ts
import { moveTaskCommand } from "./move-task.ts";
```

2. After the line `      .command(updateTaskCommand)`, add:

```ts
      .command(moveTaskCommand)
```

- [ ] **Step 6: Add the README line**

In `packages/cli/README.md`, after the line starting `digismith clickup update-task --task <id> [options]`, add this line (keep the `#` comments column aligned with its neighbors):

```
digismith clickup move-task --task <id> --list <id> [options]      # move a task to another List (--status-map, --move-custom-fields)
```

- [ ] **Step 7: Build and run the whole ClickUp test set**

Run: `pnpm --filter @digismith/cli build && npx vitest run packages/cli/src/clickup packages/clickup-client`
Expected: build exits 0 with no TypeScript errors, and every test file passes (62 baseline tests plus the new ones).

- [ ] **Step 8: Smoke the help output (no ClickUp call)**

Run: `node packages/cli/src/index.ts clickup move-task --help`
Expected: help text that lists `--task`, `--list`, `--status-map` and `--move-custom-fields`. Do NOT run the command without `--help`: that would call real ClickUp.

- [ ] **Step 9: Commit**

```bash
git add packages/cli/src/clickup/move-task.ts packages/cli/src/clickup/move-task.test.ts packages/cli/src/clickup/index.ts packages/cli/README.md
git commit -m "feat(cli): add dg clickup move-task"
```
