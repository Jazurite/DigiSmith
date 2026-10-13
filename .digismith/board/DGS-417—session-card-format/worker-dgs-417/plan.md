# DGS-417: Session card format and depot layout (plan)

Worker `dgs-417`, 2026-10-13. Ticket DGS-417 (task `14zcebrvm6c`, list I.7), epic DGS-402, design `DGS-404—role-architecture/worker-dgs-404/design.md` sections 5, 7, 8. Extends DGS-411 (identity records) and does NOT build it. Status: approved 2026-10-13 with the conductor's answers and settled interfaces S1-S12 (below); built.

## The change

One dependency-free TypeScript module that defines the card, checks it, and reads and writes it in the global depot. No YAML library (none is installed): a card is a flat `key: value` file, a strict subset of YAML, so any YAML reader also reads it.

### Module and files (all new, nothing existing changes)
| File | What |
|---|---|
| `scripts/depot-dir.ts` | `depotDir()`: the shared helper I OWN. Honours `DIGISMITH_DEPOT_DIR`, default `~/.digismith-depot`. |
| `scripts/session-card.ts` | Types, `validateCard`, parse/format, read/write/list/touch/close/lost. Re-exports `depotDir`. |
| `scripts/session-card.test.ts`, `scripts/depot-dir.test.ts` | Tests (vitest, TEMP depot through `DIGISMITH_DEPOT_DIR`, never the real one). |
| `scripts/session-card-cli.ts` | Tiny CLI: `write`, `validate`, `read`, `list`, `touch`, `close`, `lost`. |

Why `scripts/`: hooks run `node --experimental-strip-types "${CLAUDE_PLUGIN_ROOT}/scripts/<file>.ts"` (see `hooks/hooks.json`), so DGS-418's hooks can import it with no build. The `packages/cli` tree is untouched, so no CLI rebuild. A `dg` wrapper command can come later.

### The card (design section 5)
File content, one `key: value` per line, `#` comments allowed, values single-line, quoted with `"` only when they contain `: `, ` #`, or leading/trailing space:
```yaml
name: digismith-conductor
role: conductor
id: dsm-conductor-01
session: <engine session id>
under: jack
domain: DigiSmith
mandate: .digismith/sessions/DigiSmith/order-roles-followups-parallel.md
state: .digismith/sessions/DigiSmith/note.md
runs_on: herdr w2:p1
created_by: jack
started: 2026-10-13T13:00+07:00
last_seen: 2026-10-13T13:40+07:00
status: open
```
**Validator rules** (`validateCard(input: unknown)` returns ALL errors, not the first):
1. Only the 14 known fields; an unknown field is an error. Every value a non-empty single-line string.
2. `role` in `maestro | conductor | worker | scout | reviewer | observer`.
3. `status` in `open | closed | lost`.
4. `started`, `last_seen` (and `ended` when present): ISO 8601 `YYYY-MM-DDTHH:MM[:SS]` plus an explicit offset (`+07:00`, `Z`), a real calendar date and time. `last_seen >= started`.
5. `id`, `under`: `^[a-z0-9]+(-[a-z0-9]+)*$`, max 64. `under != id`. `session`: `^[A-Za-z0-9._-]+$`, max 128 (it goes into a file name). `domain`: `^[A-Za-z0-9._-]+$` (it is the project folder).
6. Role rules (tree rules checkable from ONE card):
   - `under` required for every role except `maestro`; forbidden for `maestro` (a Maestro answers to Jack, not a card).
   - `machine` required for `maestro`, forbidden for every other role.
   - `mandate` required for conductor, worker, scout, reviewer.
   - `state` required for conductor and maestro.
   - Cross-card checks (does `under` exist, is its role a legal parent: conductor under maestro, worker under conductor or maestro) need two cards: NOT in this ticket. I export `LEGAL_PARENT_ROLES` so DGS-418's sweep can run them.
7. **Secret-like values refused** in any field: `sk-…`/`sk_…` keys, `ghp_`, `gho_`, `github_pat_`, `xox[abprs]-`, `AKIA…`, `AIza…`, `Bearer `, JWT (`eyJ….….…`), `-----BEGIN … KEY`, `://user:pass@`, and any unbroken run of 32+ characters from `[A-Za-z0-9+_=-]` with no `/` or `.` (not a UUID: a UUID passes). The error names the field, never echoes the value.

