# Spec: the factory reads both ClickUp spaces (OCL-105)

**Ticket:** OCL-105 (task id `14zcebrypxm`), Oculus space `1301150000003197`
**Date:** 2026-11-14
**Sign-off:** Auto (the Dock approves spec, plan and merge)

## Goal

The autonomous scan, the Steward and the Director read two ClickUp spaces: DigiSmith (`DGS`, `1301150000001271`) and Oculus (`OCL`, `1301150000003197`). A key resolves to its space by prefix. Every tool that takes a ticket key accepts an OCL key. The Oculus space gets the `Mode` and `Sign-off` fields through `dg`.

Done when: a test ticket in the Oculus space, in `to do`, Mode Autonomous, is claimed by the scan, built, and its statuses are written back in the Oculus space.

## What the code does today (read 2026-11-14, base cc3bad02)

Most key handling is already prefix-agnostic. Verified by reading:

| Part | State |
|---|---|
| `ClickUpClient.getTaskByRef` (`CUSTOM_ID = /^[A-Za-z]+-\d+$/`, `custom_task_ids` + team id) | Works for OCL keys. `dg clickup get-task OCL-105` works today. |
| `board-path.ts` (`KEY_PATTERN`), `phase-types.ts` (`TICKET_RE`), `scan.ts` driver claim, `director/target.ts` | Generic key pattern. No change. |
| Steward `getTicket/setStatus/addComment` (by key) | Key-agnostic. Hence the first Steward call for OCL-105 needs a test, not a guess (see D6). |

What blocks an OCL ticket (the findings this build fixes):

1. **F1: one space id.** `DIGISMITH_SPACE_ID` is passed to `ClickUpLoTracker` (`autonomous/index.ts:62`, `director/command.ts:250`) and `ClickUpTracker` (`steward/index.ts:18`). `searchTeamTasks(spaceId)` returns DigiSmith tickets only, so a moved ticket in `to do` is never listed. `hasStatus` reads the lists of that space only.
2. **F2: `^DGS-\d+$` key checks** in `clickup/attach-record.ts:13`, `ticket-total.ts:12`, `merge-comment.ts:14`, `task-stamp.ts:31`, `scripts/conductor/ticket-status.ts:8`, `scripts/conductor/markers.ts:24`. These refuse an OCL key (the merge write-back, the attach, the token stamp, the conductor note).
3. **F3: DGS-only key greps** in `scripts/conductor/refresh.ts:125,190,196` (merged log, worker rows): an OCL worker shows as `-`.
4. **F4: no `Mode` or `Sign-off` field in the Oculus space.** Verified: `dg clickup list-fields --list 1301150000006382` (Product > Backlog) lists neither. In the DigiSmith space both are scoped to the space (location type 4). Without them, `dropdown()` returns null: Mode empty reads as Autonomous (a claim is allowed), Sign-off empty reads as Auto. The scan would claim, but a Manual or Jack ticket in Oculus cannot be marked. So the fields are required before the first real use.
5. **F5: `create-field` cannot make the pair repeatably.** `dg clickup create-field --location 4:<space>` exists, but options and order are typed by hand each time. A typo gives a field the scan reads as null.

## Design

### D1. One place knows the spaces: `clickup/spaces.ts` (new)

```ts
export const SPACES = [
  { prefix: "DGS", id: "1301150000001271", name: "DigiSmith" },
  { prefix: "OCL", id: "1301150000003197", name: "Oculus" },
] as const;
export const DIGISMITH_SPACE_ID  // stays exported (lib.ts re-exports), value unchanged
export const ALL_SPACE_IDS: string[]
export function spaceForKey(key: string): Space entry   // by prefix; unknown prefix throws, naming the known prefixes
export function isTicketKey(key: string): boolean       // a known prefix + digits
```

Reason: the prefix list lives in one file; a third space is one array entry. No env var, no config file: a space id is a constant like today's.

### D2. A tracker reads a list of spaces

`ClickUpLoTracker` and `ClickUpTracker` take `spaceIds: string[]` (the constructor accepts a string for old callers and wraps it). Their space reads run per space and merge:

