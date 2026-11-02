# DGS-683 Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Each split ticket (A1 to D) is built alone: a Builder reads only the tasks of its own ticket plus "Global Constraints" and "Shared facts".**

**Goal:** Move every conductor into a second herdr session `Suite`, keep workers on the Floor (`default`), and make registry, cards, guardrail, state, flux, scan, run records and Oculus session-aware, with a ticket-conductor role (spec: `spec.md` in this folder, approved at checkpoint 1).

**Architecture:** One registry module (`scripts/conductor/registry.ts`) is the only reader of `conductors.json`; every caller asks it for `session`, `workspace`, `floor`, `kind`. New fields are optional and an old entry means session `default`, so the code ships first (backward compatible) and the live data flips later by hand. `herdr-ws` takes a `HERDR_SCOPE` list of `session:workspace` pairs. The ticket conductor is a registry entry plus a driver record file plus two `dg conductor` commands.

**Tech Stack:** TypeScript run with `node --experimental-strip-types` (`.ts` imports with the extension), vitest (`pnpm vitest run <file>`), Python 3 for `herdr-ws`, bash + `jq` for the bootstrap. pnpm only.

## Global Constraints

- Docs only in this refinement; the Builders below write code in a worktree on a branch, never on main, never against the live herdr sessions `default` or `Suite` (tests use fakes or a throwaway session such as `suite-test-<pid>`, headless: `herdr --session <name> server`).
- pnpm only (`pnpm install`, `pnpm vitest run`). No npm, no yarn.
- Old behaviour stays: with no new registry field and no `HERDR_SCOPE`, every changed function behaves as before (spec 5.2, 7.1). Each task has a test for this.
- A pane id is never stored without its session (spec 12 risk 1). Old stored values (`herdr w2:p1`, run records without `session`) mean session `default`.
- `HERDR_SESSION` unset means `default` (it is unset in `default`, set only in a named session).
- Session name regex `^[A-Za-z][\w-]*$`; workspace id regex `^w\d+$`; ticket conductor agent name `tc-<ticket lowercase>`; on-call `nw-<id>`.
- Never read or print a token or `.env` value. No sudo. No delete of files the plan does not name.
- Times UTC+7 first. Commit titles: conventional, title only, no AI attribution, no body footer. Commit with a pathspec (`git commit <paths> -m ...`).
- Protected paths (a merge touching them needs the Maestro): `hooks/`, `skills/finishing-*`, `skills/reviewer`, `packages/cli/src/reviewer/`, `packages/cli/src/autonomous/`, `scripts/nexus-api/src/scheduler/`, `.digismith/config.yml`.
- Out of scope: DGS-640, DGS-641 behaviour, OpenCode guardrail copies (`.opencode/`), Builder/Reviewer/finishing skills.

## Shared facts (verified 2026-11-01 on main 8cacaae8)

- `scripts/depot-dir.ts`: `depotDir(env)` honours `DIGISMITH_DEPOT_DIR`; tests set it to a temp dir.
- `conductors.json` today: `{"DigiSmith/digismith-conductor":{"note":"...","workspace":"w2"},"Emma/emma-conductor":{"note":"..."}}`.
- `scripts/conductor/runner.ts:79-94` `checkHerdr` already allows a leading `--session <label>` for read-only verbs.
- `scripts/conductor/refresh.ts:86-88` `refreshState(opts, deps)`, `deps.env`; `:149` workspace from `opts.herdrWorkspace ?? /^herdr (w\d+):/.exec(card.runs_on)`; `:158` `["--session","default","agent","list"]`.
- `scripts/conductor/state.ts:255-266` `herdr --session default status server` and `tab list`.
- `scripts/session-cards/card-hook.ts:70` `runsOn = HERDR_PANE_ID ? "herdr " + pane : "workbox"`; `session-sweep.ts:25-29` `readLiveSessions` calls `~/.digismith-depot/bin/herdr-ws agent list`; `:44` `runs_on.startsWith("herdr")`.
- `packages/cli/src/autonomous/conductor.ts:8,20-37,51-57` constant `CONDUCTOR_KEY`, `readConductor`, `promptConductor`; test fixture style in `conductor.test.ts`.
- `packages/cli/src/run/auto.ts:62` `herdr: {workspace, tab, pane}`; `packages/cli/src/oculus/live.ts:12` `HERDR_ARGS = ["--session","default","agent","list"]`.
- `scripts/opencode-boot/herdr-ws` (Python, source of the deployed `~/.digismith-depot/bin/herdr-ws`), hard-codes `H = ["/Users/workbox/.local/bin/herdr","--session","default"]`.
- Tests in this repo: vitest, `describe/it/expect`, temp dirs by `fs.mkdtempSync(path.join(os.tmpdir(), "x-"))`, `afterEach` cleanup.

## The split (separate ClickUp tickets; all Mode **Autonomous**, Sign-off **Auto**)

DGS-683 stays as the epic-like parent (not built itself); its description gets the spec and plan attached. Seven children:

| Key (new) | Title | Size | Blocked by | Protected paths touched | Maestro needed to merge |
|---|---|---|---|---|---|
| **A1** | Suite registry and session-aware conductor scripts | M | none | none | no |
| **A2** | Session-aware scan, run records and Oculus | M | A1 | `packages/cli/src/autonomous/` | **yes** |
| **A3** | herdr-ws scope: sessions, Floor reach, Suite close rule, audit log | M | none | none | no (deploy of the script is a conductor step) |
| **B** | Suite boot files: second daemon, bootstrap, conductor-watch, runbook text | M | A1, A3 | none | no (install is a conductor step) |
| **C** | Ticket conductor: driver records and `dg conductor` commands | L | A1, A3 | none | no |
| **D** | Factory claim writes and hands over the driver record | S | C, A2 | `packages/cli/src/autonomous/` | **yes** |
| **M** | Suite migration (conductor/Maestro checklist, NOT for a Builder) | S | A1, A2, A3, B (C and D for the ticket-conductor go-live) | none (live files only) | n/a |

