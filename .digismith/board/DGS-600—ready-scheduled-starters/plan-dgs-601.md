# DGS-601 Scheduled starter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Nexus job `schedule-release` moves each `scheduled` ticket whose "Scheduled at" is past to `ready` (Mode Autonomous) or `to do` (Mode Manual); `dg` can create the date field, write a date-and-time value, and create the ClickUp "Schedule" view.

**Architecture:** A pure core `runScheduleRelease` in `packages/cli/src/autonomous/schedule-release.ts` uses the `Tracker` of DGS-600 (`listByStatus`, `setStatus`, `getStatus`, `comment`), writes events to `events.jsonl` and keeps its comment-once notes in `schedule-notes.json`. The command `dg autonomous schedule-release` wraps it; the Nexus registry runs it every 5 minutes. Three `dg clickup` changes close the tool gaps: `create-field --type date`, a `date` case in `--field`, and a new `create-view`.

**Tech Stack:** TypeScript under `node --experimental-strip-types`, yargs, vitest, pnpm; Hono Nexus scheduler (registry only).

**Spec:** `.digismith/board/DGS-600—ready-scheduled-starters/design.html` (approved by Jack, 2026-10-24), sections 3, 6, 7, 8, 9, 10, 11.

**Two small changes from the spec, both technical:** (1) the "missing or not a date" comment is two texts, one for an empty field and one for a bad value, so a fix from one to the other comments again; (2) `create-view` takes field ids (`--sort-field-id`, `--column-field-id`) instead of a field name, because the ids are known at setup time and a name needs a field read per list.

**Depends on:** `plan.md` (DGS-600) merged first: `Tracker.listByStatus`, `LoTask.mode`, `FakeTracker` with `ready`/`scheduled`, `create-field --location`, `get-field`, and the live statuses `ready` and `scheduled` and the field `Mode`.

## Global Constraints

- Code in `packages/cli/src/` runs under `node --experimental-strip-types`: no parameter properties, no enums, no namespaces.
- Tests use fakes only: no real ClickUp, no herdr prompt, no live API, no real depot (`DIGISMITH_DEPOT_DIR` in a temp folder when a test needs it).
- Test first: write the failing test, see it fail, then the code.
- pnpm only. Never `pnpm install` in the depot clone.
- ClickUp writes go through `dg` only; no one-off scripts. Every new write command prints the call and sends nothing without `--yes`.
- Names, exactly: status `scheduled`, `ready`, `to do`; field `Scheduled at` (date with time), `Mode` (`Autonomous`, `Manual`); job `schedule-release`; command `dg autonomous schedule-release`; view `Schedule`; events `schedule-move`, `schedule-move-failed`; notes file `schedule-notes.json`.
- When "Scheduled at" arrives: Mode Autonomous -> `ready`, Mode Manual -> `to do`. Nothing else happens at that time. No "Then" field.
- Job: every 5 min, all day (`00:00`-`23:59` UTC+7), `catchUp: 'skip'`, order 45, no model tokens.
- Times UTC+7 in every text a person reads.
- Commits: title-only conventional commits, no AI attribution.
- `packages/cli/src/autonomous/` and `scripts/nexus-api/src/scheduler/` are Nightwatch-protected paths: this is an attended build.

Test commands used below:
- CLI: `cd packages/cli && pnpm vitest run <path relative to packages/cli>`; whole suite `pnpm test`; types `pnpm exec tsc --noEmit -p tsconfig.build.json`
- Client: `cd packages/clickup-client && pnpm vitest run <path>`
- nexus-api (no package script; from the repo root): `pnpm vitest run scripts/nexus-api/<path>`

## File Structure

| File | Change |
|---|---|
| `packages/clickup-client/src/client.ts`, `types.ts` | `setCustomField` value options; `getSpaceViews`, `createSpaceView` |
| `packages/clickup-client/src/types.ts` | create body allows `type: "date"` |
| `packages/cli/src/clickup/create-field.ts` | `--type date` |
| `packages/cli/src/clickup/field-set.ts` | `date` values |
| `packages/cli/src/clickup/create-view.ts` (new), `index.ts` | `dg clickup create-view` |
| `packages/cli/src/autonomous/types.ts`, `tracker-clickup.ts`, `fake-tracker.test-util.ts` | `LoTask.scheduledAt`; new event kinds |
| `packages/cli/src/autonomous/schedule-release.ts` (new) | the core |
| `packages/cli/src/autonomous/index.ts` | the command |
| `scripts/nexus-api/src/scheduler/registry.ts` | the job |

---

### Task 1: Client: date value options and space views

**Files:**
- Modify: `packages/clickup-client/src/client.ts:257-259` (`setCustomField`), add `getSpaceViews`, `createSpaceView`
- Modify: `packages/clickup-client/src/types.ts` (new `ClickUpView`, `ClickUpViewCreateBody`)
- Test: `packages/clickup-client/src/client.test.ts`

**Interfaces:**
- Produces:
  - `setCustomField(taskId: string, fieldId: string, value: unknown, valueOptions?: { time: boolean }): Promise<void>`: body `{ value }` or `{ value, value_options }`.
  - `getSpaceViews(spaceId: string): Promise<ClickUpView[]>` = `GET /space/{id}/view`, answer `{ views: ClickUpView[] }`.
  - `createSpaceView(spaceId: string, body: ClickUpViewCreateBody): Promise<ClickUpView>` = `POST /space/{id}/view`, answer `{ view: ClickUpView }`.
  - `interface ClickUpView { id: string; name: string; type: string }`
  - `interface ClickUpViewCreateBody { name: string; type: "list"; filters: { op: "AND"; fields: { field: string; op: "EQ"; values: string[] }[]; search: ""; show_closed: false }; sorting: { fields: { field: string; dir: 1 | -1 }[] }; columns: { fields: { field: string; hidden: false }[] } }`

- [ ] **Step 1: Write the failing tests** (in `client.test.ts`, next to the `setCustomField` test, same style)

```ts
it("setCustomField() sends value_options when given", async () => {
  const client = makeClient();
  request.mockResolvedValueOnce({ data: {} });
  await client.setCustomField("abc", "field-uuid", 1793000000000, { time: true });
  expect(request).toHaveBeenCalledWith({ method: "POST", url: "/task/abc/field/field-uuid", params: undefined, data: { value: 1793000000000, value_options: { time: true } } });
});
it("getSpaceViews() GETs the space views", async () => {
  const client = makeClient();
  request.mockResolvedValueOnce({ data: { views: [{ id: "v1", name: "List", type: "list" }] } });
  expect(await client.getSpaceViews("s1")).toEqual([{ id: "v1", name: "List", type: "list" }]);
  expect(request).toHaveBeenCalledWith({ method: "GET", url: "/space/s1/view", params: undefined, data: undefined });
});
it("createSpaceView() POSTs the body and returns the view", async () => {
  const client = makeClient();
  const body = { name: "Schedule", type: "list" as const, filters: { op: "AND" as const, fields: [{ field: "status", op: "EQ" as const, values: ["scheduled"] }], search: "" as const, show_closed: false as const }, sorting: { fields: [{ field: "cf_f1", dir: 1 as const }] }, columns: { fields: [{ field: "cf_f1", hidden: false as const }] } };
  request.mockResolvedValueOnce({ data: { view: { id: "v9", name: "Schedule", type: "list" } } });
  expect(await client.createSpaceView("s1", body)).toEqual({ id: "v9", name: "Schedule", type: "list" });
  expect(request).toHaveBeenCalledWith({ method: "POST", url: "/space/s1/view", params: undefined, data: body });
});
```

