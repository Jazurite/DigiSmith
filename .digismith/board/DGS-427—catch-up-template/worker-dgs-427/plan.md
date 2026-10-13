# DGS-427 plan: the catch-up template

Worker `dgs-427` (seat dev0). Spec: design section 7 (`DGS-404—role-architecture/worker-dgs-404/design.md`), ticket DGS-427 (E.5, linked to DGS-428).

## What I found (the template convention, DGS-414 lineage)
- Templates are Markdown files with `<placeholder>` tokens in `skills/generate-comment/templates/` (`progress-update.md`, `investigation-update.md`, `teams-review-request.md`).
- `scripts/fill-template.ts` (`fillTemplate`, `fillTemplateFile`) swaps `<key>` for a flat string and returns `{ markdown, headingPrefix }`. It has no loops and no "none" rule, so list sections need the caller to build the block text first. The generate-comment skill does that by hand, in prose.
- There is no `templates/` folder at the repo root. No ticket folders for DGS-414/416 exist on the board; no other worker plan exists yet (checked 2026-10-13).

## The change
Follow the convention: the fixed headings live in a template file; a small typed renderer builds the section blocks and fills the file through the existing `fillTemplateFile`.

Files:
1. `skills/generate-comment/templates/catch-up.md` (new): the layout of design section 7, with placeholders `<conductor>`, `<from>`, `<to>`, `<identity>`, `<asked-by>`, `<done>`, `<running>`, `<waiting>`, `<decided>`, `<parked>`, `<next>`, `<health>`. The seven `##` headings are fixed text in this file, so the order cannot change by data.
2. `scripts/catch-up.ts` (new): `renderCatchUp(data: CatchUp): string` and `formatTime(t: TimeInput): string`; also a tiny CLI (`node --experimental-strip-types scripts/catch-up.ts --data <json>` prints the Markdown) so DGS-428 and the first use can call it without TypeScript glue.
3. `scripts/catch-up.test.ts` (new).
No change to `fill-template.ts`, the CLI package, hooks or settings.

## The data shape (I own it; DGS-422 supplies it, DGS-428 calls the renderer)
```ts
type TimeInput = string | { at: string; fromTool: true }; // ISO-8601 instant, any offset
interface CatchUp {
  conductor: string;                          // "digismith-conductor"
  window: { from: TimeInput; to: TimeInput };
  identity: string;                           // Maestro identity id
  askedBy: string;                            // asking session id
  done:    { key: string; line: string; report?: string }[];          // report = link to report.html
  running: { worker: string; key: string; stage: string; since: TimeInput }[];
  waiting: { question: string; since: TimeInput; pane: string }[];   // pane "w2:3"
  decided: { decision: string; why: string; allowedBy: string }[];
  parked:  { what: string; why: string; next: string }[];
  next:    string[];                          // first 3 are shown
  health:  { seats: { seat: string; fiveHourPct: number; weeklyPct: number }[]; server: string; tabs: string[] };
}
```
Example (JSON, as DGS-422 would emit it): `{"conductor":"digismith-conductor","window":{"from":"2026-10-13T06:00:00Z","to":"2026-10-13T08:30:00Z"},"identity":"digismith-maestro","askedBy":"s-42","done":[{"key":"DGS-417","line":"card format merged","report":"https://example.test/r.html"}],"running":[],"waiting":[],"decided":[],"parked":[],"next":["merge DGS-427","merge DGS-422"],"health":{"seats":[{"seat":"jack","fiveHourPct":19,"weeklyPct":59}],"server":"herdr up","tabs":["w2:1 conductor"]}}`

Rendering rules:
- Section names, in this order, never left out: Done, Running, Waiting for Jack, Decided under the mandate, Parked or failed, Next, Health. An empty array renders the single line `none`.
- Lines exactly as design section 7: `- KEY: line. Report: <link>` (the `Report:` part is dropped when `report` is missing), `- worker | KEY | stage | since T`, `- question | since T | pane P`, `- decision | why: R | allowed by: O`, `- what | why: R | next step: S`; Next is numbered `1.` to `3.` (more than 3 are cut, fewer are not padded); Health has the three lines Seats and usage (`jack: 5h 19%, weekly 59%`, joined with `; `), Server, Open tabs (`<count>: names`); an empty value in a Health line reads `none`.
- Times: a plain string is rendered UTC+7 as `2026-10-13 15:00 UTC+7`. `{at, fromTool: true}` adds the UTC time in brackets: `2026-10-13 15:00 UTC+7 [08:00 UTC]`. Window line: `Window: <from> to <to> (UTC+7)`. An invalid time throws (no fabricated output).
- One regex pass over the template file (not `fillTemplate`), so a value that contains `<running>` is never filled again; tested.

## Tests (TDD, vitest, see them fail first)
1. Renders the full example above; output matches the layout (snapshot of the exact text).
2. Empty section gives `none`, and all seven headings still appear (all-empty data).
3. The seven headings appear in the fixed order whatever the data.
4. UTC+7 formatting: `06:00Z` gives `13:00 UTC+7`; the day rolls over (`18:00Z` gives next day `01:00`); `fromTool` adds `[HH:mm UTC]`; invalid time throws.
5. Next: cut to 3, numbered; `report` optional; Health lines.
6. CLI prints the same text for the JSON file.

## Alignment (checkpoint 1)
I read the other plans: none exists yet (their board folders are not created). My proposals, to be confirmed when they appear:
- **DGS-428 (behaviour)** imports `renderCatchUp` from `scripts/catch-up.ts` (or calls the script CLI with `--data`) and writes the returned Markdown to the state note `~/.digismith-depot/sessions/<project>/<conductor>/note.md`. It owns the window calculation and the idle trigger; the template only prints `window.from/to`.
- **DGS-422 (state)** supplies a `CatchUp` object (the shape above; the section arrays map to its roster, question queue, decision log and next steps). Open question for DGS-422: it needs to give times as ISO strings; mark `fromTool: true` for times taken from git or ClickUp output.
- Section names owned here (exact text): `Done`, `Running`, `Waiting for Jack`, `Decided under the mandate`, `Parked or failed`, `Next`, `Health`.
- No depot access in my code, so no `depotDir()` use and no temp depot needed; tests are pure.
- No settings or hook change.

## First use (after merge and push)
Run the CLI on the sample JSON (kept in the test folder as a fixture), show the output in the report, set DGS-427 done (plain dates), clean up (worktree, branch, pin refs).

## Leaving out
A ClickUp or git reader (DGS-428/422 own the data). A `dg` subcommand (DGS-428's conductor command).

## Settled interfaces (conductor check, S1-S12) and what changed in the build
Approved with the data shape as the contract (S5): `CatchUp`, `TimeInput`, `renderCatchUp(data: CatchUp): string` exported from `scripts/catch-up.ts`, plus `formatTime`. 422's `collectState` returns the CatchUp fields except conductor, window, identity, askedBy; 428 spreads the state and adds those four. Plain TypeScript under `scripts/`, no CLI package change, no `dg` command (S6). No depot access in my code (S1-S4 do not touch it). This section replaces the earlier proposals above where they differ.
Build changes after the review: the renderer refuses times without Z or an offset (host-time-zone trap), a missing or non-array section, a missing health block, non-finite seat usage and an empty conductor, identity or askedBy, each with a named error.
