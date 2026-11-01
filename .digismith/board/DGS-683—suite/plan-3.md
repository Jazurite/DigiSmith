# DGS-683 ticket 3: plan extract (only this ticket's tasks)

Source: `plan.md` of this folder (approved 2026-11-01). Read also its 'Global Constraints' and 'Shared facts'. Task numbers are the plan's own.

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