The existing test "setCustomField() POSTs { value }" stays and must still pass (no `value_options` key without the argument).

- [ ] **Step 2: Run to verify they fail**

Run: `cd packages/clickup-client && pnpm vitest run src/client.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
  async setCustomField(taskId: string, fieldId: string, value: unknown, valueOptions?: { time: boolean }): Promise<void> {
    await this.post(`/task/${taskId}/field/${fieldId}`, { data: valueOptions === undefined ? { value } : { value, value_options: valueOptions } });
  }

  async getSpaceViews(spaceId: string): Promise<ClickUpView[]> {
    return (await this.get<{ views: ClickUpView[] }>(`/space/${spaceId}/view`)).views ?? [];
  }

  async createSpaceView(spaceId: string, body: ClickUpViewCreateBody): Promise<ClickUpView> {
    return (await this.post<{ view: ClickUpView }>(`/space/${spaceId}/view`, { data: body })).view;
  }
```

Add both types to `types.ts` and export them from the package index like the other types.

- [ ] **Step 4: Run to verify they pass**

Run: `cd packages/clickup-client && pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/clickup-client/src
git commit -m "feat(dgs-601): add date value options and space views to the clickup client"
```

### Task 2: `create-field --type date`

**Files:**
- Modify: `packages/clickup-client/src/types.ts` (`FrontdoorFieldCreateBody`)
- Modify: `packages/cli/src/clickup/create-field.ts`
- Test: `packages/cli/src/clickup/create-field.test.ts`

**Interfaces:**
- Consumes: `buildFieldCreateBody(name, optionArgs, scope, description)` and `--location` from DGS-600 Task 7.
- Produces: `buildFieldCreateBody(name, optionArgs, scope, description, fieldType: "drop_down" | "date" = "drop_down")`. For `date`: `type: "date"`, `type_config: {}`, no options. `FrontdoorFieldCreateBody.type: "drop_down" | "date"`, `type_config` is the dropdown config or `Record<string, never>`.

- [ ] **Step 1: Write the failing tests** (in `create-field.test.ts`; the `fake()` helper already has `teamId`, `setFieldLocations`, `getFieldLocations` from DGS-600)

```ts
it("--type date dry run prints a date body with no options", async () => {
  const client = fake();
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  await run(client, { type: "date", name: "Scheduled at", location: ["4:1301150000001271"] });
  const out = log.mock.calls.map((c) => c.join(" ")).join("\n");
  expect(out).toContain('"type": "date"');
  expect(out).toContain('"type_config": {}');
  expect(out).not.toContain("new_drop_down");
  expect(client.createField).not.toHaveBeenCalled();
});
it("--type date --yes sends the date body", async () => {
  const client = fake();
  client.createField = vi.fn().mockResolvedValue({ id: "f7", name: "Scheduled at", type: "date", type_config: {} });
  client.getFieldLocations = vi.fn().mockResolvedValue({ id: "f7", name: "Scheduled at", type: "date", type_config: {}, locations: [{}] });
  vi.spyOn(console, "log").mockImplementation(() => {});
  await run(client, { type: "date", name: "Scheduled at", location: ["4:1301150000001271"], yes: true });
  expect(client.createField.mock.calls[0][0]).toMatchObject({ name: "Scheduled at", type: "date", type_config: {}, team_id: "5738747" });
  expect(client.setFieldLocations).toHaveBeenCalledWith("f7", [{ parent: { type: 4, id: "1301150000001271" }, required: false, required_on_subtasks: false, hide_from_guests: false }]);
});
it("--type date with --option is refused", async () => {
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  await run(fake(), { type: "date", name: "Scheduled at", option: ["x"], location: ["4:1"] });
  expect(err.mock.calls[0][0]).toBe("clickup create-field: --option is only for --type drop_down");
  expect(process.exitCode).toBe(1);
});
it("a refused date body says a capture is needed", async () => {
  const client = fake();
  client.createField = vi.fn().mockRejectedValue(new Error("Request failed with status code 400"));
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  await run(client, { type: "date", name: "Scheduled at", location: ["4:1"], yes: true });
  expect(err.mock.calls[0][0]).toBe("clickup create-field: Request failed with status code 400 (the date body is not captured yet: create one date field in the ClickUp web app with Proxyman on, then compare with dg clickup frontdoor dump --match customFields)");
});
```

Change the existing "type other than drop_down is refused" test (if present) to use `type: "number"`.

- [ ] **Step 2: Run to verify they fail**

Run: `cd packages/cli && pnpm vitest run src/clickup/create-field.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`types.ts`:

```ts
  type: "drop_down" | "date";
  type_config: { new_drop_down: true; sorting: "manual"; options: FrontdoorFieldCreateOption[] } | Record<string, never>;
```

(update the doc comment: "a date body (type_config {}) is not captured; DGS-601 sends it once and stops on a 4xx".)

`create-field.ts`:
- builder: `.option("type", { type: "string", choices: ["drop_down", "date"], default: "drop_down", describe: "field type" })`
- handler: replace the `drop_down`-only check with:

```ts
        const fieldType = argv.type as "drop_down" | "date";
        const optionArgs = (argv.option as string[] | undefined) ?? [];
        if (fieldType === "date" && optionArgs.length > 0) throw new Error("--option is only for --type drop_down");
        if (fieldType === "drop_down" && optionArgs.length === 0) throw new Error("at least one --option is required");
```

- `buildFieldCreateBody(..., fieldType = "drop_down")`: when `fieldType === "date"` skip the option parsing and return the same body with `type: "date"` and `type_config: {}`.
- wrap `client.createField(body)`:

```ts
          let field;
          try {
            field = await client.createField(body);
          } catch (e) {
            const m = (e as Error).message;
            throw new Error(fieldType === "date" ? `${m} (the date body is not captured yet: create one date field in the ClickUp web app with Proxyman on, then compare with dg clickup frontdoor dump --match customFields)` : m);
          }
```

- `describe`: `"create a dropdown or date custom field at a folder or at locations read with get-field (Frontdoor); a dry run unless --yes"`.

- [ ] **Step 4: Run to verify they pass**

Run: `cd packages/cli && pnpm vitest run src/clickup/create-field.test.ts && pnpm exec tsc --noEmit -p tsconfig.build.json`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/clickup-client/src/types.ts packages/cli/src/clickup/create-field.ts packages/cli/src/clickup/create-field.test.ts
git commit -m "feat(dgs-601): let create-field make a date field"
```

### Task 3: `--field` writes a date and time

