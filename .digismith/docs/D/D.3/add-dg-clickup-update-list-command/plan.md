# dg clickup update-list Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `dg clickup update-list` so a ClickUp List can be renamed and given a description from the CLI, through ClickUp's public API.

**Architecture:** One new `ClickUpClient.updateList` method (`PUT /list/{id}`) with its write-body and response types, and one new command file modeled on `update-task.ts`. The command validates its flags before it creates a client, so a bad invocation never touches the network or the credentials.

**Tech Stack:** TypeScript (Node 24, `--experimental-strip-types`), yargs, axios, Vitest, pnpm workspace.

## Global Constraints

- Public API only: `PUT /list/{list_id}`. No Frontdoor call.
- Send the description as `content`. Never send `markdown_content` (GET returns it without bullet markers).
- Edits to `packages/clickup-client/src/client.ts`, `packages/clickup-client/src/types.ts`, `packages/cli/src/clickup/index.ts` are additive only. A second worker (DGS-76, `move-task`) edits the same files in parallel; do not reorder or reformat existing lines.
- Tests use mocks. No test calls ClickUp. Do not read or print the ClickUp token.
- No live write to ClickUp without the maestro's approval.
- Error output format: `clickup update-list: <message>`, exit code 1. Success prints the response as JSON, exit code 0.
- No `--description` on `create-list` (follow-up, recorded in the handoff).
- Run tests from the worktree root: `npx vitest run <path>`.

---

### Task 1: Client method `updateList`

**Files:**
- Modify: `packages/clickup-client/src/types.ts` (add after the `ClickUpTaskWriteBody` interface)
- Modify: `packages/clickup-client/src/client.ts` (add the import names and the method after `createListInSpace`)
- Test: `packages/clickup-client/src/client.test.ts` (add after the `createListInSpace()` test)

**Interfaces:**
- Consumes: `ClickUpClient.put<T>(path, { data })` already in `client.ts`.
- Produces:
  - `interface ClickUpListWriteBody { name?: string; content?: string }`
  - `interface ClickUpUpdatedList { id: string; name: string; content?: string }`
  - `ClickUpClient.updateList(listId: string, body: ClickUpListWriteBody): Promise<ClickUpUpdatedList>`

- [ ] **Step 1: Write the failing test**

In `packages/clickup-client/src/client.test.ts`, directly after the `createListInSpace()` test, add:

```ts
  it("updateList() PUTs the body to the list endpoint", async () => {
    const client = makeClient();
    request.mockResolvedValueOnce({ data: { id: "l1", name: "Town Hall", content: "- scope" } });

    const list = await client.updateList("l1", { name: "Town Hall", content: "- scope" });

    expect(request).toHaveBeenCalledWith({
      method: "PUT",
      url: "/list/l1",
      params: undefined,
      data: { name: "Town Hall", content: "- scope" },
    });
    expect(list).toEqual({ id: "l1", name: "Town Hall", content: "- scope" });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/clickup-client/src/client.test.ts -t "updateList"`
Expected: FAIL with `client.updateList is not a function`.

- [ ] **Step 3: Write the minimal implementation**

In `packages/clickup-client/src/types.ts`, after the `ClickUpTaskWriteBody` interface, add:

```ts
export interface ClickUpListWriteBody {
  name?: string;
  content?: string;
}

/** Response shape from PUT /list/{list_id}; only the fields the CLI relies on. */
export interface ClickUpUpdatedList {
  id: string;
  name: string;
  content?: string;
}
```

In `packages/clickup-client/src/client.ts`, add `ClickUpListWriteBody,` and `ClickUpUpdatedList,` to the existing type import list (keep the other names where they are), and after `createListInSpace` add:

```ts
  updateList(listId: string, body: ClickUpListWriteBody): Promise<ClickUpUpdatedList> {
    return this.put<ClickUpUpdatedList>(`/list/${listId}`, { data: body });
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/clickup-client`
Expected: PASS, all client tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/clickup-client/src/types.ts packages/clickup-client/src/client.ts packages/clickup-client/src/client.test.ts
git commit -m "feat(clickup-client): add updateList for PUT /list/{id}"
```

---

### Task 2: `update-list` command, registration and README

**Files:**
- Create: `packages/cli/src/clickup/update-list.ts`
- Create: `packages/cli/src/clickup/update-list.test.ts`
- Modify: `packages/cli/src/clickup/index.ts` (add one import line and one `.command(...)` line)
- Modify: `packages/cli/README.md` (add one usage line, one sentence)

**Interfaces:**
- Consumes: `ClickUpClient.updateList`, `ClickUpListWriteBody` from `@digismith/clickup-client` (Task 1); `createClient` from `./lib.ts`.
- Produces: `createUpdateListCommand(clientFactory?: () => ClickUpClient): CommandModule` and `updateListCommand: CommandModule`.

- [ ] **Step 1: Write the failing tests**

Create `packages/cli/src/clickup/update-list.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createUpdateListCommand } from "./update-list.ts";