### Depot layout (design section 8)
```
~/.digismith-depot/sessions/<project>/          <project> = the card's `domain`
  cards/<id>--<session>.yml                     open cards (one file per session RUN)
  archive/<id>--<session>.yml                   closed and lost cards, kept forever
  <conductor>/note.md                           DGS-422/428 own this, not me
  orders/                                       owned by the Maestro, not me
```
- File name `<id>--<session>.yml`: `id` is stable across restarts and one Maestro id has several live sessions at once, so the pair is the key.
- **No registry.** Listing `cards/` is one `readdir`; a registry would be a second copy to keep in step. Proposed only if DGS-418 shows a need.
- **Atomic write:** write `.<name>.<pid>.<rand>.tmp` in the SAME folder, `fsync`, `renameSync` over the target. `listCards` ignores dotfiles and `.tmp`. A reader sees the old card or the new card, never half.
- **`last_seen` refresh:** `touchCard` re-reads the card, sets `last_seen` to now (UTC+7 offset), re-validates, writes atomically. It refuses a card that is not `open`. One owner per card (the session or its sweeper), so no lock; a rename is last-writer-wins.
- **Close and lost:** `closeCard`/`markLost` rewrite the card atomically with the new `status` (and `ended` if given), then `renameSync` it from `cards/` to `archive/`. Nothing is ever deleted; no `unlink` or `rm` exists in the module. Closing an already archived card is a no-op that returns its path.

### The shared API (exact names; DGS-418 and DGS-428 code against these)
```ts
// scripts/depot-dir.ts
export function depotDir(env?: NodeJS.ProcessEnv): string;          // $DIGISMITH_DEPOT_DIR or ~/.digismith-depot

// scripts/session-card.ts  (re-exports depotDir)
export type Role = "maestro"|"conductor"|"worker"|"scout"|"reviewer"|"observer";
export type Status = "open"|"closed"|"lost";
export type SessionCard = { name; role: Role; id; session; under?; domain; mandate?; state?; runs_on;
  machine?; created_by; started; last_seen; status: Status; ended? };   // all string
export const ROLES, STATUSES, LEGAL_PARENT_ROLES;
export function validateCard(input: unknown): { ok: true; card: SessionCard } | { ok: false; errors: string[] };
export function parseCard(text: string): SessionCard;               // throws CardError (message lists errors)
export function formatCard(card: SessionCard): string;
export function cardsDir(project: string, env?): string;            // <depot>/sessions/<project>/cards
export function archiveDir(project: string, env?): string;
export function cardPath(card: Pick<SessionCard,"domain"|"id"|"session">, env?): string;   // open location
export function readCard(file: string): SessionCard;                // validates; throws CardError
export function writeCard(card: SessionCard, env?): string;         // validate, atomic write to cards/, returns path
export function listCards(project: string, opts?: { scope?: "open"|"archive"|"all"; env? }): { card: SessionCard; path: string }[];   // default "all"; a bad file is skipped and reported in `skipped`, see below
export function touchCard(ref: { project; id; session }, now?: Date, env?): SessionCard;
export function closeCard(ref, opts?: { now?: Date; env? }): string;    // archive path
export function markLost(ref, opts?: { now?: Date; env? }): string;     // archive path
export function newestLastSeen(project: string, id: string, env?): string | undefined;   // for DGS-428 (all cards of that id, open, closed, lost)
export function nowIso(now?: Date): string;                         // "2026-10-13T13:40+07:00"
```
`listCards` returns only valid cards; an unreadable or invalid file is skipped (one bad card must not blind a sweep) and `listCardProblems(project)` returns `{path, errors}[]` so it is not silent.

### CLI (`node --experimental-strip-types scripts/session-card-cli.ts ...`)
- `validate <file>`: prints `ok` or the errors; exit 0 or 1.
- `write <file> [--project <p>]`: validates the file, then `writeCard` into the depot; prints the path.
- `read <project> <id> <session>`, `list <project> [--scope open|archive|all]`, `touch|close|lost <project> <id> <session>`.
- `--depot <dir>` sets `DIGISMITH_DEPOT_DIR` for the call (tests, dry runs).