**Ticket numbers (Jack, 2026-11-01): number the tickets 1 to 7 in build order, no letters.** `DGS-683 1` = A1 registry and conductor scripts; `2` = A3 herdr-ws scope; `3` = A2 scan, run records, Oculus; `4` = B Suite boot files; `5` = C ticket conductor; `6` = D factory claim driver record; `7` = M migration checklist (Mode Manual). Blockers: 1 none; 2 none; 3 on 1; 4 on 1+2; 5 on 1+2; 6 on 5+3; 7 on all. The letters inside this file stay as the section names; per-ticket extracts for the checklists: `plan-1.md` to `plan-6.md` in this folder.

Why split here: A1 and A3 touch no protected path and can run in parallel (two builders); A2 and D are the only protected-path work and stay small so the Maestro reviews them alone; B and C are separate merges with separate failure modes; M is live work and never goes to the factory. A1 and A3 first, then A2, B and C in parallel, then D, then M.

**ClickUp-ready descriptions** (the conductor pastes these; each ends with "Spec and plan: attached `spec.md` and `plan.md`; build only the tasks of this ticket"):

- **A1**: "Add `scripts/conductor/registry.ts` (the one reader of `conductors.json` with optional `session`, `workspace`, `floor`, `kind`, `status`; old entries mean session `default`). Make session cards, the session sweep, state refresh, state health and flux session-aware (`runs_on` = `herdr <session>/<pane>`, old format valid). No live data changes. Tasks T1-T6 of plan.md. Done when `pnpm vitest run scripts/conductor scripts/session-cards` passes and the old-behaviour tests still pass."
- **A2**: "Make the factory scan prompt the factory conductor in its own session through the registry (`kind: factory`, fallback `DigiSmith/digismith-conductor`); run records store `herdr.session`; Oculus reads `default` and `Suite`. Touches `packages/cli/src/autonomous/` (protected: Maestro merges). Tasks T7-T9."
- **A3**: "Extend `herdr-ws` with `HERDR_SCOPE` (list of `session:workspace`), `--session` first argument, Suite close rule (`tc-`/`nw-` tabs only), and the cross-project audit log. `HERDR_WS` alone keeps today's meaning. Tasks T10-T12. The deployed copy in the depot is replaced by the conductor, not the Builder."
- **B**: "Write the Suite boot files in `scripts/herdr/`: `herdr-boot-suite.sh`, `com.jazurite.herdr-suite.plist`, the new `herdr-bootstrap.sh` (registry-driven, two sessions, writes workspace ids back), the new `conductor-watch` (`Suite/<name>` targets), and the runbook text. Proposals only; the install is a conductor/Maestro step. Tasks T13-T16."
- **C**: "Add `dg conductor start-ticket|close|handover|sweep` and the driver record `~/.digismith-depot/drivers/<KEY>.json` (exclusive create, one driver per ticket); `dg run start` refuses a ticket that has another driver. Tasks T17-T21."
- **D**: "The factory claim writes the driver record (`driver: factory`) and the hand-over to a ticket conductor rewrites it. Touches `packages/cli/src/autonomous/` (protected). Task T22."
- **M**: "Conductor/Maestro checklist `migration.md` of this plan (section 'Migration checklist'); nothing for the factory."

**Steps that are NOT for an unattended Builder** (anything that restarts or moves a live conductor, starts the real `Suite` session, edits live `conductors.json`, changes a setting or a LaunchAgent): installing `herdr-ws` into `~/.digismith-depot/bin`, installing `herdr-bootstrap.sh`, `herdr-boot-suite.sh`, `conductor-watch` into `~/.local/bin` or the depot bin, the LaunchDaemon plist and `launchctl`, starting the real session `Suite`, every edit of the live `~/.digismith-depot/conductors.json`, `flux-targets.json`, every flux/move of a live conductor, closing an old Floor conductor tab, rewriting `.digismith/sessions/workbox.md`. All are in "Migration checklist" at the end, marked **[CONDUCTOR]**.

## File structure

| File | Ticket | Responsibility |
|---|---|---|
| `scripts/conductor/registry.ts` (+ `.test.ts`) | A1 | read/validate/write `conductors.json`; `resolveConductor`, `findByKind`, `floorWorkspaces`, `scopeFor`, `putEntry`, `removeEntry` |
| `scripts/session-cards/runs-on.ts` (+ test) | A1 | `parseRunsOn`, `formatRunsOn` |
| `scripts/session-cards/card-hook.ts`, `session-sweep.ts` | A1 | use them |
| `scripts/conductor/refresh.ts`, `state.ts`, `flux-herdr.ts`, `flux-cli.ts`, `flux-targets.ts` | A1 | session arguments from the registry |
| `docs/conductor-state.md` | A1 | text |
| `packages/cli/src/autonomous/conductor.ts`, `scan.ts` | A2 | registry-driven prompt and check |
| `packages/cli/src/run/auto.ts`, `read.ts`, `record.ts` | A2 | `herdr.session` |
| `packages/cli/src/oculus/live.ts` | A2 | two sessions |
| `scripts/opencode-boot/herdr-ws` (+ `herdr-ws.test.ts`) | A3 | scope, session, close rule, audit |
| `scripts/herdr/*` | B | boot proposals |
| `packages/cli/src/conductor/drivers.ts`, `start-ticket.ts`, `close.ts`, `sweep.ts`, `index.ts` (+ tests) | C | the role |
| `packages/cli/src/run/index.ts` (driver check) | C | refuse second driver |
| `packages/cli/src/index.ts` | C | register `conductorCommand` |

