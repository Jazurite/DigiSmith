# Review findings (DGS-683 part 5, ticket conductor)

| Reviewer type | Round | Path:line | Severity | What is wrong | Failing scenario | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| task 17 | 1 | drivers.ts:68 | Minor | handover/release check the driver then act without a lock. | Two processes hand over the same ticket at once. | parked (plan: atomic rename only; one driver per ticket by design) |
| task 17 | 1 | drivers.ts:34 | Minor | parse() cast JSON to Driver with no shape check. | `{}` gives a Driver with undefined driver. | fixed (aff7a739) |
| task 17 | 1 | drivers.test.ts | Minor | No test for DriverTaken on an unreadable file. | A bad file stops blocking a claim. | fixed (aff7a739) |
| task 17 | 2 | drivers.ts | Minor | parse() did not check the record ticket against the file key. | DGS-9.json holding DGS-1 passes. | fixed (T18 range) |
| task 18 | 1 | start-ticket.ts:104 | Minor | A failure after tab create left the tab. | A retry makes a second tc-<key> tab. | fixed (6ddaf5d0 line) |
| task 18 | 1 | start-ticket.ts:105 | Minor | A throw in releaseDriver skipped removeEntry and hid the original error. | A bad driver file during rollback. | fixed |
| task 18 | 1 | start-ticket.test.ts | Minor | No test for a failed agent prompt or a stale registry entry. | Regression goes unnoticed. | fixed |
| task 18 | 1 | start-ticket.ts | Controller | The agent command was a bare claude and the pane had no identity env. | Conductor without the herdr guardrail flags, DIGISMITH_NAME or HERDR_SCOPE. | fixed (bootstrap flags and `pane run` export, pinned) |
| task 18 | 2 | start-ticket.ts | Minor | HERDR_WS was added for factory starters, unlike the bootstrap. | Factory-started ticket conductor gets a Floor HERDR_WS. | fixed |
| task 18 | 2 | start-ticket.ts | Minor | The agent prompt lacked --wait. | Differs from the bootstrap. | fixed |
| task 19 | 1 | start-ticket.test.ts:72 | Minor | Bare index calls[1] is brittle. | A new herdr call shifts the index. | fixed |
| task 19 | 1 | close.ts:11 | Minor | No check that the entry is open. | A closed entry with a driver file gets released and its tab closed. | fixed (tested) |
| task 20 | 1 | conductor/index.ts:19 | Minor | realLive turned a missing result.agents into []. | sweep prints every ticket conductor as gone. | fixed (throws, tested) |
| task 20 | 1 | conductor/index.ts:18 | Minor | execFileSync had no timeout. | A hung herdr-ws hangs sweep. | fixed (3 s) |
| task 20 | 1 | README.md:25 | Minor | close --self line omitted --project. | Doc gap. | fixed |
| task 21 | 1 | run/index.test.ts | Minor | No test that a corrupt driver file makes the start exit 1 with no record. | The handler's catch stops calling fail. | fixed (tested) |
| task 21 | 1 | conductor/index.ts:16 | Minor | A timeout kill surfaced as a raw ETIMEDOUT. | Unreadable sweep error. | fixed (tested) |
| ticket | 1 | close.ts:19 | Minor | Release-then-remove can leave a partial state if removeEntry fails. | Driver released, entry stays; the tab is not closed. | parked (rare; sweep shows it) |
| ticket | 1 | start-ticket.ts:86 | Minor | putEntry silently overwrites a stale entry, and a failed start then removes it. | Stale open entry for the same name. | README note, no code |
