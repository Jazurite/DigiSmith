# DGS-683 ticket 1: plan extract (only this ticket's tasks)

Source: `plan.md` of this folder (approved 2026-11-01). Read also its 'Global Constraints' and 'Shared facts'. Task numbers are the plan's own.

## Ticket A1: registry and session-aware conductor scripts

### Task 1: the registry module

**Files:**
- Create: `scripts/conductor/registry.ts`
- Test: `scripts/conductor/registry.test.ts`

**Interfaces:**
- Consumes: `depotDir(env)` from `../depot-dir.ts`.
- Produces (exact):
```ts
export type Kind = "project" | "factory" | "standing" | "ticket";
export interface ConductorEntry {
  key: string;            // "Project/name"
  project: string;
  name: string;
  note?: string;
  session: string;        // "default" when absent
  workspace?: string;     // id in `session`
  floor?: string;         // Floor workspace id in "default"
  kinds: Kind[];          // ["project"] when absent
  ticket?: string;
  under?: string;
  status: "open" | "closed";
}
export function readRegistry(env?: NodeJS.ProcessEnv): Record<string, ConductorEntry>;
export function resolveConductor(key: string, env?: NodeJS.ProcessEnv): ConductorEntry | undefined;
export function findByKind(kind: Kind, env?: NodeJS.ProcessEnv): ConductorEntry[];   // status open only
export function floorWorkspaces(env?: NodeJS.ProcessEnv): string[];                  // sorted, unique
export function herdrSessionArgs(e: Pick<ConductorEntry, "session">): string[];      // ["--session", session]
export function scopeFor(e: ConductorEntry, env?: NodeJS.ProcessEnv): string;        // HERDR_SCOPE value
export function putEntry(key: string, raw: Record<string, unknown>, env?: NodeJS.ProcessEnv): void;   // atomic
export function removeEntry(key: string, env?: NodeJS.ProcessEnv): boolean;                           // atomic
```
Rules: a missing file reads as `{}`; invalid JSON throws `Error("conductors.json ... is not valid JSON: ...")`; `kind` may be a string or an array in the file; unknown `kind` values throw; a bad `session` or `workspace` string throws (regexes in Global Constraints). `floor` for an entry with `session` `default` and no `floor` is its `workspace`. `scopeFor`: if `e.session === "default"` return `default:<workspace>`; else `<session>:<workspace>` followed by one `default:<id>` per `floorWorkspaces(env)`. `putEntry`/`removeEntry` write `conductors.json.tmp-<pid>` then `renameSync`, preserving every other key and its order.

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { findByKind, floorWorkspaces, putEntry, readRegistry, removeEntry, resolveConductor, scopeFor } from "./registry.ts";

let depot: string;
let env: NodeJS.ProcessEnv;
const write = (o: unknown) => fs.writeFileSync(path.join(depot, "conductors.json"), JSON.stringify(o));
beforeEach(() => { depot = fs.mkdtempSync(path.join(os.tmpdir(), "reg-")); env = { DIGISMITH_DEPOT_DIR: depot }; });
afterEach(() => fs.rmSync(depot, { recursive: true, force: true }));

