# DGS-645 Implementation Plan: create-task read-back

**Goal:** `dg clickup create-task` reads the task back after the fields are set, compares each `--field` value, retries a mismatch once, and exits 1 printing both values if it still differs.

**Spec:** `spec.md` in this folder. Files touched: `packages/cli/src/clickup/field-set.ts`, `create-task.ts`, and their tests `field-set.test.ts`, `create-task.test.ts`. Dropdown values on a read task are orderindex numbers.

**Setup (fresh worktree):** `pnpm install --frozen-lockfile` (inside this worktree only), then `pnpm --filter @digismith/clickup-client build`
**Run tests:** `pnpm vitest run packages/cli/src/clickup`

### Task 1: `findFieldMismatches` (test first)

**Files:** `packages/cli/src/clickup/field-set.ts`, `packages/cli/src/clickup/field-set.test.ts`

- [ ] Step 1: In `field-set.test.ts` add `describe("findFieldMismatches")` with these tests, using two dropdown fields Sign-off (Auto 0, Jack 1) and Mode (Autonomous 0, Manual 1) built as `ResolvedField` values. The task is `{ custom_fields: [{ id, value }] }`.
  - `"returns nothing when every dropdown value matches"` (Sign-off value 0, Mode value 1).
  - `"reports Mode read as Autonomous when Manual was set"`: Mode value 0, wanted option Manual. Expect `[{ field: "Mode", wanted: "Manual (1)", got: "Autonomous (0)" }]`.
  - `"accepts a dropdown value given as the option id"`.
  - `"reports an empty value"`: no entry for the field gives `got: "(empty)"`.
  - `"compares text, number and checkbox with ==="` (one mismatch each).
  - `"skips date and relationship fields"`.
- [ ] Step 2: Run `pnpm vitest run packages/cli/src/clickup/field-set.test.ts`. Expect FAIL (`findFieldMismatches` is not exported).
- [ ] Step 3: In `field-set.ts` add `orderindex?: number` to the option type in `FieldLike`. Export `interface FieldMismatch { field: string; wanted: string; got: string }` and `export function findFieldMismatches(task: { custom_fields?: { id: string; value?: unknown }[] }, resolved: ResolvedField[]): FieldMismatch[]` as in the spec. For `drop_down`: `value` (the option id) gives the wanted option; `got` is the option whose `orderindex === entry.value` or whose `id === entry.value`; label an option `Name (orderindex)`; an unknown value prints `String(value)`.
- [ ] Step 4: Run `pnpm vitest run packages/cli/src/clickup/field-set.test.ts`. Expect PASS.
- [ ] Step 5: Commit `git add packages/cli/src/clickup/field-set.ts packages/cli/src/clickup/field-set.test.ts && git commit -m "feat(clickup): add findFieldMismatches for field read-back"` (title only, no attribution).

### Task 2: create-task checks, retries once, fails loudly (test first)

**Files:** `packages/cli/src/clickup/create-task.ts`, `packages/cli/src/clickup/create-task.test.ts`

- [ ] Step 1: In `create-task.test.ts`, in `describe("--field")`, change `fields` or add a second list with Sign-off and Mode dropdowns (orderindex as above). Add tests. In each, `client.get` is a `vi.fn()` that returns the task with `custom_fields`.
  - `"sets two dropdowns where the wanted option is not orderindex 0"`: flags `Sign-off=Auto`, `Mode=Manual` (then the reverse order, then `Mode=Manual`, `Sign-off=Jack`). Expect `setCustomField` calls with the option ids, `get` returns matching values, `process.exitCode` is 0.
  - `"exits 1 and prints both values when Mode reads back wrong"`: `get` always returns Mode value 0. Expect `process.exitCode` 1, `console.error` called with text containing `Mode`, `Manual (1)` and `Autonomous (0)` and the task id, and `console.log` called with the task JSON.
  - `"retries a mismatched field once and passes"`: first `get` returns Mode 0, second returns Mode 1. Expect `setCustomField` called 3 times (two first, then Mode only), exit 0.
  - `"does not read back or retry without --field"`: no `get` call, `createTask` once.
- [ ] Step 2: Run `pnpm vitest run packages/cli/src/clickup/create-task.test.ts`. Expect FAIL on the new tests only.
- [ ] Step 3: In `create-task.ts`, replace the `if (resolved.length > 0)` block:
  ```ts
  if (resolved.length > 0) {
    await applyFields(client, task.id, resolved);
    task = await client.get<typeof task>(`/task/${task.id}`);
    let bad = findFieldMismatches(task, resolved);
    if (bad.length > 0) {
      await applyFields(client, task.id, resolved.filter((r) => bad.some((m) => m.field === r.field.name)));
      task = await client.get<typeof task>(`/task/${task.id}`);
      bad = findFieldMismatches(task, resolved);
    }
    if (bad.length > 0) {
      console.log(JSON.stringify(task, null, 2));
      throw new Error(`task ${task.id} was created, but ${bad.map((m) => `field "${m.field}" reads ${m.got}, wanted ${m.wanted}`).join("; ")}`);
    }
  }
  ```
  Import `findFieldMismatches` next to `resolveFieldArgs, applyFields`. The existing `catch` sets `exitCode = 1` and prints `clickup create-task: <message>`.
- [ ] Step 4: Run `pnpm vitest run packages/cli/src/clickup`. Expect all PASS (the old `--field` tests need `get` to return `custom_fields` or none: `findFieldMismatches` treats a missing `custom_fields` array as all empty, so update the old test's `get` mock to return the matching values).
- [ ] Step 5: Commit `git add packages/cli/src/clickup/create-task.ts packages/cli/src/clickup/create-task.test.ts && git commit -m "fix(clickup): read back create-task fields and fail on a mismatch"`.

### Task 3: README line and final check

**Files:** the clickup CLI README (find it: `grep -rn "create-task" packages/cli/README.md`)

- [ ] Step 1: Add one sentence where `--field` is described: create-task reads the fields back, retries a wrong one once, and exits 1 with both values if it still differs.
- [ ] Step 2: Run `pnpm vitest run packages/cli/src/clickup` and `pnpm --filter @digismith/cli typecheck` if the script exists. Expect PASS.
- [ ] Step 3: Commit `git add <readme> && git commit -m "docs(clickup): note the create-task field read-back"`.

**First use (conductor, after the merge):** see `spec.md`, "The first use".