- `listByStatus`: `searchTeamTasks` per space, concatenated (ClickUp's `space_ids[]` takes several, but one call per space keeps the 100-per-page paging and the failure scope per space).
- `hasStatus`: any list in any space has the status (a space with no `to do` does not block the other).
- `loadLists`, `listTargets`, `findCandidates` (Steward): merged over the spaces.
- A failed read of one space throws, as today. The scan already treats a tracker error as "scan failed this tick, retry". No partial scan: a silent half-read would hide tickets.
- Wiring: `autonomous/index.ts`, `director/command.ts`, `steward/index.ts` pass `ALL_SPACE_IDS`.

`setStatus/getStatus/comment` already work by key or id: unchanged.

### D3. Key checks use `isTicketKey`

The six `^DGS-\d+$` checks in F2 call `isTicketKey` (TS) or the same prefix set (the two `scripts/conductor` files import it). `refresh.ts` regexes become `/\b(DGS|OCL)-\d+/i` built from `SPACES`. Error text names the accepted prefixes.

### D4. Mode and Sign-off for the Oculus space: `dg clickup create-factory-fields` (new)

```
dg clickup create-factory-fields --space <id> [--yes]
```

- Reads the fields of every list in the space; for each of `Mode` (Autonomous, Manual) and `Sign-off` (Auto, Jack) that is missing, plans a `create-field` at location `4:<space id>` with the same options, order and colours as DigiSmith's (read once from the DigiSmith field, written into a constant with a test that pins it).
- Dry run unless `--yes` (same as `create-field`). Idempotent: a field that exists with the right options is skipped; one that exists with other options is an error, not a rewrite.
- Built on `create-field`'s `buildFieldCreateBody` and the Frontdoor client. No new HTTP call types.
- Tests use a mock Frontdoor client. **No live write in this build.** The conductor runs the first `--yes` after the merge, on the Dock's order.

### D5. Board folder, branch, plan, lock, claims

Already prefix-agnostic. The build adds tests that pin it with an OCL key: `board-path` (`path`, `find`, `parse`), the claim and lock files named by key, the driver record, `steward-started`. No code change unless a test fails. A failure becomes a finding and a fix in the plan.

### D6. Steward with an OCL key

The Steward reads the ticket by key, so it should work. This build proves it with a mock tracker holding OCL keys through every event (`refinement-started` ... `merged`), and reads the tracker's `statuses` for the OCL list. If a rule refuses OCL keys, it is fixed in this build. The Steward state file is keyed by ticket key (`stewardDir()/<key>`): the test pins that `OCL-105` and `DGS-105` get separate files.

### D7. Director

`director/target.ts` and `director/command.ts` only need the tracker wiring (D2). Test: a Director refine pass over a mixed list (one DGS, one OCL ticket in `refinement`) picks both.

### D8. Out of scope

- Extracting the engine into the Oculus repo (separate ticket).
- Per-space statuses or per-space config. The Oculus space shares today's status set; the scan reads the status by name.
- The monorepo chain (DGS-745, DGS-749 to DGS-757): starts after this merge.
- Moving the Imperium list or the milestone lookup. Milestones link across spaces by task id, so an OCL ticket still finds its DGS milestone.

## Protected paths this touches

The merge needs the Dock's approval (guardrails):

- `packages/cli/src/autonomous/` (`index.ts`, `tracker-clickup.ts`, `director/command.ts`)
- `packages/cli/src/steward/` (`index.ts`, `clickup-tracker.ts`)
- `scripts/nexus-api/src/scheduler/`: expected NOT touched. The plan greps it for a space id or `DGS-` check; a hit becomes a plan task.

## Tests (mocks only, temp depot through `DIGISMITH_DEPOT_DIR`)

1. `spaces.ts`: prefix resolve, unknown prefix error, case.
2. `ClickUpLoTracker` with two spaces: merge, one space failing, `hasStatus` across spaces, old single-string constructor.
3. `ClickUpTracker` (Steward): same, plus `listTargets` merge.
4. Each F2 command accepts `OCL-123` and still refuses `ABC-1` and `12`.
5. `refresh.ts` and `markers.ts` with OCL keys.
6. `create-factory-fields`: dry run prints two calls; `--yes` creates only the missing field; existing right field skipped; wrong options errors; the constant equals the DigiSmith options (pinned).
7. End to end with fakes: an OCL ticket in `to do`, Mode Autonomous, is claimed by `scan` (fake tracker holding both spaces); statuses go back through the OCL tracker.

## Taste questions for Jack

None. Technical decisions above are the Builder's, with reasons. One note for the Dock: the first live `create-factory-fields --yes` on the Oculus space is the conductor's step after the merge.

## Done check (after merge, by the conductor)

1. `dg clickup create-factory-fields --space 1301150000003197` (dry run), then `--yes`.
2. A test ticket in Product > Backlog, `to do`, Mode Autonomous.
3. One scan tick claims it; the Steward and merge write-back statuses show in the Oculus space.