---

## Ticket A1: registry and session-aware conductor scripts

### Task 1 (T1): the registry module

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

### Task 2 (T2): `parseRunsOn`, `formatRunsOn`, and the card hook

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

### Task 3 (T3): the session sweep reads both sessions

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

### Task 4 (T4): state refresh and health use the registry

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

### Task 5 (T5): flux and flux targets per session

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

### Task 6 (T6): the registry owns the note lookup, docs

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

## Ticket A2: session-aware scan, run records, Oculus (protected: `autonomous/`)

### Task 7 (T7): `promptConductor` and `conductorCheck` through the registry

**Files:**
- Modify: `packages/cli/src/autonomous/conductor.ts` (all of `readConductor`, `conductorCheck`, `promptConductor`), `packages/cli/src/autonomous/scan.ts:166-180` only if the cause text needs the session (it does not change the control flow)
- Test: `packages/cli/src/autonomous/conductor.test.ts`

**Interfaces:**
- Consumes: `findByKind`, `resolveConductor`, `scopeFor`, `herdrSessionArgs` from `../../../../scripts/conductor/registry.ts` (same relative-import style as `guardrails.test.ts`), the same `Exec` type.
- Produces: `promptConductor(exec, conductorsJson, message)` keeps its signature. Target = the `factory` entry; none -> the entry with key `DigiSmith/digismith-conductor`. It runs `herdr-ws` with args `["--session", S, "agent", "prompt", name, message]` when `S !== "default"`, else `["agent","prompt",name,message]` (today's argv, so the existing test stays), with env `HERDR_WS = floor-or-workspace` and `HERDR_SCOPE = scopeFor(entry)`. `conductorCheck` still returns `conductor-workspace-missing` when the target has no `^w\d+$` workspace and `conductor-config-unreadable` for an unreadable file; its text names the session. `conductorsJson` stays a path parameter: the module is called with that path by `readRegistry` taking a file path variant (`readRegistryFile(path)` added in T1's module in this task: Step 3 adds it with its own two-line test in `registry.test.ts`).

- [ ] **Step 1: Write the failing tests** next to the existing ones: (a) a registry `{ "DigiSmith/digismith-conductor": {kind:["project","factory"], session:"Suite", workspace:"w7", floor:"w2"}, "Emma/emma-conductor": {workspace:"w3"} }` -> one exec call, argv `["--session","Suite","agent","prompt","digismith-conductor",msg]`, env has `HERDR_SCOPE: "Suite:w7,default:w2,default:w3"` and `HERDR_WS: "w2"`; (b) a separate `Factory/factory-conductor` entry with `kind:"factory"` is chosen over the DigiSmith key; (c) the existing "good" fixture (old shape) yields today's argv and `HERDR_WS=w2` (the two existing tests must pass unchanged); (d) `conductorCheck` on `{ "DigiSmith/digismith-conductor": { session:"Suite" } }` returns `conductor-workspace-missing`.
- [ ] **Step 2: Run, expect FAIL.** `pnpm vitest run packages/cli/src/autonomous/conductor.test.ts`
- [ ] **Step 3: Implement.** Remove the `CONDUCTOR_KEY` constant's role as the only target; keep it as the fallback name.
- [ ] **Step 4: Run, expect PASS.** Then `pnpm vitest run packages/cli/src/autonomous` (whole folder: scan tests include the conductor check).
- [ ] **Step 5: Commit.** `git commit packages/cli/src/autonomous/conductor.ts packages/cli/src/autonomous/conductor.test.ts scripts/conductor/registry.ts scripts/conductor/registry.test.ts -m "feat(dgs-683): prompt the factory conductor in its own herdr session"`

### Task 8 (T8): run records store `herdr.session`

**Files:**
- Modify: `packages/cli/src/run/auto.ts:62`, `packages/cli/src/run/record.ts` (the `herdr` field type), `packages/cli/src/run/read.ts:108`
- Test: `packages/cli/src/run/auto.test.ts`, `packages/cli/src/run/read.test.ts`, `packages/cli/src/run/record.test.ts` (add cases)

**Interfaces:** record field `herdr: { session: string | null; workspace; tab; pane }`. `auto.ts` sets `session` to `HERDR_SESSION` when `HERDR_PANE_ID` is set (unset -> `"default"`), `null` outside herdr. A record read from disk without `session` is returned with `session: "default"` when it has a pane, `null` otherwise. `dg run read` prints `herdr     <session> / <workspace> / <tab> / <pane>`.

- [ ] **Step 1: Write the failing tests:** auto in Suite env -> `session "Suite"`; auto with a pane and no `HERDR_SESSION` -> `"default"`; no pane -> `null`; an old record file (no `session`) reads as `default`; the printed line.
- [ ] **Step 2: Run, expect FAIL.** `pnpm vitest run packages/cli/src/run`
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS** (whole `run` folder, including fixtures that build records by hand: add `session` where the type now requires it).
- [ ] **Step 5: Commit.** `git commit packages/cli/src/run -m "feat(dgs-683): record the herdr session in a run record"`

### Task 9 (T9): Oculus reads both sessions

**Files:**
- Modify: `packages/cli/src/oculus/live.ts:12,49-90`, `packages/cli/src/oculus/README.md:14`, `packages/cli/src/oculus/fixture.test-util.ts`
- Test: `packages/cli/src/oculus/live.test.ts`

**Interfaces:** `HERDR_ARGS` becomes `HERDR_CALLS = [["--session","default","agent","list"],["--session","Suite","agent","list"]] as const`. `HerdrCall` is called once per entry; every live row gains `session`; the run join key is `${session}/${pane_id}`; an unreadable Suite session (server not running) makes the Suite call fail without failing the view: the rows of `default` still show and the view carries `suite: "unavailable"`. `liveView` rows for old tests keep `session: "default"`.

