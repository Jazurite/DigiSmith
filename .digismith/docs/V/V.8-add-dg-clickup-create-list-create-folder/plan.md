# Add dg clickup create-list / create-folder commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `dg clickup create-folder` and `dg clickup create-list` commands, backed by new
`ClickUpClient` methods and a new `Space` convenience class, so folder/list creation no longer
needs a one-off script.

**Architecture:** Three new `ClickUpClient` methods (`createFolder`, `createListInFolder`,
`createListInSpace`) wrap the public ClickUp API the same way `createTask` already does. A new
generic `Space` class in the `clickup-client` package binds a client to one space id, so callers
stop threading `spaceId` through every call. The CLI package adds a `DIGISMITH_SPACE_ID` constant
and `createDigiSmithSpace()` helper, then two new commands (`create-folder`, `create-list`) that
follow the existing `create-task`/`update-task` command shape exactly.

**Tech Stack:** TypeScript, vitest, yargs, axios (via the existing `ClickUpClient`) — no new
dependencies.

## Global Constraints

- No new dependencies — every new method reuses `ClickUpClient`'s existing `post()` (built on the
  `axios` instance already configured in the constructor).
- Follow the exact file/test conventions already established in `packages/clickup-client/src/`
  and `packages/cli/src/clickup/` — same try/catch → `console.error` + `process.exitCode = 1` on
  failure, same `console.log(JSON.stringify(result, null, 2))` on success, same
  factory-function-with-a-default-parameter pattern for testability (`clientFactory`/`spaceFactory`).
- No `content`/`due_date`/`priority`/etc. on the new create endpoints — `name` only, per the
  approved design doc.
- `Space` stays generic (no DigiSmith-specific knowledge) — the `DIGISMITH_SPACE_ID` constant
  lives only in the CLI package's `lib.ts`, never inside `clickup-client`.
- No AI attribution anywhere — this repo enforces "no AI attribution in commits or PRs, no
  exceptions" via a pre-commit hook. Every commit message in this plan is written accordingly.
