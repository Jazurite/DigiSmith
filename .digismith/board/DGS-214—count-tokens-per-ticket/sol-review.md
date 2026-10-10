## Findings

Reviewed all eight commits in `db7ab79..dgs-214`, the complete diff, branch files, and the approved design and slice-1 plan. No builds or tests were run. The specified `.worktrees/dgs-214/.sdd-workspace/progress.md` was absent, so the three deferred items below were checked directly against the implementation.

Paths below are relative to `.worktrees/dgs-214/`.

### 1. Important — Cross-session dedupe can discard the highest-output response

**Location:** `packages/cli/src/tokens/count.ts:31–40`

The ranking prefers a record read from its own session’s file **before** comparing output tokens. This contradicts the design’s highest-`output_tokens` rule.

**Scenario:** Both A and resumed B belong to the ticket. A’s file contains response `m1|r1`, `sessionId: A`, output `5`. B replays that response with `sessionId: A`, output `427`. The implementation retains A’s partial `5`, regardless of read order.

**Fix:** Select the highest-output record across all copies of a response, preserving its owning `session_id`. Use file provenance only as a tie-breaker, rather than ahead of usage completeness.

**Test gap:** The resumed-session tests use identical usage in both copies, so they cannot detect this undercount. Add differing-output copies and check both read orders.

### 2. Important — Missing-ID fallback keys collide between subagent files

**Location:** `packages/cli/src/tokens/claude-code-reader.ts:44–45, 63–67`

Fallback response IDs contain the parent session, line-level agent ID, and line index—but not the source file. All subagent files share the same parent-session fallback and dedupe map.

**Scenario:** `agent-a.jsonl` and `agent-b.jsonl` each contain an assistant response on line 1 without `message.id`/`requestId` and without `agentId`. Both receive `line|<parent>|main|0`; one response is discarded. A main-file response can collide with them too.

**Fix:** Include source-file identity in the fallback key. Also recover a missing subagent ID from the filename, while preserving an explicit line-level ID.

**Test gap:** `claude-code-reader.test.ts:110–120` tests separate top-level filenames, which produce different session fallbacks. It does not exercise two files sharing the same parent session.

### 3. Important — Valid JSON with an invalid shape can crash counting or corrupt totals

**Location:** `packages/cli/src/tokens/claude-code-reader.ts:30–49`; `packages/cli/src/tokens/registry.ts:30–33`

Type assertions provide no runtime validation. The reader catches JSON syntax errors, but dereferences parsed values outside that catch. The registry similarly accepts any successfully parsed value.

**Scenarios:**
- A transcript line containing `null` throws at `o.message`, aborting the count.
- A registry line containing `null` is returned successfully, then throws at `e.kind` in `count.ts:20`.
- An assistant usage field such as `"input_tokens": "2"` reaches numeric aggregation and causes string concatenation rather than addition.

**Fix:** Validate parsed objects and the fields consumed by each interface. Skip malformed records or report a content-free diagnostic; accept only finite, nonnegative numeric counts.

**Test gap:** The malformed-line tests cover invalid JSON syntax, not valid JSON with invalid shapes or field types.

### 4. Important — “Read head” loads entire transcripts, including unrelated large files

**Location:** `packages/cli/src/tokens/attribution.ts:38–39, 46–53`; `packages/cli/src/tokens/claude-code-reader.ts:25–26`

`readFileSync(...).split("\n", 200)` limits the split result, **not the file read**. Fallback inference reads every transcript completely. The usage reader additionally splits each selected file completely into memory.

**Scenario:** An unrelated transcript larger than Node’s supported string length causes inference to throw while counting an otherwise small ticket. Smaller, message-heavy files can still produce substantial memory pressure; selected files are read again by the usage reader.

**Fix:** Read incrementally. Stop branch/cwd scanning at the configured head boundary, and process usage records line-by-line while retaining only dedupe state. Scan title metadata incrementally wherever required.

**Test gap:** All fixtures are small; none demonstrates bounded reading of an unrelated large transcript.

### 5. Important — The final tagging fix misses titles added after line 200

**Location:** `packages/cli/src/tokens/attribution.ts:53–57`

The final commit places `custom-title` processing inside the same 200-line limit as branch/cwd inference. The plan restricts that head limit to branch/cwd matching, not title discovery.

**Scenario:** A session starts on `main` in the repository root. After 250 lines, it receives a `custom-title` line naming `DGS-214`. With no registry entry, that session is omitted entirely.

**Fix:** Find title metadata beyond the head limit, using incremental reading. Keep the specified head limit for branch/cwd scanning.

**Test gap:** The new “title repeated later” test puts the matching title on line 4. It passes despite this omission.