describe("registry", () => {
  it("an old entry means session default, kind project, floor = workspace", () => {
    write({ "DigiSmith/digismith-conductor": { note: "/n", workspace: "w2" } });
    expect(resolveConductor("DigiSmith/digismith-conductor", env)).toEqual({
      key: "DigiSmith/digismith-conductor", project: "DigiSmith", name: "digismith-conductor", note: "/n",
      session: "default", workspace: "w2", floor: "w2", kinds: ["project"], status: "open",
    });
  });
  it("reads the new fields and a kind array", () => {
    write({ "DigiSmith/digismith-conductor": { workspace: "w7", session: "Suite", floor: "w2", kind: ["project", "factory"] } });
    const e = resolveConductor("DigiSmith/digismith-conductor", env)!;
    expect(e.session).toBe("Suite"); expect(e.kinds).toEqual(["project", "factory"]);
    expect(findByKind("factory", env).map((x) => x.key)).toEqual(["DigiSmith/digismith-conductor"]);
  });
  it("findByKind skips a closed entry", () => {
    write({ "DigiSmith/tc-dgs-9": { kind: "ticket", ticket: "DGS-9", status: "closed", session: "Suite", workspace: "w7", floor: "w2" } });
    expect(findByKind("ticket", env)).toEqual([]);
  });
  it("floorWorkspaces is the sorted union of floors and default workspaces", () => {
    write({ "A/a": { workspace: "w3" }, "B/b": { session: "Suite", workspace: "w8", floor: "w2" }, "C/c": { session: "Suite", workspace: "w9", floor: "w3" } });
    expect(floorWorkspaces(env)).toEqual(["w2", "w3"]);
  });
  it("scopeFor: default entry = today's rule; Suite entry = own Suite workspace + every floor", () => {
    write({ "A/a": { workspace: "w3" }, "B/b": { session: "Suite", workspace: "w8", floor: "w2" } });
    expect(scopeFor(resolveConductor("A/a", env)!, env)).toBe("default:w3");
    expect(scopeFor(resolveConductor("B/b", env)!, env)).toBe("Suite:w8,default:w2,default:w3");
  });
  it("missing file is empty; broken JSON throws; bad values throw", () => {
    expect(readRegistry(env)).toEqual({});
    fs.writeFileSync(path.join(depot, "conductors.json"), "{nope");
    expect(() => readRegistry(env)).toThrow(/not valid JSON/);
    write({ "A/a": { workspace: "two" } });
    expect(() => readRegistry(env)).toThrow(/workspace/);
    write({ "A/a": { kind: "boss" } });
    expect(() => readRegistry(env)).toThrow(/kind/);
  });
  it("putEntry and removeEntry keep the other keys", () => {
    write({ "A/a": { workspace: "w3", note: "/x" } });
    putEntry("B/b", { session: "Suite", workspace: "w8", floor: "w2" }, env);
    expect(Object.keys(JSON.parse(fs.readFileSync(path.join(depot, "conductors.json"), "utf8")))).toEqual(["A/a", "B/b"]);
    expect(removeEntry("A/a", env)).toBe(true);
    expect(removeEntry("A/a", env)).toBe(false);
    expect(fs.readdirSync(depot)).toEqual(["conductors.json"]);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL.** `pnpm vitest run scripts/conductor/registry.test.ts` -> "Cannot find module ./registry.ts".
- [ ] **Step 3: Implement** `scripts/conductor/registry.ts` to the interface above (about 110 lines: `file(env) = path.join(depotDir(env), "conductors.json")`, `normalize(key, raw)` with the regexes and the kind check, `readRegistry`, the rest as specified).
- [ ] **Step 4: Run it, expect PASS** (same command).
- [ ] **Step 5: Commit.** `git commit scripts/conductor/registry.ts scripts/conductor/registry.test.ts -m "feat(dgs-683): add the conductor registry module"`

### Task 2: `parseRunsOn`, `formatRunsOn`, and the card hook

**Files:**
- Create: `scripts/session-cards/runs-on.ts`, `scripts/session-cards/runs-on.test.ts`
- Modify: `scripts/session-cards/card-hook.ts:70`
- Test: `scripts/session-cards/card-hook.test.ts` (add two cases)

**Interfaces:**
- Produces:
```ts
export interface RunsOn { session: string; workspace: string; pane: string }   // pane = "w2:p1"
export function parseRunsOn(s: string | undefined): RunsOn | null;
export function formatRunsOn(env: NodeJS.ProcessEnv): string;   // "herdr Suite/w7:p1" | "herdr w2:p1" | "workbox"
```
`formatRunsOn`: no `HERDR_PANE_ID` -> `"workbox"`. With a pane and no `HERDR_SESSION` or `HERDR_SESSION === "default"` -> `herdr <pane>` (old format, so existing stored cards and tests stay identical). With another session -> `herdr <session>/<pane>`.

- [ ] **Step 1: Write the failing test** (`runs-on.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { formatRunsOn, parseRunsOn } from "./runs-on.ts";

describe("parseRunsOn", () => {
  it.each([
    ["herdr w2:p1", { session: "default", workspace: "w2", pane: "w2:p1" }],
    ["herdr Suite/w7:p1", { session: "Suite", workspace: "w7", pane: "w7:p1" }],
    ["herdr suite-probe/w1:pK", { session: "suite-probe", workspace: "w1", pane: "w1:pK" }],
  ])("%s", (s, want) => expect(parseRunsOn(s)).toEqual(want));
  it.each(["desktop", "ssh", "workbox", "herdr", "herdr x", "", undefined])("%s is null", (s) => expect(parseRunsOn(s as string)).toBeNull());
});
describe("formatRunsOn", () => {
  it("no pane: workbox", () => expect(formatRunsOn({})).toBe("workbox"));
  it("default session (unset or named default): the old format", () => {
    expect(formatRunsOn({ HERDR_PANE_ID: "w2:p1" })).toBe("herdr w2:p1");
    expect(formatRunsOn({ HERDR_PANE_ID: "w2:p1", HERDR_SESSION: "default" })).toBe("herdr w2:p1");
  });
  it("another session carries its name", () => expect(formatRunsOn({ HERDR_PANE_ID: "w7:p1", HERDR_SESSION: "Suite" })).toBe("herdr Suite/w7:p1"));
});
```
and in `card-hook.test.ts` (same style as its existing `startHook` cases): a case that sets `HERDR_PANE_ID: "w7:p1"`, `HERDR_SESSION: "Suite"` and expects the written card `runs_on` to be `herdr Suite/w7:p1`; a case with only `HERDR_PANE_ID: "w2:p1"` expecting `herdr w2:p1`.

- [ ] **Step 2: Run, expect FAIL.** `pnpm vitest run scripts/session-cards/runs-on.test.ts scripts/session-cards/card-hook.test.ts`
- [ ] **Step 3: Implement.** `runs-on.ts` with `const RE = /^herdr (?:([A-Za-z][\w-]*)\/)?(w\d+):(\S+)$/`. In `card-hook.ts` import `formatRunsOn` and replace line 70 with `const runsOn = formatRunsOn(env);`.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit.** `git commit scripts/session-cards -m "feat(dgs-683): carry the herdr session in runs_on"`

### Task 3: the session sweep reads both sessions

**Files:**
- Modify: `scripts/session-cards/session-sweep.ts:25-29` (`readLiveSessions`), `:44`
- Test: `scripts/session-cards/session-sweep.test.ts` (add cases)

**Interfaces:**
- Consumes: `liveSessionsFromAgentList(stdout)` (exists in the file), `scopeFor` not needed.
- Produces: `readLiveSessions(env, spawn = spawnSync)` runs `herdr-ws agent list` once per session named in `env.HERDR_SCOPE` (`--session <S>` as first args; no scope: one call without `--session`, exactly today), and merges the live session ids; `ok` only when every call succeeded.

- [ ] **Step 1: Write the failing test.** Inject a fake `spawn` that records args and returns canned lists: with `HERDR_SCOPE=Suite:w7,default:w2,default:w3` expect two calls `["--session","Suite","agent","list"]` and `["--session","default","agent","list"]`, a union of session ids, and `ok:false` when one call exits 1. With no `HERDR_SCOPE` expect exactly one call `["agent","list"]`. A card whose `runs_on` is `herdr Suite/w7:p1` and whose engine session is in the Suite list is `kept`, not `lost`.
- [ ] **Step 2: Run, expect FAIL.** `pnpm vitest run scripts/session-cards/session-sweep.test.ts`
- [ ] **Step 3: Implement** the loop over `[...new Set(scope sessions)]`; keep `startsWith("herdr")` as is.
- [ ] **Step 4: Run, expect PASS.** Also run `pnpm vitest run scripts/session-cards`.
- [ ] **Step 5: Commit.** `git commit scripts/session-cards/session-sweep.ts scripts/session-cards/session-sweep.test.ts -m "feat(dgs-683): sweep the live sessions of both herdr sessions"`

### Task 4: state refresh and health use the registry

**Files:**
- Modify: `scripts/conductor/refresh.ts:149-160`, `scripts/conductor/state.ts:255-266`
- Test: `scripts/conductor/refresh.test.ts`, `scripts/conductor/state.test.ts` (add cases)

**Interfaces:**
- Consumes: `resolveConductor`, `floorWorkspaces` (T1), `parseRunsOn` (T2), `herdrSessionArgs`.
- Produces: no new exports. Behaviour:
  - `refresh.ts`: worker workspaces = `[opts.herdrWorkspace]` when given; else the registry entry's `floor` (a `factory` kind: `floorWorkspaces(env)`); else, for a conductor card whose `parseRunsOn(runs_on)` has session `default`, that workspace (today's rule). Agents are always read with `["--session","default","agent","list"]` (workers live on the Floor). A conductor card with session `Suite` and no registry floor throws today's style message ("no Floor workspace known for conductor ...").
  - `state.ts`: the health block runs `status server` and `tab list` for the conductor's own session (`herdrSessionArgs(entry)`, default `default`), and when that session is not `default` also `["--session","default","status","server"]`; `state.health.server` reads `Suite up; Floor up`.

- [ ] **Step 1: Write the failing tests** in the existing style of `refresh.test.ts` (fake runner, temp depot with `conductors.json`): (a) registry entry `{session:"Suite",workspace:"w7",floor:"w2"}` + a Floor agent in `w2` named `dgs-5` owned by the conductor card -> Running contains `dgs-5` and the runner saw `["--session","default","agent","list"]`; (b) the same agent in `w3` is not listed; (c) `kind: factory` entry lists agents of `w2` and `w3`; (d) no registry entry and a card `runs_on: "herdr w2:p1"` behaves as before; (e) in `state.test.ts` a Suite entry makes the runner see `["--session","Suite","tab","list","--workspace","w7"]` and a `default` status call.
- [ ] **Step 2: Run, expect FAIL.** `pnpm vitest run scripts/conductor/refresh.test.ts scripts/conductor/state.test.ts`
- [ ] **Step 3: Implement.** Keep all other code in both files unchanged.
- [ ] **Step 4: Run, expect PASS** (both files fully, not only the new cases).
- [ ] **Step 5: Commit.** `git commit scripts/conductor/refresh.ts scripts/conductor/state.ts scripts/conductor/refresh.test.ts scripts/conductor/state.test.ts -m "feat(dgs-683): read workers and health per herdr session"`

### Task 5: flux and flux targets per session

**Files:**
- Modify: `scripts/conductor/flux-herdr.ts` (`fluxRunner`, `createFluxHerdr`), `scripts/conductor/flux-cli.ts:70-90`, `scripts/conductor/flux-targets.ts` (add `session` to `FluxTarget` through `resolveTarget`)
- Test: `scripts/conductor/flux.test.ts`, `scripts/conductor/flux-io.test.ts` (add cases)

**Interfaces:**
- Produces: `createFluxHerdr(run?, session = "default")` prefixes every herdr-ws argv with `["--session", session]` when `session !== "default"`. `fluxRunner` accepts exactly one leading `["--session", <label>]` pair (label regex as in `runner.ts` `LABEL`) and checks the verbs after it as today. `resolveTarget` returns `session` from `resolveConductor(`${project}/${agent}`)?.session ?? "default"`. `flux-cli` accepts `HERDR_SCOPE` or `HERDR_WS` (error text names both), groups targets by session and builds one `FluxDeps.herdr` per group.

- [ ] **Step 1: Write the failing tests:** (a) `fluxRunner` allows `["--session","Suite","agent","list"]`, refuses `["--session","Suite","agent","stop","x"]` and a second `--session`; (b) `createFluxHerdr(fakeRun,"Suite").list()` calls `fakeRun` with `["--session","Suite","agent","list"]`; with `"default"` it calls `["agent","list"]` as before; (c) `flux-cli` with only `HERDR_SCOPE=Suite:w7,default:w2` set runs (no "needs HERDR_WS" error); with neither set it prints the error and returns 1; (d) `resolveTarget("d3-conductor", {}, env, repo)` returns `session:"Suite"` for a Suite registry entry and `"default"` for an old one.
- [ ] **Step 2: Run, expect FAIL.** `pnpm vitest run scripts/conductor/flux.test.ts scripts/conductor/flux-io.test.ts`
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS** (both files fully).
- [ ] **Step 5: Commit.** `git commit scripts/conductor -m "feat(dgs-683): run the flux in the session of its target"`

### Task 6: the registry owns the note lookup, docs

**Files:**
- Modify: `scripts/conductor/state.ts:84` (`resolveNotePath` reads through `resolveConductor`), `scripts/conductor/flux-targets.ts:54` (same), `docs/conductor-state.md:13-26`
- Test: `scripts/conductor/state.test.ts`

**Interfaces:** `resolveNotePath` returns `resolveConductor(`${project}/${conductor}`, env)?.note` when set, else the default path (unchanged result for every existing fixture).

- [ ] **Step 1: Write the failing test:** a Suite entry with `note` returns that note; an entry without `note` falls through to `<depot>/sessions/<project>/<conductor>/note.md`; a broken `conductors.json` still falls through (today's catch).
- [ ] **Step 2: Run, expect FAIL.** `pnpm vitest run scripts/conductor/state.test.ts`
- [ ] **Step 3: Implement** (replace the two inline `JSON.parse` blocks with the module; wrap in the existing try/catch). Edit `docs/conductor-state.md`: `HERDR_WS`, `HERDR_SCOPE`, `--herdr-workspace` and the Suite/Floor split in the "Running" text.
- [ ] **Step 4: Run, expect PASS.** Then the A1 gate: `pnpm vitest run scripts/conductor scripts/session-cards`.
- [ ] **Step 5: Commit.** `git commit scripts/conductor/state.ts scripts/conductor/flux-targets.ts scripts/conductor/state.test.ts docs/conductor-state.md -m "refactor(dgs-683): read notes through the registry"`

---