**Files:**
- Modify: `packages/cli/src/clickup/field-set.ts`
- Test: `packages/cli/src/clickup/field-set.test.ts`

**Interfaces:**
- Consumes: `setCustomField(..., valueOptions?)` (Task 1), `parseDateFlag` from `./parse-date.ts`.
- Produces: `ResolvedField { field; value; valueOptions?: { time: boolean } }`. `parseDateTimeValue(raw: string, fieldName: string): number` exported from `field-set.ts`. Accepted: `YYYY-MM-DDTHH:MM[:SS]±HH:MM` (or `Z`), and `YYYY-MM-DD HH:MM` read as UTC+7. A plain day is refused. The value is ms; `valueOptions` is `{ time: true }`.

- [ ] **Step 1: Write the failing tests**

```ts
describe("date fields", () => {
  const dateField = { id: "fd", name: "Scheduled at", type: "date" };
  it("reads YYYY-MM-DD HH:MM as UTC+7", () => {
    expect(parseDateTimeValue("2026-10-25 22:00", "Scheduled at")).toBe(Date.parse("2026-10-25T15:00:00Z"));
  });
  it("reads an ISO time with an offset", () => {
    expect(parseDateTimeValue("2026-10-25T22:00:00+07:00", "Scheduled at")).toBe(Date.parse("2026-10-25T15:00:00Z"));
  });
  it("refuses a plain day, a missing offset and a day that does not exist", () => {
    for (const bad of ["2026-10-25", "2026-10-25T22:00", "2026-02-30 10:00", "tomorrow", "2026-10-25 24:00"]) {
      expect(() => parseDateTimeValue(bad, "Scheduled at")).toThrow(/Scheduled at/);
    }
  });
  it("resolveFieldArgs gives the ms and time: true; applyFields sends value_options", async () => {
    const setCustomField = vi.fn();
    const client = { getListFields: vi.fn().mockResolvedValue([dateField]), setCustomField } as unknown as ClickUpClient;
    const resolved = await resolveFieldArgs(client, "l1", ["Scheduled at=2026-10-25 22:00"]);
    expect(resolved).toEqual([{ field: dateField, value: Date.parse("2026-10-25T15:00:00Z"), valueOptions: { time: true } }]);
    await applyFields(client, "t1", resolved);
    expect(setCustomField).toHaveBeenCalledWith("t1", "fd", Date.parse("2026-10-25T15:00:00Z"), { time: true });
  });
  it("other fields are sent without value options", async () => {
    const setCustomField = vi.fn();
    const client = { setCustomField } as unknown as ClickUpClient;
    await applyFields(client, "t1", [{ field: { id: "x", name: "N", type: "text" }, value: "a" }]);
    expect(setCustomField).toHaveBeenCalledWith("t1", "x", "a");
  });
});
```

(Import `parseDateTimeValue`, `resolveFieldArgs`, `applyFields` and `vi` at the top of the file if not there.)

- [ ] **Step 2: Run to verify they fail**

Run: `cd packages/cli && pnpm vitest run src/clickup/field-set.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** (in `field-set.ts`)

```ts
import { parseDateFlag } from "./parse-date.ts";

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2}) ([01]\d|2[0-3]):([0-5]\d)$/;