## Tests (TDD, written first, seen failing)
`validateCard`: a good card per role; each missing required field; unknown field; unknown role; bad status; bad timestamps (no offset, month 13, 30 Feb, `last_seen < started`); every role rule (under/machine/mandate/state, both required and forbidden); `under == id`; bad id shape; unsafe `session` (`../x`); one case per secret pattern plus the 32-char run, a UUID `session` that must PASS, a path value that must PASS, and the error text never contains the value. Parse/format round trip incl. quoting. `depotDir` env override, default, empty env value. Layout: writeCard puts the file in `cards/`; no `.tmp` left; a crash simulated between temp write and rename leaves the old card readable and `listCards` ignoring the temp; touchCard moves `last_seen` only; touch of a closed card refused; closeCard moves to `archive/`, file still exists, status `closed`; markLost likewise; close twice is a no-op; listCards scopes; bad file skipped and listed as a problem; `newestLastSeen` across open and archive; project or id with `..` or `/` refused. CLI: validate ok/fail exit codes, write then read.

## First use (after "go: merge", merge and push)
1. Write by hand `~/.digismith-depot/sessions/DigiSmith/cards/dsm-conductor-01--<session>.yml` for `digismith-conductor`: role conductor, domain DigiSmith, runs_on `herdr w2:p1`, state `.digismith/sessions/DigiSmith/note.md`, mandate = the Maestro's current order path, started now, status open.
2. `session-card-cli.ts validate` on it, then `read` it back and `list DigiSmith`.
3. Set DGS-417 done with plain dates, read back 04:00 UTC+7; clean up (worktree, branch, pins, untracked files moved aside). The real card stays: it is the conductor's, created for the first use, not mine to delete.

