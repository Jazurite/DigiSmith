# DGS-623: the scan prompts the conductor from the Nexus job

Spec and plan. Sign-off: Auto. CLI only, no web gate.

## Spec

Cause: `promptConductor` runs `herdr-ws agent prompt digismith-conductor …` with the Nexus job's environment. The job has no `HERDR_WS`, so herdr-ws refuses (DGS-198). `conductors.json` has no workspace field. Only `scan.ts` calls `promptConductor`. The tick path (`makeTick`) already sets `HERDR_WS` itself (`process.env.HERDR_WS || "w2"`), so it is not the bug and stays as is.

Design:
- `conductors.json` entry gets `"workspace": "w2"` next to `note`. Format `^w\d+$`.
- `Exec` takes an optional third argument `env`. `realExec` runs the child with `{ ...process.env, ...env }`.
- `promptConductor` reads `workspace` from the entry and passes `{ HERDR_WS: workspace }`. This value always wins over the job's own `HERDR_WS`. It is never taken from the request, the message or the ticket. A missing or malformed workspace throws `no workspace for DigiSmith/digismith-conductor in <file>`.
- Startup check in `runScan` (not in dry run), placed after the guardrail check and before any claim: a new `conductorProblem(conductorsJson)` returns a text or null. On a problem: `appendAttention` (kind `failed`, run `conductor`, cause `conductor-workspace-missing`), event `conductor-config`, outcome `conductor-config`, no claim, no status change. A clean read resolves the open item (same pattern as `bad-guardrail-config`).
- No LaunchAgent, settings or herdr-ws change. Nothing is restarted by the worker.

Data step (conductor, before first use): add `"workspace": "w2"` to the `DigiSmith/digismith-conductor` entry of `~/.digismith-depot/conductors.json`. The old code ignores the field, so this is safe before the merge. Emma's entry stays as is: this build does not prompt it.

## First use: proof from the installed Nexus job

Safest method: one throwaway test ticket claimed by the real job, with away on. Nothing else is touched, and the conductor gets a harmless order.
1. After merge: rebuild the CLI `dist`, install and restart `nexus-api` (the conductor does this), add the `workspace` field.
2. Create ticket "DGS test: scan reaches conductor (ignore)" with a board folder that passes the Definition of Ready, Mode Autonomous, status `ready`. It must be the only `ready` ticket.
3. `dg autonomous scan --dry-run --repo <main>`: the verdict for the test ticket must read `ready`. Nothing is written.
4. `dg autonomous away --until HH:MM` (now + 15 minutes). This turns away on and runs `autonomous-scan` through the Nexus job (the output prints `run-now: ok`).
5. Pass: `events-<date>.jsonl` has `claim` for the test ticket, no `claim-failed`; an order file exists; the conductor pane shows the prompt.
6. Fail: `claim-failed` with the error text, or `conductor-config` plus an attention item. The ticket returns to `ready`.
7. Clean up: the conductor reads the order, does not build, ends the run (`dg autonomous release` as its runbook says), runs `dg autonomous back`, and sets the test ticket to discard (Jack's order for that exact target).

A job-environment test prompt would need a new command and a new Nexus job entry. That is more code and more risk, so it is not proposed.

## Plan

### Task 1: promptConductor sets HERDR_WS from conductors.json
Files: `packages/cli/src/autonomous/conductor.ts`, `conductor.test.ts`.
Tests first:
- With `HERDR_WS` deleted from `process.env`, a fake exec receives `env.HERDR_WS === "w2"` and the same argv as before.
- With `process.env.HERDR_WS = "w9"` set, the fake exec still receives `w2`.
- A message containing `HERDR_WS=w9` does not change the env.
- Entry without `workspace`, and `workspace: "x; rm"`, both throw `no workspace for`.
- `realExec(process.execPath, ["-e", "process.exit(process.env.HERDR_WS==='w2'?0:4)"], { HERDR_WS: "w2" })` exits 0; without env, the parent env is kept.
Then change `Exec`, `realExec`, `promptConductor`. Export `conductorProblem(conductorsJson): string | null` (null when file and workspace are valid).
Commit: `fix(dgs-623): set HERDR_WS for the conductor prompt from conductors.json`

### Task 2: the scan reports a missing workspace as attention
Files: `scan.ts`, `types.ts` (`conductor-config` in `EventKind`), any exhaustive outcome/kind lists the compiler or tests name (for example the report), `scan.test.ts`.
Tests first:
- `conductors.json` without `workspace`: outcome `conductor-config`, one open attention item with cause `conductor-workspace-missing`, event `conductor-config`, no lock, ticket status unchanged, tracker not called.
- Dry run: no attention item, no event.
- After the file is fixed, the next scan resolves the item and claims as before.
- Existing scan tests: add `workspace: "w2"` to their conductors fixtures.
Then implement after step 2b of `runScan`.
Commit: `fix(dgs-623): report a missing conductor workspace as an attention item`

### Task 3: whole check
Build `packages/clickup-client`, run `pnpm --filter` CLI suite and typecheck for `packages/cli`; confirm the files run under `node --experimental-strip-types`.
Commit only if a fix is needed.