/** A date with a time for a date field: "YYYY-MM-DD HH:MM" (UTC+7) or an ISO time with an offset. A plain day is refused. */
export function parseDateTimeValue(raw: string, fieldName: string): number {
  const local = LOCAL_DATE_TIME.exec(raw.trim());
  const iso = local ? `${local[1]}-${local[2]}-${local[3]}T${local[4]}:${local[5]}:00+07:00` : raw.trim();
  let parsed;
  try {
    parsed = parseDateFlag(iso, `value for field "${fieldName}"`);
  } catch (e) {
    throw new Error(`field "${fieldName}" needs a date and a time, "YYYY-MM-DD HH:MM" (UTC+7) or 2026-10-25T22:00:00+07:00: ${(e as Error).message}`);
  }
  if (!parsed.hasTime) throw new Error(`field "${fieldName}" needs a time too: "YYYY-MM-DD HH:MM" (UTC+7)`);
  return parsed.ms;
}
```

`ResolvedField` gains `valueOptions?: { time: boolean };`. In `resolveFieldArgs`, before the `resolveValue` branch:

```ts
    } else if (field.type === "date") {
      resolved.push({ field, value: parseDateTimeValue(value, field.name), valueOptions: { time: true } });
      continue;
    } else {
```

(keep the existing `resolved.push({ field, value: resolvedValue })` for the other branches). In `applyFields`:

```ts
  for (const { field, value, valueOptions } of resolved) {
    try {
      if (valueOptions === undefined) await client.setCustomField(taskId, field.id, value);
      else await client.setCustomField(taskId, field.id, value, valueOptions);
```

Update the `--field` describe text in `update-task.ts` and `create-task.ts`: append `; a date field takes "YYYY-MM-DD HH:MM" (UTC+7)`.

- [ ] **Step 4: Run to verify they pass**

Run: `cd packages/cli && pnpm vitest run src/clickup && pnpm exec tsc --noEmit -p tsconfig.build.json`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/clickup
git commit -m "feat(dgs-601): let --field write a date and time"
```

### Task 4: The tracker reads Scheduled at

**Files:**
- Modify: `packages/cli/src/autonomous/types.ts` (`LoTask.scheduledAt`, two event kinds)
- Modify: `packages/cli/src/autonomous/tracker-clickup.ts`
- Modify: `packages/cli/src/autonomous/fake-tracker.test-util.ts`
- Test: `packages/cli/src/autonomous/tracker-clickup.test.ts`

**Interfaces:**
- Produces: `LoTask.scheduledAt: number | null | "invalid"` (ms; `null` = no value; `"invalid"` = a value that is not a positive whole number). `EventKind` gains `"schedule-move" | "schedule-move-failed"`. `FakeTracker.add()` default `scheduledAt: null`.

- [ ] **Step 1: Write the failing test** (in `tracker-clickup.test.ts`)

```ts
const scheduledAtField = (value?: unknown) => ({ id: "field-s", name: "Scheduled at", type: "date", type_config: {}, ...(value === undefined ? {} : { value }) });

it("reads Scheduled at as ms, null when empty, invalid when not a positive number", async () => {
  const mk = (id: string, v?: unknown) => task({ id, status: { status: "scheduled", type: "custom" }, custom_fields: [scheduledAtField(v)] });
  const { client } = fakeClient({ search: [mk("a", "1793000000000"), mk("b"), mk("c", ""), mk("d", "soon"), mk("e", "-5"), mk("f", 1793000000000)] });
  const got = await new ClickUpLoTracker(client, SPACE).listByStatus("scheduled");
  expect(got.map((t) => t.scheduledAt)).toEqual([1793000000000, null, null, "invalid", "invalid", 1793000000000]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/cli && pnpm vitest run src/autonomous/tracker-clickup.test.ts`
Expected: FAIL (`scheduledAt` undefined).

- [ ] **Step 3: Implement**

`types.ts`: in `LoTask` after `mode`: `scheduledAt: number | null | "invalid";   // "Scheduled at", ms`. Add the two kinds to `EventKind`.

`tracker-clickup.ts`:

```ts
/** "Scheduled at" (a date field; ClickUp sends ms as a string). */
function scheduledAt(t: ClickUpTask): number | null | "invalid" {
  const field = (t.custom_fields as unknown as Field[] | undefined)?.find((f) => f.name === "Scheduled at");
  const v = field?.value;
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : "invalid";
}
```

and `scheduledAt: scheduledAt(t),` in `toLoTask`.

`fake-tracker.test-util.ts`: default `scheduledAt: null` in `add()`.

Every other `LoTask` literal in the tests gets `scheduledAt: null` (find them with `pnpm exec tsc --noEmit -p tsconfig.build.json` and `grep -rn "mode: \"Autonomous\"" src --include=*.test.ts`).

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/cli && pnpm test && pnpm exec tsc --noEmit -p tsconfig.build.json`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/autonomous
git commit -m "feat(dgs-601): read the Scheduled at field on tickets"
```

### Task 5: The schedule-release core

**Files:**
- Create: `packages/cli/src/autonomous/schedule-release.ts`
- Test: `packages/cli/src/autonomous/schedule-release.test.ts`

**Interfaces:**
- Consumes: `Tracker` (`listByStatus`, `setStatus`, `getStatus`, `comment`), `LoTask.mode`, `LoTask.scheduledAt`, `appendEvent`, `readEvents`, `atomicWrite` from `./state.ts`, `fmtUtc7` from `./clock.ts`.
- Produces:

```ts
export interface ScheduleDeps { tracker: Tracker; dir: string; now: () => Date; dryRun: boolean }
export type ScheduleVerdict = "moved" | "would-move" | "not-due" | "no-date" | "bad-date" | "no-mode" | "failed";
export interface ScheduleLine { key: string; scheduledAtUtc7: string | null; mode: LoTask["mode"]; verdict: ScheduleVerdict; to?: "ready" | "to do"; error?: string }
export interface ScheduleResult { scheduled: number; moved: number; lines: ScheduleLine[] }
export const SCHEDULE_TEXT: { noDate: string; badDate: string; noMode: string; failed: (to: string, error: string) => string };
export const SCHEDULE_NOTES = "schedule-notes.json";
export function runScheduleRelease(d: ScheduleDeps): Promise<ScheduleResult>;
```

- [ ] **Step 1: Write the failing tests**

```ts
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeTracker } from "./fake-tracker.test-util.ts";
import { runScheduleRelease, SCHEDULE_NOTES, SCHEDULE_TEXT, type ScheduleDeps } from "./schedule-release.ts";
import { readEvents } from "./state.ts";

const NOW = new Date("2026-10-25T15:00:00.000Z");           // 22:00 UTC+7
const PAST = NOW.getTime() - 60_000;
const FUTURE = NOW.getTime() + 3600_000;

let dir: string;
let tracker: FakeTracker;
let now: Date;
const mk = (over: Partial<ScheduleDeps> = {}): ScheduleDeps => ({ tracker, dir, now: () => now, dryRun: false, ...over });
const events = () => readEvents(dir, NOW.getTime() - 86_400_000, NOW.getTime() + 86_400_000);
const sched = (id: string, over: object = {}) => tracker.add({ id, status: "scheduled", scheduledAt: PAST, mode: "Autonomous", ...over });

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "sched-rel-")); tracker = new FakeTracker(); now = NOW; });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("runScheduleRelease", () => {
  it("a due Autonomous ticket moves to ready, is read back, and one event is written", async () => {
    sched("t1");
    const r = await runScheduleRelease(mk());
    expect(tracker.tasks.get("t1")?.status).toBe("ready");
    expect(tracker.calls).toEqual(["listByStatus scheduled", "setStatus t1 ready", "getStatus t1"]);
    expect(r).toMatchObject({ scheduled: 1, moved: 1 });
    expect(events().map((e) => [e.kind, e.ticket, e.to, e.mode])).toEqual([["schedule-move", "T1", "ready", "Autonomous"]]);
    expect(events()[0].scheduledAtUtc7).toBe("2026-10-25 21:59:00");
    expect(tracker.comments).toEqual([]);
  });
  it("a due Manual ticket moves to to do", async () => {
    sched("t1", { mode: "Manual" });
    await runScheduleRelease(mk());
    expect(tracker.tasks.get("t1")?.status).toBe("to do");
  });
  it("a ticket due exactly now moves", async () => {
    sched("t1", { scheduledAt: NOW.getTime() });
    expect((await runScheduleRelease(mk())).moved).toBe(1);
  });
  it("a future ticket is left alone, with no write and no comment", async () => {
    sched("t1", { scheduledAt: FUTURE });
    const r = await runScheduleRelease(mk());
    expect(tracker.writeCalls()).toEqual([]);
    expect(r.lines).toEqual([{ key: "T1", scheduledAtUtc7: "2026-10-25 23:00:00", mode: "Autonomous", verdict: "not-due" }]);
  });
  it("only scheduled tickets are read: ready and to do tickets are never touched", async () => {
    tracker.add({ id: "r1", status: "ready", scheduledAt: PAST });
    tracker.add({ id: "d1", status: "to do", scheduledAt: PAST });
    await runScheduleRelease(mk());
    expect(tracker.writeCalls()).toEqual([]);
  });
  it("missing date, bad date and missing Mode: one comment each, not repeated on the next run", async () => {
    sched("a", { scheduledAt: null });
    sched("b", { scheduledAt: "invalid" });
    sched("c", { mode: null });
    await runScheduleRelease(mk());
    await runScheduleRelease(mk());
    expect(tracker.comments.map((c) => [c.ref, c.text])).toEqual([
      ["c", `Schedule release (2026-10-25 22:00:00 UTC+7): ${SCHEDULE_TEXT.noMode}`],
      ["a", `Schedule release (2026-10-25 22:00:00 UTC+7): ${SCHEDULE_TEXT.noDate}`],
      ["b", `Schedule release (2026-10-25 22:00:00 UTC+7): ${SCHEDULE_TEXT.badDate}`],
    ]);
    expect(tracker.calls.filter((c) => c.startsWith("setStatus"))).toEqual([]);
  });
  it("a changed reason comments again", async () => {
    const t = sched("a", { scheduledAt: null });
    await runScheduleRelease(mk());
    t.scheduledAt = "invalid";
    await runScheduleRelease(mk());
    expect(tracker.comments.map((c) => c.text.split(": ").slice(1).join(": "))).toEqual([SCHEDULE_TEXT.noDate, SCHEDULE_TEXT.badDate]);
  });
  it("a ticket that leaves scheduled loses its note, so a later problem comments again", async () => {
    const t = sched("a", { scheduledAt: null });
    await runScheduleRelease(mk());
    t.status = "refinement";
    await runScheduleRelease(mk());
    expect(JSON.parse(readFileSync(join(dir, SCHEDULE_NOTES), "utf8"))).toEqual({});
    t.status = "scheduled";
    await runScheduleRelease(mk());
    expect(tracker.comments).toHaveLength(2);
  });
  it("a wrong read-back is a failed move: event, one comment, still listed next run, retried", async () => {
    sched("t1");
    tracker.getStatus = async (id: string) => { tracker.calls.push(`getStatus ${id}`); return "scheduled"; };
    const r = await runScheduleRelease(mk());
    expect(r.lines[0]).toMatchObject({ verdict: "failed", to: "ready", error: 'status read back "scheduled", expected "ready"' });
    expect(events().map((e) => e.kind)).toEqual(["schedule-move-failed"]);
    expect(tracker.comments.map((c) => c.text)).toEqual([`Schedule release (2026-10-25 22:00:00 UTC+7): ${SCHEDULE_TEXT.failed("ready", 'status read back "scheduled", expected "ready"')}`]);
    tracker.tasks.get("t1")!.status = "scheduled";
    await runScheduleRelease(mk());
    expect(tracker.calls.filter((c) => c === "setStatus t1 ready")).toHaveLength(2);
    expect(tracker.comments).toHaveLength(1);
  });
  it("a setStatus error is a failed move and the run goes on to the next ticket", async () => {
    sched("t1", { scheduledAt: PAST - 1000 });
    sched("t2");
    let first = true;
    const orig = tracker.setStatus.bind(tracker);
    tracker.setStatus = async (id, s) => { if (first) { first = false; tracker.calls.push(`setStatus ${id} ${s}`); throw new Error("Status not found"); } return orig(id, s); };
    const r = await runScheduleRelease(mk());
    expect(r.lines.map((l) => [l.key, l.verdict])).toEqual([["T1", "failed"], ["T2", "moved"]]);
  });
  it("a comment that fails is tried again on the next run", async () => {
    sched("a", { mode: null });
    tracker.comment = async () => { throw new Error("down"); };
    await runScheduleRelease(mk());
    expect(existsSync(join(dir, SCHEDULE_NOTES)) ? JSON.parse(readFileSync(join(dir, SCHEDULE_NOTES), "utf8")) : {}).toEqual({});
  });
  it("a second run after a move does nothing (idempotent)", async () => {
    sched("t1");
    await runScheduleRelease(mk());
    tracker.calls = [];
    const r = await runScheduleRelease(mk());
    expect(r).toEqual({ scheduled: 0, moved: 0, lines: [] });
    expect(tracker.writeCalls()).toEqual([]);
  });
  it("tickets are handled in Scheduled at order, problems last", async () => {
    sched("late", { scheduledAt: PAST });
    sched("none", { scheduledAt: null });
    sched("early", { scheduledAt: PAST - 3600_000 });
    const r = await runScheduleRelease(mk());
    expect(r.lines.map((l) => l.key)).toEqual(["EARLY", "LATE", "NONE"]);
  });
  it("dry run writes nothing and says would-move", async () => {
    sched("t1");
    sched("a", { mode: null });
    const r = await runScheduleRelease(mk({ dryRun: true }));
    expect(tracker.writeCalls()).toEqual([]);
    expect(events()).toEqual([]);
    expect(existsSync(join(dir, SCHEDULE_NOTES))).toBe(false);
    expect(r.lines.map((l) => [l.key, l.verdict, l.to])).toEqual([["T1", "would-move", "ready"], ["A", "no-mode", undefined]]);
  });
  it("a tracker that cannot list throws (the job then fails and Nexus notifies)", async () => {
    tracker.listByStatus = async () => { throw new Error("401"); };
    await expect(runScheduleRelease(mk())).rejects.toThrow("401");
  });
  it("pins the texts", () => {
    expect(SCHEDULE_TEXT.noDate).toBe("Scheduled at is empty. Set it (UTC+7) and the ticket moves at that time.");
    expect(SCHEDULE_TEXT.badDate).toBe("Scheduled at is not a date. Set it again (UTC+7) and the ticket moves at that time.");
    expect(SCHEDULE_TEXT.noMode).toBe("Mode is empty. Set Autonomous (moves to ready) or Manual (moves to to do).");
    expect(SCHEDULE_TEXT.failed("ready", "x")).toBe("Could not move this ticket to ready: x. It stays in scheduled and is tried again every 5 minutes.");
  });
});
```

Note on the order test with `mode: null` (`"c"` in the comment test): problems sort after dated tickets; among problems the order is the list order. In the comment test `c` has a past date, so it comes first; `a` and `b` follow. Keep that order in the expectation as written.

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/cli && pnpm vitest run src/autonomous/schedule-release.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `schedule-release.ts`

```ts
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fmtUtc7 } from "./clock.ts";
import { appendEvent, atomicWrite } from "./state.ts";
import type { LoTask, Tracker } from "./types.ts";

export interface ScheduleDeps { tracker: Tracker; dir: string; now: () => Date; dryRun: boolean }
export type ScheduleVerdict = "moved" | "would-move" | "not-due" | "no-date" | "bad-date" | "no-mode" | "failed";
export interface ScheduleLine { key: string; scheduledAtUtc7: string | null; mode: LoTask["mode"]; verdict: ScheduleVerdict; to?: "ready" | "to do"; error?: string }
export interface ScheduleResult { scheduled: number; moved: number; lines: ScheduleLine[] }

export const SCHEDULE_NOTES = "schedule-notes.json";
export const SCHEDULE_TEXT = {
  noDate: "Scheduled at is empty. Set it (UTC+7) and the ticket moves at that time.",
  badDate: "Scheduled at is not a date. Set it again (UTC+7) and the ticket moves at that time.",
  noMode: "Mode is empty. Set Autonomous (moves to ready) or Manual (moves to to do).",
  failed: (to: string, error: string) => `Could not move this ticket to ${to}: ${error}. It stays in scheduled and is tried again every 5 minutes.`,
};

const hash = (s: string): string => createHash("sha1").update(s).digest("hex");
const keyOf = (t: LoTask): string => t.key ?? t.id;
const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 200);
const at = (t: LoTask): number => (typeof t.scheduledAt === "number" ? t.scheduledAt : Number.POSITIVE_INFINITY);

function readScheduleNotes(dir: string): Record<string, string> {
  try {
    const p = join(dir, SCHEDULE_NOTES);
    if (!existsSync(p)) return {};
    const v: unknown = JSON.parse(readFileSync(p, "utf8"));
    return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : {};
  } catch { return {}; }
}

/** Moves each scheduled ticket whose Scheduled at is past by its Mode. Throws only when the tracker cannot list. */
export async function runScheduleRelease(d: ScheduleDeps): Promise<ScheduleResult> {
  const now = d.now();
  const all = await d.tracker.listByStatus("scheduled");
  const tickets = [...all].sort((a, b) => at(a) - at(b));
  const notes = readScheduleNotes(d.dir);
  let notesChanged = false;
  // A ticket that left scheduled loses its note.
  const listed = new Set(tickets.map(keyOf));
  for (const k of Object.keys(notes)) if (!listed.has(k)) { delete notes[k]; notesChanged = true; }

  const tell = async (t: LoTask, text: string): Promise<void> => {
    if (d.dryRun) return;
    const h = hash(text);
    if (notes[keyOf(t)] === h) return;
    try {
      await d.tracker.comment(t.id, `Schedule release (${fmtUtc7(now)} UTC+7): ${text}`);
      notes[keyOf(t)] = h;
      notesChanged = true;
    } catch { /* tried again on the next run */ }
  };

  const lines: ScheduleLine[] = [];
  let moved = 0;
  for (const t of tickets) {
    const key = keyOf(t);
    const when = typeof t.scheduledAt === "number" ? fmtUtc7(new Date(t.scheduledAt)) : null;
    const line = (verdict: ScheduleVerdict, extra: Partial<ScheduleLine> = {}): void => { lines.push({ key, scheduledAtUtc7: when, mode: t.mode, verdict, ...extra }); };
    if (t.scheduledAt === null) { await tell(t, SCHEDULE_TEXT.noDate); line("no-date"); continue; }
    if (t.scheduledAt === "invalid") { await tell(t, SCHEDULE_TEXT.badDate); line("bad-date"); continue; }
    if (t.mode === null) { await tell(t, SCHEDULE_TEXT.noMode); line("no-mode"); continue; }
    if (t.scheduledAt > now.getTime()) { line("not-due"); continue; }
    const to = t.mode === "Autonomous" ? "ready" : "to do";
    if (d.dryRun) { line("would-move", { to }); continue; }
    try {
      await d.tracker.setStatus(t.id, to);
      const back = await d.tracker.getStatus(t.id);
      if (back.toLowerCase() !== to) throw new Error(`status read back "${back}", expected "${to}"`);
      appendEvent(d.dir, now, "schedule-move", { ticket: key, to, mode: t.mode, scheduledAtUtc7: when });
      if (notes[key] !== undefined) { delete notes[key]; notesChanged = true; }
      moved++;
      line("moved", { to });
    } catch (e) {
      const error = errText(e);
      appendEvent(d.dir, now, "schedule-move-failed", { ticket: key, to, error });
      await tell(t, SCHEDULE_TEXT.failed(to, error));
      line("failed", { to, error });
    }
  }
  if (!d.dryRun && notesChanged) atomicWrite(d.dir, SCHEDULE_NOTES, `${JSON.stringify(notes, null, 2)}\n`);
  return { scheduled: tickets.length, moved, lines };
}
```

Two details the tests pin: the dry run never writes the notes file (the "left scheduled" cleanup is skipped too, because `atomicWrite` is behind `!d.dryRun`); a comment that throws leaves no note, so the next run tries again.

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/cli && pnpm vitest run src/autonomous/schedule-release.test.ts`
Expected: PASS. The read-back test replaces `getStatus` itself; do not change the fake for it.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/autonomous/schedule-release.ts packages/cli/src/autonomous/schedule-release.test.ts
git commit -m "feat(dgs-601): add the schedule-release core"
```

### Task 6: `dg autonomous schedule-release`

**Files:**
- Modify: `packages/cli/src/autonomous/index.ts` (new subcommand)
- Test: `packages/cli/src/autonomous/index.test.ts`

**Interfaces:**
- Consumes: `runScheduleRelease`, `AutonomousDeps` (`tracker`, `dir`, `now`), `lazyTracker`, `guarded`.
- Produces: `dg autonomous schedule-release [--dry-run]`. Output: first line `schedule-release: <scheduled> scheduled, <moved> moved` (dry run: `schedule-release (dry run, nothing written): <scheduled> scheduled`), then one line per ticket `<KEY>  <scheduledAtUtc7 or ->  <mode or ->  <verdict>[ -> <to>][: <error>]`. Exit 0 when the run finished; exit 1 when the tracker cannot list (through `guarded`).

- [ ] **Step 1: Write the failing tests** (in `index.test.ts`, with its `parse`, `deps`, `tracker`, `out()` helpers)

```ts
describe("schedule-release", () => {
  it("moves a due ticket and prints one line for it", async () => {
    tracker.add({ id: "t1", status: "scheduled", scheduledAt: DAY.getTime() - 60_000, mode: "Manual" });
    await parse(["autonomous", "schedule-release"]);
    expect(tracker.tasks.get("t1")?.status).toBe("to do");
    expect(out()).toContain("schedule-release: 1 scheduled, 1 moved");
    expect(out()).toMatch(/T1\s+2026-10-21 09:59:00\s+Manual\s+moved -> to do/);
    expect(process.exitCode).toBe(0);
  });
  it("--dry-run writes nothing", async () => {
    tracker.add({ id: "t1", status: "scheduled", scheduledAt: DAY.getTime() - 60_000, mode: "Autonomous" });
    await parse(["autonomous", "schedule-release", "--dry-run"]);
    expect(tracker.tasks.get("t1")?.status).toBe("scheduled");
    expect(out()).toContain("schedule-release (dry run, nothing written): 1 scheduled");
    expect(out()).toMatch(/T1\s+.*would-move -> ready/);
  });
  it("a tracker that cannot list exits 1", async () => {
    tracker.listByStatus = async () => { throw new Error("401"); };
    await parse(["autonomous", "schedule-release"]);
    expect(errLog.mock.calls.flat().join("\n")).toContain("autonomous: 401");
    expect(process.exitCode).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd packages/cli && pnpm vitest run src/autonomous/index.test.ts`
Expected: FAIL (unknown command under `.strict()`).

- [ ] **Step 3: Implement** (in `createAutonomousCommand`, after the `scan` command)

```ts
        .command({
          command: "schedule-release",
          describe: "move each scheduled ticket whose Scheduled at is past to ready (Mode Autonomous) or to do (Mode Manual); any hour",
          builder: (e) => e.option("dry-run", { type: "boolean", default: false, describe: "print the verdict for each scheduled ticket, write nothing" }),
          handler: (argv) =>
            guarded(depsFactory, async (d) => {
              const dryRun = argv.dryRun as boolean;
              const r = await runScheduleRelease({ tracker: lazyTracker(d.tracker), dir: d.dir, now: d.now, dryRun });
              const lines = [dryRun ? `schedule-release (dry run, nothing written): ${r.scheduled} scheduled` : `schedule-release: ${r.scheduled} scheduled, ${r.moved} moved`];
              const w = Math.max(6, ...r.lines.map((l) => l.key.length));
              for (const l of r.lines) {
                lines.push(`${l.key.padEnd(w)}  ${(l.scheduledAtUtc7 ?? "-").padEnd(19)}  ${(l.mode ?? "-").padEnd(10)}  ${l.verdict}${l.to ? ` -> ${l.to}` : ""}${l.error ? `: ${l.error}` : ""}`);
              }
              return lines;
            }),
        })
```

Import `runScheduleRelease` from `./schedule-release.ts`. Also change the parent `describe` text to `"Autonomous Operation: scan ready and claim one ticket, release scheduled tickets, the away switch, release, report, status"`.

- [ ] **Step 4: Run to verify they pass**

Run: `cd packages/cli && pnpm vitest run src/autonomous/index.test.ts && node --experimental-strip-types src/index.ts autonomous schedule-release --help`
Expected: PASS; the help prints.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/autonomous/index.ts packages/cli/src/autonomous/index.test.ts
git commit -m "feat(dgs-601): add dg autonomous schedule-release"
```

### Task 7: The Nexus job

**Files:**
- Modify: `scripts/nexus-api/src/scheduler/registry.ts` (`JOBS`)
- Test: `scripts/nexus-api/src/scheduler/registry.test.ts`

**Interfaces:**
- Consumes: the command of Task 6 through the main checkout's built CLI (`DG`).
- Produces: job `schedule-release` (spec section 7).

- [ ] **Step 1: Write the failing tests**

Change the names test at line 80 to:

```ts
    expect(JOBS.map((j) => j.name)).toEqual(['selftest', 'autonomous-scan', 'autonomous-report', 'nightwatch-watchdog', 'schedule-release'])
```

Add:

```ts
  it('schedule-release runs the built CLI every 5 minutes all day, skips missed slots, before the scan', () => {
    const job = JOBS.find((j) => j.name === 'schedule-release')!
    expect(job.schedule).toEqual({ atUtc7: '00:00', windowEndUtc7: '23:59', everyMinutes: 5 })
    expect(job.command.file).toBe(process.execPath)
    expect(job.command.args.slice(1)).toEqual(['autonomous', 'schedule-release'])
    expect(job.command.args[0]).toBe(JOBS.find((j) => j.name === 'autonomous-scan')!.command.args[0])
    expect(job).toMatchObject({ timeoutMs: 2 * 60 * 1000, catchUp: 'skip', order: 45, notify: 'failures', manualOutsideWindow: 'allowed' })
    expect(job.order).toBeLessThan(JOBS.find((j) => j.name === 'autonomous-scan')!.order)
    expect(job.description).toBe('Scheduling: move each scheduled ticket whose Scheduled at is past to ready (Mode Autonomous) or to do (Mode Manual). No model tokens.')
  })
```

- [ ] **Step 2: Run to verify they fail**

Run (repo root): `pnpm vitest run scripts/nexus-api/src/scheduler/registry.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** (append to `JOBS`)

```ts
  defineJob({
    name: 'schedule-release',
    description: 'Scheduling: move each scheduled ticket whose Scheduled at is past to ready (Mode Autonomous) or to do (Mode Manual). No model tokens.',
    schedule: { atUtc7: '00:00', windowEndUtc7: '23:59', everyMinutes: 5 },
    command: { file: process.execPath, args: [...DG, 'autonomous', 'schedule-release'] },
    timeoutMs: 2 * 60 * 1000, catchUp: 'skip', order: 45, notify: 'failures', manualOutsideWindow: 'allowed',
  }),
```

- [ ] **Step 4: Run to verify they pass**

Run (repo root): `pnpm vitest run scripts/nexus-api/src/scheduler`
Expected: PASS (registry, engine and routes tests; the engine tests must not depend on the job count; if one does, update its expected list only).

- [ ] **Step 5: Commit**

```bash
git add scripts/nexus-api/src/scheduler
git commit -m "feat(dgs-601): run schedule-release in Nexus every 5 minutes"
```

### Task 8: `dg clickup create-view`

**Files:**
- Create: `packages/cli/src/clickup/create-view.ts`
- Modify: `packages/cli/src/clickup/index.ts` (register)
- Test: `packages/cli/src/clickup/create-view.test.ts`

**Interfaces:**
- Consumes: `getSpaceViews`, `createSpaceView`, `ClickUpViewCreateBody` (Task 1); `createClient` from `./lib.ts` (the public client factory the other public commands use; read `lib.ts` for its exact name).
- Produces: `dg clickup create-view --space <id> --name <name> --status <status> --sort-field-id <field id> [--column-field-id <field id> ...] [--yes]`. Field ids, not names: the setup takes them from `setup.md` of DGS-600 and the output of Task 2's field creation. This replaces the spec's `--sort-field <field name>` (a name needs a field read per list; the ids are known at setup time). `buildViewBody(name, status, sortFieldId, columnFieldIds): ClickUpViewCreateBody` exported.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import type { ClickUpClient } from "@digismith/clickup-client";
import { buildViewBody, createCreateViewCommand } from "./create-view.ts";

const fake = (views: { id: string; name: string; type: string }[] = []) => ({
  getSpaceViews: vi.fn().mockResolvedValue(views),
  createSpaceView: vi.fn().mockResolvedValue({ id: "v9", name: "Schedule", type: "list" }),
});
const run = (client: unknown, argv: object) =>
  (createCreateViewCommand(() => client as ClickUpClient).handler as (a: object) => Promise<void>)({ yes: false, "column-field-id": [], columnFieldId: [], ...argv });
const base = { space: "1301150000001271", name: "Schedule", status: "scheduled", sortFieldId: "fs" , columnFieldId: ["fs", "fm"] };

describe("create-view", () => {
  afterEach(() => { process.exitCode = 0; vi.restoreAllMocks(); });

  it("buildViewBody: a list view filtered on the status, sorted by the field, the columns shown", () => {
    expect(buildViewBody("Schedule", "scheduled", "fs", ["fs", "fm"])).toEqual({
      name: "Schedule", type: "list",
      filters: { op: "AND", fields: [{ field: "status", op: "EQ", values: ["scheduled"] }], search: "", show_closed: false },
      sorting: { fields: [{ field: "cf_fs", dir: 1 }] },
      columns: { fields: [{ field: "cf_fs", hidden: false }, { field: "cf_fm", hidden: false }] },
    });
  });
  it("dry run prints the call and sends nothing", async () => {
    const client = fake();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, base);
    const out = log.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(out).toContain("POST /space/1301150000001271/view");
    expect(out).toContain("nothing sent");
    expect(client.createSpaceView).not.toHaveBeenCalled();
  });
  it("--yes creates the view and reads the views back", async () => {
    const client = fake();
    client.getSpaceViews.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "v9", name: "Schedule", type: "list" }]);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, { ...base, yes: true });
    expect(client.createSpaceView).toHaveBeenCalledWith("1301150000001271", buildViewBody("Schedule", "scheduled", "fs", ["fs", "fm"]));
    expect(log.mock.calls.map((c) => c.join(" ")).join("\n")).toContain("view v9 (list) \"Schedule\", read back");
  });
  it("a view of that name already in the space is refused, before any write", async () => {
    const client = fake([{ id: "v1", name: "schedule", type: "list" }]);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(client, { ...base, yes: true });
    expect(client.createSpaceView).not.toHaveBeenCalled();
    expect(err.mock.calls[0][0]).toBe('clickup create-view: the space already has a view named "schedule" (v1); nothing sent');
    expect(process.exitCode).toBe(1);
  });
  it("a view missing on read-back is an error", async () => {
    const client = fake();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client, { ...base, yes: true });
    expect(err.mock.calls[0][0]).toBe("clickup create-view: view v9 was created but is not in the space's views on read-back");
    expect(process.exitCode).toBe(1);
  });
  it("refuses a non-numeric space and an empty name", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(fake(), { ...base, space: "abc" });
    await run(fake(), { ...base, name: " " });
    expect(err.mock.calls.map((c) => c[0])).toEqual(["clickup create-view: --space must be a numeric id", "clickup create-view: --name must not be empty"]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd packages/cli && pnpm vitest run src/clickup/create-view.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `create-view.ts`

```ts
import type { CommandModule } from "yargs";
import type { ClickUpClient, ClickUpViewCreateBody } from "@digismith/clickup-client";
import { createClient } from "./lib.ts";
import { printCall } from "./task-type-write.ts";

export function buildViewBody(name: string, status: string, sortFieldId: string, columnFieldIds: string[]): ClickUpViewCreateBody {
  return {
    name,
    type: "list",
    filters: { op: "AND", fields: [{ field: "status", op: "EQ", values: [status] }], search: "", show_closed: false },
    sorting: { fields: [{ field: `cf_${sortFieldId}`, dir: 1 }] },
    columns: { fields: columnFieldIds.map((id) => ({ field: `cf_${id}`, hidden: false as const })) },
  };
}

export function createCreateViewCommand(clientFactory: () => ClickUpClient = createClient): CommandModule {
  return {
    command: "create-view",
    describe: "create a list view at a space, filtered on one status and sorted by one custom field (public API); a dry run unless --yes",
    builder: (y) =>
      y
        .option("space", { type: "string", requiresArg: true, demandOption: true, describe: "space id" })
        .option("name", { type: "string", requiresArg: true, demandOption: true, describe: "view name" })
        .option("status", { type: "string", requiresArg: true, demandOption: true, describe: "show only tasks in this status" })
        .option("sort-field-id", { type: "string", requiresArg: true, demandOption: true, describe: "custom field id to sort by, ascending" })
        .option("column-field-id", { type: "string", array: true, requiresArg: true, default: [], describe: "custom field id to show as a column; repeat for more" })
        .option("yes", { type: "boolean", default: false, describe: "send the call (without it, only print it)" }),
    handler: async (argv) => {
      try {
        const space = argv.space as string;
        if (!/^\d+$/.test(space)) throw new Error("--space must be a numeric id");
        const name = ((argv.name as string) ?? "").trim();
        if (name === "") throw new Error("--name must not be empty");
        const body = buildViewBody(name, (argv.status as string).trim(), argv.sortFieldId as string, (argv.columnFieldId as string[]) ?? []);
        const client = clientFactory();
        const clash = (await client.getSpaceViews(space)).find((v) => v.name.trim().toLowerCase() === name.toLowerCase());
        if (clash) throw new Error(`the space already has a view named "${clash.name}" (${clash.id}); nothing sent`);
        if (!argv.yes) {
          printCall("POST", `/space/${space}/view`, body);
          console.log("nothing sent; add --yes to send");
        } else {
          const view = await client.createSpaceView(space, body);
          const back = (await client.getSpaceViews(space)).some((v) => v.id === view.id);
          if (!back) throw new Error(`view ${view.id} was created but is not in the space's views on read-back`);
          console.log(`view ${view.id} (${view.type}) ${JSON.stringify(view.name)}, read back`);
        }
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup create-view: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const createViewCommand: CommandModule = createCreateViewCommand();
```

(If `lib.ts` names the public client factory differently, use that name; check how `create-folder.ts` builds its client.) Register `.command(createViewCommand)` in `clickup/index.ts` after `createFieldCommand`.

- [ ] **Step 4: Run to verify they pass**

Run: `cd packages/cli && pnpm vitest run src/clickup/create-view.test.ts src/clickup/lib.test.ts && pnpm exec tsc --noEmit -p tsconfig.build.json`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/clickup/create-view.ts packages/cli/src/clickup/create-view.test.ts packages/cli/src/clickup/index.ts
git commit -m "feat(dgs-601): add dg clickup create-view"
```

### Task 9: Whole-suite check and the post-merge setup

Part A runs on the branch. Part B runs only after the merge to `main`, the push and the build of the main checkout's CLI (the Nexus job and the global `dg` run `packages/cli/dist` of the main checkout), and only with the conductor's go. Part B writes to ClickUp through `dg`, each with a dry run first.

**Files:**
- Modify (Part B): `.digismith/board/DGS-600—ready-scheduled-starters/setup.md` (append a "DGS-601" section)

**Interfaces:**
- Consumes: from DGS-600's `setup.md`: the Mode field id and the location list.

- [ ] **Step A1: Whole suites**

Run: `cd packages/clickup-client && pnpm test`; `cd packages/cli && pnpm test && pnpm exec tsc --noEmit -p tsconfig.build.json`; (repo root) `pnpm vitest run scripts/nexus-api`.
Expected: all PASS.

- [ ] **Step A2: Strip-types smoke**

Run: `cd packages/cli && node --experimental-strip-types src/index.ts autonomous schedule-release --help && node --experimental-strip-types src/index.ts clickup create-view --help`
Expected: both print help.

- [ ] **Step B1: Scheduled at field** (after merge; conductor's go)

```bash
dg clickup create-field --type date --name 'Scheduled at' --description 'When a scheduled ticket starts (UTC+7). Then schedule-release moves it by its Mode.' --location <each location from DGS-600 setup.md>
```

Check the dry run, then add `--yes`. One try only. A 4xx: stop, write it in `setup.md`, and tell the conductor that Jack needs to make one capture (any date field, created in the ClickUp web app with Proxyman on). Do not try other bodies. On success note the field id in `setup.md` and check `dg clickup get-field <id>` shows `type date` and the same location count.

- [ ] **Step B2: Schedule view**

```bash
dg clickup create-view --space 1301150000001271 --name Schedule --status scheduled --sort-field-id <Scheduled at id> --column-field-id <Scheduled at id> --column-field-id <Mode id>
```

Dry run, then `--yes`. Note the view id in `setup.md`. The view must open in the ClickUp web app with the filter `status is scheduled`; that look is checked by Jack, not by the worker.

- [ ] **Step B3: Nexus picks up the job**

Restart the installed Nexus service (an allowed restart of an already-installed service; no new LaunchAgent, no sudo):

```bash
launchctl kickstart -k "gui/$(id -u)/com.jazurite.digismith.nexus-api"
```

Then check that the Nexus jobs list (`GET /api/v1/jobs`, read with the same token file the autonomous commands use, or the Nightwatch web Operations page) lists `schedule-release` with a next run time within 5 minutes. A classifier block on the restart: stop and tell the conductor; do not reroute.

- [ ] **Step B4: First run, read only**

```bash
dg autonomous schedule-release --dry-run
```

Expected: `schedule-release (dry run, nothing written): 0 scheduled` (no ticket is scheduled yet), or one line per scheduled ticket. Write the output in `setup.md`. No ticket is scheduled by the worker; Jack schedules the first one himself.

- [ ] **Step B5: Commit the setup log**

```bash
git add ".digismith/board/DGS-600—ready-scheduled-starters/setup.md"
git commit -m "docs(dgs-601): add the setup log"
```