The branch/cwd regex itself correctly accepts case-insensitive `dgs-214`, `dgs-214__slug`, and `dgs-214-slug`, while rejecting `dgs-2140`.

### 6. Important — Snapshot placement depends on running at the repository root

**Location:** `packages/cli/src/tokens/count.ts:75–92`; `packages/cli/src/tokens/index.ts:25`

Repository identification checks `.claude-plugin/plugin.json` only under the exact current directory.

**Scenario:** Run `dg tokens DGS-214 --write` from DigiSmith’s `packages/cli/`. Although this is DigiSmith’s own repository and its ticket board folder exists, the manifest check fails and the snapshot is written to the depot.

**Fix:** Resolve the containing checkout root before checking the manifest and locating the board folder. Respect checkout boundaries, including worktrees.

**Test gap:** The path test passes the synthetic repository root directly. Add invocation from a nested directory.

### 7. Important — A torn registry tail consumes the next successful append

**Location:** `packages/cli/src/tokens/registry.ts:20–23, 30–35`

This deferred finding is **real**. Appending assumes the existing file ends with a newline.

**Scenario:** The file ends with the incomplete bytes `{"kind":"session"`. The next valid append produces:

```text
{"kind":"session"{"kind":"session", ...}
```

The reader rejects the entire combined line, losing the newly appended valid entry as well as the torn entry. Losing a session registration can omit all its usage when fallback tagging does not find it.

**Fix:** Serialize tail recovery and append for each registry file. Ensure an incomplete tail is delimited before writing the next complete entry; protect that operation against concurrent writers.

**Test gap:** `registry.test.ts:24–30` simulates a torn write using `"{broken\n"`—already newline-terminated—and never appends afterward. It cannot expose this failure.

### 8. Minor — Mixed timestamp formats assign responses to the wrong step

**Location:** `packages/cli/src/tokens/snapshot.ts:6–7`

This deferred finding is **real**. ISO timestamps are compared as strings rather than instants.

**Scenario:** A step starts at `2026-10-10T01:00:00Z`; a response arrives at `2026-10-10T01:00:00.500Z`. The string comparison rejects the start because `Z` sorts after `.`, so the response is assigned to `other` or a previous step.

**Fix:** Parse timestamps to numeric instants for filtering and sorting, with explicit handling of invalid timestamps.

**Test gap:** Existing window tests consistently omit milliseconds. Add mixed-precision start/end boundaries within the same second.

This changes step attribution, not the ticket’s overall token count, hence **minor**.

### 9. Minor — Missing subagent IDs become `null`; there is no filename fallback

**Location:** `packages/cli/src/tokens/claude-code-reader.ts:44, 67`; `packages/cli/src/tokens/snapshot.ts:55–56`

The deferred item is **not present as phrased**: `agent_id` does **not** fall back to the filename. It falls back to `null`.

**Scenario:** `agent-abc123.jsonl` contains a response with valid message/request IDs but no line-level `agentId`. Its tokens remain in the step total, but it is represented as main-thread usage and cannot match task mapping `["abc123"]`.

**Fix:** Pass the filename-derived agent ID into `parseFile` as a fallback. Explicit line-level IDs should take precedence.

**Test gap:** The subagent fixture always supplies `agentId`, so this case is untested. The separate fallback-key collision in finding 2 has the more serious count-loss consequence.

### 10. Minor — Required `raw_flags` are discarded

**Location:** `packages/cli/src/tokens/types.ts:28–41`; `packages/cli/src/tokens/claude-code-reader.ts:41–54`

Design section 4 explicitly requires preserving fields such as `service_tier`, `speed`, `iterations`, and `fallback_credit` in `raw_flags`. Neither the record type nor the reader includes it.

**Scenario:** A response carrying `usage.fallback_credit` or `usage.iterations` is reduced to counts, permanently removing those flags from the reader result.

**Fix:** Add `raw_flags` to the reader contract and preserve the designated usage metadata without interpreting it or copying message text.

**Test gap:** The iterations test verifies only that top-level counts are used; it does not assert retention of the metadata.

## Other checks

- No pricing calculations, price tables, or dollar-valued output were introduced.
- No message content is copied into records, snapshots, or table output.
- Library imports satisfy the `node:`/sibling-`.ts` restriction; yargs is confined to the CLI wrapper.
- Registry entries are read and appended through the interface. Snapshot placement does depend on the implementation’s exported depot-directory helper.
- The inspected token tests use temporary transcript and registry locations; I found no test accessing the real `~/.claude` or `~/.digismith-depot`.
- The missing-`cache_creation` fallback matches the design: all aggregate writes go to 5-minute, with `write_split: "unknown"`.

ready after fixes