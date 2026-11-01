# DGS-683 ticket 5: plan extract (only this ticket's tasks)

Source: `plan.md` of this folder (approved 2026-11-01). Read also its 'Global Constraints' and 'Shared facts'. Task numbers are the plan's own.

## Ticket C: ticket conductor

### Task 17: driver records

**Files:**
- Create: `packages/cli/src/conductor/drivers.ts`, `packages/cli/src/conductor/drivers.test.ts`

**Interfaces (exact):**
```ts
export interface Driver { ticket: string; driver: string; since: string; mode: "attended" | "factory" }
export function driversDir(env?: NodeJS.ProcessEnv): string;                         // <depot>/drivers
export function readDriver(ticket: string, env?: NodeJS.ProcessEnv): Driver | null;
export function claimDriver(d: Omit<Driver, "since"> & { since?: string }, env?: NodeJS.ProcessEnv): Driver;  // throws DriverTaken
export function handoverDriver(ticket: string, from: string, to: string, env?: NodeJS.ProcessEnv): Driver;     // atomic rename; throws when current driver != from
export function releaseDriver(ticket: string, driver: string, env?: NodeJS.ProcessEnv): boolean;             // only the driver may release
export class DriverTaken extends Error { constructor(public ticket: string, public driver: string) }
```
Ticket must match `^[A-Z]+-\d+$` (else throws). `claimDriver` uses `fs.writeFileSync(path, json, { flag: "wx" })`. `since` default = now in `+07:00` ISO.

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { DriverTaken, claimDriver, handoverDriver, readDriver, releaseDriver } from "./drivers.ts";

let depot: string; let env: NodeJS.ProcessEnv;
beforeEach(() => { depot = fs.mkdtempSync(path.join(os.tmpdir(), "drv-")); env = { DIGISMITH_DEPOT_DIR: depot }; });
afterEach(() => fs.rmSync(depot, { recursive: true, force: true }));