- [ ] **Step 1: Write the failing tests** in the style of `live.test.ts`: two agents with the same `pane_id` `w2:p1`, one per session, each joined to its own run; Suite call failing -> default rows present and `suite: "unavailable"`; the existing tests (one `herdrOf` list for every call) still pass because a `HerdrCall` that ignores its args returns the same list for both sessions: adjust `herdrOf` to return the list only for `default` and `[]` for Suite where a test counts rows.
- [ ] **Step 2: Run, expect FAIL.** `pnpm vitest run packages/cli/src/oculus`
- [ ] **Step 3: Implement.** The secret rule of this file stays (terminal titles never in the output).
- [ ] **Step 4: Run, expect PASS** (whole `oculus` folder).
- [ ] **Step 5: Commit.** `git commit packages/cli/src/oculus -m "feat(dgs-683): show the conductors of the Suite session in Oculus"`

---

## Ticket A3: the herdr-ws scope

Hermetic test design for T10-T12: `scripts/opencode-boot/herdr-ws.test.ts` builds a temp dir, writes a fake `herdr` (a `sh` script, below), copies `herdr-ws` with the herdr path replaced by the fake's path (`text.replace('"/Users/workbox/.local/bin/herdr"', JSON.stringify(fakePath))`), and runs it with `spawnSync("python3", [copy, ...args], { env })`. The real herdr is never called.

Fake (written by the test):
```sh
#!/bin/sh
# argv: --session S <group> <verb> ...
echo "$@" >> "$FAKE_LOG"
S="$2"; shift 2
case "$1 $2" in
  "agent list") echo '{"result":{"agents":[{"name":"dgs-1","pane_id":"w2:p1","workspace_id":"w2"},{"name":"dgs-2","pane_id":"w3:p1","workspace_id":"w3"},{"name":"tc-dgs-9","pane_id":"w7:p2","workspace_id":"w7"},{"name":"digismith-conductor","pane_id":"w7:p1","workspace_id":"w7"}]}}' ;;
  "agent get") case "$3" in dgs-1) W=w2;; dgs-2) W=w3;; tc-dgs-9|digismith-conductor) W=w7;; esac; echo "{\"result\":{\"agent\":{\"name\":\"$3\",\"workspace_id\":\"$W\"}}}" ;;
  "tab get") case "$3" in w7:t2) L=tc-dgs-9;; *) L=digismith-conductor;; esac; echo "{\"result\":{\"tab\":{\"tab_id\":\"$3\",\"label\":\"$L\"}}}" ;;
  *) echo '{"result":{}}' ;;
esac
```
Helper in the test: `run(env, args)` returns `{status, stdout, stderr, log}`; `ok(r)` means `status === 0`; `refused(r)` means `status === 3 && /herdr-ws: refused/`.

### Task 10 (T10): scope parsing and `--session`

**Files:**
- Modify: `scripts/opencode-boot/herdr-ws`
- Test: `scripts/opencode-boot/herdr-ws.test.ts` (create)

**Interfaces:** per spec 7.1 items 1-3. `HERDR_SCOPE` absent -> `[("default", $HERDR_WS)]`; neither set -> refused "HERDR_SCOPE or HERDR_WS not set". `--session S` as the first argument selects the session (must appear in the scope). Argv to herdr is built by the wrapper as `[HERDR, "--session", S, ...rest]`; the wrapper never forwards a `--session` or `--socket` of the caller.

**Maestro note (plan approval, 2026-11-01):** with `HERDR_SCOPE` holding several `default:<w>` pairs, the membership check is "the target workspace is one of the scope's workspaces FOR THAT SESSION" (`scopeFor` gives the own Suite workspace plus every Floor workspace). The T10 tests must cover MORE THAN ONE `default` pair: a target in each `default` workspace passes, a target in a `default` workspace NOT in the scope is refused, and the same workspace id in `Suite` is not accepted through a `default` pair.