- Design doc: `.digismith/docs/V/V.8-add-dg-clickup-create-list-create-folder/design.html`
  (already approved, committed, and attached to ClickUp ticket
  [DGS-17](https://app.clickup.com/t/5738747/DGS-17)).

---

## Task 1: ClickUpClient folder/list creation methods

**Files:**
- Modify: `packages/clickup-client/src/client.ts` (insert new methods after `deleteTask`, line 133,
  before `setCustomField`; add `ClickUpFolder` to the existing type-only import block at the top —
  `ClickUpListSummary` is already imported there)
- Test: `packages/clickup-client/src/client.test.ts` (add to the existing
  `describe("ClickUpClient domain write/read methods", ...)` block, right after the
  `updateTask()` test)

**Interfaces:**
- Consumes: `this.post<T>(path, { data })` (already exists on `ClickUpClient`)
- Produces:
  - `createFolder(spaceId: string, name: string): Promise<ClickUpFolder>`
  - `createListInFolder(folderId: string, name: string): Promise<ClickUpListSummary>`
  - `createListInSpace(spaceId: string, name: string): Promise<ClickUpListSummary>`

- [ ] **Step 1: Write the failing tests**

Add these three tests to `client.test.ts`, inside the existing
`describe("ClickUpClient domain write/read methods", ...)` block (same file, right after the
`updateTask()` test at line ~216):

```ts
  it("createFolder() POSTs the name to the space folder endpoint", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: { id: "f1", name: "New Folder" } });

    const folder = await client.createFolder("90165960730", "New Folder");

    expect(request).toHaveBeenCalledWith({
      method: "POST",
      url: "/space/90165960730/folder",
      params: undefined,
      data: { name: "New Folder" },
    });
    expect(folder).toEqual({ id: "f1", name: "New Folder" });
  });

  it("createListInFolder() POSTs the name to the folder list endpoint", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: { id: "l1", name: "New List" } });

    const list = await client.createListInFolder("f1", "New List");

    expect(request).toHaveBeenCalledWith({
      method: "POST",
      url: "/folder/f1/list",
      params: undefined,
      data: { name: "New List" },
    });
    expect(list).toEqual({ id: "l1", name: "New List" });
  });

  it("createListInSpace() POSTs the name to the space list endpoint", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: { id: "l2", name: "Folderless List" } });

    const list = await client.createListInSpace("90165960730", "Folderless List");

    expect(request).toHaveBeenCalledWith({
      method: "POST",
      url: "/space/90165960730/list",
      params: undefined,
      data: { name: "Folderless List" },
    });
    expect(list).toEqual({ id: "l2", name: "Folderless List" });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @digismith/clickup-client test`
Expected: FAIL — `client.createFolder is not a function` (and likewise for the other two).

- [ ] **Step 3: Write the minimal implementation**

In `client.ts`, add `ClickUpFolder` to the existing type-only import from `./types.ts` (it
currently imports `ClickUpCustomField`, `ClickUpFolderWithLists`, `ClickUpFoldersResponse`,
`ClickUpFieldsResponse`, `ClickUpListDetail`, `ClickUpListSummary`, `ClickUpListsResponse`,
`ClickUpTask`, `ClickUpTasksResponse`, `ClickUpTaskType`, `ClickUpTaskTypesResponse`,
`ClickUpTaskWriteBody`, `ClickUpAttachment` — just add `ClickUpFolder` to that same list).

Then insert these three methods right after `deleteTask` (line 133) and before `setCustomField`:

```ts
  createFolder(spaceId: string, name: string): Promise<ClickUpFolder> {
    return this.post<ClickUpFolder>(`/space/${spaceId}/folder`, { data: { name } });
  }

  createListInFolder(folderId: string, name: string): Promise<ClickUpListSummary> {
    return this.post<ClickUpListSummary>(`/folder/${folderId}/list`, { data: { name } });
  }

  createListInSpace(spaceId: string, name: string): Promise<ClickUpListSummary> {
    return this.post<ClickUpListSummary>(`/space/${spaceId}/list`, { data: { name } });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @digismith/clickup-client test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/clickup-client/src/client.ts packages/clickup-client/src/client.test.ts
git commit -m "feat(clickup-client): add createFolder/createListInFolder/createListInSpace"
```

---

## Task 2: Space class

**Files:**
- Create: `packages/clickup-client/src/space.ts`
- Modify: `packages/clickup-client/src/index.ts` (add the export)
- Test: `packages/clickup-client/src/space.test.ts`

**Interfaces:**
- Consumes: `ClickUpClient.createFolder(spaceId, name)`, `ClickUpClient.createListInSpace(spaceId, name)` (Task 1)
- Produces:
  ```ts
  class Space {
    constructor(client: ClickUpClient, id: string);
    readonly id: string;
    createFolder(name: string): Promise<ClickUpFolder>;
    createList(name: string): Promise<ClickUpListSummary>;
  }
  ```

- [ ] **Step 1: Write the failing test**

Create `packages/clickup-client/src/space.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import type { ClickUpClient } from "./client.ts";
import type { ClickUpFolder, ClickUpListSummary } from "./types.ts";
import { Space } from "./space.ts";

describe("Space", () => {
  it("createFolder() delegates to the client with the bound space id", async () => {
    const folder = { id: "f1", name: "New Folder" } as unknown as ClickUpFolder;
    const createFolder = vi.fn().mockResolvedValue(folder);
    const fakeClient = { createFolder } as unknown as ClickUpClient;
    const space = new Space(fakeClient, "90165960730");

    const result = await space.createFolder("New Folder");

    expect(createFolder).toHaveBeenCalledWith("90165960730", "New Folder");
    expect(result).toBe(folder);
  });

  it("createList() delegates to createListInSpace with the bound space id", async () => {
    const list = { id: "l1", name: "New List" } as unknown as ClickUpListSummary;
    const createListInSpace = vi.fn().mockResolvedValue(list);
    const fakeClient = { createListInSpace } as unknown as ClickUpClient;
    const space = new Space(fakeClient, "90165960730");

    const result = await space.createList("New List");

    expect(createListInSpace).toHaveBeenCalledWith("90165960730", "New List");
    expect(result).toBe(list);
  });

  it("exposes the bound space id as a readonly property", () => {
    const space = new Space({} as ClickUpClient, "90165960730");

    expect(space.id).toBe("90165960730");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @digismith/clickup-client test`
Expected: FAIL — `Cannot find module './space.ts'` (or equivalent "no such file" error).

- [ ] **Step 3: Write the minimal implementation**

Create `packages/clickup-client/src/space.ts`:

```ts
import type { ClickUpClient } from "./client.ts";
import type { ClickUpFolder, ClickUpListSummary } from "./types.ts";

/** Binds a client to one space id, so callers stop threading spaceId through every call. */
export class Space {
  constructor(
    private readonly client: ClickUpClient,
    readonly id: string
  ) {}

  createFolder(name: string): Promise<ClickUpFolder> {
    return this.client.createFolder(this.id, name);
  }

  createList(name: string): Promise<ClickUpListSummary> {
    return this.client.createListInSpace(this.id, name);
  }
}
```

Add the export to `packages/clickup-client/src/index.ts` (after the existing
`export { ClickUpClient } from "./client.ts";` line):

```ts
export { Space } from "./space.ts";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @digismith/clickup-client test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/clickup-client/src/space.ts packages/clickup-client/src/space.test.ts packages/clickup-client/src/index.ts
git commit -m "feat(clickup-client): add Space, a client+spaceId binder"
```

---

## Task 3: CLI DigiSmith space constant + helper

**Files:**
- Modify: `packages/cli/src/clickup/lib.ts`
- Test: `packages/cli/src/clickup/lib.test.ts`

**Interfaces:**
- Consumes: `Space` (Task 2), `createClient()` (already exists in `lib.ts`)
- Produces: `DIGISMITH_SPACE_ID: string`, `createDigiSmithSpace(client?: ClickUpClient): Space`

- [ ] **Step 1: Write the failing test**

Add to `packages/cli/src/clickup/lib.test.ts` (it already imports `ClickUpClient` from
`@digismith/clickup-client` at the top — add `Space` to that same import, and add
`createDigiSmithSpace, DIGISMITH_SPACE_ID` to the existing
`import { createClient, buildTaskWriteBody } from "./lib.ts";` line):

```ts
describe("createDigiSmithSpace", () => {
  it("binds the DigiSmith space id to the given client", () => {
    const fakeClient = {} as ClickUpClient;

    const space = createDigiSmithSpace(fakeClient);

    expect(space).toBeInstanceOf(Space);
    expect(space.id).toBe(DIGISMITH_SPACE_ID);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @digismith/cli test`
Expected: FAIL — `createDigiSmithSpace is not defined` (or `DIGISMITH_SPACE_ID is not defined`).

- [ ] **Step 3: Write the minimal implementation**

In `packages/cli/src/clickup/lib.ts`, change the top import to also bring in `Space`:

```ts
import { ClickUpClient, checkCredentials, Space } from "@digismith/clickup-client";
import type { ClickUpTaskWriteBody } from "@digismith/clickup-client";
```

Then add, right after the existing `createClient` function:

```ts
/** The one ClickUp space DigiSmith itself operates in — see the V.8 design doc. */
export const DIGISMITH_SPACE_ID = "1301150000001271";

export function createDigiSmithSpace(client: ClickUpClient = createClient()): Space {
  return new Space(client, DIGISMITH_SPACE_ID);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @digismith/cli test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/clickup/lib.ts packages/cli/src/clickup/lib.test.ts
git commit -m "feat(cli): add DIGISMITH_SPACE_ID and createDigiSmithSpace()"
```

---

## Task 4: create-folder command

**Files:**
- Create: `packages/cli/src/clickup/create-folder.ts`
- Modify: `packages/cli/src/clickup/index.ts` (register the command)
- Test: `packages/cli/src/clickup/create-folder.test.ts`

**Interfaces:**
- Consumes: `createDigiSmithSpace()` (Task 3), `Space.createFolder(name)` (Task 2)
- Produces: `createCreateFolderCommand(spaceFactory?: () => Space): CommandModule`, and a default
  export `createFolderCommand: CommandModule`

- [ ] **Step 1: Write the failing test**

Create `packages/cli/src/clickup/create-folder.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import type { Space } from "@digismith/clickup-client";
import { createCreateFolderCommand } from "./create-folder.ts";

describe("createCreateFolderCommand", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("creates a folder in the DigiSmith space and prints it as JSON", async () => {
    const folder = { id: "f1", name: "W: New Clan" };
    const createFolder = vi.fn().mockResolvedValue(folder);
    const fakeSpace = { createFolder } as unknown as Space;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const command = createCreateFolderCommand(() => fakeSpace);

    await (command.handler as (argv: { name: string }) => Promise<void>)({
      name: "W: New Clan",
    });

    expect(createFolder).toHaveBeenCalledWith("W: New Clan");
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify(folder, null, 2));
    expect(process.exitCode).toBe(0);
  });

  it("errors and sets exitCode 1 when the space throws", async () => {
    const createFolder = vi.fn().mockRejectedValue(new Error("HTTP 400"));
    const fakeSpace = { createFolder } as unknown as Space;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const command = createCreateFolderCommand(() => fakeSpace);

    await (command.handler as (argv: { name: string }) => Promise<void>)({
      name: "W: New Clan",
    });

    expect(errorSpy).toHaveBeenCalledWith("clickup create-folder: HTTP 400");
    expect(process.exitCode).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @digismith/cli test`
Expected: FAIL — `Cannot find module './create-folder.ts'`.

- [ ] **Step 3: Write the minimal implementation**

Create `packages/cli/src/clickup/create-folder.ts`:

```ts
import type { CommandModule } from "yargs";
import type { Space } from "@digismith/clickup-client";
import { createDigiSmithSpace } from "./lib.ts";

export function createCreateFolderCommand(
  spaceFactory: () => Space = createDigiSmithSpace
): CommandModule {
  return {
    command: "create-folder",
    describe: "create a new Folder in the DigiSmith ClickUp space",
    builder: (y) =>
      y.option("name", {
        type: "string",
        requiresArg: true,
        demandOption: true,
        describe: "folder name",
      }),
    handler: async (argv) => {
      try {
        const space = spaceFactory();
        const folder = await space.createFolder(argv.name as string);
        console.log(JSON.stringify(folder, null, 2));
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup create-folder: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const createFolderCommand: CommandModule = createCreateFolderCommand();
```

Register it in `packages/cli/src/clickup/index.ts` — add the import alongside the others and
`.command(createFolderCommand)` alongside the existing `.command(...)` calls (order doesn't
matter, but keep it next to `createTaskCommand`/`updateTaskCommand` for readability):

```ts
import { createFolderCommand } from "./create-folder.ts";
```
```ts
      .command(createFolderCommand)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @digismith/cli test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/clickup/create-folder.ts packages/cli/src/clickup/create-folder.test.ts packages/cli/src/clickup/index.ts
git commit -m "feat(cli): add dg clickup create-folder command"
```

---

## Task 5: create-list command

**Files:**
- Create: `packages/cli/src/clickup/create-list.ts`
- Modify: `packages/cli/src/clickup/index.ts` (register the command)
- Test: `packages/cli/src/clickup/create-list.test.ts`

**Interfaces:**
- Consumes: `createClient()` + `ClickUpClient.createListInFolder(folderId, name)` (Task 1),
  `createDigiSmithSpace()` + `Space.createList(name)` (Tasks 2/3)
- Produces: `createCreateListCommand(clientFactory?: () => ClickUpClient, spaceFactory?: () => Space): CommandModule`,
  and a default export `createListCommand: CommandModule`

- [ ] **Step 1: Write the failing test**

Create `packages/cli/src/clickup/create-list.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import type { ClickUpClient, Space } from "@digismith/clickup-client";
import { createCreateListCommand } from "./create-list.ts";

describe("createCreateListCommand", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("creates a list inside the given folder when --folder is passed", async () => {
    const list = { id: "l1", name: "V.8" };
    const createListInFolder = vi.fn().mockResolvedValue(list);
    const fakeClient = { createListInFolder } as unknown as ClickUpClient;
    const spaceFactory = vi.fn();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const command = createCreateListCommand(() => fakeClient, spaceFactory);

    await (
      command.handler as (argv: { name: string; folder?: string }) => Promise<void>
    )({ name: "V.8", folder: "f1" });

    expect(createListInFolder).toHaveBeenCalledWith("f1", "V.8");
    expect(spaceFactory).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify(list, null, 2));
    expect(process.exitCode).toBe(0);
  });

  it("creates a folderless list in the DigiSmith space when --folder is omitted", async () => {
    const list = { id: "l2", name: "Pavilion 2" };
    const createList = vi.fn().mockResolvedValue(list);
    const fakeSpace = { createList } as unknown as Space;
    const clientFactory = vi.fn();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const command = createCreateListCommand(clientFactory, () => fakeSpace);

    await (
      command.handler as (argv: { name: string; folder?: string }) => Promise<void>
    )({ name: "Pavilion 2" });

    expect(createList).toHaveBeenCalledWith("Pavilion 2");
    expect(clientFactory).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify(list, null, 2));
    expect(process.exitCode).toBe(0);
  });

  it("errors and sets exitCode 1 when creation throws", async () => {
    const createListInFolder = vi.fn().mockRejectedValue(new Error("HTTP 404"));
    const fakeClient = { createListInFolder } as unknown as ClickUpClient;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const command = createCreateListCommand(() => fakeClient, vi.fn());

    await (
      command.handler as (argv: { name: string; folder?: string }) => Promise<void>
    )({ name: "V.8", folder: "f1" });

    expect(errorSpy).toHaveBeenCalledWith("clickup create-list: HTTP 404");
    expect(process.exitCode).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @digismith/cli test`
Expected: FAIL — `Cannot find module './create-list.ts'`.

- [ ] **Step 3: Write the minimal implementation**

Create `packages/cli/src/clickup/create-list.ts`:

```ts
import type { CommandModule } from "yargs";
import type { ClickUpClient, Space } from "@digismith/clickup-client";
import { createClient, createDigiSmithSpace } from "./lib.ts";

export function createCreateListCommand(
  clientFactory: () => ClickUpClient = createClient,
  spaceFactory: () => Space = createDigiSmithSpace
): CommandModule {
  return {
    command: "create-list",
    describe: "create a new List, in a Folder or folderless in the DigiSmith space",
    builder: (y) =>
      y
        .option("name", {
          type: "string",
          requiresArg: true,
          demandOption: true,
          describe: "list name",
        })
        .option("folder", {
          type: "string",
          requiresArg: true,
          describe: "ClickUp folder ID — omit to create a folderless list in the DigiSmith space",
        }),
    handler: async (argv) => {
      try {
        const name = argv.name as string;
        const folderId = argv.folder as string | undefined;
        const list = folderId
          ? await clientFactory().createListInFolder(folderId, name)
          : await spaceFactory().createList(name);
        console.log(JSON.stringify(list, null, 2));
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup create-list: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const createListCommand: CommandModule = createCreateListCommand();
```

Register it in `packages/cli/src/clickup/index.ts`, same way as Task 4:

```ts
import { createListCommand } from "./create-list.ts";
```
```ts
      .command(createListCommand)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @digismith/cli test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/clickup/create-list.ts packages/cli/src/clickup/create-list.test.ts packages/cli/src/clickup/index.ts
git commit -m "feat(cli): add dg clickup create-list command"
```

---

## Final Verification

- [ ] Run the full test suite for both touched packages: `pnpm --filter @digismith/clickup-client test && pnpm --filter @digismith/cli test` — expect all green, no regressions in existing `create-task`/`update-task`/`get-lists` tests.
- [ ] Build both packages: `pnpm --filter @digismith/clickup-client build && pnpm --filter @digismith/cli build` — expect no TypeScript errors.
- [ ] Manually smoke-test against the real DigiSmith space (`node packages/cli/dist/index.js clickup create-list --name "plan-smoke-test"`, confirm it appears folderless in the DigiSmith space's Pavilion area or wherever ClickUp lands an unfoldered list, then delete it by hand in the ClickUp UI — `dg clickup delete-task` doesn't exist yet and this is a List, not a task, so there's no CLI delete path for it at all yet).