type Argv = {
  list: string;
  name?: string;
  description?: string;
  descriptionFile?: string;
};

function setup(updateList = vi.fn().mockResolvedValue({ id: "l1", name: "Town Hall" })) {
  const clientFactory = vi.fn(() => ({ updateList }) as unknown as ClickUpClient);
  const command = createUpdateListCommand(clientFactory);
  const run = (argv: Argv) => (command.handler as (a: Argv) => Promise<void>)(argv);
  return { updateList, clientFactory, run };
}

describe("createUpdateListCommand", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("renames a list with --name only", async () => {
    const { updateList, run } = setup();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await run({ list: "l1", name: "Town Hall" });

    expect(updateList).toHaveBeenCalledWith("l1", { name: "Town Hall" });
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify({ id: "l1", name: "Town Hall" }, null, 2));
    expect(process.exitCode).toBe(0);
  });

  it("sends --description as content", async () => {
    const { updateList, run } = setup();
    vi.spyOn(console, "log").mockImplementation(() => {});

    await run({ list: "l1", description: "- scope\n- rules" });

    expect(updateList).toHaveBeenCalledWith("l1", { content: "- scope\n- rules" });
    expect(process.exitCode).toBe(0);
  });

  it("sends name and description together", async () => {
    const { updateList, run } = setup();
    vi.spyOn(console, "log").mockImplementation(() => {});

    await run({ list: "l1", name: "B.2: Router", description: "text" });

    expect(updateList).toHaveBeenCalledWith("l1", { name: "B.2: Router", content: "text" });
  });

  it("reads the description from --description-file as UTF-8", async () => {
    const dir = mkdtempSync(join(tmpdir(), "update-list-"));
    try {
      const file = join(dir, "desc.md");
      writeFileSync(file, "- one\n- two — dash\n", "utf8");
      const { updateList, run } = setup();
      vi.spyOn(console, "log").mockImplementation(() => {});

      await run({ list: "l1", descriptionFile: file });

      expect(updateList).toHaveBeenCalledWith("l1", { content: "- one\n- two — dash\n" });
      expect(process.exitCode).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("allows an empty --description and sends it to clear the description", async () => {
    const { updateList, run } = setup();
    vi.spyOn(console, "log").mockImplementation(() => {});

    await run({ list: "l1", description: "" });

    expect(updateList).toHaveBeenCalledWith("l1", { content: "" });
    expect(process.exitCode).toBe(0);
  });

  it.each([
    ["an empty --list", { list: "", name: "x" }, "--list needs a list ID"],
    ["a whitespace --list", { list: "  ", name: "x" }, "--list needs a list ID"],
    ["an empty --name", { list: "l1", name: "" }, "--name needs a non-empty name"],
    ["a whitespace --name", { list: "l1", name: "   " }, "--name needs a non-empty name"],
    [
      "both description flags",
      { list: "l1", description: "a", descriptionFile: "b.md" },
      "use --description or --description-file, not both",
    ],
    [
      "no fields to update",
      { list: "l1" },
      "nothing to update — pass --name, --description or --description-file",
    ],
  ] as [string, Argv, string][])("rejects %s before creating a client", async (_label, argv, message) => {
    const { clientFactory, updateList, run } = setup();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await run(argv);

    expect(errorSpy).toHaveBeenCalledWith(`clickup update-list: ${message}`);
    expect(process.exitCode).toBe(1);
    expect(clientFactory).not.toHaveBeenCalled();
    expect(updateList).not.toHaveBeenCalled();
  });

  it("errors when --description-file cannot be read, without creating a client", async () => {
    const { clientFactory, run } = setup();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await run({ list: "l1", descriptionFile: join(tmpdir(), "no-such-dir", "missing.md") });

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("clickup update-list: cannot read --description-file"),
    );
    expect(process.exitCode).toBe(1);
    expect(clientFactory).not.toHaveBeenCalled();
  });

  it("errors and sets exitCode 1 when the API call throws", async () => {
    const { run } = setup(vi.fn().mockRejectedValue(new Error("HTTP 404")));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await run({ list: "l1", name: "x" });

    expect(errorSpy).toHaveBeenCalledWith("clickup update-list: HTTP 404");
    expect(process.exitCode).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/cli/src/clickup/update-list.test.ts`
Expected: FAIL, cannot resolve `./update-list.ts`.

- [ ] **Step 3: Write the minimal implementation**

Create `packages/cli/src/clickup/update-list.ts`:

```ts
import { readFileSync } from "node:fs";
import type { CommandModule } from "yargs";
import type { ClickUpClient, ClickUpListWriteBody } from "@digismith/clickup-client";
import { createClient } from "./lib.ts";

export function createUpdateListCommand(
  clientFactory: () => ClickUpClient = createClient
): CommandModule {
  return {
    command: "update-list",
    describe: "rename a ClickUp List and set its description",
    builder: (y) =>
      y
        .option("list", {
          type: "string",
          requiresArg: true,
          demandOption: true,
          describe: "ClickUp list ID",
        })
        .option("name", { type: "string", requiresArg: true, describe: "new list name" })
        .option("description", {
          type: "string",
          requiresArg: true,
          describe: "new list description; an empty string clears it",
        })
        .option("description-file", {
          type: "string",
          requiresArg: true,
          describe: "read the new list description from this UTF-8 file",
        }),
    handler: async (argv) => {
      try {
        const listId = argv.list as string;
        const name = argv.name as string | undefined;
        const description = argv.description as string | undefined;
        const descriptionFile = argv.descriptionFile as string | undefined;
        if (listId.trim() === "") throw new Error("--list needs a list ID");
        if (name !== undefined && name.trim() === "") throw new Error("--name needs a non-empty name");
        if (description !== undefined && descriptionFile !== undefined) {
          throw new Error("use --description or --description-file, not both");
        }
        if (name === undefined && description === undefined && descriptionFile === undefined) {
          throw new Error("nothing to update — pass --name, --description or --description-file");
        }
        let content = description;
        if (descriptionFile !== undefined) {
          try {
            content = readFileSync(descriptionFile, "utf8");
          } catch (err) {
            throw new Error(`cannot read --description-file ${descriptionFile}: ${(err as Error).message}`);
          }
        }
        const body: ClickUpListWriteBody = {};
        if (name !== undefined) body.name = name;
        if (content !== undefined) body.content = content;
        const list = await clientFactory().updateList(listId, body);
        console.log(JSON.stringify(list, null, 2));
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup update-list: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const updateListCommand: CommandModule = createUpdateListCommand();
```

In `packages/cli/src/clickup/index.ts`, add after the `createListCommand` import (additive, no other line touched):

```ts
import { updateListCommand } from "./update-list.ts";
```

and after `.command(createListCommand)` add:

```ts
      .command(updateListCommand)
```

In `packages/cli/README.md`, after the `create-list` usage line add:

```
digismith clickup update-list --list <id> [--name <name>] [--description <text> | --description-file <path>]  # rename a List and set its description
```

and after the sentence ending "creates the list inside that folder instead." add: `` `update-list` sets the description through ClickUp's `content` field, so literal `- ` bullet lines stay as written. ``

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/cli/src/clickup packages/clickup-client`
Expected: PASS.

- [ ] **Step 5: Smoke-test the real CLI without network**

Run: `node packages/cli/src/index.ts clickup update-list --list x`
Expected: `clickup update-list: nothing to update — pass --name, --description or --description-file`, exit code 1 (checks that yargs registration works and validation runs before any credential read).

Run: `node packages/cli/src/index.ts clickup update-list --help`
Expected: usage text listing `--list`, `--name`, `--description`, `--description-file`.

- [ ] **Step 6: Run the full suite and commit**

Run: `npx vitest run`
Expected: PASS.

```bash
git add packages/cli/src/clickup/update-list.ts packages/cli/src/clickup/update-list.test.ts packages/cli/src/clickup/index.ts packages/cli/README.md
git commit -m "feat(cli): add dg clickup update-list command"
```