describe("drivers", () => {
  it("the first claim wins, the second throws DriverTaken naming the driver", () => {
    claimDriver({ ticket: "DGS-9", driver: "digismith-conductor", mode: "attended" }, env);
    expect(() => claimDriver({ ticket: "DGS-9", driver: "factory", mode: "factory" }, env)).toThrow(DriverTaken);
    expect(readDriver("DGS-9", env)?.driver).toBe("digismith-conductor");
  });
  it("handover changes the driver only from the named one", () => {
    claimDriver({ ticket: "DGS-9", driver: "factory", mode: "factory" }, env);
    expect(() => handoverDriver("DGS-9", "other", "tc-dgs-9", env)).toThrow(/driver is factory/);
    expect(handoverDriver("DGS-9", "factory", "tc-dgs-9", env).driver).toBe("tc-dgs-9");
  });
  it("release removes the file only for the driver", () => {
    claimDriver({ ticket: "DGS-9", driver: "tc-dgs-9", mode: "factory" }, env);
    expect(releaseDriver("DGS-9", "someone", env)).toBe(false);
    expect(releaseDriver("DGS-9", "tc-dgs-9", env)).toBe(true);
    expect(readDriver("DGS-9", env)).toBeNull();
  });
  it("refuses a bad ticket key", () => {
    expect(() => claimDriver({ ticket: "../x", driver: "a", mode: "attended" }, env)).toThrow(/ticket/);
  });
});
```
- [ ] **Step 2: Run, expect FAIL.** `pnpm vitest run packages/cli/src/conductor/drivers.test.ts`
- [ ] **Step 3: Implement** (`mkdirSync(dir, {recursive:true})`, JSON with two-space indent, `renameSync` for handover).
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit.** `git commit packages/cli/src/conductor -m "feat(dgs-683): add driver records, one driver per ticket"`

### Task 18: `start-ticket`

**Files:** Create `packages/cli/src/conductor/start-ticket.ts`, `start-ticket.test.ts`.

**Interfaces:**
```ts
export interface StartDeps { exec: Exec; now?: () => Date; env?: NodeJS.ProcessEnv; writeFile?: typeof fs.writeFileSync }
export interface StartArgs { ticket: string; under: string; project: string }
export async function startTicketConductor(a: StartArgs, d: StartDeps): Promise<{ key: string; pane: string; name: string }>;
```
`Exec` is the type from `../autonomous/conductor.ts` (import type only: reading a type from a protected file is fine). Steps (spec 6.2): resolve the starter's entry (`resolveConductor(`${project}/${under}`)`: must exist, session `Suite`); `claimDriver({ticket, driver: "tc-<ticket lower>", mode})` (mode `factory` when the starter has kind factory, else `attended`); on `DriverTaken` throw `Error("DGS-9 already has a driver: <name>")`; write the registry entry `Project/tc-dgs-9` with `{session:"Suite", workspace: starter.workspace, floor: starter.floor, kind:"ticket", ticket, under, status:"open"}`; write `<repo>/.digismith/sessions/tc-dgs-9/brief.md` from a template string in the file (ticket key, "drive Builder -> Reviewer -> merge for this one ticket, close with `dg conductor close --self`, own workers first, log is automatic"); run, through `exec` on the `herdr-ws` binary with env `HERDR_SCOPE` (starter's scope) and `HERDR_WS`: `["--session","Suite","tab","create","--workspace",ws,"--label","tc-dgs-9","--cwd",cwd]`, then `["--session","Suite","agent","start","tc-dgs-9","--pane",pane, "--", ...flags]`, then `["--session","Suite","agent","prompt","tc-dgs-9","Read .digismith/sessions/tc-dgs-9/brief.md and follow it."]`. If any herdr call fails: release the driver and remove the registry entry, rethrow. The cap (2 open ticket conductors, spec 13.4): refuse when `findByKind("ticket")` already has 2 open entries.

- [ ] **Step 1: Write the failing tests** with a fake `exec` recording calls and a temp depot and repo: happy path (driver file, registry entry, brief file, three herdr calls in order, each starting with `--session Suite`); second start for the same ticket -> error mentions the driver and no herdr call; failed `tab create` -> driver file and registry entry gone; third open ticket conductor -> refused with "limit"; starter in session `default` -> refused ("not in Suite").
- [ ] **Step 2: Run, expect FAIL.** `pnpm vitest run packages/cli/src/conductor/start-ticket.test.ts`
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit.** `git commit packages/cli/src/conductor -m "feat(dgs-683): start a ticket conductor"`

### Task 19: `close`, `handover`, `sweep`

**Files:** Create `packages/cli/src/conductor/close.ts`, `sweep.ts` and their tests.

**Interfaces:**
```ts
export async function closeTicketConductor(a: { name: string; project: string }, d: StartDeps): Promise<void>;   // dg conductor close --self
export function handover(a: { ticket: string; from: string; to: string }, env?: NodeJS.ProcessEnv): Driver;
export function sweepTickets(env: NodeJS.ProcessEnv, live: (session: string) => string[]): { key: string; ticket?: string; verdict: "running" | "gone" }[];
```
`closeTicketConductor`: needs the entry `Project/<name>` with kind ticket; `releaseDriver(ticket, name)`; `removeEntry`; then through herdr-ws `["--session","Suite","tab","close", <own tab id>]` (own tab id from `HERDR_TAB_ID` env; refuse when unset). Order: release and remove first, tab close last (a failed close leaves a clean registry). `sweepTickets` lists registry entries of kind ticket and says `gone` when the name is not in `live("Suite")`.

- [ ] **Step 1: Write the failing tests:** close removes driver and entry and then calls `tab close` with the env tab id; close for a non-ticket entry is refused; close by a name that is not the driver releases nothing and throws; `sweepTickets` marks a vanished one `gone`; `handover` delegates to `handoverDriver`.
- [ ] **Step 2: Run, expect FAIL.** `pnpm vitest run packages/cli/src/conductor`
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit.** `git commit packages/cli/src/conductor -m "feat(dgs-683): close and sweep ticket conductors"`

### Task 20: the `dg conductor` command

**Files:** Create `packages/cli/src/conductor/index.ts`, `index.test.ts`; Modify `packages/cli/src/index.ts:36-47` (add `.command(conductorCommand)`), `packages/cli/README.md` (one section).

**Interfaces:** yargs command module in the style of `packages/cli/src/run/index.ts`: `dg conductor start-ticket --ticket KEY --under NAME [--project P]`, `dg conductor close --self`, `dg conductor handover --ticket KEY --from A --to B`, `dg conductor sweep`. Project default = `process.env.DIGISMITH_PROJECT ?? "DigiSmith"`. Exit code 1 plus one stderr line on any thrown error.

- [ ] **Step 1: Write the failing test:** `main`-style invocation with injected deps for each subcommand (same pattern as `run/index.test.ts`): argument errors print usage and exit 1; `sweep` prints one line per entry.
- [ ] **Step 2: Run, expect FAIL.** `pnpm vitest run packages/cli/src/conductor/index.test.ts`
- [ ] **Step 3: Implement and register.**
- [ ] **Step 4: Run, expect PASS**, then `pnpm vitest run packages/cli/src/conductor packages/cli/src/index.test.ts packages/cli/src/strip-types.smoke.test.ts`.
- [ ] **Step 5: Commit.** `git commit packages/cli/src/conductor packages/cli/src/index.ts packages/cli/README.md -m "feat(dgs-683): add the dg conductor command"`

### Task 21: `dg run start` refuses a second driver

**Files:** Modify `packages/cli/src/run/index.ts` (the `start` handler) or `limit-check.ts` where start-time refusals live (read both first; put the check beside the existing limit check); Test: `packages/cli/src/run/index.test.ts`.

**Interfaces:** for a run with `--role builder|reviewer` and `--ticket KEY`: `readDriver(KEY)`; when a driver exists and its name differs from `process.env.DIGISMITH_NAME` (the starter), refuse with `DGS-9 is driven by tc-dgs-9 (since ...): ask that conductor`; no driver file -> the run starts as today and the starter is NOT auto-claimed here (the conductor claims through `start-ticket` or the factory claim).

- [ ] **Step 1: Write the failing tests:** driver present and same name -> start allowed; driver present, other name -> refused, exit code 1; no driver -> unchanged; role `other` (Scout/Researcher) -> not checked.
- [ ] **Step 2: Run, expect FAIL.** `pnpm vitest run packages/cli/src/run/index.test.ts`
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS**, then `pnpm vitest run packages/cli/src/run`.
- [ ] **Step 5: Commit.** `git commit packages/cli/src/run -m "feat(dgs-683): refuse a run on a ticket another conductor drives"`

---