## Decisions I need from the Conductor (proposals marked)
1. **`created_by` and `under` of the real conductor card.** Proposal: both `jack`. DGS-411's Maestro identity record does not exist yet, and design section 5 says `under` is "its Maestro". `jack` is a valid id string; the one-card check cannot tell it from a Maestro id.
2. **`id` of the conductor.** Proposal: `dsm-conductor-01` (the design's own example), `name` `digismith-conductor`.
3. **`session` of the hand-written card.** I do not know the conductor's engine session id. Proposal: you give it to me at "go: merge", else I write `pending-hook` and the DGS-418 SessionStart hook replaces it.
4. **Extra optional field `ended`** (written by close/lost): section 9 says closed means "ended, with a result" but section 5 has no field for it. Proposal: add `ended` only; the result goes into the state note (DGS-418's handoff), not the card. Say no and I leave it out.
5. Lost cards go to `archive/` too (one rule: not open means archived). If DGS-418's sweep wants lost cards to stay in `cards/` for a takeover, tell me now.

## Left out, and why
- Cross-card tree checks (parent exists, legal parent role): need two cards; exported `LEGAL_PARENT_ROLES` only.
- Identity records `~/.digismith-depot/identities/` (DGS-411), mandate format (DGS-420), `created_by` delete check (DGS-421), the hooks (DGS-418).
- A `dg` command wrapper and a registry file.
- No Claude settings or OpenCode config change: no diff to show.

## Alignment
I read the other four boards at the time of writing: none had a `plan.md` yet (only the brief). So this section states what I OFFER; the other workers must match it, and I will re-read their plans and fix any difference in the next revision.

**Owned by DGS-417 (code against these names; keep a local stub until I merge):**
- `depotDir()` in `scripts/depot-dir.ts`, re-exported from `scripts/session-card.ts`. Env var `DIGISMITH_DEPOT_DIR`. Tests pass `{ DIGISMITH_DEPOT_DIR: tmp }` or set the env var.
- Card file: `<depot>/sessions/<project>/cards/<id>--<session>.yml`; archive `<depot>/sessions/<project>/archive/<id>--<session>.yml`; `<project>` = the card's `domain`.
- Card fields and values exactly as in the example above; timestamps like `2026-10-13T13:40+07:00` (seconds optional, offset mandatory).
- API: `validateCard, parseCard, formatCard, readCard, writeCard, listCards, listCardProblems, touchCard, closeCard, markLost, newestLastSeen, nowIso, cardsDir, archiveDir, cardPath` with the signatures above.

**What I expect from the others (to check when their plans exist):**
- DGS-418 (hooks): calls `writeCard` at SessionStart (a restart of the same id gets a NEW session, so a new file), `touchCard` as heartbeat, `closeCard` at SessionEnd, `markLost` in the sweep; writes the handoff into `sessions/<project>/<conductor>/note.md` itself. It must not write card files any other way.
- DGS-428 (catch-up window): calls `newestLastSeen(project, maestroId)`; a brand-new identity returns `undefined` and gets 24 hours. Idle trigger compares the session's own card `last_seen` against that value.
- DGS-422/427: use the same `sessions/<project>/<conductor>/note.md` path (section 8); no card access needed except reads through `listCards`.
- Possible clash to watch: if another plan names a different card folder (for example `sessions/<project>/<id>.yml` with no `cards/`) or a different `depotDir` home. I will report it, not choose silently.

Waiting for approved: plan


## Approval, answers and settled interfaces (conductor, 2026-10-13)
Answers: (1) `under` and `created_by` of the conductor card: both `jack`. (2) id `dsm-conductor-01`, name `digismith-conductor`. (3) session: the conductor gives it at "go: merge"; `pending-hook` until then. (4) YES `ended` AND a second optional field `result` (single line, at most 200 characters, secret-like refused). (5) YES: lost cards go to `archive/`.
Additions to the plan, built: `findCardBySession(session, project?, env?)` (open cards; without a project it scans every project folder under `<depot>/sessions`); extra exports `findCard(ref)` (open, else archived); CLI commands `new --field k=v ... [--dry]` (builds, validates and writes a card; the Maestro-card one-liner is in `probe.md`) and `find`; `closeCard`/`markLost` take `{ now, result, env }`. There is no `archiveCard`.

**Alignment section updated to the settled S1-S12 of the conductor.** What changed against my first Alignment: card fields gain `ended` and `result`; `findCardBySession` is new; lost cards are archived (S2); no code under `packages/cli` and no `dg` command (S6). Rows of S3-S5 and S7-S12 belong to the other workers: nothing of mine changes.
Final API (S1): `depotDir`, `validateCard`, `parseCard`, `formatCard`, `readCard`, `writeCard`, `listCards(project, {scope, env})`, `listCardProblems`, `touchCard(ref, now?, env?)`, `closeCard(ref, {now,result,env})`, `markLost(ref, {now,result,env})`, `newestLastSeen`, `nowIso`, `cardsDir`, `archiveDir`, `cardPath`, `findCardBySession`, `findCard`, `looksSecret`, `LEGAL_PARENT_ROLES`, `ROLES`, `STATUSES`, `CardError`. `ref` = `{ project, id, session }`.
Note for S8 (428): `newestLastSeen(project, id)` covers ALL cards of the id; the "exclude the asking session's own card" step is 428's (filter `listCards` by `session`).

## Revision after the reviews (2026-10-13 ~14:0x UTC+7)
- Archive is never overwritten: a second close or lost of the same `<id>--<session>` goes to `<id>--<session>--<n>.yml` (n from 2). Readers: `listCards` (scope archive or all) lists every `.yml` in `archive/`, so all archived cards show; `newestLastSeen` takes the newest across them; `findCardBySession` looks only at open cards (`cards/`); `findCard(ref)` returns the open card, else the plain archived name (the first archived card).
- `touchCard` renames its temp file over the card only if the card still exists at that moment; if a close archived it, the temp is renamed `.abandoned` (hidden, ignored) and the card is NOT resurrected. A stale touch landing between close's rewrite and rename is repaired (the archived card keeps its end state). Residual: the existence check and the rename are two calls, a window of microseconds; accepted, documented.
- `writeCard` refuses an existing open card (a refresh is `touchCard`); a resumed session whose card was archived may write a new open card.
- Review fixes: git shas and hex ids pass the secret check; `Bearer` needs a 16+ character token; `sk-` needs letters and digits; fractional seconds accepted in timestamps; `findCard` checks id and session; CLI refuses a bad `--scope` and an empty `--depot`.