- [x] **Step 1: Write the failing tests:** (1) `HERDR_WS=w2`, `agent list` -> ok, output only `w2` agents (today's behaviour); (2) `HERDR_WS=w2`, `--session Suite agent list` -> refused (Suite not in scope); (3) `HERDR_SCOPE=Suite:w7,default:w2,default:w3`: `agent list` (default) -> `dgs-1` and `dgs-2`, not the w7 ones; `--session Suite agent list` -> only w7 agents; (4) a third session `--session other agent list` -> refused; (5) a second `--session` later in argv (`tab create --session x`) -> refused; (6) `pane read w4:p1` with scope w2,w3 -> refused; (7) `tab create --workspace w3 --label x` with scope `default:w2,default:w3` -> ok; `--workspace w4` -> refused; (8) bad scope text `HERDR_SCOPE=Suite:7` -> refused; (9) `session list` and `workspace create` groups -> refused; (10) the log of the fake shows every forwarded call starts with `--session <S>`.
- [x] **Step 2: Run, expect FAIL.** `pnpm vitest run scripts/opencode-boot/herdr-ws.test.ts`
- [x] **Step 3: Implement** in `herdr-ws`: `parse_scope()`, session extraction before the group check, `run(a)` using the chosen session, `WSS = {w for s, w in SCOPE if s == SESSION}`, list filtering by membership, `create` membership check, `start`/other verbs by `ws_of(t) in WSS`. Keep the old `HERDR_ENV` XDG handling and the `H[0]` path constant unchanged (the test replaces it).
- [x] **Step 4: Run, expect PASS.** Also run the old script: `node scripts/opencode-boot/test-herdr-ws.mjs` (read-only against live herdr, allowed) -> `ALL PASS`.
- [x] **Step 5: Commit.** `git commit scripts/opencode-boot/herdr-ws scripts/opencode-boot/herdr-ws.test.ts -m "feat(dgs-683): scope herdr-ws by session and workspace"`

### Task 11 (T11): the Suite close rule

**Files:** Modify `scripts/opencode-boot/herdr-ws`; Test `scripts/opencode-boot/herdr-ws.test.ts`.

**Interfaces:** spec 7.1 item 4. In session `Suite`: `tab close <id>`, `pane close`, `agent stop <name>` are refused unless the target's label (read with `tab get`; for `agent stop` the agent name) starts with `tc-` or `nw-`. Session `default` keeps the old `WS:t1` rule for every `WS` in its scope.

- [x] **Step 1: Write the failing tests:** `--session Suite tab close w7:t2` (label `tc-dgs-9`) -> ok; `--session Suite tab close w7:t1` (label `digismith-conductor`) -> refused; `--session Suite agent stop digismith-conductor` -> refused; `--session Suite agent stop tc-dgs-9` -> ok; `tab close w2:t1` (default) -> refused (old rule); `tab close w2:t5` (default) -> ok.
- [x] **Step 2: Run, expect FAIL.** `pnpm vitest run scripts/opencode-boot/herdr-ws.test.ts`
- [x] **Step 3: Implement.**
- [x] **Step 4: Run, expect PASS.**
- [x] **Step 5: Commit.** `git commit scripts/opencode-boot/herdr-ws scripts/opencode-boot/herdr-ws.test.ts -m "feat(dgs-683): only ticket conductors can be closed in Suite"`

### Task 12 (T12): the cross-project audit log

**Files:** Modify `scripts/opencode-boot/herdr-ws`; Test `scripts/opencode-boot/herdr-ws.test.ts`.

**Interfaces:** spec 7.1 item 5. Env read: `HERDR_WS` (the caller's own Floor workspace; unset = no logging), `DIGISMITH_NAME` (caller name, `unknown` when unset), `DIGISMITH_DEPOT_DIR` (depot root, default `~/.digismith-depot`). A non-read verb (not `list`, `get`, `read`) in session `default` whose target workspace differs from `HERDR_WS` appends one JSON line to `<depot>/drivers/<KEY>.log` where KEY = first `DGS-\d+` in the target agent name uppercased, else file `_unmapped.log`: `{"time":"<iso+07:00>","who":"<DIGISMITH_NAME>","target":"<name or pane>","workspace":"w3","verb":"agent prompt"}`. A failure to write the log does not block the call (it prints one line to stderr).

- [x] **Step 1: Write the failing tests** (temp `DIGISMITH_DEPOT_DIR`): `HERDR_WS=w2`, scope `default:w2,default:w3`, `agent prompt dgs-2 hi` (agent in w3) -> ok and `drivers/_unmapped.log` has one line with `workspace:"w3"`; the same on an agent named `dgs-683-b` in w3 writes `drivers/DGS-683.log`; `agent prompt dgs-1 hi` (own w2) writes nothing; `agent list` and `pane read w3:p1` write nothing; unset `HERDR_WS` (factory) writes nothing; an unwritable depot dir still exits 0 for an allowed call.
- [x] **Step 2: Run, expect FAIL.** `pnpm vitest run scripts/opencode-boot/herdr-ws.test.ts`
- [x] **Step 3: Implement.**
- [x] **Step 4: Run, expect PASS** (whole file) and `node scripts/opencode-boot/test-herdr-ws.mjs` -> `ALL PASS`.
- [x] **Step 5: Commit.** `git commit scripts/opencode-boot/herdr-ws scripts/opencode-boot/herdr-ws.test.ts -m "feat(dgs-683): log a cross-project act in herdr-ws"`

---

## Ticket B: Suite boot files (proposals in the repo; install = conductor)

### Task 13 (T13): the Suite daemon files

**Files:**
- Create: `scripts/herdr/herdr-boot-suite.sh`, `scripts/herdr/com.jazurite.herdr-suite.plist`, `scripts/herdr/README.md`
- Test: `scripts/herdr/boot-files.test.ts`

**Content (exact):** `herdr-boot-suite.sh` is `herdr-boot.sh` with `--session Suite` and the comment "Starts ONLY the session Suite (conductors). The Floor is herdr-boot.sh." `com.jazurite.herdr-suite.plist` is `com.jazurite.herdr.plist` (read it from `/Library/LaunchDaemons/` for the exact keys) with `Label com.jazurite.herdr-suite`, `ProgramArguments /Users/workbox/.local/bin/herdr-boot-suite.sh`, log paths `/Users/workbox/.config/herdr/suite.launchd.out.log` and `suite.launchd.err.log`. `README.md` lists the manual install lines for the conductor/Jack: `cp`, `chmod +x`, `sudo cp` and `sudo launchctl bootstrap system /Library/LaunchDaemons/com.jazurite.herdr-suite.plist` (Jack types the sudo lines; an agent never runs them).

- [ ] **Step 1: Write the failing test:** the shell file passes `bash -n`, contains `--session Suite server` and not `--session default`; the plist is valid XML (`plutil -lint` when on macOS, else a regex check for balanced `<dict>`), has the new Label and log paths, `RunAtLoad`, `KeepAlive` with `SuccessfulExit false`, `UserName workbox`.
- [ ] **Step 2: Run, expect FAIL.** `pnpm vitest run scripts/herdr/boot-files.test.ts`
- [ ] **Step 3: Create the files.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit.** `git commit scripts/herdr -m "feat(dgs-683): add the Suite daemon files"`

### Task 14 (T14): the registry-driven bootstrap

**Files:**
- Create: `scripts/herdr/herdr-bootstrap.sh` (the new text of `~/.local/bin/herdr-bootstrap.sh`), `scripts/herdr/fake-herdr.sh` (test double)
- Test: `scripts/herdr/bootstrap.test.ts`

**Interfaces:** the script keeps `set -u`, `log()`, `ensure_ws`, `ensure_maestro` logic (rename it `ensure_conductor`). New: `HERDR_BIN` (default `$HOME/.local/bin/herdr`), `HERDR_FLOOR_SESSION` (default `default`), `HERDR_SUITE_SESSION` (default `Suite`), `DIGISMITH_DEPOT_DIR` (default `$HOME/.digismith-depot`), `DRY_RUN=1` (every mutating herdr call is only logged as `dry-run: <argv>`). Flow per spec 4.3: wait for both sockets; `ensure_ws` Floor `DigiSmith`, `Emma`, `Soveron`; `ensure_ws` Suite `Factory`, `DigiSmith`, `Emma`, `Soveron`; read `conductors.json` with `jq`, for each entry whose `session == "Suite"` and kind in project|factory|standing (and `status != closed`) run `ensure_conductor name suite-ws cwd`, where cwd comes from a table at the top of the script (`Factory`, `DigiSmith` = `$DG_DIR`, `Emma` = `$EMMA_MAESTRO_DIR`, `Soveron` = `$SOV_DIR`) keyed by the project part of the entry key; the conductor is started in a pane of the tab labelled with its name (tab created when missing); env `HERDR_SCOPE=<scopeFor>`, `HERDR_WS=<floor>` (not set for the factory), `DIGISMITH_NAME=<name>`; flags exactly as today (`--name`, `--disallowedTools "Bash(herdr *)"`, `--allowedTools "Bash(herdr-ws *)" "Bash($WS_BIN *)"`). `scopeFor` is computed in bash from the same rule (own `Suite:` workspace plus one `default:<id>` per distinct `floor` and per `default` workspace in the registry) with a test that compares it with `scopeFor` of `registry.ts` on one fixture. After the ensure steps, write the resolved Suite workspace id into each entry's `workspace` (jq to a temp file, `mv`). A `ticket` entry with `status == open` is relaunched (resume with the same session id) but never created. Entries with no `session` field are skipped (still Floor conductors, handled by the old behaviour of this script: when `FLOOR_CONDUCTORS=1` the old `ensure_maestro` block runs for them; default `1` until the migration ends, so the new script is a drop-in replacement before step 6).

**Fake:** `fake-herdr.sh` keeps state in `$FAKE_DIR` (`<session>.ws` lines `wN label`, `<session>.agents` lines `name pane status`), implements `workspace list|create|close`, `tab list|create|rename`, `agent get|list|start|prompt`, `pane run`, and prints the JSON shapes the script reads with `jq` (`.result.workspaces[]`, `.result.workspace.workspace_id`, `.result.agent`). It logs every call to `$FAKE_DIR/calls.log`.

- [ ] **Step 1: Write the failing test** (`bootstrap.test.ts`, runs the script with `HERDR_BIN=<fake>`, temp `HOME`, temp depot with a `conductors.json` of one Suite project entry, one factory entry, one old default entry): after a run, `FAKE_DIR` shows Suite workspaces `Factory DigiSmith Emma Soveron` and Floor workspaces `DigiSmith Emma Soveron`; the two Suite conductors are started in their Suite workspace with `--session Suite` and the flags; the registry `workspace` fields hold the Suite ids; a second run adds no workspace and no agent (idempotent); `DRY_RUN=1` changes nothing and logs `dry-run:` lines; the old default entry still goes through the old path; a `ticket` entry `status: open` with no live agent is NOT created (logged "ticket conductor ... not running, start it with dg conductor start-ticket"); the exported scope string equals `scopeFor` for the fixture.
- [ ] **Step 2: Run, expect FAIL.** `pnpm vitest run scripts/herdr/bootstrap.test.ts`
- [ ] **Step 3: Write the script and the fake.** Base it on the installed script (`~/.local/bin/herdr-bootstrap.sh`, read it, copy `COMMON_RULES`, the prompts and the relaunch branch verbatim).
- [ ] **Step 4: Run, expect PASS.** Also `bash -n scripts/herdr/herdr-bootstrap.sh`.
- [ ] **Step 5: Commit.** `git commit scripts/herdr -m "feat(dgs-683): bootstrap both herdr sessions from the registry"`

### Task 15 (T15): `conductor-watch` with session targets

**Files:**
- Create: `scripts/herdr/conductor-watch` (new text of `~/.digismith-depot/bin/conductor-watch`)
- Test: `scripts/herdr/conductor-watch.test.ts`

**Interfaces:** a target `Suite/emma-conductor` or `Suite/w7:p1` runs `herdr --session Suite agent get <rest>`; a plain target runs `herdr agent get <target>` exactly as today. `--once` prints one `state` line per target. The herdr binary is found on `PATH` (the test puts `fake-herdr.sh` first as `herdr`).

- [ ] **Step 1: Write the failing test:** with a fake `herdr` on `PATH` that logs argv, `conductor-watch --once Suite/emma-conductor emma-conductor` shows calls `--session Suite agent get emma-conductor` and `agent get emma-conductor` (no `--session`); an unreadable target reports `gone`.
- [ ] **Step 2: Run, expect FAIL.** `pnpm vitest run scripts/herdr/conductor-watch.test.ts`
- [ ] **Step 3: Implement** (copy the depot script, change `status()` only; update the docstring `TARGET is ...`).
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit.** `git commit scripts/herdr -m "feat(dgs-683): watch conductors in the Suite session"`

### Task 16 (T16): runbook text and the install list

**Files:**
- Create: `scripts/herdr/RUNBOOK-SUITE.md` (replacement text, NOT written into `.digismith/sessions/workbox.md`: that file is untracked and edited by the conductor)
- Test: none (text); check by reading.

**Content:** replacement for the runbook sections "Layout", "After a reboot", "Tab cleanup" and the role table lines (`workbox.md:9,24-45,414`): Suite and Floor definitions, the reboot sequence (spec 4.2), where each conductor lives, the ticket-conductor start/close lines, the `HERDR_SCOPE` rule, the "own workers first, cross-use is logged" rule, and one line per script with its install path.

- [ ] **Step 1:** Write the file from spec sections 2, 4.2, 6, 7.2.
- [ ] **Step 2:** Self-check: every path in it exists in the repo or is named as a install target.
- [ ] **Step 3: Commit.** `git commit scripts/herdr/RUNBOOK-SUITE.md -m "docs(dgs-683): add the Suite runbook text"`

---

## Ticket C: ticket conductor

### Task 17 (T17): driver records

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

### Task 18 (T18): `start-ticket`

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

### Task 19 (T19): `close`, `handover`, `sweep`

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

### Task 20 (T20): the `dg conductor` command

**Files:** Create `packages/cli/src/conductor/index.ts`, `index.test.ts`; Modify `packages/cli/src/index.ts:36-47` (add `.command(conductorCommand)`), `packages/cli/README.md` (one section).

**Interfaces:** yargs command module in the style of `packages/cli/src/run/index.ts`: `dg conductor start-ticket --ticket KEY --under NAME [--project P]`, `dg conductor close --self`, `dg conductor handover --ticket KEY --from A --to B`, `dg conductor sweep`. Project default = `process.env.DIGISMITH_PROJECT ?? "DigiSmith"`. Exit code 1 plus one stderr line on any thrown error.

- [ ] **Step 1: Write the failing test:** `main`-style invocation with injected deps for each subcommand (same pattern as `run/index.test.ts`): argument errors print usage and exit 1; `sweep` prints one line per entry.
- [ ] **Step 2: Run, expect FAIL.** `pnpm vitest run packages/cli/src/conductor/index.test.ts`
- [ ] **Step 3: Implement and register.**
- [ ] **Step 4: Run, expect PASS**, then `pnpm vitest run packages/cli/src/conductor packages/cli/src/index.test.ts packages/cli/src/strip-types.smoke.test.ts`.
- [ ] **Step 5: Commit.** `git commit packages/cli/src/conductor packages/cli/src/index.ts packages/cli/README.md -m "feat(dgs-683): add the dg conductor command"`

### Task 21 (T21): `dg run start` refuses a second driver

**Files:** Modify `packages/cli/src/run/index.ts` (the `start` handler) or `limit-check.ts` where start-time refusals live (read both first; put the check beside the existing limit check); Test: `packages/cli/src/run/index.test.ts`.

**Interfaces:** for a run with `--role builder|reviewer` and `--ticket KEY`: `readDriver(KEY)`; when a driver exists and its name differs from `process.env.DIGISMITH_NAME` (the starter), refuse with `DGS-9 is driven by tc-dgs-9 (since ...): ask that conductor`; no driver file -> the run starts as today and the starter is NOT auto-claimed here (the conductor claims through `start-ticket` or the factory claim).

- [ ] **Step 1: Write the failing tests:** driver present and same name -> start allowed; driver present, other name -> refused, exit code 1; no driver -> unchanged; role `other` (Scout/Researcher) -> not checked.
- [ ] **Step 2: Run, expect FAIL.** `pnpm vitest run packages/cli/src/run/index.test.ts`
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS**, then `pnpm vitest run packages/cli/src/run`.
- [ ] **Step 5: Commit.** `git commit packages/cli/src/run -m "feat(dgs-683): refuse a run on a ticket another conductor drives"`

---

## Ticket D: factory claim writes the driver record (protected: `autonomous/`)

### Task 22 (T22): claim and hand-over

**Files:** Modify the claim step in `packages/cli/src/autonomous/` (find it with `grep -n "claim" packages/cli/src/autonomous/act.ts advance.ts`; the existing claim-lock write is the anchor); Test: the matching `*.test.ts` (`act.test.ts` or `advance.test.ts`).

**Interfaces:** consumes `claimDriver`, `handoverDriver` (T17). When the factory claims a ticket it calls `claimDriver({ticket, driver:"factory", mode:"factory"})` right after the existing lock write; `DriverTaken` -> the claim is skipped with the existing "skipped" reason shape (`reason: "driven-by:<name>"`) and no lock is written. When a ticket conductor takes over (the factory conductor runs `dg conductor start-ticket`, T18, which calls `claimDriver`), T18 must accept a `factory` driver: change `startTicketConductor` to call `handoverDriver(ticket, "factory", name)` when the current driver is `factory` and the starter is the factory conductor (one extra test in T18's file, added by this task). The existing claim-lock behaviour and its tests stay unchanged.

- [ ] **Step 1: Write the failing tests:** claim writes both the lock and the driver file; a ticket with another driver is skipped and gets no lock; start-ticket after a factory claim hands the driver over to `tc-<key>`; with a depot that has no `drivers/` folder the claim creates it.
- [ ] **Step 2: Run, expect FAIL.** `pnpm vitest run packages/cli/src/autonomous packages/cli/src/conductor`
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS** (both folders fully).
- [ ] **Step 5: Commit.** `git commit packages/cli/src/autonomous packages/cli/src/conductor -m "feat(dgs-683): the factory claim writes the driver record"`

---

## Migration checklist (ticket M: **[CONDUCTOR]** steps, no Builder; spec section 10)

Each step: do it, run its check, stop and roll back on failure (spec 10.2). Times UTC+7.

1. **[CONDUCTOR] Wait for A1, A3 merged** (A2 for step 8). Pull the plugin; run `pnpm vitest run scripts/conductor scripts/session-cards scripts/opencode-boot` on main. Check: all pass.
2. **[CONDUCTOR] Install the new `herdr-ws`.** `cp ~/.digismith-depot/bin/herdr-ws ~/.digismith-depot/bin/herdr-ws.before-dgs-683`, then `cp scripts/opencode-boot/herdr-ws ~/.digismith-depot/bin/herdr-ws`. Check: `HERDR_WS=w2 ~/.digismith-depot/bin/herdr-ws agent list` answers as before; `node scripts/opencode-boot/test-herdr-ws.mjs` -> `ALL PASS`. (Backward compatible: nothing else changes yet.)
3. **[CONDUCTOR] Install the other boot files with backups.** `herdr-bootstrap.sh`, `conductor-watch` (backups `*.before-dgs-683`); `herdr-boot-suite.sh` to `~/.local/bin`, `chmod +x`. **[JACK, hand-typed sudo]** the plist install and `launchctl bootstrap` lines of `scripts/herdr/README.md` (root-owned LaunchDaemon: the same path as `com.jazurite.herdr`; no agent runs sudo). Check: `herdr session list` shows `Suite` running; `herdr --session Suite workspace list` answers.
4. **[CONDUCTOR] Back up and extend the live registry.** `cp ~/.digismith-depot/conductors.json ~/.digismith-depot/conductors.json.before-dgs-683`. Add entries without removing the old ones' note: `Soveron/soveron-maestro` (`floor: w4`, standby), and the Floor ids for every project (`floor`). Check: `dg`-side read: `node --experimental-strip-types -e "import('./scripts/conductor/registry.ts').then(m=>console.log(m.floorWorkspaces()))"` prints `["w2","w3","w4"]`.
5. **[CONDUCTOR] Dry run, then create the Suite workspaces.** `DRY_RUN=1 ~/.local/bin/herdr-bootstrap.sh`, read the log, then without `DRY_RUN`. Check: `herdr --session Suite workspace list` shows `Factory DigiSmith Emma Soveron`; no Floor agent changed.
6. **[CONDUCTOR] Trial: move `d3-conductor`.** Spec 9.1 steps 1-6 for `d3-conductor` only: handoff note, registry entry flipped to `session: "Suite"`, `workspace` = Suite `DigiSmith`, `floor: "w2"`, `kind: "standing"`; bootstrap starts it; catch-up answered within 10 minutes; a worker started by it in `default` works with `herdr-ws --session default`; then the tab cleanup of the old `w2:tN` tab. Check: `herdr --session Suite agent list` shows it; `herdr --session default agent list` does not.
7. **[CONDUCTOR] Move the rest** in the order of spec 9.2 (dawn, token-economics, scheduling when live, main, emma), one per turn, same checks. `flux-targets.json` entries stay; the flux of each is run with `HERDR_SCOPE` set.
8. **[CONDUCTOR] Flip the factory line.** Needs A2 merged. Move `digismith-conductor` last as a project conductor with `kind: ["project","factory"]` (spec 9.3 step 1). Check two scans (10 minutes): `dg autonomous` event log shows the prompt delivered, no `conductor-config`/`conductor-workspace-missing` item.
9. **[CONDUCTOR] Floor clean-up.** Any leftover old conductor tab closed by the tab cleanup rule; install `RUNBOOK-SUITE.md` text into `.digismith/sessions/workbox.md` (untracked). Check: `herdr --session default agent list` shows no `*-conductor` name.
10. **[CONDUCTOR] First ticket conductor** (needs C and D): `dg conductor start-ticket --ticket <small ticket> --under digismith-conductor`; watch it close after the merge. Check: no driver file, no registry entry, tab gone.

Rollback per step: spec section 10.2 (restore the `*.before-dgs-683` file of that step; a moved conductor goes back by its registry backup and the old bootstrap path; nothing is lost because the note is untouched).

## Self-review

- **Spec coverage:** section 4 (boot) T13, T14, T16, M3-M5; 5.2 registry T1, T6; 5.3 runs_on T2, T3; 5.4 HERDR_WS T10; 6 ticket conductor T17-T22; 7 guardrail T10-T12 (7.3 OpenCode copies: out of scope, stated); 8 table rows 2-3 T7, 4 T6, 5 T4, 6 T4, 7 T4/T5 (flag stays), 8-9 T5, 10 T2, 11 T3, 12-13 as is (no task, correct), 14 as is after T4, 15 T8, 16 T15, 17 T9, 18 T14, 19 T16, 20-21 none (stated); 9 the move M6-M9; 10 migration/rollback M1-M10; 11 testing in each task; 12 risks: ids with sessions (T2, T8, T9), cap 2 (T18). No gap found.
- **Placeholder scan:** none of "TBD/TODO"; Tasks 3-9, 11-12, 14-16, 18-22 state behaviour and the exact test cases but give code only for T1, T2, T10's fake, T17; the Builder writes the implementation to the stated interface (the test cases are the contract).
- **Type consistency:** `ConductorEntry.kinds` (array) used in T4, T7, T14; `scopeFor(entry, env)` in T1, T7, T14; `claimDriver/handoverDriver/releaseDriver` names in T17, T18, T19, T22; `formatRunsOn(env)`/`parseRunsOn` in T2, T4; `HERDR_SCOPE` pair syntax `session:workspace` everywhere; agent name `tc-<ticket lower>` in T18, T19, spec.
- **Open items for the conductor (not for Jack):** (1) T21 and T22 name their files by a `grep` anchor because the claim step and the run start check were not read to the line; the Builder reads them first (the tests define the contract). (2) The new ticket keys are created by the conductor; the table uses A1-D as labels.
